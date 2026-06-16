# vibeGames

JOJKOS GAMES — a personal portal to a pile of playable experiments.

▶ **[Play vibeGames](https://jojkos.github.io/vibeGames/)**

It's a static site (no build step, no framework) hosted on GitHub Pages. The
root picks a **landing-page variant** and redirects to it; every variant reads
the same games list, so adding a game in one place lights it up everywhere.

## Landing-page variants

`/index.html` redirects to a variant and remembers your choice
(`localStorage` key `jojkos_variant`; override with `?v=<id>`). The in-page
"VER" switcher writes the same key.

| id  | name |
|-----|------|
| v1  | Matrix Tunnel |
| v2a | Pug Playground 3D |
| v2b | The Studio Cut |
| v2c | Matrix: Operator |
| v2d | The Signal Degrades |
| **v2e** | **Insert Coin Arcade** (default) — walk a character around an isometric arcade hall and "insert a coin" at each cabinet |
| v2f | Patch Notes from the Void |

## Running locally

It's a static site, but it must be served over **HTTP** (not opened as a
`file://`), because each variant loads `shared/games.js` and its own scripts via
relative paths.

```sh
python3 -m http.server 8000
# then open:
#   http://localhost:8000/         → redirects to the default variant (v2e)
#   http://localhost:8000/v2e/     → a specific variant (keep the trailing slash!)
```

> Trailing slash matters: `http://localhost:8000/v2e` (no slash) resolves the
> variant's relative `<script src="world.js">` against the site root and 404s.
> Use `/v2e/` or the root `/`.

## Project layout

```
index.html              root redirector + no-JS fallback list
shared/
  games.js              ← THE games list (single source of truth)
  switcher.js           the in-page variant switcher
v1/ v2a/ … v2f/         the landing-page variants
screenshots/
  <name>.png            one still per game (cabinet screen / cards)
  anim/<name>.png       optional animated sprite-strip (arcade only)
bluff/ pokemonShooter/ …  the in-repo games
tools/
  capture-shots.js      regenerates the screenshots (see below)
```

---

## Adding a new game

### 1. Add it to `shared/games.js`

This file is the single source of truth — **every variant** reads it. Add one
entry to the `DEF` array:

```js
{ name:"My Cool Game", short:"COOL", tag:"ARCADE",
  url:"https://my-cool-game.vercel.app/",   // or a repo path: "myCoolGame/index.html"
  img:"screenshots/my-cool-game.png" },
```

| field | what it is |
|-------|-----------|
| `name`  | full display name |
| `short` | ~6-char code shown on marquees / labels (e.g. `DRIFT`, `CORRAL`) |
| `tag`   | category — **must be a key in `TAG_COLORS`** (same file). Adding a new tag? add a color for it too. |
| `url`   | external `https://…`, **or** a repo-relative path for an in-repo game (`myGame/index.html`). Paths resolve against the repo root, so they work from `/`, `/v2e/`, GitHub Pages and localhost alike. |
| `img`   | repo-relative path to the still, `screenshots/<name>.png`. **The basename `<name>` is the key used to find the animated strip** — keep it consistent. |

If the game lives in this repo, drop its folder at the top level (e.g.
`myCoolGame/`) and point `url` at its `index.html`.

That's all that's required — the new cabinet/card appears in every variant.
(The arcade grows its hall automatically to fit the new game.)

### 2. Add screenshots

Two assets per game, both keyed by `<name>` from the `img` field:

- **`screenshots/<name>.png`** — **required.** A single still. Used as the
  cabinet screen everywhere, as the launch image, and as the fallback when
  there's no animation. (Tools/utilities with nothing moving stop here.)
- **`screenshots/anim/<name>.png`** — **optional, arcade (v2e) only.** A
  horizontal **sprite-strip**: N equal-width frames (2–4 works well), each
  `304×220` (≈ the cabinet screen's 18:13 aspect). The arcade auto-detects it,
  derives the frame count from the image dimensions, and **cycles the frames**
  on the screen (low-res in the hall + crisp when you walk up). No strip → the
  screen just shows the static still.

#### How the frames get captured

Good frames don't come from a fire-and-forget script — they come from **driving
each game in a real browser and watching what happens**: open it, click past the
title / age-gate / loading screen, get into actual gameplay, nudge it so
something moves, and grab a few frames that genuinely differ. Every game is
different (different buttons, languages, controls, cold-start delays), so this is
an **observe-and-adjust loop**, not a single command. In this repo that driving
is typically done by **Claude Code** (ask it to "recapture the screenshots for
`<name>`") — it opens the page, looks at each state, and decides the next step,
the same way a person would.

`tools/capture-shots.js` is the **harness** for that, not the brain. It:

- launches your installed **Google Chrome** via `playwright-core`,
- serves the repo locally so in-repo games load,
- runs a per-game **recipe** (where the actual "open this, click that, now shoot"
  driving lives) — falling back to a crude generic poke for simple games,
- tiles the captured frames into `screenshots/anim/<name>.png` with **ffmpeg**
  (and writes a `screenshots/<name>.png` still if none is committed yet).

```sh
npm i -D playwright-core      # one-time; uses your installed Chrome, no download
# (ffmpeg must be on PATH — `brew install ffmpeg`)

node tools/capture-shots.js my-cool-game    # one (or several) by <name>
node tools/capture-shots.js                 # all games
```

#### Writing a recipe

The driving steps for a game live in the `RECIPES` map in
`tools/capture-shots.js`. You write them **by watching the game** — run it, see
where it gets stuck, add the click/keypress that gets past it, repeat.
`pug-fiesta-3d` is the worked example: dismiss the 15+ age gate, capture the
**main menu**, click into the game, then grab several in-game frames.

```js
const RECIPES = {
  'my-cool-game': async (page, shot) => {
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(2000); await shot();   // call shot() per frame
    // …drive the game (move, shoot, open a menu), shot() again…
  },
};
```

The generic fallback only handles English/Czech start buttons and basic motion —
treat anything it produces as a rough first pass and check it. Always **eyeball
the strips before committing**: open `screenshots/anim/<name>.png` and confirm
the frames actually differ and show the game, not a menu.
```
