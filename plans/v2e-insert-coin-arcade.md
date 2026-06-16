# v2e — INSERT COIN ARCADE (isometric hall with attract-mode cabinets & ghost echoes)

> Build prompt — self-contained. Read `plans/00-overview.md` first for shared requirements
> (game data, paths, tech constraints, definition of done). Output goes to `/v2e/index.html`.
> From research concept C2 (see `plans/research-report.md`). Deliberately DIFFERENT from v2a:
> v2a is third-person 3D behind-the-back; v2e is a stylized 2D **isometric** hall — cozy
> pixel-arcade diorama, not an open 3D park.

## Pitch

A rainy night. You push open the door of a small neon arcade hall, seen from a classic isometric
angle, and you're a tiny pixel character walking between 14 humming cabinets. Every cabinet runs
"attract mode": its real screenshot glowing on a tiny CRT, marquee flickering, sound bleeding as
you get close. Walk up, the cabinet wakes fully, `INSERT COIN` blinks — press it, a coin clinks
down the slot, the screen swallows the camera, and the game opens.

The 2026 twist (from the research): **presence**. Real multiplayer needs a backend, so the static
prototype ships with **ghost echoes** instead — your own previous visits, recorded to localStorage
and replayed as translucent ghost players wandering the hall. Second visit onwards, the arcade is
never empty: past-you is there, walking to the cabinets past-you liked. (HUD slot reads
"ECHOES IN HALL: 3". Phase-2 swap to PartyKit/Supabase makes them real visitors with zero redesign.)

The feeling: Stardew-Valley-cozy meets 80s arcade. Warm, lived-in, slightly melancholic.

## Tech stack

- **Canvas 2D, zero libraries** for the world (isometric projection is just `x' = (x−y)·tw/2,
  y' = (x+y)·th/2`). All art procedural: rect/path-drawn pseudo-pixel-art at a chunky scale
  (draw to a low-res offscreen buffer ~480×270, upscale with `image-rendering: pixelated`).
  This gives an instant cohesive pixel look without sprite assets.
- **GSAP** (CDN) only for DOM/HUD tweens. **Web Audio** procedural sound.
- Screenshots: drawn onto cabinet screens from the PNGs, downscaled into the pixel buffer
  (automatic "pixelation" for free), full-res only in the zoom-in launch moment.

## The hall

- Tile grid ~22×14. Layout: entrance at bottom, cabinets along walls and in two center back-to-back
  rows, walkable aisles between. Checkerboard carpet tiles in two dark purples; neon wall strips.
- **Cabinets** (x14): drawn isometric boxes ~2 tiles, side art tinted by tag color (same tag→hue map
  as v2a: ARCADE=orange, PUZZLE=violet, TOOL=cyan, ACTION=red, SHOOTER=yellow, PVP=magenta,
  CLICKER=green, RNG=pink, RACE=blue), marquee with the game name (tiny pixel font via canvas
  `fillText` at low res), screen showing the screenshot with a 2-frame flicker + scanline darkening
  every other row. Idle cabinets dim slightly; one random cabinet occasionally "demo-glitches".
- **Ambience**: rain streaking past the entrance window + faint thunder light; a snack machine and
  a change machine (decor); ceiling lamps with soft radial glow pools; dust motes; an animated
  "JOJKOS GAMES" neon sign above the entrance inside the hall, letters buzzing on at load.
- **Lighting model (cheap)**: each light/cabinet contributes a radial gradient on a multiply/screen
  overlay buffer; player carries a subtle glow. Night mood, pools of color.

## Player & controls

- Pixel character (~1 tile): tiny walk cycle (2-3 procedural frames, leg pixel swap), idle blink.
  Could be a pug — but v2a owns the pug; here make it a small hooded kid (Stranger-Things vibe).
- **Desktop**: WASD/arrows walk (8-dir, grid-free movement with wall/cabinet collision via the tile
  map), E or Space = insert coin at the focused cabinet.
- **Mobile**: tap-to-walk — A* over the tile grid to the tapped spot; tapping a cabinet pathfinds
  to it then auto-focuses; big `INSERT COIN` button slides up when focused.
- Camera: follows player with lerp, soft clamp at hall edges; slight zoom-in (~1.15x) when a
  cabinet is focused.

## Cabinet interaction (core loop)

1. Proximity (≤ ~1.5 tiles, facing): cabinet **wakes** — screen brightens to full, marquee stops
   flickering, its attract-mode audio (procedural chiptune blips, melody seeded by game index)
   crossfades in over the rain/room tone, title + tag appear in the HUD plate.
2. `INSERT COIN ▮` blinks above the cabinet. Press E / tap button:
3. Coin animation: a pixel coin arcs from screen-bottom into the slot, *clink-clink* (two-tone),
   screen flashes `CREDIT 1` → `PRESS START`, auto "start" after 400ms,
4. Camera zooms INTO the screen (pixel buffer scales up ~6x centered on that screen while the
   full-res screenshot crossfades in over the pixelated one — a satisfying resolution "pop"),
   white flash → navigate.
   Total ~1.4s, skippable by second press.
- Zero-effort path: HUD `MENU` button → overlay with all 14 games as plain links (also the
  a11y/SEO/reduced-motion page).

## Ghost echoes (the differentiator)

- **Record**: during play, sample player position + facing every 150ms (capped ~4 min) plus events
  (cabinet focused, coin inserted). On `visibilitychange`/`pagehide`, persist the trace to
  localStorage (keep the latest 5 traces, ~50KB cap total).
- **Replay**: on load, spawn each stored trace as a ghost — same character sprite at 35% opacity,
  cool-blue tint, no collision with player. Ghosts replay their path on loop with 2–6s random
  start offsets; when a ghost "inserts a coin", that cabinet does a faint phantom wake (no sound).
- First visit (no traces): one pre-baked ghost trace ships in the code (the "attendant" sweeping a
  loop of the hall) so the hall is never empty.
- HUD: `ECHOES IN HALL: n`. Tooltip/footnote: "echoes of past visits". Clear-echoes option in MENU.
- Code boundary: `ghosts.js` exposes `record(state)` + `getGhostFrames(t)` — Phase-2 realtime
  presence would replace only this module.

## HUD & framing (DOM)

CRT bezel framing: the canvas sits inside a subtle rounded dark bezel with a faint screen-glass
reflection gradient (the whole site is a screen you're looking at). HUD elements as pixel-styled
plates: top-left hall name + echo count, top-right sound toggle + MENU, bottom plate appears on
cabinet focus (title · tag · INSERT COIN hint). Coffee link: an in-world **vending machine** near
the entrance marked "COFFEE ☕ 1 COIN" — walking to it and pressing E opens buymeacoffee (plus a
small always-visible DOM fallback link in the corner).

## Sound (procedural, mute toggle)

Room tone: rain (filtered noise) + low hum. Footsteps soft ticks on carpet. Per-cabinet attract
melodies: 4-bar chiptune loops from a seeded PRNG per game index (square+triangle voices), mixed by
proximity so walking the aisle crossfades between songs — the hall is a soundscape. Coin clink,
power-up sweep on launch, thunder rumble occasionally.

## Performance & fallbacks

- Low-res buffer + upscale = trivially 60fps. Redraw whole buffer per frame is fine at 480×270;
  pre-render static floor/walls to an offscreen layer, redraw only dynamic entities over it.
- `prefers-reduced-motion` / no canvas: MENU overlay as full page (styled list, all links).
- Mobile: same renderer; ensure tap targets ≥ 44px for HUD; pathfinding tap-to-walk as above.

## File structure

```
v2e/
  index.html   (bezel, HUD DOM, menu overlay, boot)
  world.js     (tile map, iso renderer, lighting, props, rain)
  cabinets.js  (cabinet draw, attract mode, focus/coin/launch flow)
  player.js    (movement, collision, pathfinding, walk anim)
  ghosts.js    (trace record/replay — swappable presence module)
  audio.js     (room tone, chiptune attract loops, sfx)
```

## Acceptance criteria

Everything in 00-overview "definition of done", plus:
- The hall reads instantly as a cozy pixel arcade (squint test: warm light pools, glowing screens).
- Walking + collision feel tight; tap-to-walk pathfinding never gets stuck on cabinet corners.
- All 14 cabinets show the right screenshot/name; coin-insert launch works for every one.
- Attract-audio crossfade by proximity is noticeable when walking an aisle.
- Ghost echoes: record on first visit, visibly replay on reload (test via two visits); pre-baked
  attendant ghost present on a fresh profile.
- The zoom-into-the-screen launch with pixelated→full-res "pop" lands — it's the money shot.
