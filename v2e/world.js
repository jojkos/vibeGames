/* world.js — tile map, iso renderer, lighting, props, rain, sign.
   Exposes window.World. Zero libraries, draws into the low-res buffer.
   Geometry derives from CFG.GW/GH (set by the layout generator) and the
   buffer from CFG.BW/BH (set from the viewport — fullscreen). */
(function(){
'use strict';
const { TW, TH, GW, GH, BASE_ZOOM } = window.CFG;
const TW2 = TW / 2, TH2 = TH / 2;
const WALL_H = 46;                      // back wall height (px)
const RIM_H = 7;                        // front/right baseboard rim
const SOX = GH * TW2 + 8;               // static layer origin offset
const SOY = 66;
const STATIC_W = (GW + GH) * TW2 + 16;
const STATIC_H = SOY + (GW + GH) * TH2 + 24;
const SIGN_TEXT = "JOJKO'S GAMES";
// camera clamp bounds (world iso extents)
const CAM_MIN_X = -GH * TW2 + 4, CAM_MAX_X = GW * TW2 - 4;
const CAM_MIN_Y = -WALL_H - 16,  CAM_MAX_Y = (GW + GH) * TH2 + 14;

// seeded PRNG (shared by world + cabinets + audio for stable visuals)
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- pixel posters
// char → color maps; '.' = transparent. Drawn 1:1 into wall shear space.
const POSTER_PAL = {
  k:'#14101e', K:'#262436', r:'#e0314b', R:'#8e2438', w:'#e8e4f0', W:'#9b94b8',
  y:'#ffd23f', t:'#d8a06a', d:'#5e3a22', g:'#3dff7a', c:'#2fd6e0', p:'#ff7ab8',
  b:'#3d7bff', o:'#ff9a3c', m:'#ff3df0', s:'#3a3a4e',
  P:'#f4b8c1', C:'#ead9b0', D:'#3a2a1c',
};
const POSTERS = {
  // PUG BANGER FIESTA logo — two stacked pugs in the pink circle (the real one)
  puglogo: { cap:'#f4b8c1', rows:[
    '.....kkkkkk.....',
    '...kkppppppkk...',
    '..kppppppppppk..',
    '.kpppCCCCCppppk.',
    '.kpCCCCCCCCDCpk.',
    'kppCCCCCCCCCCCpk',
    'kpCCpppCCCCCkCpk',
    'kppCCCCCCCCCCCpk',
    '.kpCCCCCCCCDCpk.',
    '.kpCCpCCpCCCCpk.',
    '..kpCCpCCpCCpk..',
    '...kkppppppkk...',
    '.....kkkkkk.....',
  ]},
  pokeball: { cap:'#e0314b', rows:[     // GOTTA PLAY 'EM
    '...rrrrrr...',
    '..rrrrrrrr..',
    '.rrrrrrrrrr.',
    '.rrrrrrrrrr.',
    'rrrrrrrrrrrr',
    'kkkkkwwkkkkk',
    'wwwwkwwkwwww',
    '.wwwwwwwwww.',
    '.wwwwwwwwww.',
    '..wwwwwwww..',
    '...wwwwww...',
  ]},
  pikachu: { cap:'#ffd23f', rows:[
    'k..........k',
    '.k........k.',
    '.yk......ky.',
    '..yy....yy..',
    '..yyyyyyyy..',
    '.yyyyyyyyyy.',
    '.ykyyyyyyky.',
    '.yyyykkyyyy.',
    '.ryyyyyyyyr.',
    '..yyyyyyyy..',
    '...yyyyyy...',
  ]},
  vader: { cap:'#9b94b8', rows:[        // MAY THE COIN BE WITH YOU
    '...kkkk...',
    '.kkkkkkkk.',
    'kkkkkkkkkk',
    'kkkkkkkkkk',
    'kkskkkkskk',
    'kkkkkkkkkk',
    '.kkskkskk.',
    '.kksssskk.',
    '..kksskk..',
    '..kkkkkk..',
    '.kk....kk.',
  ]},
};

const World = window.World = {
  blocked: new Uint8Array(GW * GH),
  cam: { x: 48, y: 96, z: BASE_ZOOM, tz: BASE_ZOOM },
  mulberry32,
  WALL_H,
  POSTERS,                               // pixel-art posters (cabinets borrow these)

  iso(x, y){ return [ (x - y) * TW2, (x + y) * TH2 ]; },
  unproject(sx, sy){
    const a = sx / TW2, b = sy / TH2;
    return [ (a + b) / 2, (b - a) / 2 ];
  },

  block(tx, ty){
    if (tx >= 0 && ty >= 0 && tx < GW && ty < GH) this.blocked[ty * GW + tx] = 1;
  },
  isBlocked(tx, ty){
    if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return true;
    return this.blocked[ty * GW + tx] === 1;
  },

  setTargetZoom(z){ this.cam.tz = z; },

  // ---- state ----
  ctx: null,
  crispCv: null, crispCtx: null,
  staticCv: null, lightCv: null, lightCtx: null, vignette: null,
  drops: [], motes: [], notes: [],
  thunderIn: 6, flash: 0, signT: 0,
  machines: [],
  claw: { tx: GW - 2, ty: 9, phase: 0, dropIn: 7, drift: 0 },
  juke: { tx: GW - 2, ty: 11, noteIn: 1 },
  // free-standing HI-SCORE board: end of the first center cabinet row,
  // facing the camera like its cabinet neighbours — provably overlaps nothing
  board: { tx: GW - 5, ty: 5 },
  walker: { active: false, p: 0, dir: 1, nextIn: 14 },
  marker: null,                          // click destination ping
  attract: false, attractT: 0,

  // ----------------------------------------------------------------- init
  init(){
    const canvas = document.getElementById('view');
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // walls blocked
    for (let x = 0; x < GW; x++){ this.block(x, 0); this.block(x, GH - 1); }
    for (let y = 0; y < GH; y++){ this.block(0, y); this.block(GW - 1, y); }

    // decor machines (snack + change) on the right side
    this.machines = [
      { tx: GW - 2, ty: 4, body: '#8e2438', win: '#ffd23f', stripe: '#ff4757', kind: 'snack'  },
      { tx: GW - 2, ty: 6, body: '#1f6e46', win: '#9dffd0', stripe: '#3dff7a', kind: 'change' },
    ];
    for (const m of this.machines) this.block(m.tx, m.ty);
    this.block(this.claw.tx, this.claw.ty);
    this.block(this.juke.tx, this.juke.ty);
    this.block(this.board.tx, this.board.ty);
    this.block(this.board.tx + 1, this.board.ty);

    // rain drops, window-local space
    const rng = mulberry32(777);
    for (let i = 0; i < 16; i++){
      this.drops.push({ x: rng() * 34, y: rng() * 24, spd: 26 + rng() * 34, len: 3 + rng() * 4 });
    }
    // dust motes (world coords + height)
    for (let i = 0; i < 26; i++){
      this.motes.push({
        x: 1 + rng() * (GW - 2), y: 1 + rng() * (GH - 2),
        h: 4 + rng() * 26, vx: (rng() - .5) * .12, vh: .5 + rng() * .8, ph: rng() * 7
      });
    }

    this.prerenderStatic();
    this.resize();

    // camera starts at hall center (set properly first frame)
    const c = this.iso(GW / 2, GH / 2);
    this.cam.x = c[0]; this.cam.y = c[1] - 16;
  },

  // (re)create buffer-sized layers — called on viewport resize too
  resize(){
    const BW = CFG.BW, BH = CFG.BH;
    this.lightCv = document.createElement('canvas');
    this.lightCv.width = BW; this.lightCv.height = BH;
    this.lightCtx = this.lightCv.getContext('2d');
    const cv = document.createElement('canvas');
    cv.width = BW; cv.height = BH;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(BW / 2, BH / 2, BH * .45, BW / 2, BH / 2, BW * .62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.42)');
    c.fillStyle = g;
    c.fillRect(0, 0, BW, BH);
    this.vignette = cv;
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  },

  setCrisp(canvas){
    this.crispCv = canvas;
    this.crispCtx = canvas.getContext('2d');
  },

  setMarker(wx, wy){ this.marker = { x: wx, y: wy, age: 0 }; },
  setAttract(on){
    if (on && !this.attract) this.attractT = 0;
    this.attract = on;
  },

  // sheared drawing helper: local x runs along the wall, local -y is up
  shear(c, ox, oy, slope){ c.save(); c.translate(ox, oy); c.transform(1, slope, 0, 1, 0, 0); },

  /* drawPoster(c, x, yTop, art, taped) — framed wall poster, or (taped=true)
     a frameless "taped-on" version used on cabinet sides. */
  drawPoster(c, x, yTop, art, taped){
    const rows = art.rows, w = rows[0].length, h = rows.length;
    if (taped){
      c.fillStyle = 'rgba(8,5,15,.55)';                 // paper backing
      c.fillRect(x - 1, yTop - 1, w + 2, h + 2);
    } else {
      c.fillStyle = '#0a0712';
      c.fillRect(x - 2, yTop - 2, w + 4, h + 7);
      c.strokeStyle = '#3a2b52';
      c.strokeRect(x - 1.5, yTop - 1.5, w + 3, h + 6);
    }
    for (let ry = 0; ry < h; ry++){
      const row = rows[ry];
      for (let rx = 0; rx < w; rx++){
        const ch = row[rx];
        if (ch === '.') continue;
        c.fillStyle = POSTER_PAL[ch] || '#fff';
        c.fillRect(x + rx, yTop + ry, 1, 1);
      }
    }
    if (taped){
      c.fillStyle = 'rgba(255,255,255,.35)';            // tape corners
      c.fillRect(x - 1, yTop - 1, 2, 1);
      c.fillRect(x + w - 1, yTop + h, 2, 1);
    } else {
      // caption bars (abstract "text")
      c.fillStyle = art.cap;
      c.fillRect(x, yTop + h + 1, w, 1);
      c.fillStyle = '#5d4a7d';
      c.fillRect(x, yTop + h + 3, Math.max(3, w - 4), 1);
    }
  },

  // ----------------------------------------------------------------- static layer
  prerenderStatic(){
    const cv = document.createElement('canvas');
    cv.width = STATIC_W; cv.height = STATIC_H;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.translate(SOX, SOY);
    const rng = mulberry32(1337);
    const SPECK = ['#ff5fa2', '#2fd6e0', '#ffd23f', '#9b5cff', '#3dff7a'];

    // --- checkerboard carpet ---
    for (let y = 0; y < GH; y++){
      for (let x = 0; x < GW; x++){
        const p = this.iso(x, y);
        c.beginPath();
        c.moveTo(p[0] + TW2, p[1]);
        c.lineTo(p[0] + TW, p[1] + TH2);
        c.lineTo(p[0] + TW2, p[1] + TH);
        c.lineTo(p[0], p[1] + TH2);
        c.closePath();
        c.fillStyle = ((x + y) & 1) ? '#2a2040' : '#221a35';
        c.fill();
        c.strokeStyle = 'rgba(10,6,20,.45)';
        c.lineWidth = 1;
        c.stroke();
        // 80s carpet confetti specks
        if (rng() < .45){
          const n = 1 + (rng() * 2 | 0);
          for (let i = 0; i < n; i++){
            c.fillStyle = SPECK[rng() * SPECK.length | 0];
            c.globalAlpha = .35;
            c.fillRect(p[0] + TW2 - 5 + rng() * 10, p[1] + 2 + rng() * (TH - 4), 1, 1);
            c.globalAlpha = 1;
          }
        }
      }
    }
    // doormat by the entrance
    for (const mx of [8, 9]){
      const p = this.iso(mx, 1);
      c.beginPath();
      c.moveTo(p[0] + TW2, p[1] + 1.5);
      c.lineTo(p[0] + TW - 2, p[1] + TH2);
      c.lineTo(p[0] + TW2, p[1] + TH - 1.5);
      c.lineTo(p[0] + 2, p[1] + TH2);
      c.closePath();
      c.fillStyle = '#46365e'; c.fill();
      c.strokeStyle = '#5d4a7d'; c.stroke();
    }
    // scuff marks in front of cabinets (worn carpet)
    if (window.CFG.LAYOUT){
      for (const L of CFG.LAYOUT){
        const fp = L.f === 'S' ? [L.tx + 1, L.ty + 1.8] : [L.tx + 1.8, L.ty + 1];
        const p = this.iso(fp[0], fp[1]);
        c.fillStyle = 'rgba(0,0,0,.22)';
        for (let i = 0; i < 5; i++){
          c.fillRect(p[0] - 4 + rng() * 8 | 0, p[1] - 2 + rng() * 4 | 0, 1, 1);
        }
      }
    }
    // rain puddle just inside the door
    {
      const p = this.iso(8.8, 2.25);
      c.fillStyle = 'rgba(60,85,150,.30)';
      c.beginPath();
      c.ellipse(p[0], p[1], 11, 4, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(120,150,220,.18)';
      c.beginPath();
      c.ellipse(p[0] - 2, p[1] - 1, 6, 2, 0, 0, Math.PI * 2);
      c.fill();
    }

    // --- back wall (along y=0), local x = tile_x * TW2 ---
    this.shear(c, 0, 0, .5);
    c.fillStyle = '#191226';
    c.fillRect(0, -WALL_H, GW * TW2, WALL_H);
    // panel seams
    c.fillStyle = 'rgba(0,0,0,.3)';
    for (let x = 2; x < GW; x += 2) c.fillRect(x * TW2, -WALL_H, 1, WALL_H);
    // neon strips
    c.fillStyle = '#ff3df0'; c.fillRect(0, -34, GW * TW2, 1);
    c.fillStyle = 'rgba(255,61,240,.28)'; c.fillRect(0, -35, GW * TW2, 3);
    c.fillStyle = '#2fd6e0'; c.fillRect(0, -10, GW * TW2, 1);
    c.fillStyle = 'rgba(47,214,224,.25)'; c.fillRect(0, -11, GW * TW2, 3);
    // baseboard
    c.fillStyle = '#0e0917'; c.fillRect(0, -4, GW * TW2, 4);

    // door (tiles x 8..9 -> local 96..120)
    c.fillStyle = '#0b0714'; c.fillRect(97, -40, 22, 40);          // opening
    c.fillStyle = '#241a38'; c.fillRect(96, -41, 24, 2);           // lintel
    c.fillStyle = '#241a38'; c.fillRect(96, -41, 2, 41); c.fillRect(118, -41, 2, 41);
    c.fillStyle = '#141d36'; c.fillRect(100, -36, 7, 30); c.fillRect(109, -36, 7, 30); // door glass
    c.fillStyle = '#3a2b52'; c.fillRect(107, -36, 2, 30);          // middle stile
    c.fillStyle = '#ffd23f'; c.fillRect(102, -20, 3, 1); c.fillRect(111, -20, 3, 1);   // handles

    // window frame (tiles 10..12 -> local 120..156), glass drawn per-frame
    c.fillStyle = '#241a38'; c.fillRect(119, -41, 39, 30);
    c.fillStyle = '#0b0714'; c.fillRect(121, -39, 35, 26);
    c.fillStyle = '#241a38'; c.fillRect(137, -39, 2, 26);          // mullion
    c.fillStyle = '#322447'; c.fillRect(119, -12, 39, 3);          // sill

    // sign backboard above the entrance
    c.fillStyle = '#0d0716'; c.fillRect(92, -58, 72, 15);
    c.strokeStyle = '#3a2b52'; c.strokeRect(92.5, -57.5, 71, 14);

    // (back-wall gaps stay bare — cabinets lean over them visually; the mini
    //  posters live on camera-facing cabinet sides instead, see cabinets.js)
    c.restore();

    // --- left wall (along x=0), drawn from iso(0,GH) toward iso(0,0) ---
    const lw = this.iso(0, GH);
    this.shear(c, lw[0], lw[1], -.5);
    c.fillStyle = '#140e20';
    c.fillRect(0, -WALL_H, GH * TW2, WALL_H);
    c.fillStyle = 'rgba(0,0,0,.3)';
    for (let y = 2; y < GH; y += 2) c.fillRect(y * TW2, -WALL_H, 1, WALL_H);
    c.fillStyle = '#b32da8'; c.fillRect(0, -34, GH * TW2, 1);
    c.fillStyle = 'rgba(179,45,168,.22)'; c.fillRect(0, -35, GH * TW2, 3);
    c.fillStyle = '#1e9aa3'; c.fillRect(0, -10, GH * TW2, 1);
    c.fillStyle = '#0c0813'; c.fillRect(0, -4, GH * TW2, 4);
    // hero posters — only in spots cabinets can never lean over:
    // the PUG BANGER FIESTA logo by the front rim, vader in the deep back corner
    this.drawPoster(c, 3, -37, POSTERS.puglogo);
    this.drawPoster(c, GH * TW2 - 28, -33, POSTERS.vader);
    c.restore();

    // --- front rim (along y=GH) ---
    this.shear(c, lw[0], lw[1], .5);
    c.fillStyle = '#241a38'; c.fillRect(0, -RIM_H, GW * TW2, RIM_H);
    c.fillStyle = '#3a2b52'; c.fillRect(0, -RIM_H, GW * TW2, 1);
    c.fillStyle = '#0b0714'; c.fillRect(0, 0, GW * TW2, 5);
    c.restore();
    // --- right rim (along x=GW) ---
    const rr = this.iso(GW, GH);
    this.shear(c, rr[0], rr[1], -.5);
    c.fillStyle = '#1c1430'; c.fillRect(0, -RIM_H, GH * TW2, RIM_H);
    c.fillStyle = '#2c2148'; c.fillRect(0, -RIM_H, GH * TW2, 1);
    c.fillStyle = '#0b0714'; c.fillRect(0, 0, GH * TW2, 5);
    c.restore();

    this.staticCv = cv;
  },

  // ----------------------------------------------------------------- helpers
  // generic 1-tile vending box (also used by cabinets.js for the coffee machine)
  drawVendingBox(c, tx, ty, pal, t, litWin){
    const o = this.iso(tx, ty + 1);          // front face west corner
    const H = 30;
    // front face
    this.shear(c, o[0], o[1], .5);
    c.fillStyle = pal.body; c.fillRect(0, -H, TW2, H);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, -H, TW2, 2);
    c.fillStyle = pal.stripe; c.fillRect(0, -H + 2, TW2, 3);                 // lit header
    c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(1, -H + 2, TW2 - 2, 1);
    c.fillStyle = litWin ? pal.win : '#0d0a16';                              // window
    c.globalAlpha = litWin ? .9 : 1; c.fillRect(2, -H + 7, 8, 12); c.globalAlpha = 1;
    if (litWin){                                                             // item rows
      c.fillStyle = 'rgba(0,0,0,.45)';
      for (let r = 0; r < 3; r++) c.fillRect(2, -H + 10 + r * 4, 8, 1);
    }
    c.fillStyle = '#0d0a16'; c.fillRect(3, -9, 6, 4);                        // dispenser
    c.fillStyle = '#ffd23f'; c.fillRect(9, -H + 8, 1, 2);                    // coin slot
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, -2, TW2, 2);
    c.restore();
    // side face
    const s = this.iso(tx + 1, ty + 1);
    this.shear(c, s[0], s[1], -.5);
    c.fillStyle = pal.side || 'rgba(0,0,0,.55)';
    c.fillRect(0, -H, TW2, H);
    c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, -H, TW2, 1);
    c.restore();
    // top
    const p0 = this.iso(tx, ty), p1 = this.iso(tx + 1, ty), p2 = this.iso(tx + 1, ty + 1), p3 = this.iso(tx, ty + 1);
    c.beginPath();
    c.moveTo(p0[0], p0[1] - H); c.lineTo(p1[0], p1[1] - H);
    c.lineTo(p2[0], p2[1] - H); c.lineTo(p3[0], p3[1] - H);
    c.closePath();
    c.fillStyle = '#100b1c'; c.fill();
  },

  // claw machine — glass box, drifting gantry claw, occasional hopeless grab
  drawClaw(c, t){
    const m = this.claw;
    const o = this.iso(m.tx, m.ty + 1);
    const H = 36;
    this.shear(c, o[0], o[1], .5);
    // body + glass
    c.fillStyle = '#3d2b5e'; c.fillRect(0, -H, TW2, H);
    c.fillStyle = '#ff7ab8'; c.fillRect(0, -H, TW2, 2);              // lit header
    c.fillStyle = '#0f1a2e'; c.fillRect(1, -H + 3, TW2 - 2, 22);     // glass
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(2, -H + 3, 2, 22);
    // prize pile
    const PR = ['#ffd23f', '#3dff7a', '#ff4757', '#2fd6e0'];
    for (let i = 0; i < 4; i++){
      c.fillStyle = PR[i];
      c.fillRect(2 + i * 2, -H + 21 + (i % 2), 2, 2);
    }
    // gantry + claw
    c.fillStyle = '#9b94b8'; c.fillRect(1, -H + 4, TW2 - 2, 1);
    const cx = 3 + (Math.sin(t * .4 + 1) * .5 + .5) * (TW2 - 7);
    let drop = 0;
    if (m.phase > 0){                                                // dropping animation
      const p = m.phase;
      drop = p < .42 ? p / .42 : p < .58 ? 1 : 1 - (p - .58) / .42;
      drop *= 13;
    }
    c.fillStyle = '#cfd8ff';
    c.fillRect(cx + 1, -H + 5, 1, 2 + drop);                         // cable
    c.fillRect(cx, -H + 7 + drop, 1, 2);                             // claw fingers
    c.fillRect(cx + 2, -H + 7 + drop, 1, 2);
    // coin slot + base
    c.fillStyle = '#ffd23f'; c.fillRect(TW2 - 3, -9, 1, 2);
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, -2, TW2, 2);
    c.restore();
    // side + top
    const s = this.iso(m.tx + 1, m.ty + 1);
    this.shear(c, s[0], s[1], -.5);
    c.fillStyle = '#241a38'; c.fillRect(0, -H, TW2, H);
    c.restore();
    const p0 = this.iso(m.tx, m.ty), p1 = this.iso(m.tx + 1, m.ty), p2 = this.iso(m.tx + 1, m.ty + 1), p3 = this.iso(m.tx, m.ty + 1);
    c.beginPath();
    c.moveTo(p0[0], p0[1] - H); c.lineTo(p1[0], p1[1] - H);
    c.lineTo(p2[0], p2[1] - H); c.lineTo(p3[0], p3[1] - H);
    c.closePath();
    c.fillStyle = '#100b1c'; c.fill();
  },

  // jukebox — lit arch, pumping grill, floating notes
  drawJuke(c, t){
    const m = this.juke;
    const o = this.iso(m.tx, m.ty + 1);
    const H = 28;
    this.shear(c, o[0], o[1], .5);
    c.fillStyle = '#5e2b4a'; c.fillRect(0, -H, TW2, H);
    // stepped arch top
    c.fillStyle = '#7a3a60';
    c.fillRect(1, -H - 2, TW2 - 2, 2);
    c.fillRect(3, -H - 4, TW2 - 6, 2);
    // animated arch lights
    const ARC = ['#ff3df0', '#2fd6e0', '#ffd23f'];
    for (let i = 0; i < 5; i++){
      c.fillStyle = ARC[(i + (t * 3 | 0)) % 3];
      c.fillRect(1 + i * 2, -H - 1, 1, 1);
    }
    // grill + window
    c.fillStyle = '#ffb45c'; c.globalAlpha = .85;
    c.fillRect(2, -H + 3, 8, 5); c.globalAlpha = 1;
    c.fillStyle = '#1a0d16';
    c.fillRect(2, -H + 10, 8, 12);
    c.fillStyle = '#3a2030';
    for (let i = 0; i < 4; i++) c.fillRect(3, -H + 11 + i * 3, 6, 1);
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, -2, TW2, 2);
    c.restore();
    const s = this.iso(m.tx + 1, m.ty + 1);
    this.shear(c, s[0], s[1], -.5);
    c.fillStyle = '#3a1c30'; c.fillRect(0, -H, TW2, H);
    c.restore();
    const p0 = this.iso(m.tx, m.ty), p1 = this.iso(m.tx + 1, m.ty), p2 = this.iso(m.tx + 1, m.ty + 1), p3 = this.iso(m.tx, m.ty + 1);
    c.beginPath();
    c.moveTo(p0[0], p0[1] - H - 3); c.lineTo(p1[0], p1[1] - H - 3);
    c.lineTo(p2[0], p2[1] - H - 3); c.lineTo(p3[0], p3[1] - H - 3);
    c.closePath();
    c.fillStyle = '#2a1424'; c.fill();
  },

  // ----------------------------------------------------------------- per-frame
  update(dt, t){
    // thunder
    this.thunderIn -= dt;
    if (this.thunderIn <= 0){
      this.thunderIn = 9 + Math.random() * 12;
      this.flash = 1;
      if (window.AudioSys) AudioSys.thunder();
    }
    this.flash = Math.max(0, this.flash - dt * 1.6);
    // rain
    for (const d of this.drops){
      d.y += d.spd * dt;
      if (d.y > 24){ d.y = -d.len; d.x = Math.random() * 34; }
    }
    // motes
    for (const m of this.motes){
      m.x += m.vx * dt; m.h += Math.sin(t * .6 + m.ph) * dt * m.vh;
      if (m.x < 1) m.x = GW - 2; if (m.x > GW - 2) m.x = 1;
      if (m.h < 3) m.h = 3; if (m.h > 34) m.h = 34;
    }
    this.signT += dt;
    // claw machine grab cycle
    const cl = this.claw;
    if (cl.phase > 0){
      cl.phase += dt / 2.4;
      if (cl.phase >= 1) cl.phase = 0;
    } else {
      cl.dropIn -= dt;
      if (cl.dropIn <= 0){ cl.dropIn = 8 + Math.random() * 8; cl.phase = .001; }
    }
    // jukebox notes
    const jk = this.juke;
    jk.noteIn -= dt;
    if (jk.noteIn <= 0){
      jk.noteIn = 1.1 + Math.random() * .8;
      this.notes.push({ x: jk.tx + .4, y: jk.ty + .5, h: 30, age: 0, ph: Math.random() * 6 });
    }
    for (let i = this.notes.length - 1; i >= 0; i--){
      const n = this.notes[i];
      n.age += dt; n.h += dt * 9;
      if (n.age > 2.4) this.notes.splice(i, 1);
    }
    // window passer-by
    const wk = this.walker;
    if (wk.active){
      wk.p += dt / 4.5;
      if (wk.p >= 1) wk.active = false;
    } else {
      wk.nextIn -= dt;
      if (wk.nextIn <= 0){
        wk.nextIn = 16 + Math.random() * 26;
        wk.active = true; wk.p = 0; wk.dir = Math.random() < .5 ? 1 : -1;
      }
    }
    // click marker
    if (this.marker){
      this.marker.age += dt;
      if (this.marker.age > .7) this.marker = null;
    }
    if (this.attract) this.attractT += dt;
  },

  applyCam(c){
    const cam = this.cam, BW = CFG.BW, BH = CFG.BH;
    c.setTransform(cam.z, 0, 0, cam.z, BW / 2 - cam.x * cam.z, BH / 2 - cam.y * cam.z);
  },

  screenToWorld(bx, by){
    const cam = this.cam, BW = CFG.BW, BH = CFG.BH;
    const ix = (bx - BW / 2) / cam.z + cam.x;
    const iy = (by - BH / 2) / cam.z + cam.y;
    return this.unproject(ix, iy);
  },

  updateCamera(dt, player){
    const cam = this.cam, BW = CFG.BW, BH = CFG.BH;
    const ov = window.Cabinets && Cabinets.getCamOverride();
    let tx, ty, tz;
    if (ov){ tx = ov.x; ty = ov.y; tz = ov.z; }
    else if (this.attract){
      // slow drift around the hall (idle attract mode)
      const cc = this.iso(GW / 2, GH / 2);
      tx = cc[0] + Math.sin(this.attractT * .12) * GW * TW2 * .30;
      ty = cc[1] - 14 + Math.cos(this.attractT * .08) * GH * TH2 * .5;
      tz = BASE_ZOOM * 1.02 + Math.sin(this.attractT * .05) * .06;
    } else {
      const p = this.iso(player.x, player.y);
      tx = p[0]; ty = p[1] - 14; tz = cam.tz;
    }
    if (!ov){
      // soft clamp to hall bounds
      const hw = BW / 2 / tz, hh = BH / 2 / tz;
      if (CAM_MAX_X - CAM_MIN_X > hw * 2) tx = Math.max(CAM_MIN_X + hw, Math.min(CAM_MAX_X - hw, tx));
      else tx = (CAM_MIN_X + CAM_MAX_X) / 2;
      if (CAM_MAX_Y - CAM_MIN_Y > hh * 2) ty = Math.max(CAM_MIN_Y + hh, Math.min(CAM_MAX_Y - hh, ty));
      else ty = (CAM_MIN_Y + CAM_MAX_Y) / 2;
    }
    const k = ov ? (ov.snap || .18) : Math.min(1, dt * (this.attract ? 1.2 : 5));
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.z += (tz - cam.z) * (ov ? k : Math.min(1, dt * 4));
  },

  // ----------------------------------------------------------------- render
  render(t, player, ghostFrames){
    const c = this.ctx, BW = CFG.BW, BH = CFG.BH;
    this.updateCamera(1 / 60, player);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#070410';
    c.fillRect(0, 0, BW, BH);

    this.applyCam(c);
    c.drawImage(this.staticCv, -SOX, -SOY);

    this.drawWindowRain(c, t);
    this.drawSign(c, t);
    this.drawPuddleShimmer(c, t);

    // depth-sorted entities
    const items = [];
    Cabinets.collectDrawables(items, t);
    for (const m of this.machines){
      const mm = m;
      items.push({ depth: mm.tx + mm.ty + 1, draw: (cc) => {
        this.drawVendingBox(cc, mm.tx, mm.ty, mm, t, true);
      }});
    }
    items.push({ depth: this.claw.tx + this.claw.ty + 1, draw: (cc) => this.drawClaw(cc, t) });
    items.push({ depth: this.juke.tx + this.juke.ty + 1, draw: (cc) => this.drawJuke(cc, t) });
    items.push({ depth: (this.board.tx + 1) + (this.board.ty + 1), draw: (cc) => this.drawScoreBoard(cc, t) });
    items.push({ depth: player.x + player.y, draw: (cc) => player.draw(cc, t) });
    for (const g of ghostFrames){
      items.push({ depth: g.x + g.y, draw: (cc) => Player.drawSprite(cc, g.x, g.y, g.f, g.phase, true, t) });
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw(c, t);

    this.drawNotes(c, t);
    this.drawMarker(c, t);
    Cabinets.drawFx(c, t);   // coin arc, INSERT COIN labels, screen messages

    this.drawLighting(c, t, player);
    this.drawMotes(c, t);

    // thunder flash wash
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flash > .01){
      const f = this.flash * (.75 + .25 * Math.sin(t * 47));
      c.fillStyle = 'rgba(175,195,255,' + (f * .16).toFixed(3) + ')';
      c.fillRect(0, 0, BW, BH);
    }
    c.drawImage(this.vignette, 0, 0);

    // crisp cabinet screens at device resolution (separate DOM layer)
    if (this.crispCtx){
      const cc = this.crispCtx, cv = this.crispCv;
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.clearRect(0, 0, cv.width, cv.height);
      const kx = cv.width / BW, ky = cv.height / BH;
      const cam = this.cam;
      cc.setTransform(kx * cam.z, 0, 0, ky * cam.z,
        kx * (BW / 2 - cam.x * cam.z), ky * (BH / 2 - cam.y * cam.z));
      cc.imageSmoothingEnabled = true;
      Cabinets.drawCrispScreens(cc, t);
    }
  },

  drawWindowRain(c, t){
    // glass + outside, in back-wall shear space (window local x 121..156)
    this.shear(c, 0, 0, .5);
    const f = this.flash;
    // outside sky
    c.fillStyle = f > .05 ? 'rgb(' + (18 + 120 * f | 0) + ',' + (24 + 130 * f | 0) + ',' + (50 + 160 * f | 0) + ')' : '#10172e';
    c.fillRect(121, -39, 35, 26);
    // skyline silhouette
    c.fillStyle = f > .05 ? 'rgba(8,8,20,.95)' : '#090d1d';
    c.fillRect(121, -21, 7, 8); c.fillRect(129, -26, 6, 13);
    c.fillRect(136, -18, 8, 5); c.fillRect(145, -24, 5, 11); c.fillRect(151, -19, 5, 6);
    c.fillStyle = '#ffd23f'; c.globalAlpha = .5;
    c.fillRect(131, -24, 1, 1); c.fillRect(146, -22, 1, 1); c.fillRect(133, -20, 1, 1);
    c.globalAlpha = 1;
    // passer-by with an umbrella (rare)
    const wk = this.walker;
    if (wk.active){
      const px = wk.dir > 0 ? 121 + wk.p * 38 - 3 : 156 - wk.p * 38;
      if (px > 119 && px < 154){
        c.fillStyle = '#06070f';
        const shuf = ((t * 7 | 0) % 2);
        c.fillRect(px, -22, 3, 7 - shuf);                 // body above the sill
        c.fillRect(px + 1, -24, 1, 2);                    // head
        c.fillRect(px - 1, -27, 5, 1);                    // umbrella
        c.fillRect(px, -26, 3, 1);
        c.fillRect(px + 1, -25, 1, 1);
      }
    }
    // OPEN 24/7 neon hanging in the window
    {
      const flick = Math.sin(t * 2.3) > .97 ? .25 : 1;
      c.font = 'bold 6px monospace';
      c.save();
      c.globalAlpha = .92 * flick;
      c.shadowColor = '#ff6ec7'; c.shadowBlur = 4;
      c.fillStyle = '#ff9adf';
      c.fillText('OPEN', 124, -30);
      c.shadowColor = '#2fd6e0';
      c.fillStyle = '#9df2f8';
      c.font = 'bold 5px monospace';
      c.fillText('24/7', 142, -23);
      c.restore();
    }
    // rain streaks
    c.strokeStyle = 'rgba(150,185,235,.55)';
    c.lineWidth = 1;
    c.beginPath();
    for (const d of this.drops){
      const dx = 121 + d.x, dy = -39 + d.y;
      if (dy > -14) continue;
      c.moveTo(dx, dy);
      c.lineTo(dx - .8, Math.min(-14, dy + d.len));
    }
    c.stroke();
    // glass sheen + mullion re-draw
    c.fillStyle = 'rgba(140,170,230,.07)'; c.fillRect(121, -39, 35, 26);
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(124, -39, 3, 26);
    c.fillStyle = '#241a38'; c.fillRect(137, -39, 2, 26);
    // faint rain through the door glass too
    if (f > .05){
      c.fillStyle = 'rgba(120,140,210,' + (f * .5).toFixed(2) + ')';
      c.fillRect(100, -36, 7, 30); c.fillRect(109, -36, 7, 30);
    }
    c.restore();
  },

  drawSign(c, t){
    this.shear(c, 0, 0, .5);
    c.font = 'bold 8px monospace';
    c.textBaseline = 'alphabetic';
    const T = this.signT;
    const total = c.measureText(SIGN_TEXT).width;
    let x = 128 - total / 2;
    const flickIdx = (Math.sin(t * 1.7) > .96) ? (t * 13 | 0) % SIGN_TEXT.length : -1;
    for (let i = 0; i < SIGN_TEXT.length; i++){
      const ch = SIGN_TEXT[i];
      const w = c.measureText(ch).width;
      const onAt = .5 + i * .13;
      let lit;
      if (T >= onAt) lit = true;
      else if (T > onAt - .3) lit = Math.random() < .4;   // pre-buzz flicker
      else lit = false;
      if (lit && i === flickIdx) lit = false;             // occasional buzz-off
      if (lit){
        c.save();
        c.shadowColor = '#ff3df0';
        c.shadowBlur = 5;
        c.fillStyle = '#ffb6f4';
        c.fillText(ch, x, -47);
        c.restore();
      } else {
        c.fillStyle = '#43113c';
        c.fillText(ch, x, -47);
      }
      x += w;
    }
    c.restore();
  },

  // free-standing HI-SCORE board, south-facing like the cabinet row it ends
  drawScoreBoard(c, t){
    const b = this.board;
    const o = this.iso(b.tx, b.ty + 1);        // front face, same math as 'S' cabinets
    const FACEW = TW;                          // 2 tiles wide → 24px face
    const H = 42;
    this.shear(c, o[0], o[1], .5);
    // legs + panel
    c.fillStyle = '#241a38';
    c.fillRect(2, -10, 2, 10); c.fillRect(FACEW - 4, -10, 2, 10);
    c.fillStyle = '#0d0716'; c.fillRect(0, -H, FACEW, H - 9);
    c.strokeStyle = '#5d4a7d'; c.strokeRect(.5, -H + .5, FACEW - 1, H - 10);
    // blinking border bulbs
    for (let i = 0; i < 6; i++){
      c.fillStyle = ((i + (t * 4 | 0)) % 3) === 0 ? '#ffd23f' : '#4a3a18';
      c.fillRect(2 + i * 4, -H + 2, 1, 1);
      c.fillRect(2 + i * 4, -12, 1, 1);
    }
    // panel content — clipped so nothing can escape the frame
    c.save();
    c.beginPath();
    c.rect(2, -H + 3, FACEW - 4, H - 14);
    c.clip();
    const IW = FACEW - 4;                      // inner width
    // title: squeeze-to-fit, centered (same trick as the cabinet marquees)
    c.font = 'bold 6px monospace';
    const tw = c.measureText('HI·SCORE').width;
    c.save();
    c.translate(2 + IW / 2, -H + 11);
    if (tw > IW) c.scale(IW / tw, 1);
    c.shadowColor = '#ffd23f'; c.shadowBlur = 3;
    c.fillStyle = '#ffd23f';
    c.fillText('HI·SCORE', -tw / 2, 0);
    c.restore();
    c.fillStyle = '#3a2b52'; c.fillRect(2, -H + 13, IW, 1);
    const top = (window.Cabinets && Cabinets.topScores) ? Cabinets.topScores(3) : [];
    c.font = '4px monospace';
    if (!top.length){
      c.fillStyle = (t * 1.4 % 1) < .6 ? '#9b8cc0' : '#5d4a7d';
      c.fillText('PLAY!', 8, -H + 22);
    } else {
      const COLS = ['#fff', '#cfd8ff', '#9b8cc0'];
      for (let i = 0; i < top.length; i++){
        c.fillStyle = i === 0 && (t * 2 % 1) < .7 ? '#ffd23f' : COLS[i];
        const nm = (i + 1) + ' ' + (top[i].short || '').slice(0, 5);
        const sc = String(top[i].n);
        c.fillText(nm, 3, -H + 21 + i * 7);
        c.fillText(sc, FACEW - 3 - c.measureText(sc).width, -H + 21 + i * 7);
      }
    }
    c.restore();
    c.restore();
    // thin side edge + shadow so it reads as standing furniture
    const s = this.iso(b.tx + 2, b.ty + 1);
    this.shear(c, s[0], s[1], -.5);
    c.fillStyle = '#191226'; c.fillRect(0, -H, 3, H - 9);
    c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, -H, 1, H - 9);
    c.restore();
  },

  drawPuddleShimmer(c, t){
    const p = this.iso(8.8, 2.25);
    c.fillStyle = 'rgba(150,185,235,' + (.18 + .12 * Math.sin(t * 2.1)).toFixed(3) + ')';
    c.fillRect(p[0] - 5 + Math.sin(t * .9) * 4 | 0, p[1] - 1, 2, 1);
    c.fillRect(p[0] + 2 + Math.sin(t * 1.3 + 2) * 3 | 0, p[1] + 1, 1, 1);
  },

  drawNotes(c, t){
    if (!this.notes.length) return;
    const COLS = ['#ff3df0', '#2fd6e0', '#ffd23f'];
    c.font = '6px monospace';
    for (const n of this.notes){
      const p = this.iso(n.x + Math.sin(t * 2 + n.ph) * .12, n.y);
      c.globalAlpha = Math.max(0, 1 - n.age / 2.4) * .8;
      c.fillStyle = COLS[(n.ph * 3 | 0) % 3];
      c.fillText('♪', p[0], p[1] - n.h);
    }
    c.globalAlpha = 1;
  },

  // click destination ping + a hint of the path ahead
  drawMarker(c, t){
    const m = this.marker;
    if (!m) return;
    const k = m.age / .7;
    const p = this.iso(m.x, m.y);
    const s = 3 + k * 9;
    c.globalAlpha = (1 - k) * .85;
    c.strokeStyle = '#7fb4ff';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(p[0], p[1] - s * .5);
    c.lineTo(p[0] + s, p[1]);
    c.lineTo(p[0], p[1] + s * .5);
    c.lineTo(p[0] - s, p[1]);
    c.closePath();
    c.stroke();
    // next few waypoints as fading dots
    if (window.Player && Player.path){
      c.fillStyle = '#7fb4ff';
      for (let i = 0; i < Math.min(4, Player.path.length); i++){
        const wp = Player.path[i];
        const q = this.iso(wp[0], wp[1]);
        c.globalAlpha = (1 - k) * .4;
        c.fillRect(q[0], q[1] - 1, 1, 1);
      }
    }
    c.globalAlpha = 1;
  },

  drawLighting(c, t, player){
    const lc = this.lightCtx, BW = CFG.BW, BH = CFG.BH;
    const cam = this.cam;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, BW, BH);
    lc.fillStyle = 'rgba(6,4,20,.6)';
    lc.fillRect(0, 0, BW, BH);
    lc.globalCompositeOperation = 'destination-out';
    lc.setTransform(cam.z, 0, 0, cam.z, BW / 2 - cam.x * cam.z, BH / 2 - cam.y * cam.z);

    const hole = (wx, wy, r, a) => {
      const p = this.iso(wx, wy);
      const g = lc.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      lc.fillStyle = g;
      lc.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
    };
    // ceiling lamp pools — generated from the hall size
    const lamps = [];
    for (let lx = 4.5; lx < GW - 2; lx += 6.5)
      for (let ly = 3; ly <= GH - 2.5; ly += 4.5) lamps.push([lx, ly]);
    for (const L of lamps) hole(L[0], L[1], 40, .55);
    // cabinet screen pools
    for (const cab of Cabinets.list()){
      hole(cab.frontPoint[0], cab.frontPoint[1], 24, .35 + cab.wake * .4 + cab.phantom * .25);
    }
    hole(player.x, player.y, 22, .5);
    // window spill + jukebox
    hole(11.5, 1.2, 30, .4 + this.flash * .5);
    hole(this.juke.tx + .5, this.juke.ty + .8, 20, .35);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.lightCv, 0, 0);

    // additive color glows
    this.applyCam(c);
    c.globalCompositeOperation = 'lighter';
    const glow = (wx, wy, r, color, a) => {
      const p = this.iso(wx, wy);
      const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = a;
      c.fillStyle = g;
      c.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
      c.globalAlpha = 1;
    };
    for (const L of lamps) glow(L[0], L[1], 34, '#ffb45c', .07);
    for (const cab of Cabinets.list()){
      glow(cab.frontPoint[0], cab.frontPoint[1], 25, cab.color, .08 + cab.wake * .14 + cab.phantom * .1);
    }
    glow(player.x, player.y, 16, '#ffb45c', .06);
    glow(this.juke.tx + .5, this.juke.ty + .8, 16, '#ff3df0', .09);
    c.globalCompositeOperation = 'source-over';
  },

  drawMotes(c, t){
    this.applyCam(c);
    c.fillStyle = '#cfd8ff';
    for (const m of this.motes){
      const p = this.iso(m.x, m.y);
      c.globalAlpha = .07 + .06 * Math.sin(t * 1.3 + m.ph);
      c.fillRect(p[0], p[1] - m.h, 1, 1);
    }
    c.globalAlpha = 1;
  },
};
})();
