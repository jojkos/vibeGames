// ============================================================================
// tune.js — the conductor for the RECEIVER. Owns the dial frequency, drives the
// per-station signal, the DOM dial (readout / VU / ruler / seek), lock detection,
// the CRT power-on intro, the over-tune launch, easter eggs, and the render loop.
// ============================================================================

import { Renderer } from 'ogl';
import { Wall, GAMES, stationFreq, FREQ_MIN } from './wall.js';
import { Post } from './post.js';
import { RadioAudio } from './audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DS = 80;            // dial ruler px per MHz (display only)
const LOCK_AT = 0.9;      // signal at which a station counts as "locked"

export function start() {
  gsap.registerPlugin(Draggable, InertiaPlugin);

  const isTouch = matchMedia('(pointer: coarse)').matches;

  const state = {
    w: innerWidth, h: innerHeight,
    freq: FREQ_MIN - 0.3,                 // start just below the band, in static
    cam: { x: 0, y: 0 },
    velNorm: 0, persist: 0,
    zoom: 1, zoomCenter: { x: innerWidth / 2, y: innerHeight / 2 },
    // kept only so post.js's (now-unused) tune-field uniforms don't read undefined
    tuneCenter: { x: innerWidth / 2, y: innerHeight / 2 }, tuneRadius: 400,
    time: 0,
    intro: 0, powerOff: 0, overdrive: 0, flash: 0, ascii: 0,
    dragging: false, seeking: false, launching: null,
    isTouch,
    focus: { ti: -1, sig: 0 },
  };

  const renderer = new Renderer({
    canvas: document.getElementById('stage'),
    dpr: Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2),
    alpha: false, antialias: false, powerPreference: 'high-performance',
  });
  renderer.setSize(state.w, state.h);

  const audio = new RadioAudio();
  const wall = new Wall(renderer, state, { onTap, onPress, onSeek });
  const post = new Post(renderer, state);

  // ---- HUD --------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const freqEl = $('freq'), sigEl = $('sig'), stationEl = $('station'), teachEl = $('teach');
  const ruler = $('ruler'), track = $('rulerTrack');
  const overlay = $('indexOverlay'), sndBtn = $('sndBtn');
  let pipEls = [];
  let interacted = false;

  function buildDial() {
    track.innerHTML = '';
    for (let f = 88; f <= 105.0001; f += 0.5) {
      const major = Math.abs(f - Math.round(f)) < 0.01;
      const tk = document.createElement('div');
      tk.className = 'tick' + (major ? ' major' : '');
      tk.style.left = ((f - 88) * DS) + 'px';
      if (major) { const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = String(Math.round(f)); tk.appendChild(lab); }
      track.appendChild(tk);
    }
    pipEls = GAMES.map((g, i) => {
      const pip = document.createElement('div');
      pip.className = 'pip';
      pip.style.left = ((stationFreq(i) - 88) * DS - 1) + 'px';
      pip.title = g.name;
      track.appendChild(pip);
      return pip;
    });
  }
  buildDial();

  sndBtn.addEventListener('click', () => { audio.ensure(); sndBtn.textContent = audio.toggle() ? 'SND ON' : 'SND OFF'; });
  $('indexBtn').addEventListener('click', () => overlay.classList.add('open'));
  $('closeIndex').addEventListener('click', () => overlay.classList.remove('open'));
  $('seekPrev').addEventListener('click', () => { audio.ensure(); dismissTeach(); wall.seek(-1); });
  $('seekNext').addEventListener('click', () => { audio.ensure(); dismissTeach(); wall.seek(1); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.classList.remove('open');
    else if (e.key === 'ArrowRight') { dismissTeach(); wall.seek(1); }
    else if (e.key === 'ArrowLeft') { dismissTeach(); wall.seek(-1); }
  });

  if (isTouch) teachEl.textContent = 'DRAG TO TUNE · ◂◂ ▸▸ SEEK · TAP TO PLAY';

  function dismissTeach() { if (!interacted) { interacted = true; teachEl.style.opacity = '0'; } }

  // first gesture wakes the radio (autoplay-safe)
  const wake = () => audio.ensure();
  addEventListener('pointerdown', wake, { once: true });
  addEventListener('keydown', wake, { once: true });

  // ---- signal / focus / lock --------------------------------------------------

  let lockedTi = -1;
  function updateFocus() {
    let best = null, bestSig = 0;
    for (const inst of wall.instances) {
      if (inst.signal > bestSig) { bestSig = inst.signal; best = inst; }
      wall.setCaptionScramble(inst.ti, 1 - inst.signal);
    }
    state.focus.ti = best ? best.ti : -1;
    state.focus.sig = bestSig;

    // lock = soft confirmation blip when a station snaps in
    if (bestSig >= LOCK_AT && lockedTi !== state.focus.ti) {
      lockedTi = state.focus.ti;
      audio.lock();
    } else if (bestSig < 0.6) {
      lockedTi = -1;
    }
  }

  // ---- intro (CRT power-on, ~2.5s) + teach ------------------------------------

  let introDone = false, taught = false;
  gsap.to(state, { intro: 1, duration: 2.1, ease: 'power2.inOut', delay: 0.3 });
  const skipIntro = () => { if (state.intro < 1) gsap.to(state, { intro: 1, duration: 0.25, ease: 'power1.out', overwrite: true }); };
  addEventListener('pointerdown', skipIntro);
  addEventListener('keydown', skipIntro);

  function teach() { taught = true; wall.seek(1); }   // auto-seek onto the first station as a demo
  function onPress() { dismissTeach(); }
  function onSeek(dir) { dismissTeach(); audio.seek(dir); }

  // ---- launch (over-tune → power-off → navigate) ------------------------------

  function onTap() {
    if (state.launching) { navigate(state.launching); return; }
    const tile = state.focus.ti >= 0 ? wall.tiles[state.focus.ti] : null;
    if (!tile) return;
    if (state.focus.sig > 0.6 && tile.game.url) { launch(tile); return; }
    // not locked → settle onto the nearest real station
    const near = wall.nearestStation(state.freq);
    if (near) {
      state.seeking = true; wall.vel = 0;
      gsap.to(state, { freq: near.freq, duration: 0.45, ease: 'power2.out', onComplete: () => { state.seeking = false; } });
    }
  }

  function navigate(game) { if (game && game.url) window.location.href = game.url; }

  function launch(tile) {
    state.launching = tile.game;
    wall.setDragEnabled(false);
    audio.launch();
    state.zoomCenter = { x: state.w / 2, y: state.h / 2 };
    const Z = Math.max(state.w / wall.m.stageW, state.h / wall.m.stageH) * 1.04;
    gsap.killTweensOf(state);
    gsap.to(state, { freq: tile.freq, duration: 0.3, ease: 'power2.out' });
    gsap.timeline()
      .to(state, { zoom: Z, duration: 0.85, ease: 'power3.in' }, 0.1)
      .to(state, { overdrive: 1, duration: 0.55, ease: 'power2.in' }, 0.2)
      .to(state, { flash: 1, duration: 0.05, ease: 'none' }, 0.74)
      .to(state, { flash: 0, duration: 0.07, ease: 'none' }, 0.81)
      .to(state, { powerOff: 1, duration: 0.28, ease: 'power2.in' }, 0.8)
      .call(() => navigate(tile.game), null, 1.12);
  }

  // ---- easter eggs ------------------------------------------------------------

  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let keys = [], asciiBusy = false;
  function asciiCollapse() {
    if (asciiBusy) return; asciiBusy = true;
    gsap.timeline({ onComplete: () => { asciiBusy = false; } })
      .to(state, { ascii: 1, duration: 0.35, ease: 'power2.in' })
      .to(state, { ascii: 0, duration: 0.6, ease: 'power2.out' }, 4.4);
  }
  addEventListener('keydown', (e) => {
    keys.push(e.key.toLowerCase()); if (keys.length > 12) keys.shift();
    if (keys.join(' ').endsWith(KONAMI.join(' '))) { keys = []; asciiCollapse(); return; }
    const letters = keys.filter(k => k.length === 1).join('');
    if (letters.endsWith('static')) { keys = []; asciiCollapse(); }
    else if (letters.endsWith('pug')) {
      keys = []; state.seeking = true; wall.vel = 0;
      gsap.to(state, { freq: stationFreq(3), duration: 0.9, ease: 'power2.inOut', onComplete: () => { state.seeking = false; } });
    }
  });

  // ---- HUD render -------------------------------------------------------------

  let hudT = 0;
  function updateHud(now) {
    track.style.transform = `translateX(${ruler.clientWidth / 2 - (state.freq - 88) * DS}px)`;
    if (now - hudT < 70) return;
    hudT = now;
    freqEl.textContent = state.freq.toFixed(1) + ' FM';
    const sig = clamp(state.focus.sig, 0, 1);
    const bars = Math.round(sig * 5);
    sigEl.textContent = 'SIG ' + '▮'.repeat(bars) + '▯'.repeat(5 - bars);
    const tile = state.focus.ti >= 0 ? wall.tiles[state.focus.ti] : null;
    if (tile && sig > 0.5) {
      stationEl.textContent = tile.game.name.toUpperCase() + ' · ' + tile.game.tag;
      stationEl.classList.toggle('locked', sig > 0.85);
    } else {
      stationEl.textContent = '· · ·'; stationEl.classList.remove('locked');
    }
    for (let i = 0; i < pipEls.length; i++) pipEls[i].classList.toggle('hot', state.focus.ti === i && sig > 0.6);
  }

  // ---- resize -----------------------------------------------------------------

  function resize() {
    state.w = innerWidth; state.h = innerHeight;
    state.zoomCenter = { x: state.w / 2, y: state.h / 2 };
    state.tuneCenter = { x: state.w / 2, y: state.h / 2 };
    renderer.setSize(state.w, state.h);
    wall.resize();
    post.resize();
  }
  addEventListener('resize', resize);

  // ---- main loop --------------------------------------------------------------

  let last = performance.now();
  let prevCamX = 0, frames = 0, fpsAcc = 0, fpsChecked = false, texKicked = false;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0.0001, 0.05);
    last = now;
    state.time += dt;

    wall.physics(dt);
    wall.update();

    // drag/scroll velocity → persistence smear + aberration + audio
    const vps = Math.abs(state.cam.x - prevCamX) / dt;
    prevCamX = state.cam.x;
    const vTarget = clamp(vps / 2600, 0, 1);
    state.velNorm += (vTarget - state.velNorm) * Math.min(1, dt * 10);
    const pTarget = Math.min(0.85, state.velNorm * 0.95);
    state.persist += (pTarget - state.persist) * (pTarget > state.persist ? 0.4 : Math.min(1, dt * 7));

    updateFocus();
    wall.render(post.sceneTarget);
    post.render();

    audio.update(state.velNorm + state.ascii * 0.7, state.focus.ti, state.focus.sig);
    updateHud(now);

    if (!introDone && state.intro >= 1) { introDone = true; if (!taught) teach(); }
    if (!texKicked) { texKicked = true; setTimeout(() => wall.loadTextures(), 30); }

    if (!fpsChecked && introDone) {
      frames++; fpsAcc += dt;
      if (frames >= 100) {
        fpsChecked = true;
        if (frames / fpsAcc < 45) { post.setLowMode(); renderer.dpr = Math.min(renderer.dpr, 1); resize(); }
      }
    }
  }
  requestAnimationFrame(frame);
}
