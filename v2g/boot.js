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
  }

  function scrollToEl(sel){
    var el = document.querySelector(sel);
    if (lenis) lenis.scrollTo(el, { duration:1.2 });
    else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  }

  function buildBay(){}
  function initKeycaps(){}

  function boot(){
    // GAMES is loaded via shared/games.js (defer, before this file). Guard anyway.
    if (!window.GAMES){ return setTimeout(boot, 30); }
    init();
  }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
