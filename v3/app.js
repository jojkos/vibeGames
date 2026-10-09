/* v3 — Select Screen. A fighting-game select screen over the shared games list:
   every game is a portrait in the grid, the selected one gets the big splash on
   the left (or on top, on phones). Hover / arrows / tab move the P1 cursor,
   click / Enter starts the game, R rolls a random pick.
   Touch: first tap selects, second tap plays. */
(function(){
'use strict';

const G = window.GAMES || [];
const TAGC = window.TAG_COLORS || {};
const N = G.length;
const GROUPS = {
  ALL: null,
  ACTION: ['ACTION', 'SHOOTER', 'PVP', 'RACE', 'ARCADE'],
  PARTY: ['PARTY', 'CARDS'],
  CASUAL: ['PUZZLE', 'RNG', 'CLICKER'],
  TOOLS: ['TOOL'],
};
const SEL_KEY = 'jojkos_v3_sel';
const SFX_KEY = 'jojkos_sfx';
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 820px)');

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const body = document.body;
const hero = $('#hero'), media = $('#media'), slash = $('#slash');
const elIdx = $('#idx'), elName = $('#name'), elChips = $('#chips');
let elBlurb = $('#blurb');
const elPlay = $('#play'), elExt = $('#ext');
const grid = $('#grid'), cursor = $('#cursor'), q = $('#q');
const filtersEl = $('#filters'), countEl = $('#count');
const wipe = $('#wipe'), wipeName = $('#wipeName');

const ls = {
  get(k){ try { return localStorage.getItem(k); } catch (e){ return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch (e){} },
};
const pad = (n) => String(n).padStart(2, '0');
const color = (g) => TAGC[g.tag] || '#ff2e4d';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let cur = -1;
let filter = 'ALL';
let rolling = false;
let lastPointer = 'mouse';
let firstRender = true;

/* ---------------------------------------------------------------- sound */
let actx = null;
let sfxOn = ls.get(SFX_KEY) === '1';
const sfxBtn = $('#sfx');
sfxBtn.setAttribute('aria-pressed', String(sfxOn));
sfxBtn.addEventListener('click', () => {
  sfxOn = !sfxOn;
  ls.set(SFX_KEY, sfxOn ? '1' : '0');
  sfxBtn.setAttribute('aria-pressed', String(sfxOn));
  sfx('confirm');
});
function tone(freq, t0, dur, type, vol, slideTo){
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function sfx(kind){
  if (!sfxOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    if (kind === 'move') tone(740, t, 0.05, 'square', 0.025);
    else if (kind === 'tick') tone(1180, t, 0.03, 'square', 0.02);
    else if (kind === 'confirm'){ tone(523, t, 0.08, 'square', 0.035); tone(784, t + 0.07, 0.14, 'square', 0.035); }
    else if (kind === 'go'){ tone(220, t, 0.32, 'sawtooth', 0.04, 1320); tone(660, t + 0.12, 0.25, 'square', 0.025, 1760); }
  } catch (e){}
}

/* ---------------------------------------------------------------- tiles */
const tiles = G.map((g, i) => {
  const a = document.createElement('a');
  a.className = 'tile';
  a.href = g.url;
  a.dataset.i = i;
  a.setAttribute('aria-label', g.name);
  a.style.setProperty('--c', color(g));
  a.innerHTML =
    '<span class="tile-in"><img src="' + esc(g.img) + '" alt="" decoding="async"><i class="strip"></i>' +
    '<span class="fade"></span><span class="bar"></span><b class="sc">' + esc(g.short) + '</b></span>';
  grid.appendChild(a);

  // optional animated sprite strip (screenshots/anim/<name>.png) plays on the selected tile
  const animSrc = g.img.replace(/screenshots\/([^/]+)$/, 'screenshots/anim/$1');
  if (animSrc !== g.img){
    const im = new Image();
    im.onload = () => {
      const n = Math.max(2, Math.round(im.naturalWidth / (im.naturalHeight * 304 / 220)));
      const s = a.querySelector('.strip');
      s.style.backgroundImage = 'url("' + animSrc + '")';
      a.style.setProperty('--n', n);
      a.style.setProperty('--end', (n / (n - 1) * 100) + '%');
      a.style.setProperty('--dur', (n * 0.32) + 's');
      a.classList.add('has-anim');
    };
    im.src = animSrc;
  }
  return a;
});
const rnd = document.createElement('button');
rnd.type = 'button';
rnd.className = 'tile rnd';
rnd.setAttribute('aria-label', 'Random game');
rnd.innerHTML = '<span class="tile-in"><b>?</b><small>RANDOM</small></span>';
grid.appendChild(rnd);
const allTiles = tiles.concat(rnd);

function cols(){ return getComputedStyle(grid).gridTemplateColumns.split(' ').length || 5; }
function stagger(){
  // intro delay: diagonal wave from the top-left
  const c = cols();
  allTiles.forEach((t, i) => t.querySelector('.tile-in').style.setProperty('--d', (i % c) + Math.floor(i / c)));
}

/* ---------------------------------------------------------------- cursor */
function moveCursor(){
  const t = tiles[cur];
  if (!t || t.classList.contains('off')){ cursor.classList.add('hide'); return; }
  cursor.classList.remove('hide');
  cursor.style.setProperty('--x', t.offsetLeft + 'px');
  cursor.style.setProperty('--y', t.offsetTop + 'px');
  cursor.style.setProperty('--w', t.offsetWidth + 'px');
  cursor.style.setProperty('--h', t.offsetHeight + 'px');
}
addEventListener('resize', () => { moveCursor(); fitName(); onScroll(); });

/* ---------------------------------------------------------------- hero */
function splitLines(name){
  // break the name into at most two balanced lines; tiny words stick to the next
  const words = name.split(/\s+/);
  if (words.length < 2 || name.length <= 9) return [name];
  let best = [name], bestScore = Infinity;
  for (let k = 1; k < words.length; k++){
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    const score = Math.max(a.length, b.length);
    if (score < bestScore){ bestScore = score; best = [a, b]; }
  }
  return best;
}
function fitName(){
  elName.style.fontSize = '';
  const max = elName.parentElement.clientWidth;
  let fs = parseFloat(getComputedStyle(elName).fontSize);
  let guard = 40;
  while (elName.scrollWidth > max && fs > 26 && guard--){
    fs -= 3;
    elName.style.fontSize = fs + 'px';
  }
}
function renderHero(i, mode){
  const g = G[i];
  const c = color(g);
  root.style.setProperty('--c', c);
  const base = firstRender ? '600ms' : '0ms';
  elName.style.setProperty('--base', base);
  elChips.style.setProperty('--base', base);
  elBlurb.style.setProperty('--base', base);

  elIdx.textContent = g.short + ' · ' + pad(i + 1) + ' / ' + pad(N);

  // letters re-created each time, so their entrance animation replays
  let k = 0;
  elName.innerHTML = splitLines(g.name).map((line) =>
    '<span class="ln">' + Array.from(line).map((ch) =>
      ch === ' ' ? ' ' : '<span class="l" style="--k:' + (k++) + '">' + esc(ch) + '</span>'
    ).join('') + '</span>'
  ).join('');
  elName.setAttribute('aria-label', g.name);
  fitName();

  const chips = [g.tag === 'TOOL' ? 'Tool' : g.tag].concat(g.meta || []);
  elChips.innerHTML = chips.map((c, n) => '<span class="chip" style="--k:' + n + '">' + esc(c) + '</span>').join('');

  const p = elBlurb.cloneNode(false);
  p.textContent = g.blurb || '';
  elBlurb.replaceWith(p);
  elBlurb = p;

  elPlay.href = g.url;
  elExt.href = g.url;
  wipeName.textContent = g.short;

  swapImage(g.img, mode);
}
function swapImage(src, mode){
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.decoding = 'async';
  media.appendChild(img);
  const old = Array.from(media.children).slice(0, -1);
  const drop = () => old.forEach((o) => o.remove());
  if (REDUCE || mode === 'none'){ drop(); return; }
  if (mode === 'light'){
    img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 90 }).onfinish = drop;
    return;
  }
  img.animate(
    [{ clipPath: 'polygon(100% 0, 120% 0, 100% 100%, 80% 100%)', filter: 'brightness(2)' },
     { clipPath: 'polygon(-25% 0, 120% 0, 100% 100%, -45% 100%)', filter: 'brightness(1)' }],
    { duration: 420, easing: 'cubic-bezier(.7,0,.2,1)' }
  ).onfinish = drop;
  slash.animate(
    [{ transform: 'translateX(-160%) skewX(-20deg)' }, { transform: 'translateX(380%) skewX(-20deg)' }],
    { duration: 420, easing: 'cubic-bezier(.7,0,.2,1)' }
  );
}

function select(i, opts){
  opts = opts || {};
  if (i < 0 || i >= N) return;
  if (i === cur && !opts.force) return;
  cur = i;
  tiles.forEach((t, k) => t.classList.toggle('sel', k === i));
  moveCursor();
  renderHero(i, opts.mode || 'full');
  if (!opts.quiet) sfx('move');
  ls.set(SEL_KEY, G[i].name);
}

/* ---------------------------------------------------------------- filter + search */
function visible(){ return tiles.map((t, i) => t.classList.contains('off') ? -1 : i).filter((i) => i >= 0); }
function applyFilter(){
  const grp = GROUPS[filter];
  const s = q.value.trim().toLowerCase();
  let shown = 0;
  tiles.forEach((t, i) => {
    const g = G[i];
    const ok = (!grp || grp.indexOf(g.tag) !== -1) &&
      (!s || (g.name + ' ' + g.short + ' ' + g.tag + ' ' + (g.meta || []).join(' ')).toLowerCase().indexOf(s) !== -1);
    t.classList.toggle('off', !ok);
    t.tabIndex = ok ? 0 : -1;
    if (ok) shown++;
  });
  countEl.textContent = shown === N ? N + ' PROJECTS' : shown + ' / ' + N + ' SHOWN';
  const vis = visible();
  if (cur !== -1 && vis.length && vis.indexOf(cur) === -1) select(vis[0], { quiet: true });
  else moveCursor();
}
Object.keys(GROUPS).forEach((key) => {
  const b = document.createElement('button');
  b.type = 'button';
  const n = key === 'ALL' ? N : G.filter((g) => GROUPS[key].indexOf(g.tag) !== -1).length;
  b.innerHTML = '<span>' + key + '<small>' + n + '</small></span>';
  b.setAttribute('aria-pressed', String(key === filter));
  b.addEventListener('click', () => {
    filter = key;
    Array.from(filtersEl.children).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    applyFilter();
    sfx('tick');
  });
  filtersEl.appendChild(b);
});
q.addEventListener('input', applyFilter);

/* ---------------------------------------------------------------- random roulette */
function random(){
  if (rolling) return;
  const vis = visible();
  if (!vis.length) return;
  if (vis.length === 1){ select(vis[0]); return; }
  rolling = true;
  const steps = 14 + (Math.random() * 6 | 0);
  const step = (k) => {
    let nxt;
    do { nxt = vis[Math.random() * vis.length | 0]; } while (nxt === cur);
    if (k < steps){
      select(nxt, { mode: 'light', quiet: true });
      sfx('tick');
      setTimeout(() => step(k + 1), 45 + Math.pow(k / steps, 3) * 300);
    } else {
      select(nxt, { quiet: true });
      sfx('confirm');
      cursor.classList.remove('land'); void cursor.offsetWidth; cursor.classList.add('land');
      rolling = false;
    }
  };
  step(0);
}

/* ---------------------------------------------------------------- launch */
function launch(i){
  const g = G[i];
  if (!g) return;
  sfx('go');
  if (REDUCE){ location.href = g.url; return; }
  wipe.style.setProperty('--c', color(g));
  wipeName.textContent = g.short;
  wipe.classList.remove('on'); void wipe.offsetWidth; wipe.classList.add('on');
  setTimeout(() => { location.href = g.url; }, 620);
}
addEventListener('pageshow', () => wipe.classList.remove('on'));   // back button / bfcache

elPlay.addEventListener('click', (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  launch(cur);
});

/* ---------------------------------------------------------------- pointer + keyboard */
let downAt = 0;
grid.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; downAt = Date.now(); });
let hoverT = 0;
tiles.forEach((t, i) => {
  t.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || rolling) return;
    clearTimeout(hoverT);
    hoverT = setTimeout(() => select(i), 40);
  });
  t.addEventListener('pointerleave', () => clearTimeout(hoverT));
  // keyboard focus selects; focus that comes from a tap/click is left to the click handler
  t.addEventListener('focus', () => { if (!rolling && Date.now() - downAt > 400) select(i); });
});
grid.addEventListener('click', (e) => {
  const t = e.target.closest('.tile');
  if (!t) return;
  if (t === rnd){ random(); return; }
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // let the browser open new tabs
  e.preventDefault();
  if (rolling) return;
  const i = +t.dataset.i;
  if (lastPointer === 'touch' && i !== cur){ select(i); return; }       // touch: first tap picks
  if (i !== cur) select(i, { quiet: true });
  launch(i);
});

function move(d){
  const vis = visible();
  if (!vis.length) return;
  if (vis.indexOf(cur) === -1){ select(vis[0]); return; }
  let k = cur + d;
  while (k >= 0 && k < N && tiles[k].classList.contains('off')) k += d > 0 ? 1 : -1;
  if (k >= 0 && k < N) select(k);
  if (document.activeElement && document.activeElement.classList.contains('tile')) tiles[cur].focus({ preventScroll: true });
  if (MOBILE.matches) tiles[cur].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
document.addEventListener('keydown', (e) => {
  if (e.target === q){
    if (e.key === 'Escape'){ q.value = ''; applyFilter(); q.blur(); }
    else if (e.key === 'Enter' || e.key === 'ArrowDown'){ e.preventDefault(); q.blur(); const v = visible(); if (v.length) select(v[0]); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const ae = document.activeElement;
  const onControl = ae && ae !== document.body && (ae.tagName === 'A' || ae.tagName === 'BUTTON');
  switch (e.key){
    case 'ArrowRight': e.preventDefault(); move(1); break;
    case 'ArrowLeft': e.preventDefault(); move(-1); break;
    case 'ArrowDown': e.preventDefault(); move(cols()); break;
    case 'ArrowUp': e.preventDefault(); move(-cols()); break;
    case 'Enter': if (!onControl){ e.preventDefault(); launch(cur); } break;
    case 'r': case 'R': random(); break;
    case '/': e.preventDefault(); q.focus(); break;
    case 'Escape':
      verPanel.classList.remove('open'); verBtn.setAttribute('aria-expanded', 'false');
      if (q.value || filter !== 'ALL'){ q.value = ''; filtersEl.firstChild.click(); }
      break;
  }
});

/* ---------------------------------------------------------------- version menu */
const verBtn = $('#ver'), verPanel = $('#verPanel');
(function buildVer(){
  const V = window.VARIANTS || [];
  const curId = window.VARIANT_CURRENT || 'v3';
  verPanel.innerHTML = '<h5>LANDING PAGE VERSIONS</h5>';
  V.forEach((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    if (v.id === curId) b.className = 'cur';
    b.innerHTML = '<b>' + esc(v.id) + '</b>' + esc(v.name);
    b.addEventListener('click', () => window.VARIANT_GO && window.VARIANT_GO(v.id));
    verPanel.appendChild(b);
  });
  const a = document.createElement('a');
  a.href = '../v2/index.html';
  a.textContent = 'FULL GALLERY →';
  verPanel.appendChild(a);
})();
verBtn.addEventListener('click', () => {
  const open = !verPanel.classList.contains('open');
  verPanel.classList.toggle('open', open);
  verBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('pointerdown', (e) => {
  if (!verPanel.classList.contains('open') || verPanel.contains(e.target) || verBtn.contains(e.target)) return;
  verPanel.classList.remove('open');
  verBtn.setAttribute('aria-expanded', 'false');
});

/* ---------------------------------------------------------------- phone: hero shrinks as you scroll */
function onScroll(){
  if (!MOBILE.matches){ hero.style.removeProperty('--hh'); hero.classList.remove('compact'); return; }
  const vh = innerHeight;
  const full = vh * 0.54, min = Math.max(250, vh * 0.36);
  const h = Math.max(min, full - scrollY * 0.7);
  hero.style.setProperty('--hh', h + 'px');
  hero.classList.toggle('compact', h < full - 60);
}
addEventListener('scroll', onScroll, { passive: true });

/* ---------------------------------------------------------------- boot */
stagger();
applyFilter();
const saved = ls.get(SEL_KEY);
const start = Math.max(0, G.findIndex((g) => g.name === saved));
select(start, { quiet: true, mode: 'none', force: true });
firstRender = false;
onScroll();
// fonts change metrics: refit once they land
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitName(); moveCursor(); });
setTimeout(() => { body.classList.remove('intro'); moveCursor(); }, REDUCE ? 0 : 1700);
})();
