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
    initInsert();
    initNav();    // implemented in a later task (safe stub for now)
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
    gsap.timeline({ scrollTrigger:{
        trigger:'#insert', start:'top 60%', end:'bottom top', scrub:true,
        onLeave:function(){ document.body.classList.add('is-dark'); },
        onEnterBack:function(){ document.body.classList.remove('is-dark'); } } })
      .to('#bgFill', { backgroundColor:'#0a0a0f', ease:'none' }, 0)
      .to('#bgGrid', { '--grid-light':'#1c2233', ease:'none' }, 0);
  }

  function scrollToEl(sel){
    var el = document.querySelector(sel);
    if (lenis) lenis.scrollTo(el, { duration:1.2 });
    else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  }

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
    initFilter();
  }

  function bindTileHover(tile){
    var img = tile.querySelector('img');
    if (!isTouch && !REDUCED){
      tile.addEventListener('mousemove', function(e){
        var r = tile.getBoundingClientRect();
        var rx = ((e.clientY-r.top)/r.height - 0.5)*-12;
        var ry = ((e.clientX-r.left)/r.width  - 0.5)* 12;
        gsap.to(tile, { duration:0.3, ease:'of', rotationX:rx, rotationY:ry, z:30 });
        gsap.to(img,  { duration:0.3, opacity:0.85, scale:1.06 });
      });
      tile.addEventListener('mouseleave', function(){
        gsap.to(tile, { duration:0.5, ease:'of', rotationX:0, rotationY:0, z:0 });
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
    // GSAP owns the full transform so the isometric tilt survives the tween
    gsap.set(capsEls, { rotationX:55, rotationZ:-45 });
    // animate in (drop + spin to settle), staggered
    gsap.from(capsEls, { duration:0.8, ease:'of', y:-120, opacity:0,
      stagger:0.08, rotationZ:-135 });

    // whole-cluster parallax to pointer (desktop only)
    if (!isTouch){
      window.addEventListener('mousemove', function(e){
        var rx = (e.clientY/window.innerHeight - 0.5)*-10;
        var ry = (e.clientX/window.innerWidth - 0.5)*14;
        gsap.to(host, { duration:0.6, ease:'of', rotationX:rx, rotationY:ry });
      });
    }
    initCursor();         // custom cursor (later task) — safe stub until then
    demoLoop();           // teach loop (later task)
    bindHeroHover();      // real hover handoff (later task)
  }
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
      clearTimeout(demoIdle);
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

  function initNav(){
    initFilterBar();
    var nav = document.getElementById('nav');
    // section nav items map to the acts; ☕ opens the coffee link
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
        var chips = bar.querySelectorAll('.chip');
        chips.forEach(function(c){ c.classList.remove('active'); });
        b.classList.add('active');
        if (window.__applyFilter) window.__applyFilter(tag);
      });
      bar.appendChild(b);
    });
    bay.insertBefore(bar, grid);
  }

  function initFilter(){
    // distinct tags, in first-seen order
    var tags = [], seen = {};
    window.GAMES.forEach(function(g){ if(!seen[g.tag]){ seen[g.tag]=1; tags.push(g.tag); } });
    window.__BAY_TAGS = ['ALL'].concat(tags);   // consumed by initNav (later task)

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

  function boot(){
    // GAMES is loaded via shared/games.js (defer, before this file). Guard anyway.
    if (!window.GAMES){ return setTimeout(boot, 30); }
    init();
  }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
