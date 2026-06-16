# v2g — "CONSOLE BOOT": a powered-on game console portal

**Date:** 2026-06-16
**Status:** approved, implementing
**Scope:** New landing-page variant `v2g/`, reusing `shared/games.js` untouched and adding one
line to `shared/switcher.js`. Goal: an award-winning, animation-rich portal in the grammar of
overflow.sui.io (boot screen, oversized type, isometric keycap hero, pinned scroll-scrubbed copy,
theme inversion, staggered cards, sticky active-section nav, blueprint grid) — but with its own
identity: **booting a game console and stepping into the cartridge bay.**

## Concept

The page IS a game console powering on. You watch a boot/POST sequence, the headline scrambles in
over an isometric stack of 3D keycaps spelling `PLAY`, a short manifesto reveals word-by-word while
the console art stays pinned, and then the screen inverts to a dark **cartridge bay** where the 14
games stagger in as colorful numbered keycap-tiles. A sticky bottom nav tracks your section and
recolors as you go.

Identity hooks that distinguish it from v1–v2f: the **boot/POST aesthetic**, the **isometric
keycap hero with live demo cursors**, and **games-as-cartridges** colored by their existing tag.

## Tech stack (confirmed)

Loaded via CDN — no build step, consistent with the repo:
- **GSAP 3.12.x** + plugins: `ScrollTrigger`, `SplitText`, `ScrambleTextPlugin`, `CustomEase`, `Flip`.
- **Lenis 1.1.x** for smooth/inertial scroll, synced to `ScrollTrigger`.
- Hero illustration and keycaps are **CSS 3D transforms** (hand-built), not Lottie — no binary asset
  to source, fully controllable, themeable.
- All custom easing lives in one named `CustomEase` ("overflow") reused across the page for a
  coherent motion signature.

Reuses `window.GAMES` (14 games: `name/short/tag/url/img`), `window.TAG_COLORS`, `window.SITE`.

## The scroll journey (4 acts)

### Act 1 — BOOT (light theme, blueprint grid)
- On load, a **POST/boot sequence** over the grid: monospace lines type out
  (`> POWER ON SELF TEST`, `> MOUNTING CARTRIDGES… [14/14]`, `> READY`) with a **segmented progress
  bar** whose segments fill one per game (count derived from `GAMES.length`), ending `100%`.
- Bar completes → boot panel lifts/wipes away (Flip/clip-path) and **Act 1 hero reveals**:
  - Oversized headline **`JOJKO'S GAMES`** — animates in via `ScrambleTextPlugin` + `SplitText`
    line/char stagger.
  - Subhead `INSERT CARTRIDGE TO PLAY` + `<count>14 GAMES LOADED</count>` monospace tag.
  - Primary **magnetic `PLAY` button** (scrolls to the bay) + secondary index button.
  - **Isometric keycap hero** (see below) on the right, parallaxing to cursor + scroll.
- Sticky bottom nav appears: `BOOT · LIBRARY · ABOUT · ☕` with `BOOT` active.

### Act 2 — INSERT (pinned, theme cross-fades light → dark)
- The isometric console art **pins** (ScrollTrigger pin) on one side while a short manifesto on the
  other reveals **word-by-word, scroll-scrubbed** (SplitText words, opacity faded→solid driven by
  scroll progress — the exact Sui effect).
- Copy: a 2–3 sentence "what is this" blurb (personal portal to playable experiments; everything
  made for the joy of it; pick a cartridge). Ends with the prize-line analog: `14 cartridges · all
  free · no installs`.
- Background grid + type colors **cross-fade from the light boot theme to the dark bay theme** as
  the section scrubs, so entering Act 3 feels like the console dimming the lights.

### Act 3 — CARTRIDGE BAY (dark theme) — the games
- The 14 games render as **keycap-style cartridge tiles** in an **asymmetric grid** (varied
  column spans / staggered baseline, like Sui's numbered cards — NOT a uniform grid).
- Each tile: number `01`–`14`, game `name`, `<TAG>` rendered in monospace, accent color pulled
  from `window.TAG_COLORS[tag]`; the `screenshots/<game>.png` image is the face.
- **Stagger-in on scroll:** tiles slide/rise + fade in with the shared CustomEase, staggered by
  grid position (ScrollTrigger batch).
- **Hover reaction:** keycap depresses in 3D (translateZ down + shadow collapse), tilts toward the
  cursor (pointer-tracked rotateX/Y), screenshot brightens/zooms slightly, tag color glows. This is
  the same press physics as the hero keycaps (shared CSS/JS).
- **Category filter** = the bottom nav doubles as tag filters in this section (`ALL · ARCADE ·
  PUZZLE · ACTION · …` derived from distinct tags); selecting recolors the nav with `TAG_COLORS`
  and uses **GSAP Flip** to animate non-matching tiles out and survivors into their new positions.
- **Launch:** click a tile → brief "cartridge inserted" press + screen-flash, then navigate to
  `game.url` (respect existing/relative URLs from `GAMES`).

### Act 4 — FOOTER / POWER
- Closing band: `☕ Buy me a coffee` (`window.SITE.coffee`), a small `> SYSTEM HALTED` sign-off,
  and the standard **VER switcher chip** (from `shared/switcher.js`, unchanged).

## The isometric keycap hero + demo cursors (explicit requirement)

The hero centerpiece is a cluster of **isometric 3D keycaps** spelling `PLAY` (P-L-A-Y), each a
CSS-3D keycap (top face + extruded sides + drop shadow), colored from the palette, floating at
slightly different depths.

**Demo cursors (teach-by-showing), mirroring Sui:**
- Two decorative cursor sprites sit in the keycap cluster: a **white arrow pointer** and a **hand
  pointer** (CSS-drawn, no images).
- On idle, a looped GSAP timeline drives a **demo interaction**: the arrow drifts to a keycap, the
  keycap **presses down** (depress + shadow collapse), a soft "click" ripple, the cap pops back, and
  the arrow moves to the next cap — visibly teaching "these are clickable / hover me."
- The cluster **parallaxes** to real cursor position (subtle rotateX/Y of the whole group) and to
  scroll.

**Real hover reaction:**
- When the user's real pointer enters the hero area, the **demo loop pauses** and control hands to
  the real cursor: hovering a keycap depresses *that* cap, tilts it toward the pointer, and lifts
  neighbors slightly (magnetic). Moving away resumes the demo loop after a short idle timeout.
- Keycaps are interactive: clicking a hero keycap = the `PLAY` action (scroll to the bay) with a
  press + ripple, so the teach-animation pays off.

## Motion signature & flourishes (award detail)
- One shared `CustomEase` across all reveals → coherent "designed" feel.
- Headline **scramble-in**; section headers **scramble** on enter.
- **Magnetic buttons** (PLAY / nav items follow cursor within a radius).
- **Custom cursor** in the dark bay (small ring that scales on interactive hover; hidden on touch).
- Active-section nav with **animated underline/recolor** synced to ScrollTrigger.
- Optional **konami / hidden cartridge** egg: a secret 15th "???" tile that only appears after the
  konami code, linking somewhere fun (defer if time-boxed).

## Theme system
Two themes as CSS custom properties on a root element: **boot/light** (paper bg, ink text, blue
grid) and **bay/dark** (near-black bg, light text, neon grid). Act 2 scrubs `--theme-mix` 0→1 to
cross-fade. All component colors reference the vars so the inversion is one knob.

## Mobile / a11y / fallback
- **`prefers-reduced-motion`:** skip the boot sequence and all scroll-scrubbing; render hero +
  static games grid immediately; no demo-cursor loop; instant theme = dark bay.
- **Touch:** no custom cursor, no parallax-to-pointer; demo-cursor loop still plays in the hero
  (teaches tap); hover reactions become tap states; magnetic effects disabled.
- **No-JS / SEO:** semantic fallback list of games + section headings in the HTML (like the root
  `<noscript>`), so the page is meaningful without GSAP.
- Keycap hero degrades to a static isometric arrangement if 3D transforms unsupported.
- Lenis disabled under reduced-motion (native scroll).

## Components / file layout (isolation)
New folder `v2g/`:
- `index.html` — semantic structure for all 4 acts + boot panel + fallback list; CDN script tags;
  loads `../shared/games.js` and `../shared/switcher.js`.
- `style.css` — theme vars, blueprint grid, keycap 3D, asymmetric bay grid, nav, cursor, reduced-
  motion rules.
- `boot.js` — **conductor**: builds the boot sequence, renders the games grid from `window.GAMES`,
  wires Lenis + GSAP timelines (boot → hero → pin/scrub → bay stagger → filter Flip), the demo-
  cursor loop + real hover handoff, magnetic buttons, custom cursor, launch, and the reduced-motion
  branch. May split keycap/cursor logic into `keycaps.js` if `boot.js` grows past comfort.

Registry: add `{ id:'v2g', name:'Console Boot', blurb:'Boot a game console; the bay fills with
playable cartridges.' }` to `window.VARIANTS` in `shared/switcher.js`.

## Out of scope (YAGNI)
WebGL/Three.js, Lottie/binary assets, audio (no sound in this variant — keep it visual), a build
step, changing `games.js` shape, touching other variants, server/back-end of any kind.

## Success criteria
- Feels in the same quality tier as overflow.sui.io: smooth Lenis scroll, scrubbed word reveal,
  theme inversion, staggered keycap-cartridges, active-section nav.
- Hero keycaps show the demo-cursor teach loop AND react correctly to real hover/click.
- Works as variant `v2g` (switcher + root loader pick it up), reuses the shared games list,
  no build step, and degrades gracefully under reduced-motion / no-JS / touch.
