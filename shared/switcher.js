/* shared/switcher.js — the variant registry + a small floating "VER ▾" chip
   that lets visitors switch between every landing-page variant (and saves the
   choice, which the root loader then honors). Include from any depth:
     <script src="../shared/switcher.js" defer></script>
   Pages that only want the registry (e.g. the gallery) set
   <body data-no-switcher> to suppress the chip. */
(function(){
'use strict';
var src = (document.currentScript && document.currentScript.src) || 'shared/switcher.js';
var ROOT = src.slice(0, src.lastIndexOf('shared/switcher.js'));
var KEY = 'jojkos_variant';

window.VARIANTS = [
  { id:'v1',  name:'Matrix Tunnel',            blurb:'CSS-3D card tunnel in digital rain — the original.' },
  { id:'v2a', name:'Pug Playground 3D',        blurb:'Drive a pug around a neon arcade park.' },
  { id:'v2b', name:'The Studio Cut',           blurb:'Editorial type + WebGL hover reveals.' },
  { id:'v2c', name:'Matrix: Operator',         blurb:'Everything is rain. Working command line.' },
  { id:'v2d', name:'The Signal Degrades',      blurb:'Infinite draggable dithered phosphor wall.' },
  { id:'v2e', name:'Insert Coin Arcade',       blurb:'Walk a rainy pixel arcade. Insert coin.' },
  { id:'v2f', name:'Patch Notes from the Void',blurb:'Brutalist release-log zine with physics type.' },
];

function currentId(){
  var rest = location.href.slice(ROOT.length);
  var seg = rest.split(/[/?#]/)[0];
  for (var i = 0; i < VARIANTS.length; i++) if (VARIANTS[i].id === seg) return seg;
  return null;
}
window.VARIANT_CURRENT = currentId();
window.VARIANT_GO = function(id){
  try { localStorage.setItem(KEY, id); } catch (e){}
  location.href = ROOT + id + '/index.html';
};

function boot(){
  if (!document.body || document.body.hasAttribute('data-no-switcher')) return;

  var css = document.createElement('style');
  css.textContent =
    '#vswChip{position:fixed;left:12px;bottom:12px;z-index:99990;font:11px/1 ui-monospace,Menlo,monospace;' +
      'background:rgba(12,12,18,.92);color:#cfcde0;border:1px solid #4a4660;padding:10px 12px;cursor:pointer;' +
      'border-radius:6px;letter-spacing:.08em;min-height:38px;backdrop-filter:blur(3px)}' +
    '#vswChip:hover{color:#fff;border-color:#8a86ad}' +
    '#vswPanel{position:fixed;left:12px;bottom:58px;z-index:99991;width:min(320px,calc(100vw - 24px));' +
      'background:rgba(10,10,16,.97);border:1px solid #4a4660;border-radius:8px;padding:8px;display:none;' +
      'font:11px/1.5 ui-monospace,Menlo,monospace;color:#cfcde0;box-shadow:0 12px 40px rgba(0,0,0,.6)}' +
    '#vswPanel.open{display:block}' +
    '#vswPanel h5{font-size:10px;letter-spacing:.2em;color:#8a86ad;margin:4px 6px 8px;font-weight:400}' +
    '#vswPanel button.vsw{display:block;width:100%;text-align:left;background:none;border:1px solid transparent;' +
      'color:inherit;font:inherit;padding:8px 8px;cursor:pointer;border-radius:5px}' +
    '#vswPanel button.vsw:hover{background:rgba(255,255,255,.06);border-color:#4a4660}' +
    '#vswPanel button.vsw.cur{border-color:#8a86ad;background:rgba(255,255,255,.04)}' +
    '#vswPanel button.vsw b{color:#fff;font-weight:600}' +
    '#vswPanel button.vsw .bl{color:#8a86ad;display:block;font-size:10px}' +
    '#vswPanel .gal{display:block;text-align:center;color:#8a86ad;text-decoration:none;padding:8px;margin-top:4px;' +
      'border-top:1px solid #2c2a3c;font-size:10px;letter-spacing:.15em}' +
    '#vswPanel .gal:hover{color:#fff}';
  document.head.appendChild(css);

  var cur = window.VARIANT_CURRENT;
  var chip = document.createElement('button');
  chip.id = 'vswChip';
  chip.type = 'button';
  chip.setAttribute('aria-label', 'Switch page version');
  chip.textContent = 'VER ' + (cur || '?') + ' ▾';
  var panel = document.createElement('div');
  panel.id = 'vswPanel';
  panel.setAttribute('role', 'menu');
  var h = document.createElement('h5');
  h.textContent = 'LANDING PAGE VERSIONS';
  panel.appendChild(h);
  VARIANTS.forEach(function(v){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vsw' + (v.id === cur ? ' cur' : '');
    b.innerHTML = '<b>' + v.id + '</b> · ' + v.name + '<span class="bl">' + v.blurb + '</span>';
    b.addEventListener('click', function(){ window.VARIANT_GO(v.id); });
    panel.appendChild(b);
  });
  var gal = document.createElement('a');
  gal.className = 'gal';
  gal.href = ROOT + 'v2/index.html';
  gal.textContent = 'FULL GALLERY →';
  panel.appendChild(gal);

  chip.addEventListener('click', function(){ panel.classList.toggle('open'); });
  document.addEventListener('keydown', function(e){
    if (e.key !== 'v' && e.key !== 'V') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    panel.classList.toggle('open');
  });
  document.addEventListener('pointerdown', function(e){
    if (!panel.classList.contains('open')) return;
    if (panel.contains(e.target) || chip.contains(e.target)) return;
    panel.classList.remove('open');
  });

  document.body.appendChild(chip);
  document.body.appendChild(panel);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
