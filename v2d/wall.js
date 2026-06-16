// ============================================================================
// wall.js — the RECEIVER: a 1D radio band. The 14 games are stations on an
// 88.1–105.0 FM dial; a fixed centre needle, the band scrolls under it as you
// tune. Drag = manual ("assisted analog": momentum + magnetic detents onto
// stations). Each station renders as green glyphs at rest and resolves to the
// real screenshot as it centres (uSignal). One hidden "pirate" station hides in
// a gap. Everything renders INTO the scene framebuffer; post.js owns the screen.
// ============================================================================

import { Plane, Triangle, Program, Mesh, Texture } from 'ogl';

export const GAMES = [
  { name: 'Zoopaloola',           url: 'https://zoopaloola.vercel.app/',           tag: 'ARCADE',  img: '../screenshots/zoopaloola.png' },
  { name: 'Factorio Lamp Editor', url: 'https://factorio-lamp-editor.vercel.app/', tag: 'TOOL',    img: '../screenshots/factorio-lamp.png' },
  { name: 'LoL Fusion loldle',    url: 'https://lol-fusion.vercel.app/',           tag: 'PUZZLE',  img: '../screenshots/lol-fusion.png' },
  { name: 'Pug Fiesta',           url: 'https://pug-fiesta.vercel.app/',           tag: 'ACTION',  img: '../screenshots/pug-fiesta.png' },
  { name: 'Pug Fiesta 3D',        url: 'https://pug-fiesta3-d.vercel.app/',        tag: 'ACTION',  img: '../screenshots/pug-fiesta-3d.png' },
  { name: 'Combat Arena',         url: 'https://combatarena.onrender.com/',        tag: 'PVP',     img: '../screenshots/combat-arena.png' },
  { name: 'Bluff Helper',         url: '../bluff/index.html',                      tag: 'TOOL',    img: '../screenshots/bluff.png' },
  { name: 'Calendar Puzzle',      url: 'https://calendar-puzzle2.vercel.app/',     tag: 'PUZZLE',  img: '../screenshots/calendar-puzzle.png' },
  { name: 'Pokemon Shooter',      url: '../pokemonShooter/index.html',             tag: 'SHOOTER', img: '../screenshots/pokemon-shooter.png' },
  { name: 'Tralala Clicker',      url: '../tralalaGame/index.html',                tag: 'CLICKER', img: '../screenshots/tralala.png' },
  { name: 'LoL Wheel',            url: '../lolWheel/index.html',                   tag: 'RNG',     img: '../screenshots/lol-wheel.png' },
  { name: 'Neon Drifter',         url: '../neonDrifter/index.html',                tag: 'RACE',    img: '../screenshots/neon-drifter.png' },
  { name: 'Guitar Tuner',         url: '../guitarTuner/index.html',                tag: 'TOOL',    img: '../screenshots/guitar-tuner.png' },
  { name: 'OK Corral',            url: 'https://okcorral.onrender.com/',           tag: 'SHOOTER', img: '../screenshots/ok-corral.png' },
];

// numeric frequency for the maths, padded string for display
export const stationFreq = (i) => 88.1 + i * 1.3;
export const freqOf = (i) => stationFreq(i).toFixed(1);
export const FREQ_MIN = stationFreq(0);                 // 88.1
export const FREQ_MAX = stationFreq(GAMES.length - 1);  // 105.0
const PIRATE_FREQ = 100.45;                              // hidden, sits in the 99.8→101.1 gap

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------------------
// Shaders (GLSL1 — works on both WebGL1/2 contexts)
// ---------------------------------------------------------------------------

const QUAD_VERT = /* glsl */ `
attribute vec3 position;
attribute vec2 uv;
uniform vec2 uRes;   // css px
uniform vec2 uPos;   // quad center, css px (y down)
uniform vec2 uSize;  // quad size, css px
varying vec2 vUv;
void main() {
  vUv = uv;
  vec2 p = uPos + position.xy * uSize;
  vec2 ndc = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}`;

const TILE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uGlyphs;
uniform vec2  uCover;   // uv scale for cover-crop
uniform float uLoaded;  // 0 = static placeholder, 1 = screenshot arrived
uniform float uSignal;  // tile signal 0..1 (eased, per instance)
uniform float uMask;    // 1 = artwork (tunable), 0 = caption (always phosphor)
uniform float uAscii;   // easter egg: collapse artwork to ASCII glyphs
uniform float uTime;
uniform float uSeed;
varying vec2 vUv;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main() {
  vec2 uv = vUv;                                      // y-down, screen-aligned
  vec2 cuv = (uv - 0.5) * uCover + 0.5;
  vec3 img = texture2D(uTex, vec2(cuv.x, 1.0 - cuv.y)).rgb;  // real screenshot

  // not-yet-loaded tiles broadcast raw static (they "tune in from black")
  float n = hash21(floor(uv * vec2(96.0, 60.0)) + floor(uTime * 22.0) * 0.371 + uSeed * 17.0);
  vec3 stat = vec3(0.09, 0.30, 0.14) * (0.2 + 0.8 * n);

  // captions (uMask 0) skip the glyph treatment — post.js phosphors them.
  if (uMask < 0.5) {
    gl_FragColor = vec4(mix(stat, img, uLoaded), 0.0);
    return;
  }

  // ---- glyph condensation (the rest state, v2c-style) -----------------------
  // sample the artwork at grid resolution, map luminance → glyph, tint green.
  vec2 grid = vec2(42.0, 26.0);
  vec2 cid = floor(uv * grid);
  vec2 suv = ((cid + 0.5) / grid - 0.5) * uCover + 0.5;
  vec3 cellCol = texture2D(uTex, vec2(suv.x, 1.0 - suv.y)).rgb;
  float lum = dot(cellCol, vec3(0.299, 0.587, 0.114));
  float gi = floor(clamp(pow(lum, 0.85), 0.0, 0.999) * 16.0);
  vec2 gxy = vec2(mod(gi, 4.0), floor(gi / 4.0));
  vec2 guv = (gxy + fract(uv * grid)) / 4.0;
  float g = texture2D(uGlyphs, vec2(guv.x, 1.0 - guv.y)).r;
  vec3 glyphCol = vec3(0.22, 0.95, 0.42) * g * (0.22 + 0.9 * lum);

  // before load → static; tune-in (uSignal) resolves glyphs → true screenshot.
  vec3 rest  = mix(stat, glyphCol, uLoaded);
  vec3 photo = mix(stat, img,      uLoaded);
  float reveal = smoothstep(0.30, 0.85, uSignal);
  vec3 col = mix(rest, photo, reveal);

  // 'static' easter egg forces the glyph collapse regardless of tune.
  col = mix(col, glyphCol, uAscii);

  gl_FragColor = vec4(col, uMask * uLoaded);
}`;

// Ambient between-station content: drifting ASCII static, calibration crosses,
// an oscilloscope trace that reacts to drag velocity. Scrolls with the dial.
const BG_FRAG = /* glsl */ `
precision highp float;
uniform vec2  uRes;       // css px
uniform vec2  uCam;       // band scroll, css px
uniform vec2  uSpacing;   // calibration grid
uniform float uPeriodY;
uniform float uTime;
uniform float uVel;       // 0..1 drag velocity
uniform float uZoom;
uniform vec2  uZoomC;
uniform sampler2D uGlyphs;
varying vec2 vUv;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main() {
  vec2 css = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  css = (css - uZoomC) / uZoom + uZoomC;
  vec2 world = css + uCam * 0.85;     // slight depth: bg sits behind tiles

  vec3 col = vec3(0.004, 0.016, 0.007);
  col += vec3(0.0, 0.012, 0.004) * hash21(floor(world / 240.0));

  // drifting ASCII static — patches of glyph noise sliding across the void
  vec2 drift = world + vec2(uTime * 7.0, uTime * 2.5);
  vec2 cell = floor(drift / 14.0);
  float patch = hash21(floor(drift / 230.0) + floor(uTime * 0.21));
  if (patch > 0.6) {
    float r = hash21(cell + floor(uTime * 2.5));
    float gi = floor(r * 15.999);
    vec2 gxy = vec2(mod(gi, 4.0), floor(gi / 4.0));
    vec2 guv = (gxy + fract(drift / 14.0)) / 4.0;
    float g = texture2D(uGlyphs, vec2(guv.x, 1.0 - guv.y)).r;
    col += vec3(0.05, 0.20, 0.09) * g * (0.25 + 0.75 * r) * smoothstep(0.6, 0.85, patch);
  }

  // calibration crosses on the layout grid
  vec2 gp = abs(mod(world, uSpacing) - uSpacing * 0.5);
  float cross = (1.0 - step(1.0, gp.x)) * (1.0 - step(7.0, gp.y))
              + (1.0 - step(1.0, gp.y)) * (1.0 - step(7.0, gp.x));
  col += vec3(0.02, 0.09, 0.04) * clamp(cross, 0.0, 1.0);

  // oscilloscope trace through the centre band — wakes up with drag velocity
  float ph = world.x * 0.012;
  float wave = sin(ph + uTime * 1.6) * 0.55 + sin(ph * 2.31 - uTime * 2.2) * 0.3;
  wave *= 5.0 + uVel * 30.0;
  wave += (hash21(vec2(floor(world.x * 0.5), floor(uTime * 28.0))) - 0.5) * uVel * 22.0;
  float dScope = abs(mod(world.y, uPeriodY * 0.5) - uPeriodY * 0.25 - wave);
  col += vec3(0.05, 0.30, 0.12) * exp(-dScope * 0.30) * (0.35 + uVel * 0.65);

  gl_FragColor = vec4(col, 0.0);
}`;

// Per-station frequency tag floating beside the stage (additive text quads)
const DECO_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec3 t = texture2D(uTex, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  gl_FragColor = vec4(t * uAlpha, 0.0);
}`;

// ---------------------------------------------------------------------------
// Canvas-generated textures
// ---------------------------------------------------------------------------

const GLYPHS = ' .:-~=+*x%#@8&WM'; // 16 glyphs, dark → bright

function makeGlyphAtlas(gl) {
  const S = 256, C = S / 4;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${C * 0.82}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 16; i++) {
    const x = (i % 4) * C + C / 2;
    const y = Math.floor(i / 4) * C + C / 2;
    ctx.fillText(GLYPHS[i], x, y);
  }
  return new Texture(gl, { image: cv, generateMipmaps: false });
}

// The hidden pirate station's artwork — pure ASCII, never an external image.
function makePirateTexture(gl) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 320;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#020a04';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#4dff7a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('☠  PIRATE SIGNAL  ☠', cv.width / 2, 70);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#2e7a45';
  const lines = [
    'unlicensed transmission · 100.45',
    '',
    'you found the gap between',
    'the stations. nice ears.',
    '',
    '> the signal degrades, but',
    '  someone is always broadcasting.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, cv.width / 2, 120 + i * 26));
  return new Texture(gl, { image: cv, generateMipmaps: false, flipY: true });
}

const SCRAMBLE_POOL = '#%&@$/\\<>+=*0123456789ABCDEFXKZQ';

// ---------------------------------------------------------------------------

export class Wall {
  constructor(renderer, state, callbacks = {}) {
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.state = state;
    this.callbacks = callbacks;
    this.instances = [];
    this.isWebgl2 = !!this.gl.texSubImage3D;

    // tuning physics (feel dials)
    this.vel = 0;            // MHz / s
    this.MAGNET = 26;        // gentle detent pull — only near a station
    this.FRICTION = 3.0;     // inertia damping (lets flicks glide through static)
    this.DETENT = 0.16;      // MHz: detent only engages within this of a station
    this._dragDisabled = false;

    this.glyphTex = makeGlyphAtlas(this.gl);
    this._buildPrograms();
    this._buildTiles();
    this.resize();
    this._setupDrag();
  }

  // ---- GL objects ---------------------------------------------------------

  _buildPrograms() {
    const gl = this.gl;
    const plane = new Plane(gl, { width: 1, height: 1 });

    this.tileUniforms = {
      uRes: { value: [1, 1] }, uPos: { value: [0, 0] }, uSize: { value: [100, 100] },
      uTex: { value: null }, uGlyphs: { value: this.glyphTex }, uCover: { value: [1, 1] },
      uLoaded: { value: 0 }, uSignal: { value: 0 }, uMask: { value: 1 },
      uAscii: { value: 0 }, uTime: { value: 0 }, uSeed: { value: 0 },
    };
    const tileProgram = new Program(gl, {
      vertex: QUAD_VERT, fragment: TILE_FRAG, uniforms: this.tileUniforms,
      depthTest: false, depthWrite: false,
      cullFace: false,   // QUAD_VERT y-flip reverses winding — culling would hide every quad
    });
    this.tileMesh = new Mesh(gl, { geometry: plane, program: tileProgram });

    this.bgUniforms = {
      uRes: { value: [1, 1] }, uCam: { value: [0, 0] }, uSpacing: { value: [200, 200] },
      uPeriodY: { value: 800 }, uTime: { value: 0 }, uVel: { value: 0 },
      uZoom: { value: 1 }, uZoomC: { value: [0, 0] }, uGlyphs: { value: this.glyphTex },
    };
    const bgProgram = new Program(gl, {
      vertex: /* glsl */ `
        attribute vec2 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`,
      fragment: BG_FRAG, uniforms: this.bgUniforms, depthTest: false, depthWrite: false,
    });
    this.bgMesh = new Mesh(gl, { geometry: new Triangle(gl), program: bgProgram });

    this.decoUniforms = {
      uRes: { value: [1, 1] }, uPos: { value: [0, 0] }, uSize: { value: [100, 30] },
      uTex: { value: null }, uAlpha: { value: 1 },
    };
    const decoProgram = new Program(gl, {
      vertex: QUAD_VERT, fragment: DECO_FRAG, uniforms: this.decoUniforms,
      transparent: true, depthTest: false, depthWrite: false,
      cullFace: false,
    });
    decoProgram.setBlendFunc(gl.ONE, gl.ONE); // additive
    this.decoMesh = new Mesh(gl, { geometry: plane, program: decoProgram });
  }

  _buildTiles() {
    const gl = this.gl;
    const make = (spec, idx) => {
      const tex = spec.pirate
        ? makePirateTexture(gl)
        : new Texture(gl, {
            generateMipmaps: this.isWebgl2,
            minFilter: this.isWebgl2 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
            flipY: true,
          });

      // caption strip — canvas texture, redrawable for the glitch-resolve
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 80;
      const capTex = new Texture(gl, { image: cv, generateMipmaps: false, flipY: true });

      // frequency tag beside the stage
      const dv = document.createElement('canvas');
      dv.width = 256; dv.height = 96;
      const dctx = dv.getContext('2d');
      dctx.fillStyle = '#000'; dctx.fillRect(0, 0, dv.width, dv.height);
      dctx.fillStyle = '#9fffc0'; dctx.font = '600 34px monospace';
      dctx.fillText(spec.freq.toFixed(1), 8, 38);
      dctx.fillStyle = '#5dcf85'; dctx.font = '500 22px monospace';
      dctx.fillText('0x' + (0x4f2a + idx * 0x11d).toString(16).toUpperCase(), 8, 76);
      const decoTex = new Texture(gl, { image: dv, generateMipmaps: false, flipY: true });

      const tile = {
        game: spec.game, idx, freq: spec.freq, pirate: !!spec.pirate,
        tex, aspect: spec.pirate ? 512 / 320 : 16 / 10,
        loadedMix: spec.pirate ? 1 : 0, loadStarted: !!spec.pirate,
        capCanvas: cv, capCtx: cv.getContext('2d'), capTex,
        capAmount: -1, capLastDraw: 0, decoTex,
      };
      this._drawCaption(tile, 1); // start scrambled
      return tile;
    };

    this.tiles = GAMES.map((game, i) => make({ game, freq: stationFreq(i) }, i));
    // pirate station: hidden in a gap, not in GAMES / INDEX
    this.tiles.push(make({
      game: { name: 'Pirate Signal', url: null, tag: 'SECRET' },
      freq: PIRATE_FREQ, pirate: true,
    }, this.tiles.length));
  }

  _drawCaption(tile, scramble) {
    const ctx = tile.capCtx;
    const W = tile.capCanvas.width, H = tile.capCanvas.height;
    ctx.fillStyle = '#04180a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0a3d12'; ctx.fillRect(0, 0, W, 4);
    let text = `${tile.game.name.toUpperCase()} · ${tile.game.tag}`;
    if (scramble > 0.02) {
      text = text.split('').map(ch =>
        (ch === ' ' || ch === '·' || Math.random() > scramble)
          ? ch : SCRAMBLE_POOL[(Math.random() * SCRAMBLE_POOL.length) | 0]
      ).join('');
    }
    ctx.font = '600 40px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = scramble > 0.5 ? '#3fae62' : '#7dffa4';
    ctx.fillText(text, 26, H / 2 + 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#3fae62';
    ctx.fillText(tile.freq.toFixed(1), W - 26, H / 2 + 4);
    ctx.textAlign = 'left';
    tile.capTex.needsUpdate = true;
  }

  // amount: 1 scrambled → 0 clean
  setCaptionScramble(idx, amount) {
    const tile = this.tiles[idx];
    if (!tile) return;
    const now = performance.now();
    const settled = amount < 0.02 ? 0 : amount > 0.98 ? 1 : amount;
    if (settled === 0 || settled === 1) {
      if (tile.capAmount === settled) return;
      tile.capAmount = settled; this._drawCaption(tile, settled); return;
    }
    if (now - tile.capLastDraw < 70) return;
    tile.capLastDraw = now; tile.capAmount = settled; this._drawCaption(tile, settled);
  }

  // ---- layout -------------------------------------------------------------

  resize() {
    const { w, h } = this.state;
    const stageW = Math.max(240, Math.min(560, w * 0.40));
    const stageH = stageW * 0.62;
    const capH = Math.max(20, stageW * 0.07);
    const gap = stageW * 0.85;                  // static air between stations
    const pxPerMhz = (stageW + gap) / 1.3;      // 1.3 MHz channel spacing
    this.m = {
      stageW, stageH, capH, gap, pxPerMhz,
      centerX: w / 2, centerY: h / 2,
      loLock: 0.03, hiLock: 0.20,               // |df| MHz → signal falloff (tight = static between)
    };
    this.bgUniforms.uSpacing.value = [(stageW + gap) / 2, (stageH + capH + gap) / 2];
    this.bgUniforms.uPeriodY.value = (stageH + capH) * 2;
  }

  freqToX(freq) { return this.m.centerX + (freq - this.state.freq) * this.m.pxPerMhz; }

  nearestStation(freq) {
    let best = null, bd = 1e9;
    for (const t of this.tiles) {
      if (t.pirate) continue;                   // magnet ignores the hidden one
      const d = Math.abs(t.freq - freq);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  clampFreq(f) { return clamp(f, FREQ_MIN - 0.45, FREQ_MAX + 0.45); }

  // ---- tuning physics (assisted analog) -----------------------------------

  physics(dt) {
    const s = this.state;
    if (s.dragging || s.seeking || s.launching) return;
    s.freq = this.clampFreq(s.freq + this.vel * dt);     // inertia glide
    this.vel *= Math.exp(-this.FRICTION * dt);           // friction
    // soft detent: only pull when you've coasted close to a station AND are slow.
    // Outside the detent zone you rest wherever you stop — in the static.
    const near = this.nearestStation(s.freq);
    if (near) {
      const df = near.freq - s.freq;
      if (Math.abs(df) < this.DETENT && Math.abs(this.vel) < 1.0) {
        this.vel += df * this.MAGNET * dt;               // ease the last bit in
        if (Math.abs(df) < 0.004 && Math.abs(this.vel) < 0.03) { s.freq = near.freq; this.vel = 0; }
      }
    }
  }

  // animate to the previous/next real station
  seek(dir) {
    const s = this.state;
    if (s.launching) return;
    const eps = 0.04;
    let target = null;
    for (const t of this.tiles) {
      if (t.pirate) continue;
      if (dir > 0 && t.freq > s.freq + eps) { if (!target || t.freq < target.freq) target = t; }
      if (dir < 0 && t.freq < s.freq - eps) { if (!target || t.freq > target.freq) target = t; }
    }
    if (!target) return;
    s.seeking = true; this.vel = 0;
    gsap.killTweensOf(s);
    gsap.to(s, {
      freq: target.freq, duration: 0.55, ease: 'power2.inOut',
      onUpdate: () => { s.freq = this.clampFreq(s.freq); },
      onComplete: () => { s.seeking = false; this.vel = 0; this.callbacks.onLock && this.callbacks.onLock(target.idx); },
    });
    this.callbacks.onSeek && this.callbacks.onSeek(dir);
  }

  // ---- per-frame layout ---------------------------------------------------

  update() {
    const s = this.state, m = this.m;
    // drive bg scroll + drag-velocity tracking from the dial position
    s.cam.x = (s.freq - FREQ_MIN) * m.pxPerMhz;
    s.cam.y = 0;

    const out = this.instances;
    out.length = 0;
    const cull = s.w / 2 + m.stageW;

    for (const t of this.tiles) {
      const dx = (t.freq - s.freq) * m.pxPerMhz;
      if (Math.abs(dx) > cull) continue;
      const df = Math.abs(t.freq - s.freq);
      const signal = 1 - smoothstep(m.loLock, m.hiLock, df);

      let cx = m.centerX + dx, cy = m.centerY;
      let tw = m.stageW, th = m.stageH, ch = m.capH;
      if (s.zoom !== 1) {
        cx = (cx - s.zoomCenter.x) * s.zoom + s.zoomCenter.x;
        cy = (cy - s.zoomCenter.y) * s.zoom + s.zoomCenter.y;
        tw *= s.zoom; th *= s.zoom; ch *= s.zoom;
      }
      out.push({
        ti: t.idx, key: t.idx,
        x: cx - tw / 2, y: cy - th / 2, w: tw, h: th, capH: ch,
        cx, cy, signal,
      });
    }
  }

  // ---- render (scene pass → framebuffer) ----------------------------------

  render(target) {
    const { renderer, gl, state } = this;
    const u = this.tileUniforms;
    const res = [state.w, state.h];

    // background (clears the target)
    const b = this.bgUniforms;
    b.uRes.value = res;
    b.uCam.value = [state.cam.x, state.cam.y];
    b.uTime.value = state.time;
    b.uVel.value = state.velNorm;
    b.uZoom.value = state.zoom;
    b.uZoomC.value = [state.zoomCenter.x, state.zoomCenter.y];
    renderer.render({ scene: this.bgMesh, target, clear: true, frustumCull: false, sort: false });

    // tiles + captions
    u.uRes.value = res;
    u.uTime.value = state.time;
    u.uAscii.value = state.ascii;
    for (const inst of this.instances) {
      const tile = this.tiles[inst.ti];
      const qa = inst.w / inst.h, ia = tile.aspect;
      u.uTex.value = tile.tex;
      u.uGlyphs.value = this.glyphTex;
      u.uCover.value = ia > qa ? [qa / ia, 1] : [1, ia / qa];
      u.uLoaded.value = tile.loadedMix;
      u.uSignal.value = inst.signal;
      u.uSeed.value = inst.ti;
      u.uMask.value = 1;
      u.uPos.value = [inst.cx, inst.cy];
      u.uSize.value = [inst.w, inst.h];
      renderer.render({ scene: this.tileMesh, target, clear: false, frustumCull: false, sort: false });

      // caption strip below the stage — phosphored by post.js
      u.uTex.value = tile.capTex;
      u.uCover.value = [1, 1];
      u.uLoaded.value = 1;
      u.uMask.value = 0;
      u.uPos.value = [inst.cx, inst.y + inst.h + inst.capH / 2 + 2];
      u.uSize.value = [inst.w, inst.capH];
      renderer.render({ scene: this.tileMesh, target, clear: false, frustumCull: false, sort: false });
    }

    // frequency tag (additive; alpha off so the tune mask stays clean)
    gl.colorMask(true, true, true, false);
    const d = this.decoUniforms;
    d.uRes.value = res;
    for (const inst of this.instances) {
      const tile = this.tiles[inst.ti];
      const dw = Math.max(70, inst.w * 0.26), dh = dw * 0.375;
      d.uTex.value = tile.decoTex;
      d.uAlpha.value = 0.5 + 0.5 * inst.signal;
      d.uPos.value = [inst.x + dw * 0.5 + 6, inst.y - dh * 0.3];
      d.uSize.value = [dw, dh];
      this.renderer.render({ scene: this.decoMesh, target, clear: false, frustumCull: false, sort: false });
    }
    gl.colorMask(true, true, true, true);
  }

  // ---- textures (lazy, after first paint) ----------------------------------

  loadTextures() {
    let idx = 0;
    const next = () => {
      while (idx < this.tiles.length) {
        const tile = this.tiles[idx++];
        if (tile.loadStarted) continue;
        tile.loadStarted = true;
        const img = new Image();
        img.onload = () => {
          tile.tex.image = img;
          tile.tex.needsUpdate = true;
          tile.aspect = img.naturalWidth / img.naturalHeight;
          gsap.to(tile, { loadedMix: 1, duration: 0.7, ease: 'power2.out' });
          next();
        };
        img.onerror = () => next();
        img.src = tile.game.img;
        return;
      }
    };
    for (let c = 0; c < 4; c++) next();
  }

  // ---- input (custom 1D drag: manual tune) --------------------------------

  _setupDrag() {
    const el = document.getElementById('stage');
    const s = this.state;
    let active = false, startX = 0, startFreq = 0, lastX = 0, lastT = 0, moved = 0, pid = null;

    const down = (e) => {
      if (this._dragDisabled || s.launching) return;
      active = true; s.dragging = true; this.vel = 0; moved = 0; pid = e.pointerId;
      startX = e.clientX; startFreq = s.freq; lastX = e.clientX; lastT = performance.now();
      gsap.killTweensOf(s);
      this.callbacks.onPress && this.callbacks.onPress();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    };
    const move = (e) => {
      if (!active || e.pointerId !== pid) return;
      const x = e.clientX;
      moved += Math.abs(x - lastX);
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastT) / 1000);
      const prev = s.freq;
      s.freq = this.clampFreq(startFreq - (x - startX) / this.m.pxPerMhz);
      this.vel = this.vel * 0.55 + ((s.freq - prev) / dt) * 0.45;   // smoothed MHz/s
      lastX = x; lastT = now;
    };
    const up = (e) => {
      if (!active || e.pointerId !== pid) return;
      active = false; s.dragging = false; pid = null;
      if (moved < 6) this.callbacks.onTap && this.callbacks.onTap(e);   // treat as click
    };

    el.addEventListener('pointerdown', down);
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  setDragEnabled(on) { this._dragDisabled = !on; }
}
