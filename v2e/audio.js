/* audio.js — fully procedural Web Audio: rain room tone, proximity-mixed
   seeded chiptune attract loops per cabinet, footsteps, coin clink,
   launch sweep, thunder. No audio files. Exposes window.AudioSys. */
(function(){
'use strict';
const MUTE_KEY = 'v2e_mute';

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AudioSys = window.AudioSys = {
  ctx: null, master: null, chipBus: null, sfxBus: null,
  muted: false, tunes: [], started: false,

  isMuted(){ return this.muted; },

  init(){
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e){}
  },

  // create context on first user gesture (autoplay-safe)
  unlock(){
    if (this.started){
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.started = true;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = .9;
    this.sfxBus.connect(this.master);
    this.chipBus = ctx.createGain();
    this.chipBus.gain.value = .7;
    this.chipBus.connect(this.master);
    this.buildRoomTone();
    this.buildTunes();
  },

  toggleMute(){
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch (e){}
    if (!this.started && !this.muted) this.unlock();
    if (this.master){
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, .05);
    }
    return this.muted;
  },

  // ------------------------------------------------------------ room tone
  noiseBuffer(seconds){
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  buildRoomTone(){
    const ctx = this.ctx;
    // rain: looped noise, band-shaped
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2.2);
    src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    const g = ctx.createGain(); g.gain.value = .05;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
    // slow rain swell
    const lfo = ctx.createOscillator(); lfo.frequency.value = .07;
    const lfoG = ctx.createGain(); lfoG.gain.value = .016;
    lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
    // low arcade hum
    const hum = ctx.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 55;
    const humG = ctx.createGain(); humG.gain.value = .013;
    hum.connect(humG); humG.connect(this.master); hum.start();
    const hum2 = ctx.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 110.7;
    const hum2G = ctx.createGain(); hum2G.gain.value = .006;
    hum2.connect(hum2G); hum2G.connect(this.master); hum2.start();

    // soft arcade ambient pad — a calm chord, very low, slow tremolo
    const padG = ctx.createGain(); padG.gain.value = .02; padG.connect(this.master);
    const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 900; padLp.connect(padG);
    [110, 164.81, 220, 329.63].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = f; o.detune.value = (i - 1.5) * 4;
      const g = ctx.createGain(); g.gain.value = i < 2 ? .3 : .16;
      o.connect(g); g.connect(padLp); o.start();
    });
    const padLfo = ctx.createOscillator(); padLfo.frequency.value = .05;
    const padLfoG = ctx.createGain(); padLfoG.gain.value = .01;
    padLfo.connect(padLfoG); padLfoG.connect(padG.gain); padLfo.start();
  },

  // ------------------------------------------------------------ chiptunes
  buildTunes(){
    const ctx = this.ctx;
    this.tunes = GAMES.map((g, i) => {
      const rng = mulberry32(i * 48271 + 7919);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.chipBus);
      const minorPent = [0, 3, 5, 7, 10];
      const root = 196 * Math.pow(2, (rng() * 7 | 0) / 12);     // per-game key
      const stepDur = .115 + rng() * .05;                       // per-game tempo
      const lead = [], bass = [];
      for (let s = 0; s < 32; s++){
        lead.push(rng() < .62 ? minorPent[rng() * 5 | 0] + 12 * (rng() < .35 ? 2 : 1) : -1);
      }
      for (let s = 0; s < 8; s++) bass.push(minorPent[rng() * 3 | 0]);
      return { gain, root, stepDur, lead, bass, next: 0, step: 0, target: 0 };
    });
  },

  chipNote(freq, type, t0, dur, vol, dest){
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + .012);
    g.gain.setTargetAtTime(0, t0 + dur * .65, .03);
    o.connect(g); g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + .15);
  },

  // proximity mix + note scheduling, called every frame
  update(dt, player, items){
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const AHEAD = .3;
    for (let i = 0; i < this.tunes.length; i++){
      const tn = this.tunes[i];
      const cab = items[i];
      if (!cab || cab.coffee) continue;
      const dx = player.x - cab.frontPoint[0], dy = player.y - cab.frontPoint[1];
      const d = Math.hypot(dx, dy);
      let v = Math.max(0, 1 - d / 4.6);
      v = v * v * (.18 + cab.wake * .5);
      tn.target = v;
      tn.gain.gain.setTargetAtTime(v, now, .12);
      if (v < .015){
        tn.next = now;       // don't backlog silent cabinets
        continue;
      }
      while (tn.next < now + AHEAD){
        const t0 = Math.max(now, tn.next);
        const s = tn.step;
        const L = tn.lead[s];
        if (L >= 0) this.chipNote(tn.root * Math.pow(2, L / 12), 'square', t0, tn.stepDur * .9, .11, tn.gain);
        if (s % 4 === 0){
          const B = tn.bass[(s / 4) | 0];
          this.chipNote(tn.root / 2 * Math.pow(2, B / 12), 'triangle', t0, tn.stepDur * 1.7, .14, tn.gain);
        }
        tn.next += tn.stepDur;
        tn.step = (tn.step + 1) % 32;
      }
    }
  },

  // ------------------------------------------------------------ sfx
  blip(freq, type, dur, vol, when, slide){
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + .01);
    g.gain.setTargetAtTime(0, t0 + dur * .7, .04);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t0); o.stop(t0 + dur + .2);
  },

  noiseHit(dur, vol, freq, when, type){
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (when || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(Math.min(1.5, dur + .1));
    const f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.setTargetAtTime(0, t0, dur / 3);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t0); src.stop(t0 + dur + .1);
  },

  footstep(){
    this.noiseHit(.045, .028, 560 + Math.random() * 220, 0, 'bandpass');
  },
  wake(){
    this.blip(420, 'triangle', .12, .07, 0, 880);
  },
  ui(){
    this.blip(900, 'square', .05, .05);
  },
  coin(){
    // classic two-tone clink
    this.blip(1568, 'square', .07, .12);
    this.blip(2093, 'square', .25, .12, .07);
    this.noiseHit(.06, .05, 4000, 0, 'highpass');
  },
  bell(){
    // shop-door bell on entering the hall
    this.blip(1318, 'triangle', .35, .07);
    this.blip(1760, 'triangle', .5, .06, .06);
    this.noiseHit(.05, .03, 6000, 0, 'highpass');
  },
  sweep(){
    // power-up: rising squares + noise riser
    this.blip(190, 'square', .55, .1, 0, 1700);
    this.blip(190 * 1.5, 'square', .55, .07, .05, 2500);
    this.noiseHit(.6, .05, 1200, 0, 'highpass');
  },
  thunder(){
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + .25;                 // light first, rumble after
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(140, t0);
    f.frequency.exponentialRampToValueAtTime(50, t0 + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(.22, t0 + .12);
    g.gain.setTargetAtTime(0, t0 + .4, .7);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t0); src.stop(t0 + 2.6);
  },
};

AudioSys.init();
})();
