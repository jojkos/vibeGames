# v2e Improvements + Variant Switcher — Plan

Two parts: **A)** improve the Insert Coin Arcade (the chosen direction), **B)** make every variant
(v1 matrix, v2a–v2f) switchable and preserved, with one shared games definition.

---

## Part A — Arcade improvements

### A1. Fullscreen (drop the letterbox)
The 16:9 `#frame` bezel goes away as a layout constraint; the canvas fills the viewport.
- Buffer height stays the design unit (270); buffer width becomes `round(270 × viewportAspect)`
  (clamped ~360–640), recomputed on resize (debounced; static layer re-rendered, its canvas size
  computed from `GW/GH` instead of the current hard-coded 448×300).
- Camera clamp bounds computed from iso extents instead of hard-coded numbers.
- Keep the *flavor* of the CRT: glass reflection + vignette stay as full-viewport overlays; add a
  1px inner edge glow instead of the fat bezel. Add an optional ⛶ fullscreen-API button (HUD).
- Portrait mobile: narrower buffer, camera follows tighter — already handled by the clamp.

### A2. Auto-layout for cabinets (add a link → cabinet appears)
Replace the hard-coded 14-spot `LAYOUT` with a generator:
- Slot zones in priority order: back wall (x = 2,5,…, skipping the door/window span), left wall
  (y = 4,7,…), paired center rows (y = 5 & 9, x = 8,11,…). With the current 22×14 hall that yields
  exactly 14 slots — same look as today.
- If `GAMES.length` exceeds capacity, grow the hall: `GW += 3` per extra back+center column
  (and a second center row pair if it grows tall). Everything downstream (carpet, walls, neon
  strips, lamps grid, camera clamps, static canvas size) already derives or will derive from GW/GH.
- Lamps grid also generated from GW/GH so lighting scales with the room.
- Result: adding game #15 to the games list = it just shows up; zero layout edits.

### A3. Screenshot recognizability (the screens)
Three stacked fixes:
1. **Filter softening**: idle screen alpha 0.52 → 0.82 (1.0 awake), scanline darkening 0.26 → 0.10,
   drop the per-frame 7% flicker to 3%.
2. **Crisp-screen overlay** (the headline fix): a second, device-resolution canvas drawn with the
   same camera transform; cabinet screens (and only screens) are rendered there from full-res
   screenshots with the same shear — so screens are sharp and readable while the world stays
   chunky pixel art. Thematically perfect: lit CRTs glowing crisper than reality. Falls back to
   the current low-res screens if the overlay hurts perf on weak devices.
3. **Focus popup thumbnail**: the redesigned popup (A6) shows the actual screenshot at readable size.

### A4. Full game names
Both requested treatments:
- **Bus-display marquee scroll** on the cabinet marquee: names wider than the marquee scroll
  leftward in a loop (pause 1s at start, scroll, wrap) — exactly like a bus destination sign;
  short names stay centered and static. Implemented with a clipped, time-translated canvas draw
  (the `short` field in GAMES becomes unnecessary but stays as fallback).
- **Full name in the focus popup** (already full, but the popup gets restyled per A6, and very long
  names get a second row rather than truncation).

### A5. Player visibility vs ghosts
- Player gets a high-contrast redesign: amber/red jacket (reads against the purple hall), white
  sneakers, 1px dark outline, slightly larger (1px taller head), and a soft warm glow already
  exists — strengthen it.
- Ghosts get *more* ghostly: alpha 0.38 → 0.30, cooler/desaturated blue, slight vertical shimmer,
  no shadow (shadows ground things — only the real player should feel grounded).
- On spawn (and after launch-return), a bouncing "YOU ▼" pixel label floats over the player for 4s.

### A6. Focus popup ("INSERT COIN") restyle — in-world pixel style
Replace the current generic DOM plate with an arcade-styled one:
- Chunky pixel frame in the cabinet's tag color (double border + corner notches, CSS box-shadow
  steps — no border-radius), dark CRT-glass background with faint scanlines.
- Layout: screenshot thumb (left, ~96px, crisp) · full game name (two-line capable, pixel font) ·
  tag chip · blinking `▮ INSERT COIN — E` line with a tiny animated coin sprite.
- Bezel "chase lights" animation around the border while focused (matches the cabinet's bezel LEDs).
- Slides up with a squash-and-settle (GSAP back.out), tag-colored glow.

### A7. Smarter click/tap navigation
- **8-directional A***, with corner-cutting forbidden (diagonal allowed only if both adjacent
  orthogonals are free).
- **String-pulling smoothing**: after A* returns tile waypoints, greedily skip ahead to the
  furthest waypoint reachable in a straight line (capsule raycast vs blocked tiles at player
  radius) — paths become straight lines + minimal turns instead of staircases.
- Clicking a cabinet: pathfind to its front point, and on arrival auto-face the cabinet so focus
  triggers reliably. **Double-click/double-tap a cabinet = walk there + auto-insert coin** (one
  gesture to launch on mobile).
- Click feedback: a small expanding diamond "target marker" ping at the destination tile; path
  subtly previewed as 3-4 fading dots (first 0.5s only).
- Re-click while walking re-targets immediately (already works via path replace — keep).

### A8. Environment dressing (more striking hall)
All procedural pixel art, drawn once into the static layer (zero per-frame cost) unless noted:
- **Real posters** on the back + left walls (hand-coded pixel maps, ~14×18 each, parody-flavored
  to stay tasteful): Pokéball + "GOTTA PLAY 'EM", a Vader-esque helmet + "MAY THE COIN BE WITH
  YOU", **PUG BANGER** logo (pug face + lightning bolt — echoes Pug Fiesta), a Space-Invader,
  Pac-ghost lineup, a classic "WINNERS DON'T USE CHEAT CODES" PSA. Positioned in the gaps between
  cabinets/door/window.
- **OPEN 24/7** neon sign in the window (animated flicker, like the main sign).
- **Claw machine** in a corner (animated: claw drifts, occasionally descends and grabs nothing —
  authentic).
- **Jukebox** near the entrance with floating pixel notes (♪) — diegetic source for the attract
  music.
- **Sleeping cat** on top of one center cabinet — breathing 2-frame loop, tail flick every ~7s;
  barking… no, *clicking* near it makes it lift its head (small delight, ghost-proof: only reacts
  to the real player).
- **HIGH SCORES board** on the right wall: top 5 games by coins-you've-inserted (localStorage
  counter per game) with blinking #1 — turns your own usage into content.
- Floor details: one rain puddle by the door (reflective shimmer), a dropped coin sparkle that's
  pure decor, scuff marks in front of popular cabinets.
- A second window pane variant + occasional passer-by silhouette outside (rare, 1px shuffle).

### A9. Buy-me-a-coffee — back to contrasty yellow
- The DOM corner link becomes the original-style chunky **yellow pill**: `#FFDD00` background,
  dark text, cup icon, subtle shine sweep — pixel-font version of the root page's button, always
  visible (also on mobile now; small but tappable). In-world vending machine stays as the fun path.

### A10. Bonus polish (small, high charm-per-line)
- **Entrance intro**: on load the player walks in through the door (door swing + shop-bell ding +
  rain volume dips as the "door closes"). Skipped on reduced-motion; any input takes control.
- **Idle attract mode**: after 25s with no input, camera slowly drifts around the hall and random
  cabinets phantom-wake (the page demos itself); any input snaps back.
- Hover (fine pointers): cabinet under cursor gets a faint highlight + name tooltip near cursor.
- Coin counter in HUD title plate (`COINS: n`, total inserts, feeds the high-score board).

### Suggested build order (each step leaves the page working)
1. A1 fullscreen + A9 coffee (quick wins, structural)
2. A2 auto-layout (touches world/static sizing — do early)
3. A3 screens + A4 marquee names (the look)
4. A6 popup + A5 player/ghost contrast (the read)
5. A7 navigation (the feel)
6. A8 environment + A10 polish (the charm)

---

## Part B — Variant switcher + shared games definition

Goals: keep ALL variants browsable forever (including today's matrix page), switch between them
easily, one source of truth for the games list, still plain-static GitHub Pages deployment.

### B1. Repo restructure (pure moves, no rewrites)
```
/index.html            ← tiny entry: redirects to the chosen/default variant (see B3)
/v1/index.html         ← today's matrix portal, moved as-is (becomes "v1 — Matrix Tunnel")
/v2a … /v2f/           ← unchanged
/v2/index.html         ← upgraded: the "gallery/history" page listing ALL variants incl. v1
/shared/games.js       ← single source of truth (B2)
/shared/variants.js    ← list of variants {id, folder, name, blurb}
/shared/switcher.js    ← floating switcher widget (B4)
```
The matrix page's internal relative URLs (`bluff/index.html`, `screenshots/…`) get the same `../`
prefix treatment the v2 prototypes already use — or simply adopt B2 like everyone else.

### B2. Shared games definition that works from any folder depth
`shared/games.js` defines the canonical list ONCE with **root-relative** paths and resolves them
automatically:
```js
// shared/games.js  (loaded as <script src="…/shared/games.js"> from any page)
(function(){
  const src = document.currentScript.src;            // …/shared/games.js
  const ROOT = src.slice(0, src.indexOf('shared/games.js'));
  const abs = p => /^https?:/.test(p) ? p : ROOT + p;
  const DEF = [
    { name:"Zoopaloola", short:"ZOOPA", tag:"ARCADE",
      url:"https://zoopaloola.vercel.app/", img:"screenshots/zoopaloola.png" },
    // … all 14, img/url root-relative where local …
  ];
  window.GAMES = DEF.map(g => ({ ...g, url: abs(g.url), img: abs(g.img) }));
})();
```
Deriving ROOT from the script's own URL means it works at root, in `/v2e/`, on GitHub Pages
project paths (`user.github.io/repo/…`), and on localhost — no config. Each variant deletes its
inline GAMES copy and loads this instead (plus keeps any variant-specific extras like `short` —
which moves into the shared def). **Adding a game = edit one file, every variant updates.**
Tag→color map moves here too (`window.TAG_COLORS`) since 4 variants duplicate it.

### B3. Root entry + memory
`/index.html` becomes a ~30-line loader: reads `localStorage.variant` (default: `v2e` once
promoted; until then `v1`), and `location.replace()`s into that folder. Includes a `<noscript>`
plain list of variants + games. `?v=v2c` query overrides and saves. This keeps deployment dead
simple and the URL structure stable.

### B4. The switcher widget
`shared/switcher.js` + tiny CSS, included by every variant (one script tag each — the only edit
the finished prototypes need):
- Renders a small fixed chip (bottom-left, `VER v2e ▾`, styled neutrally so it doesn't clash with
  any theme; keyboard shortcut `V`).
- Opens a compact panel listing all variants from `variants.js` with name + one-line blurb +
  "history" framing (v1 → v2f). Clicking navigates to that variant and saves it as the preferred
  one (localStorage) so the root entry remembers.
- Also links to the `/v2/` gallery page for the full side-by-side history view.

### B5. Gallery page upgrade
`/v2/index.html` (already exists as the hub) gains: v1 card, screenshots/thumbnails per variant
(one static screenshot each, stored in `screenshots/variants/`), "set as my default" buttons, and
a short line about the lineage — your personal design-history museum.

### Part B order
1. B2 shared games.js (+ adopt in v2e first as the pilot)
2. B1 move matrix → /v1/ + root loader (B3)
3. B4 switcher widget + include everywhere
4. B5 gallery upgrade
5. Adopt shared games.js in remaining variants (mechanical, one at a time)

---

## Out of scope (noted, not planned)
- Real multiplayer presence (PartyKit/Supabase) — ghost echoes stay local for now.
- Build tooling/bundlers — everything stays static-host friendly.
