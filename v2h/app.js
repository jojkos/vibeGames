/* app.js — VOXEL DESCENT. One continuous WebGL scene behind a long scroll:
   a cloud of rounded voxels re-forms into each game's emblem as you scroll
   (scrubbed, staggered, swirling), the arcade kid floats through it on a
   jetpack, a screenshot card flips to the next game at every chapter
   boundary, and the DOM type choreographs on top (GSAP ScrollTrigger).
   Scroll position → one float, `stage`; everything 3D is a pure function of
   it (plus time + pointer), so scrubbing backwards just works. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as SH from './shapes.js';
import { buildKid } from './kid.js';

const GAMES = window.GAMES, TAGS = window.TAG_COLORS;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hash = i => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- copy
const COPY = {
  'samurai sword': 'Online card duels with honour, betrayal and far too many katanas.',
  'zoopaloola': 'A zoo that went feral. Tap fast, laugh faster.',
  'factorio lamp editor': 'Pixel art for your factory floor. Lamps — but make it art.',
  'lol fusion loldle': 'Two champions, one face. Guess who got fused.',
  'pug fiesta': 'Pugs. Party. Pandemonium. The snort is mandatory.',
  'pug fiesta 3d': 'Same pugs, one extra dimension of chaos.',
  'combat arena': 'Step into the ring, bring a friend, settle it.',
  'bluff helper': 'A board tracker for Bluff night. The lying is still on you.',
  'calendar puzzle': 'Fit every piece, leave today’s date showing. A new puzzle every day.',
  'pokemon shooter': 'Gotta shoot ’em all. Respectfully.',
  'tralala clicker': 'Tralalero tralala. Click until it makes sense. It won’t.',
  'lol wheel': 'Can’t pick a champ? Spin it and accept your fate.',
  'neon drifter': 'Sideways is the only way. Neon highway, zero brakes.',
  'guitar tuner': 'Your guitar, but in tune. Finally, a useful one.',
  'ok corral': 'High noon, low ping. Draw, partner.',
  'partyficrim': 'Party games for the whole squad, straight in the browser.',
};
const copyFor = g => COPY[g.name.toLowerCase()] || 'Another one from the pile. Click and find out.';
const pad = n => String(n).padStart(2, '0');

// ---------------------------------------------------------------- DOM build
const chWrap = $('#chapters'), rail = $('#rail'), grid = $('#finGrid');
GAMES.forEach((g, i) => {
  const col = TAGS[g.tag] || '#ffffff';
  const side = i % 2 ? 'r' : 'l';
  const sec = document.createElement('section');
  sec.className = 'ch ch-' + side;
  sec.id = 'g' + (i + 1);
  sec.style.setProperty('--tag', col);
  sec.innerHTML =
    '<div class="ch-in">' +
      '<div class="ch-meta"><span class="ch-n">' + pad(i + 1) + ' / ' + pad(GAMES.length) + '</span><span class="ch-tag"><i></i>' + g.tag + '</span></div>' +
      '<h2 class="ch-name"></h2>' +
      '<p class="ch-copy"></p>' +
      '<a class="ch-play" href="' + g.url + '"><span>Play ' + '</span><b></b><em>→</em></a>' +
    '</div>';
  const h2 = sec.querySelector('.ch-name');
  g.name.split(' ').forEach((word, wi) => {
    const w = document.createElement('span'); w.className = 'w';
    [...word].forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; w.appendChild(c); });
    h2.appendChild(w);
    if (wi < g.name.split(' ').length - 1) h2.appendChild(document.createTextNode(' '));
  });
  sec.querySelector('.ch-copy').textContent = copyFor(g);
  sec.querySelector('.ch-play b').textContent = g.name;
  chWrap.appendChild(sec);

  const dot = document.createElement('button');
  dot.className = 'dot'; dot.type = 'button';
  dot.style.setProperty('--tag', col);
  dot.setAttribute('aria-label', 'Go to ' + g.name);
  dot.innerHTML = '<span>' + g.name + '</span>';
  dot.addEventListener('click', () => goTo(sec));
  rail.appendChild(dot);

  const card = document.createElement('a');
  card.className = 'fcard'; card.href = g.url;
  card.style.setProperty('--tag', col);
  card.innerHTML = '<div class="fshot"><img loading="lazy" alt="" src="' + g.img + '"></div>' +
    '<div class="frow"><span class="fn"></span><span class="ft">' + g.tag + '</span></div>';
  card.querySelector('.fn').textContent = g.name;
  grid.appendChild(card);
});
// split any .split element into word/char spans for the reveals
function split(el){
  const words = el.textContent.trim().split(/\s+/);
  el.textContent = '';
  words.forEach((word, wi) => {
    const w = document.createElement('span'); w.className = 'w';
    [...word].forEach(ch => { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; w.appendChild(c); });
    el.appendChild(w);
    if (wi < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
}
document.querySelectorAll('.split').forEach(split);
{
  const NUM = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen','Twenty'];
  const n = NUM[GAMES.length] || String(GAMES.length);
  const txt = n + ' games. Zero installs. Pick one.';
  $('#maniP').innerHTML = txt.split(' ').map(w => '<span class="mw">' + w + '</span>').join(' ');
}
document.querySelectorAll('.nGames').forEach(e => { e.textContent = GAMES.length; });

// ---------------------------------------------------------------- three setup
const canvas = $('#gl');
const MOBILE = () => innerWidth < 760 || innerHeight > innerWidth * 1.1;
// the composer renders off-screen, so canvas MSAA is wasted: AA lives in the
// multisampled composer target instead. DPR is capped (and drops further if
// frames run long — see the adaptive block in frame()).
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let DPR = Math.min(MOBILE() ? 1.25 : 1.5, devicePixelRatio || 1);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .95;
const scene = new THREE.Scene();
const BG = new THREE.Color('#07050f');
scene.background = BG.clone();
scene.fog = new THREE.FogExp2(BG.clone(), .045);
const camera = new THREE.PerspectiveCamera(32, 1, .1, 200);
camera.position.set(0, 0, 14);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;

scene.add(new THREE.HemisphereLight('#8a7cff', '#1a0c22', .55));
const key = new THREE.DirectionalLight('#fff1e0', 1.25); key.position.set(-5, 7, 8); scene.add(key);
const rimA = new THREE.PointLight('#ff3df0', 22, 40, 2); rimA.position.set(7, 3, -3); scene.add(rimA);
const rimB = new THREE.PointLight('#35dcea', 16, 40, 2); rimB.position.set(-7, -3, 2); scene.add(rimB);
const tagLight = new THREE.PointLight('#ffd23f', 9, 16, 2); scene.add(tagLight);

const geo = new RoundedBoxGeometry(1, 1, 1, 2, .16);
const mat = new THREE.MeshStandardMaterial({ roughness: .32, metalness: .08, envMapIntensity: .55, emissive: '#ffffff', emissiveIntensity: .1 });
// per-instance emissive: glow in the instance colour, not white
mat.onBeforeCompile = sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n#endif');
};

// ---------------------------------------------------------------- the voxel cloud
const N = MOBILE() ? 650 : 1000;
const cloud = new THREE.InstancedMesh(geo, mat, N);
cloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cloud.frustumCulled = false;
scene.add(cloud);
const tmpC = new THREE.Color();
for (let i = 0; i < N; i++) cloud.setColorAt(i, tmpC.set('#ffffff'));

// dust: every instance has a home in a far shell when it isn't part of a form
const dust = new Float32Array(N * 3), dustS = new Float32Array(N), rnd = new Float32Array(N * 4);
for (let i = 0; i < N; i++){
  const u = hash(i * 3 + 1) * 2 - 1, a = hash(i * 3 + 2) * Math.PI * 2, r = 6 + hash(i * 3 + 3) * 12;
  const s = Math.sqrt(1 - u * u);
  dust[i * 3] = Math.cos(a) * s * r * 1.5; dust[i * 3 + 1] = u * r * .8; dust[i * 3 + 2] = Math.sin(a) * s * r - 4;
  dustS[i] = .07 + hash(i * 7 + 5) * .12;
  rnd[i * 4] = hash(i * 11 + 1); rnd[i * 4 + 1] = hash(i * 11 + 2) * 2 - 1; rnd[i * 4 + 2] = hash(i * 11 + 3) * 2 - 1; rnd[i * 4 + 3] = hash(i * 11 + 4) * 2 - 1;
}

// stages: 0 hero word · 1 vortex · 2..N+1 games · last = PLAY
function heroShape(size){
  const keys = ['m', 'u', 'c', 'y', 'o', 'm'];
  const rows = ['', '', '', '', '', '', ''];
  'JOJKOS'.split('').forEach((ch, i) => {
    const g = SH.wordGrid(ch, keys[i]);
    for (let r = 0; r < 7; r++) rows[r] += (i ? '.' : '') + g[r];
  });
  return SH.fromGrid(rows, { size, depth: 2 });
}
function finShape(size){
  const rows = SH.wordGrid('PLAY', 'y');
  return SH.fromGrid(rows.map((r, y) => [...r].map((c, x) => c === '.' ? '.' : (x < 6 ? 'm' : x < 12 ? 'c' : x < 18 ? 'y' : 'o')).join('')), { size, depth: 2 });
}
const STAGES = [];
function buildStages(){
  STAGES.length = 0;
  const mob = MOBILE();
  const add = (shape, kind, extra) => {
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), scl = new Float32Array(N), isDust = new Uint8Array(N);
    const n = Math.min(N, shape.pts.length);
    // shuffle which instance takes which voxel → crossing, swirling morphs
    const order = Array.from({ length: N }, (_, i) => i);
    const seed = STAGES.length * 7919;
    order.sort((a, b) => hash(a + seed) - hash(b + seed));
    for (let k = 0; k < N; k++){
      const i = order[k];
      if (k < n){
        const p = shape.pts[k];
        pos.set(p, i * 3);
        tmpC.set(shape.cols[k]);
        col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
        scl[i] = shape.loose ? .12 + hash(i + seed) * .14 : shape.sp * .9;
      } else {
        isDust[i] = 1;
        scl[i] = dustS[i];
        const c = hash(i * 5 + 9);
        tmpC.set(c < .5 ? '#6a58c8' : c < .75 ? '#ff3df0' : c < .9 ? '#35dcea' : '#ffd23f');
        col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
      }
    }
    STAGES.push(Object.assign({ kind, pos, col, scl, isDust, off: new THREE.Vector3(), rotY: 0, kid: new THREE.Vector3(), kidS: 1, card: null, tag: '#ff3df0' }, extra));
  };
  const S0 = mob ? 5.4 : 8.6;
  add(heroShape(S0), 'hero', {});
  add(SH.vortex(Math.min(N, 700)), 'vortex', {});
  GAMES.forEach((g, i) => add(SH.shapeFor(SH.iconFor(g), mob ? 3.6 : 4.4), 'game', { game: g, gi: i, side: i % 2 ? -1 : 1, tag: TAGS[g.tag] || '#ffffff' }));
  add(finShape(mob ? 5 : 7.2), 'fin', {});
  layoutStages();
}
function layoutStages(){
  const mob = MOBILE();
  for (const s of STAGES){
    if (s.kind === 'hero'){ s.off.set(0, mob ? 2.6 : 2.05, -1.5); s.kid.set(mob ? 1.1 : 3.6, mob ? -.4 : -.9, 2); s.kidS = mob ? .7 : .85; }
    else if (s.kind === 'vortex'){ s.off.set(0, mob ? .8 : 0, -1); s.kid.set(0, mob ? .8 : -.2, -.5); s.kidS = .72; }
    else if (s.kind === 'game'){
      if (mob){ s.off.set(0, 2.5, 0); s.kid.set(1.1, .2, 2); s.card = { p: new THREE.Vector3(-.9, 1.3, -2.6), ry: .35 }; }
      else {
        s.off.set(s.side * 2.85, .35, 0);
        s.kid.set(s.side * .9, -2.2, 2.2);
        s.card = { p: new THREE.Vector3(s.side * 4.1, -.35, -2.8), ry: -s.side * .42 };
      }
      s.kidS = .5; s.rotY = -s.side * .32;
    } else { s.off.set(0, mob ? 2.4 : 1.5, -1); s.kid.set(0, mob ? -.2 : -1.3, 2.4); s.kidS = 1; }
  }
}
buildStages();

// ---------------------------------------------------------------- the kid
// the character gets its own material: same look, far less self-glow so the
// face, beard and flannel keep their colour under bloom
const kidMat = mat.clone();
kidMat.emissiveIntensity = .025; kidMat.envMapIntensity = .35; kidMat.roughness = .5;
kidMat.onBeforeCompile = mat.onBeforeCompile;
const kid = buildKid(geo, kidMat);
scene.add(kid);

// ---------------------------------------------------------------- the screenshot card
const loader = new THREE.TextureLoader();
const texCache = {};
let loaded = 0;
function tex(g){
  if (!texCache[g.img]){
    // upload to the GPU as soon as it decodes, so the card flip never hitches
    const t = loader.load(g.img, tx => { loaded++; renderer.initTexture(tx); }, undefined, () => { loaded++; });
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache[g.img] = t;
  }
  return texCache[g.img];
}
GAMES.forEach(tex);
const card = new THREE.Group();
const CW = 4.3, CH = CW * 10 / 16;
const cardFace = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshBasicMaterial({ toneMapped: false }));
cardFace.position.z = .07;
const cardBack = new THREE.Mesh(new RoundedBoxGeometry(CW + .22, CH + .22, .12, 3, .06), new THREE.MeshStandardMaterial({ color: '#15101f', roughness: .4, metalness: .3 }));
const cardEdge = new THREE.Mesh(new THREE.PlaneGeometry(CW + .34, CH + .34), new THREE.MeshBasicMaterial({ color: '#ff3df0', toneMapped: false, transparent: true, opacity: .9 }));
cardEdge.position.z = -.08;
card.add(cardEdge, cardBack, cardFace);
// back of the card: the jojkos logo stamp
const backFace = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshBasicMaterial({ color: '#1d1336', toneMapped: false }));
backFace.rotation.y = Math.PI; backFace.position.z = -.07;
card.add(backFace);
scene.add(card);

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: MOBILE() ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .55, .5, .88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(DPR);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(DPR);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.position.z = MOBILE() ? 17 : 14;
  camera.updateProjectionMatrix();
  layoutStages();
  if (window.ScrollTrigger) ScrollTrigger.refresh();
  measure();
}

// ---------------------------------------------------------------- scroll → stage
let lenis = null;
if (!REDUCED && window.Lenis){
  lenis = new Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: .9 });
  if (window.ScrollTrigger){ lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); }
}
function goTo(el){ if (lenis) lenis.scrollTo(el, { duration: 1.6, offset: 0 }); else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }); }
document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); goTo($(a.getAttribute('data-go'))); }));

let anchors = [];
function measure(){
  // one anchor per stage: the scroll value at which that section is centred
  const secs = [$('#hero'), $('#mani'), ...document.querySelectorAll('.ch'), $('#fin')];
  const vh = innerHeight;
  anchors = secs.map((s, i) => {
    const top = s.offsetTop, h = s.offsetHeight;
    if (i === 0) return 0;
    if (i === secs.length - 1) return top - vh * .15;
    return top + h / 2 - vh / 2;
  });
  docH = Math.max(1, document.documentElement.scrollHeight - vh);
}
let docH = 1;
function stageAt(y){
  if (y <= anchors[0]) return 0;
  for (let i = 0; i < anchors.length - 1; i++){
    if (y < anchors[i + 1]) return i + (y - anchors[i]) / (anchors[i + 1] - anchors[i]);
  }
  return anchors.length - 1;
}

// ---------------------------------------------------------------- pointer
const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', e => { ptr.x = e.clientX / innerWidth * 2 - 1; ptr.y = e.clientY / innerHeight * 2 - 1; });

// ---------------------------------------------------------------- render loop
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eul = new THREE.Euler(), vS = new THREE.Vector3(), vP = new THREE.Vector3();
const colA = new THREE.Color(), colB = new THREE.Color(), bgA = new THREE.Color(), bgB = new THREE.Color();
let intro = REDUCED ? 1 : 0, introStarted = false;
let lastY = 0, vel = 0, stageS = 0, curCh = -1;
const clock = new THREE.Clock();

function stagePos(s, i, t, out){
  if (s.isDust[i]){
    const k = i * 3;
    out.set(dust[k] + dustW[k], dust[k + 1] + dustW[k + 1], dust[k + 2]);
    return out;
  }
  const k = i * 3;
  let x = s.pos[k], y = s.pos[k + 1], z = s.pos[k + 2];
  if (s.kind === 'vortex'){                                   // the galaxy turns
    const a = t * .12 + (1 - Math.min(1, Math.hypot(x, z) / 7)) * t * .15;
    const c = Math.cos(a), sn = Math.sin(a);
    const nx = x * c - z * sn; z = x * sn + z * c; x = nx;
  }
  const r = s._r;                                   // rotation cached once per frame
  const x1 = x * r[0] + z * r[1], z1 = -x * r[1] + z * r[0];
  const y1 = y * r[2] - z1 * r[3], z2 = y * r[3] + z1 * r[2];
  out.set(s.off.x + x1, s.off.y + y1 + r[4], s.off.z + z2);
  return out;
}

const dustW = new Float32Array(N * 3);
let lastCKey = -1, slowT = 0, fastT = 0, quality = 2;
function cacheRot(s, t){
  const ry = s.rotY + Math.sin(t * .45 + (s.gi || 0)) * .16 + ptr.sx * .35, rx = ptr.sy * .18 + Math.sin(t * .3) * .05;
  s._r = [Math.cos(ry), Math.sin(ry), Math.cos(rx), Math.sin(rx), Math.sin(t * .8 + (s.gi || 0)) * .12];
}
function frame(){
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = Math.min(.05, clock.getDelta() || .016);
  const t = clock.elapsedTime;
  // adaptive quality: if frames run long for a while, drop DPR, then bloom
  if (dt > .026) slowT += dt; else slowT = Math.max(0, slowT - dt * .5);
  if (slowT > 1.5 && quality > 0){
    quality--; slowT = 0;
    if (quality === 1){ DPR = 1; resize(); }
    else bloom.enabled = false;
  }
  const y = lenis ? lenis.scroll : scrollY;
  vel = lerp(vel, (y - lastY) / Math.max(dt, .001), .1); lastY = y;
  ptr.sx = lerp(ptr.sx, ptr.x, .06); ptr.sy = lerp(ptr.sy, ptr.y, .06);

  const target = stageAt(y);
  stageS = REDUCED ? target : lerp(stageS, target, .18);
  let A = Math.floor(stageS), f = stageS - A;
  if (A >= STAGES.length - 1){ A = STAGES.length - 2; f = 1; }
  const E = REDUCED ? (f > .5 ? 1 : 0) : smooth(.2, .8, f);
  const SA = STAGES[A], SB = STAGES[A + 1];
  // intro: the cloud condenses out of the dust into the logo
  if (introStarted && intro < 1) intro = Math.min(1, intro + dt / 2.4);
  const I = smooth(0, 1, intro);
  cacheRot(SA, t); if (SB !== SA) cacheRot(SB, t);
  for (let i = 0, k = 0; i < N; i++, k += 3){ dustW[k] = Math.sin(t * .1 + i) * .4; dustW[k + 1] = Math.sin(t * .13 + i * .7) * .5; }
  // colours only depend on (stage, morph) — skip the upload when unchanged
  const cKey = A * 1000 + Math.round(E * 300) + (I < 1 ? 500000 : 0);
  const doCol = cKey !== lastCKey; lastCKey = cKey;

  for (let i = 0; i < N; i++){
    const d = rnd[i * 4];
    const e = smooth(0, 1, clamp((E - d * .35) / .65, 0, 1));
    stagePos(SA, i, t, vP);
    stagePos(SB, i, t, vS);
    let px = lerp(vP.x, vS.x, e), py = lerp(vP.y, vS.y, e), pz = lerp(vP.z, vS.z, e);
    const sw = Math.sin(e * Math.PI) * (1.8 + d * 1.5);
    px += rnd[i * 4 + 1] * sw; py += rnd[i * 4 + 2] * sw; pz += rnd[i * 4 + 3] * sw;
    let sc = lerp(SA.scl[i], SB.scl[i], e) * (1 + Math.sin(e * Math.PI) * .25);
    // intro: everything starts as dust
    if (I < 1){
      const di = smooth(0, 1, clamp((I - d * .4) / .6, 0, 1));
      const k = i * 3;
      px = lerp(dust[k] * 1.6, px, di); py = lerp(dust[k + 1] * 1.6, py, di); pz = lerp(dust[k + 2] * 1.3 - 6, pz, di);
      sc = lerp(dustS[i] * .6, sc, di);
    }
    const tumble = Math.sin(e * Math.PI) * 3 + (1 - I) * 4;
    eul.set(rnd[i * 4 + 1] * tumble, rnd[i * 4 + 2] * tumble + (SA.isDust[i] && SB.isDust[i] ? t * .3 * rnd[i * 4 + 3] : 0), rnd[i * 4 + 3] * tumble);
    q.setFromEuler(eul);
    m4.compose(vP.set(px, py, pz), q, vS.set(sc, sc, sc));
    cloud.setMatrixAt(i, m4);
    if (doCol){
      const k3 = i * 3;
      colA.setRGB(SA.col[k3], SA.col[k3 + 1], SA.col[k3 + 2]);
      colB.setRGB(SB.col[k3], SB.col[k3 + 1], SB.col[k3 + 2]);
      cloud.setColorAt(i, colA.lerp(colB, e));
    }
  }
  cloud.instanceMatrix.needsUpdate = true;
  if (doCol) cloud.instanceColor.needsUpdate = true;

  // kid: drift between stage poses, bob, lean into the scroll, eye the pointer
  const kx = lerp(SA.kid.x, SB.kid.x, E), ky = lerp(SA.kid.y, SB.kid.y, E), kz = lerp(SA.kid.z, SB.kid.z, E);
  const orbit = (SA.kind === 'game' ? 1 - E : 0) + (SB.kind === 'game' ? E : 0);
  const introK = lerp(-9, 0, smooth(.25, 1, I));
  kid.position.set(
    kx + Math.sin(t * .5) * .35 * orbit + ptr.sx * .3,
    ky + Math.sin(t * 1.1) * .18 + introK,
    kz + Math.cos(t * .5) * .3 * orbit);
  kid.scale.setScalar(lerp(SA.kidS, SB.kidS, E));
  const vk = clamp(vel / 2500, -1, 1);
  kid.rotation.set(ptr.sy * .25 + vk * .5 + Math.sin(t * .7) * .06, ptr.sx * .6 + Math.sin(t * .4) * .25 + (SA.kind === 'vortex' || SB.kind === 'vortex' ? t * .35 * Math.sin(E * Math.PI) : 0), Math.sin(t * .6) * .08 - vk * .25);
  kid.tick(t, Math.abs(vk) + (1 - I) * 1.5);

  // screenshot card: flips edge-on at the boundary, texture swaps unseen
  const cA = SA.card, cB = SB.card;
  if (cA || cB){
    card.visible = true;
    const pA = cA ? cA.p : (cB.p), pB = cB ? cB.p : cA.p;
    card.position.set(lerp(pA.x, pB.x, E), lerp(pA.y, pB.y, E) + Math.sin(t * .9) * .08, lerp(pA.z, pB.z, E));
    const baseA = cA ? cA.ry : cB.ry, baseB = cB ? cB.ry : cA.ry;
    const show = E < .5 ? SA : SB;
    let s = 1;
    if (!cA) s = smooth(.35, .9, E);
    if (!cB) s = 1 - smooth(.1, .65, E);
    card.scale.setScalar(Math.max(.001, s));
    const flip = cA && cB ? (E < .5 ? E * Math.PI : (E - 1) * Math.PI) : 0;
    card.rotation.set(ptr.sy * .12 + Math.sin(t * .6) * .03, lerp(baseA, baseB, E) + flip + ptr.sx * .15, Math.sin(t * .5) * .02);
    if (show.game){
      const tx = tex(show.game);
      if (cardFace.material.map !== tx){ cardFace.material.map = tx; cardFace.material.needsUpdate = true; }
      cardEdge.material.color.set(show.tag);
    }
  } else card.visible = false;

  // light + fog tint follow the chapter colour
  colA.set(SA.tag); colB.set(SB.tag);
  tagLight.color.copy(colA.lerp(colB, E));
  tagLight.position.set(lerp(SA.off.x, SB.off.x, E), lerp(SA.off.y, SB.off.y, E) + 1, 3.5);
  bgA.set('#07050f').lerp(tagLight.color, .07);
  scene.background.lerp(bgA, .08);
  scene.fog.color.copy(scene.background);

  // camera: gentle parallax + a push-in on the vortex
  const vort = (SA.kind === 'vortex' ? 1 - E : 0) + (SB.kind === 'vortex' ? E : 0);
  const baseZ = MOBILE() ? 17 : 14;
  camera.position.set(ptr.sx * .6, -ptr.sy * .35, baseZ - vort * 3.2);
  camera.lookAt(0, 0, -1);

  // chapter HUD (rail, bar, bg tint var)
  const chIdx = Math.round(stageS) - 2;
  if (chIdx !== curCh){
    curCh = chIdx;
    const dots = rail.children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === chIdx);
    const g = GAMES[chIdx];
    document.documentElement.style.setProperty('--cur', g ? TAGS[g.tag] : '#ff3df0');
    rail.classList.toggle('show', chIdx >= 0 && chIdx < GAMES.length);
  }
  bar.style.transform = 'scaleX(' + clamp(y / docH, 0, 1).toFixed(4) + ')';

  composer.render();
}
const bar = $('#bar');

// ---------------------------------------------------------------- DOM choreography
function choreo(){
  if (!window.gsap || !window.ScrollTrigger || REDUCED){ document.body.classList.add('static'); return; }
  gsap.registerPlugin(ScrollTrigger);
  // hero headline letters
  gsap.from('#hero .hl .c', { yPercent: 120, rotate: 8, duration: 1.1, ease: 'expo.out', stagger: .03, delay: .35 });
  gsap.from('#hero .fade', { opacity: 0, y: 20, duration: 1, ease: 'power3.out', stagger: .1, delay: .9 });
  gsap.to('#hero .hl', { yPercent: -40, opacity: 0, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
  // manifesto: one short line, fades up once
  gsap.from('#maniP .mw', { opacity: 0, y: 30, duration: .9, ease: 'power3.out', stagger: .06, scrollTrigger: { trigger: '#mani', start: 'top 55%' } });
  // chapters
  gsap.utils.toArray('.ch').forEach((sec, i) => {
    const side = sec.classList.contains('ch-r') ? -1 : 1;
    const cs = sec.querySelectorAll('.ch-name .c');
    const tl = gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top 68%', end: 'bottom 30%', toggleActions: 'play reverse play reverse' } });
    tl.from(sec.querySelector('.ch-meta'), { y: 20, opacity: 0, duration: .6, ease: 'power3.out' }, 0)
      .from(cs, { yPercent: 115, duration: .9, ease: 'expo.out', stagger: .018 }, .08)
      .from(sec.querySelectorAll('.ch-copy, .ch-play'), { y: 26, opacity: 0, duration: .8, ease: 'power3.out', stagger: .08 }, .3);
  });
  // finale
  gsap.from('#fin .fin-h .c', { yPercent: 120, stagger: .04, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '#fin', start: 'top 60%' } });
  gsap.from('.fcard', { y: 60, opacity: 0, duration: .9, ease: 'power3.out', stagger: .04, scrollTrigger: { trigger: '#finGrid', start: 'top 85%' } });
}

// ---------------------------------------------------------------- boot
resize();
renderer.compile(scene, camera);                // no first-use shader stalls mid-scroll
addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(resize, 120); });
choreo();
if (window.ScrollTrigger) ScrollTrigger.addEventListener('refresh', measure);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (window.ScrollTrigger) ScrollTrigger.refresh(); measure(); });
requestAnimationFrame(frame);
// preloader: count while textures arrive, then let the cloud condense
const pre = $('#pre');
const total = Object.keys(texCache).length;
const t0 = performance.now();
(function tick(){
  // honest-ish: follows the textures, but never blocks longer than ~3s
  const el = performance.now() - t0;
  const p = Math.min(1, Math.max(Math.min(loaded / total, el / 600), el / 1800));
  $('#preBar').style.transform = 'scaleX(' + p + ')';
  if (p < 1) return requestAnimationFrame(tick);
  pre.classList.add('done');
  introStarted = true;
  measure();
})();
