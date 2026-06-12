// ============================================================================
// audio.js — procedural radio-scan soundscape (Web Audio, zero files)
//
//   static bed : looped noise → bandpass (filter opens with drag velocity)
//   crackle    : highpassed noise, gain spikes while dragging fast
//   carrier    : detuned sine pair per game — pitch from index on a pentatonic
//                scale, so scanning the wall plays a melody. Crossfades with
//                the static as a tile tunes in (small theremin glide).
//   launch     : rising sweep + power-off thump
//
// Nothing plays until the first user gesture; mute toggle always visible.
// ============================================================================

const PENTA = [0, 2, 4, 7, 9];
export const carrierFreq = (i) =>
  220 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);

export class RadioAudio {
  constructor() {
    this.started = false;
    this.enabled = true;     // intent; actual sound only after ensure()
    this.focusIndex = -1;
  }

  // create the graph — must be called from a user gesture
  ensure() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.started = true;
    const ctx = this.ctx = new AC();
    const t = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // noise buffer (2s white)
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // static bed
    const stat = ctx.createBufferSource();
    stat.buffer = buf; stat.loop = true;
    this.bp = ctx.createBiquadFilter();
    this.bp.type = 'bandpass'; this.bp.frequency.value = 700; this.bp.Q.value = 0.7;
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0.05;
    stat.connect(this.bp).connect(this.staticGain).connect(this.master);
    stat.start(t);

    // crackle layer
    const crk = ctx.createBufferSource();
    crk.buffer = buf; crk.loop = true; crk.playbackRate.value = 0.73;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2600;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    crk.connect(hp).connect(this.crackleGain).connect(this.master);
    crk.start(t);

    // carrier pair (retuned per focused tile)
    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscA.type = 'sine'; this.oscB.type = 'sine';
    this.oscA.frequency.value = 220; this.oscB.frequency.value = 220 * 1.004;
    this.carrierGain = ctx.createGain();
    this.carrierGain.gain.value = 0;
    this.oscA.connect(this.carrierGain);
    this.oscB.connect(this.carrierGain);
    this.carrierGain.connect(this.master);
    this.oscA.start(t); this.oscB.start(t);

    if (this.enabled) this.master.gain.setTargetAtTime(1, t, 0.4);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.started) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.12);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  // per-frame: vel 0..1, focusIndex / focusSignal from the tune field
  update(velNorm, focusIndex, focusSignal) {
    if (!this.started || !this.enabled) return;
    const t = this.ctx.currentTime;
    const sig = Math.max(0, Math.min(1, focusSignal));

    this.bp.frequency.setTargetAtTime(600 + velNorm * 2300, t, 0.08);
    const statTarget = (0.045 + velNorm * 0.075) * (1 - sig * 0.8);
    this.staticGain.gain.setTargetAtTime(statTarget, t, 0.1);

    const crackle = velNorm > 0.35 ? (velNorm - 0.35) * 0.18 * (0.4 + Math.random() * 0.6) : 0;
    this.crackleGain.gain.setTargetAtTime(crackle, t, 0.05);

    if (focusIndex >= 0 && focusIndex !== this.focusIndex) {
      this.focusIndex = focusIndex;
      const f = carrierFreq(focusIndex);
      this.oscA.frequency.setTargetAtTime(f, t, 0.09);          // theremin glide
      this.oscB.frequency.setTargetAtTime(f * 1.004, t, 0.11);
    }
    this.carrierGain.gain.setTargetAtTime(sig * sig * 0.085, t, 0.09);
  }

  // launch: rising over-tune sweep, then the power-off thump
  launch() {
    if (!this.started || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;

    const sweep = ctx.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(280, t);
    sweep.frequency.exponentialRampToValueAtTime(1900, t + 0.65);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.09, t + 0.45);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    sweep.connect(sg).connect(this.master);
    sweep.start(t); sweep.stop(t + 0.85);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(140, t + 0.78);
    thump.frequency.exponentialRampToValueAtTime(36, t + 1.05);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t + 0.78);
    tg.gain.exponentialRampToValueAtTime(0.5, t + 0.82);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    thump.connect(tg).connect(this.master);
    thump.start(t + 0.78); thump.stop(t + 1.12);
  }

  // intro tuning sweep (only audible if audio already running, e.g. skip+retry)
  sweepIn() {
    if (!this.started || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 1.25);
  }
}
