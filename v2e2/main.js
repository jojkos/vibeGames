/* main.js — boot, frame loop, input (keys / mouse / touch stick / gamepad),
   HUD (focus card, minimap, toasts), game directory, intro walk-in, idle
   attract mode and the pixel-dissolve exit into a game. */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const view = $('view');
const reduced = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
let running = false, lastT = 0, entered = false, idleT = 0, attractIn = 0, frameN = 0;

// ---------------------------------------------------------------- boot
World.init(view);
Cabinets.init();
Ghosts.init();
Ghosts.setPhantomCb(i => Cabinets.phantomWake(i));
$('startSub').textContent = GAMES.length + ' CABINETS · ONE RAINY NIGHT · NO QUARTERS NEEDED';

addEventListener('resize', () => { clearTimeout(window.__rs); window.__rs = setTimeout(() => { World.resize(); sizeMini(); }, 100); });

// ---------------------------------------------------------------- HUD
const toastEl = $('toast');
let toastTo = 0;
function toast(msg, ms){
  toastEl.innerHTML = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTo);
  toastTo = setTimeout(() => toastEl.classList.remove('on'), ms || 2000);
}
function updateHud(){
  $('coinCount').textContent = Cabinets.coinTotal();
  $('echoCount').textContent = Ghosts.count();
}
function setFocusCard(item){
  const card = $('focus');
  if (!item){ card.classList.remove('show'); return; }
  const col = item.coffee ? '#ffd23f' : CFG.TAG_COLORS[item.game.tag] || '#fff';
  card.style.setProperty('--tag', col);
  const img = $('fImg');
  if (item.coffee){
    img.style.display = 'none';
    $('fTag').textContent = 'SUPPORT';
    $('fName').textContent = 'COFFEE MACHINE';
    $('fMeta').innerHTML = 'fuel the next game · <b>1 COIN</b>';
    $('fPlay').innerHTML = '<span class="bl">♥</span> BUY';
  } else {
    img.style.display = '';
    if (img.getAttribute('src') !== item.game.img) img.src = item.game.img;
    $('fTag').textContent = item.game.tag;
    $('fName').textContent = item.game.name.toUpperCase();
    const n = Cabinets.coinsFor(item.idx);
    const top = Cabinets.topScores(1)[0];
    $('fMeta').innerHTML = (n ? 'played <b>' + n + '×</b>' : 'never played — <b>try it</b>') +
      (top && top.idx === item.idx && n ? ' · <b>★ your #1</b>' : '') +
      (isTouch ? '' : ' · <span class="kc">E</span>');
    $('fPlay').innerHTML = '<span class="bl">▶</span> PLAY';
  }
  card.classList.add('show');
}
Cabinets.onFocusChange = item => {
  setFocusCard(item);
  World.setTargetZoom(item ? CFG.FOCUS_ZOOM : CFG.BASE_ZOOM);
  $('hint').classList.toggle('off', !!item || hintSeen > 2);
  if (item){ AudioSys.wake(); if (!item.coffee) Ghosts.event('focus', item.idx); }
};
Cabinets.onCoin = item => { if (!item.coffee) Ghosts.event('coin', item.idx); updateHud(); };
Cabinets.onCoffee = () => {
  toast('THANKS! ♥ BREWING…');
  try { window.open(SITE.coffee, '_blank', 'noopener'); } catch (e){}
};
function tryInsert(){ AudioSys.unlock(); Cabinets.insertCoin(); updateHud(); }
$('focus').addEventListener('click', tryInsert);
$('fPlay').addEventListener('click', e => { e.stopPropagation(); tryInsert(); });

// ---------------------------------------------------------------- walking helpers
const faceFor = it => it.f === 'E' ? 3 : 0;
function walkToItem(it, thenPlay){
  const fp = it.frontPoint;
  World.setMarker(fp[0], fp[1]);
  Player.walkTo(fp[0], fp[1], { face: it.coffee ? 0 : faceFor(it), onArrive: thenPlay ? () => { if (Cabinets.focused === it) tryInsert(); } : null });
}
let hintSeen = 0;

// ---------------------------------------------------------------- keyboard
const keys = Object.create(null);
const overlayOpen = () => $('menu').classList.contains('open') || $('help').classList.contains('open');
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (overlayOpen()){
    if (k === 'escape'){ closeOverlays(); }
    if (k === 'm' && $('menu').classList.contains('open')) closeOverlays();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!entered && !reduced){ e.preventDefault(); startGame(); return; }
  keys[k] = true;
  idleT = 0; World.setAttract(false);
  AudioSys.unlock();
  if (k === 'e' || k === ' ' || k === 'enter'){ e.preventDefault(); if (!e.repeat) tryInsert(); }
  else if (k === 'tab'){ e.preventDefault(); if (!Cabinets.launching()) walkToItem(Cabinets.nextTarget(e.shiftKey ? -1 : 1)); }
  else if (k === 'm') openOverlay('menu');
  else if (k === 'h' || k === '?') openOverlay('help');
  else if (k === 'n') $('mini').style.display = $('mini').style.display === 'none' ? '' : 'none';
  else if (k === 'f') toggleFS();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) hintSeen++;
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; if (e.key === 'Shift') keys.shift = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------------------------------------------------------------- pointer
let lastTap = { item: null, t: 0 };
function tapAction(e){
  const w = World.clientToWorld(e.clientX, e.clientY);
  const hit = Cabinets.hitTest(w);
  const now = performance.now();
  if (hit){
    const dbl = lastTap.item === hit.item && now - lastTap.t < 420;
    lastTap = { item: hit.item, t: now };
    if (hit.focused){ tryInsert(); return; }
    walkToItem(hit.item, dbl);
  } else {
    lastTap = { item: null, t: now };
    World.setMarker(w.x, w.y);
    Player.walkTo(w.x, w.y);
  }
}
const joyEl = $('joy'), joyKnob = $('joyKnob');
const JOY_MAX = 48, JOY_THRESH = 12;
let touch = null;
function endTouch(e){
  if (!touch || (e && e.pointerId !== touch.id)) return;
  if (!touch.joy) tapAction(touch.e);
  Player.joy = null;
  joyEl.classList.remove('on');
  joyKnob.style.transform = '';
  touch = null;
}
view.addEventListener('pointerdown', e => {
  if (!entered && !reduced){ startGame(); return; }
  AudioSys.unlock();
  idleT = 0; World.setAttract(false);
  if (Cabinets.launching()){ Cabinets.insertCoin(); return; }
  if (e.pointerType === 'touch'){
    touch = { id: e.pointerId, ox: e.clientX, oy: e.clientY, e, joy: false };
    try { view.setPointerCapture(e.pointerId); } catch (_){}
    return;
  }
  tapAction(e);
});
view.addEventListener('pointermove', e => {
  if (touch && e.pointerId === touch.id){
    const dx = e.clientX - touch.ox, dy = e.clientY - touch.oy, d = Math.hypot(dx, dy);
    if (!touch.joy && d > JOY_THRESH){
      touch.joy = true;
      joyEl.style.left = touch.ox + 'px'; joyEl.style.top = touch.oy + 'px';
      joyEl.classList.add('on');
    }
    if (touch.joy){
      const k = Math.min(1, d / JOY_MAX), ux = d ? dx / d : 0, uy = d ? dy / d : 0;
      joyKnob.style.transform = 'translate(' + (ux * JOY_MAX * k) + 'px,' + (uy * JOY_MAX * k) + 'px)';
      // push to the rim of the ring = run
      Player.joy = { x: ux * k, y: uy * k, run: d > JOY_MAX * 1.35 };
      idleT = 0; World.setAttract(false);
    }
    return;
  }
  if (isTouch || e.pointerType === 'touch') return;
  const w = World.clientToWorld(e.clientX, e.clientY);
  const hit = Cabinets.hitTest(w);
  Cabinets.setHover(hit ? hit.item : null);
  view.style.cursor = hit ? 'pointer' : 'crosshair';
});
view.addEventListener('pointerup', endTouch);
view.addEventListener('pointercancel', endTouch);
view.addEventListener('pointerleave', () => Cabinets.setHover(null));

// ---------------------------------------------------------------- gamepad
const padPrev = {};
function pollPad(){
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && Array.from(pads).find(x => x && x.connected);
  if (!p) return;
  const b = i => !!(p.buttons[i] && p.buttons[i].pressed);
  const edge = i => { const v = b(i), was = padPrev[i]; padPrev[i] = v; return v && !was; };
  let ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = -1; if (b(13)) ay = 1;
  const mag = Math.hypot(ax, ay);
  if (!entered && !reduced && (edge(0) || edge(9))){ startGame(); return; }
  if (overlayOpen()){ if (edge(1) || edge(9)) closeOverlays(); return; }
  if (mag > .22){
    Player.joy = { x: ax, y: ay, run: b(2) || b(7) };
    idleT = 0; World.setAttract(false); padActive = true;
  } else if (padActive){ Player.joy = null; padActive = false; }
  if (edge(0)) tryInsert();
  if (edge(5)) walkToItem(Cabinets.nextTarget(1));
  if (edge(4)) walkToItem(Cabinets.nextTarget(-1));
  if (edge(9)) openOverlay('menu');
}
let padActive = false;
addEventListener('gamepadconnected', () => toast('🎮 GAMEPAD READY · A = PLAY', 2200));

// ---------------------------------------------------------------- overlays
function buildMenu(){
  const ul = $('grid');
  ul.innerHTML = '';
  Cabinets.cabs.forEach(cab => {
    const g = cab.game;
    const li = document.createElement('li');
    li.className = 'px';
    li.style.setProperty('--tag', cab.color);
    const n = Cabinets.coinsFor(cab.idx);
    li.innerHTML =
      '<a class="shot" href="' + g.url + '"><img loading="lazy" alt="" src="' + g.img + '"></a>' +
      '<div class="row"><span class="nm"></span><span class="tg"></span></div>' +
      '<div class="meta">' + (n ? 'played ' + n + '×' : 'not played yet') + '</div>' +
      '<div class="acts"><a class="pxbtn gold" href="' + g.url + '">▶ PLAY</a><button class="pxbtn go">⌖ GO</button></div>';
    li.querySelector('.nm').textContent = g.name;
    li.querySelector('.tg').textContent = g.tag;
    li.querySelector('.go').addEventListener('click', () => {
      closeOverlays();
      if (!entered && !reduced) startGame();
      walkToItem(cab);
      toast('WALKING TO ' + g.name.toUpperCase() + '…', 1500);
    });
    ul.appendChild(li);
  });
}
function openOverlay(id){
  if (id === 'menu') buildMenu();
  $(id).classList.add('open');
  AudioSys.ui();
}
function closeOverlays(){ $('menu').classList.remove('open'); $('help').classList.remove('open'); }
$('btnMenu').addEventListener('click', () => { AudioSys.unlock(); openOverlay('menu'); });
$('btnHelp').addEventListener('click', () => { AudioSys.unlock(); openOverlay('help'); });
$('btnCloseMenu').addEventListener('click', closeOverlays);
$('btnCloseHelp').addEventListener('click', closeOverlays);
for (const id of ['menu', 'help']) $(id).addEventListener('click', e => { if (e.target.id === id) closeOverlays(); });
$('btnClearEchoes').addEventListener('click', () => {
  Ghosts.clear(); updateHud(); AudioSys.ui();
  $('btnClearEchoes').textContent = 'ECHOES CLEARED';
  setTimeout(() => { $('btnClearEchoes').textContent = 'CLEAR ECHOES'; }, 1500);
});
function toggleFS(){
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
}
$('btnFS').addEventListener('click', () => { AudioSys.unlock(); AudioSys.ui(); toggleFS(); });
if (!document.documentElement.requestFullscreen) $('btnFS').style.display = 'none';
function syncMute(){ $('btnMute').textContent = AudioSys.isMuted() ? 'SND OFF' : 'SND ON'; }
$('btnMute').addEventListener('click', () => { AudioSys.toggleMute(); syncMute(); });
syncMute();
$('btnEnterAnyway').addEventListener('click', () => {
  document.body.classList.remove('reduced');
  closeOverlays();
  entered = true;
  if (!running){ running = true; lastT = performance.now(); requestAnimationFrame(loop); }
});

// ---------------------------------------------------------------- minimap
const miniCv = $('miniCv'), mctx = miniCv.getContext('2d');
const MS = 3;                                    // px per tile (iso)
function sizeMini(){
  miniCv.width = (CFG.GW + CFG.GH) * MS + 2;
  miniCv.height = Math.ceil((CFG.GW + CFG.GH) * MS / 2) + 2;
  miniCv.style.width = Math.min(252, miniCv.width * 2) + 'px';
}
sizeMini();
const miniPt = (x, y) => [(x - y + CFG.GH) * MS + 1, (x + y) * MS / 2 + 1];
const miniEl = $('mini');
const miniOn = () => miniEl.style.display !== 'none' && getComputedStyle(miniEl).display !== 'none';
function drawMini(t){
  const c = mctx;
  c.clearRect(0, 0, miniCv.width, miniCv.height);
  const q = (x0, y0, x1, y1, col) => {
    const a = miniPt(x0, y0), b = miniPt(x1, y0), d = miniPt(x1, y1), e = miniPt(x0, y1);
    c.fillStyle = col; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]); c.closePath(); c.fill();
  };
  q(1, 1, CFG.GW - 1, CFG.GH - 1, '#1d1838');
  q(0, 0, CFG.GW, 1, '#3a2b58'); q(0, 0, 1, CFG.GH, '#2c2046');
  q(8, 0, 10, 1, '#7fa6ff');
  for (const cab of Cabinets.cabs){
    const f = cab.foot;
    q(f[0], f[1], f[2], f[3], cab === Cabinets.focused ? '#ffffff' : cab.color);
  }
  const cf = Cabinets.coffee; q(cf.foot[0], cf.foot[1], cf.foot[2], cf.foot[3], '#ffd23f');
  for (const p of World.props) q(p.tx, p.ty, p.tx + 1, p.ty + 1, '#5d4a7d');
  for (const g of Ghosts.frames()){ const p = miniPt(g.x, g.y); c.fillStyle = 'rgba(143,184,255,.6)'; c.fillRect(p[0] - 1, p[1] - 1, 2, 2); }
  const p = miniPt(Player.x, Player.y);
  c.fillStyle = (t * 3 % 1) < .7 ? '#ffd23f' : '#ff7a4a';
  c.fillRect(Math.round(p[0]) - 1, Math.round(p[1]) - 2, 3, 3);
}
$('mini').addEventListener('click', e => {
  if (!entered && !reduced){ startGame(); return; }
  const r = miniCv.getBoundingClientRect();
  const mx = (e.clientX - r.left) / r.width * miniCv.width - 1, my = (e.clientY - r.top) / r.height * miniCv.height - 1;
  // invert miniPt
  const a = mx / MS - CFG.GH, b = my * 2 / MS;
  const x = (a + b) / 2, y = (b - a) / 2;
  let best = null, bd = 2.2;
  for (const it of Cabinets.items){
    const cx = (it.foot[0] + it.foot[2]) / 2, cy = (it.foot[1] + it.foot[3]) / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bd){ bd = d; best = it; }
  }
  if (best) walkToItem(best);
  else { World.setMarker(x, y); Player.walkTo(x, y); }
});

// ---------------------------------------------------------------- exit transition
const dis = $('dissolve'), dctx = dis.getContext('2d');
window.pixelDissolve = function(ms, done){
  const W = Math.ceil(innerWidth / 12), H = Math.ceil(innerHeight / 12);
  dis.width = W; dis.height = H;
  dis.style.display = 'block';
  const t0 = performance.now();
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  (function step(){
    const p = Math.min(1, (performance.now() - t0) / ms);
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = '#07040e';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      // bayer threshold + a slight radial bias: dissolves in from the edges
      const r = Math.hypot(x / W - .5, y / H - .5) * 1.1;
      if ((B[(y & 3) * 4 + (x & 3)] + .5) / 16 * .7 + (1 - r) * .3 < p * 1.05) dctx.fillRect(x, y, 1, 1);
    }
    if (p < 1) requestAnimationFrame(step); else setTimeout(done, 40);
  })();
};
// back-button (bfcache) return: clear the launch overlays and resume
addEventListener('pageshow', e => {
  if (!e.persisted) return;
  const li = $('launchImg');
  li.style.display = 'none'; li.style.opacity = 0; li.style.transition = ''; li.removeAttribute('src');
  dis.style.display = 'none';
  Cabinets.navigated = false; Cabinets.state = 'idle'; Cabinets.active = null; Cabinets.imgShown = false; Cabinets.msg = '';
  World.cam.z = CFG.FOCUS_ZOOM;
  updateHud();
  if (!reduced && !running){ running = true; lastT = performance.now(); requestAnimationFrame(loop); }
});

// ---------------------------------------------------------------- intro
World.cam.z = 1;
let introActive = false;
if (reduced){
  Player.init(9.0, 2.7);
  World.doorOpen = 0; World.doorTarget = 0;
} else {
  World.unblock(8, 0); World.unblock(9, 0);
  Player.init(9.0, .75);
  Player.facing = 2;
  World.doorOpen = 1; World.doorTarget = 1;
  const d = World.iso(9.0, 2.2);
  World.cam.x = d[0]; World.cam.y = d[1] - 30;
  World.cam.z = .82; World.setTargetZoom(.82);
  World.introCam = true;
  introActive = true;
  $('start').classList.add('show');
}
updateHud();

function startGame(){
  if (entered || reduced) return;
  entered = true;
  AudioSys.unlock();
  $('start').classList.remove('show');
  World.setTargetZoom(CFG.BASE_ZOOM);
  AudioSys.bell();
  Player.walkTo(9.0, 2.7, { face: 2, slow: true, onArrive: () => { Player.speedMul = 1; World.introCam = false; } });
  setTimeout(() => toast(isTouch ? 'DRAG TO WALK · TAP A CABINET · TAP AGAIN TO PLAY'
                                 : 'WASD WALK · SHIFT RUN · E PLAY · TAB NEXT CABINET', 3800), 900);
}
$('btnStart').addEventListener('click', e => { e.stopPropagation(); startGame(); });
$('start').addEventListener('click', startGame);

// ---------------------------------------------------------------- loop
function loop(tNow){
  if (!running) return;
  const dt = Math.min(.05, (tNow - lastT) / 1000 || .016);
  lastT = tNow;
  const t = tNow / 1000;
  frameN++;
  pollPad();
  const ov = overlayOpen();
  if (!ov && entered) Player.update(dt, keys);
  else if (!entered) Player.update(dt, {});
  if (introActive && Player.y > 1.9){
    introActive = false;
    World.setDoor(0);
    World.introCam = false;
    AudioSys.blip(210, 'square', .14, .06);
  }
  if (!Cabinets.launching() && !ov && entered){
    idleT += dt;
    if (idleT > 28 && !World.attract){ World.setAttract(true); attractIn = 0; }
    if (World.attract){
      attractIn -= dt;
      if (attractIn <= 0){ attractIn = 2.6 + Math.random() * 2; Cabinets.phantomWake(Math.random() * Cabinets.cabs.length | 0); }
    }
  }
  if (Player.moving){ idleT = 0; World.setAttract(false); }
  Ghosts.record(Player.x, Player.y, Player.facing, tNow);
  Ghosts.update(tNow);
  Cabinets.update(dt, t, Player);
  World.update(dt, t);
  AudioSys.update(dt, Player, Cabinets.list());
  World.render(t, dt, Player, Ghosts.frames());
  if (frameN % 3 === 0 && miniOn()) drawMini(t);
  requestAnimationFrame(loop);
}

if (reduced){
  document.body.classList.add('reduced');
  World.render(.001, .016, Player, []);
  openOverlay('menu');
} else {
  running = true;
  lastT = performance.now();
  requestAnimationFrame(loop);
}
})();
