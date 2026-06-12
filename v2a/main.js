// main.js — scene bootstrap, input, intro choreography, game loop, HUD wiring
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Park } from './park.js';
import { Pug } from './pug.js';
import { FX } from './fx.js';

if (!window.FLAT_MODE) boot();

function boot() {
  /* ---------------- quality heuristics ---------------- */
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const quality = {
    bloom: !coarse,
    dprCap: coarse ? 1 : 1.5,
    particleMul: coarse ? 0.5 : 1,
  };

  /* ---------------- renderer (with WebGL fallback) ---------------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('scene'),
      antialias: !coarse,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    window.enterFlatMode('webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.dprCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a16);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 320);
  camera.position.set(16, 24, 56);
  camera.lookAt(0, 2, 0);

  let composer = null, bloomPass = null;
  function buildComposer() {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.65, 0.82);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }
  if (quality.bloom) buildComposer();

  /* ---------------- world ---------------- */
  const fx = new FX(scene, quality);
  const park = new Park(scene, window.GAMES, quality);
  const pug = new Pug(scene);
  pug.frozen = true; // until intro hands over control

  /* ---------------- DOM refs ---------------- */
  const $ = (id) => document.getElementById(id);
  const hud = $('hud'), prompt = $('prompt'), hints = $('hints'), floathint = $('floathint');
  const gametitle = $('gametitle'), gtname = $('gtname'), gttag = $('gttag');
  const overlay = $('overlay'), joyEl = $('joy'), joyKnob = $('joyknob');
  const boneCountEl = $('bonecount'), skipnote = $('skipnote');
  if (coarse) hints.style.display = 'none';

  /* ---------------- persistent state ---------------- */
  let collected = new Set();
  try { collected = new Set(JSON.parse(localStorage.getItem('v2a-bones') || '[]')); } catch (e) {}
  collected.forEach((i) => park.hideBone(i));
  let boneCount = [...collected].filter((i) => i >= 0 && i < 25).length;
  boneCountEl.textContent = boneCount;

  const soundbtn = $('soundbtn');
  const syncSoundBtn = () => { soundbtn.textContent = fx.muted ? '♪ OFF' : '♪ ON'; };
  syncSoundBtn();

  /* ---------------- input state ---------------- */
  const keys = new Set();
  const input = { move: new THREE.Vector2(), sprint: false, jump: false, anyInput: false };
  let menuOpen = false;
  let state = 'intro'; // intro | play | launching
  let hotCab = null;
  let dwell = 0;
  let movedOnce = false;
  let lastRightTap = 0;
  const joy = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };

  function firstGesture() { fx.initAudio(); }

  window.addEventListener('keydown', (e) => {
    firstGesture();
    if (e.key === 'Escape' && menuOpen) { toggleMenu(false); return; }
    if (menuOpen) return;
    skipIntro();
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    keys.add(k);
    if (k === ' ' && !e.repeat) input.jump = true;
    if (k === 'b' && !e.repeat) doBark();
    if ((k === 'e' || k === 'enter') && !e.repeat) doInteract();
    if (k === 'm' && !e.repeat) toggleMenu(true);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  /* ---------------- touch: joystick (left) + jump/bark taps (right) ---------------- */
  const canvas = renderer.domElement;
  canvas.addEventListener('touchstart', (e) => {
    firstGesture();
    skipIntro();
    if (state === 'launching') { fx.skipLaunch(); return; }
    if (menuOpen || state !== 'play') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.55 && !joy.active) {
        joy.active = true; joy.id = t.identifier;
        joy.cx = t.clientX; joy.cy = t.clientY; joy.dx = 0; joy.dy = 0;
        joyEl.style.display = 'block';
        joyEl.style.left = joy.cx + 'px';
        joyEl.style.top = joy.cy + 'px';
      } else {
        const now = performance.now();
        if (now - lastRightTap < 320) doBark();
        else input.jump = true;
        lastRightTap = now;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!joy.active) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joy.id) continue;
      const R = 46;
      let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      joy.dx = dx / R; joy.dy = dy / R;
      joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (joy.active && t.identifier === joy.id) {
        joy.active = false; joy.id = -1; joy.dx = 0; joy.dy = 0;
        joyEl.style.display = 'none';
        joyKnob.style.transform = 'translate(-50%,-50%)';
      }
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
  window.addEventListener('pointerdown', () => { firstGesture(); skipIntro(); });

  /* ---------------- HUD buttons ---------------- */
  function toggleMenu(open) {
    menuOpen = open;
    overlay.hidden = !open;
    keys.clear();
  }
  $('menubtn').addEventListener('click', () => { firstGesture(); toggleMenu(true); });
  $('closemenu').addEventListener('click', () => toggleMenu(false));
  soundbtn.addEventListener('click', () => {
    firstGesture();
    fx.setMuted(!fx.muted);
    syncSoundBtn();
  });
  prompt.addEventListener('click', (e) => {
    e.stopPropagation();
    firstGesture();
    if (state === 'launching') fx.skipLaunch();
    else doInteract();
  });
  prompt.textContent = coarse ? 'TAP TO PLAY ▶' : 'E PLAY ▶';

  /* ---------------- actions ---------------- */
  function doBark() {
    if (state !== 'play' || menuOpen) return;
    if (!pug.bark()) return;
    fx.sfxBark();
    fx.barkRing(pug.group.position);
    park.onBark(pug.group.position);
  }

  function doInteract() {
    if (state === 'launching') { fx.skipLaunch(); return; }
    if (state !== 'play' || menuOpen || !hotCab) return;
    launch(hotCab);
  }

  function launch(cab) {
    state = 'launching';
    pug.frozen = true;
    prompt.hidden = true;
    gametitle.style.opacity = 0;
    fx.launchGame({ camera, pug, cab, url: cab.game.url });
  }

  /* ---------------- bones ---------------- */
  function collectBones() {
    const p = pug.group.position;
    for (let i = 0; i < park.bones.length; i++) {
      const b = park.bones[i];
      if (b.collected) continue;
      const d2 = (p.x - b.x) ** 2 + (p.z - b.z) ** 2;
      if (d2 < 1.0 && p.y < 1.5) {
        park.hideBone(i);
        collected.add(i);
        try { localStorage.setItem('v2a-bones', JSON.stringify([...collected])); } catch (e) {}
        boneCount++;
        boneCountEl.textContent = boneCount;
        fx.sparkle(b.mesh.position, '#ffd86b', 16);
        fx.sfxChime();
        gsap.fromTo('#bones', { scale: 1.35 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' });
        if (boneCount >= 25) fx.fireworksShow();
      }
    }
  }

  /* ---------------- intro choreography ---------------- */
  const introHintText = coarse
    ? 'drag left side to run • tap right to jump'
    : 'WASD to run • walk up to a cabinet!';
  floathint.textContent = introHintText;
  let floathintUntil = 0;
  let introTl = null;

  function startIntro() {
    skipnote.style.opacity = 1;
    skipnote.textContent = coarse ? 'tap to skip' : 'press any key to skip';
    const camFrom = new THREE.Vector3(18, 26, 54);
    const camTo = new THREE.Vector3(0, 5.4, 38.6);
    const lookFrom = new THREE.Vector3(0, 3, -6);
    const lookTo = new THREE.Vector3(0, 1.2, 30);
    camera.position.copy(camFrom);
    camera.lookAt(lookFrom);
    const u = { t: 0 };
    introTl = gsap.timeline({ onComplete: finishIntro });
    introTl.to(u, {
      t: 1, duration: 3.4, ease: 'power2.inOut',
      onUpdate: () => {
        camera.position.lerpVectors(camFrom, camTo, u.t);
        const look = new THREE.Vector3().lerpVectors(lookFrom, lookTo, u.t);
        camera.lookAt(look);
        const lit = park.setArchProgress(Math.min(1, u.t * 1.45));
        if (lit) fx.sfxBuzz();
      },
    });
  }

  function skipIntro() {
    if (state === 'intro' && introTl) introTl.progress(1);
  }

  function finishIntro() {
    if (state !== 'intro') return;
    state = 'play';
    pug.frozen = false;
    park.setArchProgress(1);
    hud.classList.add('on');
    skipnote.style.opacity = 0;
    floathintUntil = clockTime + 5;
    gsap.to(floathint, { opacity: 1, duration: 0.4 });
  }

  /* ---------------- camera follow ---------------- */
  const camOffset = new THREE.Vector3(0, 5.4, 8.6);
  const camTargetV = new THREE.Vector3();
  const lookV = new THREE.Vector3();
  const projV = new THREE.Vector3();

  function updateCamera(dt) {
    const p = pug.group.position;
    camTargetV.set(
      p.x + camOffset.x + pug.vel.x * 0.28,
      p.y * 0.4 + camOffset.y,
      p.z + camOffset.z + pug.vel.z * 0.28
    );
    const k = 1 - Math.exp(-5 * dt);
    camera.position.lerp(camTargetV, k);
    lookV.set(p.x + pug.vel.x * 0.22, p.y + 0.9, p.z + pug.vel.z * 0.22);
    camera.lookAt(lookV);
    // sprint FOV swell
    const speed = Math.hypot(pug.vel.x, pug.vel.z);
    const fovTarget = (input.sprint && speed > 6.5) ? 70 : 62;
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
    // landing shake
    if (fx.shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * fx.shake * 0.12;
      camera.position.y += (Math.random() - 0.5) * fx.shake * 0.12;
    }
  }

  /* ---------------- proximity / hot cabinets ---------------- */
  function updateProximity(dt) {
    const p = pug.group.position;
    let best = null, bestD = 4.2;
    for (const cab of park.cabinets) {
      const d = Math.hypot(p.x - cab.pos.x, p.z - cab.pos.z);
      if (d < bestD) { bestD = d; best = cab; }
    }
    if (best !== hotCab) {
      if (hotCab) park.setHot(hotCab, false);
      hotCab = best;
      if (hotCab) {
        park.setHot(hotCab, true);
        gtname.textContent = hotCab.game.name;
        gttag.textContent = hotCab.game.tag;
        gttag.style.background = window.TAG_COLORS[hotCab.game.tag] || '#22e6e6';
        gametitle.style.opacity = 1;
        dwell = 0;
      } else {
        gametitle.style.opacity = 0;
      }
      fx.setHum(!!hotCab);
      prompt.hidden = !hotCab;
    }
    pug.excitement += (((hotCab ? 1 - bestD / 4.2 : 0)) - pug.excitement) * Math.min(1, dt * 6);

    if (hotCab) {
      // float the prompt above the cabinet screen
      projV.copy(hotCab.screenWorld);
      projV.y += 1.25;
      projV.project(camera);
      if (projV.z < 1) {
        prompt.hidden = false;
        prompt.style.left = ((projV.x * 0.5 + 0.5) * window.innerWidth) + 'px';
        prompt.style.top = ((-projV.y * 0.5 + 0.5) * window.innerHeight) + 'px';
      } else {
        prompt.hidden = true;
      }
      // forgiving path: keep pushing into the cabinet for 0.5s -> launch
      const toCabX = hotCab.pos.x - p.x, toCabZ = hotCab.pos.z - p.z;
      const d = Math.hypot(toCabX, toCabZ);
      const pushing = d < 2.25 && input.move.length() > 0.35 &&
        (input.move.x * toCabX / d + input.move.y * toCabZ / d) > 0.4;
      dwell = pushing ? dwell + dt : 0;
      if (dwell > 0.5) { dwell = -99; launch(hotCab); }
    }
  }

  /* ---------------- pug event handlers ---------------- */
  const pugEvents = {
    onStep: (speed) => {
      fx.dust(pug.group.position, speed > 7 ? 3 : 2);
      fx.sfxStep();
    },
    onJump: () => fx.sfxHop(),
    onLand: (power) => {
      fx.dust(pug.group.position, 5 + Math.round(power * 8));
      fx.sfxThud(0.4 + power);
      if (power > 0.25) fx.addShake(0.4 + power * 0.8);
    },
    onDust: (pos, n) => fx.dust(pos, n, true),
  };

  /* ---------------- resize ---------------- */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------------- FPS sampling -> degrade gracefully ---------------- */
  let frame = 0, fpsAccum = 0, fpsChecked = false;

  /* ---------------- main loop ---------------- */
  const clock = new THREE.Clock();
  let clockTime = 0;
  const headV = new THREE.Vector3();

  function readInput() {
    input.move.set(0, 0);
    if (state === 'play' && !menuOpen) {
      if (keys.has('w') || keys.has('arrowup')) input.move.y -= 1;
      if (keys.has('s') || keys.has('arrowdown')) input.move.y += 1;
      if (keys.has('a') || keys.has('arrowleft')) input.move.x -= 1;
      if (keys.has('d') || keys.has('arrowright')) input.move.x += 1;
      if (input.move.lengthSq() > 1) input.move.normalize();
      if (joy.active) input.move.set(joy.dx, joy.dy);
      input.sprint = keys.has('shift') || (joy.active && Math.hypot(joy.dx, joy.dy) > 0.92);
      input.anyInput = keys.size > 0 || joy.active || input.jump;
    } else {
      input.sprint = false;
      input.anyInput = false;
      input.jump = false;
    }
    if (!movedOnce && input.move.lengthSq() > 0.01) {
      movedOnce = true;
      gsap.to(hints, { opacity: 0, duration: 1, delay: 1.2 });
    }
  }

  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    clockTime += dt;
    const t = clockTime;

    readInput();
    pug.update(dt, t, input, park.colliders, pugEvents);
    input.jump = false;

    if (state === 'play') {
      updateCamera(dt);
      updateProximity(dt);
      collectBones();
      if (pug.wantsZzz) fx.spawnZzz(pug.headWorld(headV));
    }

    // intro floating hint above the pug's head
    if (state === 'play' && t < floathintUntil) {
      pug.headWorld(headV);
      headV.y += 0.9;
      headV.project(camera);
      floathint.style.left = ((headV.x * 0.5 + 0.5) * window.innerWidth) + 'px';
      floathint.style.top = ((-headV.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    } else if (floathintUntil > 0 && t >= floathintUntil) {
      floathintUntil = 0;
      gsap.to(floathint, { opacity: 0, duration: 0.6 });
    }

    park.update(dt, t, pug.group.position);
    fx.update(dt);

    if (quality.bloom && composer) composer.render();
    else renderer.render(scene, camera);

    // sample fps on frames 60..180, downgrade once if weak
    if (!fpsChecked) {
      frame++;
      if (frame > 60 && frame <= 180) fpsAccum += dt;
      if (frame === 180) {
        fpsChecked = true;
        const avgFps = 120 / fpsAccum;
        if (avgFps < 42) {
          quality.bloom = false;
          quality.particleMul *= 0.5;
          renderer.setPixelRatio(1);
          renderer.setSize(window.innerWidth, window.innerHeight);
        }
      }
    }
  }

  renderer.setAnimationLoop(tick);

  // lazy-load the 14 screenshots after the first frames are up
  setTimeout(() => park.loadScreens(), 150);

  startIntro();
}
