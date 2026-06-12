/* ============================================================
   v2b — gl.js
   WebGL hover-reveal: a single plane that follows the cursor
   with lag, bends + RGB-shifts with velocity, ripple-crossfades
   between screenshots, and expands to fullscreen on launch.
   OGL via CDN. rAF is gated: renders only while visible.
   ============================================================ */

import {
  Renderer,
  Program,
  Mesh,
  Plane,
  Texture,
} from 'https://cdn.jsdelivr.net/npm/ogl@1.0.11/+esm';

const VERTEX = /* glsl */ `
  attribute vec3 position;
  attribute vec2 uv;
  uniform vec2 uPos;
  uniform vec2 uSize;
  uniform vec2 uRes;
  uniform vec2 uVelo;
  uniform float uScale;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    /* liquid bend proportional to cursor velocity */
    pos.x += sin(uv.y * 3.14159265) * uVelo.x * 0.18;
    pos.y += sin(uv.x * 3.14159265) * uVelo.y * 0.18;

    /* slight tilt with horizontal velocity */
    float ang = uVelo.x * -0.10;
    float c = cos(ang);
    float s = sin(ang);
    pos.xy = mat2(c, -s, s, c) * pos.xy;

    vec2 world = pos.xy * uSize * uScale + uPos;
    gl_Position = vec4(world / (uRes * 0.5), 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tMapA;
  uniform sampler2D tMapB;
  uniform float uMix;
  uniform float uAlpha;
  uniform float uAspectA;
  uniform float uAspectB;
  uniform float uPlaneAspect;
  uniform vec2 uVelo;
  varying vec2 vUv;

  vec2 cover(vec2 uv, float imgA, float planeA) {
    vec2 s = vec2(1.0);
    if (imgA > planeA) s.x = planeA / imgA;
    else s.y = imgA / planeA;
    return (uv - 0.5) * s + 0.5;
  }

  void main() {
    vec2 uv = vUv;

    /* ripple, strongest mid-crossfade */
    float edge = 1.0 - abs(uMix * 2.0 - 1.0);
    uv.x += sin(uv.y * 10.0 + uMix * 6.28318) * 0.025 * edge;
    uv.y += sin(uv.x * 8.0 - uMix * 6.28318) * 0.02 * edge;

    /* velocity RGB shift */
    vec2 shift = uVelo * 0.05;
    vec2 uvA = cover(uv, uAspectA, uPlaneAspect);
    vec2 uvB = cover(uv, uAspectB, uPlaneAspect);

    vec4 a = vec4(
      texture2D(tMapA, uvA + shift).r,
      texture2D(tMapA, uvA).g,
      texture2D(tMapA, uvA - shift).b,
      1.0);
    vec4 b = vec4(
      texture2D(tMapB, uvB + shift).r,
      texture2D(tMapB, uvB).g,
      texture2D(tMapB, uvB - shift).b,
      1.0);

    vec4 col = mix(a, b, smoothstep(0.0, 1.0, uMix));
    gl_FragColor = vec4(col.rgb, uAlpha);
  }
`;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function initGL({ canvas, items }) {
  const renderer = new Renderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  });
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);

  /* --- textures (from images preloaded by app.js) ------------- */
  const textures = items.map((item) => {
    const tex = new Texture(gl, {
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });
    tex.aspect = 1.5;
    const apply = (img) => {
      tex.image = img;
      tex.aspect = img.naturalWidth / img.naturalHeight || 1.5;
    };
    if (item.img && item.img.complete && item.img.naturalWidth) {
      apply(item.img);
    } else {
      const img = item.img || new Image();
      if (!item.img) img.src = item.src;
      img.addEventListener('load', () => apply(img), { once: true });
    }
    return tex;
  });

  /* --- program / mesh ----------------------------------------- */
  const uniforms = {
    tMapA: { value: textures[0] },
    tMapB: { value: textures[0] },
    uMix: { value: 0 },
    uAlpha: { value: 0 },
    uScale: { value: 0 },
    uPos: { value: [0, 0] },
    uSize: { value: [1, 1] },
    uRes: { value: [1, 1] },
    uVelo: { value: [0, 0] },
    uAspectA: { value: 1.5 },
    uAspectB: { value: 1.5 },
    uPlaneAspect: { value: 1.5 },
  };

  const program = new Program(gl, {
    vertex: VERTEX,
    fragment: FRAGMENT,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new Mesh(gl, { geometry: new Plane(gl), program });

  /* --- state ---------------------------------------------------- */
  const state = {
    mouse: { x: 0, y: 0 },
    pos: { x: 0, y: 0 },
    velo: { x: 0, y: 0 },
    size: { w: 400, h: 250 },
    base: { w: 400, h: 250 },
    alpha: 0,
    alphaT: 0,
    scale: 0,
    scaleT: 0,
    current: -1,
    expanding: false,
  };

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.uRes.value = [window.innerWidth, window.innerHeight];
    const w = Math.min(460, window.innerWidth * 0.36);
    state.base.w = w;
    state.base.h = w * 0.625;
  }
  resize();
  window.addEventListener('resize', resize);

  window.addEventListener('pointermove', (e) => {
    state.mouse.x = e.clientX - window.innerWidth / 2;
    state.mouse.y = -(e.clientY - window.innerHeight / 2);
  });

  /* --- gated render loop ---------------------------------------- */
  let rafId = null;
  const isLive = () =>
    state.alphaT > 0 || state.alpha > 0.004 || state.expanding;

  function startLoop() {
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }

  function frame() {
    rafId = null;

    if (!state.expanding) {
      const dx = state.mouse.x - state.pos.x;
      const dy = state.mouse.y - state.pos.y;
      state.pos.x += dx * 0.085;
      state.pos.y += dy * 0.085;
      state.velo.x = lerp(state.velo.x, clamp(dx * 0.02, -1, 1), 0.08);
      state.velo.y = lerp(state.velo.y, clamp(dy * 0.02, -1, 1), 0.08);
      state.size.w = lerp(state.size.w, state.base.w, 0.12);
      state.size.h = lerp(state.size.h, state.base.h, 0.12);
    } else {
      state.velo.x = lerp(state.velo.x, 0, 0.12);
      state.velo.y = lerp(state.velo.y, 0, 0.12);
    }

    state.alpha = lerp(state.alpha, state.alphaT, 0.14);
    state.scale = lerp(state.scale, state.scaleT, 0.11);

    uniforms.uPos.value[0] = state.pos.x;
    uniforms.uPos.value[1] = state.pos.y;
    uniforms.uSize.value[0] = state.size.w;
    uniforms.uSize.value[1] = state.size.h;
    uniforms.uVelo.value[0] = state.velo.x;
    uniforms.uVelo.value[1] = state.velo.y;
    uniforms.uAlpha.value = state.alpha;
    uniforms.uScale.value = state.scale;
    uniforms.uPlaneAspect.value = state.size.w / state.size.h;

    renderer.render({ scene: mesh });

    if (isLive()) {
      rafId = requestAnimationFrame(frame);
    } else {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  /* --- public api ------------------------------------------------ */
  function show(i) {
    if (state.expanding) return;
    const tex = textures[i];
    if (!tex) return;

    if (state.current !== i) {
      if (state.current === -1 || state.alpha < 0.05) {
        /* plane is hidden — appear at the cursor with this texture */
        uniforms.tMapA.value = tex;
        uniforms.uAspectA.value = tex.aspect;
        window.gsap && window.gsap.killTweensOf(uniforms.uMix);
        uniforms.uMix.value = 0;
        state.pos.x = state.mouse.x;
        state.pos.y = state.mouse.y;
        state.scale = 0;
      } else {
        /* if a crossfade is interrupted past midpoint, commit B → A
           so fast sweeps never blend from a stale texture */
        if (uniforms.uMix.value > 0.5) {
          uniforms.tMapA.value = uniforms.tMapB.value;
          uniforms.uAspectA.value = uniforms.uAspectB.value;
        }
        /* ripple-crossfade to the next texture */
        uniforms.tMapB.value = tex;
        uniforms.uAspectB.value = tex.aspect;
        window.gsap && window.gsap.killTweensOf(uniforms.uMix);
        uniforms.uMix.value = 0;
        window.gsap &&
          window.gsap.to(uniforms.uMix, {
            value: 1,
            duration: 0.55,
            ease: 'power2.out',
            onComplete() {
              uniforms.tMapA.value = uniforms.tMapB.value;
              uniforms.uAspectA.value = uniforms.uAspectB.value;
              uniforms.uMix.value = 0;
            },
          });
      }
      state.current = i;
    }
    state.alphaT = 1;
    state.scaleT = 1;
    startLoop();
  }

  function hide() {
    if (state.expanding) return;
    state.alphaT = 0;
    state.scaleT = 0;
    state.current = -1;
    startLoop();
  }

  function isActive(i) {
    return state.current === i && state.alpha > 0.15;
  }

  function expand(i) {
    show(i);
    state.expanding = true;
    state.alphaT = 1;
    state.scaleT = 1;
    state.alpha = Math.max(state.alpha, 0.4);
    state.scale = Math.max(state.scale, 0.5);
    startLoop();
    return new Promise((resolve) => {
      if (!window.gsap) {
        resolve();
        return;
      }
      const tl = window.gsap.timeline({ onComplete: resolve });
      tl.to(
        state.size,
        {
          w: window.innerWidth * 1.02,
          h: window.innerHeight * 1.02,
          duration: 0.7,
          ease: 'expo.inOut',
        },
        0
      );
      tl.to(state.pos, { x: 0, y: 0, duration: 0.7, ease: 'expo.inOut' }, 0);
    });
  }

  function reset() {
    state.expanding = false;
    state.current = -1;
    state.alpha = 0;
    state.alphaT = 0;
    state.scale = 0;
    state.scaleT = 0;
    state.size.w = state.base.w;
    state.size.h = state.base.h;
    startLoop();
  }

  return { show, hide, expand, isActive, reset };
}
