/* v2c MATRIX:OPERATOR — grid.js
 * The glyph grid engine. One canvas, one grid of cells. Rain, UI and
 * condensed images are all just cell states. Zero libraries.
 */
'use strict';
window.V2C = window.V2C || {};

V2C.grid = (function () {
  const RAIN_GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:=*+-<>¦';
  const PUG = 'ᶘᵒᴥᵒᶅ'; // ᶘᵒᴥᵒᶅ
  const EMPTY = 0, RAIN = 1, UI = 2, IMG = 3;

  const THEMES = {
    classic: { body: [0, 255, 65],   head: [220, 255, 230], dim: [0, 130, 40],    accent: [170, 255, 190] },
    amber:   { body: [255, 176, 0],  head: [255, 244, 210], dim: [150, 100, 10],  accent: [255, 224, 150] },
    ice:     { body: [110, 200, 255],head: [235, 248, 255], dim: [50, 105, 160],  accent: [195, 232, 255] },
  };

  const G = {
    EMPTY, RAIN, UI, IMG, THEMES,
    canvas: null, ctx: null,
    cell: 14, cols: 0, rows: 0, ox: 0, oy: 0,
    bg: '#020503',
    theme: THEMES.classic,
    themeName: 'classic',
    density: 1,        // rain density multiplier
    rainDim: 1,        // brightness multiplier for newly written rain
    pugUntil: 0,
    now: 0,
    halted: false,     // stop drawing (CRT collapse takes over)
    depositMap: null,  // Uint8Array: 1 = cell wanted by imagecast
    onDeposit: null,   // (idx) => bool consumed
    onResize: null,
  };

  // Cell state arrays
  let ch, br, cr, cg, cb, owner, inv, dk, drawn;
  let streams = [];
  const styleCache = new Map();

  function alloc() {
    const n = G.cols * G.rows;
    ch = new Uint16Array(n);
    br = new Float32Array(n);
    cr = new Uint8ClampedArray(n);
    cg = new Uint8ClampedArray(n);
    cb = new Uint8ClampedArray(n);
    owner = new Uint8Array(n);
    inv = new Uint8Array(n);
    dk = new Float32Array(n);
    drawn = new Int32Array(n);
    G.depositMap = new Uint8Array(n);
  }

  function init(canvas, cellSize) {
    G.canvas = canvas;
    G.cell = cellSize || 14;
    G.ctx = canvas.getContext('2d', { alpha: false });
    window.addEventListener('resize', resize);
    resize();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth, h = window.innerHeight;
    G.canvas.width = Math.round(w * dpr);
    G.canvas.height = Math.round(h * dpr);
    G.canvas.style.width = w + 'px';
    G.canvas.style.height = h + 'px';
    G.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    G.cols = Math.max(18, Math.floor(w / G.cell));
    G.rows = Math.max(16, Math.floor(h / G.cell));
    G.ox = Math.floor((w - G.cols * G.cell) / 2);
    G.oy = Math.floor((h - G.rows * G.cell) / 2);
    alloc();
    G.ctx.font = Math.max(9, G.cell - 2) + 'px ui-monospace, Menlo, Consolas, "Courier New", monospace';
    G.ctx.textAlign = 'center';
    G.ctx.textBaseline = 'middle';
    G.ctx.fillStyle = G.bg;
    G.ctx.fillRect(0, 0, w, h);
    rebuildStreams();
    if (G.onResize) G.onResize();
  }

  // ---- rain streams -------------------------------------------------------
  function targetStreamCount() {
    return Math.round(G.cols * 0.72 * G.density);
  }

  function makeStream(col, opts) {
    opts = opts || {};
    return {
      x: col,
      y: opts.y !== undefined ? opts.y : -Math.random() * G.rows,
      sp: opts.sp !== undefined ? opts.sp : 6 + Math.random() * 13,
      k: opts.k !== undefined ? opts.k : 2.1 + Math.random() * 1.6,
      vx: 0,
      aimed: !!opts.aimed,
    };
  }

  function rebuildStreams() {
    streams.length = 0;
    const n = targetStreamCount();
    for (let i = 0; i < n; i++) streams.push(makeStream(Math.floor(Math.random() * G.cols)));
  }

  function spawnAimed(col, opts) {
    opts = opts || {};
    streams.push(makeStream(col, {
      y: opts.y !== undefined ? opts.y : -1,
      sp: opts.sp !== undefined ? opts.sp : 30 + Math.random() * 16,
      k: opts.k !== undefined ? opts.k : 4.2,
      aimed: true,
    }));
  }

  function ambientCount() {
    let c = 0;
    for (let i = 0; i < streams.length; i++) if (!streams[i].aimed) c++;
    return c;
  }

  function writeRain(col, row, s) {
    if (col < 0 || col >= G.cols || row < 0 || row >= G.rows) return;
    const i = row * G.cols + col;
    if (G.depositMap[i] && G.onDeposit && G.onDeposit(i)) return;
    const o = owner[i];
    if (o === UI || o === IMG) return;
    let c;
    if (G.now < G.pugUntil) c = PUG.charCodeAt(((row % PUG.length) + PUG.length) % PUG.length);
    else c = RAIN_GLYPHS.charCodeAt((Math.random() * RAIN_GLYPHS.length) | 0);
    ch[i] = c;
    br[i] = (s.aimed ? 0.95 : 1.22) * G.rainDim;
    dk[i] = s.k;
    inv[i] = 0;
    owner[i] = RAIN;
    const t = G.theme.body;
    cr[i] = t[0]; cg[i] = t[1]; cb[i] = t[2];
  }

  function update(dt) {
    G.now += dt;
    const n = G.cols * G.rows;
    // decay rain cells
    for (let i = 0; i < n; i++) {
      if (owner[i] === RAIN) {
        br[i] -= br[i] * dk[i] * dt;
        if (br[i] < 0.045) { ch[i] = 0; br[i] = 0; owner[i] = EMPTY; inv[i] = 0; }
      }
    }
    // advance streams
    const damp = Math.pow(0.03, dt);
    for (let si = streams.length - 1; si >= 0; si--) {
      const s = streams[si];
      if (s.vx) {
        s.x += s.vx * dt;
        s.vx *= damp;
        if (Math.abs(s.vx) < 0.05) s.vx = 0;
        if (s.x < 0) s.x += G.cols;
        if (s.x >= G.cols) s.x -= G.cols;
      }
      const prev = Math.floor(s.y);
      s.y += s.sp * dt;
      const to = Math.floor(s.y);
      const col = Math.floor(s.x);
      for (let row = prev + 1; row <= to; row++) writeRain(col, row, s);
      if (to > G.rows + 3) {
        if (s.aimed) streams.splice(si, 1);
        else {
          // respawn at top
          s.x = Math.floor(Math.random() * G.cols);
          s.y = -2 - Math.random() * 14;
          s.sp = 6 + Math.random() * 13;
          s.k = 2.1 + Math.random() * 1.6;
        }
      }
    }
    // density adjust
    const want = targetStreamCount();
    let have = ambientCount();
    while (have < want) { streams.push(makeStream(Math.floor(Math.random() * G.cols), { y: -1 - Math.random() * 6 })); have++; }
    if (have > want) {
      for (let si = streams.length - 1; si >= 0 && have > want; si--) {
        if (!streams[si].aimed && streams[si].y > G.rows) { streams.splice(si, 1); have--; }
      }
      // also let extras die when off-screen; trim hard if way over
      if (have > want * 2) {
        for (let si = streams.length - 1; si >= 0 && have > want; si--) {
          if (!streams[si].aimed) { streams.splice(si, 1); have--; }
        }
      }
    }
  }

  // ---- rendering ----------------------------------------------------------
  function styleFor(qr, qg, qb) {
    const key = (qr << 10) | (qg << 5) | qb;
    let s = styleCache.get(key);
    if (!s) {
      s = 'rgb(' + ((qr << 3) | 4) + ',' + ((qg << 3) | 4) + ',' + ((qb << 3) | 4) + ')';
      styleCache.set(key, s);
    }
    return s;
  }

  // returns 32-bit hash: ch(16) qr(5) qg(5) qb→4bits(4) inv(1)
  function cellHash(i) {
    if (ch[i] === 0 && !inv[i]) return 0;
    let b = br[i];
    let r = cr[i], g = cg[i], bl = cb[i];
    if (b > 1) {
      const f = Math.min(1, (b - 1) / 0.35);
      r += (255 - r) * f; g += (255 - g) * f; bl += (255 - bl) * f;
      b = 1;
    }
    const qr = Math.min(31, (r * b) >> 3) | 0;
    const qg = Math.min(31, (g * b) >> 3) | 0;
    const qb = Math.min(31, (bl * b) >> 3) | 0;
    return (ch[i] | (qr << 16) | (qg << 21) | ((qb >> 1) << 26) | (inv[i] ? (1 << 30) : 0)) | 0;
  }

  const changed = [];
  function render() {
    if (G.halted) return;
    const ctx = G.ctx, n = G.cols * G.rows, cell = G.cell, cols = G.cols, ox = G.ox, oy = G.oy;
    changed.length = 0;
    for (let i = 0; i < n; i++) {
      const h = cellHash(i);
      if (h !== drawn[i]) { drawn[i] = h; changed.push(i); }
    }
    if (!changed.length) return;
    // clear pass
    ctx.fillStyle = G.bg;
    for (let j = 0; j < changed.length; j++) {
      const i = changed[j];
      ctx.fillRect((i % cols) * cell + ox, ((i / cols) | 0) * cell + oy, cell, cell);
    }
    // group by style
    const groups = new Map();
    for (let j = 0; j < changed.length; j++) {
      const i = changed[j];
      if (ch[i] === 0 && !inv[i]) continue;
      const h = drawn[i];
      const key = h >>> 16; // qr|qg|qb4|inv bits
      let arr = groups.get(key);
      if (!arr) { arr = []; groups.set(key, arr); }
      arr.push(i);
    }
    groups.forEach(function (arr, key) {
      const isInv = (key & 0x4000) !== 0;
      const qr = key & 31, qg = (key >> 5) & 31, qb4 = (key >> 10) & 15;
      const style = styleFor(qr, qg, qb4 << 1);
      if (isInv) {
        ctx.fillStyle = style;
        for (let j = 0; j < arr.length; j++) {
          const i = arr[j];
          ctx.fillRect((i % cols) * cell + ox, ((i / cols) | 0) * cell + oy, cell, cell);
        }
        ctx.fillStyle = G.bg;
        for (let j = 0; j < arr.length; j++) {
          const i = arr[j];
          if (ch[i] > 32) ctx.fillText(String.fromCharCode(ch[i]), (i % cols) * cell + ox + cell / 2, ((i / cols) | 0) * cell + oy + cell / 2 + 1);
        }
      } else {
        ctx.fillStyle = style;
        for (let j = 0; j < arr.length; j++) {
          const i = arr[j];
          if (ch[i] > 32) ctx.fillText(String.fromCharCode(ch[i]), (i % cols) * cell + ox + cell / 2, ((i / cols) | 0) * cell + oy + cell / 2 + 1);
        }
      }
    });
  }

  // ---- cell APIs (used by ui.js / imagecast.js) ---------------------------
  function idx(x, y) { return y * G.cols + x; }
  function inBounds(x, y) { return x >= 0 && x < G.cols && y >= 0 && y < G.rows; }

  function setCell(x, y, chr, color, bright, ownerType, invFlag) {
    if (!inBounds(x, y)) return;
    const i = idx(x, y);
    ch[i] = typeof chr === 'number' ? chr : (chr ? chr.charCodeAt(0) : 0);
    cr[i] = color[0]; cg[i] = color[1]; cb[i] = color[2];
    br[i] = bright;
    owner[i] = ownerType === undefined ? UI : ownerType;
    inv[i] = invFlag ? 1 : 0;
  }

  function setBright(x, y, bright) {
    if (!inBounds(x, y)) return;
    br[idx(x, y)] = bright;
  }

  function setColorAt(i, r, g, b, bright) {
    cr[i] = r; cg[i] = g; cb[i] = b;
    if (bright !== undefined) br[i] = bright;
  }

  function getOwner(i) { return owner[i]; }
  function getBright(i) { return br[i]; }

  function rawSet(i, chr, r, g, b, bright, ownerType) {
    ch[i] = chr; cr[i] = r; cg[i] = g; cb[i] = b; br[i] = bright; owner[i] = ownerType; inv[i] = 0;
  }

  function toRain(i, decay) {
    if (owner[i] === IMG || owner[i] === UI) {
      owner[i] = RAIN;
      dk[i] = decay || 3;
      inv[i] = 0;
    }
  }

  function text(x, y, str, opt) {
    opt = opt || {};
    const color = opt.color || G.theme.body;
    const bright = opt.bright !== undefined ? opt.bright : 1;
    const ownerType = opt.owner !== undefined ? opt.owner : UI;
    for (let j = 0; j < str.length; j++) {
      const cx = x + j;
      if (!inBounds(cx, y)) continue;
      setCell(cx, y, str.charCodeAt(j), color, bright, ownerType, opt.inv);
    }
  }

  function clearRegion(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (!inBounds(xx, yy)) continue;
        const i = idx(xx, yy);
        ch[i] = 0; br[i] = 0; owner[i] = EMPTY; inv[i] = 0;
      }
    }
  }

  function clearAll() {
    clearRegion(0, 0, G.cols, G.rows);
    G.depositMap.fill(0);
  }

  function cellFromPoint(px, py) {
    return {
      x: Math.floor((px - G.ox) / G.cell),
      y: Math.floor((py - G.oy) / G.cell),
    };
  }

  function setTheme(name) {
    if (!THEMES[name]) return false;
    G.theme = THEMES[name];
    G.themeName = name;
    // retint live rain cells
    const t = G.theme.body, n = G.cols * G.rows;
    for (let i = 0; i < n; i++) {
      if (owner[i] === RAIN) { cr[i] = t[0]; cg[i] = t[1]; cb[i] = t[2]; }
    }
    return true;
  }

  function dragRain(col, dvx) {
    for (let si = 0; si < streams.length; si++) {
      const s = streams[si];
      const d = Math.abs(s.x - col);
      if (d < 10) s.vx += dvx * (1 - d / 10);
    }
  }

  function pugStorm(sec) { G.pugUntil = G.now + sec; }

  G.init = init;
  G.update = update;
  G.render = render;
  G.text = text;
  G.setCell = setCell;
  G.setBright = setBright;
  G.setColorAt = setColorAt;
  G.getOwner = getOwner;
  G.getBright = getBright;
  G.rawSet = rawSet;
  G.toRain = toRain;
  G.clearRegion = clearRegion;
  G.clearAll = clearAll;
  G.cellFromPoint = cellFromPoint;
  G.setTheme = setTheme;
  G.spawnAimed = spawnAimed;
  G.dragRain = dragRain;
  G.pugStorm = pugStorm;
  G.ambientCount = ambientCount;
  G.idx = idx;
  G.inBounds = inBounds;
  return G;
})();
