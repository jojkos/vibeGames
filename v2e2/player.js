/* player.js — the hooded kid. Hand-authored pixel sprite (front 3/4 + back
   3/4, 4-frame walk, mirrored for the other two diagonals), analog movement
   with acceleration + run, tap-to-walk 8-dir A* with string-pulling.
   Player.drawSprite is shared with ghosts.js (blue ghost palette). */
(function(){
'use strict';
const { GW, GH } = window.CFG;
const SPEED = 3.5, RUN = 1.6;
const R = .28;

// ---------------------------------------------------------------- sprite
// jojkos, in pixels: brown swept hair, reddish beard, blue-grey eyes, a grin;
// navy/green flannel open over a white tee, dark jeans, white sneakers.
const PAL = {
  H:'#8a5636', h:'#5a3522', g:'#3e2416', S:'#e9b48e', s:'#c98a66', E:'#d99c78',
  i:'#4d6a86', k:'#1e1a24', B:'#8c4522', b:'#5e2c16', t:'#f4ece0', m:'#4a1c1a',
  F:'#1d3866', f:'#1b5a45', l:'#4d7cb4', T:'#e8e4dc', J:'#3b4568', j:'#2a3152',
  W:'#f4f1ea', w:'#a8a2c6',
};
const HEAD_F = [
  '...HHHhh....',
  '..HHhhhhhh..',
  '.hHhhhhhhhh.',
  '.ghhhhhhhhhg',
  '.gSSSShhhhhg',
  'gSSSSSSSSShg',
  'EShhSSSShhSE',
  'ESikSSSSkiSE',
  'ESSSSssSSSSE',
  'EBSSSSSSSSBE',
  '.BBBBBBBBBB.',
  '.BBBmttmBBB.',
  '.bBBBmmBBBb.',
  '..bBBBBBBb..',
  '....SsSS....',
];
const HEAD_B = [
  '...HHHhh....',
  '..HHhhhhhh..',
  '.hHhhhhhhhh.',
  '.ghhhhhhhhhg',
  '.ghhhhhhhhhg',
  'ghhhhhhhhhhg',
  'EhhhhhhhhhhE',
  'EhhhhhhhhhhE',
  'EghhhhhhhhgE',
  'EBghhhhhhgBE',
  '.BBgggggBBB.',
  '.BBSSSSSSBB.',
  '..BSSSSSSB..',
  '...SSSSSS...',
  '....SsSS....',
];
const TORSO_F = [
  '..FFlTTlFF..',
  '.FfFlTTlFfF.',
  'FFfFFTTFFfFF',
  'FlFFFTTFFFlF',
  'FFfFFTTFFfFF',
  'SFFfFTTFfFFS',
];
const TORSO_B = [
  '..FFFFFFFF..',
  '.FfFFFFFFfF.',
  'FFfFFlFFFfFF',
  'FlFFFFFFFFlF',
  'FFfFFlFFFfFF',
  'SFFfFFFFfFFS',
];
// legs: [leftDx, leftLift, rightDx, rightLift, bob]
const WALK = [[0, 0, 0, 0, 0], [-1, 0, 1, 1, 0], [0, 0, 0, 1, -1], [1, 1, -1, 0, 0], [0, 1, 0, 0, -1]];
const HH = HEAD_F.length;
function buildFrame(front, fi, pal){
  const W = 14, Hh = 28;
  const rows = [];
  for (let y = 0; y < Hh; y++) rows.push(new Array(W).fill('.'));
  const put = (x, y, k) => { if (x >= 0 && y >= 0 && x < W && y < Hh && k !== '.') rows[y][x] = k; };
  const [ldx, ll, rdx, rl, bob] = WALK[fi];
  const oy = 1 + (bob ? 0 : 1);
  const head = front ? HEAD_F : HEAD_B, torso = front ? TORSO_F : TORSO_B;
  const leg = (x0, lift, near) => {
    const top = oy + HH - 1 + torso.length, len = 3 - lift;
    for (let i = 0; i < len; i++){ put(x0, top + i, 'j'); put(x0 + 1, top + i, near ? 'J' : 'j'); put(x0 + 2, top + i, 'j'); }
    const sy = top + len;
    put(x0, sy, front ? 'w' : 'W'); put(x0 + 1, sy, 'W'); put(x0 + 2, sy, front ? 'W' : 'w');
    if (front) put(x0 + 3, sy, 'w');
  };
  leg(4 + ldx, ll, true);
  leg(7 + rdx, rl, false);
  for (let y = 0; y < torso.length; y++) for (let x = 0; x < 12; x++) put(x + 1, oy + HH - 1 + y, torso[y][x]);
  if (fi === 1 || fi === 3){
    const up = fi === 1 ? 1 : 12, hy = oy + HH - 1 + torso.length - 1;
    put(up, hy, '.'); put(up, hy - 1, 'S');
  }
  for (let y = 0; y < HH; y++) for (let x = 0; x < 12; x++) put(x + 1, oy + y - 1, head[y][x]);
  return PX.grid(rows.map(r => r.join('')), pal, true);
}
function ghostPal(){
  const G = ['#1b2a5a', '#2c4a8a', '#4f78c0', '#86aee8', '#c8dcff'];
  const out = {};
  for (const k in PAL){
    const c = PX.hex(PAL[k]);
    const l = (c[0] * .3 + c[1] * .59 + c[2] * .11) / 255;
    out[k] = G[Math.min(4, Math.floor(l * 5))];
  }
  return out;
}
let SPR = null;
function sprites(){
  if (SPR) return SPR;
  const make = pal => {
    const f = [], b = [];
    for (let i = 0; i < WALK.length; i++){ f.push(buildFrame(true, i, pal)); b.push(buildFrame(false, i, pal)); }
    return {
      // facing: 0 N(-y, screen up-right) 1 E(+x, down-right) 2 S(+y, down-left) 3 W(-x, up-left)
      0: b, 1: f, 2: f.map(PX.flip), 3: b.map(PX.flip),
    };
  };
  SPR = { real: make(PAL), ghost: make(ghostPal()) };
  SPR.sil = {};
  for (const k of [0, 1, 2, 3]) SPR.sil[k] = SPR.real[k].map(c => PX.silhouette(c, '#000'));
  return SPR;
}

const Player = window.Player = {
  x: 9, y: 2.7, vx: 0, vy: 0, vsx: 0, vsy: 0,
  facing: 2, moving: false, running: false,
  animT: 0, stepT: 0, idleT: 0,
  path: null, goal: null, speedMul: 1, labelT: 4,
  joy: null,

  init(x, y){ this.x = x; this.y = y; this.labelT = 4; sprites(); },

  update(dt, keys){
    if (this.labelT > 0) this.labelT -= dt;
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup'])    { dx -= 1; dy -= 1; }
    if (keys['s'] || keys['arrowdown'])  { dx += 1; dy += 1; }
    if (keys['a'] || keys['arrowleft'])  { dx -= 1; dy += 1; }
    if (keys['d'] || keys['arrowright']) { dx += 1; dy -= 1; }
    let scale = 1;
    const j = this.joy;
    if (!dx && !dy && j && (j.x || j.y)){
      dx = j.x + j.y; dy = j.y - j.x;
      scale = Math.min(1, Math.hypot(j.x, j.y));
    }
    this.running = !!(keys['shift'] || (j && j.run));
    let manual = !!(dx || dy);
    if (manual){ this.path = null; this.goal = null; this.speedMul = 1; }
    else if (this.path && this.path.length){
      const wp = this.path[0];
      dx = wp[0] - this.x; dy = wp[1] - this.y;
      const d = Math.hypot(dx, dy);
      if (d < .1){
        this.path.shift();
        if (!this.path.length){ this.path = null; this.arrive(); }
        dx = 0; dy = 0;
      } else if (d < .5 && this.path.length === 1) scale = Math.max(.35, d / .5);   // ease into the stop
    }
    const len = Math.hypot(dx, dy);
    const spd = SPEED * this.speedMul * (this.running ? RUN : 1);
    let tvx = 0, tvy = 0;
    if (len > .001){ tvx = dx / len * spd * scale; tvy = dy / len * spd * scale; }
    // acceleration: snappy start, short glide
    const k = 1 - Math.exp(-dt * (len > .001 ? 16 : 20));
    this.vx += (tvx - this.vx) * k; this.vy += (tvy - this.vy) * k;
    const ox = this.x, oy = this.y;
    if (Math.abs(this.vx) + Math.abs(this.vy) > .01){
      const sx = this.vx * dt, sy = this.vy * dt;
      if (!this.collides(this.x + sx, this.y)) this.x += sx; else this.vx *= .3;
      if (!this.collides(this.x, this.y + sy)) this.y += sy; else this.vy *= .3;
    }
    const mdx = this.x - ox, mdy = this.y - oy;
    const moved = Math.hypot(mdx, mdy);
    this.moving = moved > .0015;
    // screen-space velocity (for camera look-ahead)
    const ssx = (mdx - mdy) / Math.max(dt, 1e-3) / spd, ssy = (mdx + mdy) / 2 / Math.max(dt, 1e-3) / spd;
    this.vsx += (ssx - this.vsx) * Math.min(1, dt * 3);
    this.vsy += (ssy - this.vsy) * Math.min(1, dt * 3);
    if (this.moving){
      this.idleT = 0; this.stuckT = 0;
      this.animT += dt * (this.running ? 1.45 : 1) * Math.min(1, moved / (SPEED * dt));
      if (Math.abs(mdx) > Math.abs(mdy) * 1.1) this.facing = mdx > 0 ? 1 : 3;
      else if (Math.abs(mdy) > Math.abs(mdx) * 1.1) this.facing = mdy > 0 ? 2 : 0;
      this.stepT -= dt * (this.running ? 1.4 : 1);
      if (this.stepT <= 0){ this.stepT = .26; if (window.AudioSys) AudioSys.footstep(); }
    } else {
      this.idleT += dt;
      // wedged on a corner for a moment → give up on the path
      if (this.path && len > .001 && !manual){
        this.stuckT = (this.stuckT || 0) + dt;
        if (this.stuckT > .3){ this.path = null; this.goal = null; this.stuckT = 0; }
      }
      this.stepT = 0;
    }
  },
  arrive(){
    const g = this.goal; this.goal = null;
    if (!g) return;
    if (g.face != null) this.facing = g.face;
    if (g.onArrive) g.onArrive();
  },
  collides(x, y){
    const x0 = Math.floor(x - R), x1 = Math.floor(x + R), y0 = Math.floor(y - R), y1 = Math.floor(y + R);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++){
      if (!World.isBlocked(tx, ty)) continue;
      const cx = Math.max(tx, Math.min(x, tx + 1)), cy = Math.max(ty, Math.min(y, ty + 1));
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < R * R) return true;
    }
    return false;
  },
  lineWalkable(ax, ay, bx, by){
    const d = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(d / .12));
    for (let i = 1; i <= steps; i++){
      const k = i / steps;
      if (this.collides(ax + (bx - ax) * k, ay + (by - ay) * k)) return false;
    }
    return true;
  },
  /* walkTo(wx, wy, { face, onArrive, slow }) */
  walkTo(wx, wy, opts){
    this.goal = null;
    this.speedMul = (opts && opts.slow) ? .5 : 1;
    wx = Math.max(R, Math.min(GW - R, wx)); wy = Math.max(R, Math.min(GH - R, wy));
    let gx = Math.floor(wx), gy = Math.floor(wy);
    if (World.isBlocked(gx, gy)){
      const n = this.nearestOpen(gx, gy);
      if (!n) return false;
      gx = n[0]; gy = n[1]; wx = gx + .5; wy = gy + .5;
    }
    const path = this.astar([Math.floor(this.x), Math.floor(this.y)], [gx, gy]);
    if (!path) return false;
    const pts = path.map(p => [p[0] + .5, p[1] + .5]);
    pts.push([wx, wy]);
    const smooth = [];
    let cx = this.x, cy = this.y, i = 0;
    while (i < pts.length){
      let j = pts.length - 1;
      for (; j > i; j--) if (this.lineWalkable(cx, cy, pts[j][0], pts[j][1])) break;
      smooth.push(pts[j]); cx = pts[j][0]; cy = pts[j][1]; i = j + 1;
    }
    while (smooth.length > 1 && Math.hypot(smooth[0][0] - this.x, smooth[0][1] - this.y) < .2) smooth.shift();
    this.path = smooth;
    this.goal = opts || null;
    return true;
  },
  nearestOpen(gx, gy){
    for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!World.isBlocked(gx + dx, gy + dy)) return [gx + dx, gy + dy];
    }
    return null;
  },
  astar(start, goal){
    if (start[0] === goal[0] && start[1] === goal[1]) return [goal];
    const key = (x, y) => y * GW + x;
    const open = [{ x: start[0], y: start[1], g: 0, f: 0 }];
    const came = new Map(), gs = new Map();
    gs.set(key(start[0], start[1]), 0);
    const h = (x, y) => { const ax = Math.abs(x - goal[0]), ay = Math.abs(y - goal[1]); return Math.max(ax, ay) + .4142 * Math.min(ax, ay); };
    const D = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.4142],[1,-1,1.4142],[-1,1,1.4142],[-1,-1,1.4142]];
    let guard = 0;
    while (open.length && guard++ < 3000){
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.x === goal[0] && cur.y === goal[1]){
        const path = [[cur.x, cur.y]];
        let k = key(cur.x, cur.y);
        while (came.has(k)){ k = came.get(k); path.unshift([k % GW, Math.floor(k / GW)]); }
        return path;
      }
      for (const d of D){
        const nx = cur.x + d[0], ny = cur.y + d[1];
        if (World.isBlocked(nx, ny)) continue;
        if (d[0] && d[1] && (World.isBlocked(cur.x + d[0], cur.y) || World.isBlocked(cur.x, cur.y + d[1]))) continue;
        const nk = key(nx, ny), ng = cur.g + d[2];
        if (gs.has(nk) && gs.get(nk) <= ng) continue;
        gs.set(nk, ng); came.set(nk, key(cur.x, cur.y));
        open.push({ x: nx, y: ny, g: ng, f: ng + h(nx, ny) });
      }
    }
    return null;
  },

  // ------------------------------------------------------------ drawing
  frame(){
    if (!this.moving) return 0;
    return 1 + (Math.floor(this.animT * 9) % 4);
  },
  draw(b, g, t){ Player.drawSprite(b, g, this.x, this.y, this.facing, this.frame(), false, t, this.idleT); },
  // floor reflection of the current frame (flat mirror line at the feet)
  drawRefl(b, W){
    const S = sprites();
    const cv = S.real[this.facing][this.frame()];
    if (!cv._refl){
      const spr = { cv, w: cv.width, h: cv.height, ox: 0, oy: 0 };
      W.makeRefl(spr, cv.width / 2, cv.height - 2, 0);
      cv._refl = spr;
    }
    const p = World.iso(this.x, this.y);
    const X = Math.round(p[0]) - (cv.width >> 1), Y = Math.round(p[1]) - cv.height + 1;
    W.drawRefl(b, cv._refl, X, Y);
  },
  drawShadow(b, ghost){
    if (ghost) return;
    const p = World.iso(this.x, this.y);
    const X = Math.round(p[0]), Y = Math.round(p[1]);
    b.fillStyle = 'rgba(4,2,10,.45)';
    b.fillRect(X - 5, Y - 1, 10, 2); b.fillRect(X - 3, Y - 2, 6, 4);
  },
  drawTag(b, t){
    if (this.labelT <= 0) return;
    const p = World.iso(this.x, this.y);
    b.globalAlpha = Math.min(1, this.labelT);
    const bob = Math.round(Math.sin(t * 5) * 1.5);
    PX.label(b, 'YOU', p[0], p[1] - 42 + bob, '#ffd23f');
    PX.text(b, '▼', p[0] - 2, p[1] - 34 + bob, '#ffd23f');
    b.globalAlpha = 1;
  },
  /* drawSprite(b, g, wx, wy, facing, frame, ghost, t, idle) */
  drawSprite(b, g, wx, wy, facing, fi, ghost, t, idle){
    const S = sprites();
    const set = ghost ? S.ghost : S.real;
    const cv = set[facing][fi || 0];
    const p = World.iso(wx, wy);
    // idle breathing: 1px dip every couple of seconds
    const breathe = !ghost && !fi && idle > .3 && (t % 2.4) > 1.9 ? 1 : 0;
    const shim = ghost ? Math.round(Math.sin(t * 3 + wx * 2 + wy) * .8) : 0;
    const X = Math.round(p[0]) - (cv.width >> 1), Y = Math.round(p[1]) - cv.height + 1 + breathe + shim;
    if (ghost){
      b.globalAlpha = .38 + .08 * Math.sin(t * 4 + wx);
      b.drawImage(cv, X, Y);
      b.globalAlpha = 1;
      g.globalAlpha = .25; g.drawImage(cv, X, Y); g.globalAlpha = 1;
    } else {
      b.drawImage(cv, X, Y);
      g.drawImage(S.sil[facing][fi || 0], X, Y);
      // blink
      if ((facing === 1 || facing === 2) && (t % 3.7) < .12){
        b.fillStyle = PAL.S;
        const ey = Y + 9 - (fi && WALK[fi][4] ? 1 : 0);
        b.fillRect(X + 4, ey, 2, 1); b.fillRect(X + 10, ey, 2, 1);
      }
    }
  },
};
})();
