/* px.js — the pixel-art toolkit everything else draws with.
   · hue-shifted colour ramps (shadows drift to violet, highlights to gold)
   · a global palette + nearest-colour LUT so every baked pixel lands on it
   · 4×4 ordered (Bayer) dither
   · a hand-made 3×5 bitmap font (no blurry fillText at art resolution)
   · selective outlines, silhouette rings, and 2:1 iso face blits
   Exposes window.PX. */
(function(){
'use strict';
const PX = window.PX = {};

// ---------------------------------------------------------------- colour
const clamp8 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
PX.hex = function(h){
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
PX.css = function(c, a){
  if (a != null) return 'rgba(' + clamp8(c[0]) + ',' + clamp8(c[1]) + ',' + clamp8(c[2]) + ',' + a + ')';
  return '#' + ((1 << 24) | (clamp8(c[0]) << 16) | (clamp8(c[1]) << 8) | clamp8(c[2])).toString(16).slice(1);
};
function rgb2hsl(c){
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn){
    const d = mx - mn;
    s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l){
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
function hueToward(h, target, deg){
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), deg);
}

/* ramp(hex, n): n colours dark→light around the base. Shadows rotate toward
   violet and lose a little saturation, highlights rotate toward warm gold and
   bleach — the classic hand-shaded look instead of plain black/white mixing. */
PX.ramp = function(base, n){
  n = n || 7;
  const hsl = rgb2hsl(typeof base === 'string' ? PX.hex(base) : base);
  const mid = Math.round((n - 1) * .5);
  const out = [];
  for (let i = 0; i < n; i++){
    let [h, s, l] = hsl;
    if (i < mid){
      const t = (mid - i) / mid;
      l = l * (1 - .80 * t);
      h = hueToward(h, 258, 34 * t);
      s = Math.min(1, s * (1 + .08 * t)) * (1 - .22 * t * t);
    } else if (i > mid){
      const t = (i - mid) / (n - 1 - mid);
      l = l + (.95 - l) * t * .82;
      h = hueToward(h, 52, 24 * t);
      s = s * (1 - .42 * t);
    }
    out.push(hsl2rgb(h, s, l).map(v => Math.round(v)));
  }
  return out;
};

// ---------------------------------------------------------------- palette
const PAL = PX.pal = [];
let LUT = null;
PX.addRamp = function(base, n){
  const r = PX.ramp(base, n || 7);
  for (const c of r) PAL.push(c);
  LUT = null;
  return r;
};
PX.addColors = function(list){
  for (const c of list) PAL.push(typeof c === 'string' ? PX.hex(c) : c);
  LUT = null;
};
// redmean-weighted nearest colour, memoised on a 32³ grid
function nearestIdx(r, g, b){
  let best = 0, bd = 1e12;
  for (let i = 0; i < PAL.length; i++){
    const p = PAL[i];
    const rm = (r + p[0]) / 2;
    const dr = r - p[0], dg = g - p[1], db = b - p[2];
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bd){ bd = d; best = i; }
  }
  return best;
}
PX.quant = true;
// packed little-endian ABGR for Uint32 ImageData views
const pack = (r, g, b) => (0xff000000 | (clamp8(b) << 16) | (clamp8(g) << 8) | clamp8(r)) >>> 0;
PX.pack = pack;
PX.near = function(r, g, b){
  r = clamp8(r); g = clamp8(g); b = clamp8(b);
  if (!PX.quant || !PAL.length) return pack(r, g, b);
  if (!LUT){ LUT = new Uint32Array(32768); }
  const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  let v = LUT[k];
  if (!v){
    const p = PAL[nearestIdx((r & 248) + 4, (g & 248) + 4, (b & 248) + 4)];
    v = LUT[k] = pack(p[0], p[1], p[2]);
  }
  return v;
};
PX.unpack = u => [u & 255, (u >>> 8) & 255, (u >>> 16) & 255, u >>> 24];

// ---------------------------------------------------------------- dither
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
PX.bayer = (x, y) => (B4[((y & 3) << 2) | (x & 3)] + .5) / 16;

// ---------------------------------------------------------------- hashing
PX.hash = function(x, y, s){
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------- canvases
PX.canvas = function(w, h){
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
};
PX.fromU32 = function(u32, w, h){
  const cv = PX.canvas(w, h);
  const ctx = cv.getContext('2d');
  const id = ctx.createImageData(w, h);
  new Uint32Array(id.data.buffer).set(u32);
  ctx.putImageData(id, 0, 0);
  return cv;
};

/* selective outline: every empty pixel touching the sprite (4-neighbour)
   becomes a deep, violet-leaning shade of the colour it borders. */
PX.outline = function(u32, w, h, strength){
  const k = strength == null ? 1 : strength;
  const out = u32.slice();
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      const i = y * w + x;
      if (u32[i] >>> 24) continue;
      let n = 0;
      if (y + 1 < h && (u32[i + w] >>> 24)) n = u32[i + w];
      else if (x > 0 && (u32[i - 1] >>> 24)) n = u32[i - 1];
      else if (x + 1 < w && (u32[i + 1] >>> 24)) n = u32[i + 1];
      else if (y > 0 && (u32[i - w] >>> 24)) n = u32[i - w];
      if (!n) continue;
      const r = n & 255, g = (n >>> 8) & 255, b = (n >>> 16) & 255;
      const m = .30 * k + (1 - k) * .6;
      out[i] = pack(r * m * .9 + 7, g * m * .75 + 3, b * m + 14);
    }
  }
  return out;
};

// white silhouette of a canvas
PX.silhouette = function(cv, color){
  const s = PX.canvas(cv.width, cv.height);
  const c = s.getContext('2d');
  c.drawImage(cv, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color || '#fff';
  c.fillRect(0, 0, s.width, s.height);
  return s;
};
// 1px ring just outside the silhouette (hover / focus highlight). Same size
// as the source — sprites keep a 2px transparent margin for this.
PX.ring = function(cv, color){
  const sil = PX.silhouette(cv, color);
  const r = PX.canvas(cv.width, cv.height);
  const c = r.getContext('2d');
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.drawImage(sil, d[0], d[1]);
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(cv, 0, 0);
  return r;
};
PX.flip = function(cv){
  const f = PX.canvas(cv.width, cv.height);
  const c = f.getContext('2d');
  c.translate(cv.width, 0); c.scale(-1, 1);
  c.drawImage(cv, 0, 0);
  return f;
};

/* 2:1 iso face blits — map a flat texture onto a wall/cabinet face so its
   pixels land exactly where the voxel ray-caster puts that face's texels.
   World units: 1 tile = 16u; screen x = x − y, screen y = (x + y)/2 − z.
   blitY: +y-facing plane at y = Ys. Texture column u ↔ voxel x = x0 + u,
          row v ↔ voxel z = zTop − v.
   blitX: +x-facing plane at x = X. Column u ↔ voxel y = y1 − u (so the
          texture reads left→right on screen). */
PX.blitY = function(ctx, src, sx, sy, w, h, x0, Ys, zTop, ox, oy){
  ox = ox || 0; oy = oy || 0;
  for (let u = 0; u < w; u++){
    const ix = x0 + u;
    ctx.drawImage(src, sx + u, sy, 1, h, ox + ix - Ys, oy + Math.floor((ix + Ys - 1) / 2) - zTop, 1, h);
  }
};
PX.blitX = function(ctx, src, sx, sy, w, h, X, y1, zTop, ox, oy){
  ox = ox || 0; oy = oy || 0;
  for (let u = 0; u < w; u++){
    const iy = y1 - u;
    ctx.drawImage(src, sx + u, sy, 1, h, ox + X - iy - 1, oy + Math.floor((X + iy - 1) / 2) - zTop, 1, h);
  }
};
// the screen pixel of one voxel-face texel (for placing single pixels)
PX.pixY = (ix, Ys, iz) => [ix - Ys, Math.floor((ix + Ys - 1) / 2) - iz];
PX.pixX = (X, iy, iz) => [X - iy - 1, Math.floor((X + iy - 1) / 2) - iz];
// continuous projection (for points in the air: coins, notes, claws)
PX.proj = (x, y, z) => [x - y, (x + y) / 2 - (z || 0)];

// ---------------------------------------------------------------- 3×5 font
const G = {
  A:['.#.','#.#','###','#.#','#.#'], B:['##.','#.#','##.','#.#','##.'], C:['.##','#..','#..','#..','.##'],
  D:['##.','#.#','#.#','#.#','##.'], E:['###','#..','##.','#..','###'], F:['###','#..','##.','#..','#..'],
  G:['.##','#..','#.#','#.#','.##'], H:['#.#','#.#','###','#.#','#.#'], I:['###','.#.','.#.','.#.','###'],
  J:['..#','..#','..#','#.#','.#.'], K:['#.#','#.#','##.','#.#','#.#'], L:['#..','#..','#..','#..','###'],
  M:['#.#','###','###','#.#','#.#'], N:['##.','#.#','#.#','#.#','#.#'], O:['.#.','#.#','#.#','#.#','.#.'],
  P:['##.','#.#','##.','#..','#..'], Q:['.#.','#.#','#.#','##.','.##'], R:['##.','#.#','##.','#.#','#.#'],
  S:['.##','#..','.#.','..#','##.'], T:['###','.#.','.#.','.#.','.#.'], U:['#.#','#.#','#.#','#.#','###'],
  V:['#.#','#.#','#.#','#.#','.#.'], W:['#.#','#.#','###','###','#.#'], X:['#.#','#.#','.#.','#.#','#.#'],
  Y:['#.#','#.#','.#.','.#.','.#.'], Z:['###','..#','.#.','#..','###'],
  0:['###','#.#','#.#','#.#','###'], 1:['.#.','##.','.#.','.#.','###'], 2:['##.','..#','.#.','#..','###'],
  3:['##.','..#','.#.','..#','##.'], 4:['#.#','#.#','###','..#','..#'], 5:['###','#..','##.','..#','##.'],
  6:['.##','#..','###','#.#','###'], 7:['###','..#','.#.','.#.','.#.'], 8:['###','#.#','###','#.#','###'],
  9:['###','#.#','###','..#','##.'],
  ' ':['...','...','...','...','...'], '.':['.','.','.','.','#'], ',':['..','..','..','.#','#.'],
  ':':['.','#','.','#','.'], '!':['#','#','#','.','#'], '?':['##.','..#','.#.','...','.#.'],
  '-':['...','...','###','...','...'], '+':['...','.#.','###','.#.','...'], '/':['..#','..#','.#.','#..','#..'],
  "'":['#','#','.','.','.'], '·':['.','.','#','.','.'], '#':['#.#','###','#.#','###','#.#'],
  '&':['.#.','#.#','.#.','#.#','.##'], '(':['.#','#.','#.','#.','.#'], ')':['#.','.#','.#','.#','#.'],
  '>':['#..','.#.','..#','.#.','#..'], '<':['..#','.#.','#..','.#.','..#'], '=':['...','###','...','###','...'],
  '▶':['#..','##.','###','##.','#..'], '◀':['..#','.##','###','.##','..#'],
  '▼':['.....','#####','.###.','..#..','.....'], '▲':['.....','..#..','.###.','#####','.....'],
  '♥':['.#.#.','#####','#####','.###.','..#..'], '♪':['.##','.#.','.#.','##.','##.'],
  '★':['..#..','.###.','#####','.###.','.#.#.'], '▮':['##','##','##','##','##'], '$':['.##','##.','.#.','.##','##.'],
};
const GLYPH = {};
for (const k in G){
  const rows = G[k];
  const pts = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === '#') pts.push(x, y);
  GLYPH[k] = { w: rows[0].length, pts };
}
function glyph(ch){ return GLYPH[ch] || GLYPH[ch.toUpperCase()] || GLYPH['?']; }
PX.textW = function(str, scale){
  scale = scale || 1;
  let w = 0;
  for (const ch of str) w += glyph(ch).w + 1;
  return Math.max(0, w - 1) * scale;
};
/* text(ctx, str, x, y, color, scale, shadow): y is the TOP of the 5px cap
   height. Optional 1px drop shadow for legibility on busy backgrounds. */
PX.text = function(ctx, str, x, y, color, scale, shadow){
  scale = scale || 1;
  x = Math.round(x); y = Math.round(y);
  const pass = (ox, oy, col) => {
    ctx.fillStyle = col;
    let cx = x;
    for (const ch of str){
      const g = glyph(ch);
      for (let i = 0; i < g.pts.length; i += 2){
        ctx.fillRect(cx + g.pts[i] * scale + ox, y + g.pts[i + 1] * scale + oy, scale, scale);
      }
      cx += (g.w + 1) * scale;
    }
  };
  if (shadow) pass(0, scale, shadow);
  pass(0, 0, color);
};
// text into a flat pixel callback (for baking into textures)
PX.textPts = function(str, cb){
  let cx = 0;
  for (const ch of str){
    const g = glyph(ch);
    for (let i = 0; i < g.pts.length; i += 2) cb(cx + g.pts[i], g.pts[i + 1]);
    cx += g.w + 1;
  }
};

/* pixel label: dark rounded-corner plate with 3×5 text, centred at (cx, y) */
PX.label = function(ctx, str, cx, y, color, bg){
  const w = PX.textW(str);
  const x = Math.round(cx - w / 2);
  ctx.fillStyle = bg || 'rgba(8,5,16,.86)';
  ctx.fillRect(x - 3, y - 2, w + 6, 9);
  ctx.fillRect(x - 2, y - 3, w + 4, 11);
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.fillRect(x - 2, y - 3, w + 4, 1);
  PX.text(ctx, str, x, y, color || '#fff');
  return w;
};

// pixel-art char-grid → canvas, with a palette map ('.' transparent)
PX.grid = function(rows, pal, outline){
  let w = 0;
  for (const r of rows) if (r.length > w) w = r.length;
  const m = outline ? 1 : 0;
  const W = w + m * 2, H = rows.length + m * 2;
  const u = new Uint32Array(W * H);
  for (let y = 0; y < rows.length; y++){
    for (let x = 0; x < rows[y].length; x++){
      const k = rows[y][x];
      if (k === '.' || k === ' ' || !pal[k]) continue;
      const c = typeof pal[k] === 'string' ? PX.hex(pal[k]) : pal[k];
      u[(y + m) * W + x + m] = pack(c[0], c[1], c[2]);
    }
  }
  return PX.fromU32(outline ? PX.outline(u, W, H) : u, W, H);
};
})();
