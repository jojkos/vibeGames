/* ============================================================
   v2b — app.js
   Preloader choreography, Lenis smooth scroll, ScrollTrigger
   reveals, hover system, custom cursor, click→launch transition,
   mobile parallax, procedural sound, grain, clock.
   ============================================================ */

(() => {
  'use strict';

  const doc = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointerMq = window.matchMedia(
    '(min-width: 861px) and (hover: hover) and (pointer: fine)'
  );
  const cardMq = window.matchMedia(
    '(max-width: 860px), (hover: none), (pointer: coarse)'
  );
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  if (reduced) doc.classList.add('reduced');
  if (isTouch) doc.classList.add('touch');

  const preloader = document.getElementById('preloader');
  const list = document.getElementById('list');
  const rows = Array.from(document.querySelectorAll('.row'));
  const cursorEl = document.querySelector('.cursor');
  const expander = document.getElementById('expander');
  const expanderImg = expander.querySelector('img');

  /* ------------------------------------------------------------
     grain texture (one noise tile, jittered by CSS)
     ------------------------------------------------------------ */
  (function makeGrain() {
    const grainEl = document.querySelector('.grain');
    if (!grainEl) return;
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const ctx = c.getContext('2d');
    const data = ctx.createImageData(160, 160);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    grainEl.style.backgroundImage = `url(${c.toDataURL()})`;
  })();

  /* ------------------------------------------------------------
     clock (footer local time)
     ------------------------------------------------------------ */
  const clockEl = document.getElementById('clock');
  if (clockEl) {
    const fmt = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const tickClock = () => (clockEl.textContent = fmt.format(new Date()));
    tickClock();
    setInterval(tickClock, 1000);
  }

  /* ------------------------------------------------------------
     procedural sound (off by default — browsers need a gesture to play audio,
     so it stays an explicit opt-in via the header toggle)
     ------------------------------------------------------------ */
  const sound = {
    on: false,
    ctx: null,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tick(i) {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 320 * Math.pow(2, i / 24); /* pitch rises per row */
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + 0.16);
    },
    thump() {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + 0.32);
    },
  };

  const soundBtn = document.getElementById('soundToggle');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      sound.on = !sound.on;
      if (sound.on) sound.ensure();
      soundBtn.setAttribute('aria-pressed', String(sound.on));
      soundBtn.innerHTML = sound.on ? 'snd&nbsp;on' : 'snd&nbsp;off';
      if (sound.on) sound.tick(6);
    });
  }

  /* ------------------------------------------------------------
     image preload (feeds the preloader + WebGL textures)
     ------------------------------------------------------------ */
  const preloadedImages = {};
  rows.forEach((row) => {
    const src = row.dataset.img;
    if (!src || preloadedImages[src]) return;
    const img = new Image();
    img.src = src;
    preloadedImages[src] = img;
  });

  /* ------------------------------------------------------------
     no GSAP (CDN down) or reduced motion → static page
     ------------------------------------------------------------ */
  if (!window.gsap || !window.ScrollTrigger || reduced) {
    if (preloader) preloader.remove();
    return; /* page is fully usable: native scroll, native links */
  }

  gsap.registerPlugin(ScrollTrigger);

  /* ------------------------------------------------------------
     Lenis smooth scroll, synced with ScrollTrigger
     ------------------------------------------------------------ */
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ autoRaf: false, lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* ------------------------------------------------------------
     initial hidden states (JS-only, so no-JS users see everything)
     ------------------------------------------------------------ */
  gsap.set('.hero-title .line-inner', { yPercent: 110 });
  gsap.set('.hero-meta .line-inner', { yPercent: 110, autoAlpha: 0 });
  gsap.set(['.site-header', '.scroll-hint', '.marquee'], { autoAlpha: 0 });
  gsap.set(rows, { autoAlpha: 0, y: 44 });
  gsap.set('.list-head', { autoAlpha: 0 });
  gsap.set('.statement .line-inner', { yPercent: 110 });
  gsap.set(['.outro-copy', '.pill', '.site-footer'], { autoAlpha: 0, y: 30 });

  /* ------------------------------------------------------------
     hero reveal (continuation of the preloader moment)
     ------------------------------------------------------------ */
  function heroReveal() {
    const tl = gsap.timeline();
    tl.to('.hero-title .line-inner', {
      yPercent: 0,
      duration: 1.05,
      ease: 'power3.out',
      stagger: 0.12,
    });
    tl.to(
      '.hero-meta .line-inner',
      { yPercent: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out' },
      '-=0.6'
    );
    tl.to(
      ['.site-header', '.scroll-hint', '.marquee'],
      { autoAlpha: 1, duration: 0.8, ease: 'power2.out', stagger: 0.08 },
      '-=0.55'
    );
    return tl;
  }

  /* ------------------------------------------------------------
     preloader choreography (skipped on repeat visits)
     ------------------------------------------------------------ */
  let seen = false;
  try {
    seen = sessionStorage.getItem('v2b-seen') === '1';
    sessionStorage.setItem('v2b-seen', '1');
  } catch (e) {
    /* storage unavailable — always play */
  }

  if (!preloader || seen) {
    if (preloader) preloader.remove();
    heroReveal();
  } else {
    const countEl = document.getElementById('preCount');
    const barEl = document.getElementById('preBar');
    const counter = { v: 0 };
    const tl = gsap.timeline();
    tl.to(counter, {
      v: 100,
      duration: 1.45,
      ease: 'power2.inOut',
      onUpdate() {
        countEl.textContent = String(Math.round(counter.v)).padStart(3, '0');
        barEl.style.transform = `scaleX(${counter.v / 100})`;
      },
    });
    /* slam to 100 */
    tl.fromTo(
      countEl,
      { scale: 1, transformOrigin: 'left bottom' },
      { scale: 1.12, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.in' }
    );
    tl.to('.pre-ui', { autoAlpha: 0, duration: 0.28, ease: 'power2.out' }, '+=0.1');
    /* vertical curtain split */
    tl.to('.shutter-top', { yPercent: -101, duration: 0.9, ease: 'expo.inOut' }, '<0.05');
    tl.to('.shutter-btm', { yPercent: 101, duration: 0.9, ease: 'expo.inOut' }, '<');
    tl.add(heroReveal(), '-=0.55');
    tl.call(() => preloader.remove(), null, '-=0.9');
  }

  /* ------------------------------------------------------------
     hero parallax + tag marquee
     ------------------------------------------------------------ */
  gsap.to('.hero-inner', {
    yPercent: -12,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.marquee-track', { xPercent: -50, duration: 24, ease: 'none', repeat: -1 });

  /* ------------------------------------------------------------
     scroll-in reveals
     ------------------------------------------------------------ */
  gsap.to('.list-head', {
    autoAlpha: 1,
    duration: 0.8,
    ease: 'power2.out',
    scrollTrigger: { trigger: '.list-section', start: 'top 80%', once: true },
  });

  ScrollTrigger.batch(rows, {
    start: 'top 94%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        autoAlpha: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.08,
      }),
  });

  gsap.to('.statement .line-inner', {
    yPercent: 0,
    duration: 1.0,
    ease: 'power3.out',
    stagger: 0.1,
    scrollTrigger: { trigger: '.outro', start: 'top 75%', once: true },
  });
  gsap.to(['.outro-copy', '.pill', '.site-footer'], {
    autoAlpha: 1,
    y: 0,
    duration: 0.9,
    ease: 'power3.out',
    stagger: 0.1,
    scrollTrigger: { trigger: '.outro', start: 'top 65%', once: true },
  });

  /* ------------------------------------------------------------
     mobile / card-mode inline parallax thumbnails
     ------------------------------------------------------------ */
  if (cardMq.matches) {
    document.querySelectorAll('.row-media img').forEach((img) => {
      gsap.fromTo(
        img,
        { yPercent: -7 },
        {
          yPercent: 7,
          ease: 'none',
          scrollTrigger: {
            trigger: img.closest('.row-media'),
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }
      );
    });
  }

  /* ------------------------------------------------------------
     desktop: title hover-marquees + WebGL hover reveal
     ------------------------------------------------------------ */
  let glApi = null;

  if (finePointerMq.matches) {
    /* build the hover marquee inside each title */
    rows.forEach((row) => {
      const titleEl = row.querySelector('.row-title');
      const text = titleEl.textContent.trim();
      const chunk = `${text} — `.repeat(4);
      titleEl.innerHTML =
        `<span class="t-static">${text}</span>` +
        `<span class="t-marquee" aria-hidden="true"><span>${chunk}</span><span>${chunk}</span></span>`;
    });

    /* WebGL layer (lazy import; page works without it) */
    const glCanvas = document.getElementById('gl');
    const hasWebGL = (() => {
      try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
      } catch (e) {
        return false;
      }
    })();

    if (glCanvas && hasWebGL) {
      import('./gl.js')
        .then((mod) => {
          glApi = mod.initGL({
            canvas: glCanvas,
            items: rows.map((row) => ({
              src: row.dataset.img,
              img: preloadedImages[row.dataset.img],
            })),
          });
        })
        .catch(() => {
          /* CDN/OGL failure — hover styling still works, just no image plane */
        });
    }
  }

  /* ------------------------------------------------------------
     row hover system (desktop)
     ------------------------------------------------------------ */
  rows.forEach((row, i) => {
    row.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || cardMq.matches) return;
      list.classList.add('hovering');
      row.classList.add('active');
      if (cursorEl) cursorEl.classList.add('is-play');
      sound.tick(i);
      if (glApi) glApi.show(i);
    });
    row.addEventListener('pointerleave', () => {
      row.classList.remove('active');
      if (cursorEl) cursorEl.classList.remove('is-play');
    });
  });
  list.addEventListener('pointerleave', () => {
    list.classList.remove('hovering');
    if (glApi) glApi.hide();
  });

  /* ------------------------------------------------------------
     custom cursor (dot + trailing ring → PLAY chip on rows)
     ------------------------------------------------------------ */
  if (finePointerMq.matches && cursorEl) {
    doc.classList.add('cursor-on');
    const dot = cursorEl.querySelector('.cursor-dot');
    const ring = cursorEl.querySelector('.cursor-ring');
    const setDotX = gsap.quickSetter(dot, 'x', 'px');
    const setDotY = gsap.quickSetter(dot, 'y', 'px');
    const setRingX = gsap.quickSetter(ring, 'x', 'px');
    const setRingY = gsap.quickSetter(ring, 'y', 'px');
    const m = { x: innerWidth / 2, y: innerHeight / 2 };
    const r = { x: m.x, y: m.y };
    cursorEl.classList.add('hidden');

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      m.x = e.clientX;
      m.y = e.clientY;
      cursorEl.classList.remove('hidden');
    });
    document.addEventListener('mouseleave', () => cursorEl.classList.add('hidden'));

    gsap.ticker.add(() => {
      setDotX(m.x);
      setDotY(m.y);
      r.x += (m.x - r.x) * 0.16;
      r.y += (m.y - r.y) * 0.16;
      setRingX(r.x);
      setRingY(r.y);
    });
  }

  /* ------------------------------------------------------------
     click → expand-to-fullscreen launch transition
     ------------------------------------------------------------ */
  let launching = false;

  function flashAndGo(href) {
    gsap
      .timeline()
      .to('#flash', { opacity: 1, duration: 0.12, ease: 'power1.in' })
      .call(() => {
        window.location.href = href;
      });
  }

  function domExpand(row) {
    const media = row.querySelector('.row-media');
    let r;
    if (media && media.offsetParent !== null) {
      r = media.getBoundingClientRect();
    } else {
      const rr = row.getBoundingClientRect();
      r = {
        left: rr.left + rr.width * 0.3,
        top: rr.top,
        width: rr.width * 0.4,
        height: rr.height,
      };
    }
    expanderImg.src = row.dataset.img;
    gsap.set(expander, {
      display: 'block',
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    });
    return gsap.to(expander, {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      duration: 0.65,
      ease: 'expo.inOut',
    });
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    /* let modified clicks behave natively (new tab etc.) */
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (launching) return;
    launching = true;

    sound.thump();
    if (lenis) lenis.stop();
    const href = row.href;
    const i = rows.indexOf(row);

    if (glApi && glApi.isActive(i)) {
      glApi.expand(i).then(() => flashAndGo(href));
    } else {
      domExpand(row).then(() => flashAndGo(href));
    }
  });

  /* restore state when coming back via bfcache */
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    launching = false;
    if (lenis) lenis.start();
    gsap.set('#flash', { opacity: 0 });
    gsap.set('#expander', { display: 'none' });
    if (glApi) glApi.reset();
    list.classList.remove('hovering');
    rows.forEach((row) => row.classList.remove('active'));
  });
})();
