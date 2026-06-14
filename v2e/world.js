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
  y:'#ffd23f', t:'#d8a06a', d:'#7a4a26', g:'#3dff7a', c:'#2fd6e0', p:'#ff7ab8',
  b:'#3d7bff', o:'#ff9a3c', m:'#ff3df0', s:'#5a5a72', e:'#1f8f46', n:'#10204a',
  u:'#7a4ddb', G:'#f2c14e', P:'#f4b8c1', C:'#efe0bb', D:'#3a2a1c', H:'#2a2030',
};
// Each poster is unique — assigned one-per-cabinet, no repeats. Rows may be
// ragged; drawPoster sizes to the widest row and skips '.' (transparent).
const POSTERS = {
  // PUG BANGER FIESTA — bold pug face in the pink ring (clearer than the
  // two-pug mush at this resolution; the real logo can be dropped in as a PNG)
  puglogo: { cap:'#f4b8c1', rows:[
    '....kkkkkkkk....',
    '..kkPPPPPPPPkk..',
    '.kPPPPPPPPPPPPk.',
    '.kPPCCkPPPPkCCPk',
    'kPPCCCkPPPPkCCCP',
    'kPPCCCCCCCCCCCPk',
    'kPPCCCCCCCCCCCPk',
    'kPPCCkkCCCCkkCPk',
    'kPPCCkkCCCCkkCPk',
    'kPPCCCCDDDDCCCPk',
    'kPPCCCDkkkkDCCPk',
    'kPPCCCDkkkkDCCPk',
    '.kPPCCCDDDDCCPk.',
    '.kPPPPCCCCPPPPk.',
    '..kkPPPPPPPPkk..',
    '....kkkkkkkk....',
  ]},
  // STAR WARS — Vader helmet, "MAY THE COIN BE WITH YOU"
  vader: { cap:'#9b94b8', rows:[
    '...kkkkkk...',
    '..kkkkkkkk..',
    '.kkkkkkkkkk.',
    'kkkKKKKKKkkk',
    'kkKKkkkkKKkk',
    'kkKKkkkkKKkk',
    'kkkKKKKKKkkk',
    'kkksskksskkk',
    'kkksskksskkk',
    '.kksssssskk.',
    '.kkkssssKkk.',
    '..kkkkkkkk..',
    '.kk......kk.',
  ]},
  pokeball: { cap:'#e0314b', rows:[
    '..wwwwww..',
    '.wrrrrrrw.',
    'wrrrrrrrrw',
    'wrrrrrrrrw',
    'wkkkkkkkkw',
    'kkkwwwwkkk',
    'kkwwsswwkk',
    'kkkwwwwkkk',
    'wkkkkkkkkw',
    'wwwwwwwwww',
    'wwwwwwwwww',
    '.wwwwwwww.',
    '..wwwwww..',
  ]},
  pikachu: { cap:'#ffd23f', rows:[
    'k........k',
    'kk......kk',
    '.kk....kk.',
    '.yyy..yyy.',
    '..yyyyyy..',
    '.yyyyyyyy.',
    '.ykkyykky.',
    'ryyyooyyyr',
    '.yykkkkyy.',
    '..yyyyyy..',
  ]},
  invader: { cap:'#3dff7a', rows:[
    '..g....g..',
    'g..g..g..g',
    'g.gggggg.g',
    'gggg..gggg',
    'gggggggggg',
    '.gggggggg.',
    '.g.g..g.g.',
    '.g......g.',
  ]},
  pacman: { cap:'#ffd23f', rows:[
    '..yyyyyy..',
    '.yyyyyykk.',
    'yyyyyyykk.',
    'yyyyyy....',
    'yyyyy.....',
    'yyyyyy....',
    'yyyyyyy.oo',
    '.yyyyyy.oo',
    '..yyyyyy..',
  ]},
  ghost: { cap:'#ff7ab8', rows:[
    '..pppppp..',
    '.pppppppp.',
    'pppppppppp',
    'pwwppwwppp',
    'pwbppwbppp',
    'pppppppppp',
    'pppppppppp',
    'pp.pp.pp.p',
  ]},
  tetris: { cap:'#2fd6e0', rows:[
    'cc........',
    'cc..rr....',
    '....rr.yy.',
    'gg..rr.yy.',
    'gg..u.....',
    '.oo.uu....',
    '.oo.uuu...',
    'mm........',
    'mm.mm.....',
  ]},
  mushroom: { cap:'#e0314b', rows:[
    '..rrrrrr..',
    '.rwwrrwwr.',
    'rwwwrrwwwr',
    'rrrrrrrrrr',
    'rwwrrrrwwr',
    '.wwwwwwww.',
    '..wttttw..',
    '..wtkktw..',
    '..wttttw..',
  ]},
  heart: { cap:'#ff4d6d', rows:[
    '.rr..rr.',
    'rrrrrrrr',
    'rwrrrrrr',
    'rrrrrrrr',
    '.rrrrrr.',
    '..rrrr..',
    '...rr...',
  ]},
  // STAR WARS — lightsaber (blue blade, lit hilt)
  lightsaber: { cap:'#3d7bff', rows:[
    '...bb...',
    '...bb...',
    '..bwwb..',
    '...ww...',
    '...ww...',
    '...ww...',
    '...bb...',
    '..ssss..',
    '..skks..',
    '..ssss..',
    '..skks..',
    '...ss...',
  ]},
  controller: { cap:'#9b94b8', rows:[
    '.kkkkkkkkkk.',
    'kkkkkkkkkkkk',
    'kwkkkkkkrrkk',
    'kkkkkkkkkkkk',
    'kwkwkkkkrwrk',
    'kkkkkkkkkkkk',
    '.kk......kk.',
  ]},
  // BORDERLANDS — psycho bandit mask (cream mask, dark eyes, red mark, teeth)
  borderlands: { cap:'#ff9a3c', rows:[
    '.CCCCCCCC.',
    'CCCCCCCCCC',
    'CkkCCCCkkC',
    'CkkCCCCkkC',
    'CCCCrrCCCC',
    'CCCkkkkCCC',
    'CkwkwkwkkC',
    'CCkkkkkkCC',
    '.CkCCCCkC.',
  ]},
  star: { cap:'#f2c14e', rows:[
    '....G....',
    '....G....',
    '..GGGGG..',
    'GGGGGGGGG',
    '.GGGGGGG.',
    '..GG.GG..',
    '.GG...GG.',
  ]},
  // LEAGUE OF LEGENDS — a Poro (fluffy white blob, big eyes, lil tongue)
  lol: { cap:'#2fd6e0', rows:[
    '..wwwwww..',
    '.wwwwwwww.',
    'wwwwwwwwww',
    'wwwwwwwwww',
    'wwkwwwwkww',
    'wwwwwwwwww',
    'wwwwrrwwww',
    '.wwwwwwww.',
    '..w.ww.w..',
  ]},
};

// Crisp poster art — hand-authored pixel-art icons (NOT emoji). Each is a small
// char grid scaled to fill the cabinet side face, so it stays sharp + on-theme.
const PIX_PAL = {
  y:'#ffd23f', o:'#ff9a3c', r:'#e0314b', R:'#8e2438', w:'#f4f1ea', W:'#b8b0c8',
  k:'#14101e', g:'#46e06a', G:'#1f8f46', c:'#2fd6e0', p:'#ff7ab8', b:'#3d7bff',
  s:'#8a8aa0', d:'#c8962f', t:'#d8a06a',
};
const PIXART = {
  // electric bolt (Pikachu / electric games)
  pika: { pal: PIX_PAL, rows: [
    '.....yyy..', '....yyy...', '...yyy....', '..yyy.....',
    '..yyyyyy..', '.....yyy..', '....yyy...', '...yyy....',
    '..yyy.....', '..yy......' ] },
  // Borderlands psycho — bone mask, eye holes, blue mark, stitched mouth
  psycho: { pal: PIX_PAL, rows: [
    '.wwwwwwwww.', 'wwwwwwwwwww', 'wwwwwwwwwww', 'wkkwwwwwkkw',
    'wkkwwwwwkkw', 'wwwwbwwwwww', 'wwwwwwwwwww', 'wkwkwkwkwkw',
    'wwwwwwwwwww', '.wwwwwwwww.', '..wwwwwww..' ] },
  // crossed swords (LoL / battle)
  swords: { pal: PIX_PAL, rows: [
    's.........s', '.s.......s.', '..s.....s..', '...s...s...',
    '....s.s....', '.....s.....', '....s.s....', '...s...s...',
    '..s.....s..', '.d.......d.', 'd.........d' ] },
  // space invader
  invader: { pal: PIX_PAL, rows: [
    '..c.....c..', '...c...c...', '..ccccccc..', '.cc.ccc.cc.',
    'ccccccccccc', 'c.ccccccc.c', 'c.c.....c.c', '...cc.cc...' ] },
  // pac-man ghost
  ghost: { pal: PIX_PAL, rows: [
    '...rrrrr...', '..rrrrrrr..', '.rrrrrrrrr.', '.rwwrrwwrr.',
    '.rwbrrwbrr.', '.rrrrrrrrr.', 'rrrrrrrrrrr', 'rrrrrrrrrrr',
    'rrrrrrrrrrr', 'r.rr.rr.rr.', '.r.rr.rr.r.' ] },
  // Mario-style mushroom
  mushroom: { pal: PIX_PAL, rows: [
    '...rrrrr...', '..rrrrrrr..', '.rrwwrwwrr.', 'rrrwwrwwrrr',
    'rrrrrrrrrrr', 'rrrrrrrrrrr', '.wwwwwwwww.', '.wwkwwwkww.',
    '.wwwwwwwww.', '..wwwwwww..' ] },
  // heart
  heart: { pal: PIX_PAL, rows: [
    '.rr...rr..', 'rrrr.rrrr.', 'rrrrrrrrr.', 'rrrrrrrrr.',
    'rrrrrrrrr.', '.rrrrrrr..', '..rrrrr...', '...rrr....', '....r.....' ] },
  // gamepad
  controller: { pal: PIX_PAL, rows: [
    '.kkkkkkkkkk.', 'kkkkkkkkkkkk', 'kkwkkkkkrkkk', 'kwwwkkkkgkbk',
    'kkwkkkkkykkk', 'kkkkkkkkkkkk', '.kk......kk.' ] },
  // star
  star: { pal: PIX_PAL, rows: [
    '.....y.....', '.....y.....', '....yyy....', '....yyy....',
    'yyyyyyyyyyy', '.yyyyyyyyy.', '..yyyyyyy..', '..yyy.yyy..',
    '.yy.....yy.', '.y.......y.' ] },
  // die showing five
  dice: { pal: PIX_PAL, rows: [
    '.sssssssss.', 'swwwwwwwwws', 'swkwwwwwkws', 'swwwwwwwwws',
    'swwwwkwwwws', 'swwwwwwwwws', 'swkwwwwwkws', 'swwwwwwwwws', '.sssssssss.' ] },
  // alien head
  alien: { pal: PIX_PAL, rows: [
    '..GGGGGGG..', '.GGGGGGGGG.', 'GGGGGGGGGGG', 'GkkGGGGGkkG',
    'GkkGGGGGkkG', 'GGGGGGGGGGG', 'GGGGGGGGGGG', '.GGGGGGGGG.',
    '..GGGGGGG..', '...G...G...' ] },
  // pug face (wall-logo fallback only)
  pug: { pal: PIX_PAL, rows: [
    't.t.....t.t', 'ttt.....ttt', '.ttttttttt.', 'ttttttttttt',
    'tkkttttkktt', 'ttttttttttt', 'tttkkkkkttt', '.ttttttt...', '..ttttt....' ] },
};

const World = window.World = {
  blocked: new Uint8Array(GW * GH),
  cam: { x: 48, y: 96, z: BASE_ZOOM, tz: BASE_ZOOM },
  mulberry32,
  WALL_H,
  POSTERS,                               // pixel-art posters (legacy fallback)

  iso(x, y){ return [ (x - y) * TW2, (x + y) * TH2 ]; },
  unproject(sx, sy){
    const a = sx / TW2, b = sy / TH2;
    return [ (a + b) / 2, (b - a) / 2 ];
  },

  block(tx, ty){
    if (tx >= 0 && ty >= 0 && tx < GW && ty < GH) this.blocked[ty * GW + tx] = 1;
  },
  unblock(tx, ty){
    if (tx >= 0 && ty >= 0 && tx < GW && ty < GH) this.blocked[ty * GW + tx] = 0;
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
  // decorative props, spaced along the right wall so the corner isn't crowded
  claw: { tx: GW - 2, ty: 8, phase: 0, dropIn: 7, drift: 0 },
  juke: { tx: GW - 2, ty: 11, noteIn: 1 },
  // HI-SCORE hangs on the FRONT-LEFT wall (clear of the 'E' cabinets at ty>=4)
  board: { ty: 1 },
  pugImg: null, pugReady: false,
  walker: { active: false, p: 0, dir: 1, nextIn: 14 },
  marker: null,                          // click destination ping
  attract: false, attractT: 0,
  doorOpen: 1, doorTarget: 1,            // 1 = open, 0 = closed (entrance intro)
  introCam: false,                       // slow push-in while walking in

  // ----------------------------------------------------------------- init
  init(){
    const canvas = document.getElementById('view');
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // walls blocked
    for (let x = 0; x < GW; x++){ this.block(x, 0); this.block(x, GH - 1); }
    for (let y = 0; y < GH; y++){ this.block(0, y); this.block(GW - 1, y); }

    // one snack machine on the right wall (decluttered — was two)
    this.machines = [
      { tx: GW - 2, ty: 4, body: '#8e2438', win: '#ffd23f', stripe: '#ff4757', kind: 'snack'  },
    ];
    for (const m of this.machines) this.block(m.tx, m.ty);
    this.block(this.claw.tx, this.claw.ty);
    this.block(this.juke.tx, this.juke.ty);

    // PUG BANGER FIESTA logo — the real logo, drawn crisp on the wall
    // (falls back to the pixel pug if it fails to load / is offline)
    this.pugImg = new Image();
    this.pugImg.decoding = 'async';
    this.pugImg.crossOrigin = 'anonymous';
    this.pugImg.onload = () => { this.pugReady = true; };
    this.pugImg.onerror = () => {
      // retry without crossOrigin (some hosts lack CORS headers; we only draw it)
      const i2 = new Image();
      i2.onload = () => { this.pugImg = i2; this.pugReady = true; };
      i2.src = window.CFG.PUG_LOGO || 'https://www.pugbanger.fun/assets/images/logo.png';
    };
    this.pugImg.src = (window.CFG.PUG_LOGO || 'https://www.pugbanger.fun/assets/images/logo.png');

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
  setDoor(target){ this.doorTarget = target; },

  // true iso occlusion: should a box footprint [x0,y0,x1,y1] (tile coords) be
  // drawn IN FRONT OF (cover) the player at (px,py)? It must (a) overlap the
  // player on screen-x and (b) present a surface nearer the camera than the
  // player along that screen column. Fixes wide cabinets clipping the sprite.
  structOccludesPlayer(foot, px, py){
    const x0 = foot[0], y0 = foot[1], x1 = foot[2], y1 = foot[3];
    const c = px - py;                       // player screen-x (tile units)
    const HALF = 0.45;                       // half the sprite width, in tiles
    if (c + HALF <= x0 - y1 || c - HALF >= x1 - y0) return false;   // no overlap
    let nx = Math.min(x1, c + y1);           // nearest box surface in this column
    if (nx < x0) nx = x0;
    const nearestDepth = 2 * nx - c;         // = x + y at that surface point
    return px + py < nearestDepth - 0.05;    // player is behind it → it covers player
  },

  // sheared drawing helper: local x runs along the wall, local -y is up
  shear(c, ox, oy, slope){ c.save(); c.translate(ox, oy); c.transform(1, slope, 0, 1, 0, 0); },

  // crisp poster art in an [x,y,S,S] box: vector shapes for geometric icons,
  // emoji glyphs for everything else (recognizable even when small)
  drawArt(c, x, y, S, name){
    c.fillStyle = 'rgba(8,5,15,.62)';            // paper backing
    c.fillRect(x, y, S, S);
    c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x, y, S, 1);
    const cx = x + S / 2, cy = y + S / 2, r = S * 0.40;
    if (name === 'pokeball'){
      c.beginPath(); c.arc(cx, cy, r, Math.PI, 0); c.fillStyle = '#e0314b'; c.fill();
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI); c.fillStyle = '#f4f1ea'; c.fill();
      c.fillStyle = '#14101e'; c.fillRect(cx - r, cy - r * 0.18, r * 2, r * 0.36);
      c.beginPath(); c.arc(cx, cy, r * 0.32, 0, 6.3); c.fillStyle = '#14101e'; c.fill();
      c.beginPath(); c.arc(cx, cy, r * 0.17, 0, 6.3); c.fillStyle = '#f4f1ea'; c.fill();
      c.lineWidth = Math.max(1, S * 0.04); c.strokeStyle = '#14101e';
      c.beginPath(); c.arc(cx, cy, r, 0, 6.3); c.stroke();
    } else if (name === 'pacman'){
      c.fillStyle = '#ffd23f';
      c.beginPath(); c.moveTo(cx - r * 0.1, cy);
      c.arc(cx - r * 0.1, cy, r, Math.PI * 0.27, Math.PI * 1.73); c.closePath(); c.fill();
      c.fillStyle = '#14101e'; c.beginPath(); c.arc(cx - r * 0.1, cy - r * 0.44, r * 0.15, 0, 6.3); c.fill();
    } else if (name === 'saber'){
      c.fillStyle = '#79d0ff'; c.fillRect(cx - S * 0.06, y + S * 0.10, S * 0.12, S * 0.46);
      c.fillStyle = '#eaffff'; c.fillRect(cx - S * 0.02, y + S * 0.10, S * 0.04, S * 0.46);
      c.fillStyle = '#9b94b8'; c.fillRect(cx - S * 0.09, y + S * 0.56, S * 0.18, S * 0.30);
      c.fillStyle = '#5a5a72'; c.fillRect(cx - S * 0.09, y + S * 0.665, S * 0.18, S * 0.05);
    } else {
      const art = PIXART[name]; if (!art) return;
      this.drawPixGrid(c, x + S * 0.06, y + S * 0.06, S * 0.88, art);
    }
  },

  // scale a char-grid pixel-art icon to fill the [x,y,size,size] box
  drawPixGrid(c, x, y, size, art){
    const rows = art.rows, pal = art.pal || PIX_PAL;
    let cols = 0;
    for (const r of rows) if (r.length > cols) cols = r.length;
    const n = rows.length;
    const cw = size / cols, ch = size / n;
    for (let ry = 0; ry < n; ry++){
      const row = rows[ry];
      for (let rx = 0; rx < row.length; rx++){
        const k = row[rx];
        if (k === '.' || k === ' ') continue;
        c.fillStyle = pal[k] || POSTER_PAL[k] || '#fff';
        c.fillRect(x + rx * cw, y + ry * ch, cw + .6, ch + .6);
      }
    }
  },

  /* drawPoster(c, x, yTop, art, taped) — framed wall poster, or (taped=true)
     a frameless "taped-on" version used on cabinet sides. */
  drawPoster(c, x, yTop, art, taped){
    const rows = art.rows, h = rows.length;
    let w = 0;
    for (const r of rows) if (r.length > w) w = r.length;
    if (taped){
      c.fillStyle = 'rgba(8,5,15,.6)';                  // paper backing
      c.fillRect(x - 1, yTop - 1, w + 2, h + 2);
    } else {
      c.fillStyle = '#0a0712';
      c.fillRect(x - 2, yTop - 2, w + 4, h + 7);
      c.strokeStyle = '#3a2b52';
      c.strokeRect(x - 1.5, yTop - 1.5, w + 3, h + 6);
    }
    for (let ry = 0; ry < h; ry++){
      const row = rows[ry];
      for (let rx = 0; rx < row.length; rx++){     // per-row length — ragged-safe
        const ch = row[rx];
        if (ch === '.' || ch === ' ') continue;
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

    // door FRAME only (tiles x 8..9 -> local 96..120) — the two glass leaves
    // are drawn per-frame in drawDoor() so they can open/close on entry
    c.fillStyle = '#070b18'; c.fillRect(97, -40, 22, 40);          // opening (night beyond)
    c.fillStyle = '#241a38'; c.fillRect(96, -41, 24, 2);           // lintel
    c.fillStyle = '#241a38'; c.fillRect(96, -41, 2, 41); c.fillRect(118, -41, 2, 41); // jambs

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
    // (left-wall hero poster + HI-SCORE board are drawn per-frame, see render)
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
    // entrance doors easing open/closed
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 4);
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
      tz = CFG.BASE_ZOOM * 1.02 + Math.sin(this.attractT * .05) * .06;
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
    // slow cinematic push-in during the entrance walk; snappier otherwise
    const zk = this.introCam ? Math.min(1, dt * 0.9) : (ov ? k : Math.min(1, dt * 4));
    cam.z += (tz - cam.z) * zk;
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
    this.drawDoor(c, t);
    this.drawSign(c, t);
    this.drawWallPosters(c, t);    // PUG BANGER hero (left wall)
    this.drawScoreBoard(c, t);     // HI-SCORE (front-left wall)
    this.drawPuddleShimmer(c, t);

    // depth-sorted entities (structures carry a `foot` footprint for occlusion)
    const items = [];
    Cabinets.collectDrawables(items, t);
    for (const m of this.machines){
      const mm = m;
      items.push({ depth: mm.tx + mm.ty + 1, foot: [mm.tx, mm.ty, mm.tx + 1, mm.ty + 1],
        draw: (cc) => this.drawVendingBox(cc, mm.tx, mm.ty, mm, t, true) });
    }
    const cl = this.claw, jk = this.juke;
    items.push({ depth: cl.tx + cl.ty + 1, foot: [cl.tx, cl.ty, cl.tx + 1, cl.ty + 1], draw: (cc) => this.drawClaw(cc, t) });
    items.push({ depth: jk.tx + jk.ty + 1, foot: [jk.tx, jk.ty, jk.tx + 1, jk.ty + 1], draw: (cc) => this.drawJuke(cc, t) });
    for (const g of ghostFrames){
      items.push({ depth: g.x + g.y, draw: (cc) => Player.drawSprite(cc, g.x, g.y, g.f, g.phase, true, t) });
    }
    // split structures into those the player is in front of (drawn behind the
    // player) vs those genuinely covering the player (drawn over it). A scalar
    // depth sort can't do this for wide boxes — the per-column test can.
    const back = [], front = [];
    for (const it of items){
      if (it.foot && this.structOccludesPlayer(it.foot, player.x, player.y)) front.push(it);
      else back.push(it);
    }
    back.sort((a, b) => a.depth - b.depth);
    front.sort((a, b) => a.depth - b.depth);
    for (const it of back) it.draw(c, t);
    player.draw(c, t);
    for (const it of front) it.draw(c, t);

    this.drawNotes(c, t);
    this.drawMarker(c, t);
    Cabinets.drawFx(c, t);   // coin arc, INSERT COIN labels, screen messages

    this.drawLighting(c, t, player);
    this.drawMotes(c, t);
    this.drawDoorSpill(c, t);   // light + rain blowing in while the door is open

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
      Cabinets.drawCrispScreens(cc, t, player);
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
    // rain streaks — OUTSIDE, so drawn BEHIND the glass + neon writing
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
    // glass sheen + mullion (the pane — between outside rain and inside neon)
    c.fillStyle = 'rgba(140,170,230,.07)'; c.fillRect(121, -39, 35, 26);
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(124, -39, 3, 26);
    c.fillStyle = '#241a38'; c.fillRect(137, -39, 2, 26);
    // OPEN 24/7 neon hanging INSIDE the window — in front of the rain/glass
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
    c.restore();
  },

  // animated entrance doors (back wall, opening tiles 8–9 → local 97..119)
  drawDoor(c, t){
    const o = Math.max(0, Math.min(1, this.doorOpen));   // 1 open, 0 closed
    this.shear(c, 0, 0, .5);
    c.save();
    c.beginPath(); c.rect(98, -39, 20, 38); c.clip();      // door opening
    // night + a glimpse of rain through the gap when open
    if (o > .02){
      c.fillStyle = '#0a1024'; c.fillRect(98, -39, 20, 38);
      c.strokeStyle = 'rgba(150,185,235,' + (.5 * o).toFixed(2) + ')'; c.lineWidth = 1;
      c.beginPath();
      for (const d of this.drops){
        const dx = 99 + d.x * .55, dy = -39 + d.y;
        if (dy > 0) continue;
        c.moveTo(dx, dy); c.lineTo(dx - .6, dy + d.len);
      }
      c.stroke();
    }
    // two glass leaves slide apart by o*9px (pocket doors)
    const slide = o * 9;
    const leaf = (x, handleRight) => {
      c.fillStyle = '#141d36'; c.fillRect(x, -36, 7, 35);
      c.fillStyle = 'rgba(150,180,235,.10)'; c.fillRect(x, -36, 7, 35);
      c.fillStyle = '#3a2b52'; c.fillRect(x, -36, 1, 35);
      c.fillStyle = '#ffd23f'; c.fillRect(x + (handleRight ? 5 : 1), -20, 1, 2);
    };
    leaf(100 - slide, true);     // left leaf slides left
    leaf(109 + slide, false);    // right leaf slides right
    if (o < .5){                 // center stile only while ~closed
      c.globalAlpha = 1 - o * 2;
      c.fillStyle = '#3a2b52'; c.fillRect(107, -36, 2, 35);
      c.globalAlpha = 1;
    }
    c.restore();
    c.restore();
  },

  // cool light + a gust of rain spilling onto the floor while the door is open
  drawDoorSpill(c, t){
    const o = this.doorOpen;
    if (o < .02) return;
    this.applyCam(c);
    const p = this.iso(9, 2.5);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(p[0], p[1] - 6, 0, p[0], p[1] - 6, 32);
    g.addColorStop(0, 'rgba(150,180,235,' + (0.18 * o).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(p[0] - 32, p[1] - 38, 64, 64);
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = 'rgba(150,185,235,' + (0.5 * o).toFixed(2) + ')';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 9; i++){
      const dx = p[0] - 15 + ((i * 7 + t * 70) % 30);
      const dy = p[1] - 26 + ((i * 9 + t * 110) % 26);
      c.moveTo(dx, dy); c.lineTo(dx - 2, dy + 4);
    }
    c.stroke();
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

  // HI-SCORE — proper-sized panel on the FRONT-LEFT wall (clear of cabinets)
  drawScoreBoard(c, t){
    const lw = this.iso(0, GH);
    const W = TW + TW2;                            // 3 tiles wide (36px) — wider
    const X = GH * TW2 - W;                        // pinned to the back-left corner
    const TOP = -46, BOT = -6, IH = BOT - TOP;     // taller, with margin around it
    this.shear(c, lw[0], lw[1], -.5);
    c.fillStyle = '#241a38'; c.fillRect(X + W / 2 - 1, TOP - 3, 2, 3);   // ceiling bracket
    c.fillStyle = '#0b0518'; c.fillRect(X, TOP, W, IH);
    c.strokeStyle = '#5d4a7d'; c.strokeRect(X + .5, TOP + .5, W - 1, IH - 1);
    for (let i = 0; i < 6; i++){
      c.fillStyle = ((i + (t * 4 | 0)) % 3) === 0 ? '#ffd23f' : '#4a3a18';
      c.fillRect(X + 2 + i * 4, TOP + 1, 1, 1);
      c.fillRect(X + 2 + i * 4, BOT - 2, 1, 1);
    }
    c.save();
    c.beginPath(); c.rect(X + 2, TOP + 2, W - 4, IH - 4); c.clip();
    const IW = W - 4;
    c.textBaseline = 'alphabetic';
    c.font = 'bold 6px monospace';
    const tw = c.measureText('HI·SCORE').width;
    c.save();
    c.translate(X + W / 2, TOP + 10);
    if (tw > IW) c.scale(IW / tw, 1);
    c.shadowColor = '#ffd23f'; c.shadowBlur = 3;
    c.fillStyle = '#ffd23f';
    c.fillText('HI·SCORE', -tw / 2, 0);
    c.restore();
    c.fillStyle = '#3a2b52'; c.fillRect(X + 2, TOP + 13, IW, 1);
    const top = (window.Cabinets && Cabinets.topScores) ? Cabinets.topScores(3) : [];
    c.font = '5px monospace';
    if (!top.length){
      c.fillStyle = (t * 1.4 % 1) < .6 ? '#9b8cc0' : '#5d4a7d';
      c.fillText('PLAY!', X + 8, TOP + 24);
    } else {
      const COLS = ['#fff', '#cfd8ff', '#9b8cc0'];
      for (let i = 0; i < top.length; i++){
        c.fillStyle = i === 0 && (t * 2 % 1) < .7 ? '#ffd23f' : COLS[i];
        const nm = (i + 1) + ' ' + (top[i].short || '').slice(0, 5);
        const sc = String(top[i].n);
        c.fillText(nm, X + 3, TOP + 22 + i * 7);
        c.fillText(sc, X + W - 3 - c.measureText(sc).width, TOP + 22 + i * 7);
      }
    }
    c.restore();
    c.restore();
  },

  // PUG BANGER FIESTA hero poster — back-left wall corner (real logo if present)
  drawWallPosters(c, t){
    const lw = this.iso(0, GH);
    this.shear(c, lw[0], lw[1], -.5);
    const X = 4, Y = -42, S = 22;
    c.fillStyle = '#0a0712'; c.fillRect(X - 2, Y - 2, S + 4, S + 8);
    c.strokeStyle = '#3a2b52'; c.strokeRect(X - 1.5, Y - 1.5, S + 3, S + 6);
    if (this.pugReady){
      c.imageSmoothingEnabled = true;
      c.drawImage(this.pugImg, X, Y, S, S);
      c.imageSmoothingEnabled = false;
    } else {
      this.drawArt(c, X, Y, S, 'pug');                           // emoji fallback
    }
    c.fillStyle = '#f4b8c1'; c.fillRect(X, Y + S + 1, S, 1);
    c.fillStyle = '#5d4a7d'; c.fillRect(X, Y + S + 3, S - 4, 1);
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
    // window spill + open door + score bay + jukebox
    hole(11.5, 1.2, 30, .4 + this.flash * .5);
    hole(9, 1.4, 20, .25 + this.doorOpen * .35);
    hole(0.8, this.board.ty + 2, 16, .4);          // HI-SCORE (front-left wall)
    hole(0.8, GH - 1.5, 14, .34);                  // PUG hero (left wall corner)
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
    glow(9, 1.4, 16, '#7f9bd8', .04 + this.doorOpen * .08);   // night spill through the door
    glow(0.8, this.board.ty + 2, 12, '#ffd23f', .08);         // HI-SCORE
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
