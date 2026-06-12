/* ghosts.js — ghost echoes: record the player's visit to localStorage and
   replay past visits as translucent blue ghosts. Clean presence boundary:
   record(x,y,f,t) + event(type,cab) on the way in, frames() on the way out.
   Phase-2 realtime presence (PartyKit/Supabase) would replace only this file. */
(function(){
'use strict';
const KEY = 'v2e_ghost_traces';
const SAMPLE_MS = 150;
const MAX_SAMPLES = 1600;     // ~4 min
const MAX_TRACES = 5;
const MAX_BYTES = 50000;      // ~50KB cap for the whole store

function r2(v){ return Math.round(v * 100) / 100; }

// pre-baked "attendant" trace: sweeps a loop of the hall, peeks at a few
// cabinets, inserts a phantom coin. Generated from waypoints at load.
function attendantTrace(){
  const wp = [
    [9.0, 2.9], [6.0, 3.2], [3.2, 3.4], [2.6, 5.0],   // toward left wall cabs
    [2.6, 5.0], [2.6, 5.0],                            // linger (focus)
    [3.0, 8.0], [2.8, 11.0], [5.0, 11.6], [9.0, 11.4],
    [9.0, 7.2], [9.0, 7.2], [9.0, 7.2],                // linger at center row
    [12.0, 6.8], [15.0, 6.8], [15.2, 6.8],
    [18.0, 6.0], [19.8, 4.6], [20.0, 3.2],             // snack machine corner
    [17.0, 2.8], [17.0, 2.8],
    [14.0, 2.9], [14.0, 2.9],                          // back-row cab
    [11.5, 2.6], [9.2, 2.8],
  ];
  const pts = [];
  const ev = [];
  const speed = 2.1;                                   // tiles/s
  const dtS = SAMPLE_MS / 1000;
  for (let i = 0; i < wp.length - 1; i++){
    const a = wp[i], b = wp[i + 1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.round(d / (speed * dtS)));
    for (let s = 0; s < steps; s++){
      const k = s / steps;
      const x = a[0] + (b[0] - a[0]) * k;
      const y = a[1] + (b[1] - a[1]) * k;
      let f = 2;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      if (Math.abs(dx) > Math.abs(dy)) f = dx > 0 ? 1 : 3;
      else if (Math.abs(dy) > .01) f = dy > 0 ? 2 : 0;
      pts.push([r2(x), r2(y), f]);
    }
    if (i === 4) ev.push({ i: pts.length - 1, type: 'focus', cab: 5 });
    if (i === 11) ev.push({ i: pts.length - 1, type: 'coin', cab: 11 });
    if (i === 21) ev.push({ i: pts.length - 1, type: 'focus', cab: 2 });
  }
  return { v: 1, t: 0, pts, ev, attendant: true };
}

const Ghosts = window.Ghosts = {
  cur: null, lastSample: 0, persisted: false,
  ghosts: [], _frames: [], phantomCb: null,

  init(){
    this.cur = { v: 1, t: Date.now(), pts: [], ev: [] };
    let traces = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) traces = JSON.parse(raw) || [];
    } catch (e){ traces = []; }
    if (!Array.isArray(traces)) traces = [];
    if (!traces.length) traces = [attendantTrace()];   // never an empty hall

    this.ghosts = traces
      .filter(tr => tr && Array.isArray(tr.pts) && tr.pts.length > 10)
      .map(tr => ({
        pts: tr.pts,
        ev: Array.isArray(tr.ev) ? tr.ev : [],
        durMs: tr.pts.length * SAMPLE_MS,
        offset: 2000 + Math.random() * 4000,           // 2–6s random start offset
        lastIdx: -1,
      }));

    const persist = () => this.persist();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
    window.addEventListener('pagehide', persist);
  },

  // ---- recording -------------------------------------------------------
  record(x, y, f, tMs){
    if (tMs - this.lastSample < SAMPLE_MS) return;
    if (this.cur.pts.length >= MAX_SAMPLES) return;
    this.lastSample = tMs;
    this.cur.pts.push([r2(x), r2(y), f]);
  },

  event(type, cab){
    if (this.cur.pts.length >= MAX_SAMPLES) return;
    this.cur.ev.push({ i: Math.max(0, this.cur.pts.length - 1), type, cab });
  },

  persist(){
    if (this.persisted) return;                        // once per page life
    if (!this.cur || this.cur.pts.length < 25) return; // too short to matter
    this.persisted = true;
    let traces = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) traces = JSON.parse(raw) || [];
    } catch (e){ traces = []; }
    if (!Array.isArray(traces)) traces = [];
    traces = traces.filter(tr => tr && !tr.attendant); // never store the attendant
    traces.push(this.cur);
    while (traces.length > MAX_TRACES) traces.shift();
    let json = JSON.stringify(traces);
    while (json.length > MAX_BYTES && traces.length > 1){
      traces.shift();
      json = JSON.stringify(traces);
    }
    if (json.length > MAX_BYTES && traces.length === 1){
      // single oversized trace: thin it out
      const tr = traces[0];
      tr.pts = tr.pts.filter((_, i) => i % 2 === 0);
      json = JSON.stringify(traces);
    }
    try { localStorage.setItem(KEY, json); } catch (e){ /* storage full/blocked */ }
  },

  clear(){
    try { localStorage.removeItem(KEY); } catch (e){}
    this.ghosts = this.ghosts.filter(g => false);
    this.ghosts = [];
    this._frames = [];
  },

  // ---- replay ----------------------------------------------------------
  setPhantomCb(fn){ this.phantomCb = fn; },
  count(){ return this.ghosts.length; },

  update(tMs){
    const out = this._frames;
    out.length = 0;
    for (const g of this.ghosts){
      const tt = (tMs + g.offset) % g.durMs;
      const fi = tt / SAMPLE_MS;
      const i0 = Math.floor(fi) % g.pts.length;
      const i1 = (i0 + 1) % g.pts.length;
      const k = fi - Math.floor(fi);
      const a = g.pts[i0], b = g.pts[i1];
      // don't interpolate across the loop seam
      const wrap = i1 === 0;
      const x = wrap ? a[0] : a[0] + (b[0] - a[0]) * k;
      const y = wrap ? a[1] : a[1] + (b[1] - a[1]) * k;
      const moving = Math.hypot(b[0] - a[0], b[1] - a[1]) > .02;
      const phase = moving ? ((tt / 140 | 0) % 2) + 1 : 0;
      out.push({ x, y, f: a[2], phase });
      // fire events when the replay crosses them
      if (i0 !== g.lastIdx){
        const from = g.lastIdx;
        g.lastIdx = i0;
        for (const e of g.ev){
          const crossed = from < i0 ? (e.i > from && e.i <= i0) : (e.i === i0);
          if (crossed && e.type === 'coin' && this.phantomCb) this.phantomCb(e.cab);
          if (crossed && e.type === 'focus' && this.phantomCb) this.phantomCb(e.cab);
        }
      }
    }
    return out;
  },

  frames(){ return this._frames; },
};
})();
