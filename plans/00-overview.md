# vibeGames Landing Page v2 — Prototype Plans

Four competing prototypes for a next-level, award-winning-style landing page.
Current page (`/index.html`) stays live; each prototype is built standalone in its own folder
and the winner gets promoted to root later.

| ID  | Folder  | Concept                                   | Plan file |
|-----|---------|-------------------------------------------|-----------|
| v2a | `/v2a/` | Pug Playground 3D — drivable pug world    | [v2a-pug-playground-3d.md](v2a-pug-playground-3d.md) |
| v2b | `/v2b/` | Award-style editorial / WebGL portfolio   | [v2b-awwwards-editorial.md](v2b-awwwards-editorial.md) |
| v2c | `/v2c/` | Matrix Operator — rain-as-display console | [v2c-matrix-operator.md](v2c-matrix-operator.md) |
| v2d | `/v2d/` | The Signal Degrades — dithered phosphor wall | [v2d-signal-degrades.md](v2d-signal-degrades.md) |
| v2e | `/v2e/` | Insert Coin Arcade — isometric hall + ghost echoes | [v2e-insert-coin-arcade.md](v2e-insert-coin-arcade.md) |
| v2f | `/v2f/` | Patch Notes from the Void — brutalist physics zine | [v2f-patch-notes-void.md](v2f-patch-notes-void.md) |

Research behind v2d/v2e/v2f (and useful for all): [research-report.md](research-report.md)

## Shared requirements (apply to EVERY prototype)

These are baked into each plan, but listed once here as the source of truth.

### Core functionality (non-negotiable)
- The page is a portal to all 14 games/apps. Every game must be reachable and launchable.
- Keep the "Buy me a coffee" link: `https://buymeacoffee.com/jojkos` (visible, but it may be restyled to fit the concept).
- Site title/identity: JOJKOS GAMES (jojkos).

### Game data (canonical list — same as root `index.html`)
```js
const GAMES = [
  { name: "Zoopaloola",           url: "https://zoopaloola.vercel.app/",           tag: "ARCADE",  img: "screenshots/zoopaloola.png" },
  { name: "Factorio Lamp Editor", url: "https://factorio-lamp-editor.vercel.app/", tag: "TOOL",    img: "screenshots/factorio-lamp.png" },
  { name: "LoL Fusion loldle",    url: "https://lol-fusion.vercel.app/",           tag: "PUZZLE",  img: "screenshots/lol-fusion.png" },
  { name: "Pug Fiesta",           url: "https://pug-fiesta.vercel.app/",           tag: "ACTION",  img: "screenshots/pug-fiesta.png" },
  { name: "Pug Fiesta 3D",        url: "https://pug-fiesta3-d.vercel.app/",        tag: "ACTION",  img: "screenshots/pug-fiesta-3d.png" },
  { name: "Combat Arena",         url: "https://combatarena.onrender.com/",        tag: "PVP",     img: "screenshots/combat-arena.png" },
  { name: "Bluff Helper",         url: "bluff/index.html",                         tag: "TOOL",    img: "screenshots/bluff.png" },
  { name: "Calendar Puzzle",      url: "https://calendar-puzzle2.vercel.app/",     tag: "PUZZLE",  img: "screenshots/calendar-puzzle.png" },
  { name: "Pokemon Shooter",      url: "pokemonShooter/index.html",                tag: "SHOOTER", img: "screenshots/pokemon-shooter.png" },
  { name: "Tralala Clicker",      url: "tralalaGame/index.html",                   tag: "CLICKER", img: "screenshots/tralala.png" },
  { name: "LoL Wheel",            url: "lolWheel/index.html",                      tag: "RNG",     img: "screenshots/lol-wheel.png" },
  { name: "Neon Drifter",         url: "neonDrifter/index.html",                   tag: "RACE",    img: "screenshots/neon-drifter.png" },
  { name: "Guitar Tuner",         url: "guitarTuner/index.html",                   tag: "TOOL",    img: "screenshots/guitar-tuner.png" },
  { name: "OK Corral",            url: "https://okcorral.onrender.com/",           tag: "SHOOTER", img: "screenshots/ok-corral.png" },
];
```
IMPORTANT for prototypes living in a subfolder: relative game URLs and screenshot paths must be
prefixed with `../` (e.g. `../bluff/index.html`, `../screenshots/zoopaloola.png`).

### Tech constraints
- No build step. Single `index.html` per prototype (plus optional small JS/CSS/asset files in the same folder). Libraries via CDN (`<script type="importmap">` for Three.js, plain `<script>` tags for GSAP etc.). It must work by opening the folder on any static host (GitHub Pages style) — same deployment as today.
- 60 fps target on a mid-range laptop; graceful degradation switch for weak GPUs/mobile.
- Mobile is first-class: touch controls where the concept needs them, responsive layout, no horizontal scroll, `touch-action` handled.
- `prefers-reduced-motion`: provide a calm fallback (static list/grid of games, all reachable).
- Accessibility/SEO baseline: real `<a href>` links exist for every game somewhere in the DOM (can be a visually-hidden nav if the main UI is canvas), `<title>` + meta description, lang attr.
- Sound: nice-to-have, procedural via Web Audio (no audio files), always with a visible mute toggle, never autoplay-blocking-dependent.

### Definition of "done" for a prototype
1. Loads fast (< ~1.5s to interactive on broadband; lazy-load heavy textures after first paint).
2. All 14 games launchable; coffee link present.
3. Works on desktop (mouse + keyboard) and mobile (touch).
4. Has at least one "wow, did not expect that" moment within the first 10 seconds.
5. No console errors; reduced-motion fallback verified.
