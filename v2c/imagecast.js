/* v2c MATRIX:OPERATOR — imagecast.js
 * Screenshot → glyph condensation. Samples an image at grid resolution,
 * maps luminance to a glyph ramp, and lets passing rain streams "deposit"
 * the cells until the picture is made of rain. A `signal` value 0..1
 * controls how much true color leaks through the green.
 */
'use strict';
window.V2C = window.V2C || {};

V2C.imagecast = (function () {
  const G = V2C.grid;
  const RAMP = ' .:-=+*#%@';
  const MIDKATA = 'ｸｼﾂﾅﾊﾒｵｷﾘﾓ';

  const imgCache = new Map(); // src -> {img, ready, failed, cbs:[]}

  let cast = null;   // active preview condensation
  let full = null;   // fullscreen launch condensation
  let lastQS = -1;
  let depositTickCount = 0;

  function loadImage(src, cb) {
    let e = imgCache.get(src);
    if (e) {
      if (e.ready || e.failed) cb(e);
      else e.cbs.push(cb);
      return;
    }
    e = { img: new Image(), ready: false, failed: false, cbs: [cb] };
    imgCache.set(src, e);
    e.img.onload = function () { e.ready = true; e.cbs.forEach(function (f) { f(e); }); e.cbs.length = 0; };
    e.img.onerror = function () { e.failed = true; e.cbs.forEach(function (f) { f(e); }); e.cbs.length = 0; };
    e.img.src = src;
  }

  // Sample image into w*h cells. Returns Float/Uint arrays or null on taint/fail.
  function sampleImage(img, w, h) {
    try {
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      // cover-fit
      const ia = img.width / img.height, ra = w / h;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (ia > ra) { sw = img.height * ra; sx = (img.width - sw) / 2; }
      else { sh = img.width / ra; sy = (img.height - sh) / 2; }
      cx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      return cx.getImageData(0, 0, w, h).data;
    } catch (err) {
      return null; // tainted (file://) or other failure
    }
  }

  // Fallback when the screenshot can't be sampled: render the program name
  // as big text into an offscreen canvas and sample THAT (never taints).
  function fallbackSample(name, w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#000';
    cx.fillRect(0, 0, w, h);
    cx.fillStyle = '#9f9';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    const words = name.toUpperCase().split(' ');
    const fs = Math.max(6, Math.min(h / (words.length + 1), w / 6));
    cx.font = 'bold ' + fs + 'px monospace';
    words.forEach(function (word, i) {
      cx.fillText(word, w / 2, h / 2 + (i - (words.length - 1) / 2) * fs * 1.15);
    });
    return cx.getImageData(0, 0, w, h).data;
  }

  function buildTargets(data, region) {
    // targets: Map cellIndex -> {ch, pr,pg,pb, lum, br}
    const targets = new Map();
    const w = region.w, h = region.h;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const p = (yy * w + xx) * 4;
        const r = data[p], g = data[p + 1], b = data[p + 2];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        let chr;
        const ri = Math.min(RAMP.length - 1, Math.floor(Math.pow(lum, 0.85) * RAMP.length));
        if (ri >= 3 && ri <= 6 && Math.random() < 0.35) {
          chr = MIDKATA.charCodeAt((Math.random() * MIDKATA.length) | 0);
        } else {
          chr = RAMP.charCodeAt(ri);
        }
        const gx = region.x + xx, gy = region.y + yy;
        if (!G.inBounds(gx, gy)) continue;
        targets.set(G.idx(gx, gy), {
          ch: chr, pr: r, pg: g, pb: b, lum: lum,
          br: 0.22 + 0.78 * lum,
        });
      }
    }
    return targets;
  }

  // final cell color before brightness multiply:
  // C = lerp(theme.body, pixel/br (clamped), signal)
  function mixInto(i, t, signal) {
    const body = G.theme.body;
    const inv = 1 / Math.max(0.08, t.br);
    const tr = Math.min(255, t.pr * inv);
    const tg = Math.min(255, t.pg * inv);
    const tb = Math.min(255, t.pb * inv);
    G.setColorAt(i,
      body[0] + (tr - body[0]) * signal,
      body[1] + (tg - body[1]) * signal,
      body[2] + (tb - body[2]) * signal);
  }

  // ---- preview condensation ----------------------------------------------
  function startPreview(game, region, onSampled) {
    releasePreview();
    const myCast = cast = {
      game: game, region: region,
      targets: null, deposited: [], flashes: [],
      total: 0, startT: 0, signal: 0.1, active: false,
      done: false, cancelled: false,
      order: null, cursor: 0,          // top-down sweep order for the finishing drain
      draining: false, drainStart: 0,  // eased "pull-down" that finishes the picture
    };
    loadImage(game.img, function (e) {
      if (myCast.cancelled || cast !== myCast) return;
      let data = e.ready ? sampleImage(e.img, region.w, region.h) : null;
      if (!data) data = fallbackSample(game.name, region.w, region.h);
      myCast.targets = buildTargets(data, region);
      myCast.total = myCast.targets.size;
      // top-down order (Map keeps insertion order, built row by row) so the
      // finishing drain continues the same downward sweep the rain started.
      myCast.order = [];
      myCast.targets.forEach(function (t, i) { myCast.order.push(i); });
      myCast.startT = G.now;
      myCast.active = true;
      // mark deposit map + aim streams at the region columns
      myCast.targets.forEach(function (t, i) { G.depositMap[i] = 1; });
      for (let c = region.x; c < region.x + region.w; c++) {
        G.spawnAimed(c, { y: region.y - 2 - Math.random() * 18, sp: 30 + Math.random() * 18 });
        if (Math.random() < 0.4) G.spawnAimed(c, { y: region.y - 14 - Math.random() * 24, sp: 26 + Math.random() * 14 });
      }
      if (onSampled) onSampled();
    });
  }

  function depositCell(i, c) {
    const t = c.targets.get(i);
    if (!t) return false;
    c.targets.delete(i);
    G.depositMap[i] = 0;
    G.rawSet(i, t.ch < 33 ? 32 : t.ch, 0, 0, 0, Math.min(1.3, t.br + 0.55), G.IMG);
    mixInto(i, t, c.signal);
    c.deposited.push({ i: i, t: t });
    c.flashes.push({ i: i, target: t.br });
    depositTickCount++;
    return true;
  }

  function onDeposit(i) {
    if (cast && cast.active && cast.targets && cast.targets.has(i)) return depositCell(i, cast);
    return false;
  }
  G.onDeposit = onDeposit;

  function releasePreview() {
    if (!cast) return;
    cast.cancelled = true;
    if (cast.targets) {
      cast.targets.forEach(function (t, i) { G.depositMap[i] = 0; });
      cast.targets.clear();
    }
    // washed away by decay: hand deposited cells back to the rain
    for (let j = 0; j < cast.deposited.length; j++) {
      G.toRain(cast.deposited[j].i, 2.6 + Math.random() * 2);
    }
    cast = null;
  }

  function previewProgress() {
    if (!cast || !cast.active || !cast.total) return 0;
    return cast.deposited.length / cast.total;
  }
  function previewDone() { return !!(cast && cast.active && cast.targets && cast.targets.size === 0); }

  // ---- fullscreen launch condensation -------------------------------------
  function startFull(game, duration, onComplete) {
    const region = { x: 0, y: 0, w: G.cols, h: G.rows };
    full = {
      game: game, region: region, order: null, cursor: 0,
      duration: duration || 0.85, t: 0, onComplete: onComplete,
      targets: null, deposited: [], signal: cast ? cast.signal : 0.2,
    };
    const myFull = full;
    loadImage(game.img, function (e) {
      if (full !== myFull) return;
      let data = e.ready ? sampleImage(e.img, region.w, region.h) : null;
      if (!data) data = fallbackSample(game.name, region.w, region.h);
      myFull.targets = buildTargets(data, region);
      const order = [];
      myFull.targets.forEach(function (t, i) { order.push(i); });
      // shuffle for a storm-like fill
      for (let j = order.length - 1; j > 0; j--) {
        const k = (Math.random() * (j + 1)) | 0;
        const tmp = order[j]; order[j] = order[k]; order[k] = tmp;
      }
      myFull.order = order;
      // a burst of fast streams for show
      for (let c = 0; c < G.cols; c += 2) G.spawnAimed(c, { y: -Math.random() * 10, sp: 40 + Math.random() * 20 });
    });
  }

  function fullDepositCell(i, f) {
    const t = f.targets.get(i);
    if (!t) return;
    f.targets.delete(i);
    G.rawSet(i, t.ch < 33 ? 32 : t.ch, 0, 0, 0, Math.min(1.35, t.br + 0.5), G.IMG);
    mixInto(i, t, f.signal);
    f.deposited.push({ i: i, t: t });
    depositTickCount++;
  }

  // ---- per-frame update ----------------------------------------------------
  function update(dt) {
    depositTickCount = 0;
    // preview flashes settle
    if (cast && cast.active) {
      const fl = cast.flashes;
      for (let j = fl.length - 1; j >= 0; j--) {
        const f = fl[j], i = f.i;
        if (G.getOwner(i) !== G.IMG) { fl.splice(j, 1); continue; }
        const b = G.getBright(i);
        const nb = b + (f.target - b) * Math.min(1, dt * 9);
        G.setBright(i % G.cols, (i / G.cols) | 0, Math.abs(nb - f.target) < 0.02 ? f.target : nb);
        if (Math.abs(nb - f.target) < 0.02) fl.splice(j, 1);
      }
      // Finish the picture with a smooth, eased top-down sweep instead of
      // dumping every remaining cell in a couple of frames (which read as a
      // jarring jump to the full image). The rain deposits cells organically;
      // once it has had a head start we drive a `wantDown` target along an
      // eased curve so the LAST cells trickle in and the pull-down completes.
      const elapsed = G.now - cast.startT;
      const DRAIN_DELAY = 0.8;  // let the rain pull most of it down first
      const DRAIN_DUR = 0.9;    // then ease the remainder to completion
      if (elapsed > DRAIN_DELAY && cast.targets.size > 0 && cast.order) {
        if (!cast.draining) { cast.draining = true; cast.drainStart = G.now; }
        const p = Math.min(1, (G.now - cast.drainStart) / DRAIN_DUR);
        const eased = p * p * (3 - 2 * p); // smoothstep — no abrupt edge
        const wantDown = Math.floor(cast.total * eased);
        // advance the top-down cursor only as fast as the eased curve allows;
        // cells the rain already deposited are skipped, so we never re-deposit.
        while (cast.deposited.length < wantDown && cast.cursor < cast.order.length) {
          const i = cast.order[cast.cursor++];
          if (cast.targets.has(i)) depositCell(i, cast);
        }
      }
      if (!cast.done && cast.targets.size === 0) cast.done = true;
      // idle signal pulse 0.1 → 0.35
      if (!full) {
        cast.signal = 0.1 + 0.125 * (1 + Math.sin(G.now * 0.85));
        const qs = Math.round(cast.signal * 24);
        if (qs !== lastQS) {
          lastQS = qs;
          for (let j = 0; j < cast.deposited.length; j++) {
            const d = cast.deposited[j];
            if (G.getOwner(d.i) === G.IMG) mixInto(d.i, d.t, cast.signal);
          }
        }
      }
    }
    // fullscreen cast
    if (full && full.order) {
      full.t += dt;
      const frac = Math.min(1, full.t / full.duration);
      // signal ramps to ~0.85 true color
      full.signal = 0.2 + 0.65 * frac;
      const targetCount = Math.floor(full.order.length * frac);
      while (full.cursor < targetCount) {
        fullDepositCell(full.order[full.cursor], full);
        full.cursor++;
      }
      // recolor everything to the rising signal (cheap: only every other frame at scale)
      const qs = Math.round(full.signal * 40);
      if (qs !== lastQS) {
        lastQS = qs;
        for (let j = 0; j < full.deposited.length; j++) {
          const d = full.deposited[j];
          mixInto(d.i, d.t, full.signal);
        }
      }
      if (frac >= 1 && full.targets && full.targets.size === 0) {
        const done = full.onComplete;
        full.onComplete = null;
        if (done) done();
      }
    }
    return depositTickCount;
  }

  function reset() {
    releasePreview();
    full = null;
    lastQS = -1;
  }

  function preload(game) { loadImage(game.img, function () {}); }

  return {
    startPreview: startPreview,
    releasePreview: releasePreview,
    previewProgress: previewProgress,
    previewDone: previewDone,
    startFull: startFull,
    update: update,
    reset: reset,
    preload: preload,
    isCasting: function () { return !!(cast && cast.active && !cast.done); },
    isFull: function () { return !!full; },
  };
})();
