/* models.js — voxel definitions for every prop in the hall + the pixel-art
   decals (cabinet side icons, wall posters). All coordinates are model-space
   voxels (1 tile = 16). Front of every model faces +y; Vox.faceEast() turns
   left-wall cabinets toward +x. Exposes window.Models. */
(function(){
'use strict';
const H = PX.hex, mat = Vox.mat;

// ---------------------------------------------------------------- decals
const IP = {
  y:'#ffd23f', Y:'#b88a1c', o:'#ff9a3c', r:'#e0314b', R:'#8e2438', w:'#f4f1ea', W:'#b8b0c8',
  k:'#14101e', g:'#46e06a', G:'#1f8f46', c:'#2fd6e0', C:'#1a7f93', p:'#ff7ab8', b:'#3d7bff', B:'#23408f',
  s:'#8a8aa0', S:'#55546e', d:'#c8962f', t:'#d8a06a', m:'#ff3df0', u:'#9b5cff',
};
// one unique icon per cabinet side (12×12-ish)
const ICONS = [
  ['...kkkkkk...','..krrrrrrk..','.krrwrrrrrk.','krrwwrrrrrrk','krrrrrrrrrrk','kkkkkkkkkkkk','kkkkwwwwkkkk','kwwkwkkwkwwk','kwwwkwwkwwwk','.kwwwwwwwwk.','..kwwwwwwk..','...kkkkkk...'],
  ['........yyy.','.......yyy..','......yyy...','.....yyy....','....yyyyyyy.','......yyy...','.....yyy....','....yyy.....','...yyy......','..yyy.......','.yy.........','.y..........'],
  ['.....cc.....','.....cc.....','....cwwc....','....cwwc....','....cwwc....','....cwwc....','....cwwc....','.....cc.....','....ssss....','...sSkkSs...','....ssss....','....sSSs....'],
  ['..wwwwwwww..','.wwwwwwwwww.','wwwwwwwwwwww','wkkkwwwwkkkw','wkkkwwwwkkkw','wwwwwbbwwwww','wwwwwbbwwwww','wwwwwwwwwwww','wkwkwkwkwkww','.wwwwwwwwww.','..wwwwwwww..','....wwww....'],
  ['s..........s','.s........s.','..s......s..','...s....s...','....s..s....','.....ss.....','.....ss.....','....s..s....','...s....s...','..d......d..','.dd......dd.','d..........d'],
  ['..c......c..','...c....c...','..cccccccc..','.cc.cccc.cc.','cccccccccccc','c.cccccccc.c','c.c......c.c','...cc..cc...','............','............','............','............'],
  ['...yyyyyy...','.yyyyyyyyy..','yyyyyyyyk...','yyyyyyy.....','yyyyy.......','yyyyyyy.....','yyyyyyyyk...','.yyyyyyyyy..','...yyyyyy...','............','..........oo','..........oo'],
  ['....rrrr....','..rrrrrrrr..','.rrrrrrrrrr.','.rwwrrrwwrr.','.rwbrrrwbrr.','rrrrrrrrrrrr','rrrrrrrrrrrr','rrrrrrrrrrrr','rrrrrrrrrrrr','rr.rrr.rrr.r','r...r...r...','............'],
  ['...rrrrrr...','..rrrrrrrr..','.rrwwrrwwrr.','rrrwwrrwwrrr','rrrrrrrrrrrr','rrwrrrrrrwrr','.wwwwwwwwww.','.wwwkwwkwww.','.wwwwwwwwww.','..wwwwwwww..','............','............'],
  ['.rrr...rrr..','rrrrr.rrrrr.','rwrrrrrrrrr.','rrrrrrrrrrr.','rrrrrrrrrrr.','.rrrrrrrrr..','..rrrrrrr...','...rrrrr....','....rrr.....','.....r......','............','............'],
  ['............','.kkkkkkkkkk.','kkkkkkkkkkkk','kkwkkkkkkrkk','kwwwkkkkgkbk','kkwkkkkkkykk','kkkkkkkkkkkk','kkkk....kkkk','.kk......kk.','............','............','............'],
  ['.....y......','.....y......','....yyy.....','....yyy.....','yyyyyyyyyyy.','.yyyyyyyyy..','..yyyyyyy...','..yyy.yyy...','.yy.....yy..','.y.......y..','............','............'],
  ['.ssssssssss.','swwwwwwwwwws','swkwwwwwwkws','swwwwwwwwwws','swwwwwwwwwws','swwwwkkwwwws','swwwwkkwwwws','swwwwwwwwwws','swkwwwwwwkws','swwwwwwwwwws','.ssssssssss.','............'],
  ['...GGGGGG...','..GGGGGGGG..','.GGGGGGGGGG.','GGkkGGGGkkGG','GGkkkGGkkkGG','GGGGGGGGGGGG','GGGGGGGGGGGG','.GGGkkkkGGG.','..GGGGGGGG..','...G....G...','............','............'],
  ['....uuuu....','..uuuuuuuu..','.uuwwuuuuuu.','.uwwuuuuuuu.','uuuuuuuuuuuu','uuuuuuuuuuuu','uuuuuuuuuuuu','.uuuuuuuuuu.','.uuuuuuuuuu.','..uuuuuuuu..','....uuuu....','............'],
  ['..mm....mm..','.mmmm..mmmm.','mmwmmmmmmmmm','mmmmmmmmmmmm','.mmmmmmmmmm.','..mmmmmmmm..','...mmmmmm...','....mmmm....','.....mm.....','............','............','............'],
];
function iconPx(idx, u, v){                 // u,v in 0..11 → [r,g,b] | null
  const rows = ICONS[idx % ICONS.length];
  const r = rows[v]; if (!r) return null;
  const k = r[u]; if (!k || k === '.') return null;
  return H(IP[k]);
}

// wall posters (char grids, '.' = backing paper)
const POSTERS = [
  { bg:'#2b1640', rows:[
    '....kkkkkk....','..kkkkkkkkkk..','.kkkkkkkkkkkk.','kkkWWWWWWWWkkk','kkWWkkkkkkWWkk','kkWWkkkkkkWWkk','kkkWWWWWWWWkkk',
    'kkksskkkksskkk','kkksskkkksskkk','.kkssssssssk..','.kkkssssssKkk.','..kkkkkkkkkk..','.kk........kk.','..............',
    '.yyy.y.y.yyy..','..y..y.y.y....'] },                             // helmet: "MAY THE COIN…"
  { bg:'#10233b', rows:[
    '...cc....cc...','....cc..cc....','...cccccccc...','..cc.cccc.cc..','.cccccccccccc.','.c.cccccccc.c.',
    '.c.c......c.c.','....cc..cc....','..............','..g..g..g..g..','..............','.gggggggggggg.',
    '..............','.wwww.www.www.'] },                             // invaders
  { bg:'#3a1020', rows:[
    '....rrrrrr....','...rrrrrrrr...','..rrwwrrwwrr..','.rrrwwrrwwrrr.','.rrrrrrrrrrrr.','.rrwrrrrrrwrr.',
    '..wwwwwwwwww..','..wwwkwwkwww..','..wwwwwwwwww..','...wwwwwwww...','..............','.yyyyyyyyyyyy.',
    '..............','.w.w.www.www..'] },                             // mushroom
  { bg:'#132b22', rows:[
    '..............','.yyyyy........','yyyyyyyy......','yyyyyykk......','yyyyy.........','yyyy...pp..pp.',
    'yyyyy..pp..pp.','yyyyyykk......','yyyyyyyy......','.yyyyy........','..............','.cccccccccccc.',
    '..............','.www.w.w.www..'] },                             // pac
  { bg:'#2a2042', rows:[
    '..cc..........','..cc..rr......','......rr..yy..','.gg...rr..yy..','.gg...u.......','..oo..uu......',
    '..oo..uuu.....','.mm...........','.mm.mm........','....mm........','..............','.bbbbbbbbbbbb.',
    '..............','.www.ww.w.ww..'] },                             // tetris
  { bg:'#321a14', rows:[
    '..wwwwwwww....','.wwwwwwwwww...','wwwwwwwwwwww..','wwkwwwwwwkww..','wwwwwwwwwwww..','wwwwwrrwwwww..',
    '.wwwwwwwwww...','..w.ww.ww.w...','..............','..............','..............','.pppppppppppp.',
    '..............','.ww.www.w.ww..'] },                             // poro
];
function posterPx(pi, u, v){               // u,v in poster-grid space
  const P = POSTERS[pi % POSTERS.length];
  const r = P.rows[v];
  const k = r ? r[u] : null;
  if (!k || k === '.') return H(P.bg);
  return H(IP[k] || '#ffffff');
}

// ---------------------------------------------------------------- cabinet
/* Chunky upright, 32 wide × 16 deep × 60 tall — mostly screen:
   kick 0–3 · body 4–19 (coin door) · control panel 20–23 · rise 24–25 ·
   screen 26–46 (26×19, recessed) · marquee 47–58 (tall 3×10 lettering) · cap 59.
   Side panels (x 0–1, 30–31) stand proud with a glowing T-molding. */
function cabinet(cab, dim){
  const tag = cab.color;
  const R = PX.ramp(tag, 7);
  const DARK = [18, 14, 28], BODY = [30, 24, 44], BODY2 = [42, 34, 60];
  const iconIdx = cab.idx;
  const short = (cab.game.short || cab.game.name).toUpperCase().slice(0, 7);
  const tw = PX.textW(short);
  const tx0 = 2 + Math.floor((28 - tw) / 2);
  const txt = new Set();
  // tall arcade lettering: the 3×5 font doubled vertically (3×10)
  PX.textPts(short, (x, y) => { txt.add((tx0 + x) + ',' + (57 - y * 2)); txt.add((tx0 + x) + ',' + (56 - y * 2)); });
  const isTxt = (x, z) => txt.has(x + ',' + z);

  const SIDE = {
    tex(x, y, z, f){
      if (f === 0 || f === 3){
        const u = f === 0 ? 15 - y : y;
        if (z >= 32 && z <= 43 && u >= 2 && u <= 13){
          const c = iconPx(iconIdx, u - 2, 43 - z);
          if (c) return c;
        }
        const fd = 15 - y;
        const band = z - fd * 1.4;
        if (band > 4 && band < 12) return (band < 5.5 || band > 10.5) ? R[4] : R[3];
        if (z < 5) return R[0];
        if (z > 50) return R[2];
        return ((z * 3 + y) % 13 === 0) ? R[2] : R[1];
      }
      return R[1];
    },
  };
  const TMOLD = { rgb: R[4], emit: dim ? .25 : .6 };
  const KICK = { tex: (x, y, z) => (z === 2 && x % 3 === 0) ? DARK : [14, 10, 22] };
  const BODYM = {
    tex(x, y, z, f){
      if (f === 1){
        if (x >= 11 && x <= 20 && z >= 5 && z <= 17){
          if (x === 11 || x === 20 || z === 5 || z === 17) return [84, 76, 110];
          if ((x === 13 || x === 14 || x === 17 || x === 18) && z >= 12 && z <= 15) return z === 15 ? (dim ? [120, 40, 50] : [255, 90, 100]) : [10, 8, 14];
          if (z === 7 && x >= 14 && x <= 17) return [12, 10, 16];
          return [60, 54, 84];
        }
        if (z >= 18) return R[3];
      }
      return BODY;
    },
    emitTex: (x, y, z, f) => (f === 1 && z === 15 && x >= 13 && x <= 18 && x !== 15 && x !== 16 && !dim) ? .9 : (f === 1 && z >= 18 ? .25 : 0),
  };
  const PANEL = {
    tex(x, y, z, f){
      if (f === 2){
        if (y === 15) return R[4];
        if (x >= 5 && x <= 10 && y >= 11 && y <= 14) return [18, 14, 28];
        return (x + y) % 9 === 0 ? BODY2 : [46, 38, 70];
      }
      if (f === 1) return z === 22 ? R[4] : [22, 18, 34];
      return BODY2;
    },
  };
  const STICK = mat('#1a1520'), BALL = mat('#e0314b');
  const BTN = [{ rgb: R[5], emit: .6 }, mat('#ffd23f', .6), mat('#2fd6e0', .6), mat('#ff5a8a', .6)];
  const START = mat('#f4f1ea', .5);
  const RISE = { tex: (x, y, z, f) => (f === 1 && z === 25 && x % 2 === 0 && x > 5 && x < 27) ? [8, 6, 12] : BODY };
  const BEZEL = { tex: (x, y, z, f) => (f === 1 && (z === 26 || z === 46 || x === 2 || x === 29)) ? [10, 8, 16] : [24, 20, 36] };
  const SCREEN = { tex: (x, y, z) => { const v = (z - 27) / 19; return [10 + v * 8, 14 + v * 12, 30 + v * 18]; }, emit: .2 };
  const MARQ = {
    tex(x, y, z, f){
      if (f !== 1) return BODY;
      if (z === 47 || z === 58) return [72, 66, 96];
      if (isTxt(x, z)) return dim ? [150, 140, 150] : [255, 252, 240];
      if (isTxt(x - 1, z) || isTxt(x, z + 1) || isTxt(x - 1, z + 1)) return R[0];   // bold dark outline
      if (z === 48 || z === 57) return R[5];
      return (x * 2 + z) % 11 === 0 ? R[4] : R[3];
    },
    emitTex: (x, y, z, f) => (f === 1 && z > 47 && z < 58) ? (dim ? .3 : .9) : 0,
  };
  const TOP = { tex: (x, y, z, f) => (f === 2 && y > 2 && y < 12 && x % 4 === 0) ? [16, 12, 24] : [26, 21, 40] };

  function env(z){
    if (z < 4) return 12;
    if (z < 20) return 13;
    if (z < 24) return 16;
    if (z < 47) return 11;
    return 15;
  }
  function sideEnv(z){
    if (z < 20) return 14;
    if (z < 26) return 16;
    if (z < 47) return 13;
    return 16;
  }
  const at = (x, y, z) => {
    if (z >= 24 && z <= 28 && y >= 11 && x > 1 && x < 30){
      if (x === 7 && y === 13 && z <= 26) return STICK;
      if ((x === 6 || x === 7) && (y === 12 || y === 13) && z >= 27) return BALL;
      if (z === 24){
        if (x === 13 && y === 13) return BTN[0];
        if (x === 16 && y === 13) return BTN[1];
        if (x === 19 && y === 12) return BTN[2];
        if (x === 22 && y === 12) return BTN[3];
        if (x === 26 && y === 14) return START;
      }
      return null;
    }
    const side = x <= 1 || x >= 30;
    if (side){
      if (z > 59) return null;
      const ys = sideEnv(z);
      if (y >= ys) return null;
      if (z === 59 && y === ys - 1) return null;
      if (y === ys - 1 || z === 59 || (z === 58 && y === ys - 2)) return TMOLD;
      return SIDE;
    }
    if (y >= env(z)) return null;
    if (z < 4) return KICK;
    if (z < 20) return BODYM;
    if (z < 24) return PANEL;
    if (z < 26) return RISE;
    if (z < 47){
      if (x >= 3 && x <= 28 && z >= 27 && z <= 45 && y >= 10) return null;
      if (x >= 3 && x <= 28 && z >= 27 && z <= 45) return SCREEN;
      return BEZEL;
    }
    if (z < 59) return MARQ;
    if (z < 60) return y < 15 ? TOP : null;
    return null;
  };
  return { X: 32, Y: 16, Z: 60, at };
}
const SCREEN_RECT = { x0: 3, w: 26, zTop: 45, h: 19, plane: 10 };

// ---------------------------------------------------------------- props
function coffee(){
  const BR = PX.ramp('#6b4226', 7);
  const CREAM = [236, 214, 170];
  const at = (x, y, z) => {
    if (x < 1 || x > 14 || y < 1 || z > 51) return null;
    const front = y >= 13;
    if (front && y >= 14) return null;
    // dispenser niche
    if (y >= 10 && x >= 4 && x <= 10 && z >= 8 && z <= 18){
      if (x >= 6 && x <= 8 && y >= 10 && y <= 12 && z >= 8 && z <= 11) return CUP;
      if (y >= 11) return null;
      return NICHE;
    }
    return BODY;
  };
  const NICHE = mat('#120a08');
  const CUP = { tex: (x, y, z) => z === 11 ? [70, 40, 24] : [244, 238, 226] };
  const BODY = {
    tex(x, y, z, f){
      if (f === 1){
        if (z >= 42 && z <= 49){                            // lit header w/ cup icon
          const u = x - 4, v = 49 - z;
          const cupI = ['..w.w..','.w.w...','wwwwww.','wwwww.w','wwwww.w','.www...','.......','.......'];
          const r = cupI[v];
          if (r && u >= 0 && r[u] === 'w') return [90, 50, 26];
          return [255, 214, 120];
        }
        if (z >= 24 && z <= 38 && x >= 2 && x <= 13){       // menu board
          if ((z === 35 || z === 31 || z === 27) && x > 3 && x < 12) return [120, 84, 52];
          return CREAM;
        }
        if (x === 12 && (z === 21 || z === 22)) return [255, 210, 63];
        if (z < 4) return BR[0];
        return BR[3];
      }
      if (f === 2) return BR[4];
      return (z > 20 && z < 24) ? [255, 190, 90] : BR[2];
    },
    emitTex: (x, y, z, f) => f === 1 ? (z >= 42 && z <= 49 ? .9 : (z >= 24 && z <= 38 && x >= 2 && x <= 13) ? .45 : (x === 12 && z > 20 && z < 23) ? .8 : 0) : ((z > 20 && z < 24) ? .5 : 0),
  };
  return { X: 16, Y: 16, Z: 52, at };
}

function snack(){
  const RED = PX.ramp('#9a2440', 7);
  const SN = ['#ffd23f', '#3dff7a', '#ff4757', '#2fd6e0', '#ff9a3c', '#ff7ab8', '#9b5cff', '#f4f1ea'];
  const GLASS = Vox.glass('#9ec8ff', .28);
  const BACK = mat('#1a0f1e'), SHELF = mat('#6a5a7a');
  const snackMat = SN.map(h => ({ tex: (x, y, z) => { const c = H(h); return z % 3 === 2 ? c.map(v => v * .7) : c; } }));
  const at = (x, y, z) => {
    if (x < 1 || x > 14 || y < 1 || z > 57) return null;
    if (y >= 15) return null;
    const win = x >= 2 && x <= 10 && z >= 14 && z <= 48;
    if (win){
      if (y === 14) return GLASS;
      if (y <= 3) return BACK;
      if ((z - 14) % 9 === 0) return y <= 12 ? SHELF : null;
      const shelfZ = z - ((z - 14) % 9);
      const k = (z - shelfZ);
      if (k >= 1 && k <= 4 && y >= 6 && y <= 11){
        const slot = Math.floor((x - 2) / 3);
        if ((x - 2) % 3 < 2) return snackMat[(slot * 3 + shelfZ) % SN.length];
      }
      return null;
    }
    return BODY;
  };
  const BODY = {
    tex(x, y, z, f){
      if (f === 1){
        if (z >= 50) return (x + z) % 4 === 0 ? [255, 238, 150] : [255, 90, 96];
        if (x >= 11 && x <= 13 && z >= 26 && z <= 40){       // keypad
          return ((x + z) % 2 === 0) ? [220, 220, 240] : [40, 30, 46];
        }
        if (x >= 11 && x <= 13 && z >= 20 && z <= 22) return [255, 210, 63];
        if (x >= 3 && x <= 10 && z >= 4 && z <= 10) return z === 10 ? [70, 30, 40] : [18, 10, 16];
        return RED[3];
      }
      if (f === 2) return RED[4];
      return z > 50 ? RED[4] : RED[2];
    },
    emitTex: (x, y, z, f) => (z >= 50 && f === 1) ? .95 : (f === 1 && x >= 11 && x <= 13 && z >= 20 && z <= 40) ? .45 : 0,
  };
  return { X: 16, Y: 16, Z: 58, at };
}

// claw machine — glass box with a prize pile; the claw itself is animated
function claw(){
  const P = PX.ramp('#6a3d9a', 7);
  const GLASS = Vox.glass('#b8c8ff', .22);
  const FLOOR = mat('#2a1d44'), BACK = { tex: (x, y, z) => ((x + z) % 6 === 0) ? [40, 30, 70] : [26, 20, 48] };
  const PR = ['#ffd23f', '#3dff7a', '#ff4757', '#2fd6e0', '#ff7ab8', '#ff9a3c', '#9b5cff'];
  const prizes = PR.map(h => mat(h));
  const prize = (x, y, z) => {
    // lumpy pile: a few overlapping spheres
    const blobs = [[4, 5, 25, 3.2, 0], [9, 4, 24, 3.5, 1], [11, 9, 24, 3, 2], [5, 10, 24, 3.2, 3], [8, 8, 27, 2.6, 4], [12, 5, 27, 2.2, 5], [3, 7, 28, 2, 6]];
    for (const b of blobs){
      const dx = x + .5 - b[0], dy = y + .5 - b[1], dz = z + .5 - b[2];
      if (dx * dx + dy * dy + dz * dz < b[3] * b[3]) return prizes[b[4]];
    }
    return null;
  };
  const at = (x, y, z) => {
    if (x > 15 || y > 15 || z > 61) return null;
    if (z < 22) return BASE;
    if (z < 55){
      if (x === 15 || y === 15) return GLASS;
      if (x === 0 || y === 0) return BACK;
      if (z === 22) return FLOOR;
      if (x === 14 && y === 14) return POST;
      return prize(x, y, z);
    }
    return HEAD;
  };
  const POST = mat('#8a80b0');
  const BASE = {
    tex(x, y, z, f){
      if (f === 1 && x >= 5 && x <= 10 && z >= 4 && z <= 10) return z === 10 ? [255, 122, 184] : [16, 10, 24];
      if (f === 1 && x === 12 && (z === 15 || z === 16)) return [255, 210, 63];
      if (z === 20 || z === 21) return [255, 122, 184];
      return f === 2 ? P[4] : f === 1 ? P[3] : P[2];
    },
    emitTex: (x, y, z, f) => (z >= 20) ? .8 : (f === 1 && x === 12 && z > 14 && z < 17) ? .9 : 0,
  };
  const HEAD = {
    tex(x, y, z, f){
      if (f === 1 || f === 0){
        const u = f === 1 ? x : 15 - y;
        if (z === 58 && u % 3 === 1) return [255, 250, 220];
        return [255, 90, 190];
      }
      return P[4];
    },
    emitTex: (x, y, z, f) => f === 2 ? 0 : .95,
  };
  return { X: 16, Y: 16, Z: 62, at };
}

// jukebox with an arched top; neon arch bands are recoloured per frame set
function jukebox(phase){
  const WOOD = PX.ramp('#6b2f4f', 7);
  const BANDS = ['#ff3df0', '#2fd6e0', '#ffd23f'];
  const band = i => H(BANDS[(i + phase) % 3]);
  const at = (x, y, z) => {
    if (x < 1 || x > 14 || y < 2 || y > 13) return null;
    if (z >= 34){
      const dx = (x + .5 - 8) / 7, dz = (z + .5 - 34) / 12;
      const r = dx * dx + dz * dz;
      if (r > 1) return null;
      if (y === 13 && r > .62) return ARCH;
      return r > .8 && y > 10 ? ARCH : BODY;
    }
    return BODY;
  };
  const ARCH = {
    tex: (x, y, z) => { const dx = (x + .5 - 8) / 7, dz = (z + .5 - 34) / 12; const r = Math.sqrt(dx * dx + dz * dz); return band(r > .92 ? 0 : r > .82 ? 1 : 2); },
    emit: .95,
  };
  const BODY = {
    tex(x, y, z, f){
      if (f === 1){
        if (x >= 3 && x <= 12 && z >= 22 && z <= 32) return (z === 26 || z === 29) ? [120, 60, 20] : [255, 196, 110];  // record window
        if (x >= 3 && x <= 12 && z >= 5 && z <= 19) return (z % 3 === 0) ? [200, 150, 60] : [40, 18, 30];        // grill
        if (x === 1 || x === 14) return band(1);
        return WOOD[3];
      }
      if (f === 2) return WOOD[4];
      if (z >= 5 && z <= 32 && (y === 12)) return band(2);
      return WOOD[2];
    },
    emitTex: (x, y, z, f) => f === 1 ? ((x >= 3 && x <= 12 && z >= 22 && z <= 32) ? .7 : (x === 1 || x === 14) ? .9 : 0) : (y === 12 && z >= 5 && z <= 32 ? .8 : 0),
  };
  return { X: 16, Y: 16, Z: 47, at };
}

function plant(seed){
  const LEAF = PX.ramp('#3f9a4a', 7);
  const POT = PX.ramp('#b3563a', 7);
  const rnd = (x, y, z) => PX.hash(x * 7 + seed, y * 13 + z * 3, seed);
  const at = (x, y, z) => {
    const dx = x + .5 - 8, dy = y + .5 - 8;
    if (z < 12){
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r < 5 - (z < 2 ? 1 : 0) + (z > 9 ? 1 : 0)) return z > 10 ? POTRIM : POTM;
      return null;
    }
    // leafy clusters
    const clusters = [[8, 8, 22, 6], [5, 9, 30, 4.2], [11, 7, 31, 4.5], [8, 10, 37, 3.8], [4, 5, 20, 3.4], [12, 11, 21, 3.4]];
    for (const c of clusters){
      const ex = x + .5 - c[0], ey = y + .5 - c[1], ez = (z + .5 - c[2]) * 1.2;
      const d = ex * ex + ey * ey + ez * ez;
      if (d < c[3] * c[3] && rnd(x, y, z) > .18 + d / (c[3] * c[3]) * .45) return LEAFM;
    }
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && z < 26) return STEM;
    return null;
  };
  const POTM = { tex: (x, y, z) => z === 5 ? POT[2] : POT[3] };
  const POTRIM = { rgb: POT[4] };
  const STEM = { rgb: LEAF[1] };
  const LEAFM = { tex: (x, y, z) => { const h = PX.hash(x, y + z * 5, seed); return h > .82 ? LEAF[5] : h > .45 ? LEAF[4] : LEAF[3]; } };
  return { X: 16, Y: 16, Z: 44, at };
}

function bin(){
  const MET = PX.ramp('#6d6a8e', 7);
  const at = (x, y, z) => {
    const dx = x + .5 - 8, dy = y + .5 - 8, r = Math.sqrt(dx * dx + dy * dy);
    if (z > 18 || r > 5.2) return null;
    if (z >= 16 && r < 3.6) return z === 16 ? TRASH : null;
    return BODY;
  };
  const TRASH = { tex: (x, y) => PX.hash(x, y, 9) > .6 ? [220, 210, 190] : [30, 24, 34] };
  const BODY = { tex: (x, y, z) => z >= 16 ? MET[5] : (z % 5 === 0 ? MET[2] : MET[3]) };
  return { X: 16, Y: 16, Z: 19, at };
}


// ---------------------------------------------------------------- lounge + set dressing
function stool(hex){
  const SEAT = PX.ramp(hex, 7);
  const MET = mat('#4a4660'), MET2 = mat('#8a86a8');
  const seat = { tex: (x, y, z) => z === 10 ? ((x + y) % 5 === 0 ? SEAT[5] : SEAT[4]) : SEAT[2] };
  const at = (x, y, z) => {
    const r = Math.hypot(x + .5 - 8, y + .5 - 8);
    if (z >= 9 && z <= 10) return r < 3.8 ? seat : null;
    if (z === 4) return r < 3.2 && r > 2.2 ? MET2 : (r < .9 ? MET : null);
    if (z <= 1) return r < 3.1 ? MET : null;
    return r < .9 ? MET : null;
  };
  return { X: 16, Y: 16, Z: 11, at };
}

// 3-seat sofa, long along y, facing +x
function sofa(){
  const V = PX.ramp('#6b2a4a', 7), WOOD = mat('#3a2418');
  const FR = { tex: (x, y, z, f) => f === 2 ? V[3] : ((y % 16 === 0) ? V[1] : V[2]) };
  const CUSH = { tex: (x, y, z, f) => (f === 2 && (y % 15 === 1 || y % 15 === 0)) ? V[2] : (f === 2 ? V[4] : V[3]) };
  const at = (x, y, z) => {
    if (x < 1 || x > 14 || y < 1 || y > 46) return null;
    if (z < 2) return ((x === 2 || x === 13) && (y === 3 || y === 44)) ? WOOD : null;
    const arm = y <= 4 || y >= 43;
    if (arm) return z <= 13 ? FR : null;
    if (x <= 4) return z <= 20 ? (z >= 18 ? CUSH : FR) : null;     // backrest
    if (z <= 6) return FR;
    if (z <= 9) return CUSH;
    return null;
  };
  return { X: 16, Y: 48, Z: 21, at };
}

// coffee table with a mug and an open laptop
function coffeeTable(){
  const W = PX.ramp('#7a4a2c', 7);
  const TOPM = { tex: (x, y) => (x + y * 3) % 7 === 0 ? W[3] : W[4] };
  const LEG = { rgb: W[1] };
  const MUG = { tex: (x, y, z) => z === 11 ? [60, 30, 20] : [47, 214, 224] };
  const LAP = { rgb: [60, 58, 80] };
  const SCR = { tex: (x, y, z) => (z % 2 === 0 ? [110, 190, 255] : [70, 130, 230]), emit: .8 };
  const at = (x, y, z) => {
    if (z === 7 || z === 8) return (x >= 2 && x <= 13 && y >= 3 && y <= 12) ? TOPM : null;
    if (z < 7) return ((x === 3 || x === 12) && (y === 4 || y === 11)) ? LEG : null;
    if (z >= 9 && z <= 11 && x >= 4 && x <= 5 && y >= 9 && y <= 10) return MUG;
    if (z === 9 && x >= 7 && x <= 12 && y >= 5 && y <= 9) return LAP;
    if (z >= 10 && z <= 14 && x >= 7 && x <= 12 && y === 5) return x === 7 || x === 12 || z === 14 ? LAP : SCR;
    return null;
  };
  return { X: 16, Y: 16, Z: 15, at };
}

function drinks(){
  const B = PX.ramp('#2a5aa8', 7);
  const GLASS = Vox.glass('#bfe0ff', .25);
  const CANS = ['#e8344e', '#ffd23f', '#3dff7a', '#f4f1ea', '#ff8a3c', '#35dcea'].map(h => ({ tex: (x, y, z) => { const c = H(h); return z % 4 === 0 ? [200, 200, 210] : c; } }));
  const BACK = mat('#0e1a30'), SHELF = mat('#5a6a8a');
  const BODY = {
    tex(x, y, z, f){
      if (f === 1){
        if (z >= 50){
          // "DRINKS" won't fit 14px — a can icon + stripes
          if (x >= 6 && x <= 9 && z >= 51 && z <= 56) return z === 56 || z === 51 ? [200, 200, 210] : [232, 52, 78];
          return (z === 53) ? [255, 255, 255] : [80, 170, 255];
        }
        if (x >= 11 && x <= 13 && z >= 24 && z <= 38) return ((x + z) % 2 === 0) ? [220, 230, 255] : [20, 30, 50];
        if (x >= 3 && x <= 10 && z >= 4 && z <= 10) return z === 10 ? [30, 50, 90] : [8, 12, 24];
        return B[3];
      }
      if (f === 2) return B[4];
      return z > 50 ? B[4] : B[2];
    },
    emitTex: (x, y, z, f) => (z >= 50 && f === 1) ? .95 : (f === 1 && x >= 11 && x <= 13 && z >= 24 && z <= 38) ? .45 : 0,
  };
  const at = (x, y, z) => {
    if (x < 1 || x > 14 || y < 1 || y > 14 || z > 57) return null;
    const win = x >= 2 && x <= 10 && z >= 14 && z <= 48;
    if (win){
      if (y === 14) return GLASS;
      if (y <= 3) return BACK;
      if ((z - 14) % 9 === 0) return y <= 12 ? SHELF : null;
      const k = (z - 14) % 9;
      if (k >= 1 && k <= 5 && y >= 7 && y <= 10 && (x - 2) % 3 < 2) return CANS[(Math.floor((x - 2) / 3) + Math.floor((z - 14) / 9) * 2) % CANS.length];
      return null;
    }
    return BODY;
  };
  return { X: 16, Y: 16, Z: 58, at };
}

// tall potted palm: drooping fronds from a curved trunk
function palm(seed){
  const LEAF = PX.ramp('#3a9a50', 7), TR = PX.ramp('#7a5634', 7), POT = PX.ramp('#c0643e', 7);
  const trunkX = z => 8 + Math.sin(z * .06 + seed) * 1.6;
  const top = 48;
  const fr = [];
  for (let k = 0; k < 7; k++){
    const a = k / 7 * Math.PI * 2 + seed;
    fr.push([Math.cos(a), Math.sin(a), 6 + PX.hash(k, seed, 3) * 3]);
  }
  const LEAFM = { tex: (x, y, z) => { const h = PX.hash(x, y + z * 7, seed); return h > .75 ? LEAF[6] : h > .35 ? LEAF[5] : LEAF[4]; }, emit: .1 };
  const TRUNK = { tex: (x, y, z) => z % 3 === 0 ? TR[2] : TR[3] };
  const at = (x, y, z) => {
    const dx = x + .5 - 8, dy = y + .5 - 8;
    if (z < 11){ const r = Math.hypot(dx, dy); return r < 5 - (z < 2 ? 1 : 0) + (z > 8 ? .6 : 0) ? { rgb: z > 9 ? POT[4] : (z === 5 ? POT[2] : POT[3]) } : null; }
    if (z < top && Math.hypot(x + .5 - trunkX(z), dy) < 1.3) return TRUNK;
    // fronds: arcs out and down from the crown
    for (const f of fr){
      for (let s = 0; s <= 1.0001; s += .08){
        const px = trunkX(top) + f[0] * s * f[2] * 1.1, py = 8 + f[1] * s * f[2] * 1.1, pz = top + 3 - s * s * 12;
        const w = 1.6 * (1 - s * .6);
        if (Math.abs(x + .5 - px) < w && Math.abs(y + .5 - py) < w && Math.abs(z + .5 - pz) < 1.2) return LEAFM;
      }
    }
    return null;
  };
  return { X: 16, Y: 16, Z: 54, at };
}

// low bushy fern in a square planter
function fern(seed){
  const LEAF = PX.ramp('#4aa85a', 7), BOX = PX.ramp('#3a3350', 7);
  const at = (x, y, z) => {
    const dx = x + .5 - 8, dy = y + .5 - 8;
    if (z < 9) return (Math.abs(dx) < 6 && Math.abs(dy) < 6) ? { rgb: z === 8 ? BOX[4] : BOX[2] } : null;
    const r = Math.hypot(dx, dy), h = z - 9;
    // a dome of blades, ragged edge
    if (r < 8 - h * .32 && PX.hash(x, y + z * 13, seed) > .32 + h * .018) return { rgb: PX.hash(x * 3, y, z + seed) > .6 ? LEAF[6] : LEAF[4 + (h & 1)], emit: .12 };
    return null;
  };
  return { X: 16, Y: 16, Z: 30, at };
}

function crates(){
  const W = PX.ramp('#8a6238', 7);
  const CR = { tex: (x, y, z, f) => {
    const u = f === 1 ? x : f === 0 ? y : x;
    const edge = (u % 13 <= 1) || (z % 12 <= 1);
    return edge ? W[2] : ((u + z) % 4 === 0 ? W[3] : W[4]);
  } };
  const at = (x, y, z) => {
    if (z < 12) return (x >= 1 && x <= 14 && y >= 1 && y <= 14) ? CR : null;
    if (z < 22) return (x >= 3 && x <= 12 && y >= 3 && y <= 12) ? CR : null;
    return null;
  };
  return { X: 16, Y: 16, Z: 22, at };
}

// staircase rising along the back wall (+x), with a front handrail
function stairs(){
  const W = PX.ramp('#5a3a2a', 7), MET = PX.ramp('#8a86a8', 7);
  const step = x => Math.min(8, Math.floor(x / 6) + 1);            // 1..8
  const TREAD = { tex: (x, y, z, f) => f === 2 ? ((y + x) % 5 === 0 ? W[4] : W[5]) : (f === 1 ? (z % 5 === 4 ? W[3] : W[1]) : W[2]) };
  const RAIL = { rgb: MET[4] }, POST = { rgb: MET[3] };
  const at = (x, y, z) => {
    if (x > 47 || y > 15) return null;
    const h = step(x) * 5;
    if (y <= 13 && z < h) return TREAD;
    // handrail along the open (front) side
    if (y === 14 || y === 15){
      const rz = step(x) * 5 + 12;
      if (z >= rz - 1 && z <= rz) return RAIL;
      if (x % 12 === 3 && z >= h && z < rz) return POST;
    }
    return null;
  };
  return { X: 48, Y: 16, Z: 54, at };
}

window.Models = { cabinet, coffee, snack, claw, jukebox, plant, bin, stool, sofa, coffeeTable, drinks, palm, fern, crates, stairs, SCREEN_RECT, ICONS, POSTERS, posterPx, IP };
})();
