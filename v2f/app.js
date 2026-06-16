/* ============================================================
   v2f — PATCH NOTES FROM THE VOID · app.js
   loop scroll · reveals · velocity skew · image trail ·
   command palette · launch transition · procedural sound
   ============================================================ */
(function () {
  'use strict';

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var motionOK = !reduceMQ.matches && !!window.gsap;
  var lenisOK = motionOK && !!window.Lenis;

  var docEl = document.documentElement;
  var unit = document.getElementById('loopUnit');
  var loopEl = document.getElementById('loop');
  var ringFill = document.getElementById('ringFill');
  var lapEl = document.getElementById('lapCounter');
  var pageNoEl = document.getElementById('pageNo');
  var trailLayer = document.getElementById('trailLayer');
  var toastEl = document.getElementById('toast');
  var RING_C = 69.12;
  var COFFEE_URL = 'https://buymeacoffee.com/jojkos';

  if (!motionOK) docEl.classList.add('no-phys');

  /* ---------- canonical game list (read from the real HTML) ---------- */
  var GAMES = [];
  unit.querySelectorAll('.entry').forEach(function (e) {
    GAMES.push({
      el: e,
      name: e.dataset.name,
      tag: e.dataset.tag,
      url: e.dataset.url,
      img: e.dataset.img,
      num: e.querySelector('.rail span').textContent
    });
  });

  function gameForEntry(entry) {
    for (var i = 0; i < GAMES.length; i++) {
      if (GAMES[i].name === entry.dataset.name) return GAMES[i];
    }
    return null;
  }

  /* ============================================================
     SOUND — tiny, procedural, OFF by default (browsers need a gesture to play
     audio, so it stays an explicit opt-in via the [SND] toggle)
     ============================================================ */
  var SND = window.SND = {
    on: false,
    ctx: null,
    whirGain: null,
    ensure: function () {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    },
    blip: function (freq, dur, type, gain, when) {
      if (!this.on || !this.ctx) return;
      var c = this.ctx, t = c.currentTime + (when || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise: function (dur, filterFreq, gain) {
      if (!this.on || !this.ctx) return;
      var c = this.ctx, t = c.currentTime;
      var len = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = c.createBufferSource(); src.buffer = buf;
      var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = filterFreq;
      var g = c.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start(t);
    },
    tick: function () { this.blip(1400, 0.035, 'square', 0.022); },
    rip: function () { this.noise(0.22, 900, 0.12); },
    kachunk: function () { this.blip(160, 0.07, 'square', 0.06); this.blip(92, 0.1, 'square', 0.07, 0.085); },
    initWhir: function () {
      if (this.whirGain || !this.ctx) return;
      var c = this.ctx;
      var len = c.sampleRate * 1;
      var buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 1.2;
      var g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start();
      this.whirGain = g.gain;
    },
    setWhir: function (v) { if (this.whirGain) this.whirGain.value = v; }
  };

  var sndBtn = document.getElementById('sndBtn');
  sndBtn.addEventListener('click', function () {
    SND.on = !SND.on;
    if (SND.on && SND.ensure()) SND.initWhir();
    if (!SND.on) SND.setWhir(0);
    sndBtn.textContent = SND.on ? '[SND ON]' : '[SND OFF]';
    sndBtn.setAttribute('aria-pressed', String(SND.on));
    if (SND.on) SND.kachunk();
  });

  /* ============================================================
     TOAST
     ============================================================ */
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (window.gsap) gsap.fromTo(toastEl, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.18, overwrite: true });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2400);
  }

  /* ============================================================
     MARQUEE — duplicate content once for a seamless -50% loop
     ============================================================ */
  var track = document.getElementById('marqueeTrack');
  track.innerHTML += track.innerHTML;

  /* ============================================================
     REVEALS (print-in) + center color snap — IntersectionObserver
     ============================================================ */
  function prepEntry(entry) {
    gsap.set(entry, { clipPath: 'inset(0 100% 0 0)' });
    gsap.set(entry.querySelectorAll('.log > *'), { y: 14, autoAlpha: 0 });
    gsap.set(entry.querySelector('.rail span'), { autoAlpha: 0 });
    gsap.set(entry.querySelector('.fig img'), { clipPath: 'inset(0 0 100% 0)' });
  }

  function revealEntry(entry) {
    if (entry.dataset.revealed) return;   /* guard: IO + ticker sweep can both target it */
    entry.dataset.revealed = '1';
    var kids = entry.querySelectorAll('.log > *');
    var img = entry.querySelector('.fig img');
    var rail = entry.querySelector('.rail span');
    gsap.timeline({ defaults: { ease: 'power4.out' } })
      .to(entry, { clipPath: 'inset(0 0% 0 0)', duration: 0.38, onStart: function () { SND.tick(); } })
      .to(rail, { autoAlpha: 1, duration: 0.3 }, '-=0.2')
      .to(kids, { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.045, onStart: function () { SND.tick(); } }, '-=0.25')
      .to(img, { clipPath: 'inset(0 0 0% 0)', duration: 0.5 }, '<')
      .add(function () {
        gsap.set([entry, img], { clearProps: 'clipPath' });
        gsap.set(kids, { clearProps: 'transform,opacity,visibility' });
        gsap.set(rail, { clearProps: 'opacity,visibility' });
      });
  }

  /* set of entries near the viewport (used by velocity skew) */
  var nearSet = new Set();

  function observeEntries() {
    var all = document.querySelectorAll('.entry');

    if (motionOK) {
      var revealIO = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (en.isIntersecting) {
            revealIO.unobserve(en.target);
            revealEntry(en.target);
          }
        });
      }, { rootMargin: '200px 0px 200px 0px', threshold: 0 });
      all.forEach(function (e) { revealIO.observe(e); });

      /* Safety net: on the cloned infinite-loop layout the IntersectionObserver can
         fail to deliver reveal callbacks, leaving every entry clipped forever. Sweep
         on the (already-running) ticker and reveal anything that is actually on-screen
         but still hidden; stop once nothing is left to reveal. */
      var revealSweep = function () {
        var vh = window.innerHeight, remaining = 0;
        for (var i = 0; i < all.length; i++) {
          var e = all[i];
          if (e.dataset.revealed) continue;
          remaining++;
          var r = e.getBoundingClientRect();
          if (r.top < vh + 200 && r.bottom > -200) {
            revealIO.unobserve(e);
            revealEntry(e);
          }
        }
        if (!remaining) gsap.ticker.remove(revealSweep);
      };
      gsap.ticker.add(revealSweep);
    }

    var focusIO = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        en.target.classList.toggle('in-focus', en.isIntersecting);
      });
    }, { rootMargin: '-36% 0px -36% 0px', threshold: 0 });
    all.forEach(function (e) { focusIO.observe(e); });

    if (motionOK) {
      var nearIO = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (en.isIntersecting) nearSet.add(en.target);
          else { nearSet.delete(en.target); en.target.style.transform = ''; }
        });
      }, { rootMargin: '25% 0px 25% 0px', threshold: 0 });
      all.forEach(function (e) { nearIO.observe(e); });
    }
  }

  /* ============================================================
     INFINITE LOOP — Lenis + cloned unit + modulo wrap
     ============================================================ */
  var lenis = null;
  var H = 0;          // height of one loop unit
  var lap = 1;
  var velocity = 0;   // latest lenis velocity
  var velobar = document.getElementById('velobar');

  function updateLap() {
    lapEl.textContent = 'LAP ' + String(lap).padStart(2, '0');
    if (pageNoEl) pageNoEl.textContent = String(lap);
  }

  function setupLoop() {
    if (!lenisOK) return;

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    /* clone the whole unit once: real DOM, ids stripped, AT-hidden */
    var clone = unit.cloneNode(true);
    clone.classList.add('is-clone');
    clone.removeAttribute('id');
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    clone.querySelectorAll('a, button, input').forEach(function (n) { n.setAttribute('tabindex', '-1'); });
    loopEl.appendChild(clone);

    docEl.classList.add('loop-on');

    H = unit.offsetHeight;
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { H = unit.offsetHeight; }).observe(unit);
    }

    lenis = new Lenis({ infinite: true, syncTouch: true, lerp: 0.11 });

    lenis.on('scroll', function (e) {
      velocity = e.velocity || 0;
      var s = e.scroll;
      if (H && s >= H) {
        if (velocity >= 0) lap++; else lap = Math.max(1, lap - 1);
        updateLap();
        lenis.scrollTo(s - H, { immediate: true, force: true });
        s -= H;
      }
      var p = H ? (s % H) / H : 0;
      if (p < 0) p += 1;
      ringFill.style.strokeDashoffset = (RING_C * (1 - p)).toFixed(2);
    });

    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);

    /* velocity reactions: type skew + accent bar thickening + whir */
    var skew = 0;
    gsap.ticker.add(function () {
      var target = gsap.utils.clamp(-4, 4, velocity * 0.06);
      skew += (target - skew) * 0.12;
      var v = Math.abs(velocity);
      if (Math.abs(skew) < 0.02) {
        nearSet.forEach(function (el) { if (el.style.transform) el.style.transform = ''; });
      } else {
        var t = 'skewY(' + skew.toFixed(3) + 'deg)';
        nearSet.forEach(function (el) { el.style.transform = t; });
      }
      velobar.style.transform = 'scaleY(' + (0.5 + Math.min(3, v / 22)).toFixed(2) + ')';
      SND.setWhir(SND.on ? Math.min(0.05, Math.max(0, (v - 12) / 900)) : 0);
      velocity *= 0.96; /* decay between scroll events */
    });

    /* brand link → smooth-scroll home */
    document.querySelectorAll('a[href="#top"]').forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        lenis.scrollTo(0, { duration: 1 });
      });
    });
  }

  function scrollToEntry(el) {
    if (lenis) lenis.scrollTo(el, { offset: -56, duration: 0.9 });
    else el.scrollIntoView({ block: 'start' });
  }

  /* ============================================================
     IMAGE TRAIL — scattered photo prints, capped + GC'd
     ============================================================ */
  var prints = [];
  var TRAIL_MAX = 8;
  var TRAIL_STEP = 90;
  var lastTX = -1e4, lastTY = -1e4;

  function spawnPrint(img, x, y) {
    var el = document.createElement('div');
    el.className = 'print';
    var im = document.createElement('img');
    im.src = img; im.alt = ''; im.draggable = false;
    el.appendChild(im);
    trailLayer.appendChild(el);

    var rot = gsap.utils.random(-12, 12);
    gsap.set(el, { left: x - 70, top: y - 50, rotation: rot * 1.6, scale: 0.3, autoAlpha: 0 });
    gsap.timeline({
      onComplete: function () {
        el.remove();
        var i = prints.indexOf(el);
        if (i > -1) prints.splice(i, 1);
      }
    })
      .to(el, { scale: 1, autoAlpha: 1, rotation: rot, duration: 0.22, ease: 'power3.out' })
      .to(el, { y: '+=70', autoAlpha: 0, rotation: rot + gsap.utils.random(-10, 10), duration: 0.55, ease: 'power2.in' }, '+=0.32');

    prints.push(el);
    while (prints.length > TRAIL_MAX) {
      var old = prints.shift();
      gsap.killTweensOf(old);
      old.remove();
    }
  }

  if (motionOK) {
    document.addEventListener('pointermove', function (e) {
      if (palOpen) return;
      var entry = e.target.closest && e.target.closest('.entry');
      if (!entry || entry.dataset.launching) return;
      /* on touch, only the figure scrub spawns prints */
      if (e.pointerType !== 'mouse' && !e.target.closest('.fig')) return;
      var dx = e.clientX - lastTX, dy = e.clientY - lastTY;
      if (dx * dx + dy * dy < TRAIL_STEP * TRAIL_STEP) return;
      lastTX = e.clientX; lastTY = e.clientY;
      spawnPrint(entry.dataset.img, e.clientX, e.clientY);
    }, { passive: true });
  }

  /* ============================================================
     LAUNCH — fake build log, figure expand, navigate
     ============================================================ */
  function slug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function buildLog(entry, game) {
    return new Promise(function (resolve) {
      var box = document.createElement('div');
      box.className = 'buildlog';
      box.setAttribute('aria-hidden', 'true');
      entry.appendChild(box);
      var s = slug(game.name);
      var lines = [
        '$ deploy ' + s + ' --prod',
        '> bundling 1 game, 0 tests',
        '> uploading to the void … ok',
        '✓ 0 errors · 1 ' + game.tag.toLowerCase() + ' · ready'
      ];
      var i = 0;
      var iv = setInterval(function () {
        var line = document.createElement('div');
        if (i === lines.length - 1) line.className = 'ok';
        line.textContent = lines[i];
        box.appendChild(line);
        SND.tick();
        if (++i >= lines.length) {
          clearInterval(iv);
          setTimeout(resolve, 240);
        }
      }, 130);
    });
  }

  function expandAndGo(entry, url) {
    var img = entry.querySelector('.fig img');
    var go = function () { window.location.href = url; };
    if (!img) return go();
    var r = img.getBoundingClientRect();
    var clone = img.cloneNode();
    clone.className = 'expander';
    clone.removeAttribute('loading');
    clone.style.left = r.left + 'px';
    clone.style.top = r.top + 'px';
    clone.style.width = r.width + 'px';
    clone.style.height = r.height + 'px';
    clone.style.filter = 'none';
    document.body.appendChild(clone);

    if (document.startViewTransition) {
      var vt = document.startViewTransition(function () { clone.classList.add('full'); });
      vt.finished.then(go, go);
    } else {
      gsap.to(clone, {
        left: 0, top: 0, width: window.innerWidth, height: window.innerHeight,
        duration: 0.5, ease: 'power4.inOut', onComplete: go
      });
    }
  }

  function launchGame(game, entryEl) {
    if (!game) return;
    closePalette();
    if (!motionOK) { window.location.href = game.url; return; }
    var entry = entryEl || game.el;
    if (entry.dataset.launching) return;
    entry.dataset.launching = '1';
    entry.style.transform = '';
    nearSet.delete(entry);
    SND.kachunk();
    var start = function () {
      buildLog(entry, game).then(function () { expandAndGo(entry, game.url); });
    };
    var r = entry.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) {
      /* launched from the palette while the entry is offscreen: ride there first */
      scrollToEntry(entry);
      setTimeout(start, 750);
    } else {
      start();
    }
  }

  document.addEventListener('click', function (e) {
    var run = e.target.closest && e.target.closest('.run');
    if (!run || !motionOK) return; /* without motion: plain link navigation */
    e.preventDefault();
    var entry = run.closest('.entry');
    launchGame(gameForEntry(entry), entry);
  });

  /* ============================================================
     COMMAND PALETTE
     ============================================================ */
  var veil = document.getElementById('paletteVeil');
  var palInput = document.getElementById('palInput');
  var palList = document.getElementById('palList');
  var palOpen = false;
  var prevFocus = null;
  var items = [];   /* current rendered items: {label, desc, action} */
  var selIdx = 0;
  var rolling = false;

  function fuzzy(q, s) {
    q = q.toLowerCase(); s = s.toLowerCase();
    var qi = 0, score = 0, last = -2;
    for (var i = 0; i < s.length && qi < q.length; i++) {
      if (s[i] === q[qi]) {
        score += (i === last + 1 ? 3 : 1) + (i === 0 ? 2 : 0);
        last = i; qi++;
      }
    }
    return qi === q.length ? score : -1;
  }

  function gameItems(query, action) {
    var list = GAMES.map(function (g) {
      var sc = query ? fuzzy(query, g.name) : 0;
      if (query && sc < 0 && String(parseInt(query, 10)) === query) {
        if (parseInt(query, 10) === parseInt(g.num, 10)) sc = 100;
      }
      return { g: g, sc: sc };
    }).filter(function (x) { return x.sc >= 0; });
    list.sort(function (a, b) { return b.sc - a.sc; });
    return list.map(function (x) {
      return {
        label: x.g.num + ' ' + x.g.name,
        desc: x.g.tag + (action === 'jump' ? ' · jump' : ' · launch'),
        action: function () {
          if (action === 'jump') { closePalette(); scrollToEntry(x.g.el); }
          else launchGame(x.g);
        }
      };
    });
  }

  var COMMANDS = [
    { key: '/play', desc: '<name|index> · launch a game', expand: '/play ' },
    { key: '/random', desc: 'let the void decide', run: function () { slotRoll(); } },
    { key: '/list', desc: 'jump-list of all 14', expand: '/list ' },
    {
      key: '/chaos', desc: 'break everything for 10s', run: function () {
        closePalette();
        if (!motionOK || !window.Phys) { toast('chaos respectfully declined (reduced motion)'); return; }
        window.Phys.chaos();
        toast('entropy enabled · auto-rebuild in 10s');
      }
    },
    {
      key: '/order', desc: 'rebuild everything', run: function () {
        closePalette();
        if (window.Phys) window.Phys.order();
        toast('order restored · 0 letters lost');
      }
    },
    {
      key: '/coffee', desc: 'fund the void', run: function () {
        closePalette();
        window.open(COFFEE_URL, '_blank', 'noopener');
        toast('+ funded: 1 coffee · thank you');
      }
    },
    {
      key: '/dark', desc: 'lights out', run: function () {
        docEl.setAttribute('data-theme', 'dark');
        toast('theme: ink on ink');
      }
    },
    {
      key: '/light', desc: 'paper mode', run: function () {
        docEl.setAttribute('data-theme', 'light');
        toast('theme: back to paper');
      }
    }
  ];

  function commandItems(query) {
    return COMMANDS.filter(function (c) {
      return !query || c.key.indexOf(query.toLowerCase()) === 0 || fuzzy(query, c.key) >= 0;
    }).map(function (c) {
      return {
        label: c.key,
        desc: c.desc,
        action: function () {
          if (c.expand) { palInput.value = c.expand; renderPalette(); palInput.focus(); }
          else c.run();
        }
      };
    });
  }

  function renderItems(arr) {
    items = arr;
    selIdx = 0;
    palList.innerHTML = '';
    if (!arr.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'no matches. the void is also empty.';
      palList.appendChild(li);
      palInput.setAttribute('aria-activedescendant', '');
      return;
    }
    arr.forEach(function (it, i) {
      var li = document.createElement('li');
      li.id = 'opt-' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === selIdx ? 'true' : 'false');
      var k = document.createElement('span'); k.className = 'k'; k.textContent = it.label;
      var d = document.createElement('span'); d.className = 'd'; d.textContent = it.desc || '';
      li.appendChild(k); li.appendChild(d);
      li.addEventListener('click', function () { it.action && it.action(); });
      li.addEventListener('mousemove', function () { setSel(i); });
      palList.appendChild(li);
    });
    setSel(0);
  }

  function setSel(i) {
    if (!items.length) return;
    selIdx = (i + items.length) % items.length;
    palList.querySelectorAll('li').forEach(function (li, j) {
      li.setAttribute('aria-selected', j === selIdx ? 'true' : 'false');
    });
    var el = document.getElementById('opt-' + selIdx);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
      palInput.setAttribute('aria-activedescendant', el.id);
    }
  }

  function renderPalette() {
    if (rolling) return;
    var v = palInput.value.trim();
    if (!v) {
      renderItems(commandItems('').concat(gameItems('', 'launch')));
    } else if (v[0] === '/') {
      var sp = v.indexOf(' ');
      var cmd = sp === -1 ? v : v.slice(0, sp);
      var arg = sp === -1 ? '' : v.slice(sp + 1).trim();
      if (cmd === '/play') renderItems(gameItems(arg, 'launch'));
      else if (cmd === '/list') renderItems(gameItems(arg, 'jump'));
      else renderItems(commandItems(cmd));
    } else {
      renderItems(gameItems(v, 'launch'));
    }
  }

  function slotRoll() {
    if (rolling) return;
    rolling = true;
    palInput.value = '/random';
    palInput.disabled = true;
    var pick = GAMES[Math.floor(Math.random() * GAMES.length)];
    var i = Math.floor(Math.random() * GAMES.length);
    var iv = setInterval(function () {
      palList.innerHTML = '';
      var li = document.createElement('li');
      li.setAttribute('aria-selected', 'true');
      var k = document.createElement('span'); k.className = 'k';
      k.textContent = '⟳ ' + GAMES[i % GAMES.length].name;
      var d = document.createElement('span'); d.className = 'd'; d.textContent = 'rolling…';
      li.appendChild(k); li.appendChild(d);
      palList.appendChild(li);
      SND.tick();
      i++;
    }, 60);
    setTimeout(function () {
      clearInterval(iv);
      rolling = false;
      palInput.disabled = false;
      launchGame(pick);
    }, 950);
  }

  function openPalette() {
    if (palOpen) return;
    palOpen = true;
    prevFocus = document.activeElement;
    veil.hidden = false;
    palInput.value = '';
    renderPalette();
    palInput.focus();
    if (lenis) lenis.stop();
  }

  function closePalette() {
    if (!palOpen) return;
    palOpen = false;
    veil.hidden = true;
    if (lenis) lenis.start();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  }

  palInput.addEventListener('input', renderPalette);
  palInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(selIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(selIdx - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selIdx] && items[selIdx].action) items[selIdx].action();
    }
  });

  document.getElementById('palBtn').addEventListener('click', openPalette);
  document.getElementById('palClose').addEventListener('click', closePalette);
  veil.addEventListener('mousedown', function (e) { if (e.target === veil) closePalette(); });

  /* focus trap */
  veil.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = [palInput, document.getElementById('palClose')];
    var i = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  });

  document.addEventListener('keydown', function (e) {
    var typing = e.target.matches && e.target.matches('input, textarea, select, [contenteditable]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      palOpen ? closePalette() : openPalette();
    } else if (e.key === '/' && !typing && !palOpen) {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape' && palOpen && !rolling) {
      closePalette();
    }
  });

  /* ============================================================
     INIT
     ============================================================ */
  if (motionOK) {
    unit.querySelectorAll('.entry').forEach(prepEntry); /* before clone, so the clone inherits */
  }
  setupLoop();
  observeEntries();
  updateLap();
})();
