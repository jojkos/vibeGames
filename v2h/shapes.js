/* shapes.js — every form the voxel cloud can take. Pixel grids (the same
   hand-made pixel language as the arcade) extruded into cubes, plus a few
   procedural forms (wheel, vortex). Each shape → { pts:[[x,y,z]], cols:[hex] }
   centred on the origin, sized to ~SIZE world units. */

export const PAL = {
  k: '#1a1328', w: '#f4f1ea', g: '#8a86a8', s: '#cfd3e8', r: '#e8344e', R: '#8e2438', y: '#ffd23f', Y: '#fff1a0',
  o: '#ff8a3c', b: '#8a5a32', B: '#3e2618', t: '#e6b27a', p: '#ff8fb0', c: '#35dcea', C: '#1a7f93', G: '#46e06a',
  D: '#1f8f46', u: '#9b5cff', n: '#1d2b6a', m: '#ff3df0', q: '#4a3a6a',
};

const PUG = [
  '..BB........BB..',
  '.BBBttttttttBBB.',
  '.BBttttttttttBB.',
  '..tttttttttttt..',
  '.tttkkttttkkttt.',
  '.ttkwkkttkkwktt.',
  '.tttkkttttkkttt.',
  '.ttttBBBBBBtttt.',
  '.tttBBkkkkBBttt.',
  '.ttBBBkkkkBBBtt.',
  '.ttBBBBppBBBBtt.',
  '..tBBBBppBBBBt..',
  '...ttBBBBBBtt...',
  '.....tttttt.....',
];

export const ICONS = {
  katana: [
    '..............sw', '.............sws', '............sws.', '...........sws..', '..........sws...',
    '.........sws....', '........sws.....', '.......sws......', '......sws.......', '..y..sws........',
    '...yyws.........', '....yy..........', '...rky..........', '..rkr.y.........', '.rkr............', 'rkr.............'],
  panda: [
    '..kk........kk..', '.kkkk......kkkk.', '.kkkwwwwwwwwkkk.', '..kwwwwwwwwwwk..', '..wwwwwwwwwwww..',
    '.wwkkkwwwwkkkww.', '.wkkwkkwwkkwkkw.', '.wkkkkwwwwkkkkw.', '.wwkkwwwwwwkkww.', '.wwwwwwkkwwwwww.',
    '.wwwwwkkkkwwwww.', '..wwwwwkkwwwww..', '..wwwwkwwkwwww..', '...wwwwwwwwww...', '.....wwwwww.....'],
  lamp: [
    '......yyyy......', '....yyYYYYyy....', '...yYYwwYYYYy...', '...yYwwYYYYYy...', '..yYYwYYYYYYYy..',
    '..yYYYYYYYYYYy..', '..yYYYYYYYYYYy..', '...yYYYYYYYYy...', '....yyYYYYyy....', '.....yyyyyy.....',
    '......ssss......', '.....gsssss.....', '......ssss......', '.....gsssss.....', '......gggg......'],
  riddle: [
    '......yyyy......', '....yynnnnyy....', '...ynnnnnnnny...', '..ynnnyyyynnny..', '..ynnyynnyynny..',
    '.ynnnnnnnyynnny.', '.ynnnnnnyynnnny.', '.ynnnnnyynnnnny.', '.ynnnnnyynnnnny.', '..ynnnnnnnnnny..',
    '..ynnnnyynnnny..', '...ynnnyynnny...', '....yynnnnyy....', '......yyyy......'],
  pug: PUG,
  partypug: ['.......m........', '......mym.......', '.....mmmmm......', '....mymmmym.....'].concat(PUG.slice(1)),
  swords: [
    's..............s', 'ws............ws', '.ws..........ws.', '..ws........ws..', '...ws......ws...',
    '....ws....ws....', '.....ws..ws.....', '......wsws......', '.......ss.......', '......swsw......',
    '.....yy..yy.....', '....yy....yy....', '...by......yb...', '..bb........bb..', '.bb..........bb.', 'bb............bb'],
  dice: [
    '..gggggggggggg..', '.gwwwwwwwwwwwwg.', '.gwkkwwwwwwkkwg.', '.gwkkwwwwwwkkwg.', '.gwwwwwwwwwwwwg.',
    '.gwwwwwrrwwwwwg.', '.gwwwwwrrwwwwwg.', '.gwwwwwwwwwwwwg.', '.gwkkwwwwwwkkwg.', '.gwkkwwwwwwkkwg.',
    '.gwwwwwwwwwwwwg.', '..gggggggggggg..'],
  calendar: [
    '...k........k...', '..kkk......kkk..', '.rrrrrrrrrrrrrr.', '.rrrrrrrrrrrrrr.', '.wwwwwwwwwwwwww.',
    '.wqwwqwwqwwqwwq.', '.wwwwwwwwwwwwww.', '.wqwwqwwqwwqwwq.', '.wwwwwwwwwwwwww.', '.wqwwqwwrrwwqwq.',
    '.wwwwwwwrrwwwww.', '.wqwwqwwqwwqwwq.', '.wwwwwwwwwwwwww.'],
  pokeball: [
    '.....kkkkkk.....', '...kkrrrrrrkk...', '..krrrrrrrrrrk..', '.krrwwrrrrrrrrk.', '.krwwrrrrrrrrrk.',
    'krrrrrrrrrrrrrrk', 'krrrrrkkkkrrrrrk', 'kkkkkkkwwkkkkkkk', 'kwwwwwkkkkwwwwwk', 'kwwwwwwwwwwwwwwk',
    '.kwwwwwwwwwwwwk.', '.kwwwwwwwwwwwwk.', '..kwwwwwwwwwwk..', '...kkwwwwwwkk...', '.....kkkkkk.....'],
  shark: [
    '......c.........', '.....cc.........', '....ccc.........', '...cccc.......c.', '..cccccccc...cc.',
    '.ccccccccccccc..', 'cckcccccccccccc.', 'cccccccccccccc..', '.wwwwwwwwwcc.cc.', '..wkwkwkww....c.',
    '...wwwwww.......', '...C...C........', '..CCw.CCw.......'],
  car: [
    '.....mmmmmm.....', '....mcccccm.....', '...mcccccccm....', '.mmmmmmmmmmmmmm.', 'mmmmmmmmmmmmmmmY',
    'mmmmmmmmmmmmmmmm', '.mkkkmmmmmmkkkm.', '..kgk......kgk..', '...k........k...'],
  guitar: [
    '............bb..', '...........bsb..', '..........bsb...', '.........bsb....', '........bsb.....',
    '.......bsb......', '...oooosb.......', '..oooookko......', '.ooookkkkoo.....', '.oookkwkkoo.....',
    'ooookkkkooo.....', 'oooooookooo.....', 'ooooooooooo.....', '.ooooooooo......', '..ooooooo.......', '....ooo.........'],
  hat: [
    '.....BbbbbbB....', '....bbbBBbbbb...', '....bbbbbbbbb...', '....bbbbbbbbb...', '....rrrrrrrrr...',
    '.bb.bbbbbbbbb.bb', 'bbbbbbbbbbbbbbbb', '.bbbbbbbbbbbbbb.', '...bbbbbbbbbb...'],
  popper: [
    '...y.......m....', '.......c........', '..m....y...c....', '.........y......', '....c..m.....y..',
    '......yyy.......', '.....yyyyy..m...', '....ooyyyyy.....', '...ooooyyy......', '..ooyooo........',
    '.oooooo.........', 'ooyoo...........', 'ooo.............', 'o...............'],
  star: [
    '.......y........', '.......y........', '......yyy.......', '......yyy.......', 'yyyyyyyYyyyyyyy.',
    '.yyyyyYYYyyyyy..', '...yyyYYYyyy....', '....yyyyyyy.....', '....yyy.yyy.....', '...yy.....yy....', '..y.........y...'],
  cards: [
    '....wwwwwww.....', '...wwwwwwwwk....', '..wwrwwwwwwwk...', '.wwrrrwwwwwwwk..', '.wwwrwwwwwwwwk..',
    '.wwwwwwwrwwwwk..', '.wwwwwwrrrwwwk..', '.wwwwwrrrrrwwk..', '.wwwwwwrrrwwwk..', '.wwwwwwwrwwwwk..',
    '.wwwwwwwwwwrwk..', '..wwwwwwwwrrrk..', '...wwwwwwwwrk...', '....kkkkkkkk....'],
};

// which emblem each game wears (by name, then by tag, then a star)
const BY_NAME = {
  'samurai sword': 'katana', 'zoopaloola': 'panda', 'factorio lamp editor': 'lamp', 'lol fusion loldle': 'riddle',
  'pug fiesta': 'pug', 'pug fiesta 3d': 'partypug', 'combat arena': 'swords', 'bluff helper': 'dice',
  'calendar puzzle': 'calendar', 'pokemon shooter': 'pokeball', 'tralala clicker': 'shark', 'lol wheel': 'wheel',
  'neon drifter': 'car', 'guitar tuner': 'guitar', 'ok corral': 'hat', 'partyficrim': 'popper',
};
const BY_TAG = { CARDS: 'cards', PVP: 'swords', RNG: 'wheel', RACE: 'car', SHOOTER: 'hat', PARTY: 'popper', PUZZLE: 'riddle', TOOL: 'lamp', ARCADE: 'panda', ACTION: 'pug', CLICKER: 'shark' };
export function iconFor(game){ return BY_NAME[game.name.toLowerCase()] || BY_TAG[game.tag] || 'star'; }

// big 5×7 letters for the hero / finale words
const L57 = {
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
};
export function wordGrid(word, key){
  const rows = ['', '', '', '', '', '', ''];
  [...word].forEach((ch, i) => {
    const g = L57[ch];
    for (let r = 0; r < 7; r++) rows[r] += (i ? '.' : '') + g[r].replace(/#/g, key);
  });
  return rows;
}

/* grid → voxel points. depth = layers along z; the front layer keeps the
   pixel colour, deeper layers darken a touch so edges read in 3D. */
export function fromGrid(rows, opts){
  opts = opts || {};
  const depth = opts.depth || 2, SIZE = opts.size || 5;
  const pal = opts.pal || PAL;
  const h = rows.length;
  let w = 0; for (const r of rows) w = Math.max(w, r.length);
  const sp = SIZE / Math.max(w, h);
  const pts = [], cols = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++){
    const k = rows[y][x];
    if (k === '.' || !pal[k]) continue;
    for (let z = 0; z < depth; z++){
      pts.push([(x - (w - 1) / 2) * sp, ((h - 1) / 2 - y) * sp, (z - (depth - 1) / 2) * sp]);
      cols.push(z === 0 ? pal[k] : shade(pal[k], .72));
    }
  }
  return { pts, cols, sp };
}
function shade(hex, k){
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.round(v * k).toString(16).padStart(2, '0');
  return '#' + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255);
}

// prize wheel: coloured wedges, hub, pointer
export function wheel(size){
  const rows = [];
  const R = 7.5, C = ['r', 'y', 'c', 'm', 'G', 'o', 'u', 'w'];
  for (let y = 0; y < 17; y++){
    let r = '';
    for (let x = 0; x < 16; x++){
      const dx = x - 7.5, dy = y - 8.5, d = Math.hypot(dx, dy);
      if (y === 0 && (x === 7 || x === 8)) { r += 'w'; continue; }
      if (d > R) { r += '.'; continue; }
      if (d > R - 1.1) { r += 'k'; continue; }
      if (d < 1.6) { r += 'w'; continue; }
      const a = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
      r += C[Math.floor(a * 8) % 8];
    }
    rows.push(r);
  }
  return fromGrid(rows, { size, depth: 2 });
}

// a flat spiral galaxy (the manifesto moment) — n points
export function vortex(n){
  const pts = [], cols = [];
  const C = ['#ff3df0', '#35dcea', '#ffd23f', '#9b5cff', '#ff8a3c'];
  for (let i = 0; i < n; i++){
    const arm = i % 3, t = (i / n) ** .7;
    const r = .6 + t * 6.2;
    const a = t * 9 + arm * (Math.PI * 2 / 3) + (Math.random() - .5) * .5;
    pts.push([Math.cos(a) * r, (Math.random() - .5) * .5 * (1 - t) + Math.sin(a) * r * .18, Math.sin(a) * r * .55]);
    cols.push(C[(arm + (t * 4 | 0)) % C.length]);
  }
  return { pts, cols, sp: .2, loose: true };
}

export function shapeFor(key, size){
  if (key === 'wheel') return wheel(size);
  return fromGrid(ICONS[key] || ICONS.star, { size, depth: 2 });
}
