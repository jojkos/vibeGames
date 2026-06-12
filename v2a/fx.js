// fx.js — particles, procedural audio, bark shockwave, fireworks, launch sequence
import * as THREE from 'three';

/* ============================== particles ============================== */

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function makeZTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 46px "Press Start 2P","Courier New",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#9fd8ff'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#cfe8ff';
  ctx.fillText('Z', 32, 36);
  return new THREE.CanvasTexture(c);
}

class ParticlePool {
  constructor(scene, capacity, texture, blending) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4); // rgba
    this.size = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.colAttr = new THREE.BufferAttribute(this.col, 4);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture } },
      transparent: true,
      depthWrite: false,
      blending,
      vertexShader: /* glsl */`
        attribute vec4 aColor; attribute float aSize;
        varying vec4 vColor;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * (180.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; varying vec4 vColor;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor.rgb, vColor.a) * t;
          if (gl_FragColor.a < 0.01) discard;
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, a, size, life, drag = 1, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a;
    this.size[i] = size;
    this.life[i] = life; this.maxLife[i] = life;
    this.drag[i] = drag; this.grav[i] = grav;
  }

  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3, i4 = i * 4;
      if (this.life[i] <= 0) { this.col[i4 + 3] = 0; this.pos[i3 + 1] = -100; continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 2] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.col[i4 + 3] = Math.min(1, this.life[i] / (this.maxLife[i] * 0.55));
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }
}

/* ============================== FX hub ============================== */

export class FX {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality;
    const mul = quality.particleMul;
    this.sparks = new ParticlePool(scene, Math.floor(900 * mul), makeDotTexture(), THREE.AdditiveBlending);
    this.zzz = new ParticlePool(scene, 24, makeZTexture(), THREE.NormalBlending);
    this.rings = [];
    this.shake = 0;

    /* ----- audio ----- */
    this.ctx = null;
    this.master = null;
    this.muted = localStorage.getItem('v2a-muted') === '1';
    this.humGain = null;
  }

  /* ---------------------------------------------------------- audio core */
  initAudio() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // cabinet hum (always running, gain swells when a cabinet is hot)
    const hum = this.ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = 96;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 4;
    lfo.connect(lfoGain).connect(hum.frequency);
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0;
    hum.connect(this.humGain).connect(this.master);
    hum.start(); lfo.start();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('v2a-muted', m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setHum(on) {
    if (!this.humGain) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.cancelScheduledValues(t);
    this.humGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.25);
  }

  _noise(dur) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.max(1, Math.floor(sr * dur)), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  _env(gain, t0, peak, dur, attack = 0.004) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  /* ---------------------------------------------------------- sfx */
  sfxStep() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this._noise(0.05);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900 + Math.random() * 600;
    const g = this.ctx.createGain();
    this._env(g, t, 0.06, 0.05);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
  }

  sfxBark() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    // cute "yip": square sweep down + noise pop
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.1);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = this.ctx.createGain();
    this._env(g, t, 0.22, 0.13);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.15);
    const n = this._noise(0.06);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 750; bp.Q.value = 1.2;
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.12, 0.06);
    n.connect(bp).connect(ng).connect(this.master);
    n.start(t);
  }

  sfxChime() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this._env(g, t + i * 0.07, 0.16, 0.45);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.5);
    });
  }

  sfxBuzz() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 110 + Math.random() * 40;
    const g = this.ctx.createGain();
    this._env(g, t, 0.07, 0.06);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.08);
    const p = this.ctx.createOscillator();
    p.type = 'sine';
    p.frequency.value = 1700 + Math.random() * 500;
    const pg = this.ctx.createGain();
    this._env(pg, t + 0.03, 0.06, 0.12);
    p.connect(pg).connect(this.master);
    p.start(t + 0.03); p.stop(t + 0.18);
  }

  sfxHop() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.12);
    const g = this.ctx.createGain();
    this._env(g, t, 0.08, 0.14);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.16);
  }

  sfxThud(power = 1) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.ctx.createGain();
    this._env(g, t, 0.2 * power, 0.14);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.16);
  }

  sfxLaunch() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = this._noise(0.7);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + 0.65);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.72);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.65);
    const og = this.ctx.createGain();
    this._env(og, t, 0.1, 0.68, 0.3);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.72);
  }

  sfxFireworkPop() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = this._noise(0.25);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    const g = this.ctx.createGain();
    this._env(g, t, 0.25, 0.24);
    n.connect(lp).connect(g).connect(this.master);
    n.start(t);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 500 + Math.random() * 700;
    const og = this.ctx.createGain();
    this._env(og, t + 0.02, 0.08, 0.3);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.35);
  }

  /* ---------------------------------------------------------- particles */
  dust(pos, n = 3, drift = false) {
    n = Math.max(1, Math.round(n * this.q.particleMul));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * 1.1;
      this.sparks.spawn(
        pos.x + (Math.random() - 0.5) * 0.3, 0.08 + Math.random() * 0.12, pos.z + (Math.random() - 0.5) * 0.3,
        Math.cos(a) * s * (drift ? 1.7 : 1), 0.6 + Math.random() * 0.9, Math.sin(a) * s * (drift ? 1.7 : 1),
        0.55, 0.5, 0.45, 0.5, 0.5 + Math.random() * 0.45, 0.45 + Math.random() * 0.3, 2.5, 1.2
      );
    }
  }

  sparkle(pos, color, n = 14) {
    n = Math.max(4, Math.round(n * this.q.particleMul));
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI;
      const s = 1.4 + Math.random() * 2.4;
      this.sparks.spawn(
        pos.x, pos.y, pos.z,
        Math.cos(a) * Math.sin(b) * s, Math.cos(b) * s + 1.4, Math.sin(a) * Math.sin(b) * s,
        c.r, c.g, c.b, 1, 0.45 + Math.random() * 0.4, 0.5 + Math.random() * 0.4, 1.8, 4
      );
    }
  }

  spawnZzz(pos) {
    this.zzz.spawn(
      pos.x + 0.25, pos.y + 0.35, pos.z,
      0.22 + Math.random() * 0.12, 0.5, (Math.random() - 0.5) * 0.15,
      0.8, 0.91, 1, 0.95, 0.55 + Math.random() * 0.25, 2.2, 0.2, -0.12
    );
  }

  firework(pos, color) {
    const c = new THREE.Color(color);
    const n = Math.max(20, Math.round(70 * this.q.particleMul));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const s = 5 + Math.random() * 5;
      this.sparks.spawn(
        pos.x, pos.y, pos.z,
        Math.cos(a) * Math.sin(b) * s, Math.cos(b) * s, Math.sin(a) * Math.sin(b) * s,
        c.r, c.g, c.b, 1, 1.2 + Math.random() * 0.9, 1.1 + Math.random() * 0.7, 0.9, 6
      );
    }
    this.sfxFireworkPop();
  }

  /** the full GOOD DOG celebration */
  fireworksShow() {
    const cols = ['#ff2bd6', '#22e6e6', '#ffd60a', '#46f07a', '#ff9f1c', '#a06bff'];
    for (let i = 0; i < 9; i++) {
      gsap.delayedCall(i * 0.45, () => {
        this.firework(new THREE.Vector3(
          (Math.random() - 0.5) * 30, 9 + Math.random() * 7, 10 - Math.random() * 38
        ), cols[i % cols.length]);
      });
    }
    const banner = document.getElementById('banner');
    const s = { v: 0 };
    const apply = () => { banner.style.transform = `translate(-50%,-50%) scale(${s.v})`; };
    gsap.timeline()
      .to(s, { v: 1, duration: 0.55, ease: 'back.out(2.5)', onUpdate: apply })
      .to(s, { v: 0, duration: 0.4, ease: 'back.in(2)', delay: 3.4, onUpdate: apply });
  }

  /* ---------------------------------------------------------- bark ring */
  barkRing(pos) {
    const geo = new THREE.RingGeometry(0.45, 0.62, 36);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.25, pos.z);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, t: 0 });
  }

  addShake(amount) { this.shake = Math.max(this.shake, amount); }

  /* ---------------------------------------------------------- launch */
  /**
   * Cinematic launch: pug leaps INTO the screen, camera dollies in, CRT flash, navigate.
   * Repeat press calls skip() -> jump straight to navigation.
   */
  launchGame({ camera, pug, cab, url }) {
    this.setHum(false);
    this.sfxLaunch();
    cab.locked = true; // park.update keeps hands off this screen now
    const flash = document.getElementById('flash');
    const screenPos = cab.screenWorld.clone();
    const camTarget = screenPos.clone().addScaledVector(cab.front, 2.0);
    camTarget.y = screenPos.y + 0.15;
    let navigated = false;
    const go = () => {
      if (navigated) return;
      navigated = true;
      location.href = url;
    };

    const tl = gsap.timeline();
    // pug leaps into the screen
    tl.to(pug.group.position, {
      x: screenPos.x - cab.front.x * 0.2,
      y: screenPos.y - 0.3,
      z: screenPos.z - cab.front.z * 0.2,
      duration: 0.62, ease: 'power2.in',
    }, 0.05);
    tl.to(pug.group.scale, { x: 0.1, y: 0.1, z: 0.1, duration: 0.6, ease: 'power3.in' }, 0.1);
    tl.to(pug.group.rotation, { x: -1.2, duration: 0.5 }, 0.1);
    // camera dolly toward the screen
    const look = { t: 0 };
    const camFrom = camera.position.clone();
    tl.to(look, {
      t: 1, duration: 1.05, ease: 'power3.in',
      onUpdate: () => {
        camera.position.lerpVectors(camFrom, camTarget, look.t);
        camera.lookAt(screenPos);
      },
    }, 0);
    // screen burns bright
    tl.to({}, {
      duration: 0.9,
      onUpdate: function () { cab.screenMat.color.setScalar(1 + this.progress() * 2.2); },
    }, 0.2);
    // CRT flash: white slam, collapse to a horizontal line, then white-out + navigate
    tl.set(flash, { opacity: 1, scaleY: 1 }, 1.0);
    tl.to(flash, { scaleY: 0.004, duration: 0.13, ease: 'power2.in' }, 1.0);
    tl.to(flash, { scaleY: 1, opacity: 1, duration: 0.1, ease: 'power2.out' }, 1.16);
    tl.call(go, [], 1.3);
    // safety net in case the tab was backgrounded mid-tween
    setTimeout(go, 2600);

    this._launchTl = tl;
    this._launchGo = go;
    return tl;
  }

  skipLaunch() {
    if (this._launchGo) {
      const flash = document.getElementById('flash');
      flash.style.opacity = 1;
      this._launchGo();
    }
  }

  /* ---------------------------------------------------------- update */
  update(dt) {
    this.sparks.update(dt);
    this.zzz.update(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / 0.55;
      r.mesh.scale.setScalar(1 + k * 14);
      r.mesh.material.opacity = 0.85 * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 5);
  }
}
