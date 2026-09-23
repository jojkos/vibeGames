/* kid.js — jojkos as a voxel figure: brown swept-up hair, short reddish
   beard, blue-grey eyes, big grin; navy/green flannel open over a white tee,
   dark jeans, white sneakers. Plus a tiny jetpack (it floats in space here).
   Returns a THREE.Group; call kid.tick(t, thrust) each frame. */
import * as THREE from 'three';

const PAL = {
  H: '#8a5636', h: '#5a3522', g: '#3e2416',                 // hair: highlight / base / shadow
  S: '#e9b48e', s: '#c98a66', E: '#d99c78',                 // skin / shadow / ears
  i: '#4d6a86', k: '#1e1a24',                                // iris, lash line
  B: '#8c4522', b: '#5e2c16',                                // beard / beard shadow
  t: '#f4ece0', m: '#4a1c1a',                                // teeth, mouth corners
  F: '#1d3866', f: '#1b5a45', l: '#4d7cb4',                  // flannel navy / green check / light thread
  T: '#d8d4cc', J: '#3b4568', j: '#2a3152', W: '#f4f1ea', w: '#a8a2c6',
};
// front view, 12 wide. Head is chibi-big on purpose (reads at a distance).
const HEAD = [
  '...HHHhh....',
  '..HHhhhhhh..',
  '.hHhhhhhhhh.',
  '.ghhhhhhhhhg',
  '.gSSSShhhhhg',
  'gSSSSSSSSShg',
  'EShhSSSShhSE',
  'ESikSSSSkiSE',
  'ESSSSssSSSSE',
  'EBSSSSSSSSBE',
  '.BBBBBBBBBB.',
  '.BBBmttmBBB.',
  '.bBBBmmBBBb.',
  '..bBBBBBBb..',
  '....SsSS....',
];
const TORSO = [
  '..FFlTTlFF..',
  '.FfFlTTlFfF.',
  'FFfFFTTFFfFF',
  'FlFFFTTFFFlF',
  'FFfFFTTFFfFF',
  'SFFfFTTFfFFS',
];
const LEGS = ['...JJj.jJJ..', '...JJj.jJJ..', '...JJj.jJJ..', '..wWWw.WWWw.'];
const FRONT_ONLY = new Set(['S', 's', 'i', 'k', 't', 'm', 'T', 'l']);

export function buildKid(geo, material){
  const vox = [];
  const rows = HEAD.concat(TORSO, LEGS);
  const H = rows.length;
  rows.forEach((row, y) => {
    const part = y < HEAD.length ? 'head' : y < HEAD.length + TORSO.length ? 'torso' : 'legs';
    const [z0, z1] = part === 'head' ? [0, 8] : part === 'torso' ? [1, 6] : [2, 5];
    for (let x = 0; x < 12; x++){
      const k = row[x];
      if (k === '.') continue;
      for (let z = z0; z < z1; z++){
        const front = z === z1 - 1;
        const edge = x === 0 || x === 11 || row[x - 1] === '.' || row[x + 1] === '.';
        if (part === 'head' && edge && (z === z0 || z === z1 - 1) && y < 13) continue;   // round the skull
        let c = k;
        if (!front){
          if (part === 'head'){
            // behind the face: hair over the top and back, beard round the jaw
            if (y <= 5) c = 'h';
            else if (y >= 9) c = z <= z0 + 1 ? 'g' : 'B';
            else c = z <= z0 + 2 ? 'h' : (k === 'E' ? 'E' : 'S');
            if (y >= 9 && z <= z0 + 1 && y >= 12) c = 'b';
          } else if (FRONT_ONLY.has(k)) c = part === 'torso' ? (k === 'S' ? 'S' : 'F') : k;
        }
        vox.push([x, H - 1 - y, z, PAL[c]]);
      }
    }
  });
  // jetpack on the back: grey body, cyan status light, two nozzles
  for (let x = 3; x <= 8; x++) for (let y = 5; y <= 9; y++) for (let z = -2; z <= 0; z++){
    const light = z === -2 && y === 8 && (x === 5 || x === 6);
    vox.push([x, y, z, light ? '#35dcea' : (z === -2 ? '#8a86a8' : '#cfd3e8')]);
  }
  const nozzles = [[4, 4, -1], [7, 4, -1]];
  for (const n of nozzles) vox.push([n[0], n[1], n[2], '#4a4660']);

  const S = .16;
  const cx = 5.5, cy = (H - 1) / 2, cz = 3.5;
  const mesh = new THREE.InstancedMesh(geo, material, vox.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  vox.forEach((v, i) => {
    m4.makeScale(S * .96, S * .96, S * .96);
    m4.setPosition((v[0] - cx) * S, (v[1] - cy) * S, (v[2] - cz) * S);
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(v[3]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  const g = new THREE.Group();
  g.add(mesh);
  // thruster flames (unlit, flicker in tick) — no extra point light (perf)
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false });
  const flames = nozzles.map(n => {
    const f = new THREE.Mesh(geo, flameMat);
    f.position.set((n[0] - cx) * S, (n[1] - cy - 1.2) * S, (n[2] - cz) * S);
    g.add(f);
    return f;
  });
  g.tick = (t, thrust) => {
    for (let i = 0; i < flames.length; i++){
      const k = .6 + .4 * Math.sin(t * 40 + i * 2) * Math.sin(t * 23 + i);
      const len = (.7 + thrust * 1.6) * k;
      flames[i].scale.set(S * .7, S * len, S * .7);
      flames[i].position.y = (4 - cy - .5) * S - S * len * .5;
    }
  };
  g.height = H * S;
  return g;
}
