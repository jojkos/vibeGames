/* ============================================================
   v2f — PATCH NOTES FROM THE VOID · physics.js
   per-entry Matter.js title break / rebuild
   - Matter.js is lazy-loaded from CDN on first break
   - one engine per broken entry, created/destroyed on demand
   - letters move via transform only: layout never reflows
   ============================================================ */
(function () {
  'use strict';

  var MATTER_CDN = 'https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var matterPromise = null;
  var active = new Map();   /* entry el -> {engine, bodies, spans, title, sleeping} */
  var order_ = [];          /* break order, for the cap */
  var CAP_NORMAL = 2;
  var cap = CAP_NORMAL;
  var rafId = null;
  var chaosOn = false;
  var chaosTimer = null;

  /* ---------- split titles into letter spans (runs immediately) ---------- */
  function splitTitles() {
    document.querySelectorAll('.title').forEach(function (t) {
      if (t.dataset.split) return;
      var text = t.textContent;
      t.setAttribute('aria-label', text);
      t.textContent = '';
      for (var i = 0; i < text.length; i++) {
        var s = document.createElement('span');
        s.className = 'ch';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = text[i];
        t.appendChild(s);
      }
      t.dataset.split = '1';
    });
  }
  splitTitles();

  if (reduced) {
    window.Phys = {
      chaos: function () {},
      order: function () {},
      breakEntry: function () {},
      rebuild: function () {}
    };
    return;
  }

  function loadMatter() {
    if (window.Matter) return Promise.resolve();
    if (!matterPromise) {
      matterPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = MATTER_CDN;
        s.onload = resolve;
        s.onerror = function () { matterPromise = null; reject(new Error('matter load failed')); };
        document.head.appendChild(s);
      });
    }
    return matterPromise;
  }

  /* ---------- shared render loop for all active worlds ---------- */
  function startLoop() {
    if (rafId) return;
    var prev = performance.now();
    function step(now) {
      var dt = Math.min(32, now - prev);
      prev = now;
      active.forEach(function (rec) {
        if (rec.sleeping) return;
        Matter.Engine.update(rec.engine, dt);
        var allSleep = true;
        for (var i = 0; i < rec.bodies.length; i++) {
          var b = rec.bodies[i];
          if (!b.isSleeping) allSleep = false;
          var p = b.plugin;
          p.span.style.transform =
            'translate(' + (b.position.x - p.ox).toFixed(1) + 'px,' +
            (b.position.y - p.oy).toFixed(1) + 'px) rotate(' + b.angle.toFixed(3) + 'rad)';
        }
        rec.sleeping = allSleep;
      });
      rafId = active.size ? requestAnimationFrame(step) : null;
    }
    rafId = requestAnimationFrame(step);
  }

  function toggleBtns(entry, broken) {
    var bb = entry.querySelector('.break-btn');
    var rb = entry.querySelector('.rebuild-btn');
    if (bb) bb.hidden = broken;
    if (rb) rb.hidden = !broken;
  }

  /* ---------- break ---------- */
  function breakEntry(entry, vx) {
    if (!entry || active.has(entry) || entry.dataset.launching) return;
    loadMatter().then(function () {
      if (active.has(entry)) return;
      while (active.size >= cap && order_.length) rebuild(order_[0]);

      var title = entry.querySelector('.title');
      if (!title) return;
      entry.style.transform = ''; /* clear velocity skew before measuring */

      var spans = Array.prototype.filter.call(
        title.querySelectorAll('.ch'),
        function (s) { return s.textContent.trim(); }
      );
      if (!spans.length) return;

      var M = Matter;
      var eRect = entry.getBoundingClientRect();
      var engine = M.Engine.create({ enableSleeping: true });
      engine.gravity.y = 1.15;

      var push = typeof vx === 'number' ? vx : (Math.random() - 0.5) * 6;
      var bodies = spans.map(function (s) {
        var r = s.getBoundingClientRect();
        var cx = r.left - eRect.left + r.width / 2;
        var cy = r.top - eRect.top + r.height / 2;
        var b = M.Bodies.rectangle(cx, cy, Math.max(r.width, 8), Math.max(r.height * 0.82, 12), {
          restitution: 0.25,
          friction: 0.4,
          frictionAir: 0.014
        });
        b.plugin = { span: s, ox: cx, oy: cy };
        M.Body.setVelocity(b, {
          x: push * (0.4 + Math.random() * 0.8),
          y: -(1.5 + Math.random() * 4)
        });
        M.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.3);
        return b;
      });

      var w = eRect.width, h = eRect.height, t = 80;
      var walls = [
        M.Bodies.rectangle(w / 2, h + t / 2 - 2, w + t * 2, t, { isStatic: true }), /* floor: entry bottom border */
        M.Bodies.rectangle(-t / 2 + 1, h / 2, t, h * 4, { isStatic: true }),
        M.Bodies.rectangle(w + t / 2 - 1, h / 2, t, h * 4, { isStatic: true })
      ];
      M.Composite.add(engine.world, bodies.concat(walls));

      title.classList.add('is-broken');
      toggleBtns(entry, true);
      active.set(entry, { engine: engine, bodies: bodies, spans: spans, title: title, sleeping: false });
      order_.push(entry);
      startLoop();
      if (window.SND) window.SND.rip();
    }).catch(function () { /* CDN down: titles simply stay solid */ });
  }

  /* ---------- rebuild ---------- */
  function rebuild(entry) {
    var rec = active.get(entry);
    if (!rec) return;
    active.delete(entry);
    var oi = order_.indexOf(entry);
    if (oi > -1) order_.splice(oi, 1);

    Matter.World.clear(rec.engine.world, false);
    Matter.Engine.clear(rec.engine);

    rec.spans.forEach(function (s, i) {
      if (window.gsap) {
        gsap.to(s, {
          x: 0, y: 0, rotation: 0,
          duration: 0.55,
          delay: i * 0.012,
          ease: 'power4.inOut',
          overwrite: true,
          clearProps: 'transform'
        });
      } else {
        s.style.transform = '';
      }
    });
    setTimeout(function () { rec.title.classList.remove('is-broken'); }, 700);
    toggleBtns(entry, false);
    if (window.SND) window.SND.kachunk();
  }

  /* ---------- chaos / order ---------- */
  function chaos() {
    if (chaosOn) return;
    chaosOn = true;
    cap = 99;
    loadMatter().then(function () {
      var entries = document.querySelectorAll('.entry');
      entries.forEach(function (e, i) {
        setTimeout(function () { breakEntry(e, (Math.random() - 0.5) * 10); }, i * 70);
      });
      if (window.gsap) {
        document.querySelectorAll('.fig img').forEach(function (img) {
          gsap.to(img, {
            y: gsap.utils.random(40, 110),
            rotation: gsap.utils.random(-7, 7),
            duration: 0.9,
            ease: 'bounce.out',
            overwrite: true
          });
        });
      }
      clearTimeout(chaosTimer);
      chaosTimer = setTimeout(orderAll, 10000);
    }).catch(function () { chaosOn = false; cap = CAP_NORMAL; });
  }

  function orderAll() {
    clearTimeout(chaosTimer);
    cap = CAP_NORMAL;
    chaosOn = false;
    order_.slice().forEach(rebuild);
    if (window.gsap) {
      document.querySelectorAll('.fig img').forEach(function (img) {
        gsap.to(img, { y: 0, rotation: 0, duration: 0.6, ease: 'power3.inOut', overwrite: true, clearProps: 'transform' });
      });
    }
  }

  /* ---------- interactions (delegated: works for clones too) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var bb = t.closest('.break-btn');
    if (bb) { breakEntry(bb.closest('.entry')); return; }
    var rb = t.closest('.rebuild-btn');
    if (rb) rebuild(rb.closest('.entry'));
  });

  /* flick: fast horizontal pointer move across a title */
  var fx = 0, ft = 0;
  document.addEventListener('pointermove', function (e) {
    var title = e.target.closest && e.target.closest('.title');
    if (!title) { ft = 0; return; }
    var now = e.timeStamp;
    if (ft && now > ft) {
      var dt = now - ft;
      var vx = (e.clientX - fx) / dt;
      if (dt < 60 && Math.abs(vx) > 1.7 && !title.classList.contains('is-broken')) {
        breakEntry(title.closest('.entry'), vx * 4);
      }
    }
    fx = e.clientX; ft = now;
  }, { passive: true });

  /* positions go stale on resize: snap everything back */
  var rsT = null;
  window.addEventListener('resize', function () {
    clearTimeout(rsT);
    rsT = setTimeout(function () { if (active.size) orderAll(); }, 150);
  });

  window.Phys = {
    chaos: chaos,
    order: orderAll,
    breakEntry: breakEntry,
    rebuild: rebuild
  };
})();
