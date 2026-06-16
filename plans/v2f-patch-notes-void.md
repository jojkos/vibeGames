# v2f — PATCH NOTES FROM THE VOID (brutalist terminal zine with physics)

> Build prompt — self-contained. Read `plans/00-overview.md` first for shared requirements
> (game data, paths, tech constraints, definition of done). Output goes to `/v2f/index.html`.
> From research concept C3 (see `plans/research-report.md`). The anti-3D route: no WebGL needed.
> Wins on writing + physical typography (the MindMarket lesson: human craft over shader spectacle).

## Pitch

Lean into vibe-coding culture itself. The site is a monospace, brutalist **release log** — as if
the whole games collection were one long CHANGELOG.md published as a zine. Each game is an entry:

```
v0.7.3 — PUG FIESTA 3D ─────────────────────────── ACTION
shipped in one evening. the pug is now three-dimensional.
nobody asked. everybody won.
+ added: pug
+ added: third dimension
~ known issues: joy may persist after closing tab
                                            [ RUN ▸ ]
```

It reads like a human wrote it (because the copy is the product), and it *moves like a physics
toy*: headings collapse into letter-rubble when you flick them, screenshots chase your cursor as
image trails, and the page scrolls as one seamless infinite loop — entry 14 flows back into
entry 01 forever. Craft + honesty + wit; zero 3D.

The feeling: an engineer's zine pinned to a wall — raw, funny, obsessively typeset.

## Art direction

- **Brutalist mono**: near-white paper `#f2f0eb`, ink black `#111`, one warning-tape accent
  (orange-red `#ff4d00`) — deliberately the inverse of every dark neon concept (v2a–v2e are all
  dark; this one is LIGHT). Dark-mode flip via `prefers-color-scheme` (ink paper inverted).
- **Type**: JetBrains Mono everywhere (one family, three weights). Version numbers and titles
  HUGE (`clamp(40px, 8vw, 120px)`), body 14–16px mono. 1px solid borders, visible grid lines,
  `─` box-drawing rules, no border-radius anywhere, no shadows — flat ink.
- **Texture**: registration marks, `[FIG 04]` labels on screenshots, a running footer line like a
  printout: page counter, build hash (fake), `PRINTED FROM MEMORY · JOJKOS PRESS`.
- Header: masthead `PATCH NOTES FROM THE VOID` + subline `the complete shipping record of
  jojkos games · 14 releases · all playable`. Sticky thin top bar with progress + sound + menu.

## Copy (half the work — treat it as a deliverable)

Write an honest-funny entry for EVERY game: a version number (invented, characterful), the title,
tag, a 1–2 sentence deadpan description, 2–4 `+ added / ~ fixed / ! wontfix` lines, and a fake
metadata row (`hours: 6 · prompts: 41 · regrets: 0`). Tone: dry, self-aware, affectionate — never
cringe, never "lol random". Examples of register: "Combat Arena — v1.0.0 — two players enter, the
server bill grows"; "Guitar Tuner — v0.9.9 — the only serious one. it tunes guitars. that's it.
! wontfix: cannot tune your life". Each entry ends with `[ RUN ▸ ]` linking to the game.

## Structure & the infinite loop

One vertical feed of 14 entries, each a bordered "log block" with: left rail (giant index number
rotated 90°), the entry text, and the screenshot — printed as a framed `[FIG nn]` figure,
grayscale-by-default with a halftone-ish CSS treatment (`filter: grayscale(1) contrast(1.1)`),
snapping to full color on hover/center.

**Seamless infinite loop scroll** (the structural signature): after entry 14 the feed continues
with entry 01 again, forever, in both directions. Implementation: **Lenis** with `infinite: true`
+ content cloned once; on each scroll frame, wrap `scroll` by modulo of one content-length and
reposition — the GSAP+Lenis "never ending story" technique. A thin progress ring in the top bar
shows position-in-loop (laps counter increments each full loop: `LAP 02` — a wink for the obsessed).

## The physics gimmick (Matter.js — used surgically)

- Every entry's TITLE is split into letter spans (GSAP SplitText — now free — or manual split).
  At rest they're static text. On **flick** (fast pointer drag across the title) or on the
  `[ break ]` button each entry carries: letters become Matter.js bodies inside that entry block —
  they tumble, collide, pile on the entry's bottom border. The block keeps its layout (letters
  are absolutely positioned at their original spots first — no reflow).
- A `[ rebuild ]` button appears once broken: letters tween back to their exact origins
  (GSAP to-from-saved-positions), like a deploy restoring order. Satisfying both ways.
- Physics world exists per-entry and only while broken (create/destroy on demand) — never a
  page-wide perf cost. Cap: 2 entries broken at once (oldest auto-rebuilds).
- `/chaos` command (see palette) breaks ALL titles + enables gravity on figure images for 10s,
  then auto-rebuilds everything. One glorious mess.

## Image trail (the hover signature)

Hovering anywhere inside an entry spawns an **image trail**: small copies of that game's
screenshot (~140px, 1px ink border, like dropped photo prints) appear at the cursor position,
slightly rotated (random ±12°), at most every 90px of cursor travel, max ~8 live; each scales in
fast then fades/falls away (GSAP, stagger by spawn). Classic Codrops image-trail pattern, styled
as scattered prints rather than glossy WebGL. Pure DOM + GSAP — no canvas needed. On touch:
scrubbing a finger across the figure produces the same trail.

## Motion system (GSAP + ScrollTrigger + Lenis)

- Entries assemble on scroll-in: borders draw (scaleX), text lines reveal with a one-line mask,
  the figure develops from blank paper (clip-path wipe + grayscale fade-in). Fast, mechanical
  easings (`power4.out`, ~0.5s) — printing, not floating.
- Velocity reactions: scroll fast and type *skews* slightly (max 4°) + the accent progress bar
  thickens — the page feels like paper being yanked.
- Top-bar marquee ticks through rotating one-liners (`14 games and counting`, `0 builds failed
  (lies)`, `★ buy me a coffee keeps the void fed`).

## Command palette (the terminal soul)

`Ctrl/Cmd+K`, the `>` button (mobile), or just typing `/` opens a mono palette:
- `/play <name|index>` — fuzzy match, navigates to the game
- `/random` — random game, brief slot-machine roll through titles first
- `/list` — jump-list of all 14 (also the keyboard-nav path)
- `/chaos` — see physics; `/order` — rebuild all
- `/coffee` — opens buymeacoffee with a `+ funded: 1 coffee` toast
- `/dark` `/light` — theme override
Palette is also the a11y fast path (full keyboard support, focus trap, ARIA listbox).

## Launch transition

Click `[ RUN ▸ ]` (or palette): the entry's borders flash accent, a fake build log overlays the
block for ~700ms (`$ deploy pug-fiesta-3d … ✓ 0 errors, 1 pug`), the figure expands to fullscreen
(View Transitions API where supported, GSAP FLIP fallback), then navigate.

## Sound (tiny, procedural, off by default — toggle in top bar)

Typewriter ticks on entry assemble, paper-rip on break, mechanical ka-chunk on rebuild, soft
print-head whir while scrolling fast. All < 10 lines of Web Audio each.

## Mobile

Single column, full-width entries; titles still huge. Break-physics via a `[ break ]` button
(flick-detection too fiddly on touch). Image trail on figure-scrub. Infinite loop scroll works
natively with Lenis touch. The palette opens from the `>` button. Lighthouse mobile ≥ 95 —
this concept's bragging right is being the FAST one.

## Performance & fallbacks

- No WebGL, no canvas: this must be the lightest prototype (< 1MB excluding screenshots;
  lazy-load figures with `loading="lazy"`).
- `prefers-reduced-motion`: Lenis off (native scroll, loop disabled — feed just ends with entry 14
  + a `BACK TO TOP ↺` stamp), no physics, no trail, instant reveals. Still 100% of the content —
  this concept degrades the most gracefully of all six.
- No-JS: the feed is server-rendered-style plain HTML — fully readable and clickable. The
  brutalist promise: it's real HTML underneath.

## File structure

```
v2f/
  index.html   (ALL markup incl. full copy for 14 entries — content is real HTML, not JS-generated)
  style.css    (brutalist system, dark mode, reduced-motion)
  app.js       (Lenis loop, ScrollTrigger reveals, velocity skew, trail, palette, launch)
  physics.js   (per-entry Matter.js break/rebuild)
```

## Acceptance criteria

Everything in 00-overview "definition of done", plus:
- The copy is genuinely funny-dry for all 14 entries (gate: reading three random entries makes a
  developer exhale through their nose).
- Infinite loop is seamless in both directions — no jump, no flash, lap counter works.
- Title break + rebuild works on any entry; never breaks page layout; 60fps while tumbling.
- Image trail feels analog (scattered prints), capped and GC'd — no leak after minutes of waving.
- Palette: all commands above work; `/play pug` finds Pug Fiesta.
- Lighthouse mobile ≥ 95 perf; page fully usable with JS disabled.
