/* v2g/boot.js — conductor. Builds the keycap-logo hero + cartridge bay from
   window.GAMES, then wires Lenis + GSAP timelines act by act. */
(function(){
  'use strict';

  function prefersReduced(){
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  }
  var isTouch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
  var REDUCED = prefersReduced();

  var lenis = null;
  var demoTween = null, demoIdle = null;

  function setupScroll(){
    if (REDUCED || !window.Lenis) return;            // native scroll under reduced-motion
    lenis = new Lenis({ duration:1.1, smoothWheel:true });
    if (window.ScrollTrigger){
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function(time){ lenis.raf(time*1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function(t){ lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  function init(){
    if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    if (window.gsap && window.SplitText) gsap.registerPlugin(SplitText);
    if (window.gsap && window.Flip) gsap.registerPlugin(Flip);
    if (window.gsap && window.CustomEase){
      gsap.registerPlugin(CustomEase);
      CustomEase.create('of', 'M0,0 C0.16,1 0.3,1 1,1');   // the page-wide motion signature
    }
    setupScroll();

    buildBay();          // build grid from data first (needed even in reduced mode)
    if (REDUCED){
      // reduced-motion: dark bay immediately, static keycap logo, nav present
      document.body.classList.add('is-dark');
      initKeycaps();
      initNav();
      return;
    }
    revealHero();        // keycaps + subhead + actions + initInsert + initNav
    // recalc pin/scrub positions once fonts+images have laid out
    if (window.ScrollTrigger){
      window.addEventListener('load', function(){ ScrollTrigger.refresh(); });
    }
  }

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
    initKeycaps();   // builds + animates the keycap logo
    if (window.SplitText){
      var split = new SplitText('#heroSub', { type:'words' });
      gsap.from(split.words, { duration:0.5, ease:'of', y:14, opacity:0, stagger:0.03, delay:0.55 });
    } else {
      gsap.from('#heroSub', { duration:0.5, ease:'of', opacity:0, delay:0.55 });
    }
    gsap.from('.hero-actions > *', { duration:0.5, ease:'of', y:18, opacity:0, stagger:0.08, delay:0.75 });

    var play = document.getElementById('playBtn');
    var index = document.getElementById('indexBtn');
    magnetic(play, 0.5); magnetic(index, 0.4);
    play.addEventListener('click', function(){ scrollToEl('#bay'); });
    index.addEventListener('click', function(){
      if (window.GAMELIST && window.GAMELIST.open) return window.GAMELIST.open();
      scrollToEl('#bay');
    });
    initInsert();
    initNav();
  }

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
    var gridEl = document.getElementById('bgGrid');
    var gridProxy = { t:0 };
    gsap.timeline({ scrollTrigger:{
        trigger:'#insert', start:'top 60%', end:'bottom top', scrub:true,
        onLeave:function(){ document.body.classList.add('is-dark'); },
        onEnterBack:function(){ document.body.classList.remove('is-dark'); } } })
      .to('#bgFill', { backgroundColor:'#0a0a0f', ease:'none' }, 0)
      .to(gridProxy, { t:1, ease:'none', onUpdate:function(){
        gridEl.style.setProperty('--grid-light',
          gsap.utils.interpolate('#c9d4ff', '#1c2233', gridProxy.t));
      } }, 0);
  }

  function scrollToEl(sel){
    var el = document.querySelector(sel);
    if (lenis) lenis.scrollTo(el, { duration:1.2 });
    else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  }

  /* ---------- ACT 1: keycap logo ---------- */

  function pressCap(cap){
    cap.classList.add('pressed');
    clearTimeout(cap._pt);
    cap._pt = setTimeout(function(){ cap.classList.remove('pressed'); }, 160);
  }

  function initKeycaps(){
    var host = document.getElementById('keys');
    if (!host || host.childElementCount) return;
    var rows = ['JOJKOS', 'GAMES'];
    var palette = ['#9b5cff','#ff9a3c','#3dff7a','#3d7bff','#ff3df0','#2fd6e0','#ffd23f','#ff4757'];
    var ci = 0;
    rows.forEach(function(word){
      var row = document.createElement('div'); row.className = 'keyrow';
      word.split('').forEach(function(ch){
        var col = palette[ci % palette.length]; ci++;
        var cap = document.createElement('div'); cap.className = 'keycap';
        cap.style.setProperty('--cap', col);
        cap.innerHTML = '<span class="cap-face">' + ch + '</span>';
        cap.addEventListener('click', function(){ pressCap(cap); scrollToEl('#bay'); });
        row.appendChild(cap);
      });
      host.appendChild(row);
    });
    var caps = host.querySelectorAll('.keycap');
    if (REDUCED) return;   // static logo; click still works

    // slight per-cap rotation jitter (in-plane) + drop-in entrance forming the logo
    gsap.set(caps, { rotation:function(i){ return ((i * 53) % 9) - 4; } });
    gsap.from(caps, { duration:0.7, ease:'of', y:-90, opacity:0,
      stagger:{ each:0.045, from:'center' },
      onComplete:function(){ demoLoop(); bindHeroHover(); } });

    // gentle pointer parallax (translate only — keeps demo-cursor math exact)
    if (!isTouch){
      window.addEventListener('mousemove', function(e){
        var dx = (e.clientX/window.innerWidth  - 0.5) * 22;
        var dy = (e.clientY/window.innerHeight - 0.5) * 16;
        gsap.to('#keys', { duration:0.8, ease:'of', x:dx, y:dy });
      });
    }
    initCursor();
  }

  function demoLoop(){
    var host = document.getElementById('keys');
    var caps = host.querySelectorAll('.keycap');
    if (!caps.length) return;
    var arrow = document.createElement('div'); arrow.id = 'demoArrow';
    arrow.innerHTML =
      '<svg viewBox="0 0 24 24" width="42" height="42" aria-hidden="true">' +
      '<path d="M4 3 L4 21 L9 16.5 L12.5 22.5 L15.5 21 L11.8 15.2 L19 15.2 Z" ' +
      'fill="#fff" stroke="#0a0a0f" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
      '<span class="demo-pulse" aria-hidden="true"></span>';
    host.appendChild(arrow);
    var pulse = arrow.querySelector('.demo-pulse');

    function center(cap){
      var hr = host.getBoundingClientRect(), cr = cap.getBoundingClientRect();
      return { x: cr.left - hr.left + cr.width * 0.5, y: cr.top - hr.top + cr.height * 0.66 };
    }
    var c0 = center(caps[0]);
    gsap.set(arrow, { x:c0.x, y:c0.y, opacity:0 });

    var visit = [0, 3, 6, 9, 10].filter(function(i){ return i < caps.length; });
    var tl = gsap.timeline({ repeat:-1, repeatDelay:0.6, defaults:{ ease:'of' } });
    tl.to(arrow, { duration:0.3, opacity:1 });
    visit.forEach(function(idx){
      var cap = caps[idx];
      tl.to(arrow, { duration:0.55, x:function(){ return center(cap).x; }, y:function(){ return center(cap).y; } });
      tl.to(arrow, { duration:0.1, scale:0.8 });
      tl.add(function(){ pressCap(cap); });
      tl.fromTo(pulse, { scale:0, opacity:0.55 }, { duration:0.55, scale:1.8, opacity:0, ease:'of' }, '<');
      tl.to(arrow, { duration:0.18, scale:1 });
      tl.to({}, { duration:0.35 });
    });
    demoTween = tl;
  }

  function bindHeroHover(){
    var host = document.getElementById('keys');
    if (!host) return;
    // hover lift is pure CSS (:hover on the stable .keycap box → no retrigger).
    // JS only pauses/resumes the teach loop as the pointer enters/leaves the cluster.
    host.addEventListener('mouseenter', function(){
      clearTimeout(demoIdle);
      if (demoTween) demoTween.pause();
      var a = document.getElementById('demoArrow'); if (a) a.classList.add('demo-hidden');
    });
    host.addEventListener('mouseleave', function(){
      clearTimeout(demoIdle);
      demoIdle = setTimeout(function(){
        var a = document.getElementById('demoArrow'); if (a) a.classList.remove('demo-hidden');
        if (demoTween) demoTween.restart();
      }, 1200);
    });
  }

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

  /* ---------- ACT 3: cartridge bay ---------- */

  function buildBay(){
    var grid = document.getElementById('grid');
    var colors = window.TAG_COLORS || {};
    window.GAMES.forEach(function(g, i){
      var cc = colors[g.tag] || '#3d7bff';
      var a = document.createElement('a');
      a.className = 'cartridge';
      a.href = g.url;
      a.dataset.tag = g.tag;
      a.style.setProperty('--cc', cc);
      a.innerHTML =
        '<span class="cart-media"><img loading="lazy" alt="" src="' + g.img + '"></span>' +
        '<span class="cart-body">' +
          '<span class="num">' + String(i+1).padStart(2,'0') + '</span>' +
          '<span class="tag">&lt;' + g.tag + '&gt;</span>' +
          '<span class="name">' + g.name + '</span>' +
          '<span class="play">PLAY ▸</span>' +
        '</span>';
      grid.appendChild(a);
      bindTileHover(a);
    });
    if (!REDUCED && window.ScrollTrigger){
      var cards = grid.querySelectorAll('.cartridge');
      cards.forEach(function(card, i){
        gsap.from(card, {
          scrollTrigger:{ trigger:card, start:'top 86%' },
          x:(i % 2 === 0 ? -90 : 90), opacity:0, duration:0.8, ease:'of' });
      });
    }
    initFilter();
  }

  function bindTileHover(tile){
    if (!isTouch && !REDUCED){
      tile.addEventListener('mousemove', function(e){
        var r = tile.getBoundingClientRect();
        var rx = ((e.clientY-r.top)/r.height - 0.5) * -8;
        var ry = ((e.clientX-r.left)/r.width  - 0.5) *  8;
        gsap.to(tile, { duration:0.3, ease:'of', rotationX:rx, rotationY:ry, z:24 });
      });
      tile.addEventListener('mouseleave', function(){
        gsap.to(tile, { duration:0.5, ease:'of', rotationX:0, rotationY:0, z:0 });
      });
    }
    tile.addEventListener('click', function(e){
      e.preventDefault();
      // "cartridge inserted": press + screen-flash, then navigate
      gsap.timeline({ onComplete:function(){ launch(tile.href); } })
        .to(tile, { duration:0.12, scale:0.96, ease:'of' })
        .to(tile, { duration:0.18, scale:1, ease:'of' })
        .to('#bgFill', { duration:0.18, backgroundColor:'#fff' }, 0)
        .to('#bgFill', { duration:0.25, backgroundColor:'#0a0a0f' }, 0.18);
    });
  }

  function launch(url){ window.location.href = url; }

  function initFilter(){
    // distinct tags, in first-seen order
    var tags = [], seen = {};
    window.GAMES.forEach(function(g){ if(!seen[g.tag]){ seen[g.tag]=1; tags.push(g.tag); } });
    window.__BAY_TAGS = ['ALL'].concat(tags);   // consumed by initFilterBar

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

  /* ---------- nav + filter chips ---------- */

  function initNav(){
    initFilterBar();
    var nav = document.getElementById('nav');
    var sections = [
      { label:'TOP',     sel:'#hero',   accent:'#3d7bff' },
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
    if (window.ScrollTrigger){
      sections.forEach(function(s){
        if (!s.sel) return;
        ScrollTrigger.create({ trigger:s.sel, start:'top 60%', end:'bottom 60%',
          onToggle:function(self){ if(self.isActive) setActive(s.sel, s.accent); } });
      });
    }
    setActive('#hero', '#3d7bff');
  }

  function initFilterBar(){
    var tags = window.__BAY_TAGS || ['ALL'];
    var bay = document.getElementById('bay');
    var grid = document.getElementById('grid');
    if (!bay || !grid || document.getElementById('filterBar')) return;
    var bar = document.createElement('div'); bar.id = 'filterBar';
    tags.forEach(function(tag, i){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (i===0 ? ' active' : '');
      b.textContent = tag;
      b.addEventListener('click', function(){
        bar.querySelectorAll('.chip').forEach(function(c){ c.classList.remove('active'); });
        b.classList.add('active');
        if (window.__applyFilter) window.__applyFilter(tag);
      });
      bar.appendChild(b);
    });
    bay.insertBefore(bar, grid);
  }

  function boot(){
    // GAMES is loaded via shared/games.js (defer, before this file). Guard anyway.
    if (!window.GAMES){ return setTimeout(boot, 30); }
    init();
  }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
