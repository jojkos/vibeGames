// ============================================================================
// post.js — signal-processing pipeline (everything the eye actually sees)
//
//   scene pass (wall.js) → sceneRT
//   composite pass: Bayer ordered dither → 4-step phosphor ramp, tune-in field
//                   around the cursor (scene alpha × radial field = signal map),
//                   phosphor persistence (feedback blend vs. previous frame) → histRT
//   final pass:     barrel, chromatic aberration (velocity-scaled), scanlines,
//                   grain, vignette, CRT power-on intro, power-off launch → screen
//
// Weak-GPU "combo" mode: one pass, no persistence/aberration, straight to screen.
// ============================================================================

import { Triangle, Program, Mesh, RenderTarget } from 'ogl';

const HASH = /* glsl */ `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

const BAYER = /* glsl */ `
float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }
`;

// The hero: dither→truecolor tune-in. scene alpha (tile signal) × radial field
// around the tune point = smooth spatial signal map. As it rises the dither
// cell shrinks, the ramp brightens, then real color bleeds through.
const GRADE = /* glsl */ `
uniform vec2  uTune;      // tune point, buffer px (y-up)
uniform float uRadius;    // tune field radius, buffer px
uniform float uOverdrive; // launch over-tune
uniform float uDpr;

const vec3 P0 = vec3(0.008, 0.102, 0.024);  // #021a06
const vec3 P1 = vec3(0.039, 0.239, 0.071);  // #0a3d12
const vec3 P2 = vec3(0.122, 0.478, 0.180);  // #1f7a2e
const vec3 P3 = vec3(0.302, 1.000, 0.478);  // #4dff7a

vec3 grade(vec4 scn, vec2 fpx) {
  float lum = dot(scn.rgb, vec3(0.299, 0.587, 0.114));
  float field = 1.0 - smoothstep(uRadius * 0.15, uRadius, distance(fpx, uTune));
  float tune = clamp(scn.a * field + scn.a * uOverdrive, 0.0, 1.0);

  float cell = mix(2.5, 1.0, smoothstep(0.0, 0.65, tune)) * max(uDpr, 1.0);
  float b = bayer8(fpx / cell);
  float l2 = pow(clamp(lum, 0.0, 1.0), 0.85);
  float q = clamp(floor(l2 * 3.0 + (b - 0.5) * 0.95 + 0.5), 0.0, 3.0);
  vec3 ramp = q < 0.5 ? P0 : (q < 1.5 ? P1 : (q < 2.5 ? P2 : P3));
  vec3 dith = ramp * (1.0 + tune * 0.15);

  float cmix = smoothstep(0.42, 0.92, tune);
  return mix(dith, scn.rgb * (1.0 + uOverdrive * 1.6), cmix);
}`;

const FINISH = /* glsl */ `
uniform float uVel;    // 0..1 drag velocity
uniform float uIntro;  // 0..1 CRT power-on
uniform float uOff;    // 0..1 CRT power-off (launch)
uniform float uFlash;  // one frame of raw static during launch

vec3 finishCRT(vec3 col, vec2 suv, vec2 buv, float r2) {
  float scan = 1.0 - 0.07 * (0.5 + 0.5 * sin(buv.y * uRes.y * 1.57));
  col *= scan;
  float gr = hash21(floor(suv * uRes * 0.5) + vec2(floor(uTime * 60.0)));
  col += (gr - 0.5) * 0.035;
  col *= 1.0 - 0.34 * smoothstep(0.10, 0.55, r2);
  return col;
}

vec3 applyPhase(vec3 col, vec2 suv) {
  float fn = hash21(floor(suv * uRes * 0.35) + vec2(floor(uTime * 80.0), 7.0));
  col = mix(col, vec3(0.35, 1.0, 0.55) * (0.2 + 0.8 * fn), clamp(uFlash, 0.0, 1.0));

  if (uIntro < 1.0) {  // power-on: white line blooms open
    float openA = smoothstep(0.06, 0.9, uIntro) * 0.5;
    float dy = abs(suv.y - 0.5);
    float vis = step(dy, openA);
    float line = exp(-abs(dy - openA) * uRes.y * 0.10) * (1.0 - smoothstep(0.82, 1.0, uIntro));
    float warm = smoothstep(0.0, 0.18, uIntro);
    col = col * vis * warm + vec3(0.65, 1.0, 0.78) * line * warm * 1.5;
  }
  if (uOff > 0.0) {    // power-off: blow out, collapse to a line, cut
    float dy = abs(suv.y - 0.5);
    col *= 1.0 + uOff * 2.0;
    col += vec3(0.7, 1.0, 0.8) * exp(-dy * uRes.y * 0.20) * uOff * 1.2;
    col *= 1.0 - smoothstep(0.93, 1.0, uOff);
  }
  return col;
}`;

const VERT = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uPrev;
uniform vec2  uRes;
uniform float uTime;
uniform float uPersist;
${HASH}${BAYER}${GRADE}
void main() {
  vec4 scn = texture2D(uScene, vUv);
  vec3 col = grade(scn, vUv * uRes);
  vec3 prev = texture2D(uPrev, vUv).rgb;
  col = mix(col, prev, uPersist);   // phosphor persistence feedback
  gl_FragColor = vec4(col, 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2  uRes;
uniform float uTime;
${HASH}${FINISH}
void main() {
  vec2 uv = vUv;
  float s = max(1.0 - uOff * 0.996, 0.004);
  uv.y = 0.5 + (uv.y - 0.5) / s;                  // power-off vertical collapse
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 buv = uv + cc * r2 * 0.07;                 // barrel
  float ab = 0.0010 + uVel * 0.0040 + uFlash * 0.003;
  vec3 col;
  col.r = texture2D(uTex, buv + cc * ab).r;       // chromatic aberration
  col.g = texture2D(uTex, buv).g;
  col.b = texture2D(uTex, buv - cc * ab).b;
  vec2 inb = step(vec2(0.0), buv) * step(buv, vec2(1.0));
  col *= inb.x * inb.y;
  col = finishCRT(col, vUv, buv, r2);
  col = applyPhase(col, vUv);
  gl_FragColor = vec4(col, 1.0);
}`;

// single-pass fallback: dither + light CRT, no persistence, no aberration
const COMBO_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform vec2  uRes;
uniform float uTime;
${HASH}${BAYER}${GRADE}${FINISH}
void main() {
  vec2 uv = vUv;
  float s = max(1.0 - uOff * 0.996, 0.004);
  uv.y = 0.5 + (uv.y - 0.5) / s;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 buv = uv + cc * r2 * 0.07;
  vec4 scn = texture2D(uScene, buv);
  vec2 inb = step(vec2(0.0), buv) * step(buv, vec2(1.0));
  scn *= inb.x * inb.y;
  vec3 col = grade(scn, vUv * uRes);
  col = finishCRT(col, vUv, buv, r2);
  col = applyPhase(col, vUv);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  constructor(renderer, state) {
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.state = state;
    this.lowMode = false;
    this.geometry = new Triangle(this.gl);

    this.compUniforms = {
      uScene: { value: null }, uPrev: { value: null },
      uRes: { value: [1, 1] }, uTime: { value: 0 },
      uPersist: { value: 0 },
      uTune: { value: [-9999, -9999] }, uRadius: { value: 400 },
      uOverdrive: { value: 0 }, uDpr: { value: 1 },
    };
    this.compMesh = new Mesh(this.gl, {
      geometry: this.geometry,
      program: new Program(this.gl, {
        vertex: VERT, fragment: COMPOSITE_FRAG, uniforms: this.compUniforms,
        depthTest: false, depthWrite: false,
      }),
    });

    this.finalUniforms = {
      uTex: { value: null }, uRes: { value: [1, 1] }, uTime: { value: 0 },
      uVel: { value: 0 }, uIntro: { value: 0 }, uOff: { value: 0 }, uFlash: { value: 0 },
    };
    this.finalMesh = new Mesh(this.gl, {
      geometry: this.geometry,
      program: new Program(this.gl, {
        vertex: VERT, fragment: FINAL_FRAG, uniforms: this.finalUniforms,
        depthTest: false, depthWrite: false,
      }),
    });

    this.comboMesh = null; // compiled only if weak-GPU mode engages
    this.resize();
  }

  resize() {
    const gl = this.gl;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const opts = { width: w, height: h, depth: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR };
    this.sceneRT = new RenderTarget(gl, opts);
    this.histA = new RenderTarget(gl, opts);
    this.histB = new RenderTarget(gl, opts);
    this.bufSize = [w, h];
    this.histPrimed = false;
  }

  get sceneTarget() { return this.sceneRT; }

  setLowMode() {
    if (this.lowMode) return;
    this.lowMode = true;
    this.comboUniforms = {
      uScene: { value: null }, uRes: { value: [1, 1] }, uTime: { value: 0 },
      uTune: { value: [-9999, -9999] }, uRadius: { value: 400 },
      uOverdrive: { value: 0 }, uDpr: { value: 1 },
      uVel: { value: 0 }, uIntro: { value: 0 }, uOff: { value: 0 }, uFlash: { value: 0 },
    };
    this.comboMesh = new Mesh(this.gl, {
      geometry: this.geometry,
      program: new Program(this.gl, {
        vertex: VERT, fragment: COMBO_FRAG, uniforms: this.comboUniforms,
        depthTest: false, depthWrite: false,
      }),
    });
  }

  render() {
    const s = this.state;
    const dpr = this.renderer.dpr;
    const tune = [s.tuneCenter.x * dpr, this.bufSize[1] - s.tuneCenter.y * dpr];
    const radius = s.tuneRadius * dpr;

    if (!this.lowMode) {
      const cu = this.compUniforms;
      cu.uScene.value = this.sceneRT.texture;
      cu.uPrev.value = this.histB.texture;
      cu.uRes.value = this.bufSize;
      cu.uTime.value = s.time;
      cu.uPersist.value = this.histPrimed ? s.persist : 0;
      cu.uTune.value = tune;
      cu.uRadius.value = radius;
      cu.uOverdrive.value = s.overdrive;
      cu.uDpr.value = dpr;
      this.renderer.render({ scene: this.compMesh, target: this.histA, clear: true, frustumCull: false, sort: false });
      this.histPrimed = true;

      const fu = this.finalUniforms;
      fu.uTex.value = this.histA.texture;
      fu.uRes.value = this.bufSize;
      fu.uTime.value = s.time;
      fu.uVel.value = s.velNorm;
      fu.uIntro.value = s.intro;
      fu.uOff.value = s.powerOff;
      fu.uFlash.value = s.flash;
      this.renderer.render({ scene: this.finalMesh, frustumCull: false, sort: false });

      const t = this.histA; this.histA = this.histB; this.histB = t;
    } else {
      const u = this.comboUniforms;
      u.uScene.value = this.sceneRT.texture;
      u.uRes.value = this.bufSize;
      u.uTime.value = s.time;
      u.uTune.value = tune;
      u.uRadius.value = radius;
      u.uOverdrive.value = s.overdrive;
      u.uDpr.value = dpr;
      u.uVel.value = s.velNorm;
      u.uIntro.value = s.intro;
      u.uOff.value = s.powerOff;
      u.uFlash.value = s.flash;
      this.renderer.render({ scene: this.comboMesh, frustumCull: false, sort: false });
    }
  }
}
