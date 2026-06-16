/* v2g/boot.js — conductor. Keycap-logo hero + an index/sticky-preview library,
   wired with Lenis + GSAP. */
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
    if (window.gsap && window.CustomEase){
      gsap.registerPlugin(CustomEase);
      CustomEase.create('of', 'M0,0 C0.16,1 0.3,1 1,1');   // glide
      CustomEase.create('pop', 'M0,0 C0.34,1.3 0.4,1 1,1'); // slight overshoot for "lands"
    }
    setupScroll();

    buildLibrary();      // build index + preview from data (needed even in reduced mode)
    if (REDUCED){
      document.body.classList.add('is-dark');
      initKeycaps();
      initNav();
      return;
    }
    revealHero();
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
    initKeycaps();
    if (window.SplitText){
      var split = new SplitText('#heroSub', { type:'words' });
      gsap.from(split.words, { duration:0.5, ease:'of', y:14, opacity:0, stagger:0.03, delay:0.55 });
    } else {
      gsap.from('#heroSub', { duration:0.5, ease:'of', opacity:0, delay:0.55 });
    }
    gsap.from('.hero-actions > *', { duration:0.5, ease:'of', y:18, opacity:0, stagger:0.08, delay:0.75 });

    var browse = document.getElementById('playBtn');
    var rnd = document.getElementById('randomBtn');
    magnetic(browse, 0.5); magnetic(rnd, 0.4);
    browse.addEventListener('click', function(){ scrollToEl('#bay'); });   // go pick one
    rnd.addEventListener('click', function(){                              // surprise me
      var list = window.GAMES || [];
      if (!list.length) return scrollToEl('#bay');
      flashTo(list[Math.floor(Math.random() * list.length)].url);
    });
    initInsert();
    initNav();
  }

  function initInsert(){
    if (!window.ScrollTrigger) return;
    var split = window.SplitText ? new SplitText('#manifesto p:first-child', { type:'words' }) : null;
    var words = split ? split.words : [];
    words.forEach(function(w){ w.classList.add('word'); });

    // word-by-word reveal: opacity + blur clear, scrubbed (a focus point sweeps the line)
    gsap.timeline({ scrollTrigger:{
        trigger:'#insert', start:'top top', end:'+=120%', pin:true, scrub:true } })
      .fromTo(words, { opacity:0.12, filter:'blur(6px)' },
        { opacity:1, filter:'blur(0px)', stagger:0.4, ease:'none' });

    // theme cross-fade light -> dark, then a one-shot "power surge" as we enter the bay
    var gridEl = document.getElementById('bgGrid');
    var gridProxy = { t:0 };
    gsap.timeline({ scrollTrigger:{
        trigger:'#insert', start:'top 60%', end:'bottom top', scrub:true,
        onLeave:function(){ document.body.classList.add('is-dark'); powerSurge(); },
        onEnterBack:function(){ document.body.classList.remove('is-dark'); } } })
      .to('#bgFill', { backgroundColor:'#0a0a0f', ease:'none' }, 0)
      .to(gridProxy, { t:1, ease:'none', onUpdate:function(){
        gridEl.style.setProperty('--grid-light',
          gsap.utils.interpolate('#c9d4ff', '#1c2233', gridProxy.t));
      } }, 0);
  }

  function powerSurge(){
    var f = document.getElementById('flash');
    if (!f || !window.gsap) return;
    gsap.fromTo(f, { opacity:0 }, { opacity:0.85, duration:0.1, ease:'power2.in',
      onComplete:function(){ gsap.to(f, { opacity:0, duration:0.5, ease:'of' }); } });
  }

  function scrollToEl(sel){
    var el = document.querySelector(sel);
    if (lenis) lenis.scrollTo(el, { duration:1.2 });
    else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  }

  function launch(url){ window.location.href = url; }
  function flashTo(url){
    if (REDUCED || !window.gsap) return launch(url);
    gsap.timeline({ onComplete:function(){ launch(url); } })
      .to('#bgFill', { duration:0.16, backgroundColor:'#fff' }, 0)
      .to('#bgFill', { duration:0.30, backgroundColor:'#0a0a0f' }, 0.16);
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
        row.appendChild(cap);   // press is pure CSS :active; clicking a cap does NOT navigate
      });
      host.appendChild(row);
    });
    var caps = host.querySelectorAll('.keycap');
    if (REDUCED) return;   // static logo; press still works

    gsap.set(caps, { rotation:function(i){ return ((i * 53) % 9) - 4; } });
    gsap.from(caps, { duration:0.7, ease:'of', y:-90, opacity:0,
      stagger:{ each:0.045, from:'center' },
      onComplete:function(){ demoLoop(); bindHeroHover(); } });

    if (!isTouch){
      window.addEventListener('mousemove', function(e){
        var dx = (e.clientX/window.innerWidth  - 0.5) * 22;
        var dy = (e.clientY/window.innerHeight - 0.5) * 16;
        gsap.to('#keys', { duration:0.8, ease:'of', x:dx, y:dy });
      });
    }
    if (window.ScrollTrigger){
      gsap.to('.hero-art', { yPercent:-26, autoAlpha:0.3, ease:'none',
        scrollTrigger:{ trigger:'#hero', start:'top top', end:'bottom top', scrub:true } });
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
    host.addEventListener('mouseenter', function(){
      clearTimeout(demoIdle);
      if (demoTween) demoTween.pause();
      host.querySelectorAll('.keycap.pressed').forEach(function(c){ c.classList.remove('pressed'); });
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
      var hot = e.target.closest('a,button,.keycap,.idx-item,#preview');
      dot.classList.toggle('hot', !!hot);
    });
  }

  /* ---------- ACT 3: the library (index list + sticky preview) ---------- */

  function buildLibrary(){
    var list = document.getElementById('indexList');
    var stage = document.querySelector('.prev-stage');
    var preview = document.getElementById('preview');
    var ghost = document.getElementById('bayGhost');
    if (!list || !stage || !preview) return;
    var colors = window.TAG_COLORS || {};
    var items = [], imgs = [];

    window.GAMES.forEach(function(g, i){
      var cc = colors[g.tag] || '#3d7bff';
      var num = String(i+1).padStart(2,'0');
      var li = document.createElement('li');
      li.className = 'idx-item'; li.dataset.i = String(i);
      li.innerHTML =
        '<span class="idx-num mono">' + num + '</span>' +
        '<span class="idx-dot" style="--cc:' + cc + '"></span>' +
        '<span class="idx-name">' + g.name + '</span>' +
        '<span class="idx-tag mono">' + g.tag + '</span>';
      list.appendChild(li);
      items.push(li);

      var im = document.createElement('img');
      im.className = 'prev-img'; im.loading = 'lazy'; im.alt = ''; im.src = g.img;
      stage.appendChild(im);
      imgs.push(im);
    });

    var active = -1;
    var pnum = preview.querySelector('.prev-num');
    var ptag = preview.querySelector('.prev-tag');
    var pname = preview.querySelector('.prev-name');
    var pplay = preview.querySelector('.prev-play');

    function setActive(i){
      if (i === active || i < 0 || i >= window.GAMES.length) return;
      active = i;
      var g = window.GAMES[i];
      var cc = colors[g.tag] || '#3d7bff';
      items.forEach(function(li, n){ li.classList.toggle('active', n === i); });
      imgs.forEach(function(im, n){ im.classList.toggle('active', n === i); });
      pnum.textContent = String(i+1).padStart(2,'0');
      ptag.textContent = '<' + g.tag + '>';
      pname.textContent = g.name;
      pplay.href = g.url;
      preview.style.setProperty('--cc', cc);
      if (ghost){ ghost.textContent = String(i+1).padStart(2,'0'); ghost.style.color = cc; }
      if (!REDUCED && window.gsap){
        gsap.fromTo(imgs[i], { clipPath:'inset(0 0 0 100%)' },
          { clipPath:'inset(0 0 0 0%)', duration:0.6, ease:'of' });
        gsap.fromTo(pnum, { yPercent:60, opacity:0 }, { yPercent:0, opacity:1, duration:0.45, ease:'pop' });
        gsap.fromTo([ptag, pname], { y:16, opacity:0 }, { y:0, opacity:1, duration:0.4, stagger:0.05, ease:'of' });
      }
    }

    items.forEach(function(li, i){
      li.addEventListener('mouseenter', function(){ if (!isTouch) setActive(i); });
      li.addEventListener('click', function(){ setActive(i); flashTo(window.GAMES[i].url); });
    });
    function playActive(e){ if (e) e.preventDefault(); flashTo(window.GAMES[active < 0 ? 0 : active].url); }
    pplay.addEventListener('click', playActive);

    setActive(0);
    preview.setAttribute('aria-hidden', 'false');

    if (REDUCED || !window.ScrollTrigger) return;

    // entrance: index rows fan in
    ScrollTrigger.batch('.idx-item', { start:'top 92%',
      onEnter:function(els){ gsap.from(els, { duration:0.6, ease:'of', y:30, opacity:0, stagger:0.05, overwrite:true }); } });

    // scroll drives the active item (read-head at viewport center)
    items.forEach(function(li, i){
      ScrollTrigger.create({ trigger:li, start:'top 60%', end:'bottom 60%',
        onToggle:function(self){ if (self.isActive) setActive(i); } });
    });

    // sticky preview tilts subtly toward the cursor
    if (!isTouch){
      preview.addEventListener('mousemove', function(e){
        var r = preview.getBoundingClientRect();
        var rx = ((e.clientY-r.top)/r.height - 0.5) * -6;
        var ry = ((e.clientX-r.left)/r.width  - 0.5) *  6;
        gsap.to('.prev-stage', { duration:0.4, ease:'of', rotationX:rx, rotationY:ry });
      });
      preview.addEventListener('mouseleave', function(){
        gsap.to('.prev-stage', { duration:0.6, ease:'of', rotationX:0, rotationY:0 });
      });
    }

    // header parallax + the giant ghost number shows only while the library is on screen
    gsap.to('.bay-intro', { yPercent:-22, ease:'none',
      scrollTrigger:{ trigger:'#bay', start:'top top', end:'+=90%', scrub:true } });
    if (ghost){
      ScrollTrigger.create({ trigger:'#bay', start:'top 55%', end:'bottom 45%',
        onToggle:function(self){ ghost.classList.toggle('show', self.isActive); } });
    }
  }

  /* ---------- sticky bottom nav ---------- */

  function initNav(){
    var nav = document.getElementById('nav');
    var spacer = document.createElement('div'); spacer.className = 'nav-spacer'; nav.appendChild(spacer);
    var sections = [
      { label:'TOP',     sel:'#hero' },
      { label:'ABOUT',   sel:'#insert' },
      { label:'LIBRARY', sel:'#bay' },
      { label:'COFFEE ☕', href:(window.SITE&&window.SITE.coffee)||'#' },
    ];
    sections.forEach(function(s){
      var b = document.createElement('button'); b.type='button'; b.textContent=s.label;
      b.addEventListener('click', function(){
        if (s.href) return window.open(s.href,'_blank','noopener');
        scrollToEl(s.sel);
      });
      b.dataset.sel = s.sel || '';
      nav.appendChild(b);
    });
    var btns = nav.querySelectorAll('button');
    function setActive(sel){ btns.forEach(function(b){ b.classList.toggle('active', b.dataset.sel===sel); }); }
    if (window.ScrollTrigger){
      sections.forEach(function(s){
        if (!s.sel) return;
        ScrollTrigger.create({ trigger:s.sel, start:'top 60%', end:'bottom 60%',
          onToggle:function(self){ if(self.isActive) setActive(s.sel); } });
      });
    }
    setActive('#hero');
  }

  function boot(){
    if (!window.GAMES){ return setTimeout(boot, 30); }
    init();
  }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
