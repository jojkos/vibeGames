/* cabinets.js — cabinet drawing, attract mode, focus / coin / launch flow,
   the in-world coffee vending machine, crisp-screen overlay rendering,
   marquee name scroll, hover highlight, coin stats and the resident cat.
   Cabinet spots come from CFG.LAYOUT (generated from the games list).
   Exposes window.Cabinets. */
(function(){
'use strict';
const { TW, TH, TAG_COLORS, BASE_ZOOM } = window.CFG;
const TW2 = TW / 2, TH2 = TH / 2;
const CH = 34;            // cabinet height (px)
const FACE_W = 24;        // front face width (px) — 2 tiles
const SCREEN = { x: 3, w: 18, top: 25, h: 13 };  // on the front face (h = height above floor of screen top)
const FOCUS_DIST = 1.18;
const COIN_KEY = 'v2e_coins';

function shade(hex, k){
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

const Cabinets = window.Cabinets = {
  items: [],          // cabinets + coffee machine
  cabs: [],           // cabinets only
  coffee: null,
  focused: null,
  hoverItem: null,
  state: 'idle',      // idle | coin | msg | launch
  seqT: 0, active: null, coinFrom: null, msg: '',
  imgShown: false, navigated: false,
  camStart: null,
  glitchIn: 4,
  catCab: null, catAwake: 0,
  _coins: null,
  onFocusChange: null, onCoin: null, onCoffee: null,

  // ----------------------------------------------------------------- init
  init(){
    const rng = World.mulberry32(4242);
    try { this._coins = JSON.parse(localStorage.getItem(COIN_KEY)) || {}; }
    catch (e){ this._coins = {}; }
    if (typeof this._coins !== 'object' || !this._coins) this._coins = {};

    GAMES.forEach((game, i) => {
      const L = CFG.LAYOUT[i];
      const cab = {
        idx: i, game, f: L.f, tx: L.tx, ty: L.ty,
        color: TAG_COLORS[game.tag] || '#ffffff',
        wake: 0, phantom: 0, hoverK: 0, glitchT: 0,
        flickSeed: rng() * 100,
        mini: null, imgFull: null,
      };
      if (L.f === 'S'){
        cab.tiles = [[L.tx, L.ty], [L.tx + 1, L.ty]];
        cab.faceO = World.iso(L.tx, L.ty + 1); cab.faceSlope = .5;
        cab.sideO = World.iso(L.tx + 2, L.ty + 1); cab.sideSlope = -.5;
        cab.top = [[L.tx, L.ty], [L.tx + 2, L.ty], [L.tx + 2, L.ty + 1], [L.tx, L.ty + 1]];
        cab.frontPoint = [L.tx + 1, L.ty + 1.8];
        cab.depth = (L.tx + 1) + (L.ty + 1);
        cab.labelAt = World.iso(L.tx + 1, L.ty + .5);
      } else { // 'E' — left wall, 1 wide × 2 deep
        cab.tiles = [[L.tx, L.ty], [L.tx, L.ty + 1]];
        cab.faceO = World.iso(L.tx + 1, L.ty + 2); cab.faceSlope = -.5;
        cab.sideO = World.iso(L.tx, L.ty + 2); cab.sideSlope = .5;
        cab.top = [[L.tx, L.ty], [L.tx + 1, L.ty], [L.tx + 1, L.ty + 2], [L.tx, L.ty + 2]];
        cab.frontPoint = [L.tx + 1.8, L.ty + 1];
        cab.depth = (L.tx + 1) + (L.ty + 1);
        cab.labelAt = World.iso(L.tx + .5, L.ty + 1);
      }
      for (const tl of cab.tiles) World.block(tl[0], tl[1]);
      this.cabs.push(cab);
      this.items.push(cab);
    });

    // the cat sleeps on the first center-row cabinet (falls back to the last one)
    this.catCab = this.cabs.find(cb => cb.f === 'S' && cb.ty > 2) || this.cabs[this.cabs.length - 1];

    // coffee vending machine, just left of the entrance door
    this.coffee = {
      coffee: true, tx: 7, ty: 1,
      color: '#ffd23f', wake: 0, phantom: 0, hoverK: 0,
      tiles: [[7, 1]],
      frontPoint: [7.5, 2.6],
      depth: 7.5 + 2,
      labelAt: World.iso(7.5, 1.5),
      msgT: 0,
    };
    World.block(7, 1);
    this.items.push(this.coffee);

    this.makePlaceholders();
    this.loadScreens();
  },

  facePt(cab, lx, h){  // point on the front face: lx along face, h above floor
    return [cab.faceO[0] + lx, cab.faceO[1] + lx * cab.faceSlope - h];
  },
  screenCenter(cab){ return this.facePt(cab, FACE_W / 2, SCREEN.top - SCREEN.h / 2); },

  makePlaceholders(){
    // static-noise placeholder until each screenshot decodes
    for (const cab of this.cabs){
      const cv = document.createElement('canvas');
      cv.width = SCREEN.w; cv.height = SCREEN.h;
      const c = cv.getContext('2d');
      const rng = World.mulberry32(cab.idx * 99 + 5);
      for (let y = 0; y < SCREEN.h; y++){
        for (let x = 0; x < SCREEN.w; x++){
          const v = 14 + rng() * 50 | 0;
          c.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 14) + ')';
          c.fillRect(x, y, 1, 1);
        }
      }
      cab.mini = cv;
    }
  },

  loadScreens(){
    for (const cab of this.cabs){
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        cab.imgFull = img;                       // crisp overlay source
        const cv = document.createElement('canvas');
        cv.width = SCREEN.w; cv.height = SCREEN.h;
        const c = cv.getContext('2d');
        // cover-crop into the tiny screen → low-res fallback / glitch frames
        const s = Math.max(SCREEN.w / img.width, SCREEN.h / img.height);
        const dw = img.width * s, dh = img.height * s;
        c.drawImage(img, (SCREEN.w - dw) / 2, (SCREEN.h - dh) / 2, dw, dh);
        // gentle scanline darkening, every other row
        c.fillStyle = 'rgba(0,0,0,.10)';
        for (let y = 0; y < SCREEN.h; y += 2) c.fillRect(0, y, SCREEN.w, 1);
        cab.mini = cv;
      };
      img.src = cab.game.img;
    }
  },

  list(){ return this.items; },
  launching(){ return this.state !== 'idle'; },
  setHover(item){ this.hoverItem = item; },

  // ----------------------------------------------------------------- coins
  addCoin(idx){
    this._coins[idx] = (this._coins[idx] || 0) + 1;
    try { localStorage.setItem(COIN_KEY, JSON.stringify(this._coins)); } catch (e){}
  },
  coinTotal(){
    let n = 0;
    for (const k in this._coins) n += this._coins[k];
    return n;
  },
  topScores(n){
    return Object.keys(this._coins)
      .map(k => ({ idx: +k, n: this._coins[k], short: (GAMES[+k] && (GAMES[+k].short || GAMES[+k].name)) || '?' }))
      .sort((a, b) => b.n - a.n)
      .slice(0, n);
  },

  // ----------------------------------------------------------------- update
  update(dt, t, player){
    // wake/hover lerp + phantom decay
    for (const it of this.items){
      const target = (this.focused === it || this.active === it) ? 1 : 0;
      it.wake += (target - it.wake) * Math.min(1, dt * 6);
      const hov = this.hoverItem === it ? 1 : 0;
      it.hoverK += (hov - it.hoverK) * Math.min(1, dt * 8);
      it.phantom = Math.max(0, it.phantom - dt * .8);
      if (it.glitchT) it.glitchT = Math.max(0, it.glitchT - dt);
      if (it.msgT) it.msgT = Math.max(0, it.msgT - dt);
    }
    // pick a random cabinet to demo-glitch now and then
    this.glitchIn -= dt;
    if (this.glitchIn <= 0){
      this.glitchIn = 5 + Math.random() * 7;
      this.cabs[Math.random() * this.cabs.length | 0].glitchT = .35;
    }
    // the cat notices you
    if (this.catCab){
      const dx = player.x - (this.catCab.tx + 1), dy = player.y - (this.catCab.ty + .5);
      const near = (dx * dx + dy * dy) < 3.2 ? 1 : 0;
      this.catAwake += (near - this.catAwake) * Math.min(1, dt * 3);
    }
    // proximity focus (idle only)
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
      if (this.seqT >= .45){
        AudioSys.coin();
        this.state = 'msg'; this.seqT = 0; this.msg = 'CREDIT 1';
      }
    } else if (this.state === 'msg'){
      if (this.seqT >= .38 && this.msg !== 'PRESS START') this.msg = 'PRESS START';
      if (this.seqT >= .78) this.beginLaunch();
    } else if (this.state === 'launch'){
      const p = Math.min(1, this.seqT / 1.05);
      if (p >= .42 && !this.imgShown) this.showFullRes(.5);
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
    if (window.gsap) gsap.fromTo(img, { opacity: 0 }, { opacity: 1, duration: dur, ease: 'power2.in', overwrite: true });
    else img.style.opacity = 1;
  },

  finishNow(skipped){
    if (this.navigated) return;
    this.navigated = true;
    if (!this.imgShown) this.showFullRes(.12);
    const flash = document.getElementById('whiteFlash');
    flash.style.display = 'block';
    if (window.gsap) gsap.fromTo(flash, { opacity: 0 }, { opacity: 1, duration: .1, ease: 'power1.in' });
    else flash.style.opacity = 1;
    const url = this.active.game.url;
    setTimeout(() => {
      Ghosts.persist();
      window.location.href = url;
    }, skipped ? 120 : 150);
  },

  getCamOverride(){
    if (this.state !== 'launch' || !this.camStart) return null;
    const p = Math.min(1, this.seqT / 1.05);
    const e = p * p * (3 - 2 * p) * p;      // ease-in-ish, accelerating
    const sc = this.screenCenter(this.active);
    const z = this.camStart.z + (6.4 - this.camStart.z) * e;
    return {
      x: this.camStart.x + (sc[0] - this.camStart.x) * e,
      y: this.camStart.y + (sc[1] - this.camStart.y) * e,
      z, snap: 1,
    };
  },

  // ----------------------------------------------------------------- input
  insertCoin(){
    if (this.navigated) return;
    if (this.state !== 'idle'){            // second press = skip
      this.finishNow(true);
      return;
    }
    const it = this.focused;
    if (!it) return;
    if (it.coffee){
      AudioSys.coin();
      it.msgT = 1.6;
      if (this.onCoffee) this.onCoffee();
      return;
    }
    this.active = it;
    this.state = 'coin'; this.seqT = 0;
    this.coinFrom = World.iso(Player.x, Player.y);
    this.addCoin(it.idx);
    if (this.onCoin) this.onCoin(it);
  },

  phantomWake(i){
    if (i >= 0 && i < this.cabs.length) this.cabs[i].phantom = 1;
  },

  hitTest(wx, wy){
    for (const it of this.items){
      const fx = it.frontPoint[0] - wx, fy = it.frontPoint[1] - wy;
      let hit = (fx * fx + fy * fy) < 1.0;
      if (!hit){
        const tx = Math.floor(wx), ty = Math.floor(wy);
        for (const tl of it.tiles) if (tl[0] === tx && tl[1] === ty) hit = true;
      }
      if (hit) return { item: it, frontPoint: it.frontPoint, focused: this.focused === it };
    }
    return null;
  },

  // ----------------------------------------------------------------- draw
  collectDrawables(items, t){
    for (const cab of this.cabs){
      items.push({ depth: cab.depth, draw: (c) => this.drawCabinet(c, cab, t) });
      if (cab === this.catCab){
        items.push({ depth: cab.depth + .01, draw: (c) => this.drawCat(c, cab, t) });
      }
    }
    const cf = this.coffee;
    items.push({ depth: cf.depth, draw: (c) => this.drawCoffee(c, cf, t) });
  },

  litOf(cab){
    return Math.max(cab.wake, cab.phantom * .7, (cab.hoverK || 0) * .45);
  },

  drawCabinet(c, cab, t){
    const W = FACE_W;
    const litUp = this.litOf(cab);

    // ---- side art (tag-tinted) + a taped mini poster facing the camera ----
    World.shear(c, cab.sideO[0], cab.sideO[1], cab.sideSlope);
    c.fillStyle = shade(cab.color, .30);
    c.fillRect(0, -CH, TW2, CH);
    c.fillStyle = shade(cab.color, .55);
    c.beginPath();                                  // diagonal slash art
    c.moveTo(0, -6); c.lineTo(TW2, -20); c.lineTo(TW2, -14); c.lineTo(0, 0);
    c.closePath(); c.fill();
    c.fillStyle = shade(cab.color, .8);
    c.fillRect(2, -CH + 6, TW2 - 4, 2);
    {
      const SIDE_ARTS = ['pokeball', 'pikachu', 'vader'];
      const art = World.POSTERS[SIDE_ARTS[cab.idx % SIDE_ARTS.length]];
      const w = art.rows[0].length;
      const px = Math.max(0, Math.round((TW2 - w) / 2));
      const py = -27 + (cab.idx * 7 % 4);           // slight per-cabinet jitter
      World.drawPoster(c, px, py, art, true);
    }
    c.fillStyle = 'rgba(0,0,0,.5)';
    c.fillRect(0, -3, TW2, 3);
    c.restore();

    // ---- front face ----
    World.shear(c, cab.faceO[0], cab.faceO[1], cab.faceSlope);
    c.fillStyle = '#221a31';
    c.fillRect(0, -CH, W, CH);
    c.fillStyle = 'rgba(255,255,255,.06)';
    c.fillRect(0, -CH, 1, CH);

    // marquee — full name, bus-display scroll when it doesn't fit
    c.fillStyle = '#0d0916';
    c.fillRect(1, -CH + 1, W - 2, 6);
    let mAlpha = .5 + litUp * .5;
    if (litUp < .5){
      mAlpha *= .82 + .18 * Math.sin(t * 9 + cab.flickSeed);
      if (Math.sin(t * 2.1 + cab.flickSeed * 3.7) > .985) mAlpha *= .25;   // dropout
    }
    c.save();
    c.beginPath();
    c.rect(2, -CH + 1, W - 4, 6);
    c.clip();
    c.globalAlpha = mAlpha;
    c.font = 'bold 6px monospace';
    c.textBaseline = 'alphabetic';
    c.fillStyle = cab.color;
    c.shadowColor = cab.color; c.shadowBlur = 3 * mAlpha;
    const name = cab.game.name.toUpperCase();
    const nw = c.measureText(name).width;
    const maxw = W - 4;
    if (nw <= maxw){
      c.fillText(name, 2 + (maxw - nw) / 2, -CH + 6);
    } else {
      // pause … scroll left … wrap (like a bus destination sign)
      const GAP = 14, PAUSE = 16;                  // px of "virtual" pre-roll pause
      const cyc = nw + GAP;
      const u = ((t * 10) + cab.idx * 31) % (cyc + PAUSE);
      const off = Math.max(0, u - PAUSE);
      c.fillText(name, 2 - off, -CH + 6);
      c.fillText(name, 2 - off + cyc, -CH + 6);
    }
    c.restore();

    // screen bezel + screen
    c.fillStyle = '#0a0712';
    c.fillRect(2, -SCREEN.top - 1, W - 4, SCREEN.h + 2);
    const sx = SCREEN.x, sy = -SCREEN.top, sw = SCREEN.w, sh = SCREEN.h;
    if (this.active === cab && this.msg){
      // CREDIT 1 / PRESS START
      c.fillStyle = '#05040a'; c.fillRect(sx, sy, sw, sh);
      const blink = this.msg !== 'PRESS START' || (t * 3 % 1) < .65;
      if (blink){
        c.fillStyle = '#ffd23f';
        c.font = 'bold 4px monospace';
        const parts = this.msg.split(' ');
        c.fillText(parts[0], sx + 2, sy + 6);
        if (parts[1]) c.fillText(parts[1], sx + 2, sy + 11);
      }
    } else {
      // attract mode: screenshot, brighter than before; crisp overlay covers
      // this exact quad at device resolution when available
      let a = .82 + .18 * Math.max(litUp, cab.phantom * .8);
      a *= 1 - .03 * ((t * 8 | 0) % 2);
      if (litUp < .5 && Math.sin(t * 5.3 + cab.flickSeed * 7.1) > .992) a *= .35;
      cab._shownAlpha = a;                         // reused by the crisp overlay
      c.globalAlpha = a;
      if (cab.glitchT > 0){
        const off = Math.sin(t * 71 + cab.idx) * 2.5;
        const s3 = Math.ceil(sh / 3);
        c.drawImage(cab.mini, 0, 0, sw, s3, sx + off, sy, sw, s3);
        c.drawImage(cab.mini, 0, s3, sw, s3, sx - off, sy + s3, sw, s3);
        c.drawImage(cab.mini, 0, s3 * 2, sw, sh - s3 * 2, sx + off * .5, sy + s3 * 2, sw, sh - s3 * 2);
      } else {
        c.drawImage(cab.mini, sx, sy, sw, sh);
      }
      c.globalAlpha = 1;
      // screen glass glint
      c.fillStyle = 'rgba(255,255,255,' + (.05 + litUp * .05) + ')';
      c.fillRect(sx + 1, sy + 1, 2, sh - 2);
    }
    // bezel chase lights when awake
    if (litUp > .4){
      const n = 8, step = (sw - 2) / n;
      for (let k = 0; k <= n; k++){
        const on = ((k + (t * 9 | 0)) % 3) === 0;
        c.fillStyle = on ? cab.color : 'rgba(255,255,255,.08)';
        c.globalAlpha = litUp;
        c.fillRect(sx + 1 + k * step, sy + sh + 1, 1, 1);
      }
      c.globalAlpha = 1;
    }

    // control panel + buttons
    c.fillStyle = '#191227';
    c.fillRect(1, -10, W - 2, 4);
    c.fillStyle = cab.color; c.fillRect(5, -9, 2, 2); c.fillRect(10, -9, 2, 2);
    c.fillStyle = '#ff4757'; c.fillRect(16, -9, 2, 2);

    // coin slot (glows when focused)
    c.fillStyle = '#0d0916';
    c.fillRect(W - 8, -6, 5, 4);
    c.fillStyle = cab.wake > .5 ? '#ffd23f' : '#4a3a18';
    c.fillRect(W - 6, -5, 1, 2);

    // kick base
    c.fillStyle = '#0b0714';
    c.fillRect(0, -2, W, 2);
    c.restore();

    // ---- top ----
    c.beginPath();
    let first = true;
    for (const tp of cab.top){
      const p = World.iso(tp[0], tp[1]);
      if (first){ c.moveTo(p[0], p[1] - CH); first = false; }
      else c.lineTo(p[0], p[1] - CH);
    }
    c.closePath();
    c.fillStyle = '#15101f';
    c.fill();
    c.strokeStyle = shade(cab.color, .35 + litUp * .3);
    c.lineWidth = 1;
    c.stroke();
  },

  // crisp, device-resolution screens drawn on the overlay canvas.
  // Called by World.render with the camera transform already applied.
  drawCrispScreens(c, t){
    for (const cab of this.cabs){
      if (!cab.imgFull) continue;
      if (cab.glitchT > 0) continue;                       // let the low-res glitch show
      if (this.active === cab && this.msg) continue;       // CREDIT/PRESS START on low-res
      const img = cab.imgFull;
      const a = cab._shownAlpha != null ? cab._shownAlpha : .82;
      c.save();
      c.translate(cab.faceO[0], cab.faceO[1]);
      c.transform(1, cab.faceSlope, 0, 1, 0, 0);
      c.globalAlpha = a;
      // cover-crop the full-res screenshot into the screen quad
      const s = Math.max(SCREEN.w / img.width, SCREEN.h / img.height);
      const sw = SCREEN.w / s, sh = SCREEN.h / s;
      c.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh,
                  SCREEN.x, -SCREEN.top, SCREEN.w, SCREEN.h);
      // subtle CRT scanlines + glass glint
      c.globalAlpha = a * .35;
      c.fillStyle = '#000';
      for (let y = 0; y < SCREEN.h; y += 2){
        c.fillRect(SCREEN.x, -SCREEN.top + y, SCREEN.w, .35);
      }
      c.globalAlpha = .07;
      c.fillStyle = '#fff';
      c.fillRect(SCREEN.x + 1, -SCREEN.top + 1, 1.5, SCREEN.h - 2);
      c.restore();
    }
    c.globalAlpha = 1;
  },

  drawCoffee(c, cf, t){
    World.drawVendingBox(c, cf.tx, cf.ty, {
      body: '#5c3a22', win: '#ffd9a0', stripe: '#ffd23f', side: '#3a2515',
    }, t, true);
    // steam pixels
    const o = World.iso(cf.tx + .5, cf.ty + .5);
    c.fillStyle = 'rgba(255,255,255,.4)';
    for (let i = 0; i < 3; i++){
      const ph = (t * .7 + i * .33) % 1;
      c.globalAlpha = .35 * (1 - ph);
      c.fillRect(o[0] + Math.sin((t + i) * 3) * 2, o[1] - 32 - ph * 8, 1, 1);
    }
    c.globalAlpha = 1;
  },

  // the resident cat, asleep on a center cabinet; lifts its head when you come close
  drawCat(c, cab, t){
    const p = World.iso(cab.tx + 1, cab.ty + .55);
    const X = Math.round(p[0]) - 4, Y = Math.round(p[1]) - CH;
    const awake = this.catAwake;
    const breathe = Math.sin(t * 1.6) > .2 ? 0 : 1;       // slow 2-frame breathing
    const flick = (t % 7) > 6.6;                           // tail flick every ~7s
    const FUR = '#c9874f', FUR2 = '#a86a38', DARK = '#1a1024';
    // curled body
    c.fillStyle = FUR;
    c.fillRect(X, Y - 3, 8, 3);
    c.fillRect(X + 1, Y - 4 + breathe, 6, 1);
    c.fillStyle = FUR2;
    c.fillRect(X + 2, Y - 2, 2, 1); c.fillRect(X + 5, Y - 3, 1, 1);   // stripes
    // tail (wraps around, flicks)
    c.fillStyle = FUR2;
    if (flick){
      c.fillRect(X + 7, Y - 5, 1, 2);
      c.fillRect(X + 8, Y - 6, 1, 2);
    } else {
      c.fillRect(X + 7, Y - 2, 2, 1);
    }
    // head — tucked when asleep, raised when you're near
    const hy = Y - 4 - Math.round(awake * 3);
    c.fillStyle = FUR;
    c.fillRect(X - 1, hy, 4, 3);
    c.fillRect(X - 1, hy - 1, 1, 1); c.fillRect(X + 2, hy - 1, 1, 1); // ears
    if (awake > .5){
      c.fillStyle = DARK;                                  // open eyes
      c.fillRect(X, hy + 1, 1, 1); c.fillRect(X + 2, hy + 1, 1, 1);
    }
    // sleepy Z
    if (awake < .3 && (t % 3) < 1.6){
      c.fillStyle = 'rgba(207,216,255,.7)';
      c.font = '5px monospace';
      c.fillText('z', X + 5, hy - 2 - ((t % 3) * 2 | 0));
    }
  },

  // billboard labels + coin arc — drawn after entities, still in world space
  drawFx(c, t){
    c.font = 'bold 6px monospace';
    c.textBaseline = 'alphabetic';

    const label = (it, txt, color) => {
      const p = it.labelAt;
      const w = c.measureText(txt).width;
      const x = p[0] - w / 2, y = p[1] - CH - 8;
      c.fillStyle = 'rgba(5,3,10,.78)';
      c.fillRect(x - 3, y - 7, w + 6, 10);
      c.fillStyle = color;
      c.fillText(txt, x, y);
    };

    // coffee machine permanent tag
    label(this.coffee, this.coffee.msgT > 0 ? 'THANKS! ♥' : 'COFFEE ☕ 1 COIN',
          this.coffee.msgT > 0 ? '#ff7ab8' : '#ffd23f');

    if (this.state === 'idle' && this.focused && !this.focused.coffee){
      if ((t * 1.6 % 1) < .62) label(this.focused, 'INSERT COIN ▮', '#ffd23f');
    } else if (this.state === 'msg' && this.active){
      const blink = this.msg !== 'PRESS START' || (t * 3 % 1) < .65;
      if (blink) label(this.active, this.msg, '#ffffff');
    }

    // coin arc
    if (this.state === 'coin' && this.active){
      const p = Math.min(1, this.seqT / .45);
      const slot = this.facePt(this.active, FACE_W - 5.5, 4);
      const x = this.coinFrom[0] + (slot[0] - this.coinFrom[0]) * p;
      const y = (this.coinFrom[1] - 8) + (slot[1] - this.coinFrom[1] + 8) * p - Math.sin(p * Math.PI) * 17;
      const wSpin = Math.max(.6, Math.abs(Math.cos(p * 9)));
      c.fillStyle = '#b8860b';
      c.fillRect(x - 2 * wSpin, y - 2, 4 * wSpin, 4);
      c.fillStyle = '#ffd23f';
      c.fillRect(x - 1.4 * wSpin, y - 1.4, 2.8 * wSpin, 2.8);
    }
  },
};
})();
