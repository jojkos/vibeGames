const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { render } = require('../shared/catalog.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared/games.js'), 'utf8');
function load(code = source, scriptURL = 'https://jojkos.github.io/vibeGames/shared/games.js') {
  const context = { window: {}, document: { currentScript: { src: scriptURL } } };
  vm.runInNewContext(code, context);
  return Array.from(context.window.GAMES);
}
const expected = ['Tralala Clicker', 'Pug Fiesta', 'Pokemon Shooter', 'LoL Wheel',
  'Guitar Tuner', 'Neon Drifter', 'Calendar Puzzle', 'Bluff Helper', 'Zoopaloola',
  'Combat Arena', 'Factorio Lamp Editor', 'Marco Oh No!', 'LoL Fusion loldle',
  'OK Corral', 'Pug Fiesta 3D', 'partyficRIM', 'Samurai Sword',
  'Obědy u Plynárenské', 'Jojkos Blaster'];

test('creation history determines the default order and preserves project URLs', () => {
  const games = load();
  assert.deepEqual(games.map(g => g.name), expected);
  assert.equal(new Set(games.map(g => g.name)).size, games.length);
  assert.equal(games[0].url, 'https://jojkos.github.io/vibeGames/tralalaGame/index.html');
  for (let i = 1; i < games.length; i++) {
    assert.ok(Date.parse(games[i - 1].createdAt) <= Date.parse(games[i].createdAt));
  }
});

test('a new project sorts by creation time even when inserted at the start of DEF', () => {
  const code = source.replace('var DEF = [', 'var DEF = [\n' +
    '{name:"Future project", createdAt:"2027-01-01T00:00:00Z", short:"NEW", tag:"TOOL", url:"new/index.html", img:"screenshots/new.png"},');
  const games = load(code);
  assert.equal(games.at(-1).name, 'Future project');
  assert.deepEqual(games.slice(0, -1).map(g => g.name), expected);
  const historic = load(code.replace('2027-01-01T00:00:00Z', '2024-01-01T00:00:00Z'));
  assert.equal(historic[0].name, 'Future project');
  assert.throws(() => load(code.replace('2027-01-01T00:00:00Z', 'invalid')), /invalid createdAt/);
});

test('every shared HTML layout includes every project in chronological order', () => {
  const games = load();
  for (const type of ['links', 'list', 'tagged', 'rows', 'transmissions', 'log']) {
    const html = render(type, games);
    let previous = -1;
    for (const name of expected) {
      const needle = type === 'rows' || type === 'transmissions' ? name.toUpperCase() : name;
      const index = html.indexOf(needle, previous + 1);
      assert.ok(index > previous, `${type}: ${name}`);
      previous = index;
    }
    if (type === 'rows') assert.equal((html.match(/class="row-index"/g) || []).length, games.length);
    if (type === 'log') assert.equal((html.match(/<article/g) || []).length, games.length);
  }
  assert.match(render('transmissions', games), />111\.5<\/span>/);
});

test('patch-note entries keep authored notes, but update numbering and canonical destinations', () => {
  const existing = '<article class="entry" id="e99" data-name="Tralala Clicker" data-tag="OLD" data-url="old" data-img="old.png">' +
    '<div class="rail" aria-hidden="true"><span>99</span></div><p>authored notes</p>' +
    '<a class="run" href="old">RUN</a><img src="old.png"><figcaption>[FIG 99]</figcaption></article>';
  const html = render('log', load(), existing);
  assert.match(html, /authored notes/);
  assert.match(html, /id="e01"/);
  assert.match(html, /<span>01<\/span>/);
  assert.match(html, /\[FIG 01\]/);
  assert.doesNotMatch(html, /data-url="old"|data-img="old.png"|href="old"/);
});

test('committed no-JS catalogs are current and app scripts load the shared data first', () => {
  execFileSync(process.execPath, ['tools/sync-catalog.js', '--check'], { cwd: root });
  for (const [variant, app] of [['v2a', '// Build the menu'], ['v2b', 'src="app.js"'],
    ['v2c', 'src="ui.js"'], ['v2d', '<script type="module">'], ['v2f', 'src="app.js"']]) {
    const html = fs.readFileSync(path.join(root, variant, 'index.html'), 'utf8');
    assert.ok(html.indexOf('src="../shared/games.js"') < html.indexOf('src="../shared/catalog.js"'));
    assert.ok(html.indexOf('src="../shared/catalog.js"') < html.indexOf(app));
    assert.equal((html.match(/src="\.\.\/shared\/games.js"/g) || []).length, 1);
  }
});
