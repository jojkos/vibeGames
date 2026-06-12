// pug.js — pug builder + character controller + procedural animation
import * as THREE from 'three';

const CREAM = 0xf2d8a7;
const CREAM_DARK = 0xe3c48f;
const MASK = 0x33261c;
const PINK = 0xff8fa3;

export class Pug {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();          // world transform (position + yaw)
    this.body = new THREE.Group();           // squash/stretch + pose container
    this.group.add(this.body);

    this.vel = new THREE.Vector3();
    this.onGround = true;
    this.wasAirborne = false;
    this.yaw = Math.PI;                      // facing -z (into the park)
    this.legPhase = 0;
    this.stepTimer = 0;
    this.excitement = 0;                     // set by main when near a cabinet
    this.barkT = 0;
    this.barkCooldown = 0;
    this.scaleY = 1; this.scaleV = 0;        // squash & stretch spring
    this.earKick = 0;
    this.idleTime = 0;
    this.sitT = 0; this.lieT = 0;            // 0..1 pose blends
    this.sleeping = false;
    this.zzzTimer = 0;
    this.frozen = false;                     // intro / launch

    this._build();
    this.group.position.set(0, 0, 30);
    this.group.rotation.y = this.yaw;
    scene.add(this.group);

    // little warm follow-light so the pug always reads in the dark park
    this.light = new THREE.PointLight(0xffe2b0, 7, 7, 2);
    this.light.position.set(0, 2.4, 0.4);
    this.group.add(this.light);

    // blob shadow
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.013;
    scene.add(this.shadow);
  }

  /* ------------------------------------------------------------------ build */
  _build() {
    const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.85 });
    const creamD = new THREE.MeshStandardMaterial({ color: CREAM_DARK, roughness: 0.9 });
    const mask = new THREE.MeshStandardMaterial({ color: MASK, roughness: 0.9 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x140d06, roughness: 0.18 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pink = new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.7 });

    // chubby torso
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), cream);
    torso.scale.set(0.92, 0.76, 1.12);
    torso.position.y = 0.52;
    this.body.add(torso);
    // lighter chest patch
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xfae9c8, roughness: 0.9 }));
    chest.scale.set(0.8, 0.7, 0.7);
    chest.position.set(0, 0.42, 0.34);
    this.body.add(chest);

    // BIG head (~60% of body) on its own pivot
    this.head = new THREE.Group();
    this.head.position.set(0, 0.97, 0.34);
    this.body.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 22, 18), cream);
    skull.scale.set(1, 0.95, 0.92);
    this.head.add(skull);

    // dark squashed muzzle + jowls
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), mask);
    muzzle.scale.set(1.2, 0.8, 0.72);
    muzzle.position.set(0, -0.1, 0.36);
    this.head.add(muzzle);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), eyeMat);
    nose.position.set(0, -0.03, 0.53);
    this.head.add(nose);
    // worried-brow wrinkle (signature pug forehead)
    const brow = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 14, Math.PI), creamD);
    brow.position.set(0, 0.16, 0.36);
    brow.rotation.x = -1.25;
    this.head.add(brow);

    // big glossy eyes + highlights
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 12), eyeMat);
      eye.position.set(sx * 0.21, 0.045, 0.345);
      this.head.add(eye);
      this.eyes.push(eye);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), white);
      hl.position.set(sx * 0.025 + sx * 0.0, 0.035, 0.075);
      eye.add(hl);
    }

    // fold ears on pivots (so they can flop)
    this.ears = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.34, 0.3, 0.02);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), mask);
      ear.scale.set(0.72, 1.05, 0.45);
      ear.position.set(sx * 0.04, -0.13, 0);
      pivot.add(ear);
      pivot.rotation.z = sx * 0.55;
      pivot.rotation.x = 0.12;
      this.head.add(pivot);
      this.ears.push({ pivot, baseZ: sx * 0.55, side: sx });
    }

    // tiny tongue blep
    this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.13), pink);
    this.tongue.position.set(0.03, -0.21, 0.42);
    this.tongue.rotation.x = 0.45;
    this.head.add(this.tongue);

    // curled tail (cinnamon-roll torus arc) on a wag pivot
    this.tailPivot = new THREE.Group();
    this.tailPivot.position.set(0, 0.76, -0.5);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.05, 8, 16, Math.PI * 1.55), creamD);
    tail.rotation.y = 1.1;
    tail.rotation.z = 0.6;
    tail.position.y = 0.06;
    this.tailPivot.add(tail);
    this.body.add(this.tailPivot);

    // 4 stubby legs on hip pivots
    this.legs = [];
    const legPos = [
      [-0.26, 0.34, 0.3], [0.26, 0.34, 0.3],
      [-0.24, 0.34, -0.32], [0.24, 0.34, -0.32],
    ];
    legPos.forEach(([x, y, z], i) => {
      const hip = new THREE.Group();
      hip.position.set(x, y, z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.3, 10), cream);
      leg.position.y = -0.17;
      hip.add(leg);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), creamD);
      paw.scale.set(1, 0.6, 1.2);
      paw.position.set(0, -0.32, 0.03);
      hip.add(paw);
      this.body.add(hip);
      this.legs.push(hip);
    });
  }

  /* ------------------------------------------------------- actions */
  /** returns true if the bark fired (main plays sfx + world reactions) */
  bark() {
    if (this.barkCooldown > 0 || this.frozen) return false;
    this.barkCooldown = 0.35;
    this.barkT = 0.28;
    this.scaleV += 3.2; // little hop-punch
    this._wake();
    return true;
  }

  _wake() {
    if (this.idleTime > 7.5) this.scaleV += 4; // springs up from nap
    this.idleTime = 0;
    this.sleeping = false;
  }

  triggerStretch() { this.scaleY = 1.22; this.scaleV = 0.5; }
  triggerSquash(power = 1) { this.scaleY = 1 - 0.3 * power; this.scaleV = -0.5; this.earKick = 1.4 * power; }

  /* ------------------------------------------------------- per-frame */
  /**
   * input: { move:Vector2 (screen-relative, |v|<=1), sprint, jump, anyInput }
   * events: { onStep(speed), onJump(), onLand(power), onDust(pos,n) } provided by main/fx
   */
  update(dt, t, input, colliders, events) {
    const p = this.group.position;

    if (!this.frozen) {
      /* --- horizontal movement: snappy accel, drift at sprint --- */
      const maxSpeed = input.sprint ? 9 : 5.5;
      const dx = input.move.x * maxSpeed;
      const dz = input.move.y * maxSpeed;
      const moving = Math.abs(dx) + Math.abs(dz) > 0.05;

      let rate = 12; // reaches max in ~0.2s
      let drifting = false;
      if (moving) {
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (input.sprint && sp > 5.5) {
          const a1 = Math.atan2(this.vel.x, this.vel.z);
          const a2 = Math.atan2(dx, dz);
          let diff = Math.abs(a1 - a2) % (Math.PI * 2);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff > 0.55) { rate = 4.2; drifting = true; } // slide through hard turns
        }
        this.vel.x += (dx - this.vel.x) * Math.min(1, dt * rate);
        this.vel.z += (dz - this.vel.z) * Math.min(1, dt * rate);
        this._wake();
      } else {
        const f = Math.exp(-11 * dt); // no ice-skating
        this.vel.x *= f; this.vel.z *= f;
        if (Math.hypot(this.vel.x, this.vel.z) < 0.06) { this.vel.x = 0; this.vel.z = 0; }
      }
      if (drifting && this.onGround && events.onDust) {
        events.onDust(p, 2, true);
      }

      /* --- jump + gravity (floaty cartoon arc) --- */
      if (input.jump && this.onGround) {
        this.vel.y = 7;
        this.onGround = false;
        this.triggerStretch();
        this._wake();
        if (events.onJump) events.onJump();
      }
      this.vel.y -= 18 * dt;
      p.x += this.vel.x * dt;
      p.z += this.vel.z * dt;
      p.y += this.vel.y * dt;

      if (p.y <= 0) {
        if (!this.onGround) {
          const power = Math.min(1, -this.vel.y / 9);
          this.triggerSquash(power);
          if (events.onLand) events.onLand(power);
        }
        p.y = 0;
        this.vel.y = 0;
        this.onGround = true;
      } else if (p.y > 0.05) {
        this.onGround = false;
      }

      /* --- collisions: circles vs cabinets/props, park boundary --- */
      for (const c of colliders) {
        const ddx = p.x - c.x, ddz = p.z - c.z;
        const r = c.r + 0.45;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < r * r && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          p.x = c.x + (ddx / d) * r;
          p.z = c.z + (ddz / d) * r;
        }
      }
      const bd = Math.hypot(p.x, p.z - (-2));
      if (bd > 42) {
        p.x *= 42 / bd;
        p.z = -2 + (p.z + 2) * (42 / bd);
      }

      /* --- footsteps --- */
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (this.onGround && speed > 2) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = Math.max(0.16, 0.34 - speed * 0.018);
          if (events.onStep) events.onStep(speed);
        }
      } else {
        this.stepTimer = 0.05;
      }

      /* --- idle: sit at 8s, sleep at 13s --- */
      if (!input.anyInput && speed < 0.2 && this.onGround) this.idleTime += dt;
      this.sleeping = this.idleTime > 13;
    }

    /* ---------------- procedural animation ---------------- */
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const run = Math.min(1, speed / 9);

    // face velocity
    if (speed > 0.4) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 11);
      this.group.rotation.y = this.yaw;
    }

    // legs: diagonal gait
    this.legPhase += dt * (3 + speed * 2.6);
    const amp = 0.75 * run;
    this.legs[0].rotation.x = Math.sin(this.legPhase) * amp;
    this.legs[3].rotation.x = Math.sin(this.legPhase) * amp;
    this.legs[1].rotation.x = Math.sin(this.legPhase + Math.PI) * amp;
    this.legs[2].rotation.x = Math.sin(this.legPhase + Math.PI) * amp;

    // body bounce while running
    const bounce = Math.abs(Math.sin(this.legPhase)) * 0.07 * run;

    // squash & stretch spring (k=90, d=12), conserve volume
    const k = 90, dmp = 12;
    this.scaleV += (-(this.scaleY - 1) * k - this.scaleV * dmp) * dt;
    this.scaleY += this.scaleV * dt;
    this.scaleY = THREE.MathUtils.clamp(this.scaleY, 0.55, 1.45);
    const sxz = 1 / Math.sqrt(Math.max(0.4, this.scaleY));
    this.body.scale.set(sxz, this.scaleY, sxz);

    // tail wag — always; frantic near cabinets
    const wagSpeed = 7 + this.excitement * 14 + run * 4;
    const wagAmp = 0.45 + this.excitement * 0.5;
    this.tailPivot.rotation.z = Math.sin(t * wagSpeed) * wagAmp;
    this.tailPivot.rotation.y = Math.sin(t * wagSpeed * 0.5) * 0.15;

    // ears: lag vertical motion + landing kick
    this.earKick = Math.max(0, this.earKick - dt * 4);
    const earLift = THREE.MathUtils.clamp(-this.vel.y * 0.05, -0.35, 0.55) +
      Math.sin(t * 22) * this.earKick * 0.25;
    for (const e of this.ears) {
      e.pivot.rotation.z += ((e.baseZ + earLift * e.side) - e.pivot.rotation.z) * Math.min(1, dt * 9);
    }

    // bark pose: head snaps up, tongue out more
    this.barkCooldown = Math.max(0, this.barkCooldown - dt);
    this.barkT = Math.max(0, this.barkT - dt);
    const barkLift = this.barkT > 0 ? -0.55 * (this.barkT / 0.28) : 0;

    // idle sit / sleep pose blends
    const sitTarget = this.idleTime > 8 ? 1 : 0;
    const lieTarget = this.sleeping ? 1 : 0;
    this.sitT += (sitTarget - this.sitT) * Math.min(1, dt * (sitTarget ? 2.4 : 12));
    this.lieT += (lieTarget - this.lieT) * Math.min(1, dt * (lieTarget ? 1.6 : 12));
    const sit = this.sitT * (1 - this.lieT), lie = this.lieT;

    // sitting: butt down, chest up; lying: whole body flat, head drooped
    this.body.rotation.x = -0.5 * sit;
    this.body.position.y = bounce - 0.13 * sit - 0.3 * lie;
    this.legs[2].rotation.x = THREE.MathUtils.lerp(this.legs[2].rotation.x, -1.4, sit + lie);
    this.legs[3].rotation.x = THREE.MathUtils.lerp(this.legs[3].rotation.x, -1.4, sit + lie);
    this.legs[0].rotation.x = THREE.MathUtils.lerp(this.legs[0].rotation.x, -1.5 * lie, lie);
    this.legs[1].rotation.x = THREE.MathUtils.lerp(this.legs[1].rotation.x, -1.5 * lie, lie);
    this.head.rotation.x = barkLift + 0.18 * sit + (0.55 + Math.sin(t * 1.1) * 0.04) * lie;
    this.head.rotation.z = Math.sin(t * 0.7) * 0.06 * (sit + lie); // sleepy head tilt

    // sleeping eyes close, slow breathing
    const blink = lie > 0.5 ? 0.12 : (Math.sin(t * 0.9) > 0.985 ? 0.15 : 1);
    for (const e of this.eyes) e.scale.y += (blink - e.scale.y) * Math.min(1, dt * 18);
    if (lie > 0.5) {
      const breathe = 1 + Math.sin(t * 1.8) * 0.035;
      this.body.scale.x *= breathe; this.body.scale.z *= breathe;
    }

    // zzz timing flag for fx (main reads this)
    this.wantsZzz = false;
    if (lie > 0.8) {
      this.zzzTimer -= dt;
      if (this.zzzTimer <= 0) { this.zzzTimer = 0.9; this.wantsZzz = true; }
    }

    // shadow follows, shrinks with height
    this.shadow.position.x = p.x;
    this.shadow.position.z = p.z;
    const h = Math.min(1, p.y / 2.5);
    this.shadow.scale.setScalar(1 - h * 0.45);
    this.shadow.material.opacity = 0.4 * (1 - h * 0.6);
  }

  /** world position of the head (for Zzz, prompts) */
  headWorld(out) {
    return this.head.getWorldPosition(out || new THREE.Vector3());
  }
}
