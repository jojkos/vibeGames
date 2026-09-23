/* world.js — the hall: tile map, baked room, props, camera, frame pipeline.
   Look: a lived-in night arcade — wet glossy tile floor that mirrors every
   light, brick walls with grime, pipes and vines, neon signage, a lounge,
   stairs up to a back room, a railing along the front drop.
   Pipeline: art-res buffer (integer-snapped camera) → nearest-neighbour
   upscale with a sub-pixel offset → two-level bloom from the emissive map.
   World units: 1 tile = 16u. Screen (art px): x = X − Y, y = (X + Y)/2 − Z.
   Exposes window.World. */
(function(){
'use strict';
const CFG = window.CFG;
const { GW, GH } = CFG;
const T = 16, GWu = GW * T, GHu = GH * T;
const WH = 92, RIM = 10, RAIL = 14;
const DOOR = { x0: 128, x1: 160, plane: 8, zTop: 51, h: 52 };
const WIN = { x0: 168, x1: 208, plane: 4, zTop: 57, h: 34 };
const KANA = { x0: 114, x1: 214, plane: 19, zTop: 83, h: 20 };
const SIGN = { x0: 222, x1: 366, plane: 19, zTop: 85, h: 26 };
const UPS = { x0: 90, x1: 114, plane: 19, zTop: 85, h: 11 };
const UPDOOR = { x0: 94, x1: 110, z0: 41, z1: 73 };
const SCORE = { cy: GHu / 2, w: 84, plane: 19, zTop: 81, h: 56 };
const PUG = { y0: GHu - 16 - 32, w: 28, plane: 17, zTop: 58, h: 28 };
const LAMP_Z = 74;

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- palette
function buildPalette(){
  const bases = ['#2c2744', '#3a2640', '#4a3050', '#1f1a2e', '#5a5470', '#6b4226', '#9a2440', '#6a3d9a', '#6b2f4f',
    '#3a9a50', '#4aa85a', '#c0643e', '#7a5634', '#6d6a8e', '#e9b48e', '#8c4522', '#5a3522', '#1d3866', '#1b5a45',
    '#3b4568', '#7fa6ff', '#ffc47e', '#ffb870', '#2a5aa8', '#8a6238', '#7a4a2c',
    '#ff3df0', '#2fd6e0', '#ffd23f', '#3dff7a', '#ff4757', '#3d7bff', '#9b5cff', '#ff9a3c', '#ff7ab8'];
  for (const b of bases) PX.addRamp(b, 8);
  for (const k in CFG.TAG_COLORS) PX.addRamp(CFG.TAG_COLORS[k], 8);
  PX.addColors(['#07040e', '#0e0916', '#f4f1ea', '#ffffff', '#fff6d8', '#140d1a', '#d8d4cc']);
}

// ---------------------------------------------------------------- neon glyphs
const KANA_G = {
  'ゲ': ['.#....#.#', '##.....#.', '#.#######', '......#..', '.....#...', '....#....', '..##.....'],
  'ー': ['.........', '.........', '.........', '#########', '.........', '.........', '.........'],
  'ム': ['...#.....', '...#.....', '..#......', '..#......', '.#....#..', '.#.....#.', '#########'],
};
const CAT = ['.#........#.', '#.#......#.#', '#..######..#', '#..........#', '#..#....#..#', '#..........#', '#....##....#', '.#........#.', '..########..'];
function drawGrid(ctx, rows, x, y, s, col){
  ctx.fillStyle = col;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++)
    if (rows[r][c] === '#') ctx.fillRect(x + c * s, y + r * s, s, s);
}
// neon tube: dark halo, coloured tube (+ glow map copy)
function neon(ctx, g, drawFn, halo, tube, on){
  if (!on){ drawFn(ctx, halo); return; }
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ ctx.save(); ctx.translate(d[0], d[1]); drawFn(ctx, halo); ctx.restore(); }
  drawFn(ctx, tube);
  if (g) drawFn(g, tube);
}

// posters: text lines in the 3×5 font, optional icon grid
const POSTER_DEFS = [
  { wall: 'L', a: 22, b: 56, z0: 26, z1: 68, bg: '#1a1440', fg: '#8fd8ff', lines: ['GOOD', 'GAMES', 'GOOD', 'PEOPLE'], icon: 5 },
  { wall: 'B', a: 334, b: 366, z0: 22, z1: 57, bg: '#2a1033', fg: '#ff8ae8', lines: ['SAME', 'GAMES', 'NEW', 'STORIES'] },
  { wall: 'L', a: 180, b: 208, z0: 58, z1: 85, bg: '#102a30', fg: '#9dffd0', lines: ['PIXELS', 'BRING', 'US', 'CLOSER'] },
];

const World = window.World = {
  T, GWu, GHu, WH, DOOR, WIN,
  blocked: new Uint8Array(GW * GH),
  cam: { x: 0, y: 0, z: 1, tz: 1 },
  P: 3, dpr: 1, vwCss: 1, vhCss: 1,
  mulberry32,
  props: [], footprints: [],
  drops: [], motes: [], notes: [], steam: [], splash: [],
  thunderIn: 7, flash: 0, signT: 0,
  claw: { tx: GW - 2, ty: 8, phase: 0, dropIn: 6 },
  juke: { tx: GW - 2, ty: 11, noteIn: 1 },
  walker: { active: false, p: 0, dir: 1, nextIn: 12 },
  marker: null, attract: false, attractT: 0,
  doorOpen: 1, doorTarget: 1, introCam: false,
  pugImg: null, pugReady: false, pugTex: null,

  iso(x, y){ return [(x - y) * T, (x + y) * T / 2]; },
  unproject(sx, sy){ return [(sx / T + sy / (T / 2)) / 2, (sy / (T / 2) - sx / T) / 2]; },
  block(tx, ty){ if (tx >= 0 && ty >= 0 && tx < GW && ty < GH) this.blocked[ty * GW + tx] = 1; },
  unblock(tx, ty){ if (tx >= 0 && ty >= 0 && tx < GW && ty < GH) this.blocked[ty * GW + tx] = 0; },
  isBlocked(tx, ty){
    if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return true;
    return this.blocked[ty * GW + tx] === 1;
  },
  setTargetZoom(z){ this.cam.tz = z; },
  setMarker(wx, wy){ this.marker = { x: wx, y: wy, age: 0 }; },
  setAttract(on){ if (on && !this.attract) this.attractT = 0; this.attract = on; },
  setDoor(v){ this.doorTarget = v; },

  // ------------------------------------------------------------------ init
  init(view){
    this.view = view;
    this.vctx = view.getContext('2d');
    buildPalette();
    for (let x = 0; x < GW; x++){ this.block(x, 0); this.block(x, GH - 1); }
    for (let y = 0; y < GH; y++){ this.block(0, y); this.block(GW - 1, y); }
    this.buildLights();
    this.buildProps();
    this.bakeStatic();
    this.buildDynamicTex();
    const rng = mulberry32(777);
    for (let i = 0; i < 26; i++) this.drops.push({ x: rng() * 40, y: rng() * 34, spd: 40 + rng() * 40, len: 2 + rng() * 3 | 0 });
    for (let i = 0; i < 30; i++){
      this.motes.push({ x: 1.5 + rng() * (GW - 3), y: 1.5 + rng() * (GH - 3), h: 6 + rng() * 60, vx: (rng() - .5) * .1, ph: rng() * 7 });
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { this.pugImg = img; this.pugReady = true; this.makePugTex(); };
    img.onerror = () => {
      const i2 = new Image();
      i2.onload = () => { this.pugImg = i2; this.pugReady = true; this.makePugTex(); };
      i2.src = CFG.PUG_LOGO || 'https://www.pugbanger.fun/assets/images/logo.png';
    };
    img.src = CFG.PUG_LOGO || 'https://www.pugbanger.fun/assets/images/logo.png';
    this.makePugTex();
    const c = this.iso(GW / 2, GH / 2);
    this.cam.x = c[0]; this.cam.y = c[1] - 20;
    this.resize();
  },

  buildLights(){
    const L = Vox.addLight;
    Vox.lights.length = 0;
    this.refl = [];                                 // extra points that only show up as floor reflections
    const RP = (x, y, z, hex, I) => this.refl.push({ x, y, z, c: PX.hex(hex).map(v => v / 255), I });
    this.lamps = [];
    for (let lx = 4.5; lx < GW - 2; lx += 6.5)
      for (let ly = 3.2; ly <= GH - 1; ly += 4.1){
        this.lamps.push([lx, ly]);
        L(lx * T, ly * T, LAMP_Z, '#ffb870', 1.0, 50, 140);
      }
    CFG.LAYOUT.forEach((S, i) => {
      const col = CFG.TAG_COLORS[GAMES[i].tag] || '#ffffff';
      const fx = S.f === 'S' ? S.tx * T + 16 : S.tx * T + 22, fy = S.f === 'S' ? S.ty * T + 22 : S.ty * T + 16;
      L(fx, fy, 36, col, .95, 20, 62);
      const mx = S.f === 'S' ? S.tx * T + 16 : S.tx * T + 15, my = S.f === 'S' ? S.ty * T + 15 : S.ty * T + 16;
      RP(mx, my, 36, col, .9); RP(mx, my, 52, col, 1.1);
    });
    for (let x = 30; x < GWu - 20; x += 44) L(x, 19, 88, '#ff3df0', .34, 22, 58);
    for (let y = 30; y < GHu - 20; y += 44) L(19, y, 88, '#ff3df0', .3, 22, 58);
    for (let x = 20; x < GWu - 16; x += 7) RP(x, 17, 88, '#ff3df0', .5);
    for (let y = 20; y < GHu - 16; y += 7) RP(17, y, 88, '#ff3df0', .45);
    // warm wall lamps
    this.sconces = [];
    for (const x of [40, 70, 236, 300, 352]) this.sconces.push([x, 'B']);
    for (const y of [84, 210, 262]) this.sconces.push([y, 'L']);
    for (const sc of this.sconces){
      if (sc[1] === 'B'){ L(sc[0], 22, 64, '#ffb870', .8, 22, 72); RP(sc[0], 20, 62, '#ffc47e', 1.2); }
      else { L(22, sc[0], 64, '#ffb870', .75, 22, 72); RP(20, sc[0], 62, '#ffc47e', 1.1); }
    }
    L((WIN.x0 + WIN.x1) / 2, 14, 42, '#7fa6ff', .95, 30, 110);
    RP((WIN.x0 + WIN.x1) / 2, 6, 40, '#7fa6ff', 1.3);
    L((DOOR.x0 + DOOR.x1) / 2, 12, 30, '#6f8fe0', .6, 26, 90);
    RP((DOOR.x0 + DOOR.x1) / 2, 10, 28, '#6f8fe0', 1);
    L((KANA.x0 + KANA.x1) / 2, 26, 72, '#ff3df0', .8, 30, 90);
    for (let x = KANA.x0 + 20; x < KANA.x1 - 16; x += 8) RP(x, 20, 74, '#ff3df0', .8);
    L((SIGN.x0 + SIGN.x1) / 2, 28, 72, '#6a8cff', .9, 36, 110);
    for (let x = SIGN.x0 + 10; x < SIGN.x1 - 6; x += 7) RP(x, 20, 78, x < SIGN.x0 + 36 ? '#3db7ff' : '#ff5ae6', .75);
    L(26, SCORE.cy, 50, '#ffd23f', .6, 26, 76);
    for (let y = SCORE.cy - 36; y < SCORE.cy + 36; y += 8) RP(20, y, 70, '#ffd23f', .5);
    L((UPS.x0 + UPS.x1) / 2, 22, 80, '#2fd6e0', .4, 16, 50);
    RP((UPS.x0 + UPS.x1) / 2, 20, 80, '#2fd6e0', .8);
    L(7 * T + 8, 2 * T + 4, 42, '#ffb45c', .55, 18, 56);
    L((GW - 2) * T + 8, 5 * T + 4, 44, '#ff5a60', .6, 18, 56);
    L((GW - 2) * T + 8, 9 * T + 4, 50, '#ff7ae0', .6, 18, 60);
    L((GW - 2) * T + 8, 12 * T + 4, 36, '#ff3df0', .7, 20, 64);
    L((GW - 2) * T + 8, 15 * T + 4, 48, '#5ab4ff', .6, 18, 56);
    RP((GW - 2) * T + 8, 5 * T, 52, '#ff5a60', .9); RP((GW - 2) * T + 8, 9 * T, 58, '#ff7ae0', 1);
    RP((GW - 2) * T + 8, 12 * T, 40, '#ff3df0', 1); RP((GW - 2) * T + 8, 15 * T, 52, '#5ab4ff', .9);
    L(4.5 * T, 11 * T, 22, '#9fd0ff', .35, 14, 40);                   // laptop glow in the lounge
    L(3.5 * T, 9.5 * T, 46, '#ffb870', .9, 30, 80);                    // warm lamp over the sofa
    RP(3.5 * T, 9.5 * T, 46, '#ffb870', .8);
    for (const x of [3, 8, 12, 16, 21]) L(x * T, (GH - 1.6) * T, 40, '#c07cff', .45, 30, 80);  // front-of-hall fill
  },

  // ------------------------------------------------------------------ props
  buildProps(){
    const add = (kind, tx, ty, model, extra) => {
      const m = Object.assign(model, { wx: Math.round(tx * T), wy: Math.round(ty * T) });
      const spr = Vox.bake(m);
      spr.sil = PX.silhouette(spr.cv, '#000');
      const e = extra || {};
      const tw = Math.ceil(m.X / T), th = Math.ceil(m.Y / T);
      const p = Object.assign({ kind, tx, ty, spr, foot: [tx, ty, tx + tw, ty + th], depth: tx + ty + (tw + th) / 2 }, e);
      // floor mirror: axis along the visible front edge
      if (e.faceX) this.makeRefl(spr, m.X - m.Y, (m.X + m.Y) / 2, -.5);
      else this.makeRefl(spr, -m.Y, m.Y / 2, .5);
      if (!e.noBlock) for (let x = 0; x < tw; x++) for (let y = 0; y < th; y++) this.block(Math.floor(tx) + x, Math.floor(ty) + y);
      this.props.push(p);
      return p;
    };
    add('snack', GW - 2, 4, Models.snack());
    add('claw', this.claw.tx, this.claw.ty, Models.claw());
    const jk = add('juke', this.juke.tx, this.juke.ty, Models.jukebox(0));
    jk.frames = [jk.spr];
    for (let ph = 1; ph < 3; ph++){
      const s = Vox.bake(Object.assign(Models.jukebox(ph), { wx: jk.tx * T, wy: jk.ty * T }));
      s.sil = jk.spr.sil; s.refl = jk.spr.refl;
      jk.frames.push(s);
    }
    add('drinks', GW - 2, 14, Models.drinks());
    add('stairs', 4, 1, Models.stairs());
    add('palm', 1, 1, Models.palm(1));
    add('palm', 5, GH - 2, Models.palm(4));
    add('fern', 10, GH - 2, Models.fern(2));
    add('fern', 13, GH - 2, Models.fern(5));
    add('fern', GW - 2, GH - 2, Models.fern(9));
    add('crates', 19, GH - 2, Models.crates());
    add('sofa', 2, 9, Models.sofa(), { faceX: true });
    add('table', 4, 10, Models.coffeeTable());
    add('bin', 1, GH - 2, Models.bin());
    // a stool beside every cabinet (decor — you can walk past them)
    const SC = ['#e8344e', '#3d7bff', '#e8344e', '#ffd23f'];
    CFG.LAYOUT.forEach((S, i) => {
      const sx = S.f === 'S' ? S.tx + 1.3 : S.tx + 1.05, sy = S.f === 'S' ? S.ty + 1.05 : S.ty + 1.3;
      add('stool', sx, sy, Models.stool(SC[i % SC.length]), { noBlock: true, foot: null, depth: sx + sy + 1 });
    });
    this.footprints = this.props.filter(p => !p.noBlock).map(p => [p.tx * T, p.ty * T, p.foot[2] * T, p.foot[3] * T]);
    for (const S of CFG.LAYOUT){
      if (S.f === 'S') this.footprints.push([S.tx * T, S.ty * T, S.tx * T + 32, S.ty * T + 16]);
      else this.footprints.push([S.tx * T, S.ty * T, S.tx * T + 16, S.ty * T + 32]);
    }
    this.footprints.push([7 * T, T, 8 * T, 2 * T]);
  },

  /* bake a floor reflection for a sprite: same pixels, mirrored at draw time
     about a line through local (ax, ay) with slope m (the object's front
     floor edge); faded out with an ordered dither and tinted to the floor. */
  makeRefl(spr, axW, ayW, m){
    const ax = axW - spr.ox, ay = ayW - spr.oy;
    const W = spr.w, Hh = spr.h;
    const src = spr.cv.getContext('2d').getImageData(0, 0, W, Hh);
    const out = new ImageData(W, Hh);
    const s = src.data, o = out.data;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++){
      const i = (y * W + x) * 4;
      if (!s[i + 3]) continue;
      const d = (ay + m * (x - ax)) - y;             // px above the floor line
      const k = Math.max(0, 1 - d / 34) * .62;
      if (PX.bayer(x, y) > k) continue;
      o[i] = s[i] * .55 + 16; o[i + 1] = s[i + 1] * .5 + 12; o[i + 2] = s[i + 2] * .6 + 30; o[i + 3] = 255;
    }
    const cv = PX.canvas(W, Hh);
    cv.getContext('2d').putImageData(out, 0, 0);
    spr.refl = { cv, ax, ay, m };
  },
  drawRefl(b, spr, X, Y){
    const r = spr.refl; if (!r) return;
    const v = this.view_;
    const AX = X + r.ax, AY = Y + r.ay;
    b.setTransform(1, 2 * r.m, 0, -1, -v.ix, 2 * AY - 2 * r.m * AX - v.iy);
    b.drawImage(r.cv, X, Y);
    b.setTransform(1, 0, 0, 1, -v.ix, -v.iy);
  },

  // ------------------------------------------------------------------ static bake
  bakeStatic(){
    const B = [];
    const box = (x0, y0, z0, x1, y1, z1, k, extra) => B.push(Object.assign({ x0, y0, z0, x1, y1, z1, k }, extra || {}));
    const xL = 16, xR = GWu - 16, yB = 16, yF = GHu - 16;
    box(xL, yB, -6, xR, yF, 0, 'floor');
    box(DOOR.x0, DOOR.plane, -6, DOOR.x1, yB, 0, 'thresh');
    // back wall around the doorway + window recess
    box(0, 0, 0, DOOR.x0, yB, WH, 'wallB');
    box(DOOR.x0, 0, DOOR.h, DOOR.x1, yB, WH, 'wallB');
    box(DOOR.x1, 0, 0, WIN.x0, yB, WH, 'wallB');
    box(WIN.x0, 0, 0, WIN.x1, yB, 24, 'wallB');
    box(WIN.x0, 0, 58, WIN.x1, yB, WH, 'wallB');
    box(WIN.x1, 0, 0, GWu, yB, WH, 'wallB');
    box(0, 0, 0, xL, GHu, WH, 'wallL');
    // front drop: low rims + railing (foreground layer — covers whoever walks behind it)
    box(xR, yB, 0, GWu, GHu, RIM, 'rimR', { fg: true });
    box(xL, yF, 0, GWu, GHu, RIM, 'rimF', { fg: true });
    box(xL, GHu - 5, RIM + RAIL - 2, GWu, GHu - 2, RIM + RAIL, 'rail', { fg: true });
    box(xL, GHu - 4, RIM + RAIL - 3, GWu, GHu - 3, RIM + RAIL - 2, 'railNeon', { fg: true });
    box(GWu - 5, yB, RIM + RAIL - 2, GWu - 2, GHu, RIM + RAIL, 'rail', { fg: true });
    box(GWu - 4, yB, RIM + RAIL - 3, GWu - 3, GHu, RIM + RAIL - 2, 'railNeon', { fg: true });
    for (let x = xL + 8; x < GWu; x += 24) box(x, GHu - 5, RIM, x + 2, GHu - 3, RIM + RAIL - 2, 'post', { fg: true });
    for (let y = yB + 8; y < GHu - 8; y += 24) box(GWu - 5, y, RIM, GWu - 3, y + 2, RIM + RAIL - 2, 'post', { fg: true });
    // trims
    for (const s of [[xL, DOOR.x0 - 3], [DOOR.x1 + 3, xR]]) box(s[0], yB, 0, s[1], yB + 2, 4, 'base');
    box(xL, yB, 0, xL + 2, yF, 4, 'base');
    box(xL, yB, 87, xR, yB + 1, 89, 'neonP');
    box(xL, yB, 87, xL + 1, yF, 89, 'neonP');
    box(xL, yB, 90, xR, yB + 3, WH, 'crown');
    box(xL, yB, 90, xL + 3, yF, WH, 'crown');
    // pipes
    box(xL, yB, 80, 88, yB + 3, 83, 'pipe');
    box(20, yB, 4, 23, yB + 3, 80, 'pipe');
    box(xL, yB, 80, xL + 3, SCORE.cy - SCORE.w / 2 - 4, 83, 'pipe');
    // door + window frames
    box(DOOR.x0 - 3, yB, 0, DOOR.x0, yB + 2, DOOR.h + 3, 'frame');
    box(DOOR.x1, yB, 0, DOOR.x1 + 3, yB + 2, DOOR.h + 3, 'frame');
    box(DOOR.x0 - 3, yB, DOOR.h, DOOR.x1 + 3, yB + 2, DOOR.h + 3, 'frame');
    box(WIN.x0 - 3, yB, 21, WIN.x1 + 3, yB + 4, 24, 'sill');
    box(WIN.x0 - 3, yB, 24, WIN.x0, yB + 2, 60, 'frame');
    box(WIN.x1, yB, 24, WIN.x1 + 3, yB + 2, 60, 'frame');
    box(WIN.x0 - 3, yB, 57, WIN.x1 + 3, yB + 2, 60, 'frame');
    // the door at the top of the stairs
    box(UPDOOR.x0 - 2, yB, UPDOOR.z0, UPDOOR.x1 + 2, yB + 1, UPDOOR.z1 + 2, 'updoor');
    // sign boards (faces get animated overlays) + score board + pug frame
    box(KANA.x0, yB, KANA.zTop - KANA.h + 1, KANA.x1, KANA.plane, KANA.zTop + 1, 'board');
    box(SIGN.x0, yB, SIGN.zTop - SIGN.h + 1, SIGN.x1, SIGN.plane, SIGN.zTop + 1, 'board');
    box(UPS.x0, yB, UPS.zTop - UPS.h + 1, UPS.x1, UPS.plane, UPS.zTop + 1, 'board');
    box(xL, SCORE.cy - SCORE.w / 2, SCORE.zTop - SCORE.h + 1, SCORE.plane, SCORE.cy + SCORE.w / 2, SCORE.zTop + 1, 'board');
    box(xL, PUG.y0 - 1, PUG.zTop - PUG.h - 1, PUG.plane, PUG.y0 + PUG.w + 1, PUG.zTop + 1, 'board');
    for (const sc of this.sconces){
      if (sc[1] === 'B') box(sc[0] - 2, yB, 58, sc[0] + 2, yB + 3, 63, 'sconce');
      else box(xL, sc[0] - 2, 58, xL + 3, sc[0] + 2, 63, 'sconce');
    }
    // posters with slogans
    POSTER_DEFS.forEach(p => {
      const pix = new Set();
      const inner = (p.b - p.a) - 4;
      let vy = 4;
      if (p.icon != null) vy += 14;
      p.lines.forEach(line => {
        const w = PX.textW(line), x0 = Math.floor((inner - w) / 2);
        PX.textPts(line, (x, y) => pix.add((x0 + x) + ',' + (vy + y)));
        vy += 7;
      });
      p.pix = pix;
      if (p.wall === 'B') box(p.a, yB, p.z0, p.b, yB + 1, p.z1, 'poster', { p });
      else box(xL, p.a, p.z0, xL + 1, p.b, p.z1, 'poster', { p, left: true });
    });
    // roofline: AC units
    for (const x of [36, 150, 246, 296]) box(x, 2, WH, x + 22, 14, WH + 12, 'ac');
    for (const y of [56, 196]) box(2, y, WH, 14, y + 22, WH + 12, 'ac', { left: true });
    this.boxes = B;

    const minSX = -GHu - 4, maxSX = GWu + 4;
    const minSY = -WH - 20, maxSY = (GWu + GHu) / 2 + 6;
    const W = maxSX - minSX, Hh = maxSY - minSY;
    const col = new Uint32Array(W * Hh), glow = new Uint32Array(W * Hh), fg = new Uint32Array(W * Hh);
    const gloss = new Float32Array(W * Hh);
    const lights = Vox.lights, fps = this.footprints;
    for (let sy = minSY; sy < maxSY; sy++){
      for (let sx = minSX; sx < maxSX; sx++){
        const ox = sx + .5, oz = (sx + .5) / 2 - (sy + .5);
        let best = -Infinity, hb = null, hf = 0;
        for (let i = 0; i < B.length; i++){
          const b = B[i];
          const ax = b.x1 - ox, ay = b.y1, az = b.z1 - oz;
          const hi = Math.min(ax, ay, az);
          if (hi <= best) continue;
          const lo = Math.max(b.x0 - ox, b.y0, b.z0 - oz);
          if (hi <= lo) continue;
          best = hi; hb = b; hf = ax === hi ? 0 : ay === hi ? 1 : 2;
        }
        if (!hb) continue;
        const px = best + ox, py = best, pz = best + oz;
        const ix = hf === 0 ? hb.x1 - 1 : Math.floor(px);
        const iy = hf === 1 ? hb.y1 - 1 : Math.floor(py);
        const iz = hf === 2 ? hb.z1 - 1 : Math.floor(pz);
        const r = this.tex(hb, hf, ix, iy, iz, px, py);
        let occ = r[2];
        const i = (sy - minSY) * W + (sx - minSX);
        if (hb.k === 'floor'){
          const dw = Math.min(px - xL, py - yB);
          if (dw < 10) occ *= 1 - .45 * (1 - dw / 10);
          for (let k = 0; k < fps.length; k++){
            const f = fps[k];
            const dx = Math.max(f[0] - px, 0, px - f[2]), dy = Math.max(f[1] - py, 0, py - f[3]);
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 7) occ *= 1 - .55 * (1 - d / 7) * (1 - d / 7);
          }
          gloss[i] = r[3] == null ? 1 : r[3];
        } else if (hb.k === 'wallB' || hb.k === 'wallL'){
          if (hf !== 2){
            if (pz < 14) occ *= .62 + .027 * pz;                // grime at the foot of the wall
            const along = hf === 1 ? px - xL : py - yB;
            if (along < 8 && along >= 0) occ *= .72 + .035 * along;
          }
        }
        const wx = px + (hf === 0 ? .5 : 0), wy = py + (hf === 1 ? .5 : 0), wz = pz + (hf === 2 ? .5 : 0);
        const c = Vox.shade(lights, r[0], r[1], wx, wy, wz, hf, occ, sx, sy);
        col[i] = c;
        if (hb.fg) fg[i] = c;
        if (r[1] > .3){ const e = PX.unpack(c); glow[i] = PX.pack(e[0] * r[1], e[1] * r[1], e[2] * r[1]); }
      }
    }
    // wet-floor reflections: every light point splats a vertical streak at
    // its mirror image (x, y, −z), added onto glossy floor pixels only
    const acc = new Float32Array(W * Hh * 3);
    const splat = (L, gain) => {
      const rx = L.x - L.y - minSX, ry = (L.x + L.y) / 2 + L.z - minSY;
      const sgx = 1.7, sgy = 3.5 + L.z * .09;
      const x0 = Math.max(0, Math.floor(rx - sgx * 3)), x1 = Math.min(W - 1, Math.ceil(rx + sgx * 3));
      const y0 = Math.max(0, Math.floor(ry - sgy * 2.5)), y1 = Math.min(Hh - 1, Math.ceil(ry + sgy * 3));
      const I = L.I * gain;
      for (let y = y0; y <= y1; y++){
        const dy = (y - ry) / sgy, ey = Math.exp(-dy * dy * .5);
        for (let x = x0; x <= x1; x++){
          const dx = (x - rx) / sgx;
          const k = I * ey * Math.exp(-dx * dx * .5);
          if (k < .01) continue;
          const j = (y * W + x) * 3;
          acc[j] += L.c[0] * k; acc[j + 1] += L.c[1] * k; acc[j + 2] += L.c[2] * k;
        }
      }
    };
    for (const L of lights) if (L.z > 20) splat(L, .22);
    for (const L of this.refl) splat(L, .5);
    for (let i = 0; i < W * Hh; i++){
      const g = gloss[i];
      if (!g) continue;
      const j = i * 3;
      const sum = acc[j] + acc[j + 1] + acc[j + 2];
      if (sum < .02) continue;
      const e = PX.unpack(col[i]);
      const k = 255 * g;
      const d = (PX.bayer(i % W, (i / W) | 0) - .5) * 14;
      col[i] = PX.near(e[0] + acc[j] * k + d, e[1] + acc[j + 1] * k + d, e[2] + acc[j + 2] * k + d);
      if (sum > .9){ const q = PX.unpack(col[i]); glow[i] = PX.pack(q[0] * .35, q[1] * .35, q[2] * .35); }
    }
    this.staticCv = PX.fromU32(col, W, Hh);
    this.staticGlow = PX.fromU32(glow, W, Hh);
    this.fgCv = PX.fromU32(fg, W, Hh);
    this.fgSil = PX.silhouette(this.fgCv, '#000');
    this.SX0 = minSX; this.SY0 = minSY;
    this.CAM = { x0: minSX + 10, x1: maxSX - 10, y0: minSY + 4, y1: maxSY + 10 };
    const q = (x, y) => this.iso(x, y);
    this.floorPoly = [q(1, 1), q(GW - 1, 1), q(GW - 1, GH - 1), q(1, GH - 1)];
  },

  // texture for a static box face → [albedo, emit, occlusion, gloss?]
  tex(b, f, ix, iy, iz){
    const h = PX.hash;
    switch (b.k){
      case 'floor': return this.floorTex(ix, iy);
      case 'thresh': return [(ix + iy) % 4 === 0 ? [40, 36, 58] : [70, 66, 92], 0, 1];
      case 'wallB': case 'wallL': {
        if (f === 2) return [iz === WH - 1 && ((b.k === 'wallB' ? iy : ix) >= 14) ? [86, 70, 120] : [46, 36, 70], 0, 1];
        return this.wallTex(f === 1 ? ix : iy, iz, b.k === 'wallL');
      }
      case 'rimR': case 'rimF': {
        if (f === 2){
          const edge = (b.k === 'rimF' ? iy === b.y1 - 1 || iy === b.y0 : ix === b.x1 - 1 || ix === b.x0);
          return [edge ? [96, 80, 140] : [52, 42, 80], 0, edge ? 1.1 : 1];
        }
        const u = b.k === 'rimF' ? ix : (GHu - iy);
        const txt = b.k === 'rimF' ? 'INSERT COIN · BETTER DAYS AHEAD · ARCADE FOREVER · ' : 'PLAY MORE · WORRY LESS · ';
        if (iz >= 3 && iz <= 7 && this.rimText(txt, u, 7 - iz)) return [[255, 110, 236], 1, 1];
        return [iz === RIM - 1 ? [60, 46, 90] : [24, 18, 38], 0, 1];
      }
      case 'rail': return [f === 2 ? [150, 146, 180] : [90, 86, 118], 0, 1];
      case 'railNeon': return [[255, 90, 230], 1, 1];
      case 'post': return [[70, 66, 96], 0, 1];
      case 'base': return [iz === 3 ? [62, 46, 84] : [20, 14, 30], 0, 1];
      case 'neonP': return [f === 2 ? [255, 190, 250] : [255, 110, 242], 1, 1];
      case 'crown': return [f === 2 ? [62, 48, 96] : iz === WH - 1 ? [72, 56, 108] : [34, 26, 54], 0, 1];
      case 'pipe': {
        const joint = (b.x1 - b.x0 > 4 ? ix : (b.y1 - b.y0 > 4 ? iy : iz)) % 22 < 2;
        return [joint ? [120, 116, 140] : (f === 2 || iz === b.z1 - 1 ? [96, 100, 122] : [66, 68, 90]), 0, 1];
      }
      case 'frame': return [f === 2 ? [92, 80, 124] : [58, 48, 84], 0, 1];
      case 'sill': return [f === 2 ? [110, 96, 140] : [62, 52, 90], 0, 1];
      case 'board': return [[12, 8, 22], 0, 1];
      case 'sconce': return [f === 2 ? [255, 190, 110] : (iz >= 61 ? [255, 170, 90] : [110, 62, 36]), iz >= 61 || f === 2 ? .8 : 0, 1];
      case 'updoor': {
        if (f !== 1) return [[40, 28, 30], 0, 1];
        const u = ix - UPDOOR.x0, v = iz - UPDOOR.z0;
        if (u < 0 || u > UPDOOR.x1 - UPDOOR.x0 - 1 || v > UPDOOR.z1 - UPDOOR.z0 - 1) return [[70, 56, 90], 0, 1];
        if (u >= 4 && u <= 11 && v >= 20 && v <= 27) return [(u === 7 || u === 8 || v === 23) ? [60, 40, 30] : [255, 196, 120], .8, 1];
        if (u === 13 && v === 14) return [[255, 210, 63], .6, 1];
        return [(u % 5 === 0) ? [74, 44, 34] : [96, 58, 42], 0, 1];
      }
      case 'ac': {
        const face = b.left ? 0 : 1;
        if (f === face){
          const u = b.left ? (b.y1 - 1 - iy) - 2 : ix - b.x0 - 2, v = iz - WH - 2;
          const r = Math.hypot(u - 8.5, v - 4);
          if (r < 4.5) return [(Math.round(r) % 2 === 0 || Math.abs(u - 8.5) < .6) ? [40, 40, 52] : [110, 110, 128], 0, 1];
          return [(v === -1 || v === 9) ? [70, 72, 88] : [128, 130, 150], 0, 1];
        }
        return [f === 2 ? [150, 152, 170] : [96, 98, 118], 0, 1];
      }
      case 'poster': {
        const P = b.p;
        if (f !== (b.left ? 0 : 1)) return [[20, 14, 30], 0, 1];
        const u = (b.left ? (P.b - 1 - iy) : ix) - P.a, v = P.z1 - 1 - iz;
        const w = P.b - P.a, hgt = P.z1 - P.z0;
        if (u <= 0 || u >= w - 1 || v <= 0 || v >= hgt - 1) return [[10, 7, 18], 0, 1];
        if (u === 1 || u === w - 2 || v === 1 || v === hgt - 2) return [PX.hex(P.fg).map(c => c * .45), .2, 1];
        if (P.pix.has((u - 2) + ',' + (v - 1))) return [PX.hex(P.fg), .55, 1];
        if (P.icon != null && v >= 3 && v <= 14){
          const row = Models.ICONS[P.icon][v - 3];
          const c = row && row[u - Math.floor((w - 12) / 2)];
          if (c && c !== '.') return [PX.hex(Models.IP[c]), .35, 1];
        }
        const bg = PX.hex(P.bg);
        return [h(ix + iy, iz, 5) > .9 ? bg.map(c => c * .8) : bg, .08, 1];
      }
    }
    return [[255, 0, 255], 0, 1];
  },
  rimText(txt, u, v){
    if (!this._rimCache) this._rimCache = {};
    let c = this._rimCache[txt];
    if (!c){
      c = { set: new Set(), w: PX.textW(txt) + 4 };
      PX.textPts(txt, (x, y) => c.set.add(x + ',' + y));
      this._rimCache[txt] = c;
    }
    return c.set.has((((u % c.w) + c.w) % c.w) + ',' + v);
  },

  // glossy dark tiles: grout lines, per-tile tone, bevel; [albedo, emit, occ, gloss]
  floorTex(x, y){
    const h = PX.hash;
    if (x >= DOOR.x0 && x < DOOR.x1 && y >= 16 && y < 34){
      const edge = x === DOOR.x0 || x === DOOR.x1 - 1 || y === 16 || y === 33;
      return [edge ? [96, 76, 126] : ((x + y) % 3 === 0 ? [58, 44, 84] : [70, 54, 100]), 0, 1, 0];
    }
    const S = 16, tx = Math.floor(x / S), ty = Math.floor(y / S), u = x - tx * S, v = y - ty * S;
    if (u === 0 || v === 0) return [[18, 15, 28], 0, 1, .15];
    const t = h(tx, ty, 21);
    let base = t > .7 ? [44, 40, 68] : t < .25 ? [36, 33, 58] : [40, 36, 63];
    if (u === 1 || v === 1) base = base.map(c => c * 1.2);
    else if (u === S - 1 || v === S - 1) base = base.map(c => c * .8);
    if (h(x, y, 3) > .985) base = [70, 64, 100];
    const dx = (x - 146) / 30, dy = (y - 44) / 16;
    const wet = dx * dx + dy * dy < 1 ? 1.35 : 1;
    return [wet > 1 ? base.map(c => c * .8) : base, 0, 1, (.75 + t * .35) * wet];
  },

  wallTex(u, z, left){
    const h = PX.hash;
    if (z < 4) return [[20, 14, 30], 0, 1];
    const vineAt = left ? [[16, 44], [228, 286]] : [[16, 58], [212, 222], [366, 384]];
    for (const r of vineAt){
      if (u >= r[0] && u < r[1]){
        const len = 8 + 22 * (.5 + .5 * Math.sin(u * .45 + (left ? 2 : 0)) * Math.sin(u * .13));
        if (z > WH - len && h(u, z, left ? 41 : 17) > .42) return [h(u, z, 9) > .7 ? [110, 190, 90] : h(u, z, 8) > .4 ? [62, 140, 70] : [36, 96, 52], 0, 1];
      }
    }
    if (z >= 84) return [[26, 18, 40], 0, 1];
    const row = z >> 2, off = (row & 1) * 4;
    if ((z & 3) === 0 || ((u + off) & 7) === 0) return [[24, 17, 32], 0, 1];
    const bi = (u + off) >> 3;
    const t = h(bi, row, left ? 13 : 7);
    let c = t > .85 ? [76, 44, 70] : t > .6 ? [64, 38, 62] : t < .12 ? [44, 28, 48] : [56, 34, 56];
    if (h(u, z, 5) > .93) c = c.map(v => v * .78);
    if (z < 22 && h(u >> 1, z, 12) > .55) c = c.map(v => v * .8);
    return [c, 0, 1];
  },

  // ------------------------------------------------------------------ dynamic textures
  buildDynamicTex(){
    this.winCv = PX.canvas(WIN.x1 - WIN.x0, WIN.h); this.winGlow = PX.canvas(WIN.x1 - WIN.x0, WIN.h);
    this.doorCv = PX.canvas(DOOR.x1 - DOOR.x0, DOOR.h);
    this.kanaCv = PX.canvas(KANA.x1 - KANA.x0, KANA.h); this.kanaGlow = PX.canvas(KANA.x1 - KANA.x0, KANA.h);
    this.signCv = PX.canvas(SIGN.x1 - SIGN.x0, SIGN.h); this.signGlow = PX.canvas(SIGN.x1 - SIGN.x0, SIGN.h);
    this.upCv = PX.canvas(UPS.x1 - UPS.x0, UPS.h); this.upGlow = PX.canvas(UPS.x1 - UPS.x0, UPS.h);
    this.scoreCv = PX.canvas(SCORE.w, SCORE.h); this.scoreGlow = PX.canvas(SCORE.w, SCORE.h);
    const W = WIN.x1 - WIN.x0, Hh = WIN.h;
    const sky = PX.canvas(W, Hh), c = sky.getContext('2d');
    const rng = mulberry32(99);
    const SK = ['#0b1030', '#101a44', '#16245a', '#1c2c66'];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++){
      const v = y / Hh * 3 + PX.bayer(x, y) - .5;
      c.fillStyle = SK[Math.max(0, Math.min(3, Math.floor(v)))];
      c.fillRect(x, y, 1, 1);
    }
    c.fillStyle = '#3a1450'; c.fillRect(24, 6, 11, 5);
    c.fillStyle = '#ff3df0'; c.fillRect(25, 7, 9, 3);
    let x = 0;
    this.winLit = [];
    while (x < W){
      const bw = 4 + (rng() * 7 | 0), bh = 8 + (rng() * 16 | 0);
      c.fillStyle = rng() > .5 ? '#070a1c' : '#0a0e24';
      c.fillRect(x, Hh - bh, bw, bh);
      for (let yy = Hh - bh + 2; yy < Hh - 2; yy += 3)
        for (let xx = x + 1; xx < x + bw - 1; xx += 2)
          if (rng() > .62) this.winLit.push([xx, yy, rng()]);
      x += bw + (rng() * 2 | 0);
    }
    this.skyCv = sky;
  },

  makePugTex(){
    const S = PUG.w;
    const cv = this.pugTex || PX.canvas(S, PUG.h);
    const c = cv.getContext('2d');
    c.clearRect(0, 0, S, PUG.h);
    c.fillStyle = '#0a0712'; c.fillRect(0, 0, S, PUG.h);
    c.fillStyle = '#3a2b52'; c.fillRect(1, 1, S - 2, PUG.h - 2);
    c.fillStyle = '#1a1026'; c.fillRect(2, 2, S - 4, PUG.h - 4);
    if (this.pugReady){
      const tmp = PX.canvas(S - 6, PUG.h - 8), tc = tmp.getContext('2d');
      tc.imageSmoothingEnabled = true;
      try { tc.drawImage(this.pugImg, 0, 0, tmp.width, tmp.height); } catch (e){}
      c.drawImage(tmp, 3, 3);
    } else {
      c.drawImage(PX.grid(['t.t.....t.t', 'ttt.....ttt', '.ttttttttt.', 'ttttttttttt', 'tkkttttkktt',
        'ttttttttttt', 'tttkkkkkttt', '.tttttttt..', '..tttttt...'], { t: '#d8a06a', k: '#14101e' }, true), 8, 8);
    }
    c.fillStyle = '#f4b8c1'; c.fillRect(3, PUG.h - 4, S - 6, 1);
    this.pugTex = cv;
  },

  drawWindow(b, g, t){
    const W = WIN.x1 - WIN.x0, Hh = WIN.h;
    const c = this.winCv.getContext('2d'), gc = this.winGlow.getContext('2d');
    c.drawImage(this.skyCv, 0, 0);
    gc.clearRect(0, 0, W, Hh);
    for (const w of this.winLit){
      if (Math.sin(t * .3 + w[2] * 40) <= -.6) continue;
      c.fillStyle = w[2] > .8 ? '#9fd8ff' : '#ffcf6a';
      c.fillRect(w[0], w[1], 1, 1);
    }
    if (this.flash > .02){
      c.globalAlpha = Math.min(1, this.flash * 1.2);
      c.fillStyle = '#b8c8ff'; c.fillRect(0, 0, W, Hh - 10);
      c.globalAlpha = 1;
      if (this.flash > .7){
        c.fillStyle = '#ffffff';
        let bx = 8 + (this.boltX || 0) % 20;
        for (let y = 0; y < 12; y++){ c.fillRect(bx, y, 1, 1); if (y % 3 === 2) bx += (y & 4) ? 1 : -1; }
      }
    }
    const wk = this.walker;
    if (wk.active){
      const px = Math.round(wk.dir > 0 ? -6 + wk.p * (W + 10) : W + 4 - wk.p * (W + 10));
      const sh = (t * 6 | 0) % 2;
      c.fillStyle = '#05060e';
      c.fillRect(px + 1, Hh - 10, 3, 8 - sh); c.fillRect(px + 2, Hh - 12, 1, 2);
      c.fillStyle = '#c3282f';
      c.fillRect(px - 1, Hh - 15, 7, 1); c.fillRect(px, Hh - 16, 5, 1); c.fillRect(px + 2, Hh - 14, 1, 2);
    }
    c.fillStyle = 'rgba(150,185,235,.7)';
    for (const d of this.drops) c.fillRect(d.x | 0, d.y | 0, 1, d.len);
    c.fillStyle = 'rgba(160,190,255,.10)';
    for (let i = 0; i < Hh; i++) c.fillRect(((i * .6) | 0) + 4, i, 3, 1);
    c.fillStyle = 'rgba(200,220,255,.55)';
    for (let i = 0; i < 9; i++) c.fillRect((i * 17 + 5) % W, ((i * 11 + t * (2 + i % 3)) % (Hh + 4)) | 0, 1, 1);
    c.fillStyle = '#241a38'; c.fillRect(W / 2 - 1, 0, 2, Hh); c.fillRect(0, 11, W, 1);
    // OPEN (pink) + 24/7 (cyan) neon hanging inside the glass
    if (Math.sin(t * 2.3) <= .97){
      const drawOpen = (ctx, pink, cyan) => { PX.text(ctx, 'OPEN', 3, 16, pink); PX.text(ctx, '24/7', 24, 18, cyan); };
      c.fillStyle = 'rgba(255,90,230,.35)'; c.fillRect(2, 15, 17, 7);
      c.fillStyle = 'rgba(47,214,224,.3)'; c.fillRect(23, 17, 17, 7);
      drawOpen(c, '#ffc2f6', '#bffcff');
      drawOpen(gc, '#ff5ae6', '#2fd6e0');
    }
    PX.blitY(b, this.winCv, 0, 0, W, Hh, WIN.x0, WIN.plane, WIN.zTop);
    PX.blitY(g, this.winGlow, 0, 0, W, Hh, WIN.x0, WIN.plane, WIN.zTop);
  },

  drawDoor(b, g, t){
    const W = DOOR.x1 - DOOR.x0, Hh = DOOR.h;
    const c = this.doorCv.getContext('2d');
    c.fillStyle = '#0a1024'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#0e1630'; c.fillRect(0, 0, W, 22);
    c.fillStyle = '#131d3e'; c.fillRect(0, Hh - 10, W, 10);
    c.fillStyle = 'rgba(255,200,120,.10)'; c.fillRect(18, Hh - 10, 8, 10);
    c.fillStyle = '#ffcf7a'; c.fillRect(22, 6, 2, 1);
    c.fillStyle = 'rgba(255,207,122,.25)'; c.fillRect(20, 7, 6, 3);
    c.fillStyle = 'rgba(150,185,235,.6)';
    for (const d of this.drops) c.fillRect((d.x * .8) | 0, (d.y * 1.5) | 0, 1, d.len + 1);
    if (this.flash > .02){ c.globalAlpha = this.flash * .8; c.fillStyle = '#a8b8ff'; c.fillRect(0, 0, W, Hh); c.globalAlpha = 1; }
    const slide = Math.round(Math.max(0, Math.min(1, this.doorOpen)) * 14);
    const leaf = (x, handleRight) => {
      c.fillStyle = '#2a2240'; c.fillRect(x, 0, 16, Hh);
      c.fillStyle = 'rgba(40,60,120,.55)'; c.fillRect(x + 2, 2, 12, Hh - 8);
      c.fillStyle = 'rgba(180,200,255,.16)';
      for (let y = 2; y < Hh - 8; y++) if (((y + x) % 9) < 2) c.fillRect(x + 3 + (y % 5), y, 2, 1);
      c.fillStyle = '#403462'; c.fillRect(x, 0, 16, 1); c.fillRect(x, Hh - 6, 16, 6);
      c.fillStyle = '#ffd23f'; c.fillRect(x + (handleRight ? 12 : 3), 22, 1, 6);
    };
    leaf(0 - slide, true);
    leaf(16 + slide, false);
    PX.blitY(b, this.doorCv, 0, 0, W, Hh, DOOR.x0, DOOR.plane, DOOR.zTop);
  },

  // neon signage: ゲーム over the entrance, the big JOJKOS sign, UP ↑
  drawSigns(b, g, t){
    const T0 = this.signT;
    const lit = (i, base) => {
      const onAt = base + i * .12;
      if (T0 < onAt - .3) return false;
      if (T0 < onAt) return Math.random() < .4;
      return !(Math.sin(t * 1.3 + i * 7.1) > .985);
    };
    {
      const W = KANA.x1 - KANA.x0, Hh = KANA.h;
      const c = this.kanaCv.getContext('2d'), gc = this.kanaGlow.getContext('2d');
      c.fillStyle = '#0c0716'; c.fillRect(0, 0, W, Hh); gc.clearRect(0, 0, W, Hh);
      const chars = ['ゲ', 'ー', 'ム'];
      const s = 2, gw = 9 * s, gap = 6, tot = chars.length * gw + (chars.length - 1) * gap;
      let x = Math.round((W - tot) / 2);
      chars.forEach((ch, i) => {
        const rows = KANA_G[ch], x0 = x;
        neon(c, gc, (ctx, col) => drawGrid(ctx, rows, x0, 3, s, col), '#5a0c50', '#ff4ff0', lit(i, .4));
        x += gw + gap;
      });
      PX.blitY(b, this.kanaCv, 0, 0, W, Hh, KANA.x0, KANA.plane, KANA.zTop);
      PX.blitY(g, this.kanaGlow, 0, 0, W, Hh, KANA.x0, KANA.plane, KANA.zTop);
    }
    {
      const W = SIGN.x1 - SIGN.x0, Hh = SIGN.h;
      const c = this.signCv.getContext('2d'), gc = this.signGlow.getContext('2d');
      c.fillStyle = '#0a0818'; c.fillRect(0, 0, W, Hh); gc.clearRect(0, 0, W, Hh);
      c.fillStyle = '#231a44'; c.fillRect(0, 0, W, 1); c.fillRect(0, Hh - 1, W, 1);
      neon(c, gc, (ctx, col) => drawGrid(ctx, CAT, 5, 4, 2, col), '#0a2a5a', '#3db7ff', lit(0, .2));
      const title = 'JOJKOS GAMES';
      let x = 34;
      for (let i = 0; i < title.length; i++){
        const ch = title[i], x0 = x;
        neon(c, gc, (ctx, col) => PX.text(ctx, ch, x0, 3, col, 2), '#5a0c50', '#ff5ae6', lit(i + 1, .5));
        x += PX.textW(ch, 2) + 2;
      }
      const on = lit(14, .6);
      neon(c, gc, (ctx, col) => PX.text(ctx, 'PLAY · COFFEE · REPEAT', 36, 17, col, 1), '#0a2a4a', on ? '#8ae4ff' : '#1a3a5a', on);
      PX.blitY(b, this.signCv, 0, 0, W, Hh, SIGN.x0, SIGN.plane, SIGN.zTop);
      PX.blitY(g, this.signGlow, 0, 0, W, Hh, SIGN.x0, SIGN.plane, SIGN.zTop);
    }
    {
      const W = UPS.x1 - UPS.x0, Hh = UPS.h;
      const c = this.upCv.getContext('2d'), gc = this.upGlow.getContext('2d');
      c.fillStyle = '#0a0a18'; c.fillRect(0, 0, W, Hh); gc.clearRect(0, 0, W, Hh);
      const bob = (t * 2 % 1) < .5 ? 0 : 1;
      neon(c, gc, (ctx, col) => { PX.text(ctx, 'UP', 4, 3, col); drawGrid(ctx, ['..#..', '.###.', '#####', '..#..', '..#..'], 14, 3 - bob, 1, col); },
        '#073040', '#5af2ff', lit(0, .9));
      PX.blitY(b, this.upCv, 0, 0, W, Hh, UPS.x0, UPS.plane, UPS.zTop);
      PX.blitY(g, this.upGlow, 0, 0, W, Hh, UPS.x0, UPS.plane, UPS.zTop);
    }
  },

  drawScore(b, g, t){
    const W = SCORE.w, Hh = SCORE.h;
    const c = this.scoreCv.getContext('2d'), gc = this.scoreGlow.getContext('2d');
    c.fillStyle = '#0b0714'; c.fillRect(0, 0, W, Hh);
    gc.clearRect(0, 0, W, Hh);
    c.fillStyle = '#4a3a60'; c.fillRect(0, 0, W, 1); c.fillRect(0, Hh - 1, W, 1); c.fillRect(0, 0, 1, Hh); c.fillRect(W - 1, 0, 1, Hh);
    c.fillStyle = '#ff9a3c'; c.fillRect(2, Hh - 3, W - 4, 1); gc.fillStyle = '#ff9a3c'; gc.fillRect(2, Hh - 3, W - 4, 1);
    const title = 'HI-SCORE';
    const tw = PX.textW(title, 2);
    PX.text(c, title, (W - tw) / 2 | 0, 4, '#ffd23f', 2, '#6a3a08');
    PX.text(gc, title, (W - tw) / 2 | 0, 4, '#b88a1c', 2);
    const top = (window.Cabinets && Cabinets.topScores) ? Cabinets.topScores(5) : [];
    // real coin counts once you've played; a friendly fake board until then
    const rows = top.length ? top.map(s => [(s.short || '').slice(0, 7), String(s.n)])
      : [['KIRBY', '198765'], ['JOJKOS', '104320'], ['PIXEL', '98210'], ['GHOST', '87550'], ['TETSU', '70120']];
    for (let i = 0; i < rows.length; i++){
      const ry = 18 + i * 6;
      const col = i === 0 && (t * 2 % 1) < .7 ? '#ffd23f' : ['#ffffff', '#e8e0ff', '#cfc4ee', '#b0a4d4', '#9488ba'][i];
      PX.text(c, (i + 1) + ' ' + rows[i][0], 6, ry, col);
      PX.text(c, rows[i][1], W - 6 - PX.textW(rows[i][1]), ry, col);
    }
    if ((t * 1.4 % 1) < .7) PX.text(c, 'PLAY TO RANK!', (W - PX.textW('PLAY TO RANK!')) / 2 | 0, 48, '#ff8ae8');
    PX.blitX(b, this.scoreCv, 0, 0, W, Hh, SCORE.plane, SCORE.cy + W / 2 - 1, SCORE.zTop);
    PX.blitX(g, this.scoreGlow, 0, 0, W, Hh, SCORE.plane, SCORE.cy + W / 2 - 1, SCORE.zTop);
  },

  // ------------------------------------------------------------------ per-frame update
  update(dt, t){
    this.thunderIn -= dt;
    if (this.thunderIn <= 0){
      this.thunderIn = 10 + Math.random() * 14;
      this.flash = 1; this.boltX = Math.random() * 40 | 0;
      if (window.AudioSys) AudioSys.thunder();
    }
    this.flash = Math.max(0, this.flash - dt * 1.5);
    for (const d of this.drops){ d.y += d.spd * dt; if (d.y > 36){ d.y = -d.len; d.x = Math.random() * 40; } }
    for (const m of this.motes){
      m.x += m.vx * dt; m.h += Math.sin(t * .6 + m.ph) * dt * 1.5;
      if (m.x < 1.5) m.x = GW - 2; if (m.x > GW - 1.5) m.x = 1.5;
    }
    this.signT += dt;
    const cl = this.claw;
    if (cl.phase > 0){ cl.phase += dt / 2.6; if (cl.phase >= 1) cl.phase = 0; }
    else { cl.dropIn -= dt; if (cl.dropIn <= 0){ cl.dropIn = 7 + Math.random() * 8; cl.phase = .001; } }
    const jk = this.juke;
    jk.noteIn -= dt;
    if (jk.noteIn <= 0){ jk.noteIn = .9 + Math.random() * .8; this.notes.push({ x: jk.tx + .5, y: jk.ty + .7, h: 46, age: 0, ph: Math.random() * 6 }); }
    for (let i = this.notes.length - 1; i >= 0; i--){ const n = this.notes[i]; n.age += dt; n.h += dt * 10; if (n.age > 2.6) this.notes.splice(i, 1); }
    if (Math.random() < dt * 5) this.steam.push({ x: 7.5 + (Math.random() - .5) * .2, y: 1.85, h: 14, age: 0 });
    if (Math.random() < dt * 3) this.steam.push({ x: 4.3, y: 10.6, h: 11, age: 0 });
    for (let i = this.steam.length - 1; i >= 0; i--){ const s = this.steam[i]; s.age += dt; s.h += dt * 9; if (s.age > 1.6) this.steam.splice(i, 1); }
    if (this.doorOpen > .3 && Math.random() < dt * 30 * this.doorOpen){
      this.splash.push({ x: 8 + Math.random() * 2, y: .6, h: 30 + Math.random() * 16, vy: 2 + Math.random(), age: 0 });
    }
    for (let i = this.splash.length - 1; i >= 0; i--){ const s = this.splash[i]; s.age += dt; s.h -= dt * 90; s.y += dt * s.vy; if (s.h < 0 || s.age > 1) this.splash.splice(i, 1); }
    const wk = this.walker;
    if (wk.active){ wk.p += dt / 5; if (wk.p >= 1) wk.active = false; }
    else { wk.nextIn -= dt; if (wk.nextIn <= 0){ wk.nextIn = 14 + Math.random() * 22; wk.active = true; wk.p = 0; wk.dir = Math.random() < .5 ? 1 : -1; } }
    if (this.marker){ this.marker.age += dt; if (this.marker.age > .8) this.marker = null; }
    if (this.attract) this.attractT += dt;
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 4);
  },

  // ------------------------------------------------------------------ view / camera
  resize(){
    const W = innerWidth, H = innerHeight;
    this.vwCss = W; this.vhCss = H;
    this.P = Math.max(1.6, Math.min(H / 320, W / 220));
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.view.width = Math.round(W * this.dpr);
    this.view.height = Math.round(H * this.dpr);
    const v = PX.canvas(this.view.width, this.view.height), c = v.getContext('2d');
    const rIn = Math.min(v.width, v.height) * .42, rOut = Math.hypot(v.width, v.height) * .56;
    const gr = c.createRadialGradient(v.width / 2, v.height / 2, rIn, v.width / 2, v.height / 2, rOut);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(3,1,8,.6)');
    c.fillStyle = gr; c.fillRect(0, 0, v.width, v.height);
    this.vignette = v;
  },
  ensureBuffers(bw, bh){
    if (!this.buf || this.buf.width < bw || this.buf.height < bh){
      const w = Math.max(bw, this.buf ? this.buf.width : 0) + 16, h = Math.max(bh, this.buf ? this.buf.height : 0) + 16;
      this.buf = PX.canvas(w, h); this.bctx = this.buf.getContext('2d');
      this.glow = PX.canvas(w, h); this.gctx = this.glow.getContext('2d');
      this.g1 = PX.canvas(Math.ceil(w / 3), Math.ceil(h / 3)); this.g1c = this.g1.getContext('2d');
      this.g2 = PX.canvas(Math.ceil(w / 8), Math.ceil(h / 8)); this.g2c = this.g2.getContext('2d');
      for (const c of [this.bctx, this.gctx]) c.imageSmoothingEnabled = false;
    }
  },
  artScale(){ return this.P * this.cam.z; },
  clientToWorld(cx, cy){
    const k = this.artScale();
    const sx = this.cam.x + (cx - this.vwCss / 2) / k, sy = this.cam.y + (cy - this.vhCss / 2) / k;
    const w = this.unproject(sx, sy);
    return { sx, sy, x: w[0], y: w[1] };
  },
  worldToClient(sx, sy){
    const k = this.artScale();
    return [(sx - this.cam.x) * k + this.vwCss / 2, (sy - this.cam.y) * k + this.vhCss / 2];
  },
  updateCamera(dt, player){
    const cam = this.cam;
    const ov = window.Cabinets && Cabinets.getCamOverride();
    let tx, ty, tz;
    if (ov){ tx = ov.x; ty = ov.y; tz = ov.z; }
    else if (this.attract){
      const cc = this.iso(GW / 2, GH / 2);
      tx = cc[0] + Math.sin(this.attractT * .12) * GW * T * .3;
      ty = cc[1] - 24 + Math.cos(this.attractT * .08) * GH * T * .22;
      tz = 1.02 + Math.sin(this.attractT * .05) * .06;
    } else {
      const p = this.iso(player.x, player.y);
      tx = p[0] + (player.vsx || 0) * 10; ty = p[1] - 24 + (player.vsy || 0) * 6; tz = cam.tz;
    }
    if (!ov){
      const k = this.P * tz, hw = this.vwCss / 2 / k, hh = this.vhCss / 2 / k, C = this.CAM;
      if (C.x1 - C.x0 > hw * 2) tx = Math.max(C.x0 + hw, Math.min(C.x1 - hw, tx)); else tx = (C.x0 + C.x1) / 2;
      if (C.y1 - C.y0 > hh * 2) ty = Math.max(C.y0 + hh, Math.min(C.y1 - hh, ty)); else ty = (C.y0 + C.y1) / 2;
    }
    const k = ov ? (ov.snap || .18) : 1 - Math.exp(-dt * (this.attract ? 1.2 : 5));
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    const zk = this.introCam ? 1 - Math.exp(-dt * .9) : (ov ? k : 1 - Math.exp(-dt * 4));
    cam.z += (tz - cam.z) * zk;
  },

  // ------------------------------------------------------------------ render
  render(t, dt, player, ghostFrames){
    this.updateCamera(dt, player);
    const cam = this.cam, K = this.artScale();
    const vw = this.vwCss / K, vh = this.vhCss / K;
    const bw = Math.ceil(vw) + 2, bh = Math.ceil(vh) + 2;
    this.ensureBuffers(bw, bh);
    const left = cam.x - vw / 2, top = cam.y - vh / 2;
    const ix = Math.floor(left), iy = Math.floor(top);
    const b = this.bctx, g = this.gctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.fillStyle = '#07040e'; b.fillRect(0, 0, bw, bh);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, bw, bh);
    b.setTransform(1, 0, 0, 1, -ix, -iy);
    g.setTransform(1, 0, 0, 1, -ix, -iy);
    this.view_ = { ix, iy, bw, bh };

    this.drawWindow(b, g, t);
    this.drawDoor(b, g, t);
    b.drawImage(this.staticCv, this.SX0, this.SY0);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(this.staticGlow, this.SX0, this.SY0);
    g.globalCompositeOperation = 'source-over';
    this.drawSigns(b, g, t);
    this.drawScore(b, g, t);
    PX.blitX(b, this.pugTex, 0, 0, PUG.w, PUG.h, PUG.plane, PUG.y0 + PUG.w - 1, PUG.zTop);

    // floor pass: light pools, mirrored reflections (clipped to the floor), shadows
    Cabinets.drawFloorGlow(b, g, t);
    b.save();
    b.beginPath();
    const fp = this.floorPoly;
    b.moveTo(fp[0][0], fp[0][1]); for (let i = 1; i < 4; i++) b.lineTo(fp[i][0], fp[i][1]); b.closePath();
    b.clip();
    for (const p of this.props){
      const o = this.iso(p.tx, p.ty);
      const spr = p.frames ? p.frames[(t * 2.2 | 0) % p.frames.length] : p.spr;
      this.drawRefl(b, spr, Math.round(o[0] + spr.ox), Math.round(o[1] + spr.oy));
    }
    Cabinets.drawReflections(b, this);
    player.drawRefl(b, this);
    b.restore();
    b.setTransform(1, 0, 0, 1, -ix, -iy);
    this.drawPuddle(b, t);
    this.drawMarker(b, t);
    player.drawShadow(b);

    const items = [];
    Cabinets.collectDrawables(items, t);
    for (const p of this.props) items.push({ depth: p.depth, foot: p.foot, draw: () => this.drawProp(b, g, p, t) });
    for (const gf of ghostFrames) items.push({ depth: gf.x + gf.y, draw: () => Player.drawSprite(b, g, gf.x, gf.y, gf.f, gf.phase, true, t) });
    const back = [], front = [];
    for (const it of items){
      if (it.foot && this.structOccludesPlayer(it.foot, player.x, player.y)) front.push(it); else back.push(it);
    }
    back.sort((a, c) => a.depth - c.depth);
    front.sort((a, c) => a.depth - c.depth);
    for (const it of back) it.draw();
    player.draw(b, g, t);
    for (const it of front) it.draw();

    // foreground: the front drop + railing covers anyone walking behind it
    b.drawImage(this.fgCv, this.SX0, this.SY0);
    g.drawImage(this.fgSil, this.SX0, this.SY0);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(this.staticGlow, this.SX0, this.SY0);
    g.globalCompositeOperation = 'source-over';

    this.drawParticles(b, g, t);
    Cabinets.drawFx(b, g, t);
    player.drawTag(b, t);

    if (this.flash > .01){
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = 'lighter';
      b.fillStyle = 'rgba(120,140,220,' + (this.flash * .22).toFixed(3) + ')';
      b.fillRect(0, 0, bw, bh);
      b.globalCompositeOperation = 'source-over';
    }

    const v = this.vctx, S = K * this.dpr;
    const dx = (ix - left) * S, dy = (iy - top) * S;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.globalCompositeOperation = 'source-over';
    v.globalAlpha = 1;
    v.imageSmoothingEnabled = false;
    v.drawImage(this.buf, 0, 0, bw, bh, dx, dy, bw * S, bh * S);

    const g1 = this.g1c, g2 = this.g2c;
    const w1 = Math.ceil(bw / 3), h1 = Math.ceil(bh / 3), w2 = Math.ceil(bw / 8), h2 = Math.ceil(bh / 8);
    g1.imageSmoothingEnabled = true; g2.imageSmoothingEnabled = true;
    g1.globalCompositeOperation = 'copy'; g2.globalCompositeOperation = 'copy';
    g1.drawImage(this.glow, 0, 0, bw, bh, 0, 0, w1, h1);
    g2.drawImage(this.g1, 0, 0, w1, h1, 0, 0, w2, h2);
    v.globalCompositeOperation = 'lighter';
    v.imageSmoothingEnabled = true;
    v.globalAlpha = .45;
    v.drawImage(this.g1, 0, 0, w1, h1, dx, dy, w1 * 3 * S, h1 * 3 * S);
    v.globalAlpha = .5;
    v.drawImage(this.g2, 0, 0, w2, h2, dx, dy, w2 * 8 * S, h2 * 8 * S);
    v.globalAlpha = 1;
    v.globalCompositeOperation = 'source-over';
    v.drawImage(this.vignette, 0, 0);
  },

  drawProp(b, g, p, t){
    const o = this.iso(p.tx, p.ty);
    const spr = p.frames ? p.frames[(t * 2.2 | 0) % p.frames.length] : p.spr;
    const x = Math.round(o[0] + spr.ox), y = Math.round(o[1] + spr.oy);
    b.drawImage(spr.cv, x, y);
    g.drawImage(spr.sil, x, y);
    if (spr.glow){ g.globalCompositeOperation = 'lighter'; g.drawImage(spr.glow, x, y); g.globalCompositeOperation = 'source-over'; }
    if (p.kind === 'claw') this.drawClawArm(b, p, t);
  },

  drawClawArm(b, p, t){
    const bx = p.tx * T, by = p.ty * T, cl = this.claw;
    const cx = bx + 4 + (Math.sin(t * .45 + 1) * .5 + .5) * 8, cy = by + 4 + (Math.cos(t * .33) * .5 + .5) * 8;
    let drop = 0;
    if (cl.phase > 0){ const q = cl.phase; drop = (q < .4 ? q / .4 : q < .6 ? 1 : 1 - (q - .6) / .4) * 22; }
    const zt = 53, zc = zt - 3 - drop;
    b.fillStyle = '#cfd8ff';
    for (let z = zt; z > zc; z--){ const s = PX.proj(cx, cy, z); b.fillRect(Math.round(s[0]), Math.round(s[1]), 1, 1); }
    const s = PX.proj(cx, cy, zc), X = Math.round(s[0]), Y = Math.round(s[1]);
    const open = cl.phase > .3 && cl.phase < .55 ? 0 : 1;
    b.fillStyle = '#e8ecff'; b.fillRect(X - 1, Y, 3, 1);
    b.fillStyle = '#9aa2d0'; b.fillRect(X - 1 - open, Y + 1, 1, 2); b.fillRect(X + 1 + open, Y + 1, 1, 2);
  },

  drawPuddle(b, t){
    for (let i = 0; i < 4; i++){
      const x = 140 + Math.sin(t * .8 + i * 2) * 8, y = 44 + Math.cos(t * 1.1 + i) * 3;
      const s = PX.proj(x, y, 0);
      b.fillStyle = 'rgba(170,200,255,' + (.2 + .2 * Math.sin(t * 2 + i)).toFixed(2) + ')';
      b.fillRect(Math.round(s[0]), Math.round(s[1]), 2, 1);
    }
  },

  drawMarker(b, t){
    const m = this.marker; if (!m) return;
    const k = m.age / .8, p = this.iso(m.x, m.y), r = Math.round(3 + k * 7);
    b.globalAlpha = (1 - k) * .9;
    b.fillStyle = '#7fb4ff';
    const X = Math.round(p[0]), Y = Math.round(p[1]);
    for (let i = 0; i <= r * 2; i++){
      const hy = Math.round(i / 2);
      b.fillRect(X - r * 2 + i, Y - hy, 1, 1); b.fillRect(X - r * 2 + i, Y + hy, 1, 1);
      b.fillRect(X + r * 2 - i, Y - hy, 1, 1); b.fillRect(X + r * 2 - i, Y + hy, 1, 1);
    }
    b.globalAlpha = 1;
  },

  drawParticles(b, g, t){
    const NC = ['#ff3df0', '#2fd6e0', '#ffd23f'];
    for (const n of this.notes){
      const p = this.iso(n.x + Math.sin(t * 2 + n.ph) * .15, n.y);
      const a = Math.max(0, 1 - n.age / 2.6);
      b.globalAlpha = a; g.globalAlpha = a;
      const col = NC[(n.ph * 3 | 0) % 3];
      PX.text(b, '♪', p[0], p[1] - n.h, col); PX.text(g, '♪', p[0], p[1] - n.h, col);
    }
    b.globalAlpha = 1; g.globalAlpha = 1;
    for (const s of this.steam){
      const p = this.iso(s.x, s.y);
      b.globalAlpha = .5 * (1 - s.age / 1.6);
      b.fillStyle = '#e8e4f0';
      b.fillRect(Math.round(p[0] + Math.sin(s.age * 5 + s.x * 9) * 1.5), Math.round(p[1] - s.h), 1, 1);
    }
    b.fillStyle = '#9ab8f0';
    for (const s of this.splash){
      const p = this.iso(s.x, s.y);
      b.globalAlpha = .6 * this.doorOpen;
      b.fillRect(Math.round(p[0]), Math.round(p[1] - s.h), 1, 2);
    }
    b.fillStyle = '#ffe6c0';
    for (const m of this.motes){
      const p = this.iso(m.x, m.y);
      b.globalAlpha = .12 + .1 * Math.sin(t * 1.3 + m.ph);
      b.fillRect(Math.round(p[0]), Math.round(p[1] - m.h), 1, 1);
    }
    b.globalAlpha = 1;
  },

  structOccludesPlayer(foot, px, py){
    const x0 = foot[0], y0 = foot[1], x1 = foot[2], y1 = foot[3];
    const c = px - py, HALF = .45;
    if (c + HALF <= x0 - y1 || c - HALF >= x1 - y0) return false;
    let nx = Math.min(x1, c + y1);
    if (nx < x0) nx = x0;
    return px + py < 2 * nx - c - .05;
  },
};

World.glowBlob = function(hex, rx, ry){
  const cv = PX.canvas(rx * 2, ry * 2), c = cv.getContext('2d');
  const R = PX.ramp(hex, 7);
  for (let y = 0; y < ry * 2; y++) for (let x = 0; x < rx * 2; x++){
    const dx = (x + .5 - rx) / rx, dy = (y + .5 - ry) / ry, d = Math.sqrt(dx * dx + dy * dy);
    if (d >= 1) continue;
    const k = Math.floor((1 - d) * 3.2 + PX.bayer(x, y) - .5);
    if (k <= 0) continue;
    c.fillStyle = PX.css(R[Math.min(3, k)]);
    c.fillRect(x, y, 1, 1);
  }
  return cv;
};
})();
