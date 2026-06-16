// park.js — ground, sky, archway, arcade cabinets, props, bones, lights
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAG_COLORS = window.TAG_COLORS;
const FOG_COLOR = 0x0a0e1f;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Park {
  constructor(scene, games, quality) {
    this.scene = scene;
    this.games = games;
    this.quality = quality;
    this.cabinets = [];
    this.bones = [];
    this.colliders = [];
    this.balloons = [];
    this.spotCones = [];
    this.rng = mulberry32(1337);
    this.archLetters = "JOJKOS GAMES";
    this.archShown = 0;
    this.archFlicker = { idx: -1, t: 0 };
    this.archAmbientTimer = 4;

    this._lights();
    this._ground();
    this._sky();
    this._arch();
    this._cabinets();
    this._props();
    this._bones();
  }

  /* ---------------- lights ---------------- */
  _lights() {
    const s = this.scene;
    s.fog = new THREE.Fog(FOG_COLOR, 28, 110);
    s.add(new THREE.HemisphereLight(0x3a4a7d, 0x0a0e1f, 0.85));
    const moon = new THREE.DirectionalLight(0xbfd0ff, 0.55);
    moon.position.set(-30, 50, -20);
    s.add(moon);
    const pools = [
      [0, 3.2, 10, 0x22e6e6], [-9, 3.2, -4, 0xa06bff],
      [9, 3.2, -16, 0xff9f1c], [0, 3.2, -30, 0xff2bd6],
    ];
    for (const [x, y, z, c] of pools) {
      const l = new THREE.PointLight(c, 38, 22, 2);
      l.position.set(x, y, z);
      s.add(l);
    }
  }

  /* ---------------- ground (grid that glows near the pug) ---------------- */
  _ground() {
    this.groundUniforms = {
      uPug: { value: new THREE.Vector3(0, 0, 30) },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.groundUniforms,
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main(){
          vec4 w = modelMatrix * vec4(position,1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uPug; uniform float uTime;
        varying vec3 vW;
        void main(){
          vec3 base = vec3(0.039,0.055,0.122);
          vec2 c = vW.xz * 0.5;
          vec2 g = abs(fract(c) - 0.5) / fwidth(c);
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          float d = distance(vW.xz, uPug.xz);
          float glow = smoothstep(10.0, 0.0, d);
          float pulse = 0.78 + 0.22 * sin(uTime * 1.4 - d * 0.5);
          vec3 lineCol = vec3(0.10,0.85,0.85) * line * (0.10 + glow * 0.9 * pulse);
          // big soft pools of color
          float p1 = smoothstep(16.0,0.0,distance(vW.xz,vec2(-9.0,-4.0)));
          float p2 = smoothstep(16.0,0.0,distance(vW.xz,vec2(9.0,-16.0)));
          vec3 col = base + lineCol + vec3(0.35,0.18,0.6)*p1*0.05 + vec3(0.7,0.4,0.1)*p2*0.05;
          // manual fog to match scene fog
          float fd = distance(vW, cameraPosition);
          float f = smoothstep(28.0, 110.0, fd);
          col = mix(col, vec3(0.039,0.055,0.122), f);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), mat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
  }

  /* ---------------- sky: stars + moon ---------------- */
  _sky() {
    const n = 420, pos = new Float32Array(n * 3);
    const rng = mulberry32(7);
    for (let i = 0; i < n; i++) {
      const th = rng() * Math.PI * 2, ph = Math.acos(rng() * 0.85), r = 150;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) + 6;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85,
    }));
    this.scene.add(stars);

    const moon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(9, 1),
      new THREE.MeshBasicMaterial({ color: 0xf6f0d9, fog: false, toneMapped: false })
    );
    moon.position.set(-55, 48, -110);
    this.scene.add(moon);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(13, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x8fa3ff, transparent: true, opacity: 0.12, fog: false,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.position.copy(moon.position);
    this.scene.add(halo);
  }

  /* ---------------- neon entrance archway ---------------- */
  _arch() {
    const grp = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x171c33, roughness: 0.85 });
    const trimMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, toneMapped: false });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6.4, 0.9), pillarMat);
      p.position.set(sx * 6, 3.2, 0);
      grp.add(p);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.4, 0.12), trimMat);
      t.position.set(sx * 6 + (sx * -0.46), 3.2, 0.46);
      grp.add(t);
      this.colliders.push({ x: sx * 6, z: 26, r: 0.9 });
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(13.4, 1.9, 1.0), pillarMat);
    bar.position.set(0, 6.6, 0);
    grp.add(bar);

    this.archCanvas = document.createElement('canvas');
    this.archCanvas.width = 1024; this.archCanvas.height = 160;
    this.archTex = new THREE.CanvasTexture(this.archCanvas);
    this.archTex.colorSpace = THREE.SRGBColorSpace;
    this._drawArch();
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(12.6, 1.55),
      new THREE.MeshBasicMaterial({ map: this.archTex, transparent: true, toneMapped: false })
    );
    sign.position.set(0, 6.6, 0.52);
    grp.add(sign);
    grp.position.set(0, 0, 26);
    this.scene.add(grp);
    this._blob(-6, 26, 1.4, 0.3);
    this._blob(6, 26, 1.4, 0.3);
  }

  _drawArch() {
    const ctx = this.archCanvas.getContext('2d');
    const W = this.archCanvas.width, H = this.archCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '64px "Press Start 2P","Courier New",monospace';
    ctx.textBaseline = 'middle';
    const widths = [...this.archLetters].map((ch) => ctx.measureText(ch).width);
    const gap = 6;
    const total = widths.reduce((a, b) => a + b + gap, -gap);
    let x = (W - total) / 2;
    for (let i = 0; i < this.archLetters.length; i++) {
      const ch = this.archLetters[i];
      let alpha = i < this.archShown ? 1 : 0;
      if (i === this.archShown) alpha = Math.random() * 0.9; // letter being lit flickers
      if (i === this.archFlicker.idx && this.archFlicker.t > 0) alpha *= 0.25;
      if (alpha > 0.01) {
        ctx.globalAlpha = alpha;
        ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 26;
        ctx.fillStyle = '#ffe9fb';
        ctx.fillText(ch, x, H / 2 + 4);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ff7be8';
        ctx.fillText(ch, x, H / 2 + 4);
      }
      ctx.globalAlpha = 1;
      x += widths[i] + gap;
    }
    this.archTex.needsUpdate = true;
  }

  /** p in 0..1 — reveals arch letters; returns true when a new letter just lit (for buzz sfx) */
  setArchProgress(p) {
    const n = Math.floor(p * (this.archLetters.length + 1));
    const lit = n > this.archShown;
    this.archShown = Math.max(this.archShown, n);
    this._drawArch();
    return lit;
  }

  /* ---------------- arcade cabinets ---------------- */
  _cabinets() {
    this.games.forEach((game, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const z = 16 - row * 8;
      const x = side * (8.5 + Math.sin((row / 6) * Math.PI) * 2.5);
      const cab = this._buildCabinet(game, i);
      cab.group.position.set(x, 0, z);
      cab.group.lookAt(0, 0, z - side * 1.5); // face the boulevard, angled slightly down-path
      this.scene.add(cab.group);
      cab.group.updateMatrixWorld(true);
      cab.pos = new THREE.Vector3(x, 0, z);
      cab.screenWorld = new THREE.Vector3();
      cab.screen.getWorldPosition(cab.screenWorld);
      cab.front = new THREE.Vector3(0, 0, 1).applyQuaternion(cab.group.quaternion);
      this.cabinets.push(cab);
      this.colliders.push({ x, z, r: 1.45 });
      this._blob(x, z, 2.1, 0.32);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        for (const c of this.cabinets) this._drawMarquee(c);
        this._drawArch();
      });
    }
  }

  _buildCabinet(game, i) {
    const color = new THREE.Color(TAG_COLORS[game.tag] || '#22e6e6');
    const grp = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x161b32, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.3, 1.05), bodyMat);
    body.position.y = 1.15;
    grp.add(body);

    // glowing edge trims
    const trimMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.3, 0.07), trimMat);
      t.position.set(sx * 0.86, 1.15, 0.52);
      grp.add(t);
    }
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.07, 1.16), trimMat);
    skirt.position.y = 0.05;
    grp.add(skirt);

    // marquee (canvas: game name in tag color)
    const mCanvas = document.createElement('canvas');
    mCanvas.width = 512; mCanvas.height = 110;
    const mTex = new THREE.CanvasTexture(mCanvas);
    mTex.colorSpace = THREE.SRGBColorSpace;
    const marqueeMat = new THREE.MeshBasicMaterial({ map: mTex, toneMapped: false });
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.36), marqueeMat);
    marquee.position.set(0, 2.12, 0.54);
    marquee.rotation.x = -0.1;
    grp.add(marquee);

    // screen — boots dark, texture lazy-loads later
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x05060d, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.0), screenMat);
    screen.position.set(0, 1.42, 0.535);
    screen.rotation.x = -0.06;
    grp.add(screen);

    // control deck + two glowing buttons
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.55), bodyMat);
    deck.position.set(0, 0.85, 0.72);
    deck.rotation.x = 0.3;
    grp.add(deck);
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 10), trimMat);
      b.position.set(sx * 0.28, 0.95, 0.78);
      b.rotation.x = 0.3;
      grp.add(b);
    }

    const cab = {
      group: grp, game, screen, screenMat, marqueeMat, mCanvas, mTex, color,
      boot: 0, hotT: 0, hot: false, flickerT: 0, phase: i * 1.7,
    };
    this._drawMarquee(cab);
    return cab;
  }

  _drawMarquee(cab) {
    const ctx = cab.mCanvas.getContext('2d');
    const W = cab.mCanvas.width, H = cab.mCanvas.height;
    const css = '#' + cab.color.getHexString();
    ctx.fillStyle = '#0c0f1f';
    ctx.fillRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.07)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    let size = 34;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    do {
      ctx.font = `${size}px "Press Start 2P","Courier New",monospace`;
      size -= 2;
    } while (ctx.measureText(cab.game.name.toUpperCase()).width > W - 40 && size > 12);
    ctx.shadowColor = css; ctx.shadowBlur = 22;
    ctx.fillStyle = css;
    ctx.fillText(cab.game.name.toUpperCase(), W / 2, H / 2 + 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.fillText(cab.game.name.toUpperCase(), W / 2, H / 2 + 2);
    ctx.globalAlpha = 1;
    cab.mTex.needsUpdate = true;
  }

  /** Lazy-load the 14 screenshots after first paint; screens "boot up" as they arrive. */
  loadScreens() {
    const loader = new THREE.TextureLoader();
    this.cabinets.forEach((cab, i) => {
      setTimeout(() => {
        loader.load(cab.game.img, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          cab.screenMat.map = tex;
          cab.screenMat.needsUpdate = true;
          gsap.to(cab, { boot: 1, duration: 0.55, ease: 'power2.out' });
        }, undefined, () => { cab.boot = 0.15; }); // missing image: leave a dim screen
      }, 250 + i * 140);
    });
  }

  setHot(cab, hot) { if (cab) cab.hot = hot; }

  /* ---------------- props: trees, balloons, popcorn cart, spotlights, fireflies ---------------- */
  _props() {
    const rng = this.rng;
    // cone trees around the perimeter
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 1 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2e26, roughness: 1 });
    const treeGeos = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rng() * 0.4;
      const r = 26 + rng() * 14;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.95 - 3;
      if (Math.abs(x) < 14 && z > -38 && z < 32) continue; // keep the boulevard clear
      const s = 0.8 + rng() * 0.7;
      const cone = new THREE.ConeGeometry(1.3 * s, 3 * s, 7);
      cone.translate(x, 1.5 * s + 0.5, z);
      treeGeos.push(cone);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.22 * s, 0.6, 6), trunkMat);
      trunk.position.set(x, 0.3, z);
      this.scene.add(trunk);
      this.colliders.push({ x, z, r: 0.8 * s });
    }
    if (treeGeos.length) {
      this.scene.add(new THREE.Mesh(mergeGeometries(treeGeos), treeMat));
    }

    // balloons on strings
    const balloonSpots = [
      [-7.2, 27.5], [7.2, 27.5], [-6.8, 28.6], [6.5, 26.5],
      [-12, 4], [12.5, -8], [-12.5, -22], [11, -28],
    ];
    balloonSpots.forEach(([x, z], i) => {
      const hue = (i * 0.13 + 0.02) % 1;
      const col = new THREE.Color().setHSL(hue, 0.85, 0.6);
      const anchor = new THREE.Group();
      anchor.position.set(x, 0, z);
      const h = 2.4 + this.rng() * 1.2;
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 12, 10),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, emissive: col, emissiveIntensity: 0.35 })
      );
      ball.scale.y = 1.15;
      ball.position.y = h;
      anchor.add(ball);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, h - 0.42, 0),
      ]);
      anchor.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x9fb4e8, transparent: true, opacity: 0.5 })));
      this.scene.add(anchor);
      this.balloons.push({ anchor, phase: this.rng() * 6.28, wob: 0, wobV: 0 });
    });

    // popcorn cart
    const cart = new THREE.Group();
    const cartBody = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.85),
      new THREE.MeshStandardMaterial({ color: 0xf0e9dc, roughness: 0.7 }));
    cartBody.position.y = 0.85;
    cart.add(cartBody);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xd62839, roughness: 0.7 }));
    roof.position.y = 2.0;
    cart.add(roof);
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0xd62839 }));
      pole.position.set(sx * 0.62, 1.65, 0);
      cart.add(pole);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12),
        new THREE.MeshStandardMaterial({ color: 0x3a2e26 }));
      wheel.rotation.x = Math.PI / 2;
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 0.55, 0.28, 0.42);
      cart.add(wheel);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd86b, toneMapped: false }));
    lamp.position.set(0, 1.45, 0.46);
    cart.add(lamp);
    const cartLight = new THREE.PointLight(0xffb74d, 10, 8, 2);
    cartLight.position.set(0, 1.6, 0.5);
    cart.add(cartLight);
    cart.position.set(7.5, 0, 23);
    cart.rotation.y = -0.5;
    this.scene.add(cart);
    this.colliders.push({ x: 7.5, z: 23, r: 1.1 });
    this._blob(7.5, 23, 1.5, 0.3);

    // volumetric-ish spotlight cones
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const spots = [[-6, 26, 0.25], [6, 26, -0.25], [-10, -10, 0.3], [10, -24, -0.3]];
    for (const [x, z, tilt] of spots) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 8.5, 16, 1, true), coneMat);
      cone.position.set(x, 4.25, z);
      cone.rotation.z = tilt;
      this.scene.add(cone);
      this.spotCones.push({ mesh: cone, base: tilt, phase: this.rng() * 6.28 });
    }

    // fireflies
    const fcount = Math.floor(60 * this.quality.particleMul);
    this.fireflyBase = new Float32Array(fcount * 3);
    this.fireflyOff = new Float32Array(fcount * 3); // scatter offsets
    this.fireflyVel = new Float32Array(fcount * 3);
    for (let i = 0; i < fcount; i++) {
      this.fireflyBase[i * 3] = (this.rng() - 0.5) * 50;
      this.fireflyBase[i * 3 + 1] = 0.5 + this.rng() * 2.5;
      this.fireflyBase[i * 3 + 2] = (this.rng() - 0.5) * 60 - 2;
    }
    const fgeo = new THREE.BufferGeometry();
    this.fireflyPos = new THREE.BufferAttribute(new Float32Array(fcount * 3), 3);
    fgeo.setAttribute('position', this.fireflyPos);
    this.fireflies = new THREE.Points(fgeo, new THREE.PointsMaterial({
      color: 0xd9f06b, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.fireflies);
  }

  _blob(x, z, r, opacity) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    this.scene.add(m);
    return m;
  }

  /* ---------------- bones ---------------- */
  _bones() {
    // one merged bone geometry, instanced as 25 meshes (cheap, easy show/hide)
    const shaft = new THREE.CylinderGeometry(0.05, 0.05, 0.34, 8);
    shaft.rotateZ(Math.PI / 2);
    const knobs = [];
    for (const ex of [-0.17, 0.17]) for (const ey of [-0.055, 0.055]) {
      const s = new THREE.SphereGeometry(0.085, 8, 8);
      s.translate(ex, ey, 0);
      knobs.push(s);
    }
    const boneGeo = mergeGeometries([shaft, ...knobs]);
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xffd86b, roughness: 0.4, emissive: 0xff9d00, emissiveIntensity: 0.85,
    });

    const taken = [];
    const ok = (x, z) => {
      if (Math.abs(x) > 34 || z > 31 || z < -38) return false;
      for (const c of this.colliders) {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 1.4) ** 2) return false;
      }
      for (const t of taken) {
        if ((x - t[0]) ** 2 + (z - t[1]) ** 2 < 9) return false;
      }
      return true;
    };
    let guard = 0;
    while (this.bones.length < 25 && guard++ < 4000) {
      // bias toward the boulevard, some strays out wide
      const wide = this.rng() < 0.3;
      const x = wide ? (this.rng() - 0.5) * 56 : (this.rng() - 0.5) * 13;
      const z = 30 - this.rng() * 66;
      if (!ok(x, z)) continue;
      taken.push([x, z]);
      const mesh = new THREE.Mesh(boneGeo, boneMat);
      mesh.position.set(x, 0.55, z);
      mesh.rotation.y = this.rng() * Math.PI;
      mesh.scale.setScalar(1.25);
      this.scene.add(mesh);
      this.bones.push({ mesh, x, z, phase: this.rng() * 6.28, collected: false });
    }
  }

  hideBone(i) {
    const b = this.bones[i];
    if (b) { b.collected = true; b.mesh.visible = false; }
  }

  /* ---------------- bark reactions ---------------- */
  onBark(pos) {
    for (const b of this.balloons) {
      const d = b.anchor.position.distanceTo(pos);
      if (d < 9) b.wobV += (Math.random() > 0.5 ? 1 : -1) * (9 - d) * 0.55;
    }
    for (const c of this.cabinets) {
      if (c.pos.distanceTo(pos) < 9) c.flickerT = 0.45;
    }
    // scatter fireflies
    const n = this.fireflyBase.length / 3;
    for (let i = 0; i < n; i++) {
      const dx = this.fireflyBase[i * 3] + this.fireflyOff[i * 3] - pos.x;
      const dz = this.fireflyBase[i * 3 + 2] + this.fireflyOff[i * 3 + 2] - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 10 && d > 0.01) {
        const k = (10 - d) * 0.9;
        this.fireflyVel[i * 3] += (dx / d) * k;
        this.fireflyVel[i * 3 + 1] += 1.5 + Math.random() * 2;
        this.fireflyVel[i * 3 + 2] += (dz / d) * k;
      }
    }
  }

  /* ---------------- per-frame ---------------- */
  update(dt, t, pugPos) {
    this.groundUniforms.uPug.value.copy(pugPos);
    this.groundUniforms.uTime.value = t;

    for (const cab of this.cabinets) {
      if (cab.locked) continue; // launch sequence owns this screen
      cab.hotT += ((cab.hot ? 1 : 0) - cab.hotT) * Math.min(1, dt * 7);
      let lum = cab.boot * (0.78 + 0.1 * Math.sin(t * 2.4 + cab.phase)); // idle hum
      lum *= 1 + cab.hotT * 0.55;
      if (cab.flickerT > 0) {
        cab.flickerT -= dt;
        lum *= 0.35 + Math.random() * 0.9;
      }
      const v = cab.screenMat.map ? Math.max(0.03, lum) : 0.04 + cab.boot;
      cab.screenMat.color.setScalar(v);
      const mp = 0.8 + 0.2 * Math.sin(t * (cab.hot ? 9 : 1.7) + cab.phase) * (0.4 + cab.hotT);
      cab.marqueeMat.color.setScalar(mp + cab.hotT * 0.5);
    }

    for (const b of this.bones) {
      if (b.collected) continue;
      b.mesh.rotation.y += dt * 1.6;
      b.mesh.position.y = 0.55 + Math.sin(t * 2.2 + b.phase) * 0.12;
    }

    for (const b of this.balloons) {
      b.wobV += -b.wob * 26 * dt - b.wobV * 3.2 * dt; // spring back
      b.wob += b.wobV * dt;
      b.anchor.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.05 + b.wob * 0.12;
      b.anchor.rotation.x = Math.cos(t * 0.7 + b.phase) * 0.04 + b.wob * 0.07;
    }

    for (const s of this.spotCones) {
      s.mesh.rotation.z = s.base + Math.sin(t * 0.4 + s.phase) * 0.06;
    }

    // fireflies drift + scatter recovery
    const n = this.fireflyBase.length / 3, fp = this.fireflyPos.array;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      this.fireflyOff[i3] += this.fireflyVel[i3] * dt;
      this.fireflyOff[i3 + 1] += this.fireflyVel[i3 + 1] * dt;
      this.fireflyOff[i3 + 2] += this.fireflyVel[i3 + 2] * dt;
      const dec = Math.exp(-1.6 * dt);
      this.fireflyVel[i3] *= dec; this.fireflyVel[i3 + 1] *= dec; this.fireflyVel[i3 + 2] *= dec;
      const home = Math.exp(-0.5 * dt);
      this.fireflyOff[i3] *= home; this.fireflyOff[i3 + 1] *= home; this.fireflyOff[i3 + 2] *= home;
      fp[i3] = this.fireflyBase[i3] + this.fireflyOff[i3] + Math.sin(t * 0.7 + i * 1.3) * 0.9;
      fp[i3 + 1] = this.fireflyBase[i3 + 1] + this.fireflyOff[i3 + 1] + Math.sin(t * 1.1 + i * 2.1) * 0.4;
      fp[i3 + 2] = this.fireflyBase[i3 + 2] + this.fireflyOff[i3 + 2] + Math.cos(t * 0.6 + i * 0.7) * 0.9;
    }
    this.fireflyPos.needsUpdate = true;

    // ambient neon flicker on a random arch letter
    if (this.archShown >= this.archLetters.length) {
      this.archAmbientTimer -= dt;
      if (this.archFlicker.t > 0) {
        this.archFlicker.t -= dt;
        if (Math.random() < 0.5) this._drawArch();
        if (this.archFlicker.t <= 0) { this.archFlicker.idx = -1; this._drawArch(); }
      } else if (this.archAmbientTimer <= 0) {
        this.archAmbientTimer = 4 + Math.random() * 5;
        this.archFlicker.idx = Math.floor(Math.random() * this.archLetters.length);
        this.archFlicker.t = 0.22;
      }
    }
  }
}
