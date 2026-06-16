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
  function revealHero(){}
  function buildBay(){}

  function boot(){
    // GAMES is loaded via shared/games.js (defer, before this file). Guard anyway.
    if (!window.GAMES){ return setTimeout(boot, 30); }
    init();
  }
  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
