/* v2c MATRIX:OPERATOR — ui.js
 * Operator console: layout, program list, REAL command line, input mapping,
 * entry/launch sequences, CRT collapse, mobile mode. Everything is written
 * into the glyph grid — there is no DOM UI in red-pill mode.
 */
'use strict';
window.V2C = window.V2C || {};

V2C.ui = (function () {
  const G = V2C.grid, IC = V2C.imagecast, A = V2C.audio;

  const COFFEE_URL = 'https://buymeacoffee.com/jojkos';
  const COFFEE_COL = [255, 204, 0];   // the only non-green thing on screen
  const RED = [255, 64, 56];
  const BLUE = [70, 150, 255];

  const GAMES = [
    { name: 'Zoopaloola',           url: 'https://zoopaloola.vercel.app/',           tag: 'ARCADE',  img: '../screenshots/zoopaloola.png' },
    { name: 'Factorio Lamp Editor', url: 'https://factorio-lamp-editor.vercel.app/', tag: 'TOOL',    img: '../screenshots/factorio-lamp.png' },
    { name: 'LoL Fusion loldle',    url: 'https://lol-fusion.vercel.app/',           tag: 'PUZZLE',  img: '../screenshots/lol-fusion.png' },
    { name: 'Pug Fiesta',           url: 'https://pug-fiesta.vercel.app/',           tag: 'ACTION',  img: '../screenshots/pug-fiesta.png' },
    { name: 'Pug Fiesta 3D',        url: 'https://pug-fiesta3-d.vercel.app/',        tag: 'ACTION',  img: '../screenshots/pug-fiesta-3d.png' },
    { name: 'Combat Arena',         url: 'https://combatarena.onrender.com/',        tag: 'PVP',     img: '../screenshots/combat-arena.png' },
    { name: 'Bluff Helper',         url: '../bluff/index.html',                      tag: 'TOOL',    img: '../screenshots/bluff.png' },
    { name: 'Calendar Puzzle',      url: 'https://calendar-puzzle2.vercel.app/',     tag: 'PUZZLE',  img: '../screenshots/calendar-puzzle.png' },
    { name: 'Pokemon Shooter',      url: '../pokemonShooter/index.html',             tag: 'SHOOTER', img: '../screenshots/pokemon-shooter.png' },
    { name: 'Tralala Clicker',      url: '../tralalaGame/index.html',                tag: 'CLICKER', img: '../screenshots/tralala.png' },
    { name: 'LoL Wheel',            url: '../lolWheel/index.html',                   tag: 'RNG',     img: '../screenshots/lol-wheel.png' },
    { name: 'Neon Drifter',         url: '../neonDrifter/index.html',                tag: 'RACE',    img: '../screenshots/neon-drifter.png' },
    { name: 'Guitar Tuner',         url: '../guitarTuner/index.html',                tag: 'TOOL',    img: '../screenshots/guitar-tuner.png' },
    { name: 'OK Corral',            url: 'https://okcorral.onrender.com/',           tag: 'SHOOTER', img: '../screenshots/ok-corral.png' },
  ];

  // ---- state ---------------------------------------------------------------
  let mode = 'boot';        // boot | wake | rainin | pills | console | launching | dead
  let running = false;
  let firstVisit = false;
  let reduced = false;
  let L = null;             // layout
  let sel = 0;
  let sigHex = '0x4F2A';
  let cmd = '';
  let cmdOpen = false;      // mobile prompt visibility
  let cursorOn = true, blinkT = 0;
  let statusT = 0;
  let logs = [];            // {text, color, bright, until}
  let hits = [];            // {x,y,w,h,type,arg}
  let hoverRegion = null;
  let pending = [];         // cancellable timeouts
  let condenseTimer = null;
  let densityTarget = 1;
  let pillHover = null;     // 'red' | 'blue'
  let pillT = 0;
  let konami = [];
  let mobileInput = null;
  let lastTime = 0;

  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

  function sched(ms, fn) {
    const id = setTimeout(function () {
      const k = pending.indexOf(id);
      if (k >= 0) pending.splice(k, 1);
      fn();
    }, ms);
    pending.push(id);
    return id;
  }
  function clearPending() {
    pending.forEach(clearTimeout);
    pending.length = 0;
  }
  function randHex() {
    let s = '0x';
    for (let i = 0; i < 4; i++) s += '0123456789ABCDEF'[(Math.random() * 16) | 0];
    return s;
  }

  // ---- layout ----------------------------------------------------------------
  function layout() {
    const c = G.cols, r = G.rows;
    // mobile/vertical layout only when truly narrow or portrait-narrow;
    // landscape phones get the two-column layout (it fits, the stack doesn't)
    const m = c < 44 || (c < 64 && r > c);
    L = { mobile: m, cols: c, rows: r };
    L.headerY = 1;
    L.soundX = c - 9;   // [♪]
    L.pillX = c - 5;    // [●]
    if (!m) {
      L.listX = 3; L.listY = 4;
      L.listW = Math.min(34, Math.floor(c * 0.42));
      L.tagW = L.listW >= 26 ? 7 : 0;
      L.boxX = L.listX + L.listW + 2;
      L.boxY = 3;
      L.boxW = c - 2 - L.boxX;
      L.boxH = r - 9;            // bottom border at r-6
      L.statusY = r - 5;
      L.loadY = r - 4;
      L.statusX = L.boxX;
      L.promptY = r - 2;
      L.promptX = 2;
      L.coffeeX = c - 20;
      L.logX = 3;
      L.logW = Math.max(20, L.boxX - 5);
      L.logBottom = L.promptY - 1;
      L.maxLogs = Math.min(14, Math.max(4, L.logBottom - (L.listY + 16)));
    } else {
      L.listX = 1; L.listY = 3;
      L.listW = c - 2;
      L.tagW = c >= 27 ? 7 : 0;
      L.boxX = 1;
      L.boxY = L.listY + 16;
      L.boxW = c - 2;
      L.boxH = Math.max(7, r - L.boxY - 6);
      L.statusY = L.boxY + L.boxH;
      L.loadY = L.statusY + 1;
      L.statusX = 1;
      L.promptY = r - 2;
      L.promptX = 1;
      L.coffeeX = c - 19;
      L.logX = 1;
      L.logW = c - 2;
      L.logBottom = L.listY + 14;   // logs overlay the list area on mobile
      L.maxLogs = 14;
    }
    L.nameW = Math.max(4, L.listW - 6 - L.tagW);
    // image region: fit ~16:9 inside the box interior, centered
    const iw = L.boxW - 2, ih = L.boxH - 2;
    let rw = iw, rh = Math.round(iw * 9 / 16);
    if (rh > ih) { rh = ih; rw = Math.min(iw, Math.round(ih * 16 / 9)); }
    L.imgRegion = {
      x: L.boxX + 1 + Math.floor((iw - rw) / 2),
      y: L.boxY + 1 + Math.floor((ih - rh) / 2),
      w: rw, h: rh,
    };
    L.promptPrefix = m ? '$ ' : 'operator@construct:~$ ';
    L.cmdMax = Math.max(6, (m ? c - 3 : L.coffeeX - 2) - L.promptX - L.promptPrefix.length - 2);
  }

  // ---- painting ----------------------------------------------------------------
  function th() { return G.theme; }

  function removeHitsAtRow(y) {
    for (let i = hits.length - 1; i >= 0; i--) {
      if (hits[i].y === y && hits[i].h === 1) hits.splice(i, 1);
    }
  }

  function paintHeader() {
    const c = G.cols;
    const t = th();
    removeHitsAtRow(L.headerY);
    let title = 'OPERATOR CONSOLE v2 · NODE JOJKOS · 14 PROGRAMS LOADED';
    if (L.mobile) title = 'OPERATOR · NODE JOJKOS';
    title = title.slice(0, L.soundX - 3);
    G.clearRegion(0, L.headerY, c, 1);
    G.text(2, L.headerY, title, { color: t.accent, bright: 0.95 });
    G.text(L.soundX, L.headerY, A.isMuted() ? '[ ]' : '[♪]', { color: t.body, bright: 0.9 });
    G.text(L.pillX, L.headerY, '[●]', { color: BLUE, bright: 0.95 });
    addHit(L.soundX, L.headerY, 3, 1, 'sound');
    addHit(L.pillX, L.headerY, 3, 1, 'pillbtn');
  }

  function itemRowY(i) { return L.listY + 1 + i; }

  function paintRow(i) {
    const t = th();
    const y = itemRowY(i);
    const g = GAMES[i];
    const isSel = i === sel;
    let name = g.name.toUpperCase();
    if (name.length > L.nameW) name = name.slice(0, L.nameW - 1) + '…';
    let s = (isSel ? '▸ ' : '  ') + String(i + 1).padStart(2, '0') + ' ' + name.padEnd(L.nameW + 1, ' ');
    if (L.tagW) s += g.tag.padStart(L.tagW, ' ');
    s = s.slice(0, L.listW);
    G.text(L.listX, y, s.padEnd(L.listW, ' '), {
      color: t.body,
      bright: isSel ? 1 : 0.62,
      inv: isSel,
    });
  }

  function paintList() {
    G.text(L.listX, L.listY, '> PROGRAMS'.padEnd(L.listW, ' '), { color: th().accent, bright: 0.9 });
    for (let i = 0; i < GAMES.length; i++) paintRow(i);
  }

  function paintBox() {
    const t = th(), x = L.boxX, y = L.boxY, w = L.boxW, h = L.boxH;
    const o = { color: t.dim, bright: 1 };
    G.text(x, y, '┌' + '─'.repeat(Math.max(0, w - 2)) + '┐', o);
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      G.setCell(x, yy, '│', t.dim, 1, G.UI);
      G.setCell(x + w - 1, yy, '│', t.dim, 1, G.UI);
    }
    G.text(x, y + h - 1, '└' + '─'.repeat(Math.max(0, w - 2)) + '┘', o);
    addHit(x, y, w, h, 'preview');
  }

  function paintStatus() {
    const t = th();
    const casting = IC.isCasting();
    const pct = Math.round(IC.previewProgress() * 100);
    const label = casting ? ('CONDENSING ' + pct + '%') : 'TRACE STABLE';
    const s = ('SIG ' + sigHex + ' · ' + label).padEnd(Math.min(G.cols - L.statusX - 1, 34), ' ');
    G.text(L.statusX, L.statusY, s, { color: t.dim, bright: 1 });
  }

  function paintLoadBtn() {
    const t = th();
    const s = L.mobile ? '[ TAP ] LOAD PROGRAM' : '[ ENTER ] LOAD PROGRAM';
    G.text(L.statusX, L.loadY, s, { color: t.accent, bright: 1 });
    addHit(L.statusX, L.loadY, s.length, 1, 'load');
  }

  function paintPrompt() {
    const t = th();
    const y = L.promptY;
    removeHitsAtRow(y);
    G.clearRegion(0, y, G.cols, 1);
    if (L.mobile && !cmdOpen) {
      G.text(L.promptX, y, '[>_]', { color: t.body, bright: 0.95 });
      addHit(L.promptX, y, 4, 1, 'cmdtoggle');
    } else {
      const shown = cmd.slice(-L.cmdMax);
      G.text(L.promptX, y, L.promptPrefix + shown, { color: t.body, bright: 0.95 });
      addHit(L.promptX, y, L.promptPrefix.length + L.cmdMax, 1, 'cmdtoggle');
    }
    paintCoffee();
    paintCursor();
  }

  function cursorCellX() {
    if (L.mobile && !cmdOpen) return -1;
    return L.promptX + L.promptPrefix.length + Math.min(cmd.length, L.cmdMax);
  }

  function paintCursor() {
    const x = cursorCellX();
    if (x < 0) return;
    G.setCell(x, L.promptY, cursorOn ? '█' : ' ', th().body, 0.95, G.UI);
  }

  function paintCoffee() {
    const s = 'buy_me_a_coffee ☕';
    const x = L.mobile && cmdOpen ? -99 : L.coffeeX;
    if (x < 0) return;
    G.text(x, L.promptY, s, { color: COFFEE_COL, bright: 1 });
    addHit(x, L.promptY, s.length, 1, 'coffee');
  }

  function addHit(x, y, w, h, type, arg) {
    hits.push({ x: x, y: y, w: w, h: h, type: type, arg: arg });
  }

  function hitAt(cx, cy) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (cx >= h.x && cx < h.x + h.w && cy >= h.y && cy < h.y + h.h) return h;
    }
    // list rows
    if (mode === 'console' && cx >= L.listX && cx < L.listX + L.listW) {
      const i = cy - L.listY - 1;
      if (i >= 0 && i < GAMES.length) return { type: 'row', arg: i };
    }
    return null;
  }

  function paintConsole() {
    hits.length = 0;
    paintHeader();
    paintList();
    paintBox();
    paintStatus();
    paintLoadBtn();
    paintPrompt();
    paintLogs();
  }

  // ---- logs -------------------------------------------------------------------
  function log(text, color, ttl, bright) {
    logs.push({
      text: String(text).slice(0, L.logW),
      color: color || th().body,
      bright: bright || 0.8,
      until: G.now + (ttl || 5),
    });
    while (logs.length > L.maxLogs) logs.shift();
    paintLogs();
  }

  function paintLogs() {
    if (mode !== 'console' && mode !== 'launching') return;
    const top = L.logBottom - L.maxLogs + 1;
    if (logs.length) {
      G.clearRegion(L.logX, Math.max(0, top), L.logW, L.maxLogs);
      for (let i = 0; i < logs.length; i++) {
        const e = logs[i];
        const y = L.logBottom - (logs.length - 1 - i);
        if (y < 0) continue;
        G.text(L.logX, y, e.text, { color: e.color, bright: e.bright });
      }
      if (L.mobile) {
        // logs replaced the list — keep title visible
        G.text(L.listX, L.listY, '> OUTPUT'.padEnd(L.listW, ' '), { color: th().accent, bright: 0.9 });
      }
    }
  }

  function expireLogs() {
    let removed = false;
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].until < G.now) { logs.splice(i, 1); removed = true; }
    }
    if (removed) {
      const top = L.logBottom - L.maxLogs + 1;
      G.clearRegion(L.logX, Math.max(0, top), L.logW, L.maxLogs);
      if (logs.length) paintLogs();
      else if (mode === 'console') paintConsole();
    }
  }

  // ---- selection / condensation -------------------------------------------------
  function select(i, blip) {
    i = ((i % GAMES.length) + GAMES.length) % GAMES.length;
    if (i === sel && IC.isFull() === false && condenseTimer === null && IC.previewProgress() > 0) return;
    const changedSel = i !== sel;
    sel = i;
    if (changedSel) {
      paintList();
      sigHex = randHex();
      if (blip !== false) A.blip();
    }
    if (condenseTimer) clearTimeout(condenseTimer);
    condenseTimer = setTimeout(function () {
      condenseTimer = null;
      if (mode !== 'console') return;
      if (L.imgRegion.w < 4 || L.imgRegion.h < 3) return; // too cramped to cast
      IC.startPreview(GAMES[sel], L.imgRegion);
      paintStatus();
    }, 130);
  }

  // ---- commands -------------------------------------------------------------------
  function findGame(q) {
    q = q.toLowerCase();
    const n = parseInt(q, 10);
    if (!isNaN(n) && n >= 1 && n <= GAMES.length) return n - 1;
    for (let i = 0; i < GAMES.length; i++) {
      if (GAMES[i].name.toLowerCase().indexOf(q) !== -1) return i;
    }
    return -1;
  }

  function exec(raw) {
    raw = raw.trim();
    if (!raw) return;
    const t = th();
    log('$ ' + raw, t.dim, 6, 0.9);
    const parts = raw.split(/\s+/);
    const c = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').toLowerCase();
    switch (c) {
      case 'help':
        log('load <n|name> · list · clear', t.accent, 9);
        log('theme classic|amber|ice', t.accent, 9);
        log('rain more|less · pill red|blue', t.accent, 9);
        log('whoami · coffee · mute', t.accent, 9);
        log('…the construct hides more.', t.dim, 9);
        break;
      case 'list': case 'ls': case 'programs':
        for (let i = 0; i < GAMES.length; i++) {
          log(String(i + 1).padStart(2, '0') + ' ' + GAMES[i].name.toUpperCase(), t.body, 8, 0.75);
        }
        break;
      case 'load': case 'run': case 'open': case 'exec': {
        if (!arg) { log('usage: load <number|name>', t.dim, 5); break; }
        const i = findGame(arg);
        if (i < 0) { log('no such program: ' + arg, RED, 6); A.denied(); }
        else { select(i, false); launch(GAMES[i]); }
        break;
      }
      case 'theme':
        if (G.setTheme(arg)) {
          try { localStorage.setItem('v2c.theme', arg); } catch (e) {}
          paintConsole();
          select(sel, false); // recondense in new tint
          log('theme set: ' + arg, t.accent, 5);
        } else log('themes: classic · amber · ice', t.dim, 6);
        break;
      case 'rain':
        if (arg === 'more') densityTarget = Math.min(3, densityTarget * 1.6);
        else if (arg === 'less') densityTarget = Math.max(0.15, densityTarget / 1.6);
        else { log('rain more|less', t.dim, 5); break; }
        log('rain density → ' + densityTarget.toFixed(2), t.accent, 5);
        break;
      case 'pill':
        if (arg === 'blue') { goBlue(); }
        else if (arg === 'red') log('you are already here.', t.accent, 6);
        else log('pill red|blue', t.dim, 5);
        break;
      case 'whoami':
        log('operator @ node jojkos.', t.accent, 7);
        log('(you are the one. probably.)', t.dim, 7);
        break;
      case 'clear': case 'cls':
        logs.length = 0;
        paintConsole();
        break;
      case 'coffee': case 'buy':
        log('opening the only yellow thing…', COFFEE_COL, 5);
        window.open(COFFEE_URL, '_blank', 'noopener');
        break;
      case 'mute': case 'sound':
        A.toggle();
        paintHeader();
        log(A.isMuted() ? 'sound off.' : 'sound on.', t.accent, 4);
        break;
      // ---- easter eggs ----
      case 'neo':
        log('wake up, neo…', t.accent, 8, 1);
        log('the matrix has you.', t.accent, 8, 1);
        log('follow the white pug.', t.accent, 8, 1);
        sched(900, function () { G.pugStorm(4); });
        log('knock, knock, neo.', t.dim, 8);
        break;
      case 'sudo':
        if (arg === 'make me a sandwich') log('okay.', t.accent, 7, 1);
        else log('operator is not in the sudoers file. this incident will be reported.', RED, 7);
        break;
      case 'make':
        if (arg === 'me a sandwich') log('what? make it yourself.', t.dim, 7);
        else log("make: *** no rule to make target '" + arg + "'.", t.dim, 6);
        break;
      case 'pug': case 'pugs':
        G.pugStorm(5);
        log('ᶘᵒᴥᵒᶅ ᶘᵒᴥᵒᶅ ᶘᵒᴥᵒᶅ', t.accent, 6, 1);
        break;
      case 'exit': case 'quit':
        log('there is no exit. only programs.', t.dim, 6);
        break;
      default:
        log('command not found: ' + c + " — try 'help'", RED, 6);
        A.denied();
    }
  }

  // ---- launch sequence -----------------------------------------------------------
  function resolveUrl(u) { return u; } // already prefixed in GAMES

  function launch(game) {
    if (mode !== 'console') return;
    mode = 'launching';
    if (condenseTimer) { clearTimeout(condenseTimer); condenseTimer = null; }
    A.launchSweep();
    const t = th();
    const nn = String(GAMES.indexOf(game) + 1).padStart(2, '0');
    log('TRACING ROUTE…', t.accent, 12, 1);
    sched(160, function () { log('NODE FOUND ' + sigHex, t.accent, 12, 1); });
    sched(320, function () { log('HANDSHAKE ACCEPTED', t.accent, 12, 1); });
    sched(480, function () { log('INJECTING PROGRAM ' + nn + ' «' + game.name.toUpperCase() + '»', t.accent, 12, 1); });
    sched(660, function () {
      IC.releasePreview();
      IC.startFull(game, 0.85, function () {
        sched(260, function () { crtCollapse(function () { location.href = resolveUrl(game.url); }); });
      });
    });
    // safety: if image never loads/breaks, still navigate
    sched(4200, function () {
      if (mode === 'launching') location.href = resolveUrl(game.url);
    });
  }

  function crtCollapse(done) {
    mode = 'dead';
    G.halted = true;
    const cv = G.canvas, ctx = G.ctx;
    const W = window.innerWidth, H = window.innerHeight;
    const snap = document.createElement('canvas');
    snap.width = cv.width; snap.height = cv.height;
    snap.getContext('2d').drawImage(cv, 0, 0);
    const t0 = performance.now();
    const SQUASH = 380, LINE = 240, HOLD = 90;
    function frame(now) {
      const t = now - t0;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.restore();
      if (t < SQUASH) {
        const e = t / SQUASH;
        const ee = e * e;
        const h = H * (1 - ee * 0.985);
        try { ctx.filter = 'brightness(' + (1 + ee * 2.6) + ')'; } catch (err) {}
        ctx.drawImage(snap, 0, (H - h) / 2, W, h);
        try { ctx.filter = 'none'; } catch (err) {}
        requestAnimationFrame(frame);
      } else if (t < SQUASH + LINE) {
        const e = (t - SQUASH) / LINE;
        const lw = W * (1 - e * e);
        ctx.fillStyle = 'rgba(235,255,240,' + (1 - e * 0.3) + ')';
        ctx.fillRect((W - lw) / 2, H / 2 - 1.5, lw, 3);
        requestAnimationFrame(frame);
      } else if (t < SQUASH + LINE + HOLD) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
        requestAnimationFrame(frame);
      } else {
        done();
      }
    }
    requestAnimationFrame(frame);
  }

  // ---- pills ---------------------------------------------------------------------
  const PILL_ART = [' ▄██████▄ ', '██████████', ' ▀██████▀ '];

  function pillRects() {
    const cx = Math.floor(G.cols / 2), cy = Math.floor(G.rows / 2);
    if (G.cols < 30) {
      return {
        red:  { x: cx - 5, y: cy - 5, w: 10, h: 3 },
        blue: { x: cx - 5, y: cy + 2, w: 10, h: 3 },
        title: cy - 9, stacked: true,
      };
    }
    return {
      red:  { x: cx - 16, y: cy - 2, w: 10, h: 3 },
      blue: { x: cx + 6,  y: cy - 2, w: 10, h: 3 },
      title: cy - 7, stacked: false,
    };
  }

  function paintPills() {
    hits.length = 0;
    const t = th();
    const p = pillRects();
    const cx = Math.floor(G.cols / 2);
    const center = function (y, s, opt) { G.text(Math.max(0, cx - Math.floor(s.length / 2)), y, s, opt); };
    center(p.title, 'THE CHOICE IS YOURS', { color: t.accent, bright: 1 });
    center(p.title + 2, 'this is your last chance — it is remembered', { color: t.dim, bright: 0.9 });
    for (let i = 0; i < 3; i++) {
      G.text(p.red.x, p.red.y + i, PILL_ART[i], { color: RED, bright: 1 });
      G.text(p.blue.x, p.blue.y + i, PILL_ART[i], { color: BLUE, bright: 1 });
    }
    G.text(p.red.x + 2, p.red.y + 3, '[R]ED', { color: RED, bright: 1 });
    G.text(p.blue.x + 2, p.blue.y + 3, '[B]LUE', { color: BLUE, bright: 1 });
    if (!p.stacked) {
      G.text(p.red.x - 2, p.red.y + 5, 'how deep the', { color: t.dim, bright: 0.8 });
      G.text(p.red.x - 2, p.red.y + 6, 'pug hole goes', { color: t.dim, bright: 0.8 });
      G.text(p.blue.x, p.blue.y + 5, 'a nice, calm', { color: t.dim, bright: 0.8 });
      G.text(p.blue.x, p.blue.y + 6, 'list of links', { color: t.dim, bright: 0.8 });
    }
    addHit(p.red.x - 1, p.red.y - 1, p.red.w + 2, p.red.h + 3, 'pillred');
    addHit(p.blue.x - 1, p.blue.y - 1, p.blue.w + 2, p.blue.h + 3, 'pillblue');
    L._pills = p;
  }

  function pulsePills(dt) {
    if (mode !== 'pills' || !L._pills) return;
    pillT += dt;
    const p = L._pills;
    const base = 0.82 + 0.1 * Math.sin(pillT * 2.2);
    const bRed = pillHover === 'red' ? 1 + 0.25 * Math.abs(Math.sin(pillT * 6)) : base;
    const bBlue = pillHover === 'blue' ? 1 + 0.25 * Math.abs(Math.sin(pillT * 6)) : base;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < PILL_ART[i].length; j++) {
        if (PILL_ART[i][j] === ' ') continue;
        G.setBright(p.red.x + j, p.red.y + i, bRed);
        G.setBright(p.blue.x + j, p.blue.y + i, bBlue);
      }
    }
  }

  function choosePill(color) {
    if (mode !== 'pills') return;
    A.pillPick();
    try { localStorage.setItem('v2c.pill', color); } catch (e) {}
    if (color === 'blue') { goBlue(); return; }
    // red: glyph whirl → console
    firstVisit = false;       // a skip during the whirl must not re-show the pills
    mode = 'rainin';
    G.clearAll();
    G.rainDim = 1;
    densityTarget = 1;
    G.density = 3;          // surge, eases back via densityTarget
    for (let c = 0; c < G.cols; c += 1) {
      if (Math.random() < 0.7) G.spawnAimed(c, { sp: 34 + Math.random() * 22, k: 3.2 });
    }
    sched(620, enterConsole);
  }

  function goBlue() {
    try { localStorage.setItem('v2c.pill', 'blue'); } catch (e) {}
    running = false;
    if (V2C.showBlue) V2C.showBlue();
  }

  // ---- sequences -------------------------------------------------------------------
  function enterConsole() {
    mode = 'console';
    G.rainDim = 1;
    densityTarget = reduced ? 0.35 : 1;
    G.clearAll();
    logs.length = 0;
    cmd = '';
    layout();
    paintConsole();
    select(sel, false);
    // make hover-flipping through the list instant later: warm the cache
    sched(2500, function () { GAMES.forEach(function (g) { IC.preload(g); }); });
  }

  function wakeSequence() {
    mode = 'wake';
    G.density = 0; densityTarget = 0;
    G.clearAll();
    const x = Math.max(2, Math.floor(G.cols / 2) - 14);
    const y = Math.max(2, Math.floor(G.rows / 2) - 3);
    const t = th();
    let cx = x, cy = y;
    let delay = 600;
    const cursor = function () { G.setCell(cx, cy, '█', t.body, 0.9, G.UI); };
    const typeStr = function (s, jitter) {
      for (let i = 0; i < s.length; i++) {
        (function (chr) {
          delay += 42 + Math.random() * (jitter || 60);
          sched(delay, function () {
            G.setCell(cx, cy, chr, t.body, 1, G.UI);
            cx++;
            cursor();
            if (Math.random() < 0.5) A.key();
          });
        })(s[i]);
      }
    };
    const backspace = function (n) {
      for (let i = 0; i < n; i++) {
        delay += 90;
        sched(delay, function () {
          G.setCell(cx, cy, ' ', t.body, 0, G.UI);
          cx--;
          G.setCell(cx, cy, ' ', t.body, 0, G.UI);
          cursor();
        });
      }
    };
    const newline = function (pause) {
      delay += pause || 700;
      sched(delay, function () {
        G.setCell(cx, cy, ' ', t.body, 0, G.UI);
        cx = x; cy += 2;
        cursor();
      });
    };
    cursor();
    delay = 900;
    typeStr("Wake up, jojko's visitor…");
    newline(1000);
    typeStr('The construct has you.');
    newline(900);
    typeStr('Follow the white rabbit');
    delay += 420;
    backspace(6);
    typeStr('pug.', 40);
    delay += 1000;
    sched(delay, function () {
      G.clearAll();
      rainIn(2.0, firstVisit ? pillsStage : enterConsole);
    });
  }

  function rainIn(sec, then) {
    mode = 'rainin';
    G.density = 0.04;
    densityTarget = 1;
    A.swell(sec);
    sched(sec * 1000, then);
  }

  function pillsStage() {
    mode = 'pills';
    G.clearAll();
    G.rainDim = 0.32;
    densityTarget = 0.55;
    paintPills();
  }

  function skipIntro() {
    clearPending();
    G.clearAll();
    G.density = 1;
    if (firstVisit) pillsStage();
    else enterConsole();
  }

  // ---- input -----------------------------------------------------------------------
  function onKeyDown(e) {
    A.unlock();
    const k = e.key;
    if (mode === 'wake' || mode === 'rainin') {
      if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') return;
      skipIntro();
      e.preventDefault();
      return;
    }
    if (mode === 'pills') {
      const lk = k.toLowerCase();
      if (lk === 'r') choosePill('red');
      else if (lk === 'b') choosePill('blue');
      return;
    }
    if (mode !== 'console') return;

    // konami tracking
    konami.push(k.toLowerCase());
    if (konami.length > KONAMI.length) konami.shift();
    if (konami.length === KONAMI.length && konami.every(function (v, i) { return v === KONAMI[i]; })) {
      konami.length = 0;
      G.pugStorm(5);
      log('ᶘᵒᴥᵒᶅ  KONAMI ACCEPTED — RELEASE THE PUGS  ᶘᵒᴥᵒᶅ', th().accent, 6, 1);
    }

    if (k === 'ArrowUp') { select(sel - 1); e.preventDefault(); return; }
    if (k === 'ArrowDown') { select(sel + 1); e.preventDefault(); return; }
    if (k === 'Enter') {
      if (cmd.trim()) { const c = cmd; cmd = ''; paintPrompt(); exec(c); }
      else launch(GAMES[sel]);
      e.preventDefault();
      return;
    }
    if (k === 'Backspace') { cmd = cmd.slice(0, -1); paintPrompt(); e.preventDefault(); return; }
    if (k === 'Escape') { cmd = ''; paintPrompt(); return; }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (cmd.length < 120) { cmd += k; A.key(); paintPrompt(); }
      e.preventDefault();
    }
  }

  function regionCursor(h) {
    G.canvas.style.cursor = h ? 'pointer' : 'default';
  }

  function onMouseMove(e) {
    const c = G.cellFromPoint(e.clientX, e.clientY);
    if (mode === 'pills') {
      const h = hitAt(c.x, c.y);
      pillHover = h ? (h.type === 'pillred' ? 'red' : h.type === 'pillblue' ? 'blue' : null) : null;
      regionCursor(pillHover);
      return;
    }
    if (mode !== 'console') { regionCursor(null); return; }
    const h = hitAt(c.x, c.y);
    hoverRegion = h;
    regionCursor(h && h.type !== 'cmdtoggle' ? h : (h && L.mobile ? h : null));
    if (h && h.type === 'row' && !L.mobile) select(h.arg);
  }

  function activate(h) {
    if (!h) return;
    switch (h.type) {
      case 'row':
        if (h.arg === sel && IC.previewProgress() > 0.3) launch(GAMES[sel]);
        else select(h.arg);
        break;
      case 'load': case 'preview':
        launch(GAMES[sel]);
        break;
      case 'coffee':
        window.open(COFFEE_URL, '_blank', 'noopener');
        break;
      case 'sound':
        A.toggle();
        paintHeader();
        break;
      case 'pillbtn':
        goBlue();
        break;
      case 'cmdtoggle':
        if (L.mobile) toggleMobileCmd();
        break;
      case 'pillred': choosePill('red'); break;
      case 'pillblue': choosePill('blue'); break;
    }
  }

  function onClick(e) {
    A.unlock();
    if (mode === 'wake' || mode === 'rainin') { skipIntro(); return; }
    const c = G.cellFromPoint(e.clientX, e.clientY);
    activate(hitAt(c.x, c.y));
  }

  // touch: tap = click (handled via click event); drag = rain push
  let touch = null;
  function onTouchStart(e) {
    A.unlock();
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, moved: 0 };
  }
  function onTouchMove(e) {
    if (!touch || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.x;
    touch.moved += Math.abs(dx) + Math.abs(t.clientY - touch.y);
    const c = G.cellFromPoint(t.clientX, t.clientY);
    if (touch.moved > 8) {
      G.dragRain(c.x, dx / G.cell * 2.2);
      e.preventDefault();
    }
    touch.x = t.clientX; touch.y = t.clientY;
  }
  function onTouchEnd() { touch = null; }

  // mobile command line: a visually hidden input summons the keyboard
  function toggleMobileCmd() {
    cmdOpen = !cmdOpen;
    if (cmdOpen) {
      if (!mobileInput) {
        mobileInput = document.createElement('input');
        mobileInput.type = 'text';
        mobileInput.setAttribute('aria-label', 'operator command line');
        mobileInput.autocapitalize = 'off';
        mobileInput.autocomplete = 'off';
        mobileInput.spellcheck = false;
        mobileInput.style.cssText = 'position:fixed;left:0;bottom:0;width:100%;height:30px;opacity:0.01;border:0;background:transparent;color:transparent;caret-color:transparent;';
        mobileInput.addEventListener('input', function () {
          cmd = mobileInput.value.slice(0, 120);
          paintPrompt();
        });
        mobileInput.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            const c = cmd;
            cmd = '';
            mobileInput.value = '';
            exec(c);
            paintPrompt();
            ev.preventDefault();
          } else if (ev.key === 'Escape') {
            toggleMobileCmd();
          }
        });
        document.body.appendChild(mobileInput);
      }
      mobileInput.value = cmd;
      paintPrompt();
      mobileInput.focus();
    } else {
      if (mobileInput) mobileInput.blur();
      cmd = '';
      paintPrompt();
    }
  }

  // ---- frame loop --------------------------------------------------------------------
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) return;

    // density easing
    if (Math.abs(G.density - densityTarget) > 0.01) {
      G.density += (densityTarget - G.density) * Math.min(1, dt * (mode === 'rainin' ? 1.2 : 2.5));
    }

    G.update(dt);
    const ticks = IC.update(dt);
    if (ticks > 0 && (mode === 'console' || mode === 'launching')) A.tick();

    // ui per-frame (cursor/status only in console — never over the launch cast)
    if (mode === 'console') {
      blinkT += dt;
      if (blinkT > 0.45) { blinkT = 0; cursorOn = !cursorOn; paintCursor(); }
      statusT += dt;
      if (statusT > 0.18) {
        statusT = 0;
        paintStatus();
        expireLogs();
      }
    }
    pulsePills(dt);
    A.setHiss(G.ambientCount() / Math.max(1, G.cols * 0.9));

    G.render();
  }

  // ---- boot ---------------------------------------------------------------------------
  function isCoarse() {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || window.innerWidth < 700;
  }

  function onGridResize() {
    if (!running) return;
    clearPendingSafe();
    IC.reset();
    layout();
    hits.length = 0;
    if (mode === 'console' || mode === 'launching') {
      mode = 'console';
      logs.length = 0;
      paintConsole();
      select(sel, false);
    } else if (mode === 'pills') {
      paintPills();
    } else if (mode === 'wake' || mode === 'rainin') {
      skipIntro();
    }
  }
  function clearPendingSafe() { clearPending(); }

  function boot(opts) {
    opts = opts || {};
    firstVisit = !!opts.firstVisit;
    reduced = !!opts.reduced;
    const canvas = document.getElementById('construct');
    G.init(canvas, isCoarse() ? 18 : 14);
    try {
      const savedTheme = localStorage.getItem('v2c.theme');
      if (savedTheme) G.setTheme(savedTheme);
    } catch (e) {}
    layout();
    G.onResize = onGridResize;

    window.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    running = true;
    lastTime = performance.now();
    requestAnimationFrame(frame);

    if (reduced) densityTarget = 0.35;

    if (firstVisit) wakeSequence();
    else rainIn(1.4, enterConsole);

    sched(900, function () { IC.preload(GAMES[0]); });
  }

  function stop() {
    running = false;
    clearPending();
  }

  return { boot: boot, stop: stop, GAMES: GAMES };
})();
