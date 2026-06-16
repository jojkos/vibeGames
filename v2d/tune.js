// ============================================================================
// tune.js — the conductor. Owns shared state, the signal field (cursor /
// center proximity → per-instance tune level), caption glitch-resolve, the
// CRT power-on intro, the over-tune launch sequence, easter eggs, HUD, and
// the render loop with weak-GPU sampling.
// ============================================================================

import { Renderer } from 'ogl';
import { Wall, GAMES, freqOf } from './wall.js';
import { Post } from './post.js';
import { RadioAudio } from './audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const posMod = (v, m) => ((v % m) + m) % m;

const REST_FLOOR = 0.18;   // every loaded tile keeps this much signal — legible at rest

export function start() {
  gsap.registerPlugin(Draggable, InertiaPlugin);

  const isTouch = matchMedia('(pointer: coarse)').matches;
  const canvas = document.getElementById('stage');

  const state = {
    w: innerWidth, h: innerHeight,
    cam: { x: 0, y: 0 },
    velNorm: 0, persist: 0,
    cursor: { x: innerWidth / 2, y: innerHeight / 2 },
    tuneCenter: { x: innerWidth / 2, y: innerHeight / 2 },
    tuneRadius: Math.min(innerWidth, innerHeight) * 0.6,
    zoom: 1, zoomCenter: { x: innerWidth / 2, y: innerHeight / 2 },
    time: 0,
    intro: 0, powerOff: 0, overdrive: 0, flash: 0, ascii: 0,
    dragging: false, launching: null,
    isTouch,
    focus: { ti: -1, sig: 0 },
  };

  const renderer = new Renderer({
    canvas,
    dpr: Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2),
    alpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(state.w, state.h);

  const audio = new RadioAudio();
  const wall = new Wall(renderer, state, { onTap, onPress });
  const post = new Post(renderer, state);

  // ---- HUD ------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const freqEl = $('freq'), sigEl = $('sig'), teachEl = $('teach');
  const overlay = $('indexOverlay');
  const sndBtn = $('sndBtn');

  sndBtn.textContent = 'SND ON';
  sndBtn.addEventListener('click', () => {
    audio.ensure();
    sndBtn.textContent = audio.toggle() ? 'SND ON' : 'SND OFF';
  });
  $('indexBtn').addEventListener('click', () => overlay.classList.add('open'));
  $('closeIndex').addEventListener('click', () => overlay.classList.remove('open'));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.classList.remove('open'); });

  if (isTouch) teachEl.textContent = 'FLICK TO SCAN · CENTER TUNES · TAP TO PLAY';

  // first gesture wakes the radio (never before — autoplay-safe)
  const wake = () => { audio.ensure(); };
  addEventListener('pointerdown', wake, { once: true });
  addEventListener('keydown', wake, { once: true });

  // ---- cursor / tune center ---------------------------------------------------

  addEventListener('pointermove', (e) => {
    state.cursor.x = e.clientX;
    state.cursor.y = e.clientY;
  }, { passive: true });

  // ---- signal field -----------------------------------------------------------

  const sigMap = new Map();           // instance key → eased signal
  const autoTune = { key: null, ti: -1, amount: 0 };

  function setAutoTune(inst, hold = 1.4) {
    autoTune.key = inst.key;
    autoTune.ti = inst.ti;
    gsap.killTweensOf(autoTune);
    gsap.timeline()
      .to(autoTune, { amount: 1, duration: 0.7, ease: 'power2.out' })
      .to(autoTune, { amount: 0, duration: 0.8, ease: 'power2.inOut' }, 0.7 + hold);
  }

  function tuneSignals(dt) {
    const m = wall.m;
    const tc = state.tuneCenter;
    tc.x = isTouch ? state.w / 2 : state.cursor.x;
    tc.y = isTouch ? state.h / 2 : state.cursor.y;
    state.tuneRadius = m.TW * 2.0;

    const R0 = m.TW * 0.30, R1 = m.TW * 1.25; // tight falloff — tune one tile at a time
    const k = 1 - Math.exp(-dt * 9);          // ≈130ms time constant — reads fast
    const seen = new Set();
    let best = null, bestSig = 0;
    const tileMax = new Float32Array(GAMES.length);

    for (const inst of wall.instances) {
      const d = Math.hypot(inst.cx - tc.x, inst.cy - tc.y);
      let target = 1 - smoothstep(R0, R1, d);
      let v = (sigMap.get(inst.key) || 0) + (target - (sigMap.get(inst.key) || 0)) * k;
      sigMap.set(inst.key, v);
      seen.add(inst.key);
      if (autoTune.amount > 0.001 && inst.key === autoTune.key) v = Math.max(v, autoTune.amount);
      if (v > bestSig) { bestSig = v; best = inst; }
      if (v > tileMax[inst.ti]) tileMax[inst.ti] = v;
      inst.signal = Math.max(v, REST_FLOOR);    // floored for render; best/captions use the true value
    }
    // drop eased values for instances that scrolled away
    if (sigMap.size > seen.size * 3) {
      for (const key of sigMap.keys()) if (!seen.has(key)) sigMap.delete(key);
    }

    state.focus.ti = best ? best.ti : -1;
    state.focus.sig = bestSig;

    // caption glitch-resolve: scrambled → clean as signal rises
    const visited = new Set();
    for (const inst of wall.instances) {
      if (visited.has(inst.ti)) continue;
      visited.add(inst.ti);
      wall.setCaptionScramble(inst.ti, 1 - tileMax[inst.ti]);
    }
  }

  // ---- intro (CRT power-on, ~2.5s, skippable) ----------------------------------

  let introDone = false, taught = false;
  gsap.to(state, { intro: 1, duration: 2.1, ease: 'power2.inOut', delay: 0.3 });
  const skipIntro = () => {
    if (state.intro < 1) gsap.to(state, { intro: 1, duration: 0.25, ease: 'power1.out', overwrite: true });
  };
  addEventListener('pointerdown', skipIntro);
  addEventListener('keydown', skipIntro);

  function teach() {
    taught = true;
    // auto-tune the tile nearest screen center once, as a teach
    let best = null, bd = 1e9;
    for (const inst of wall.instances) {
      const d = Math.hypot(inst.cx - state.w / 2, inst.cy - state.h / 2);
      if (d < bd) { bd = d; best = inst; }
    }
    if (best) setAutoTune(best, 1.6);
    teachEl.classList.add('show');
  }
  function onPress() {
    if (teachEl.classList.contains('show')) teachEl.classList.remove('show');
    if (!state.launching && autoTune.amount > 0) {
      gsap.killTweensOf(autoTune);
      gsap.to(autoTune, { amount: 0, duration: 0.4, overwrite: true });
    }
  }

  // ---- launch (over-tune → power-off → navigate) --------------------------------

  function onTap(e) {
    const x = e.clientX ?? e.changedTouches?.[0]?.clientX;
    const y = e.clientY ?? e.changedTouches?.[0]?.clientY;
    if (x == null) return;
    if (state.launching) { navigate(state.launching); return; }   // skip on 2nd click
    const inst = wall.hitTest(x, y);
    if (!inst) return;
    const sig = sigMap.get(inst.key) || 0;
    if (Math.max(sig, inst.signal) > 0.6) launch(inst);
    else wall.glideToInstance(inst, 0.8);                          // glide untuned → center
  }

  function navigate(game) { window.location.href = game.url; }

  function launch(inst) {
    const game = GAMES[inst.ti];
    state.launching = game;
    wall.setDragEnabled(false);
    audio.launch();

    // pin the tile fully tuned and center it, then over-tune
    autoTune.key = inst.key; autoTune.ti = inst.ti;
    gsap.killTweensOf(autoTune);
    gsap.to(autoTune, { amount: 1, duration: 0.25, overwrite: true });

    const depth = wall.tiles[inst.ti].depth;
    state.zoomCenter = { x: state.w / 2, y: state.h / 2 };
    const Z = Math.max(state.w / wall.m.TW, state.h / wall.m.TH) * 1.02;

    gsap.timeline()
      .to(state.cam, {
        x: state.cam.x - (state.w / 2 - inst.cx) / depth,
        y: state.cam.y - (state.h / 2 - inst.cy) / depth,
        duration: 0.45, ease: 'power2.inOut',
      }, 0)
      .to(state, { zoom: Z, duration: 0.85, ease: 'power3.in' }, 0.08)
      .to(state, { overdrive: 1, duration: 0.55, ease: 'power2.in' }, 0.2)
      .to(state, { flash: 1, duration: 0.05, ease: 'none' }, 0.74)
      .to(state, { flash: 0, duration: 0.07, ease: 'none' }, 0.81)
      .to(state, { powerOff: 1, duration: 0.28, ease: 'power2.in' }, 0.8)
      .call(() => navigate(game), null, 1.12);
  }

  // ---- easter eggs ---------------------------------------------------------------

  const KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
  let keys = [];
  let asciiBusy = false;

  function asciiCollapse() {
    if (asciiBusy) return;
    asciiBusy = true;
    gsap.timeline({ onComplete: () => { asciiBusy = false; } })
      .to(state, { ascii: 1, duration: 0.35, ease: 'power2.in' })
      .to(state, { ascii: 0, duration: 0.6, ease: 'power2.out' }, 4.4);
  }

  addEventListener('keydown', (e) => {
    keys.push(e.key.toLowerCase());
    if (keys.length > 12) keys.shift();
    const tail = keys.join(' ');
    if (tail.endsWith(KONAMI.join(' '))) { keys = []; asciiCollapse(); return; }
    const letters = keys.filter(k => k.length === 1).join('');
    if (letters.endsWith('static')) { keys = []; asciiCollapse(); }
    else if (letters.endsWith('pug')) {
      keys = [];
      const inst = wall.nearestInstanceOf(3);   // Pug Fiesta
      wall.glideToInstance(inst, 1.0, () => {
        // after the glide the wrapped copy is on screen — retune by fresh key
        wall.update();
        let target = null, bd = 1e9;
        for (const c of wall.instances) {
          if (c.ti !== 3) continue;
          const d = Math.hypot(c.cx - state.w / 2, c.cy - state.h / 2);
          if (d < bd) { bd = d; target = c; }
        }
        if (target) setAutoTune(target, 2.2);
      });
    }
  });

  // ---- HUD updates ------------------------------------------------------------------

  let hudT = 0;
  function updateHud(now) {
    if (now - hudT < 120) return;
    hudT = now;
    const f = 87.5 + posMod(state.cam.x * 0.011, 20.5);
    const ch = Math.floor(posMod(state.cam.y * 0.013, 99));
    freqEl.textContent = `${f.toFixed(1).padStart(5, '0')} FM · CH ${String(ch).padStart(2, '0')}`;
    const bars = Math.round(clamp(state.focus.sig, 0, 1) * 5);
    sigEl.textContent = 'SIG ' + '▮'.repeat(bars) + '▯'.repeat(5 - bars);
  }

  // ---- resize ------------------------------------------------------------------------

  function resize() {
    state.w = innerWidth; state.h = innerHeight;
    state.zoomCenter = { x: state.w / 2, y: state.h / 2 };
    renderer.setSize(state.w, state.h);
    wall.resize();
    post.resize();
  }
  addEventListener('resize', resize);

  // ---- main loop -----------------------------------------------------------------------

  let last = performance.now();
  const prevCam = { x: 0, y: 0 };
  let frames = 0, fpsAcc = 0, fpsChecked = false;
  let texKicked = false;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0.0001, 0.05);
    last = now;
    state.time += dt;

    // drag velocity → persistence + aberration + audio
    const vps = Math.hypot(state.cam.x - prevCam.x, state.cam.y - prevCam.y) / dt;
    prevCam.x = state.cam.x; prevCam.y = state.cam.y;
    const vTarget = clamp(vps / 2600, 0, 1);
    state.velNorm += (vTarget - state.velNorm) * Math.min(1, dt * 10);
    const pTarget = Math.min(0.85, state.velNorm * 0.95);
    state.persist += (pTarget - state.persist) * (pTarget > state.persist ? 0.4 : Math.min(1, dt * 7));

    wall.update();
    tuneSignals(dt);
    wall.render(post.sceneTarget);
    post.render();

    audio.update(state.velNorm + state.ascii * 0.7, state.focus.ti, state.focus.sig);
    updateHud(now);

    if (!introDone && state.intro >= 1) { introDone = true; if (!taught) teach(); }

    if (!texKicked) { texKicked = true; setTimeout(() => wall.loadTextures(), 30); } // lazy, after first paint

    // weak-GPU detection: sample 100 frames once running
    if (!fpsChecked && introDone) {
      frames++; fpsAcc += dt;
      if (frames >= 100) {
        fpsChecked = true;
        const fps = frames / fpsAcc;
        if (fps < 45) {
          post.setLowMode();                          // drop persistence + aberration
          renderer.dpr = Math.min(renderer.dpr, 1);   // and cap DPR
          resize();
        }
      }
    }
  }
  requestAnimationFrame(frame);
}
