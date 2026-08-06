/* ═══════════════════════════════════════════════════════════════════════════
   BLUFF — pomocník
   Ravensburger Bluff (Richard Borg). Kostky 1–5 + hvězda (žolík).

   Deska je pás políček: políčko = počet, červená kostka na něm = hodnota.
   Zvýšit lze otočením kostky (vyšší hodnota na stejném políčku) nebo posunem
   vpřed. Z toho plyne jediné lineární pořadí 109 sázek — a pravidlo polovin
   i dvojnásobků pro hvězdy z něj padá samo.

   Vyhodnocení výzvy:
     skutečnost < sázka  → sázející ztrácí rozdíl
     skutečnost > sázka  → pochybující ztrácí rozdíl
     skutečnost = sázka  → všichni KROMĚ sázejícího ztrácí po jedné
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

const STAR = 'S';
const MAX_Q = 20;      // deska končí na 20
const MAX_STAR = 10;   // a na ★10
const SIGMA = 1.6;     // rozptyl modelu sázení
const BLUFF_BIAS = { low: -0.6, normal: 0.6, high: 1.8 };
const BLUFF_LABEL = { low: 'nebluffuje', normal: 'bluffuje občas', high: 'bluffuje pořád' };

/* ── prostor sázek ─────────────────────────────────────────────────────────
   1×1..1×5 │ 2×1..2×5 │ 3×1..3×5 │ ★2 │ 4×1..4×5 │ 5×1..5×5 │ ★3 │ … │ 20×5 */

const BIDS = [];
const ROWS = [];
(function buildBoard() {
  for (let n = 1; n <= MAX_Q; n++) {
    const row = { type: 'num', q: n, cells: [] };
    for (let f = 1; f <= 5; f++) { row.cells.push(BIDS.length); BIDS.push({ q: n, face: f }); }
    ROWS.push(row);
    // hvězdička je každé třetí políčko: ★m leží hned za číslem 2m−1
    if (n >= 3 && n % 2 === 1) {
      const m = (n + 1) / 2;
      if (m <= MAX_STAR) {
        ROWS.push({ type: 'star', q: m, cells: [BIDS.length] });
        BIDS.push({ q: m, face: STAR });
      }
    }
  }
})();

const faceLabel = f => (f === STAR ? '★' : String(f));
const bidLabel  = b => `${b.q}× ${faceLabel(b.face)}`;

/* ── kombinatorika ─────────────────────────────────────────────────────────── */

const logFact = [0];
for (let i = 1; i <= 40; i++) logFact[i] = logFact[i - 1] + Math.log(i);
const choose = (n, k) => (k < 0 || k > n ? 0 : Math.exp(logFact[n] - logFact[k] - logFact[n - k]));

/** Binomické rozdělení jako pole délky n+1. */
function binomial(n, p) {
  const out = new Array(n + 1);
  for (let k = 0; k <= n; k++) out[k] = choose(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
  return out;
}

/** Konvoluce dvou diskrétních rozdělení. */
function convolve(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  }
  return out;
}

const normalize = w => { const s = w.reduce((x, y) => x + y, 0); return s > 0 ? w.map(x => x / s) : w; };

/* ── ruce soupeřů ──────────────────────────────────────────────────────────
   Ruka = [c1,c2,c3,c4,c5,cStar]. Pro 5 kostek jich je 252 — jde vyjmenovat
   všechny, takže žádná aproximace. */

const handCache = new Map();
function enumerateHands(d) {
  if (handCache.has(d)) return handCache.get(d);
  const hands = [];
  (function rec(slot, left, acc) {
    if (slot === 5) { hands.push([...acc, left]); return; }
    for (let c = 0; c <= left; c++) rec(slot + 1, left - c, [...acc, c]);
  })(0, d, []);
  // apriorní multinomická váha
  const priors = hands.map(h => {
    let lw = logFact[d] - Math.log(6) * d;
    for (const c of h) lw -= logFact[c];
    return Math.exp(lw);
  });
  const res = { hands, priors };
  handCache.set(d, res);
  return res;
}

const matchIn = (hand, face) => (face === STAR ? hand[5] : hand[face - 1] + hand[5]);
const pOf = face => (face === STAR ? 1 / 6 : 2 / 6);

/**
 * Posterior nad rukou jednoho soupeře po jeho sázkách v tomto kole.
 * Model: hráč s k odpovídajícími kostkami vsadí zhruba k + (co čeká od
 * ostatních) + jeho bluff bias. Odchylku od toho trestá gaussovka.
 */
function posteriorFor(playerDice, theirBids, totalDice, bias) {
  const { hands, priors } = enumerateHands(playerDice);
  if (!theirBids.length) return { hands, weights: priors };
  const others = totalDice - playerDice;
  const w = priors.slice();
  for (const bid of theirBids) {
    const expOthers = others * pOf(bid.face);
    for (let i = 0; i < hands.length; i++) {
      if (!w[i]) continue;
      const center = matchIn(hands[i], bid.face) + expOthers + bias;
      const dv = bid.q - center;
      w[i] *= Math.exp(-(dv * dv) / (2 * SIGMA * SIGMA));
    }
  }
  return { hands, weights: normalize(w) };
}

/** Rozdělení počtu kostek, kterými soupeř přispěje k dané hodnotě. */
function contribution(post, face) {
  const dist = [];
  for (let i = 0; i < post.hands.length; i++) {
    const k = matchIn(post.hands[i], face);
    dist[k] = (dist[k] || 0) + post.weights[i];
  }
  for (let i = 0; i < dist.length; i++) if (!dist[i]) dist[i] = 0;
  return dist;
}

/* ── metriky jedné sázky ───────────────────────────────────────────────────── */

/**
 * Z rozdělení možných počtů spočítá všechno, co potřebujeme.
 * pmf[t] = P(celkem padlo právě t kostek dané hodnoty).
 */
function metrics(pmf, q, opponentsAlive) {
  let pTrue = 0, pExact = 0;
  let myLossIfIBid = 0, oppLossIfIBid = 0;
  let myLossIfIDoubt = 0, bidderLossIfIDoubt = 0;

  for (let t = 0; t < pmf.length; t++) {
    const pr = pmf[t]; if (!pr) continue;
    if (t < q) {
      // sázka neprošla → sázející platí rozdíl
      myLossIfIBid       += pr * (q - t);
      bidderLossIfIDoubt += pr * (q - t);
    } else if (t === q) {
      // trefa → všichni kromě sázejícího ztrácí po jedné
      pTrue  += pr;
      pExact += pr;
      oppLossIfIBid   += pr * opponentsAlive;
      myLossIfIDoubt  += pr * 1;
    } else {
      // bylo jich víc → pochybující platí rozdíl
      pTrue += pr;
      oppLossIfIBid  += pr * (t - q);
      myLossIfIDoubt += pr * (t - q);
    }
  }
  return {
    pTrue, pExact,
    myLossIfIBid, oppLossIfIBid,
    myLossIfIDoubt, bidderLossIfIDoubt,
    edgeBid:   oppLossIfIBid - myLossIfIBid,
    edgeDoubt: bidderLossIfIDoubt - myLossIfIDoubt,
  };
}

/* ── stav ──────────────────────────────────────────────────────────────────── */

const SAVE_KEY = 'bluff_helper_v5';

let S = null;
let undoStack = [];
let setupCfg = { players: 4, dice: 5, names: [], me: 0 };

const clone = o => JSON.parse(JSON.stringify(o));
const alive = () => S.players.filter(p => p.dice > 0);
const totalDice = () => S.players.reduce((s, p) => s + p.dice, 0);
const me = () => S.players[S.myIndex];
const lastBid = () => (S.round.bids.length ? S.round.bids[S.round.bids.length - 1] : null);
const curBidIndex = () => (lastBid() ? lastBid().bidIndex : -1);

function snapshot() { undoStack.push(clone(S)); if (undoStack.length > 40) undoStack.shift(); }
function undo() { if (undoStack.length) { S = undoStack.pop(); save(); render(); } }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.players && s.round ? s : null;
  } catch (e) { return null; }
}

function nextAlive(from) {
  for (let i = 1; i <= S.players.length; i++) {
    const idx = (from + i) % S.players.length;
    if (S.players[idx].dice > 0) return idx;
  }
  return from;
}

function newGame(cfg) {
  S = {
    players: Array.from({ length: cfg.players }, (_, i) => ({
      name: cfg.names[i] || `Hráč ${i + 1}`,
      dice: cfg.dice,
      bluff: 'normal',
    })),
    myIndex: cfg.me,
    startDice: cfg.dice,
    useInference: true,
    phase: 'roll',
    round: { myDice: [], bids: [], turn: cfg.me, starter: cfg.me },
  };
  undoStack = [];
  save();
}

function newRound(starter) {
  S.round = { myDice: [], bids: [], turn: starter, starter };
  S.phase = 'roll';
  save();
}

/* ── analýza ───────────────────────────────────────────────────────────────
   Vrací pro každou sázku rozdělení a metriky. Naivní varianta bere cizí
   kostky jako rovnoměrné, informovaná je převáží podle toho, co kdo vsadil. */

function analyse(useInference) {
  const total = totalDice();
  const myHandCount = S.round.myDice.length;
  const opponents = S.players
    .map((p, i) => ({ ...p, idx: i }))
    .filter(p => p.dice > 0 && p.idx !== S.myIndex);
  const oppAlive = opponents.length;

  // posteriory soupeřů (jen jednou za render, ne za sázku)
  const posts = opponents.map(p => {
    const theirBids = useInference
      ? S.round.bids.filter(b => b.player === p.idx).map(b => BIDS[b.bidIndex])
      : [];
    return posteriorFor(p.dice, theirBids, total, BLUFF_BIAS[p.bluff] || 0);
  });

  const unknown = total - myHandCount;
  const pmfByFace = {};
  for (const face of [1, 2, 3, 4, 5, STAR]) {
    const known = S.round.myDice.filter(d => (face === STAR ? d === STAR : d === face || d === STAR)).length;
    let dist;
    if (useInference && oppAlive) {
      dist = [1];
      for (let i = 0; i < opponents.length; i++) dist = convolve(dist, contribution(posts[i], face));
    } else {
      dist = binomial(Math.max(0, unknown), pOf(face));
    }
    // posun o to, co držím v ruce
    const shifted = new Array(known).fill(0).concat(dist);
    pmfByFace[face === STAR ? 'S' : face] = shifted;
  }

  return BIDS.map((b, i) => {
    const pmf = pmfByFace[b.face === STAR ? 'S' : b.face];
    return { i, bid: b, ...metrics(pmf, b.q, oppAlive) };
  });
}

/** Nejlepší doporučení: co mě průměrně stojí nejmíň kostek. */
function advise() {
  const cur = curBidIndex();
  const total = totalDice();
  const info = analyse(S.useInference);
  const naive = S.useInference ? analyse(false) : info;

  const legal = info.filter(a => a.i > cur && a.bid.q <= total);
  const ranked = legal.slice().sort((a, b) => b.edgeBid - a.edgeBid);
  const bestBid = ranked[0] || null;

  // sázka s nejvyšší šancí na trefu (nejsilnější tah ve hře)
  const exactPick = legal.slice().sort((a, b) => b.pExact - a.pExact)[0] || null;

  const doubt = cur >= 0 ? info[cur] : null;
  return { info, naive, legal, ranked, bestBid, exactPick, doubt, cur };
}

/* ── DOM ───────────────────────────────────────────────────────────────────── */

const $  = s => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const pct = x => `${(x * 100).toFixed(0)} %`;
const dice1 = x => x.toFixed(x < 10 ? 1 : 0);

/* ── setup ─────────────────────────────────────────────────────────────────── */

function renderSetup() {
  const pw = $('#setup-players');
  pw.innerHTML = '';
  for (let n = 2; n <= 6; n++) {
    const b = el('button', null, String(n));
    b.setAttribute('aria-pressed', setupCfg.players === n);
    b.onclick = () => { setupCfg.players = n; renderSetup(); };
    pw.appendChild(b);
  }

  const dw = $('#setup-dice');
  dw.innerHTML = '';
  for (let n = 3; n <= 6; n++) {
    const b = el('button', null, String(n));
    b.setAttribute('aria-pressed', setupCfg.dice === n);
    b.onclick = () => { setupCfg.dice = n; renderSetup(); };
    dw.appendChild(b);
  }

  if (setupCfg.me >= setupCfg.players) setupCfg.me = 0;

  const nw = $('#setup-names');
  nw.innerHTML = '';
  for (let i = 0; i < setupCfg.players; i++) {
    const row = el('div', 'name-row');
    const dot = el('button', 'me-dot', 'JÁ');
    dot.setAttribute('aria-pressed', setupCfg.me === i);
    dot.onclick = () => { setupCfg.me = i; renderSetup(); };
    const inp = el('input');
    inp.value = setupCfg.names[i] || `Hráč ${i + 1}`;
    inp.oninput = e => { setupCfg.names[i] = e.target.value; };
    row.append(dot, inp);
    nw.appendChild(row);
  }
}

/* ── hráči ─────────────────────────────────────────────────────────────────── */

function renderPlayers() {
  const wrap = $('#players');
  wrap.innerHTML = '';
  S.players.forEach((p, i) => {
    const isTurn = S.phase === 'bidding' && S.round.turn === i && p.dice > 0;
    const n = el('div', `player${isTurn ? ' is-turn' : ''}${i === S.myIndex ? ' is-me' : ''}${p.dice === 0 ? ' is-out' : ''}`);
    n.appendChild(el('div', 'p-name', i === S.myIndex ? `${p.name} · ty` : p.name));

    const dd = el('div', 'p-dice');
    for (let k = 0; k < S.startDice; k++) dd.appendChild(el('span', `p-die${k < p.dice ? '' : ' lost'}`));
    n.appendChild(dd);

    if (i !== S.myIndex && p.dice > 0) {
      const sel = el('button', 'p-bluff', BLUFF_LABEL[p.bluff]);
      sel.onclick = () => {
        const order = ['low', 'normal', 'high'];
        snapshot();
        p.bluff = order[(order.indexOf(p.bluff) + 1) % 3];
        save(); render();
      };
      n.appendChild(sel);
    } else {
      n.appendChild(el('div', 'p-bluff', p.dice === 0 ? 'vypadl' : '&nbsp;'));
    }
    wrap.appendChild(n);
  });
}

/* ── zadání mých kostek ────────────────────────────────────────────────────── */

function renderRoll() {
  const need = me().dice;
  $('#roll-count').textContent = `${S.round.myDice.length} / ${need}`;

  const md = $('#my-dice');
  md.innerHTML = '';
  for (let i = 0; i < need; i++) {
    const v = S.round.myDice[i];
    if (v == null) { md.appendChild(el('div', 'die empty')); continue; }
    const d = el('div', `die${v === STAR ? ' star' : ''}`, faceLabel(v));
    d.title = 'Klepnutím odebereš';
    d.onclick = () => { snapshot(); S.round.myDice.splice(i, 1); save(); render(); };
    md.appendChild(d);
  }

  const pad = $('#dice-pad');
  pad.innerHTML = '';
  for (const f of [1, 2, 3, 4, 5, STAR]) {
    const b = el('button', f === STAR ? 'star' : null, faceLabel(f));
    b.disabled = S.round.myDice.length >= need;
    b.onclick = () => { snapshot(); S.round.myDice.push(f); save(); render(); };
    pad.appendChild(b);
  }

  const done = $('#roll-done');
  done.disabled = S.round.myDice.length !== need;
  done.textContent = S.round.myDice.length !== need
    ? `Zadej ještě ${need - S.round.myDice.length}`
    : `Rozdáno — začíná ${S.players[S.round.starter].name}`;
}

/* ── mřížka ────────────────────────────────────────────────────────────────── */

const HEAT = ['var(--h0)', 'var(--h1)', 'var(--h2)', 'var(--h3)', 'var(--h4)', 'var(--h5)', 'var(--h6)'];
const heatBg = p => HEAT[Math.max(0, Math.min(6, Math.round(p * 6)))];
const heatInk = p => (p > 0.72 ? '#1c1509' : 'var(--ink)');

function renderGrid(a) {
  const grid = $('#grid');
  grid.innerHTML = '';
  const total = totalDice();
  const cur = a.cur;
  const picks = new Set(a.ranked.slice(0, 3).map(x => x.i));
  const exactI = a.exactPick && a.exactPick.pExact >= 0.14 ? a.exactPick.i : -1;
  const myTurn = S.round.turn === S.myIndex;

  for (const row of ROWS) {
    if (row.q > total) continue;
    const r = el('div', `grid-row${row.type === 'star' ? ' star-row' : ''}`);
    r.appendChild(el('div', 'row-q', row.type === 'star' ? `★${row.q}` : String(row.q)));

    for (const bi of row.cells) {
      const A = a.info[bi];
      const b = BIDS[bi];
      const c = el('div', 'cell');
      const dead = bi <= cur;

      if (bi === cur) c.classList.add('current');
      else if (dead) c.classList.add('dead');
      else {
        c.style.background = heatBg(A.pTrue);
        c.style.color = heatInk(A.pTrue);
        if (myTurn && picks.has(bi)) c.classList.add('pick');
        if (myTurn && bi === exactI) c.classList.add('exact');
      }

      c.appendChild(el('span', 'cv', row.type === 'star' ? `★ ${row.q}` : faceLabel(b.face)));
      c.appendChild(el('span', 'cp', dead && bi !== cur ? '—' : pct(A.pTrue)));

      c.title = `${bidLabel(b)} · projde ${pct(A.pTrue)} · trefa ${pct(A.pExact)} · ztratíš průměrně ${dice1(A.myLossIfIBid)} kostky`;
      if (!dead) c.onclick = () => placeBid(bi);
      r.appendChild(c);
    }
    grid.appendChild(r);
  }
}

/* ── verdikt ───────────────────────────────────────────────────────────────── */

function renderVerdict(a) {
  const v = $('#verdict');
  v.classList.remove('hidden');
  const myTurn = S.round.turn === S.myIndex;
  const inner = el('div', 'verdict-inner');

  if (!myTurn) {
    const who = S.players[S.round.turn].name;
    inner.appendChild(el('div', 'v-head', `na tahu je ${who}`));
    if (a.doubt) {
      const d = a.doubt;
      inner.appendChild(el('div', 'v-main', `
        <div>
          <div class="v-call ${d.pTrue < 0.5 ? 'doubt' : 'bid'}">${bidLabel(d.bid)}</div>
          <div class="v-why">Kdyby ses ozval ty: projde na ${pct(d.pTrue)}, průměrně bys přišel o ${dice1(d.myLossIfIDoubt)} kostky.</div>
        </div>`));
    } else {
      inner.appendChild(el('div', 'v-why', 'Čeká se na první sázku. Až padne, klepni na ni v mřížce.'));
    }
    inner.appendChild(statRow(a));
    const skip = el('button', 'btn btn-ghost btn-sm', 'Přeskočit hráče →');
    skip.onclick = () => { snapshot(); S.round.turn = nextAlive(S.round.turn); save(); render(); };
    const acts = el('div', 'v-actions');
    acts.appendChild(skip);
    if (a.doubt) {
      const ch = el('button', 'btn btn-danger', `${S.players[S.round.turn].name} nevěří`);
      ch.onclick = () => askActual();
      acts.appendChild(ch);
    }
    inner.appendChild(acts);
    v.innerHTML = ''; v.appendChild(inner);
    return;
  }

  // jsem na tahu → porovnej nejlepší sázku proti výzvě
  const best = a.bestBid;
  const d = a.doubt;
  const doubtBetter = d && best ? d.edgeDoubt > best.edgeBid : !!d && !best;

  inner.appendChild(el('div', 'v-head', 'jsi na tahu'));

  if (doubtBetter) {
    inner.appendChild(el('div', 'v-main', `
      <div>
        <div class="v-call doubt">NEVĚŘ MU</div>
        <div class="v-why">${bidLabel(d.bid)} projde jen na ${pct(d.pTrue)}. Výzva tě průměrně stojí ${dice1(d.myLossIfIDoubt)} kostky, sázejícího ${dice1(d.bidderLossIfIDoubt)}.</div>
      </div>`));
  } else if (best) {
    inner.appendChild(el('div', 'v-main', `
      <div>
        <div class="v-call bid">${bidLabel(best.bid)}</div>
        <div class="v-why">Projde na ${pct(best.pTrue)}${d ? `, zatímco výzva by tě stála ${dice1(d.myLossIfIDoubt)} kostky` : ''}. Klepni do mřížky a sázku zapíšeš.</div>
      </div>`));
  } else {
    inner.appendChild(el('div', 'v-why', 'Dráha je na konci — vyšší sázka neexistuje, musíš vyzvat.'));
  }

  inner.appendChild(statRow(a));

  const acts = el('div', 'v-actions');
  if (best) {
    const bb = el('button', 'btn btn-primary', `Vsadit ${bidLabel(best.bid)}`);
    bb.onclick = () => placeBid(best.i);
    acts.appendChild(bb);
  }
  if (d) {
    const cb = el('button', doubtBetter ? 'btn btn-danger' : 'btn', 'NEVĚŘÍM');
    cb.onclick = () => askActual();
    acts.appendChild(cb);
  }
  inner.appendChild(acts);

  if (S.useInference && a.doubt) {
    const n = a.naive[a.cur];
    inner.appendChild(el('div', 'v-naive',
      `Bez čtení ze sázek by ta samá sázka vycházela na ${pct(n.pTrue)} — řeči u stolu s odhadem pohnuly o ${((a.doubt.pTrue - n.pTrue) * 100).toFixed(0)} b.`));
  }

  v.innerHTML = ''; v.appendChild(inner);
}

function statRow(a) {
  const row = el('div', 'v-stats');
  const add = (label, value, cls) =>
    row.appendChild(el('div', 'stat', `<span class="sl">${label}</span><span class="sv ${cls || ''}">${value}</span>`));

  if (a.doubt) {
    add('projde', pct(a.doubt.pTrue), a.doubt.pTrue < 0.4 ? 'hot' : a.doubt.pTrue > 0.7 ? 'cool' : '');
    add('trefa přesně', pct(a.doubt.pExact), 'amber');
    add('výzva tě stojí', dice1(a.doubt.myLossIfIDoubt), a.doubt.myLossIfIDoubt > 1 ? 'hot' : 'cool');
  }
  if (a.bestBid) add('nejlepší sázka', bidLabel(a.bestBid.bid), 'amber');
  if (a.exactPick && a.exactPick.pExact >= 0.14) {
    add(`trefa ${bidLabel(a.exactPick.bid)}`, pct(a.exactPick.pExact), 'cool');
  }
  return row;
}

/* ── akce ──────────────────────────────────────────────────────────────────── */

function placeBid(bidIndex) {
  if (bidIndex <= curBidIndex()) return;
  snapshot();
  S.round.bids.push({ player: S.round.turn, bidIndex });
  S.round.turn = nextAlive(S.round.turn);
  save(); render();
  const wrap = $('#grid-wrap');
  const cur = wrap.querySelector('.cell.current');
  if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function askActual() {
  const lb = lastBid(); if (!lb) return;
  const bid = BIDS[lb.bidIndex];
  const bidder = S.players[lb.player];
  const challenger = S.players[S.round.turn];
  const total = totalDice();

  openModal(body => {
    body.appendChild(el('h3', null, `${challenger.name} nevěří`));
    body.appendChild(el('p', null,
      `Sázka byla <b>${bidLabel(bid)}</b> od hráče <b>${bidder.name}</b>. Odkryjte kalíšky — kolik jich <b>opravdu</b> padlo? (hvězdy se počítají)`));

    const pad = el('div', 'count-pad');
    for (let n = 0; n <= total; n++) {
      const b = el('button', null, String(n));
      b.onclick = () => { closeModal(); resolveChallenge(lb, n); };
      pad.appendChild(b);
    }
    body.appendChild(pad);

    const acts = el('div', 'modal-actions');
    const cancel = el('button', 'btn', 'Zpět');
    cancel.onclick = closeModal;
    acts.appendChild(cancel);
    body.appendChild(acts);
  });
}

function resolveChallenge(lb, actual) {
  snapshot();
  const bid = BIDS[lb.bidIndex];
  const bidderIdx = lb.player;
  const challengerIdx = S.round.turn;
  const q = bid.q;

  let headline, detail, cls, nextStarter;

  if (actual < q) {
    const lost = q - actual;
    S.players[bidderIdx].dice = Math.max(0, S.players[bidderIdx].dice - lost);
    headline = `${S.players[bidderIdx].name} bluffoval`;
    cls = bidderIdx === S.myIndex ? 'lose' : 'win';
    detail = `Padlo jich jen <b>${actual}</b> místo <b>${q}</b>. <b>${S.players[bidderIdx].name}</b> ztrácí <b>${lost}</b> ${kostky(lost)}.`;
    nextStarter = bidderIdx;
  } else if (actual > q) {
    const lost = actual - q;
    S.players[challengerIdx].dice = Math.max(0, S.players[challengerIdx].dice - lost);
    headline = `${S.players[bidderIdx].name} měl pravdu`;
    cls = challengerIdx === S.myIndex ? 'lose' : 'win';
    detail = `Padlo jich <b>${actual}</b>, tedy víc než <b>${q}</b>. <b>${S.players[challengerIdx].name}</b> ztrácí <b>${lost}</b> ${kostky(lost)}.`;
    nextStarter = challengerIdx;
  } else {
    const hit = [];
    S.players.forEach((p, i) => {
      if (i !== bidderIdx && p.dice > 0) { p.dice = Math.max(0, p.dice - 1); hit.push(p.name); }
    });
    headline = 'TREFA!';
    cls = bidderIdx === S.myIndex ? 'win' : 'lose';
    detail = `Padlo jich přesně <b>${q}</b>. <b>${S.players[bidderIdx].name}</b> neztrácí nic — ${hit.length ? `<b>${hit.join(', ')}</b> ztrácí po jedné kostce.` : 'ostatní nemají co ztratit.'}`;
    nextStarter = bidderIdx;
  }

  save();

  const survivors = alive();
  openModal(body => {
    const o = el('div', 'outcome');
    o.appendChild(el('div', `big ${cls}`, headline));
    o.appendChild(el('div', 'detail', detail));
    body.appendChild(o);

    const acts = el('div', 'modal-actions');
    if (survivors.length <= 1) {
      const winner = survivors[0];
      o.appendChild(el('div', 'detail', `<br><b>${winner ? winner.name : '—'}</b> vyhrál celou hru. 🏆`));
      const nb = el('button', 'btn btn-primary', 'Nová hra');
      nb.onclick = () => { closeModal(); localStorage.removeItem(SAVE_KEY); S = null; render(); };
      acts.appendChild(nb);
    } else {
      const st = S.players[nextStarter].dice > 0 ? nextStarter : nextAlive(nextStarter);
      const nb = el('button', 'btn btn-primary', `Další kolo — začíná ${S.players[st].name}`);
      nb.onclick = () => { closeModal(); newRound(st); render(); };
      acts.appendChild(nb);
    }
    body.appendChild(acts);
  }, true);
}

const kostky = n => (n === 1 ? 'kostku' : n < 5 ? 'kostky' : 'kostek');

/* ── modal ─────────────────────────────────────────────────────────────────── */

function openModal(build, sticky) {
  const m = $('#modal'), b = $('#modal-body');
  b.innerHTML = '';
  build(b);
  m.classList.remove('hidden');
  m.onclick = e => { if (e.target === m && !sticky) closeModal(); };
}
function closeModal() { $('#modal').classList.add('hidden'); }

function openMenu() {
  openModal(body => {
    body.appendChild(el('h3', null, 'Menu'));
    const list = el('div', 'menu-list');

    const reroll = el('button', 'btn', 'Přehodit kolo (zadat kostky znovu)');
    reroll.onclick = () => { closeModal(); snapshot(); newRound(S.round.starter); render(); };

    const newg = el('button', 'btn', 'Nová hra');
    newg.onclick = () => {
      if (!confirm('Zahodit rozehranou hru?')) return;
      closeModal(); localStorage.removeItem(SAVE_KEY); S = null; render();
    };

    list.append(reroll, newg);
    body.appendChild(list);

    const acts = el('div', 'modal-actions');
    const close = el('button', 'btn', 'Zavřít');
    close.onclick = closeModal;
    acts.appendChild(close);
    body.appendChild(acts);
  });
}

/* ── render ────────────────────────────────────────────────────────────────── */

/** Verdikt je fixní dole — tělo musí mít přesně tolik místa, kolik zabírá. */
function syncVerdictPad() {
  const v = $('#verdict');
  const h = v.classList.contains('hidden') ? 24 : v.offsetHeight + 18;
  document.documentElement.style.setProperty('--pad-b', `${h}px`);
}

function render() {
  renderInner();
  syncVerdictPad();
}

function renderInner() {
  if (!S) {
    $('#setup').classList.remove('hidden');
    $('#game').classList.add('hidden');
    $('#verdict').classList.add('hidden');
    renderSetup();
    return;
  }
  $('#setup').classList.add('hidden');
  $('#game').classList.remove('hidden');

  renderPlayers();
  $('#undo-btn').disabled = !undoStack.length;

  if (S.phase === 'roll') {
    $('#roll-panel').classList.remove('hidden');
    $('#bid-panel').classList.add('hidden');
    $('#verdict').classList.add('hidden');
    renderRoll();
    return;
  }

  $('#roll-panel').classList.add('hidden');
  $('#bid-panel').classList.remove('hidden');
  $('#infer-toggle').checked = S.useInference;

  const mini = $('#mini-dice');
  mini.innerHTML = '';
  S.round.myDice.forEach(v => mini.appendChild(el('span', `mini-die${v === STAR ? ' star' : ''}`, faceLabel(v))));

  const tb = $('#turn-banner');
  const lb = lastBid();
  tb.innerHTML = lb
    ? `<span>Na tahu <b>${S.players[S.round.turn].name}</b> · poslední sázka od <b>${S.players[lb.player].name}</b></span>
       <span class="cur-bid">${bidLabel(BIDS[lb.bidIndex])}</span>`
    : `<span>Kolo otevírá <b>${S.players[S.round.turn].name}</b> — klepni na jeho sázku v mřížce.</span>`;

  const a = advise();
  renderGrid(a);
  renderVerdict(a);
}

/* ── start ─────────────────────────────────────────────────────────────────── */

$('#start-btn').onclick = () => { newGame(setupCfg); render(); };
$('#roll-done').onclick = () => { snapshot(); S.phase = 'bidding'; save(); render(); };
$('#edit-dice').onclick = () => { snapshot(); S.phase = 'roll'; save(); render(); };
$('#undo-btn').onclick = undo;
$('#menu-btn').onclick = openMenu;
$('#infer-toggle').onchange = e => { S.useInference = e.target.checked; save(); render(); };

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
window.addEventListener('resize', syncVerdictPad);
window.addEventListener('orientationchange', () => setTimeout(syncVerdictPad, 250));

S = load();
render();
