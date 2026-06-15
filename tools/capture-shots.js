#!/usr/bin/env node
/* tools/capture-shots.js — HARNESS for capturing cabinet-screen art (arcade v2e).
 *
 * This is NOT a smart auto-capturer. Good frames come from DRIVING each game in
 * a browser and watching what happens (click past the title/age-gate/loading,
 * get into gameplay, make something move, grab frames that differ). Those
 * per-game driving steps live in the RECIPES map below — write them by running
 * the game and seeing where it gets stuck. The generic fallback is a crude poke
 * for simple games only; treat its output as a rough first pass.
 *
 * What the harness handles: launching your installed Chrome, serving the repo so
 * local games load, running the recipe, and tiling frames into the strip. Writes:
 *   screenshots/<name>.png          — single still (static fallback / launch image)
 *   screenshots/anim/<name>.png     — horizontal sprite-strip of N frames that
 *                                     the arcade cycles on the cabinet screen
 *
 * The games list (and the <name>) comes from shared/games.js — the img path's
 * basename is the <name>. Add a game THERE; then add a RECIPES entry to drive it.
 *
 * Requirements:  npm i -D playwright-core   (uses your installed Google Chrome)
 *                ffmpeg on PATH              (tiles frames into the strip)
 *
 * Usage:   node tools/capture-shots.js              # all games
 *          node tools/capture-shots.js pug-fiesta   # one or more, by <name>
 */
'use strict';
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const ANIM = path.join(REPO, 'screenshots', 'anim');
const PORT = 8137;
const VW = 760, VH = 550;            // capture aspect ≈ cabinet screen (18:13)
const FRAME_W = 304, FRAME_H = 220;  // each strip frame; arcade derives N from these

// english + czech "advance" words used to click past menus
const START_RE = /^(play locally|play game|play|start game|start hru|start|press start|tap to start|click to start|new game|begin|enter|single player|local 2 player|local|2 player|continue|ok|got it|let'?s go|spin!?|hraj|hrát|hrat|začít|zacit|nová hra|nova hra|pokračovat|pokracovat|spustit|roztočit|zatočit|ano|15\s*\+)$/i;
const COLD_RE = /waking up|application loading|spinning up|please wait|loading\.\.\./i;
const SPOTS = [[.5,.5],[.3,.4],[.7,.4],[.35,.7],[.65,.7],[.5,.3]];
const KEYS = [['ArrowRight','d','j'],['ArrowUp','w','Space','k'],['ArrowLeft','a','1'],['ArrowDown','s','Space','l']];

// Per-game overrides for games that need specific steps. Each recipe is an
// async (page, shot) => void; call shot() whenever you want to capture a frame.
const RECIPES = {
  'pug-fiesta-3d': async (page, shot) => {
    await page.waitForTimeout(3000);
    await clickText(page, /ano|15\s*\+|15 nebo/i);          // age gate: 15+
    await page.waitForTimeout(1800); await shot();           // main menu
    await clickText(page, /zahájit|zahajit|honitbu|start/i);  // enter game
    await page.waitForTimeout(4500);
    await page.mouse.click(VW / 2, VH / 2);
    for (const m of [[.7,.4],[.3,.55],[.6,.6]]) {
      for (const k of ['w','d','Shift']) await page.keyboard.down(k).catch(() => {});
      for (let i = 0; i < 5; i++) { await page.mouse.move(VW*m[0]+i*14, VH*m[1]); await page.mouse.click(VW*m[0], VH*m[1]).catch(() => {}); await page.waitForTimeout(120); }
      await page.waitForTimeout(700);
      for (const k of ['w','d','Shift']) await page.keyboard.up(k).catch(() => {});
      await shot();
    }
  },
};

async function clickText(page, re) {
  for (const sel of [page.getByRole('button', { name: re }), page.getByText(re)]) {
    const el = sel.first();
    if (await el.isVisible().catch(() => false)) { await el.click({ timeout: 2000 }).catch(() => {}); return true; }
  }
  return false;
}
async function waitWarm(page) {
  for (let i = 0; i < 24; i++) {
    const t = (await page.evaluate(() => document.body ? document.body.innerText.slice(0, 400) : '').catch(() => '')) || '';
    if (!COLD_RE.test(t) && t.trim().length) return;
    await page.waitForTimeout(2500);
  }
}
async function genericCapture(page, shot) {
  await waitWarm(page); await page.waitForTimeout(2500);
  await shot();                                  // landing / title
  for (let p = 0; p < 3; p++) if (!await clickText(page, START_RE)) break; else await page.waitForTimeout(1500);
  await page.waitForTimeout(1000); await shot(); // after entering
  for (let f = 0; f < 4; f++) {                  // motion frames
    for (let i = 0; i < 4; i++) { const s = SPOTS[(f*2+i) % SPOTS.length]; await page.mouse.click(VW*s[0], VH*s[1]).catch(() => {}); }
    const ks = KEYS[f % KEYS.length];
    for (const k of ks) await page.keyboard.down(k).catch(() => {});
    await page.mouse.move(VW*.5, VH*.5); await page.mouse.down().catch(() => {}); await page.mouse.move(VW*.3, VH*.78, { steps: 6 }); await page.mouse.up().catch(() => {});
    await page.waitForTimeout(850);
    for (const k of ks) await page.keyboard.up(k).catch(() => {});
    await shot();
  }
}

// minimal static server so local (in-repo) games load over http://
function serve() {
  const TYPES = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm','.mp3':'audio/mpeg','.ogg':'audio/ogg' };
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const fp = path.join(REPO, p);
    if (!fp.startsWith(REPO) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  }).listen(PORT);
}

function loadGames() {
  global.window = {}; global.document = { currentScript: { src: 'http://localhost:' + PORT + '/shared/games.js' } };
  require(path.join(REPO, 'shared', 'games.js'));
  return global.window.GAMES.map(g => ({
    name: path.basename(g.img).replace(/\.png$/, ''),
    url: g.url.replace('http://localhost:' + PORT + '/', 'http://localhost:' + PORT + '/'),
  }));
}

(async () => {
  fs.mkdirSync(ANIM, { recursive: true });
  const server = serve();
  let games = loadGames();
  const want = process.argv.slice(2);
  if (want.length) games = games.filter(g => want.includes(g.name));
  if (!games.length) { console.error('no matching games'); process.exit(1); }

  const browser = await chromium.launch({ channel: 'chrome' });
  for (const g of games) {
    process.stdout.write(`== ${g.name}  `);
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const raw = [];
    const shot = async () => raw.push(await page.screenshot());
    try {
      await page.goto(g.url, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
      await (RECIPES[g.name] || genericCapture)(page, shot);
    } catch (e) { process.stdout.write(`ERR ${e.message} `); }
    await ctx.close();

    // drop byte-identical frames, cap at 4
    const seen = new Set(), frames = [];
    for (const b of raw) { const k = b.length + ':' + b.slice(0, 80).toString('hex'); if (!seen.has(k)) { seen.add(k); frames.push(b); } }
    const keep = frames.slice(0, 4);
    if (!keep.length) { console.log('no frames'); continue; }

    // write static still (first frame) — only if one isn't committed yet
    const still = path.join(REPO, 'screenshots', g.name + '.png');
    if (!fs.existsSync(still)) fs.writeFileSync(still, keep[0]);

    // build the strip if we got ≥2 distinct frames; else leave it static-only
    if (keep.length >= 2) {
      const tmp = path.join(ANIM, '_tmp');
      fs.mkdirSync(tmp, { recursive: true });
      keep.forEach((b, i) => fs.writeFileSync(path.join(tmp, `f-${i}.png`), b));
      execFileSync('ffmpeg', ['-y','-loglevel','error','-i', path.join(tmp,'f-%d.png'),
        '-vf', `scale=${FRAME_W}:${FRAME_H},tile=${keep.length}x1`, path.join(ANIM, g.name + '.png')]);
      fs.rmSync(tmp, { recursive: true, force: true });
      console.log(`-> strip ${keep.length} frames`);
    } else {
      console.log('-> static only (1 frame)');
    }
  }
  await browser.close();
  server.close();
})();
