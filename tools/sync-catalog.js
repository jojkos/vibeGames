#!/usr/bin/env node
// Refresh committed HTML catalogs so JavaScript-disabled visitors get the
// same projects and chronology. No packages or site build step required.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const catalog = require('../shared/catalog.js');
const root = path.resolve(__dirname, '..');
const variants = ['', 'v2a', 'v2b', 'v2c', 'v2d', 'v2e', 'v2e2', 'v2f', 'v2g'];
const check = process.argv.includes('--check');
let stale = false;
for (const variant of variants) {
  const relativeRoot = variant ? '../' : '';
  const context = { window: {}, document: { currentScript: { src: relativeRoot + 'shared/games.js' } } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared/games.js'), 'utf8'), context);
  const filename = path.join(root, variant, 'index.html');
  const original = fs.readFileSync(filename, 'utf8');
  const updated = original.replace(
    /(data-game-catalog="([^"]+)"[^>]*>\s*<!-- catalog:start -->\s*)[\s\S]*?(\s*<!-- catalog:end -->)/g,
    (html, before, type, after) => before + catalog.render(type, context.window.GAMES, html) + after
  ).replace(/(<span data-game-count>)\d+(<\/span>)/g, '$1' + context.window.GAMES.length + '$2');
  if (updated !== original) {
    stale = true;
    if (check) console.error('Catalog snapshot needs refresh: ' + path.relative(root, filename));
    else fs.writeFileSync(filename, updated);
  }
}
if (check && stale) process.exitCode = 1;
