/* vox.js — the baking core. Props are defined as voxel functions and
   ray-cast (along the iso view axis (1,1,1)) into pixel sprites; the static
   room (floor/walls) uses the same shading through analytic boxes. Every
   pixel gets: albedo × (ambient + point lights · N·L) × AO × bevel, with the
   light quantised into bands through an ordered dither, then snapped to the
   global palette. Emissive materials also land in a glow map for bloom.
   Exposes window.Vox. */
(function(){
'use strict';
const V = window.Vox = {};

// face ids: 0 = +x, 1 = +y, 2 = +z (the three faces the camera can see)
const N = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// cool night ambient; top faces catch the most, +x faces the least
const AMB = [[.13, .108, .21], [.175, .145, .27], [.23, .19, .34]];
V.LEVELS = 6;          // light bands before dithering
V.EXPOSURE = 1.28;
V.lights = [];

/* light: { x, y, z (world units), c:[r,g,b] 0..1, I, R, cut } */
V.addLight = function(x, y, z, hex, I, R, cut){
  const c = PX.hex(hex).map(v => v / 255);
  const L = { x, y, z, c, I, R: R || 40, cut: cut || (R || 40) * 3 };
  L.R2 = L.R * L.R; L.cut2 = L.cut * L.cut;
  V.lights.push(L);
  return L;
};
V.lightsNear = function(cx, cy, cz, rad){
  return V.lights.filter(L => {
    const dx = L.x - cx, dy = L.y - cy, dz = L.z - cz;
    const r = L.cut + rad;
    return dx * dx + dy * dy + dz * dz < r * r;
  });
};

/* shade → packed palette colour. albedo [r,g,b] 0..255, emit 0..1,
   (px,py,pz) world point, f face id, occ (AO × bevel multiplier),
   (sx,sy) screen pixel for the dither phase. */
V.shade = function(lights, albedo, emit, px, py, pz, f, occ, sx, sy){
  const n = N[f];
  let r = AMB[f][0], g = AMB[f][1], b = AMB[f][2];
  for (let i = 0; i < lights.length; i++){
    const L = lights[i];
    const dx = L.x - px, dy = L.y - py, dz = L.z - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > L.cut2) continue;
    const d = Math.sqrt(d2) || 1;
    let ndl = (dx * n[0] + dy * n[1] + dz * n[2]) / d;
    if (ndl <= 0) continue;
    ndl = .25 + .75 * ndl;                     // wrap — softer terminator
    const win = 1 - d / L.cut;
    const a = L.I * ndl * win * win / (1 + d2 / L.R2);
    r += L.c[0] * a; g += L.c[1] * a; b += L.c[2] * a;
  }
  r *= occ; g *= occ; b *= occ;
  // quantise light into bands, dithered at the band edges
  const lum = Math.max(r, g, b);
  if (lum > 0){
    const q = Math.floor(lum * V.LEVELS + PX.bayer(sx, sy)) / V.LEVELS;
    const k = q / lum;
    r *= k; g *= k; b *= k;
  }
  const E = V.EXPOSURE, ke = emit || 0, kl = 1 - ke * .85;
  return PX.near(
    albedo[0] * (r * E * kl + ke * 1.05),
    albedo[1] * (g * E * kl + ke * 1.05),
    albedo[2] * (b * E * kl + ke * 1.05));
};

/* bake(model) → sprite.
   model: { X, Y, Z, at(ix,iy,iz)→material|null, wx, wy (world-unit origin),
            tc?(ix,iy,iz,f)→[x,y,z,f] texture-space remap (rotations) }
   material: { rgb:[..] | tex(x,y,z,f,model)→[..], emit, glass (0..1) }
   sprite: { cv, glow, mask(Uint32), w, h, ox, oy } — draw at
           iso(origin) + (ox, oy). 2px transparent margin for outlines. */
V.bake = function(m){
  const X = m.X, Y = m.Y, Z = m.Z;
  const M = 2;
  const minSX = -Y - M, maxSX = X + M;
  const minSY = -Z - M - 1, maxSY = Math.ceil((X + Y) / 2) + M;
  const W = maxSX - minSX, H = maxSY - minSY;
  const col = new Uint32Array(W * H), glow = new Uint32Array(W * H);
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z) ? null : m.at(x, y, z);
  const solid = (x, y, z) => { const q = at(x, y, z); return !!q && !q.glass; };
  const lights = V.lightsNear(m.wx + X / 2, m.wy + Y / 2, Z / 2, Math.max(X, Y, Z));
  const tc = m.tc;

  for (let sy = minSY; sy < maxSY; sy++){
    for (let sx = minSX; sx < maxSX; sx++){
      const ox = sx + .5, oz = (sx + .5) / 2 - (sy + .5);
      // ray p(t) = (t + ox, t, t + oz); inside box for t ∈ [lo, hi)
      const hi = Math.min(X - ox, Y, Z - oz), lo = Math.max(-ox, 0, -oz);
      if (hi <= lo) continue;
      let t = hi - 1e-6;
      let ix = Math.floor(t + ox), iy = Math.floor(t), iz = Math.floor(t + oz);
      let f = (X - ox) === hi ? 0 : (Y === hi ? 1 : 2);
      let gR = 0, gG = 0, gB = 0, gA = 0, glint = false;
      let hit = null;
      for (let guard = 0; guard < 400; guard++){
        if (ix < 0 || iy < 0 || iz < 0) break;
        const q = (ix < X && iy < Y && iz < Z) ? m.at(ix, iy, iz) : null;
        if (q){
          if (q.glass){
            if (gA === 0 && ((sx + sy * 2) & 7) === 0) glint = true;
            const a = q.glass * (1 - gA);
            const gc = q.rgb;
            gR += gc[0] * a; gG += gc[1] * a; gB += gc[2] * a; gA += a;
          } else { hit = q; break; }
        }
        // next boundary crossing (all axes move −1 per unit t)
        const tx = ix - ox, ty = iy, tz = iz - oz;
        if (tx >= ty && tx >= tz){ t = tx; ix--; f = 0; }
        else if (ty >= tz){ t = ty; iy--; f = 1; }
        else { t = tz; iz--; f = 2; }
      }
      const i = (sy - minSY) * W + (sx - minSX);
      let out = 0;
      if (hit){
        // texture-space coordinates (rotated models remap here)
        let tx = ix, ty = iy, tz = iz, tf = f;
        if (tc){ const r = tc(ix, iy, iz, f); tx = r[0]; ty = r[1]; tz = r[2]; tf = r[3]; }
        const alb = hit.tex ? hit.tex(tx, ty, tz, tf, m) : hit.rgb;
        const emit = hit.emitTex ? hit.emitTex(tx, ty, tz, tf, m) : (hit.emit || 0);
        // ambient occlusion: solids around the empty cell in front of the face
        const n = N[f];
        const cx = ix + n[0], cy = iy + n[1], cz = iz + n[2];
        let occ = 1;
        if (emit < .5){
          let cnt = 0;
          if (f === 2){
            for (const d of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]) if (solid(cx + d[0], cy + d[1], cz)) cnt++;
          } else {
            const ax = f === 0 ? [0, 1, 0] : [1, 0, 0];
            for (const d of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){
              if (solid(cx + ax[0] * d[0], cy + ax[1] * d[0], cz + d[1])) cnt++;
            }
            // overhang shadow: anything solid above, just in front of this face
            for (let k = 1; k < 12; k++) if (solid(cx, cy, cz + k)){ occ *= .64 + k * .025; break; }
            if (iz === 0) occ *= .72;                         // floor contact
            else if (iz === 1) occ *= .88;
          }
          occ *= 1 - Math.min(5, cnt) * .075;
          // bevel: brighten edges that turn away from us (top edges, front lips)
          if (f === 2){
            if (!solid(ix + 1, iy, iz) || !solid(ix, iy + 1, iz)) occ *= 1.2;
          } else if (!solid(ix, iy, iz + 1)) occ *= 1.22;
          else if (f === 1 ? !solid(ix - 1, iy, iz) : !solid(ix, iy - 1, iz)) occ *= 1.08;
        }
        const wpx = m.wx + ix + .5 + n[0] * .5, wpy = m.wy + iy + .5 + n[1] * .5, wpz = iz + .5 + n[2] * .5;
        out = V.shade(lights, alb, emit, wpx, wpy, wpz, f, occ, sx, sy);
        if (emit > .35){
          const e = PX.unpack(out);
          glow[i] = PX.pack(e[0] * emit, e[1] * emit, e[2] * emit);
        }
        if (gA > 0){
          const c = PX.unpack(out), k = Math.min(.85, gA);
          out = PX.near(c[0] * (1 - k) + gR / gA * k * .9 + (glint ? 40 : 0),
                        c[1] * (1 - k) + gG / gA * k * .9 + (glint ? 46 : 0),
                        c[2] * (1 - k) + gB / gA * k * .9 + (glint ? 60 : 0));
        }
      } else if (gA > 0){
        out = PX.near(gR / gA * .5, gG / gA * .5, gB / gA * .5);
      }
      col[i] = out;
    }
  }
  const ol = m.noOutline ? col : PX.outline(col, W, H, m.outline);
  return {
    cv: PX.fromU32(ol, W, H), glow: hasAny(glow) ? PX.fromU32(glow, W, H) : null,
    mask: ol, w: W, h: H, ox: minSX, oy: minSY,
  };
};
function hasAny(u){ for (let i = 0; i < u.length; i++) if (u[i]) return true; return false; }

// is pixel (lx,ly) (sprite-local) opaque?
V.hit = function(spr, lx, ly){
  lx = Math.floor(lx - spr.ox); ly = Math.floor(ly - spr.oy);
  if (lx < 0 || ly < 0 || lx >= spr.w || ly >= spr.h) return false;
  return (spr.mask[ly * spr.w + lx] >>> 24) > 0;
};

/* rotate a front-facing(+y) model to face +x: world (x,y) ← model (Xs−1−y, x).
   Returns a model with X/Y swapped and a tc() that feeds textures the
   original model-space coordinates (so decals stay upright and unmirrored). */
V.faceEast = function(m){
  const XS = m.X;
  const r = Object.assign({}, m, {
    X: m.Y, Y: m.X,
    at: (x, y, z) => m.at(XS - 1 - y, x, z),
    // world face +x ↔ model +y (front); world +y ↔ model −x (id 3); top stays
    tc: (x, y, z, f) => [XS - 1 - y, x, z, f === 0 ? 1 : f === 1 ? 3 : 2],
  });
  return r;
};

// material helpers
V.mat = (hex, emit) => ({ rgb: PX.hex(hex), emit: emit || 0 });
V.glass = (hex, a) => ({ rgb: PX.hex(hex), glass: a == null ? .45 : a });
})();
