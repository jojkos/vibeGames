// ============================================================================
// wall.js — virtualized infinite tile wall: layout, drag/inertia, scene pass
// The 14 games tile the plane in a staggered brick pattern, modulo-wrapped in
// BOTH axes (with a horizontal shift per vertical period so columns never
// stack). Everything here renders INTO the scene framebuffer; post.js owns
// what reaches the screen. Scene alpha channel = per-pixel "tunability" mask
// (artwork * tile signal) — the raw material of the signal map.
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

export const freqOf = (i) => (88.1 + i * 1.3).toFixed(1);

const hash01 = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

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

// Ambient inter-tile content: drifting ASCII static, calibration crosses,
// an oscilloscope trace that reacts to drag velocity. Lives in world space.
const BG_FRAG = /* glsl */ `
precision highp float;
uniform vec2  uRes;       // css px
uniform vec2  uCam;       // camera offset, css px
uniform vec2  uSpacing;   // (cellW/2, cellH/2) world px — calibration grid
uniform float uPeriodY;   // vertical layout period
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

  // oscilloscope trace in the gutter bands — wakes up with drag velocity
  float ph = world.x * 0.012;
  float wave = sin(ph + uTime * 1.6) * 0.55 + sin(ph * 2.31 - uTime * 2.2) * 0.3;
  wave *= 5.0 + uVel * 30.0;
  wave += (hash21(vec2(floor(world.x * 0.5), floor(uTime * 28.0))) - 0.5) * uVel * 22.0;
  float dScope = abs(mod(world.y, uPeriodY * 0.5) - uPeriodY * 0.25 - wave);
  col += vec3(0.05, 0.30, 0.12) * exp(-dScope * 0.30) * (0.35 + uVel * 0.65);

  gl_FragColor = vec4(col, 0.0);
}`;

// Frequency numbers / hex codes floating in the gutters (additive text quads)
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

const SCRAMBLE_POOL = '#%&@$/\\<>+=*0123456789ABCDEFXKZQ';

function captionText(i) {
  const g = GAMES[i];
  return `${String(i + 1).padStart(2, '0')} · ${g.name.toUpperCase()} · ${g.tag}`;
}

// ---------------------------------------------------------------------------

export class Wall {
  constructor(renderer, state, callbacks = {}) {
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.state = state;
    this.callbacks = callbacks;
    this.instances = [];
    this.isWebgl2 = !!this.gl.texSubImage3D;

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
      uRes: { value: [1, 1] },
      uPos: { value: [0, 0] },
      uSize: { value: [100, 100] },
      uTex: { value: null },
      uGlyphs: { value: this.glyphTex },
      uCover: { value: [1, 1] },
      uLoaded: { value: 0 },
      uSignal: { value: 0 },
      uMask: { value: 1 },
      uAscii: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
    };
    const tileProgram = new Program(gl, {
      vertex: QUAD_VERT,
      fragment: TILE_FRAG,
      uniforms: this.tileUniforms,
      depthTest: false,
      depthWrite: false,
      cullFace: false,   // QUAD_VERT y-flip reverses winding — culling would hide every quad
    });
    this.tileMesh = new Mesh(gl, { geometry: plane, program: tileProgram });

    this.bgUniforms = {
      uRes: { value: [1, 1] },
      uCam: { value: [0, 0] },
      uSpacing: { value: [200, 200] },
      uPeriodY: { value: 800 },
      uTime: { value: 0 },
      uVel: { value: 0 },
      uZoom: { value: 1 },
      uZoomC: { value: [0, 0] },
      uGlyphs: { value: this.glyphTex },
    };
    const bgProgram = new Program(gl, {
      vertex: /* glsl */ `
        attribute vec2 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`,
      fragment: BG_FRAG,
      uniforms: this.bgUniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.bgMesh = new Mesh(gl, { geometry: new Triangle(gl), program: bgProgram });

    this.decoUniforms = {
      uRes: { value: [1, 1] },
      uPos: { value: [0, 0] },
      uSize: { value: [100, 30] },
      uTex: { value: null },
      uAlpha: { value: 1 },
    };
    const decoProgram = new Program(gl, {
      vertex: QUAD_VERT,
      fragment: DECO_FRAG,
      uniforms: this.decoUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      cullFace: false,   // QUAD_VERT y-flip reverses winding — culling would hide every quad
    });
    decoProgram.setBlendFunc(gl.ONE, gl.ONE); // additive — glyphs only, no panels
    this.decoMesh = new Mesh(gl, { geometry: plane, program: decoProgram });
  }

  _buildTiles() {
    const gl = this.gl;
    this.tiles = GAMES.map((game, i) => {
      const tex = new Texture(gl, {
        generateMipmaps: this.isWebgl2,
        minFilter: this.isWebgl2 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
        flipY: true,
      });

      // caption strip — canvas texture, redrawable for the glitch-resolve
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 80;
      const cctx = cv.getContext('2d');
      const capTex = new Texture(gl, { image: cv, generateMipmaps: false, flipY: true });

      // gutter deco — frequency + hex id
      const dv = document.createElement('canvas');
      dv.width = 256; dv.height = 96;
      const dctx = dv.getContext('2d');
      dctx.fillStyle = '#000';
      dctx.fillRect(0, 0, dv.width, dv.height);
      dctx.fillStyle = '#9fffc0';
      dctx.font = '600 34px monospace';
      dctx.fillText(freqOf(i), 8, 38);
      dctx.fillStyle = '#5dcf85';
      dctx.font = '500 22px monospace';
      dctx.fillText('0x' + (0x4f2a + i * 0x11d).toString(16).toUpperCase(), 8, 76);
      const decoTex = new Texture(gl, { image: dv, generateMipmaps: false, flipY: true });

      const tile = {
        game, i,
        tex, aspect: 16 / 10, loadedMix: 0, loadStarted: false,
        capCanvas: cv, capCtx: cctx, capTex,
        capAmount: -1, capLastDraw: 0,
        decoTex,
        depth: 1 + (hash01(i * 3 + 1) - 0.5) * 0.11,  // subtle parallax by row depth
        jx: (hash01(i * 7 + 2) - 0.5), jy: (hash01(i * 5 + 3) - 0.5),
      };
      this._drawCaption(tile, 1); // start fully scrambled (no signal yet)
      return tile;
    });
  }

  _drawCaption(tile, scramble) {
    const ctx = tile.capCtx;
    const W = tile.capCanvas.width, H = tile.capCanvas.height;
    ctx.fillStyle = '#04180a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0a3d12';
    ctx.fillRect(0, 0, W, 4);
    let text = captionText(tile.i);
    if (scramble > 0.02) {
      text = text.split('').map(ch =>
        (ch === ' ' || ch === '·' || Math.random() > scramble)
          ? ch
          : SCRAMBLE_POOL[(Math.random() * SCRAMBLE_POOL.length) | 0]
      ).join('');
    }
    ctx.font = '600 40px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = scramble > 0.5 ? '#3fae62' : '#7dffa4';
    ctx.fillText(text, 26, H / 2 + 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#3fae62';
    ctx.fillText(freqOf(tile.i), W - 26, H / 2 + 4);
    ctx.textAlign = 'left';
    tile.capTex.needsUpdate = true;
  }

  // Called by tune.js — drives caption glitch-resolve. amount: 1 scrambled → 0 clean
  setCaptionScramble(i, amount) {
    const tile = this.tiles[i];
    const now = performance.now();
    const settled = amount < 0.02 ? 0 : amount > 0.98 ? 1 : amount;
    if (settled === 0 || settled === 1) {
      if (tile.capAmount === settled) return;
      tile.capAmount = settled;
      this._drawCaption(tile, settled);
      return;
    }
    if (now - tile.capLastDraw < 70) return;
    tile.capLastDraw = now;
    tile.capAmount = settled;
    this._drawCaption(tile, settled);
  }

  // ---- layout / virtualization -------------------------------------------

  resize() {
    const { w, h } = this.state;
    const vmin = Math.min(w, h);
    const TW = Math.max(190, Math.min(520, vmin * 0.38));
    const TH = TW * 0.62;
    const capH = Math.max(22, TW * 0.075);
    const G = TW * 0.95;                       // wide gutters — space to tune one tile at a time
    const cellW = TW + G;
    const cellH = TH + capH + G;
    this.m = {
      TW, TH, capH, G, cellW, cellH,
      cols: 7, rows: 2,
      periodX: cellW * 7,
      periodY: cellH * 2,
      shiftX: cellW * 2.5,                     // de-correlates vertical wrap
    };
    this.tiles.forEach(t => {
      const col = t.i % 7, row = (t.i / 7) | 0;
      t.baseX = col * cellW + row * cellW * 0.5 + t.jx * G * 0.5;
      t.baseY = row * cellH + t.jy * G * 0.35;
    });
    this.bgUniforms.uSpacing.value = [cellW / 2, cellH / 2];
    this.bgUniforms.uPeriodY.value = this.m.periodY;
  }

  update() {
    const { w, h, cam, zoom, zoomCenter } = this.state;
    const m = this.m;
    const out = this.instances;
    out.length = 0;
    const padX = m.TW, padY = m.TH + m.capH;

    for (const t of this.tiles) {
      const camX = cam.x * t.depth, camY = cam.y * t.depth;
      const j0 = Math.floor((camY - padY - t.baseY) / m.periodY);
      const j1 = Math.floor((camY + h + padY - t.baseY) / m.periodY);
      for (let j = j0; j <= j1; j++) {
        const sy = t.baseY + j * m.periodY - camY;
        if (sy + m.TH + m.capH < -padY || sy > h + padY) continue;
        const bx = t.baseX + j * m.shiftX;
        const k0 = Math.floor((camX - padX - bx) / m.periodX);
        const k1 = Math.floor((camX + w + padX - bx) / m.periodX);
        for (let k = k0; k <= k1; k++) {
          let sx = bx + k * m.periodX - camX;
          let isy = sy, tw = m.TW, th = m.TH, ch = m.capH;
          if (zoom !== 1) {
            sx = (sx - zoomCenter.x) * zoom + zoomCenter.x;
            isy = (isy - zoomCenter.y) * zoom + zoomCenter.y;
            tw *= zoom; th *= zoom; ch *= zoom;
          }
          out.push({
            ti: t.i, key: t.i + '_' + j + '_' + k,
            x: sx, y: isy, w: tw, h: th, capH: ch,
            cx: sx + tw / 2, cy: isy + th / 2,
            signal: 0,
          });
        }
      }
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

    // tiles + captions (opaque — alpha channel carries the tune mask)
    u.uRes.value = res;
    u.uTime.value = state.time;
    u.uAscii.value = state.ascii;
    for (const inst of this.instances) {
      const tile = this.tiles[inst.ti];
      const qa = inst.w / inst.h;
      const ia = tile.aspect;
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

      // caption strip — never tunes (uMask 0), always phosphor
      u.uTex.value = tile.capTex;
      u.uCover.value = [1, 1];
      u.uLoaded.value = 1;
      u.uMask.value = 0;
      u.uPos.value = [inst.cx, inst.y + inst.h + inst.capH / 2 + 2];
      u.uSize.value = [inst.w, inst.capH];
      renderer.render({ scene: this.tileMesh, target, clear: false, frustumCull: false, sort: false });
    }

    // gutter deco (additive; alpha writes off so the tune mask stays clean)
    gl.colorMask(true, true, true, false);
    const d = this.decoUniforms;
    d.uRes.value = res;
    for (const inst of this.instances) {
      const tile = this.tiles[inst.ti];
      const dw = Math.max(70, inst.w * 0.26);
      const dh = dw * 0.375;
      d.uTex.value = tile.decoTex;
      d.uAlpha.value = 0.55;
      d.uPos.value = [inst.x + inst.w + dw * 0.62, inst.y + dh * 0.4];
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
    for (let c = 0; c < 4; c++) next(); // 4 parallel lanes
  }

  // ---- input ---------------------------------------------------------------

  _setupDrag() {
    const state = this.state;
    const wall = this;
    const proxy = document.createElement('div');
    proxy.style.cssText = 'position:absolute;width:1px;height:1px;left:0;top:0;visibility:hidden';
    document.body.appendChild(proxy);

    let pressCam = { x: 0, y: 0 }, pressX = 0, pressY = 0;
    const apply = function () {
      state.cam.x = pressCam.x - (this.x - pressX);
      state.cam.y = pressCam.y - (this.y - pressY);
    };

    this.draggable = Draggable.create(proxy, {
      type: 'x,y',
      trigger: '#stage',
      inertia: true,
      throwResistance: 1800,
      maxDuration: 1.6,
      onPress() {
        gsap.killTweensOf(state.cam);
        pressCam = { x: state.cam.x, y: state.cam.y };
        pressX = this.x; pressY = this.y;
        state.dragging = true;
        wall.callbacks.onPress && wall.callbacks.onPress();
      },
      onDrag: apply,
      onThrowUpdate: apply,
      onRelease() { state.dragging = false; },
      onClick(e) { wall.callbacks.onTap && wall.callbacks.onTap(e); },
    })[0];
  }

  hitTest(x, y) {
    // last-drawn wins (top-most), though tiles never overlap in practice
    for (let i = this.instances.length - 1; i >= 0; i--) {
      const t = this.instances[i];
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h + t.capH) return t;
    }
    return null;
  }

  // Glide the wall so the given instance lands at screen center
  glideToInstance(inst, dur = 0.8, onDone) {
    const { w, h, cam } = this.state;
    const depth = this.tiles[inst.ti].depth;
    const dx = (w / 2 - inst.cx), dy = (h / 2 - inst.cy);
    gsap.to(cam, {
      x: cam.x - dx / depth,
      y: cam.y - dy / depth,
      duration: dur,
      ease: 'power3.out',
      overwrite: 'auto',
      onComplete: onDone,
    });
  }

  // Nearest wrapped copy of a tile (even off-screen) — for the 'pug' egg
  nearestInstanceOf(ti) {
    const t = this.tiles[ti];
    const { w, h, cam } = this.state;
    const m = this.m;
    const camX = cam.x * t.depth, camY = cam.y * t.depth;
    const targetY = camY + h / 2 - (m.TH + m.capH) / 2;
    const j = Math.round((targetY - t.baseY) / m.periodY);
    const bx = t.baseX + j * m.shiftX;
    const targetX = camX + w / 2 - m.TW / 2;
    const k = Math.round((targetX - bx) / m.periodX);
    const sx = bx + k * m.periodX - camX;
    const sy = t.baseY + j * m.periodY - camY;
    return {
      ti, key: ti + '_' + j + '_' + k,
      x: sx, y: sy, w: m.TW, h: m.TH, capH: m.capH,
      cx: sx + m.TW / 2, cy: sy + m.TH / 2, signal: 0,
    };
  }

  setDragEnabled(on) {
    if (!this.draggable) return;
    on ? this.draggable.enable() : this.draggable.disable();
  }
}
