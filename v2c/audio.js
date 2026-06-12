/* v2c MATRIX:OPERATOR — audio.js
 * 100% procedural Web Audio. No files. Rain hiss, deposit ticks,
 * selection blips, typing clicks, dial-up launch sweep.
 * Never blocks: everything is a no-op until the first user gesture.
 */
'use strict';
window.V2C = window.V2C || {};

V2C.audio = (function () {
  let ctx = null, master = null, hissGain = null, hissFilter = null;
  let muted = false;
  let lastTick = 0, tickBudget = 0;

  try { muted = localStorage.getItem('v2c.mute') === '1'; } catch (e) {}

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    // rain hiss: looped noise -> lowpass -> gain
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'lowpass';
    hissFilter.frequency.value = 900;
    hissFilter.Q.value = 0.4;
    hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    src.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(master);
    src.start();
    return true;
  }

  // call from any user gesture
  function unlock() { ensure(); }

  function setHiss(level) { // 0..1 tracks stream count
    if (!ctx || !hissGain) return;
    const v = Math.min(1, Math.max(0, level)) * 0.05;
    hissGain.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
  }

  function env(node, t0, a, peak, dec) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
  }

  function beep(freq, dur, vol, type, when, slideTo) {
    if (!ctx) return;
    const t0 = (when || ctx.currentTime);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, 0.004, vol, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // soft deposit tick, rate-limited to ~20/s
  function tick() {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    if (now - lastTick < 0.05) return;
    lastTick = now;
    beep(1400 + Math.random() * 900, 0.025, 0.05, 'sine');
  }

  function blip() { if (ensureRunning()) beep(660, 0.06, 0.12, 'square', undefined, 880); }
  function key() { if (ensureRunning()) beep(2100 + Math.random() * 500, 0.015, 0.05, 'square'); }
  function denied() { if (ensureRunning()) { beep(220, 0.12, 0.12, 'sawtooth'); beep(170, 0.16, 0.1, 'sawtooth', ctx.currentTime + 0.1); } }
  function pillPick() { if (ensureRunning()) { beep(440, 0.1, 0.12, 'sine', undefined, 220); beep(880, 0.25, 0.08, 'sine', ctx.currentTime + 0.08, 110); } }

  function ensureRunning() {
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return !muted;
  }

  // dial-up flavored launch: DTMF beats then a rising sweep
  function launchSweep() {
    if (!ensureRunning()) return;
    const t0 = ctx.currentTime;
    const dtmf = [[941, 1336], [697, 1209], [770, 1477], [852, 1336]];
    dtmf.forEach(function (pair, i) {
      beep(pair[0], 0.07, 0.08, 'sine', t0 + i * 0.11);
      beep(pair[1], 0.07, 0.08, 'sine', t0 + i * 0.11);
    });
    // carrier handshake-ish sweep
    beep(300, 0.9, 0.1, 'sawtooth', t0 + 0.5, 2400);
    beep(150, 0.9, 0.06, 'square', t0 + 0.55, 1200);
    // white burst at the end (CRT pop)
    const nlen = ctx.sampleRate * 0.25;
    const nb = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nlen);
    const ns = ctx.createBufferSource();
    ns.buffer = nb;
    const ng = ctx.createGain();
    ng.gain.value = 0.12;
    ns.connect(ng); ng.connect(master);
    ns.start(t0 + 1.35);
  }

  // rising white-noise swell for the rain-in
  function swell(dur) {
    if (!ensureRunning()) return;
    const t0 = ctx.currentTime;
    hissGain.gain.cancelScheduledValues(t0);
    hissGain.gain.setValueAtTime(0.0001, t0);
    hissGain.gain.exponentialRampToValueAtTime(0.06, t0 + (dur || 2));
  }

  function toggle() {
    muted = !muted;
    try { localStorage.setItem('v2c.mute', muted ? '1' : '0'); } catch (e) {}
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
    return muted;
  }

  return {
    unlock: unlock,
    setHiss: setHiss,
    tick: tick,
    blip: blip,
    key: key,
    denied: denied,
    pillPick: pillPick,
    launchSweep: launchSweep,
    swell: swell,
    toggle: toggle,
    isMuted: function () { return muted; },
  };
})();
