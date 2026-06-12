/* player.js — amber-jacket kid: WASD/arrow movement with collision,
   tap-to-walk 8-dir A* + string-pulling smoothing, procedural walk animation.
   Player.drawSprite is reused by ghosts.js (ghost tint). */
(function(){
'use strict';
const { GW, GH } = window.CFG;
const SPEED = 3.4;        // tiles / s
const R = .28;            // collision radius (tiles)

const Player = window.Player = {
  x: 9, y: 2.7,
  facing: 2,              // 0=N(-y) 1=E(+x) 2=S(+y) 3=W(-x)
  moving: false,
  animT: 0, stepT: 0,
  path: null, goal: null,
  speedMul: 1,            // < 1 during the walk-in intro
  labelT: 4,              // "YOU" tag on spawn

  init(x, y){ this.x = x; this.y = y; this.labelT = 4; },

  // --------------------------------------------------------- movement
  update(dt, keys){
    if (this.labelT > 0) this.labelT -= dt;
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup'])    { dx -= 1; dy -= 1; }
    if (keys['s'] || keys['arrowdown'])  { dx += 1; dy += 1; }
    if (keys['a'] || keys['arrowleft'])  { dx -= 1; dy += 1; }
    if (keys['d'] || keys['arrowright']) { dx += 1; dy -= 1; }
    // (screen-relative: up on screen = -x-y in world, right = +x-y)

    if (dx || dy){
      this.path = null; this.goal = null;  // keys override tap-path
      this.speedMul = 1;
    } else if (this.path && this.path.length){
      const wp = this.path[0];
      dx = wp[0] - this.x; dy = wp[1] - this.y;
      const d = Math.hypot(dx, dy);
      if (d < .12){
        this.path.shift();
        if (!this.path.length){ this.path = null; this.arrive(); }
        dx = 0; dy = 0;
      }
    }

    const len = Math.hypot(dx, dy);
    this.moving = false;
    if (len > .001){
      dx /= len; dy /= len;
      const step = SPEED * this.speedMul * dt;
      const ox = this.x, oy = this.y;
      // axis-separated slide
      if (!this.collides(this.x + dx * step, this.y)) this.x += dx * step;
      if (!this.collides(this.x, this.y + dy * step)) this.y += dy * step;
      const mdx = this.x - ox, mdy = this.y - oy;
      if (Math.abs(mdx) > .0001 || Math.abs(mdy) > .0001){
        this.moving = true;
        this.animT += dt;
        // facing from dominant world axis
        if (Math.abs(mdx) > Math.abs(mdy)) this.facing = mdx > 0 ? 1 : 3;
        else this.facing = mdy > 0 ? 2 : 0;
        // footsteps
        this.stepT -= dt;
        if (this.stepT <= 0){
          this.stepT = .27;
          if (window.AudioSys) AudioSys.footstep();
        }
      } else if (this.path){
        // fully stuck on a corner — drop the path
        this.path = null; this.goal = null;
      }
    } else {
      this.stepT = 0;
    }
  },

  arrive(){
    const g = this.goal;
    this.goal = null;
    if (!g) return;
    if (g.face != null) this.facing = g.face;
    if (g.onArrive) g.onArrive();
  },

  collides(x, y){
    const x0 = Math.floor(x - R), x1 = Math.floor(x + R);
    const y0 = Math.floor(y - R), y1 = Math.floor(y + R);
    for (let ty = y0; ty <= y1; ty++){
      for (let tx = x0; tx <= x1; tx++){
        if (!World.isBlocked(tx, ty)) continue;
        // circle vs tile rect
        const cx = Math.max(tx, Math.min(x, tx + 1));
        const cy = Math.max(ty, Math.min(y, ty + 1));
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy < R * R) return true;
      }
    }
    return false;
  },

  // is the straight segment a→b walkable at player radius?
  lineWalkable(ax, ay, bx, by){
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(d / .12));
    for (let i = 1; i <= steps; i++){
      const k = i / steps;
      if (this.collides(ax + (bx - ax) * k, ay + (by - ay) * k)) return false;
    }
    return true;
  },

  // --------------------------------------------------------- pathfinding
  /* walkTo(wx, wy, opts) — opts: { face: 0..3, onArrive: fn, slow: bool }
     8-dir A* over tiles, then string-pulled into the fewest straight legs. */
  walkTo(wx, wy, opts){
    this.goal = null;
    this.speedMul = (opts && opts.slow) ? .55 : 1;
    wx = Math.max(R, Math.min(GW - R, wx));
    wy = Math.max(R, Math.min(GH - R, wy));
    let gx = Math.floor(wx), gy = Math.floor(wy);
    if (World.isBlocked(gx, gy)){
      const n = this.nearestOpen(gx, gy);
      if (!n) return;
      gx = n[0]; gy = n[1];
      wx = gx + .5; wy = gy + .5;
    }
    const start = [Math.floor(this.x), Math.floor(this.y)];
    const path = this.astar(start, [gx, gy]);
    if (!path) return;
    // tile centers, then the exact destination point
    let pts = path.map(p => [p[0] + .5, p[1] + .5]);
    pts.push([wx, wy]);
    // string-pulling: from the current position, repeatedly jump to the
    // furthest waypoint reachable in a straight line
    const smooth = [];
    let cx = this.x, cy = this.y, i = 0;
    while (i < pts.length){
      let j = pts.length - 1;
      for (; j > i; j--){
        if (this.lineWalkable(cx, cy, pts[j][0], pts[j][1])) break;
      }
      smooth.push(pts[j]);
      cx = pts[j][0]; cy = pts[j][1];
      i = j + 1;
    }
    // drop a leading waypoint that's basically where we stand
    while (smooth.length > 1 && Math.hypot(smooth[0][0] - this.x, smooth[0][1] - this.y) < .2) smooth.shift();
    this.path = smooth;
    this.goal = opts || null;
  },

  nearestOpen(gx, gy){
    for (let r = 1; r <= 3; r++){
      for (let dy = -r; dy <= r; dy++){
        for (let dx = -r; dx <= r; dx++){
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!World.isBlocked(gx + dx, gy + dy)) return [gx + dx, gy + dy];
        }
      }
    }
    return null;
  },

  astar(start, goal){
    if (start[0] === goal[0] && start[1] === goal[1]) return [goal];
    const key = (x, y) => y * GW + x;
    const open = [{ x: start[0], y: start[1], g: 0, f: 0 }];
    const came = new Map(), gScore = new Map();
    gScore.set(key(start[0], start[1]), 0);
    // octile heuristic for 8-dir movement
    const h = (x, y) => {
      const ax = Math.abs(x - goal[0]), ay = Math.abs(y - goal[1]);
      return Math.max(ax, ay) + .4142 * Math.min(ax, ay);
    };
    const DIRS = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
    ];
    let guard = 0;
    while (open.length && guard++ < 2600){
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.x === goal[0] && cur.y === goal[1]){
        const path = [[cur.x, cur.y]];
        let k = key(cur.x, cur.y);
        while (came.has(k)){
          k = came.get(k);
          path.unshift([k % GW, Math.floor(k / GW)]);
        }
        return path;
      }
      for (const d of DIRS){
        const nx = cur.x + d[0], ny = cur.y + d[1];
        if (World.isBlocked(nx, ny)) continue;
        // no corner cutting: a diagonal needs both orthogonal neighbours free
        if (d[0] && d[1] && (World.isBlocked(cur.x + d[0], cur.y) || World.isBlocked(cur.x, cur.y + d[1]))) continue;
        const nk = key(nx, ny);
        const ng = cur.g + d[2];
        if (gScore.has(nk) && gScore.get(nk) <= ng) continue;
        gScore.set(nk, ng);
        came.set(nk, key(cur.x, cur.y));
        open.push({ x: nx, y: ny, g: ng, f: ng + h(nx, ny) });
      }
    }
    return null;
  },

  // --------------------------------------------------------- drawing
  draw(c, t){
    const phase = this.moving ? (this.animT * 7 % 2 | 0) + 1 : 0;
    Player.drawSprite(c, this.x, this.y, this.facing, phase, false, t);
    // bouncing YOU tag on spawn
    if (this.labelT > 0){
      const p = World.iso(this.x, this.y);
      const bob = Math.sin(t * 5) * 1.5;
      const a = Math.min(1, this.labelT);
      c.globalAlpha = a;
      c.font = 'bold 6px monospace';
      const w = c.measureText('YOU').width;
      c.fillStyle = 'rgba(5,3,10,.78)';
      c.fillRect(p[0] - w / 2 - 2, p[1] - 28 + bob, w + 4, 8);
      c.fillStyle = '#ffd23f';
      c.fillText('YOU', p[0] - w / 2, p[1] - 21.5 + bob);
      c.fillText('▼', p[0] - 2.5, p[1] - 14.5 + bob);
      c.globalAlpha = 1;
    }
  },

  /* drawSprite(ctx, worldX, worldY, facing, phase, ghost, t)
     phase: 0 = idle, 1/2 = walk frames. Shared with ghosts.js. */
  drawSprite(c, wx, wy, facing, phase, ghost, t){
    const p = World.iso(wx, wy);
    t = t || 0;
    // ghosts get a faint vertical shimmer; the real player stays grounded
    const shim = ghost ? Math.round(Math.sin(t * 3 + wx * 2 + wy) * .8) : 0;
    const X = Math.round(p[0]), Y = Math.round(p[1]) + shim;

    // player: warm amber jacket + white sneakers (pops against the purple hall)
    // ghosts: pale uniform blue, more transparent, no shadow
    const PAL = ghost
      ? { hood: '#7d9fd8', hood2: '#6a87bc', face: '#cadcff', body: '#7d9fd8', pants: '#5a72a4', shoe: '#4a5e8c', sh: 'rgba(0,0,0,0)' }
      : { hood: '#ffb13c', hood2: '#c9641f', face: '#e8b88f', body: '#e85d2f', pants: '#3a3550', shoe: '#e8e4f0', sh: 'rgba(0,0,0,.4)' };

    if (ghost) c.globalAlpha = .3;

    // shadow (real player only — grounds them)
    if (!ghost){
      c.fillStyle = PAL.sh;
      c.fillRect(X - 4, Y - 1, 8, 2);
    }

    const bob = phase ? (phase === 1 ? -1 : 0) : 0;
    const legA = phase === 1 ? 1 : 0;
    const legB = phase === 2 ? 1 : 0;

    // 1px dark outline silhouette (real player only)
    if (!ghost){
      c.fillStyle = '#140d1a';
      c.fillRect(X - 4, Y - 16 + bob, 8, 8);          // head zone
      c.fillRect(X - 5, Y - 11 + bob, 10, 7);         // body zone
      c.fillRect(X - 4, Y - 6, 8, 5);                 // legs zone
    }

    // legs
    c.fillStyle = PAL.pants;
    c.fillRect(X - 3, Y - 5 - legA, 2, 4 + legA);
    c.fillRect(X + 1, Y - 5 - legB, 2, 4 + legB);
    c.fillStyle = PAL.shoe;
    c.fillRect(X - 3, Y - 2 - legA, 2, 1);
    c.fillRect(X + 1, Y - 2 - legB, 2, 1);

    // jacket body
    c.fillStyle = PAL.body;
    c.fillRect(X - 4, Y - 10 + bob, 8, 6);
    c.fillStyle = PAL.hood2;
    c.fillRect(X - 4, Y - 5 + bob, 8, 1);             // hem
    // arms hinted
    c.fillStyle = PAL.hood2;
    c.fillRect(X - 4, Y - 9 + bob, 1, 4);
    c.fillRect(X + 3, Y - 9 + bob, 1, 4);

    // hood + head
    c.fillStyle = PAL.hood;
    c.fillRect(X - 3, Y - 15 + bob, 6, 6);
    c.fillStyle = PAL.hood2;
    c.fillRect(X - 3, Y - 15 + bob, 6, 1);            // hood rim

    // face shows when facing S or E/W (not from behind)
    if (facing !== 0){
      const blink = !ghost && (t % 3.7) < .12;
      c.fillStyle = blink ? PAL.hood2 : PAL.face;
      const fx = facing === 1 ? X : (facing === 3 ? X - 2 : X - 1);
      c.fillRect(fx, Y - 13 + bob, 3, 3);
      if (!blink && facing === 2){
        c.fillStyle = '#1a1626';
        c.fillRect(X - 1, Y - 12 + bob, 1, 1);
        c.fillRect(X + 1, Y - 12 + bob, 1, 1);
      }
    }
    if (ghost) c.globalAlpha = 1;
  },
};
})();
