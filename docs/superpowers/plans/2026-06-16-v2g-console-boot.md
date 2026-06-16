# v2g "Console Boot" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new landing-page variant `v2g/` — an award-winning, animation-rich games portal in the overflow.sui.io grammar (boot/POST screen, isometric keycap hero with demo cursors + hover reactions, pinned scroll-scrubbed manifesto, light→dark theme inversion, games-as-cartridges staggered grid, sticky active-section nav).

**Architecture:** Static, no-build variant folder (`index.html` + `style.css` + `boot.js`) reusing `window.GAMES`/`window.TAG_COLORS`/`window.SITE` from `shared/games.js`. One conductor module (`boot.js`) builds the boot sequence and games grid from data, then wires Lenis + GSAP (ScrollTrigger/SplitText/ScrambleText/CustomEase/Flip) timelines act-by-act. Theme inversion is two fixed background layers (`#bgFill` solid color, `#bgGrid` blueprint lines) whose colors GSAP scrubs across Act 2, plus an `is-dark` body class for text. Reduced-motion / no-JS / touch each have explicit fallbacks.

**Tech Stack:** Vanilla JS (no build), GSAP 3.13.0 + plugins (ScrollTrigger, SplitText, ScrambleTextPlugin, CustomEase, Flip), Lenis 1.3.1, CSS 3D transforms, JetBrains Mono. All via jsdelivr CDN.

---

## Conventions used across all tasks

**Element IDs (the shared contract — keep names exact):**
`#boot #bootLog #bootBar #stage #hero #heroTitle #heroSub #playBtn #indexBtn #keys #demoArrow #demoHand #insert #manifesto #bay #grid #nav #cursor #bgFill #bgGrid #footer`

**`boot.js` function contract (defined progressively, names must stay stable):**
`prefersReduced()`, `init()`, `buildBoot()`, `runBoot()`, `revealHero()`, `initKeycaps()`, `demoLoop()`, `bindHeroHover()`, `initInsert()`, `buildBay()`, `bindTileHover(tile)`, `initFilter()`, `initNav()`, `initCursor()`.

**Verification model (no test runner exists):** each task's verify step = serve the site, load `/v2g/`, confirm **zero console errors** (the in-page error overlay will also flash red on any throw), and eyeball the checkpoint. Do NOT rely on headless screenshots — the human reviews visually between tasks.

**Local serve (run once, leave running):**
```bash
cd /Users/jonas/Work/vibeGames && python3 -m http.server 8000
# open http://localhost:8000/v2g/   (trailing slash matters)
```

---

## Task 1: Scaffold the variant + register it

**Files:**
- Create: `v2g/index.html`
- Create: `v2g/style.css` (empty placeholder this task)
- Create: `v2g/boot.js` (empty placeholder this task)
- Modify: `shared/switcher.js` (add v2g to `window.VARIANTS`)

- [ ] **Step 1: Create `v2g/style.css` and `v2g/boot.js` as empty files**

```bash
touch v2g/style.css v2g/boot.js
```

- [ ] **Step 2: Create `v2g/index.html` with the full skeleton, CDN scripts, fallback, and shared includes**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CONSOLE BOOT — JOJKOS GAMES</title>
<meta name="description" content="Boot a game console and step into the cartridge bay. 14 playable experiments by jojko, loaded and ready. No installs.">
<meta name="theme-color" content="#0a0a0f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap">
<link rel="stylesheet" href="style.css">
<script>
  // Crash overlay (mirrors other variants) — surfaces any runtime error loudly.
  window.addEventListener('error', function(e){
    var div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;background:#ff2d55;color:#fff;padding:18px;border:2px solid #000;z-index:999999;font:12px/1.4 monospace;white-space:pre-wrap';
    div.textContent = 'ERROR IN V2G:\n' + e.message + '\n' + e.filename + ' [' + e.lineno + ':' + e.colno + ']\n\n' + (e.error ? e.error.stack : '');
    (document.body || document.documentElement).appendChild(div);
  });
  document.documentElement.classList.add('has-js');
</script>
<!-- GSAP core + plugins, then Lenis. All free in 3.13. -->
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrambleTextPlugin.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/CustomEase.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/Flip.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/lenis@1.3.1/dist/lenis.min.js"></script>
</head>
<body>

<!-- fixed background layers (theme inversion happens here) -->
<div id="bgFill" aria-hidden="true"></div>
<div id="bgGrid" aria-hidden="true"></div>

<!-- BOOT / POST overlay (js builds its contents) -->
<div id="boot" class="js-only" aria-hidden="true">
  <pre id="bootLog"></pre>
  <div id="bootBar"></div>
</div>

<main id="stage">

  <!-- ACT 1 — HERO -->
  <section id="hero" class="act" data-section="BOOT">
    <div class="hero-copy">
      <h1 id="heroTitle">JOJKOS GAMES</h1>
      <p id="heroSub">INSERT CARTRIDGE TO PLAY · <span class="mono">&lt;count&gt;14 LOADED&lt;/count&gt;</span></p>
      <div class="hero-actions">
        <button id="playBtn" type="button">PLAY ▸</button>
        <button id="indexBtn" type="button">INDEX</button>
      </div>
    </div>
    <div class="hero-art">
      <div id="keys" aria-hidden="true"></div>
    </div>
  </section>

  <!-- ACT 2 — INSERT (pinned scrub) -->
  <section id="insert" class="act" data-section="ABOUT">
    <div id="manifesto">
      <p>A personal portal to a pile of playable experiments. Everything here was made for the joy of making it, then left out where you can press the buttons. Pick a cartridge.</p>
      <p class="mono">14 cartridges · all free · no installs</p>
    </div>
  </section>

  <!-- ACT 3 — CARTRIDGE BAY (js fills #grid from GAMES) -->
  <section id="bay" class="act" data-section="LIBRARY">
    <h2 class="bay-head">CARTRIDGE BAY</h2>
    <div id="grid"></div>
  </section>

  <!-- ACT 4 — FOOTER -->
  <footer id="footer">
    <p class="mono">&gt; SYSTEM HALTED · 14/14 CARTRIDGES MOUNTED</p>
    <a id="coffee" href="https://buymeacoffee.com/jojkos" target="_blank" rel="noopener">☕ Buy me a coffee</a>
  </footer>

</main>

<!-- sticky bottom nav (js wires active-section + filters) -->
<nav id="nav" class="js-only" aria-label="sections"></nav>

<!-- custom cursor -->
<div id="cursor" class="js-only" aria-hidden="true"></div>

<!-- NO-JS / SEO fallback: real links to every game -->
<noscript>
  <ul id="fallback">
    <li><a href="https://zoopaloola.vercel.app/">Zoopaloola</a></li>
    <li><a href="https://factorio-lamp-editor.vercel.app/">Factorio Lamp Editor</a></li>
    <li><a href="https://lol-fusion.vercel.app/">LoL Fusion loldle</a></li>
    <li><a href="https://pug-fiesta.vercel.app/">Pug Fiesta</a></li>
    <li><a href="https://pug-fiesta3-d.vercel.app/">Pug Fiesta 3D</a></li>
    <li><a href="https://combatarena.onrender.com/">Combat Arena</a></li>
    <li><a href="../bluff/index.html">Bluff Helper</a></li>
    <li><a href="https://calendar-puzzle2.vercel.app/">Calendar Puzzle</a></li>
    <li><a href="../pokemonShooter/index.html">Pokemon Shooter</a></li>
    <li><a href="../tralalaGame/index.html">Tralala Clicker</a></li>
    <li><a href="../lolWheel/index.html">LoL Wheel</a></li>
    <li><a href="../neonDrifter/index.html">Neon Drifter</a></li>
    <li><a href="../guitarTuner/index.html">Guitar Tuner</a></li>
    <li><a href="https://okcorral.onrender.com/">OK Corral</a></li>
  </ul>
</noscript>

<script src="../shared/games.js" defer></script>
<script src="../shared/gamelist.js" defer></script>
<script src="boot.js" defer></script>
<script src="../shared/switcher.js" defer></script>
</body>
</html>
```

- [ ] **Step 3: Register the variant in `shared/switcher.js`**

Add this object to the end of the `window.VARIANTS = [ ... ]` array (after the `v2f` entry):

```javascript
  { id:'v2g', name:'Console Boot',             blurb:'Boot a game console; the bay fills with playable cartridges.' },
```

Also update `var VALID` in `/index.html` root loader to include `'v2g'`:
```javascript
  var VALID = ['v1','v2a','v2b','v2c','v2d','v2e','v2f','v2g'];
```

- [ ] **Step 4: Verify in browser**

Serve and open `http://localhost:8000/v2g/`. Expected: page loads with the boot overlay (empty), hero text "JOJKOS GAMES", placeholder sections; **zero console errors**; GSAP + Lenis are defined (`window.gsap`, `window.Lenis` in console). The VER switcher chip lists "Console Boot".

- [ ] **Step 5: Commit**

```bash
git add v2g/index.html v2g/style.css v2g/boot.js shared/switcher.js index.html
git commit -m "feat(v2g): scaffold Console Boot variant + register in switcher"
```

---

## Task 2: Theme system, blueprint grid, base layout & type

**Files:**
- Modify: `v2g/style.css`

- [ ] **Step 1: Write the full base stylesheet**

```css
/* v2g — Console Boot. Two themes via CSS vars; JS scrubs bg layer colors in Act 2. */
:root{
  --paper:#f3f1 ea; --ink:#0a0a0f; --grid-light:#c9d4ff;
  --bg-dark:#0a0a0f; --text-dark:#eceaf5; --grid-dark:#1c2233;
  --accent:#3d7bff;                 /* recolored per active section by JS */
  --ease-of:cubic-bezier(.16,1,.3,1);
  --pad:clamp(20px,5vw,80px);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;
  color:var(--ink); background:var(--bg-dark);
  -webkit-font-smoothing:antialiased; overflow-x:hidden;
}
body.is-dark{color:var(--text-dark)}
.mono{font-variant-ligatures:none;letter-spacing:.02em}
.js-only{display:none}
.has-js .js-only{display:block}

/* fixed background layers */
#bgFill{position:fixed;inset:0;z-index:-2;background:var(--paper)}
#bgGrid{position:fixed;inset:0;z-index:-1;pointer-events:none;
  background-image:
    linear-gradient(var(--grid-light) 1px,transparent 1px),
    linear-gradient(90deg,var(--grid-light) 1px,transparent 1px);
  background-size:48px 48px; opacity:.5; transition:opacity .4s}

/* acts */
.act{position:relative;min-height:100vh;padding:var(--pad);
  display:flex;flex-direction:column;justify-content:center}
#stage{position:relative;z-index:1}

/* hero */
#hero{display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:center}
#heroTitle{font-size:clamp(48px,9vw,140px);line-height:.92;font-weight:800;
  margin:0;letter-spacing:-.02em;text-transform:uppercase}
#heroSub{font-size:clamp(13px,1.4vw,18px);margin:18px 0 28px;opacity:.8}
.hero-actions{display:flex;gap:14px;flex-wrap:wrap}
#playBtn,#indexBtn{font:inherit;font-weight:700;cursor:pointer;
  padding:16px 28px;border:2px solid currentColor;background:var(--ink);color:#fff;
  letter-spacing:.04em;transition:transform .2s var(--ease-of)}
#indexBtn{background:transparent;color:inherit}
.hero-art{position:relative;height:60vh;min-height:380px}

/* insert / manifesto */
#manifesto{max-width:680px;margin:0 auto;font-size:clamp(20px,3vw,40px);
  font-weight:700;line-height:1.3}
#manifesto .mono{display:block;font-size:.5em;font-weight:400;margin-top:1em;opacity:.7}

/* bay */
.bay-head{font-size:clamp(28px,5vw,72px);font-weight:800;text-transform:uppercase;
  margin:0 0 var(--pad)}
#grid{display:grid;grid-template-columns:repeat(6,1fr);gap:18px}

/* footer */
#footer{align-items:center;text-align:center;gap:18px;min-height:60vh}
#footer a{color:var(--accent);font-weight:700;text-decoration:none}

@media (max-width:860px){
  #hero{grid-template-columns:1fr}
  .hero-art{height:46vh}
  #grid{grid-template-columns:repeat(2,1fr)}
}

/* reduced motion: everything visible & static (JS also branches) */
@media (prefers-reduced-motion:reduce){
  #boot{display:none!important}
  *{animation:none!important}
}
```

- [ ] **Step 2: Verify in browser**

Reload `/v2g/`. Expected: light "paper" background with a blue blueprint grid, big uppercase hero title on the left, empty art box on the right, two buttons, the manifesto and "CARTRIDGE BAY" heading visible below. No console errors.

- [ ] **Step 3: Commit**

```bash
git add v2g/style.css
git commit -m "feat(v2g): theme vars, blueprint grid, base layout & typography"
```

---

## Task 3: boot.js bootstrap — Lenis, GSAP registration, CustomEase, reduced-motion guard

**Files:**
- Modify: `v2g/boot.js`

- [ ] **Step 1: Write the module bootstrap**

```javascript
/* v2g/boot.js — conductor. Builds boot sequence + games grid from window.GAMES,
   then wires Lenis + GSAP timelines act by act. */
(function(){
  'use strict';

  function prefersReduced(){
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  }
  var isTouch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
  var REDUCED = prefersReduced();

  var lenis = null;

  function setupScroll(){
    if (REDUCED || !window.Lenis) return;            // native scroll under reduced-motion
    lenis = new Lenis({ duration:1.1, smoothWheel:true });
    function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    if (window.ScrollTrigger){
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function(time){ lenis.raf(time*1000); });
      gsap.ticker.lagSmoothing(0);
    }
  }

  function init(){
    if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    if (window.gsap && window.SplitText) gsap.registerPlugin(SplitText);
    if (window.gsap && window.ScrambleTextPlugin) gsap.registerPlugin(ScrambleTextPlugin);
    if (window.gsap && window.Flip) gsap.registerPlugin(Flip);
    if (window.gsap && window.CustomEase){
      gsap.registerPlugin(CustomEase);
      CustomEase.create('of', 'M0,0 C0.16,1 0.3,1 1,1');   // the page-wide motion signature
    }
    setupScroll();

    buildBay();          // build grid from data first (needed even in reduced mode)
    if (REDUCED){ document.body.classList.add('is-dark'); return; }  // skip all choreography
    buildBoot();
    runBoot();           // runBoot() -> revealHero() -> the rest
  }

  // --- stubs filled in by later tasks ---
  function buildBoot(){}
  function runBoot(){ revealHero(); }
  function revealHero(){}
  function buildBay(){}

  // expose for later tasks within this IIFE scope via hoisting; kick off on DOM ready
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
  function boot(){
    // GAMES is loaded via shared/games.js (defer, before this file). Guard anyway.
    if (!window.GAMES){ return setTimeout(boot, 30); }
    init();
  }
})();
```

- [ ] **Step 2: Verify in browser**

Reload `/v2g/`. Expected: no console errors; in console, typing `gsap.parseEase('of')` returns a function (CustomEase registered). Page still static (stubs are empty). Lenis active (scroll feels smooth/inertial).

- [ ] **Step 3: Commit**

```bash
git add v2g/boot.js
git commit -m "feat(v2g): boot.js bootstrap — Lenis+GSAP wiring, CustomEase, reduced-motion guard"
```

---

## Task 4: The BOOT / POST sequence (Act 1 intro)

**Files:**
- Modify: `v2g/boot.js` (replace `buildBoot` / `runBoot`)
- Modify: `v2g/style.css` (append boot styles)

- [ ] **Step 1: Append boot overlay styles to `v2g/style.css`**

```css
/* boot / POST overlay */
#boot{position:fixed;inset:0;z-index:50;background:var(--paper);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}
#bootLog{font-size:clamp(12px,1.6vw,16px);line-height:1.7;margin:0;
  min-width:min(560px,82vw);color:var(--ink);white-space:pre}
#bootBar{display:flex;gap:4px}
#bootBar i{width:14px;height:30px;background:var(--ink);opacity:.12;border-radius:2px}
#bootBar i.on{opacity:1}
```

- [ ] **Step 2: Replace the `buildBoot` and `runBoot` stubs in `boot.js`**

```javascript
  function buildBoot(){
    var bar = document.getElementById('bootBar');
    for (var i=0;i<window.GAMES.length;i++){ bar.appendChild(document.createElement('i')); }
  }

  function runBoot(){
    var log = document.getElementById('bootLog');
    var segs = document.querySelectorAll('#bootBar i');
    var n = window.GAMES.length;
    var lines = [
      '> POWER ON SELF TEST ............ OK',
      '> RENDER PIPELINE ............... OK',
      '> MOUNTING CARTRIDGES [' + n + ']',
    ];
    var tl = gsap.timeline({ defaults:{ ease:'of' } });
    log.textContent = '';
    // reveal header lines, then fill one segment per game with a live %, then READY
    lines.forEach(function(line){
      tl.add(function(){ log.textContent += line + '\n'; }, '+=0.18');
    });
    for (var i=0;i<n;i++){
      (function(idx){
        tl.add(function(){
          segs[idx].classList.add('on');
          // live percent on the last log line
          var pct = Math.round(((idx+1)/n)*100);
          log.textContent = lines.join('\n') + '\n> LOADING ' + pct + '%';
        }, '+=0.05');
      })(i);
    }
    tl.add(function(){ log.textContent += '\n> READY'; }, '+=0.15');
    // hand off to hero
    tl.to('#boot', { duration:0.6, yPercent:-100, ease:'of' }, '+=0.35');
    tl.add(function(){ document.getElementById('boot').style.display='none'; });
    tl.add(revealHero, '<');
  }
```

- [ ] **Step 3: Verify in browser**

Reload `/v2g/`. Expected: boot overlay shows POST lines typing on, the 14-segment bar fills left→right with a live `LOADING %`, ends `> READY`, then the panel slides up off-screen revealing the hero. No console errors. (Reload with `prefers-reduced-motion` set in OS → boot is skipped, hero shows immediately on a dark bay.)

- [ ] **Step 4: Commit**

```bash
git add v2g/boot.js v2g/style.css
git commit -m "feat(v2g): boot/POST sequence with per-game segmented progress bar"
```

---

## Task 5: Hero reveal — scramble title, SplitText subhead, magnetic PLAY button

**Files:**
- Modify: `v2g/boot.js` (replace `revealHero`, add magnetic helper + button actions)

- [ ] **Step 1: Replace the `revealHero` stub and add helpers**

```javascript
  function magnetic(el, strength){
    if (isTouch) return;
    var s = strength || 0.4;
    el.addEventListener('mousemove', function(e){
      var r = el.getBoundingClientRect();
      gsap.to(el, { duration:0.4, ease:'of',
        x:(e.clientX-(r.left+r.width/2))*s, y:(e.clientY-(r.top+r.height/2))*s });
    });
    el.addEventListener('mouseleave', function(){ gsap.to(el,{duration:0.5,ease:'of',x:0,y:0}); });
  }

  function revealHero(){
    var title = document.getElementById('heroTitle');
    var tl = gsap.timeline({ defaults:{ ease:'of' } });
    // scramble the title in
    if (window.ScrambleTextPlugin){
      var finalText = title.textContent;
      tl.to(title, { duration:1.1, scrambleText:{ text:finalText, chars:'upperCase', speed:0.5 } });
    }
    // split + stagger the subhead and actions
    if (window.SplitText){
      var split = new SplitText('#heroSub', { type:'words' });
      tl.from(split.words, { duration:0.5, y:14, opacity:0, stagger:0.03 }, '-=0.4');
    }
    tl.from('.hero-actions > *', { duration:0.5, y:18, opacity:0, stagger:0.08 }, '-=0.2');
    tl.add(initKeycaps, '-=0.6');   // keycaps animate in alongside

    // button actions
    var play = document.getElementById('playBtn');
    var index = document.getElementById('indexBtn');
    magnetic(play, 0.5); magnetic(index, 0.4);
    play.addEventListener('click', function(){ scrollToEl('#bay'); });
    index.addEventListener('click', function(){
      if (window.GAMELIST && window.GAMELIST.open) return window.GAMELIST.open();  // shared overlay if present
      scrollToEl('#bay');
    });
  }

  function scrollToEl(sel){
    var el = document.querySelector(sel);
    if (lenis) lenis.scrollTo(el, { duration:1.2 });
    else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  }
```

Add `initKeycaps` stub near the other stubs (it gets implemented in Task 6):
```javascript
  function initKeycaps(){}
```

- [ ] **Step 2: Verify in browser**

Reload `/v2g/`. Expected: after boot, the title scrambles into "JOJKOS GAMES", subhead words stagger in, buttons fade up. Hovering PLAY/INDEX makes them follow the cursor (magnetic) and snap back. Clicking PLAY smooth-scrolls to the bay. No console errors.

- [ ] **Step 3: Commit**

```bash
git add v2g/boot.js
git commit -m "feat(v2g): hero reveal — scramble title, split subhead, magnetic buttons"
```

---

## Task 6: Isometric keycap hero (CSS 3D, spells PLAY)

**Files:**
- Modify: `v2g/style.css` (append keycap styles)
- Modify: `v2g/boot.js` (replace `initKeycaps`)

- [ ] **Step 1: Append keycap 3D styles to `v2g/style.css`**

```css
/* isometric keycap cluster */
#keys{position:absolute;inset:0;perspective:1200px;
  transform-style:preserve-3d}
.keycap{position:absolute;width:120px;height:120px;
  transform-style:preserve-3d;cursor:pointer;
  /* isometric tilt of the whole cap */
  transform:rotateX(55deg) rotateZ(-45deg) translateZ(0)}
.keycap .top{position:absolute;inset:0;border-radius:14px;
  background:var(--cap);border:3px solid #0a0a0f;
  display:flex;align-items:center;justify-content:center;
  font-size:54px;font-weight:800;color:#0a0a0f;
  transform:translateZ(34px)}
.keycap .side{position:absolute;inset:0;border-radius:14px;background:#0a0a0f}
.keycap.pressed .top{transform:translateZ(10px)}
@media (max-width:860px){ .keycap{width:84px;height:84px} .keycap .top{font-size:36px} }
```

- [ ] **Step 2: Replace `initKeycaps` in `boot.js`**

```javascript
  function initKeycaps(){
    var host = document.getElementById('keys');
    var caps = [
      { ch:'P', cap:'#9b5cff', x:8,  y:6  },
      { ch:'L', cap:'#ff9a3c', x:34, y:30 },
      { ch:'A', cap:'#3dff7a', x:58, y:10 },
      { ch:'Y', cap:'#3d7bff', x:78, y:40 },
    ];
    caps.forEach(function(c, i){
      var el = document.createElement('div');
      el.className = 'keycap';
      el.style.cssText = '--cap:'+c.cap+';left:'+c.x+'%;top:'+c.y+'%';
      el.dataset.depth = String(0.6 + i*0.25);
      el.innerHTML = '<div class="side"></div><div class="top">'+c.ch+'</div>';
      host.appendChild(el);
    });
    var capsEls = host.querySelectorAll('.keycap');
    // animate in (drop + settle), staggered
    gsap.from(capsEls, { duration:0.8, ease:'of', y:-120, opacity:0,
      stagger:0.08, rotateZ:-90 });

    // whole-cluster parallax to pointer (desktop only)
    if (!isTouch){
      window.addEventListener('mousemove', function(e){
        var rx = (e.clientY/window.innerHeight - 0.5)*-10;
        var ry = (e.clientX/window.innerWidth - 0.5)*14;
        gsap.to(host, { duration:0.6, ease:'of', rotateX:rx, rotateY:ry });
      });
    }
    initCursor();         // custom cursor (Task 12) — safe stub until then
    demoLoop();           // start the teach loop (Task 7)
    bindHeroHover();      // real hover handoff (Task 7)
  }
```

Add stubs (implemented in later tasks) near the other stubs:
```javascript
  function demoLoop(){}
  function bindHeroHover(){}
  function initCursor(){}
```

- [ ] **Step 3: Verify in browser**

Reload `/v2g/`. Expected: four isometric keycaps spelling P-L-A-Y drop into the hero art area at varied positions/colors and settle; moving the mouse subtly parallax-tilts the whole cluster. No console errors.

- [ ] **Step 4: Commit**

```bash
git add v2g/style.css v2g/boot.js
git commit -m "feat(v2g): isometric CSS-3D keycap hero spelling PLAY with pointer parallax"
```

---

## Task 7: Demo cursors (teach loop) + real hover handoff + click

**Files:**
- Modify: `v2g/style.css` (append cursor sprite styles)
- Modify: `v2g/boot.js` (replace `demoLoop`, `bindHeroHover`)

- [ ] **Step 1: Append demo-cursor styles to `v2g/style.css`**

```css
/* demo cursor sprites (CSS-drawn, no images) */
#demoArrow,#demoHand{position:absolute;z-index:6;pointer-events:none;
  width:26px;height:26px;will-change:transform;transition:opacity .3s}
#demoArrow{ /* classic arrow via clip-path */
  background:#fff;filter:drop-shadow(2px 2px 0 #0a0a0f);
  clip-path:polygon(0 0,0 75%,28% 55%,45% 90%,62% 82%,46% 48%,80% 48%)}
#demoHand{font-size:24px;line-height:1}
#demoHand::after{content:'👆'}
.demo-hidden{opacity:0!important}
```

- [ ] **Step 2: Inject the cursor sprites and implement `demoLoop` + `bindHeroHover` in `boot.js`**

Replace the `demoLoop` and `bindHeroHover` stubs with:

```javascript
  var demoTween = null, demoIdle = null;

  function demoLoop(){
    var host = document.getElementById('keys');
    var caps = host.querySelectorAll('.keycap');
    if (!caps.length) return;
    var arrow = document.createElement('div'); arrow.id = 'demoArrow';
    host.appendChild(arrow);

    function capCenter(cap){
      var hr = host.getBoundingClientRect(), cr = cap.getBoundingClientRect();
      return { x: cr.left-hr.left + cr.width/2, y: cr.top-hr.top + cr.height/2 };
    }
    var tl = gsap.timeline({ repeat:-1, repeatDelay:0.6, defaults:{ ease:'of' } });
    caps.forEach(function(cap){
      var c = capCenter(cap);
      tl.to(arrow, { duration:0.7, x:c.x, y:c.y });
      tl.add(function(){ cap.classList.add('pressed'); });   // press
      tl.to(arrow, { duration:0.12, scale:0.85 });
      tl.to(arrow, { duration:0.18, scale:1 });
      tl.add(function(){ cap.classList.remove('pressed'); });
      tl.to({}, { duration:0.25 });
    });
    demoTween = tl;
  }

  function bindHeroHover(){
    var host = document.getElementById('keys');
    var caps = host.querySelectorAll('.keycap');
    if (!caps.length) return;

    function pauseDemo(){
      if (demoTween) demoTween.pause();
      var a = document.getElementById('demoArrow'); if (a) a.classList.add('demo-hidden');
    }
    function resumeDemoSoon(){
      clearTimeout(demoIdle);
      demoIdle = setTimeout(function(){
        var a = document.getElementById('demoArrow'); if (a) a.classList.remove('demo-hidden');
        if (demoTween) demoTween.restart();
      }, 1600);
    }

    caps.forEach(function(cap){
      cap.addEventListener('mouseenter', function(){
        pauseDemo();
        cap.classList.add('pressed');
        gsap.to(cap, { duration:0.3, ease:'of', scale:1.06 });
        // neighbors lift slightly
        caps.forEach(function(o){ if(o!==cap) gsap.to(o,{duration:0.3,ease:'of',scale:1.02}); });
      });
      cap.addEventListener('mouseleave', function(){
        cap.classList.remove('pressed');
        gsap.to(caps, { duration:0.4, ease:'of', scale:1 });
        resumeDemoSoon();
      });
      cap.addEventListener('click', function(){
        cap.classList.add('pressed');
        gsap.fromTo(cap, {scale:0.92}, {duration:0.4, ease:'of', scale:1,
          onComplete:function(){ cap.classList.remove('pressed'); }});
        scrollToEl('#bay');   // keycaps ARE the PLAY action
      });
    });
    if (isTouch){
      // touch: keep the teach loop running; tap presses + scrolls
      return;
    }
    host.addEventListener('mouseleave', resumeDemoSoon);
  }
```

- [ ] **Step 3: Verify in browser**

Reload `/v2g/`. Expected: an arrow cursor sprite glides between keycaps, pressing each in turn (the teach loop). When you move your real mouse over a keycap, the demo pauses, that cap depresses + scales, neighbors lift; leaving resumes the demo after ~1.6s. Clicking a keycap scrolls to the bay. On a touch device the loop keeps running and tapping scrolls. No console errors.

- [ ] **Step 4: Commit**

```bash
git add v2g/style.css v2g/boot.js
git commit -m "feat(v2g): keycap demo-cursor teach loop + real hover handoff + click-to-play"
```

---

## Task 8: Act 2 — pinned manifesto, scroll-scrubbed word reveal, theme cross-fade

**Files:**
- Modify: `v2g/boot.js` (implement `initInsert`, call it from `revealHero` tail)
- Modify: `v2g/style.css` (append insert/pin styles)

- [ ] **Step 1: Append styles for the pinned section**

```css
#insert{justify-content:center;align-items:center;text-align:center}
#insert .word{opacity:.18}      /* faded until scrubbed in */
```

- [ ] **Step 2: Implement `initInsert` and call it**

Replace the `initInsert` stub (add one near the other stubs if absent) with:

```javascript
  function initInsert(){
    if (!window.ScrollTrigger) return;
    // split manifesto into words for the scrubbed reveal
    var split = window.SplitText ? new SplitText('#manifesto p:first-child', { type:'words' }) : null;
    var words = split ? split.words : [];
    words.forEach(function(w){ w.classList.add('word'); });

    // pin the section and scrub word opacity 0.18 -> 1 across its scroll
    gsap.timeline({ scrollTrigger:{
        trigger:'#insert', start:'top top', end:'+=120%', pin:true, scrub:true } })
      .to(words, { opacity:1, stagger:0.4, ease:'none' });

    // theme cross-fade: light paper -> dark bay, scrubbed across the same section
    gsap.timeline({ scrollTrigger:{
        trigger:'#insert', start:'top 60%', end:'bottom top', scrub:true,
        onEnter:function(){}, onLeave:function(){ document.body.classList.add('is-dark'); },
        onEnterBack:function(){ document.body.classList.remove('is-dark'); } } })
      .to('#bgFill', { backgroundColor:'#0a0a0f', ease:'none' }, 0)
      .to('#bgGrid', { '--grid-light':'#1c2233', ease:'none' }, 0);
  }
```

Wire it in: at the end of `revealHero`'s timeline (after `initKeycaps`), add a call once hero is set up. Simplest: append to the end of `revealHero` function body:
```javascript
    initInsert();
    initNav();    // Task 12 (safe stub until then)
```

Add stub if not present:
```javascript
  function initNav(){}
```

- [ ] **Step 3: Verify in browser**

Reload `/v2g/` and scroll past the hero. Expected: the manifesto section pins; its words go from faded to solid as you scroll (the Sui effect); the background cross-fades from light paper/blue-grid to near-black/dark-grid; `body.is-dark` flips text to light entering the bay. Scrolling back up reverses it. No console errors.

- [ ] **Step 4: Commit**

```bash
git add v2g/boot.js v2g/style.css
git commit -m "feat(v2g): Act 2 pinned manifesto with scrubbed word reveal + theme inversion"
```

---

## Task 9: Act 3 — build the cartridge bay grid from GAMES + stagger-in

**Files:**
- Modify: `v2g/boot.js` (replace `buildBay`)
- Modify: `v2g/style.css` (append cartridge tile + asymmetric grid styles)

- [ ] **Step 1: Append cartridge styles**

```css
/* cartridge tiles */
.cartridge{position:relative;border:3px solid var(--text-dark);border-radius:14px;
  overflow:hidden;cursor:pointer;background:#11131c;color:var(--text-dark);
  aspect-ratio:1/1;display:flex;flex-direction:column;justify-content:flex-end;
  transform-style:preserve-3d;will-change:transform}
.cartridge img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  opacity:.55;transition:opacity .3s,transform .4s}
.cartridge .meta{position:relative;z-index:2;padding:14px;background:linear-gradient(transparent,#000a)}
.cartridge .num{position:absolute;top:10px;left:10px;z-index:2;font-weight:800;font-size:13px;
  background:var(--cc);color:#0a0a0f;padding:2px 7px;border-radius:5px}
.cartridge .tag{font-size:11px;color:var(--cc);font-weight:700}
.cartridge .name{font-size:clamp(14px,1.4vw,20px);font-weight:800;margin-top:3px}
/* asymmetric spans: a few tiles are larger for rhythm */
.cartridge.wide{grid-column:span 2}
.cartridge.tall{grid-row:span 2}
@media (max-width:860px){ .cartridge.wide{grid-column:span 2} .cartridge.tall{grid-row:span 1} }
```

- [ ] **Step 2: Replace `buildBay` in `boot.js`**

```javascript
  function buildBay(){
    var grid = document.getElementById('grid');
    var colors = window.TAG_COLORS || {};
    // asymmetric rhythm: which indices get bigger spans
    var wide = {0:1, 5:1, 10:1}, tall = {2:1, 8:1};
    window.GAMES.forEach(function(g, i){
      var cc = colors[g.tag] || '#3d7bff';
      var a = document.createElement('a');
      a.className = 'cartridge' + (wide[i]?' wide':'') + (tall[i]?' tall':'');
      a.href = g.url;
      a.style.setProperty('--cc', cc);
      a.dataset.tag = g.tag;
      a.innerHTML =
        '<span class="num">'+String(i+1).padStart(2,'0')+'</span>' +
        '<img loading="lazy" alt="" src="'+g.img+'">' +
        '<span class="meta"><span class="tag">&lt;'+g.tag+'&gt;</span>' +
        '<span class="name">'+g.name+'</span></span>';
      grid.appendChild(a);
      bindTileHover(a);
    });
    if (!REDUCED && window.ScrollTrigger){
      ScrollTrigger.batch('.cartridge', {
        start:'top 88%',
        onEnter:function(els){ gsap.from(els, { duration:0.7, ease:'of',
          y:60, opacity:0, scale:0.92, stagger:0.07, overwrite:true }); }
      });
    }
  }
```

Add a `bindTileHover` stub (implemented next task):
```javascript
  function bindTileHover(tile){
    tile.addEventListener('click', function(e){ e.preventDefault(); launch(tile.href); });
  }
  function launch(url){ window.location.href = url; }
```

- [ ] **Step 3: Verify in browser**

Reload `/v2g/`, scroll to the bay. Expected: 14 cartridge tiles in an asymmetric grid (a few span 2 cols / 2 rows), each with its number, screenshot, `<TAG>` and name, accent-colored per `TAG_COLORS`; tiles stagger/rise in as they enter the viewport. Clicking a tile navigates to the game. No console errors. (Reduced-motion: tiles all visible immediately.)

- [ ] **Step 4: Commit**

```bash
git add v2g/boot.js v2g/style.css
git commit -m "feat(v2g): cartridge bay grid from GAMES with asymmetric layout + scroll stagger"
```

---

## Task 10: Cartridge hover — 3D tilt/press, screenshot reveal, launch flash

**Files:**
- Modify: `v2g/boot.js` (replace `bindTileHover` + `launch`)

- [ ] **Step 1: Replace `bindTileHover` and `launch`**

```javascript
  function bindTileHover(tile){
    var img = tile.querySelector('img');
    if (!isTouch && !REDUCED){
      tile.addEventListener('mousemove', function(e){
        var r = tile.getBoundingClientRect();
        var rx = ((e.clientY-r.top)/r.height - 0.5)*-12;
        var ry = ((e.clientX-r.left)/r.width  - 0.5)* 12;
        gsap.to(tile, { duration:0.3, ease:'of', rotateX:rx, rotateY:ry, z:30 });
        gsap.to(img,  { duration:0.3, opacity:0.85, scale:1.06 });
      });
      tile.addEventListener('mouseleave', function(){
        gsap.to(tile, { duration:0.5, ease:'of', rotateX:0, rotateY:0, z:0 });
        gsap.to(img,  { duration:0.5, opacity:0.55, scale:1 });
      });
    }
    tile.addEventListener('click', function(e){
      e.preventDefault();
      // "cartridge inserted": press + screen-flash, then navigate
      gsap.timeline({ onComplete:function(){ launch(tile.href); } })
        .to(tile, { duration:0.12, scale:0.94, ease:'of' })
        .to(tile, { duration:0.18, scale:1, ease:'of' })
        .to('#bgFill', { duration:0.18, backgroundColor:'#fff' }, 0)
        .to('#bgFill', { duration:0.25, backgroundColor:'#0a0a0f' }, 0.18);
    });
  }

  function launch(url){ window.location.href = url; }
```

- [ ] **Step 2: Verify in browser**

Reload `/v2g/`, hover cartridges. Expected: each tile tilts toward the cursor in 3D, lifts (z), and its screenshot brightens + zooms; leaving resets it. Clicking gives a quick press + white screen-flash, then navigates. No console errors.

- [ ] **Step 3: Commit**

```bash
git add v2g/boot.js
git commit -m "feat(v2g): cartridge 3D hover tilt + screenshot reveal + launch flash"
```

---

## Task 11: Category filter via nav + GSAP Flip

**Files:**
- Modify: `v2g/boot.js` (implement `initFilter`, call from `buildBay`)
- Modify: `v2g/style.css` (append filtered-out style)

- [ ] **Step 1: Append style for hidden tiles**

```css
.cartridge.filtered{display:none}
```

- [ ] **Step 2: Implement `initFilter` and call it at the end of `buildBay`**

Add at the end of `buildBay` (after the batch block):
```javascript
    initFilter();
```

Replace the `initFilter` stub with:
```javascript
  function initFilter(){
    // distinct tags, in first-seen order
    var tags = [], seen = {};
    window.GAMES.forEach(function(g){ if(!seen[g.tag]){ seen[g.tag]=1; tags.push(g.tag); } });
    window.__BAY_TAGS = ['ALL'].concat(tags);   // consumed by initNav (Task 12)

    window.__applyFilter = function(tag){
      var tiles = document.querySelectorAll('.cartridge');
      var state = window.Flip ? Flip.getState(tiles) : null;
      tiles.forEach(function(t){
        var show = (tag === 'ALL' || t.dataset.tag === tag);
        t.classList.toggle('filtered', !show);
      });
      if (state && !REDUCED){
        Flip.from(state, { duration:0.6, ease:'of', scale:true, absolute:true,
          onEnter:function(els){ return gsap.from(els,{opacity:0,scale:0.8,duration:0.4}); },
          onLeave:function(els){ return gsap.to(els,{opacity:0,scale:0.8,duration:0.3}); } });
      }
    };
  }
```

- [ ] **Step 3: Verify in browser**

Reload `/v2g/`. In console run `window.__applyFilter('PUZZLE')`. Expected: only PUZZLE cartridges remain and they Flip-animate into their new positions; `window.__applyFilter('ALL')` brings them all back with animation. No console errors. (Nav buttons that call this come in Task 12.)

- [ ] **Step 4: Commit**

```bash
git add v2g/boot.js v2g/style.css
git commit -m "feat(v2g): category filter with GSAP Flip reflow (driver fn ready for nav)"
```

---

## Task 12: Sticky bottom nav (active-section + recolor + filter tabs) + custom cursor

**Files:**
- Modify: `v2g/boot.js` (implement `initNav`, `initCursor`)
- Modify: `v2g/style.css` (append nav + cursor styles)

- [ ] **Step 1: Append nav + cursor styles**

```css
#nav{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;
  background:#0a0a0f;color:#fff;border-top:2px solid var(--accent);
  font-weight:700;font-size:13px;letter-spacing:.04em}
#nav button{flex:1;background:none;border:0;color:inherit;font:inherit;
  padding:16px 8px;cursor:pointer;border-right:1px solid #ffffff22;
  transition:background .25s,color .25s}
#nav button.active{background:var(--accent);color:#0a0a0f}
#cursor{position:fixed;top:0;left:0;width:26px;height:26px;border:2px solid var(--accent);
  border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:9999;
  mix-blend-mode:difference;transition:width .2s,height .2s,opacity .2s}
#cursor.hot{width:46px;height:46px}
@media (pointer:coarse){ #cursor{display:none!important} }
```

- [ ] **Step 2: Implement `initNav` and `initCursor`**

Replace the `initNav` stub:
```javascript
  function initNav(){
    var nav = document.getElementById('nav');
    // section nav items map to the acts; LIBRARY expands into tag filters
    var sections = [
      { label:'BOOT',    sel:'#hero',   accent:'#3d7bff' },
      { label:'ABOUT',   sel:'#insert', accent:'#9b5cff' },
      { label:'LIBRARY', sel:'#bay',    accent:'#3dff7a' },
      { label:'☕',       href:(window.SITE&&window.SITE.coffee)||'#', accent:'#ff9a3c' },
    ];
    sections.forEach(function(s){
      var b = document.createElement('button'); b.type='button'; b.textContent=s.label;
      b.addEventListener('click', function(){
        if (s.href) return window.open(s.href,'_blank','noopener');
        scrollToEl(s.sel);
      });
      b.dataset.sel = s.sel || ''; b.dataset.accent = s.accent;
      nav.appendChild(b);
    });
    var btns = nav.querySelectorAll('button');
    function setActive(sel, accent){
      btns.forEach(function(b){ b.classList.toggle('active', b.dataset.sel===sel); });
      document.documentElement.style.setProperty('--accent', accent);
    }
    // tie active state to scroll position
    if (window.ScrollTrigger){
      sections.forEach(function(s){
        if (!s.sel) return;
        ScrollTrigger.create({ trigger:s.sel, start:'top 60%', end:'bottom 60%',
          onToggle:function(self){ if(self.isActive) setActive(s.sel, s.accent); } });
      });
    }
    setActive('#hero', '#3d7bff');
  }
```

Replace the `initCursor` stub:
```javascript
  function initCursor(){
    if (isTouch || REDUCED) return;
    var dot = document.getElementById('cursor');
    document.body.style.cursor = 'none';
    window.addEventListener('mousemove', function(e){
      gsap.to(dot, { duration:0.18, x:e.clientX, y:e.clientY, ease:'of' });
    });
    document.addEventListener('mouseover', function(e){
      var hot = e.target.closest('a,button,.keycap,.cartridge');
      dot.classList.toggle('hot', !!hot);
    });
  }
```

- [ ] **Step 3: Verify in browser**

Reload `/v2g/`. Expected: a sticky bottom nav (`BOOT · ABOUT · LIBRARY · ☕`); the active item highlights and the page accent recolors as you scroll through each act; the custom ring cursor follows the mouse and grows over interactive elements. ☕ opens the coffee link. No console errors. (Touch: native cursor, no ring.)

- [ ] **Step 4: Commit**

```bash
git add v2g/boot.js v2g/style.css
git commit -m "feat(v2g): sticky active-section nav with accent recolor + custom cursor"
```

---

## Task 13: Final polish — reduced-motion/touch passes, no-JS check, ScrollTrigger refresh

**Files:**
- Modify: `v2g/boot.js` (refresh hooks + reduced-motion bay reveal)
- Modify: `v2g/style.css` (reduced-motion explicit states)

- [ ] **Step 1: Append explicit reduced-motion states to `v2g/style.css`**

```css
@media (prefers-reduced-motion:reduce){
  body{background:var(--bg-dark)} body{color:var(--text-dark)}
  #bgFill{background:var(--bg-dark)}
  #demoArrow,#demoHand{display:none!important}
  .word{opacity:1!important}
  #cursor{display:none!important}
}
```

- [ ] **Step 2: Add a ScrollTrigger refresh after images/layout settle, and ensure reduced-motion bay is visible**

In `boot.js`, at the very end of `init()` (after the `if (REDUCED){...}` / boot calls), append:
```javascript
    // recalc pin/scrub positions once fonts+images have laid out
    if (!REDUCED && window.ScrollTrigger){
      window.addEventListener('load', function(){ ScrollTrigger.refresh(); });
    }
    if (REDUCED){
      // build the nav so sections remain navigable even without choreography
      initNav();
      document.body.classList.add('is-dark');
    }
```

- [ ] **Step 3: Verify in browser (three passes)**

1. **Normal:** full reload — boot → hero (keycaps + demo cursor) → pinned manifesto + theme flip → staggered bay → nav recolor + custom cursor. Zero console errors end to end.
2. **Reduced motion:** enable OS "reduce motion", reload — no boot, dark bay immediately, all words solid, all cartridges visible, nav present, no demo/custom cursor.
3. **No-JS:** disable JavaScript, reload — the `<noscript>` fallback list of 14 game links renders and is clickable.

- [ ] **Step 4: Final commit**

```bash
git add v2g/boot.js v2g/style.css
git commit -m "feat(v2g): reduced-motion/touch/no-JS passes + ScrollTrigger refresh"
```

---

## Self-review notes (addressed)

- **Spec coverage:** boot/POST (T4), oversized type + scramble (T5), iso keycaps (T6), demo cursors + real hover — the explicit user requirement (T7), pinned scrubbed manifesto + theme inversion (T8), games-as-cartridges asymmetric stagger (T9), hover tilt/launch (T10), category filter Flip (T11), active-section nav recolor + custom cursor (T12), reduced-motion/touch/no-JS + magnetic buttons + footer (T2/T5/T13). All spec sections map to a task.
- **Naming consistency:** the ID contract and `boot.js` function names at the top are used identically in every task; stubs are introduced before the task that implements them so out-of-order reading still resolves.
- **No build step / shared data:** `window.GAMES`/`TAG_COLORS`/`SITE` consumed read-only; `games.js` untouched; one line added to `switcher.js`; root loader `VALID` updated.
- **Known nuance:** Act-2 theme tween animates the `--grid-light` custom property on `#bgGrid` — GSAP tweens CSS vars as strings; the grid uses that var directly so the color updates live. If a browser refuses to interpolate the var, fall back to toggling `is-dark` (already wired) which transitions grid color via CSS.
