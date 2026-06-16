/* shared/gamelist.js — a guaranteed, consistent "ALL GAMES" launcher present on
   every landing-page variant. Sibling to shared/switcher.js: a small floating
   chip (bottom-right) that opens an overlay grid of all 14 games, fed by the
   single source of truth in shared/games.js (window.GAMES + window.TAG_COLORS).

   Include AFTER games.js, from any depth:
     <script src="../shared/games.js" defer></script>
     <script src="../shared/gamelist.js" defer></script>
   Pages that don't want the chip (e.g. the version gallery) set
   <body data-no-gamelist> to suppress it.

   Why a shared overlay: the immersive variants (arcade walk, drag-wall, command
   line) have no flat "just let me pick a game" path — this gives one everywhere,
   identically, without touching each variant's bespoke rendering. */
(function(){
'use strict';

function boot(){
  if (!document.body || document.body.hasAttribute('data-no-gamelist')) return;
  var games = window.GAMES;
  if (!games || !games.length) return;               // needs games.js loaded first
  var TAGS = window.TAG_COLORS || {};

  var css = document.createElement('style');
  css.textContent =
    '#glsChip{position:fixed;left:12px;bottom:12px;z-index:99989;font:11px/1 ui-monospace,Menlo,monospace;' +
      'background:rgba(12,12,18,.92);color:#cfcde0;border:1px solid #4a4660;padding:10px 12px;cursor:pointer;' +
      'border-radius:6px;letter-spacing:.08em;min-height:38px;backdrop-filter:blur(3px)}' +
    '#glsChip:hover{color:#fff;border-color:#8a86ad}' +
    '#glsChip .dot{color:#d6ff3f}' +
    '#glsOverlay{position:fixed;inset:0;z-index:99993;display:none;align-items:center;justify-content:center;' +
      'background:rgba(4,4,8,.78);backdrop-filter:blur(4px);padding:20px}' +
    '#glsOverlay.open{display:flex}' +
    '#glsModal{width:min(860px,100%);max-height:86vh;display:flex;flex-direction:column;' +
      'background:rgba(10,10,16,.98);border:1px solid #4a4660;border-radius:10px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.7);font:12px/1.4 ui-monospace,Menlo,monospace;color:#cfcde0;overflow:hidden}' +
    '#glsHead{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #2c2a3c}' +
    '#glsHead h5{margin:0;font-size:12px;letter-spacing:.22em;color:#fff;font-weight:600}' +
    '#glsHead .ct{color:#8a86ad;font-size:10px;letter-spacing:.15em}' +
    '#glsClose{background:none;border:1px solid #4a4660;color:#cfcde0;font:inherit;cursor:pointer;' +
      'padding:6px 10px;border-radius:5px;letter-spacing:.1em}' +
    '#glsClose:hover{color:#fff;border-color:#8a86ad}' +
    '#glsGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:16px;overflow:auto}' +
    'a.glsCard{display:flex;flex-direction:column;text-decoration:none;color:inherit;border:1px solid #2c2a3c;' +
      'border-radius:7px;overflow:hidden;background:#101016;transition:border-color .12s,transform .12s}' +
    'a.glsCard:hover{border-color:#8a86ad;transform:translateY(-2px)}' +
    'a.glsCard .thumb{aspect-ratio:16/11;background:#06060a center/cover no-repeat;border-bottom:1px solid #2c2a3c}' +
    'a.glsCard .meta{padding:8px 10px;display:flex;flex-direction:column;gap:6px}' +
    'a.glsCard .nm{font-size:12px;color:#fff;font-weight:600;letter-spacing:.02em}' +
    'a.glsCard .tg{align-self:flex-start;font-size:9px;letter-spacing:.16em;padding:2px 7px;border-radius:3px;' +
      'color:#06060a;font-weight:700}' +
    '#glsFoot{padding:10px 16px;border-top:1px solid #2c2a3c;color:#55534b;font-size:10px;letter-spacing:.08em;text-align:center}';
  document.head.appendChild(css);

  var chip = document.createElement('button');
  chip.id = 'glsChip';
  chip.type = 'button';
  chip.setAttribute('aria-label', 'Browse all games');
  chip.innerHTML = '<span class="dot">◉</span> ' + games.length + ' GAMES';

  var overlay = document.createElement('div');
  overlay.id = 'glsOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'All games');

  var modal = document.createElement('div');
  modal.id = 'glsModal';
  var head = document.createElement('div');
  head.id = 'glsHead';
  head.innerHTML = '<h5>ALL GAMES <span class="ct">&middot; ' + games.length + ' playable</span></h5>';
  var close = document.createElement('button');
  close.id = 'glsClose';
  close.type = 'button';
  close.textContent = 'CLOSE ✕';
  head.appendChild(close);

  var grid = document.createElement('div');
  grid.id = 'glsGrid';
  games.forEach(function(g){
    var a = document.createElement('a');
    a.className = 'glsCard';
    a.href = g.url;
    a.target = '_blank';
    a.rel = 'noopener';

    var thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.style.backgroundImage = 'url("' + g.img + '")';   // set via DOM, not an attribute

    var meta = document.createElement('span');
    meta.className = 'meta';
    var nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = g.name;
    var tg = document.createElement('span');
    tg.className = 'tg';
    tg.textContent = g.tag;
    tg.style.background = TAGS[g.tag] || '#8a86ad';
    meta.appendChild(nm);
    meta.appendChild(tg);

    a.appendChild(thumb);
    a.appendChild(meta);
    grid.appendChild(a);
  });

  var foot = document.createElement('div');
  foot.id = 'glsFoot';
  foot.textContent = 'press G to toggle · opens in a new tab';

  modal.appendChild(head);
  modal.appendChild(grid);
  modal.appendChild(foot);
  overlay.appendChild(modal);

  function setOpen(open){ overlay.classList.toggle('open', open); }
  function toggle(){ setOpen(!overlay.classList.contains('open')); }

  chip.addEventListener('click', toggle);
  close.addEventListener('click', function(){ setOpen(false); });
  overlay.addEventListener('click', function(e){ if (e.target === overlay) setOpen(false); });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && overlay.classList.contains('open')) { setOpen(false); return; }
    if (e.key !== 'g' && e.key !== 'G') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    toggle();
  });

  document.body.appendChild(chip);
  document.body.appendChild(overlay);

  // Dock the games chip directly to the right of the VER switcher chip. The
  // switcher boots right after this script and appends its chip, so we can't
  // measure it synchronously — watch for it and dock the moment it appears
  // (plus retries), rather than a single timer that can miss and leave the two
  // chips stacked on the same spot (which hid the version picker underneath).
  // If the switcher is absent (data-no-switcher), the chip just stays bottom-left.
  function place(){
    var ver = document.getElementById('vswChip');
    if (ver && ver.offsetWidth) { chip.style.left = (ver.offsetLeft + ver.offsetWidth + 8) + 'px'; return true; }
    return false;
  }
  if (!place() && typeof MutationObserver === 'function'){
    var obs = new MutationObserver(function(){ if (place()) obs.disconnect(); });
    obs.observe(document.body, { childList: true });
    setTimeout(function(){ obs.disconnect(); }, 5000);   // stop watching eventually
  }
  window.addEventListener('load', place);
  window.addEventListener('resize', place);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
