/* cabinets.js — one baked voxel cabinet per game (lit + dim variants, glow
   map, focus ring), attract-mode screens (pixel layer + crisp CRT overlay),
   focus / coin / launch flow, the coffee machine and the resident cat.
   Cabinet spots come from CFG.LAYOUT. Exposes window.Cabinets. */
(function(){
'use strict';
const { TAG_COLORS } = window.CFG;
const T = 16;
const SR = Models.SCREEN_RECT;            // x0 4, w 24, zTop 41, h 12, plane 10
const FOCUS_DIST = 1.2;
const COIN_KEY = 'v2e2_coins';

const Cabinets = window.Cabinets = {
  items: [], cabs: [], coffee: null,
  focused: null, hoverItem: null,
  state: 'idle', seqT: 0, active: null, coinFrom: null, msg: '',
  imgShown: false, navigated: false, camStart: null,
  glitchIn: 4, catCab: null, catAwake: 0, _coins: null,
  onFocusChange: null, onCoin: null, onCoffee: null, onLaunch: null,

  // ----------------------------------------------------------------- init
  init(){
    try { this._coins = JSON.parse(localStorage.getItem(COIN_KEY)) || {}; } catch (e){ this._coins = {}; }
    if (typeof this._coins !== 'object' || !this._coins) this._coins = {};
    const rng = World.mulberry32(4242);
    GAMES.forEach((game, i) => {
      const L = CFG.LAYOUT[i];
      const cab = {
        idx: i, game, f: L.f, tx: L.tx, ty: L.ty,
        color: TAG_COLORS[game.tag] || '#ffffff',
        wake: 0, phantom: 0, hoverK: 0, glitchT: 0,
        flickSeed: rng() * 100, mini: null, imgFull: null,
      };
      const bake = dim => {
        let m = Models.cabinet(cab, dim);
        if (L.f === 'E') m = Vox.faceEast(m);
        m.wx = L.tx * T; m.wy = L.ty * T;
        return Vox.bake(m);
      };
      cab.spr = bake(false);
      cab.sprDim = bake(true);
      cab.spr.sil = PX.silhouette(cab.spr.cv, '#000');
      // floor mirror along the visible front edge (+y for wall-back/centre, +x for left wall)
      if (L.f === 'S') World.makeRefl(cab.spr, -16, 8, .5); else World.makeRefl(cab.spr, -16, 24, -.5);
      cab.ring = PX.ring(cab.spr.cv, cab.color);
      cab.ringW = PX.ring(cab.spr.cv, '#fff6d8');
      if (L.f === 'S'){
        cab.tiles = [[L.tx, L.ty], [L.tx + 1, L.ty]];
        cab.frontPoint = [L.tx + 1, L.ty + 1.8];
        cab.foot = [L.tx, L.ty, L.tx + 2, L.ty + 1];
        cab.top = PX.proj(L.tx * T + 16, L.ty * T + 8, 60);
        // screen texel (u,v) → world screen: affine [a b c d e f]
        const X0 = L.tx * T + SR.x0, Ys = L.ty * T + SR.plane;
        cab.scr = [1, .5, 0, 1, X0 - Ys, (X0 + Ys) / 2 - (SR.zTop + 1)];
        cab.blit = (ctx, src) => PX.blitY(ctx, src, 0, 0, SR.w, SR.h, X0, Ys, SR.zTop);
        cab.slot = PX.proj(L.tx * T + 18, L.ty * T + 13, 14);
      } else {
        cab.tiles = [[L.tx, L.ty], [L.tx, L.ty + 1]];
        cab.frontPoint = [L.tx + 1.8, L.ty + 1];
        cab.foot = [L.tx, L.ty, L.tx + 1, L.ty + 2];
        cab.top = PX.proj(L.tx * T + 8, L.ty * T + 16, 60);
        const X = L.tx * T + SR.plane, y1 = L.ty * T + 31 - SR.x0;
        cab.scr = [1, -.5, 0, 1, X - y1 - 1, (X + y1 + 1) / 2 - (SR.zTop + 1)];
        cab.blit = (ctx, src) => PX.blitX(ctx, src, 0, 0, SR.w, SR.h, X, y1, SR.zTop);
        cab.slot = PX.proj(L.tx * T + 13, L.ty * T + 13, 14);
      }
      cab.depth = L.tx + L.ty + .5;
      cab.floorGlow = World.glowBlob(cab.color, 20, 10);
      for (const tl of cab.tiles) World.block(tl[0], tl[1]);
      this.cabs.push(cab); this.items.push(cab);
    });
    this.catCab = this.cabs.find(cb => cb.f === 'S' && cb.ty > 2) || this.cabs[this.cabs.length - 1];

    // coffee machine, just left of the entrance
    const cm = Object.assign(Models.coffee(), { wx: 7 * T, wy: T });
    const cf = this.coffee = {
      coffee: true, tx: 7, ty: 1, color: '#ffd23f', wake: 0, phantom: 0, hoverK: 0,
      tiles: [[7, 1]], frontPoint: [7.5, 2.6], depth: 9.5, foot: [7, 1, 8, 2], msgT: 0,
      spr: Vox.bake(cm), top: PX.proj(7 * T + 8, T + 8, 52),
    };
    cf.spr.sil = PX.silhouette(cf.spr.cv, '#000');
    World.makeRefl(cf.spr, -16, 8, .5);
    cf.ring = PX.ring(cf.spr.cv, '#ffd23f');
    cf.floorGlow = World.glowBlob('#ffb45c', 12, 6);
    World.block(7, 1);
    this.items.push(cf);

    this.msgCv = PX.canvas(SR.w, SR.h);
    this.scratch = PX.canvas(SR.w, SR.h);
    this.makePlaceholders();
    this.loadScreens();
    this.coinSpr = [5, 3, 1, 3].map(w => {
      const c = PX.canvas(5, 5), x = c.getContext('2d');
      const o = (5 - w) / 2;
      x.fillStyle = '#8a5a0a'; x.fillRect(o, 0, w, 5);
      x.fillStyle = '#ffd23f'; x.fillRect(o, 1, w, 3);
      if (w > 2){ x.fillStyle = '#fff3a8'; x.fillRect(o + 1, 1, 1, 2); }
      return c;
    });
  },

  makePlaceholders(){
    for (const cab of this.cabs){
      const cv = PX.canvas(SR.w, SR.h), c = cv.getContext('2d');
      for (let y = 0; y < SR.h; y++) for (let x = 0; x < SR.w; x++){
        const v = 14 + PX.hash(x, y, cab.idx) * 50 | 0;
        c.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 16) + ')';
        c.fillRect(x, y, 1, 1);
      }
      cab.mini = cv;
    }
  },

  // the pixel-layer screen: cover-cropped straight down to 24×12 (auto pixelation)
  toMini(src, sx, sy, sw, sh){
    const cv = PX.canvas(SR.w, SR.h), c = cv.getContext('2d');
    c.imageSmoothingEnabled = true;
    const s = Math.max(SR.w / sw, SR.h / sh);
    const w = SR.w / s, h = SR.h / s;
    c.filter = 'contrast(1.1) saturate(1.3) brightness(.82)';
    c.drawImage(src, sx + (sw - w) / 2, sy + (sh - h) / 2, w, h, 0, 0, SR.w, SR.h);
    c.filter = 'none';
    c.fillStyle = 'rgba(0,0,0,.16)';
    for (let y = 1; y < SR.h; y += 2) c.fillRect(0, y, SR.w, 1);
    return cv;
  },
  loadScreens(){
    for (const cab of this.cabs){
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { cab.imgFull = img; cab.mini = this.toMini(img, 0, 0, img.width, img.height); };
      img.src = cab.game.img;
      const animSrc = cab.game.img.replace(/screenshots\/([^/]+)$/, 'screenshots/anim/$1');
      if (animSrc !== cab.game.img){
        const strip = new Image();
        strip.decoding = 'async';
        strip.onload = () => {
          const fh = strip.height, fw = Math.round(fh * (304 / 220));
          const n = Math.max(1, Math.round(strip.width / fw));
          if (n < 2) return;
          cab.anim = { img: strip, n, fw, fh };
          cab.animMinis = [];
          for (let f = 0; f < n; f++) cab.animMinis.push(this.toMini(strip, f * fw, 0, fw, fh));
        };
        strip.src = animSrc;
      }
    }
  },
  animFrame(cab, t){ return cab.anim ? Math.floor(t * 2.4 + cab.idx * .7) % cab.anim.n : -1; },

  list(){ return this.items; },
  launching(){ return this.state !== 'idle'; },
  setHover(item){ this.hoverItem = item; },

  // ----------------------------------------------------------------- coins
  addCoin(idx){
    this._coins[idx] = (this._coins[idx] || 0) + 1;
    try { localStorage.setItem(COIN_KEY, JSON.stringify(this._coins)); } catch (e){}
  },
  coinsFor(idx){ return this._coins[idx] || 0; },
  coinTotal(){ let n = 0; for (const k in this._coins) n += this._coins[k]; return n; },
  topScores(n){
    return Object.keys(this._coins)
      .map(k => ({ idx: +k, n: this._coins[k], short: (GAMES[+k] && (GAMES[+k].short || GAMES[+k].name)) || '?' }))
      .sort((a, b) => b.n - a.n).slice(0, n);
  },

  // ----------------------------------------------------------------- update
  update(dt, t, player){
    for (const it of this.items){
      const target = (this.focused === it || this.active === it) ? 1 : 0;
      it.wake += (target - it.wake) * Math.min(1, dt * 6);
      it.hoverK += ((this.hoverItem === it ? 1 : 0) - it.hoverK) * Math.min(1, dt * 8);
      it.phantom = Math.max(0, it.phantom - dt * .8);
      if (it.glitchT) it.glitchT = Math.max(0, it.glitchT - dt);
      if (it.msgT) it.msgT = Math.max(0, it.msgT - dt);
    }
    this.glitchIn -= dt;
    if (this.glitchIn <= 0){
      this.glitchIn = 5 + Math.random() * 7;
      this.cabs[Math.random() * this.cabs.length | 0].glitchT = .35;
    }
    if (this.catCab){
      const dx = player.x - (this.catCab.tx + 1), dy = player.y - (this.catCab.ty + .5);
      const near = (dx * dx + dy * dy) < 3.2 ? 1 : 0;
      this.catAwake += (near - this.catAwake) * Math.min(1, dt * 3);
    }
    if (this.state === 'idle' && !this.navigated){
      let best = null, bestD = FOCUS_DIST * FOCUS_DIST;
      for (const it of this.items){
        const dx = player.x - it.frontPoint[0], dy = player.y - it.frontPoint[1];
        const d = dx * dx + dy * dy;
        if (d < bestD){ bestD = d; best = it; }
      }
      if (best !== this.focused){
        this.focused = best;
        if (this.onFocusChange) this.onFocusChange(best);
      }
    }
    this.updateSequence(dt);
  },

  updateSequence(dt){
    if (this.state === 'idle') return;
    this.seqT += dt;
    if (this.state === 'coin'){
      if (this.seqT >= .45){ AudioSys.coin(); this.state = 'msg'; this.seqT = 0; this.msg = 'CREDIT 1'; }
    } else if (this.state === 'msg'){
      if (this.seqT >= .4 && this.msg !== 'PRESS START') this.msg = 'PRESS START';
      if (this.seqT >= .85) this.beginLaunch();
    } else if (this.state === 'launch'){
      const p = Math.min(1, this.seqT / 1.1);
      if (p >= .45 && !this.imgShown) this.showFullRes(.45);
      if (p >= 1 && !this.navigated) this.finishNow(false);
    }
  },
  beginLaunch(){
    this.state = 'launch'; this.seqT = 0; this.msg = '';
    this.camStart = { x: World.cam.x, y: World.cam.y, z: World.cam.z };
    AudioSys.sweep();
  },
  showFullRes(dur){
    this.imgShown = true;
    const img = document.getElementById('launchImg');
    img.src = this.active.game.img;
    img.style.display = 'block';
    img.style.transition = 'opacity ' + dur + 's ease-in';
    requestAnimationFrame(() => { img.style.opacity = 1; });
  },
  finishNow(skipped){
    if (this.navigated) return;
    this.navigated = true;
    if (!this.imgShown) this.showFullRes(.12);
    const url = this.active.game.url;
    const go = () => { Ghosts.persist(); window.location.href = url; };
    if (window.pixelDissolve) window.pixelDissolve(skipped ? 180 : 320, go); else setTimeout(go, 150);
  },
  screenPt(cab, u, v){
    const m = cab.scr;
    return [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];
  },
  screenCenter(cab){ return this.screenPt(cab, SR.w / 2, SR.h / 2); },
  getCamOverride(){
    if (this.state !== 'launch' || !this.camStart) return null;
    const p = Math.min(1, this.seqT / 1.1);
    const e = p * p * (3 - 2 * p) * p;
    const sc = this.screenCenter(this.active);
    const zEnd = Math.max(5, (World.vhCss / World.P) / (SR.h + 2));
    return {
      x: this.camStart.x + (sc[0] - this.camStart.x) * e,
      y: this.camStart.y + (sc[1] - this.camStart.y) * e,
      z: this.camStart.z + (zEnd - this.camStart.z) * e, snap: 1,
    };
  },

  // ----------------------------------------------------------------- input
  insertCoin(){
    if (this.navigated) return;
    if (this.state !== 'idle'){ this.finishNow(true); return; }
    const it = this.focused;
    if (!it) return;
    if (it.coffee){
      AudioSys.coin(); it.msgT = 1.8;
      if (this.onCoffee) this.onCoffee();
      return;
    }
    this.active = it;
    this.state = 'coin'; this.seqT = 0;
    this.coinFrom = World.iso(Player.x, Player.y);
    this.addCoin(it.idx);
    if (this.onCoin) this.onCoin(it);
  },
  phantomWake(i){ if (i >= 0 && i < this.cabs.length) this.cabs[i].phantom = 1; },

  // screen-space hit test against the actual sprite pixels (front-most wins),
  // falling back to the floor tiles / front spot
  hitTest(w){
    let best = null, bd = -1e9;
    for (const it of this.items){
      const o = World.iso(it.tx, it.ty);
      if (Vox.hit(it.spr, w.sx - o[0], w.sy - o[1]) && it.depth > bd){ best = it; bd = it.depth; }
    }
    if (!best){
      for (const it of this.items){
        const fx = it.frontPoint[0] - w.x, fy = it.frontPoint[1] - w.y;
        let hit = fx * fx + fy * fy < .9;
        const tx = Math.floor(w.x), ty = Math.floor(w.y);
        for (const tl of it.tiles) if (tl[0] === tx && tl[1] === ty) hit = true;
        if (hit){ best = it; break; }
      }
    }
    return best ? { item: best, frontPoint: best.frontPoint, focused: this.focused === best } : null;
  },
  // Tab / shoulder buttons: the next cabinet in list order from the focused one
  nextTarget(dir){
    const cur = this.focused && !this.focused.coffee ? this.focused.idx : (this._lastTarget == null ? -1 : this._lastTarget);
    const n = this.cabs.length;
    const i = ((cur + dir) % n + n) % n;
    this._lastTarget = i;
    return this.cabs[i];
  },

  // ----------------------------------------------------------------- draw
  collectDrawables(items, t){
    const b = World.bctx, g = World.gctx;
    for (const cab of this.cabs){
      items.push({ depth: cab.depth, foot: cab.foot, draw: () => this.drawCabinet(b, g, cab, t) });
      if (cab === this.catCab) items.push({ depth: cab.depth + .01, foot: cab.foot, draw: () => this.drawCat(b, cab, t) });
    }
    const cf = this.coffee;
    items.push({ depth: cf.depth, foot: cf.foot, draw: () => this.drawCoffee(b, g, cf, t) });
  },
  litOf(cab){ return Math.max(cab.wake, cab.phantom * .7, (cab.hoverK || 0) * .6); },

  drawReflections(b, W){
    for (const it of this.items){
      const o = World.iso(it.tx, it.ty);
      W.drawRefl(b, it.spr, o[0] + it.spr.ox, o[1] + it.spr.oy);
    }
  },

  drawFloorGlow(b, g, t){
    b.globalCompositeOperation = 'lighter';
    for (const it of this.items){
      const lit = this.litOf(it);
      if (lit < .03) continue;
      const p = World.iso(it.frontPoint[0], it.frontPoint[1] - .45);
      const fg = it.floorGlow;
      b.globalAlpha = lit * .75;
      b.drawImage(fg, Math.round(p[0] - fg.width / 2), Math.round(p[1] - fg.height / 2));
    }
    b.globalAlpha = 1;
    b.globalCompositeOperation = 'source-over';
  },

  drawCabinet(b, g, cab, t){
    const o = World.iso(cab.tx, cab.ty);
    const lit = this.litOf(cab);
    let spr = cab.spr;
    if (lit < .5 && Math.sin(t * 2.1 + cab.flickSeed * 3.7) > .985) spr = cab.sprDim;   // marquee dropout
    const x = o[0] + spr.ox, y = o[1] + spr.oy;
    b.drawImage(spr.cv, x, y);
    g.drawImage(cab.spr.sil, x, y);
    if (spr.glow){
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = .7 + lit * .5;
      g.drawImage(spr.glow, x, y);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    // screen contents
    let src;
    if (this.active === cab && this.msg){
      src = this.msgCv;
      const c = src.getContext('2d');
      c.fillStyle = '#05040a'; c.fillRect(0, 0, SR.w, SR.h);
      const blink = this.msg !== 'PRESS START' || (t * 3 % 1) < .65;
      if (blink){
        const parts = this.msg.split(' ');
        PX.text(c, parts[0], (SR.w - PX.textW(parts[0])) / 2, 0, '#ffd23f');
        if (parts[1]) PX.text(c, parts[1], (SR.w - PX.textW(parts[1])) / 2, 6, '#ffd23f');
      }
    } else {
      const fi = this.animFrame(cab, t);
      src = fi >= 0 ? cab.animMinis[fi] : cab.mini;
      if (cab.glitchT > 0){
        const s = this.scratch, c = s.getContext('2d');
        const off = Math.round(Math.sin(t * 71 + cab.idx) * 3);
        c.clearRect(0, 0, SR.w, SR.h);
        c.drawImage(src, 0, 0, SR.w, 4, off, 0, SR.w, 4);
        c.drawImage(src, 0, 4, SR.w, 4, -off, 4, SR.w, 4);
        c.drawImage(src, 0, 8, SR.w, 4, off >> 1, 8, SR.w, 4);
        src = s;
      }
    }
    let a = .72 + .2 * Math.max(lit, cab.phantom * .8);
    if (lit < .5 && Math.sin(t * 5.3 + cab.flickSeed * 7.1) > .992) a *= .35;
    cab._shownAlpha = a;
    b.globalAlpha = a;
    cab.blit(b, src);
    b.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .18 + lit * .25;
    cab.blit(g, src);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // focus / hover ring
    if (lit > .08){
      const pulse = this.focused === cab ? .75 + .25 * Math.sin(t * 6) : 1;
      b.globalAlpha = Math.min(1, lit * 1.4) * pulse;
      b.drawImage(this.focused === cab && (t * 2 % 1) < .5 ? cab.ringW : cab.ring, x, y);
      g.globalAlpha = lit * .8;
      g.drawImage(cab.ring, x, y);
      b.globalAlpha = 1; g.globalAlpha = 1;
    }
  },

  drawCoffee(b, g, cf, t){
    const o = World.iso(cf.tx, cf.ty);
    const x = o[0] + cf.spr.ox, y = o[1] + cf.spr.oy;
    b.drawImage(cf.spr.cv, x, y);
    g.drawImage(cf.spr.sil, x, y);
    if (cf.spr.glow){ g.globalCompositeOperation = 'lighter'; g.drawImage(cf.spr.glow, x, y); g.globalCompositeOperation = 'source-over'; }
    const lit = this.litOf(cf);
    if (lit > .08){ b.globalAlpha = Math.min(1, lit * 1.4); b.drawImage(cf.ring, x, y); b.globalAlpha = 1; }
  },

  // the resident cat, curled on a cabinet; lifts its head when you come close
  drawCat(b, cab, t){
    const top = cab.top;
    const X = Math.round(top[0]) - 6, Y = Math.round(top[1]) - 1;
    const awake = this.catAwake > .5;
    const breathe = Math.sin(t * 1.6) > .2 ? 0 : 1;
    const flick = (t % 7) > 6.5;
    if (!this._catA){
      const pal = { o: '#e0a060', O: '#f4c890', t: '#a8672e', e: '#1a1024', p: '#ff9ab0', w: '#fff3dc' };
      this._catA = PX.grid([
        '...........',
        '...........',
        '..toOOOot..',
        '.toOOtOOOt.',
        'oOOOOtOOOOt',
        'toooooooott',
        '.tttttttt..'], pal, true);
      this._catA2 = PX.grid([
        '...........',
        '...........',
        '...........',
        '..toOOOot..',
        'otOOOtOOOOt',
        'toooooooott',
        '.tttttttt..'], pal, true);
      this._catHeadSleep = PX.grid(['o..o', 'oOOo', 'tttO'], pal, true);
      this._catHeadAwake = PX.grid(['o..o', 'oOOo', 'eOeO', 'OpOO'], pal, true);
      this._catTail = PX.grid(['.t', 't.', 't.'], pal, true);
    }
    b.drawImage(breathe ? this._catA2 : this._catA, X, Y - 8);
    if (awake) b.drawImage(this._catHeadAwake, X - 3, Y - 12);
    else b.drawImage(this._catHeadSleep, X - 2, Y - 7);
    if (flick) b.drawImage(this._catTail, X + 10, Y - 9);
    if (!awake && (t % 3) < 1.7) PX.text(b, 'Z', X + 9, Y - 16 - ((t % 3) * 2 | 0), '#cfd8ff');
  },

  // labels + coin arc (world space, pixel font)
  drawFx(b, g, t){
    const cf = this.coffee;
    if (cf.msgT > 0) PX.label(b, 'THANKS! ♥', cf.top[0], cf.top[1] - 12, '#ff7ab8');
    else if (this.focused === cf || cf.hoverK > .5) PX.label(b, 'COFFEE · 1 COIN', cf.top[0], cf.top[1] - 12, '#ffd23f');

    if (this.state === 'idle'){
      const h = this.hoverItem;
      if (h && h !== this.focused && !h.coffee) PX.label(b, h.game.name.toUpperCase(), h.top[0], h.top[1] - 12, h.color);
      const f = this.focused;
      if (f && !f.coffee){
        const bob = Math.round(Math.sin(t * 4) * 1.5);
        PX.label(b, f.game.name.toUpperCase(), f.top[0], f.top[1] - 22 + bob, '#ffffff');
        if ((t * 1.6 % 1) < .62) PX.label(b, 'INSERT COIN ▮', f.top[0], f.top[1] - 11 + bob, '#ffd23f');
      }
    } else if (this.state === 'msg' && this.active){
      const blink = this.msg !== 'PRESS START' || (t * 3 % 1) < .65;
      if (blink) PX.label(b, this.msg, this.active.top[0], this.active.top[1] - 12, '#ffffff');
    }
    if (this.state === 'coin' && this.active){
      const p = Math.min(1, this.seqT / .45);
      const s = this.active.slot, f0 = this.coinFrom;
      const x = f0[0] + (s[0] - f0[0]) * p;
      const y = (f0[1] - 14) + (s[1] - f0[1] + 14) * p - Math.sin(p * Math.PI) * 22;
      const spr = this.coinSpr[(p * 12 | 0) % 4];
      b.drawImage(spr, Math.round(x - 2), Math.round(y - 2));
      g.drawImage(spr, Math.round(x - 2), Math.round(y - 2));
    }
  },

  // crisp device-resolution CRT screens (camera transform already applied)
  drawCrispScreens(c, t, player){
    const pp = World.iso(player.x, player.y);
    for (const cab of this.cabs){
      if (!cab.imgFull || cab.glitchT > 0) continue;
      if (this.active === cab && this.msg) continue;
      const m = cab.scr;
      // punch the player out if they stand in front of (and overlap) the screen
      let occl = false;
      if (!World.structOccludesPlayer(cab.foot, player.x, player.y)){
        const a = this.screenPt(cab, 0, 0), d = this.screenPt(cab, SR.w, SR.h);
        const x0 = Math.min(a[0], d[0]), x1 = Math.max(a[0], d[0]);
        const y0 = Math.min(a[1], d[1]) - 12, y1 = Math.max(a[1], d[1]) + 12;
        occl = pp[0] + 8 > x0 && pp[0] - 8 < x1 && pp[1] + 2 > y0 && pp[1] - 26 < y1;
      }
      c.save();
      c.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      if (occl){
        const inv = (X, Y) => { const lx = X - m[4]; return [lx, Y - m[5] - m[1] * lx]; };
        const q = [inv(pp[0] - 8, pp[1] - 26), inv(pp[0] + 8, pp[1] - 26), inv(pp[0] + 8, pp[1] + 2), inv(pp[0] - 8, pp[1] + 2)];
        c.beginPath();
        c.rect(0, 0, SR.w, SR.h);
        c.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) c.lineTo(q[i][0], q[i][1]); c.closePath();
        c.clip('evenodd');
      }
      c.globalAlpha = cab._shownAlpha != null ? cab._shownAlpha : .84;
      const fi = this.animFrame(cab, t);
      let src = cab.imgFull, sx0 = 0, sw = src.width, sh = src.height;
      if (fi >= 0){ src = cab.anim.img; sw = cab.anim.fw; sh = cab.anim.fh; sx0 = fi * cab.anim.fw; }
      const s = Math.max(SR.w / sw, SR.h / sh);
      const cw = SR.w / s, ch = SR.h / s;
      c.drawImage(src, sx0 + (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, SR.w, SR.h);
      // CRT: scanlines, curvature shading, glass glint
      c.globalAlpha = .28;
      c.fillStyle = '#000';
      for (let y = 0; y < SR.h; y += 1) c.fillRect(0, y + .5, SR.w, .3);
      const gr = c.createRadialGradient(SR.w / 2, SR.h / 2, SR.h * .3, SR.w / 2, SR.h / 2, SR.w * .62);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.55)');
      c.globalAlpha = 1; c.fillStyle = gr; c.fillRect(0, 0, SR.w, SR.h);
      c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(1, 1, 3, SR.h - 2);
      c.restore();
    }
    c.globalAlpha = 1;
  },
};
})();
