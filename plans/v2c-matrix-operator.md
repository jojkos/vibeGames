# v2c — MATRIX: OPERATOR (rain-as-display console)

> Build prompt — self-contained. Read `plans/00-overview.md` first for shared requirements
> (game data, paths, tech constraints, definition of done). Output goes to `/v2c/index.html`.

## Pitch

Keep the Matrix identity, but fix the concept. The current page uses matrix rain as wallpaper
behind ordinary cards. The v2 idea: **the rain IS the screen**. The entire page is one glyph grid —
every pixel of UI, every screenshot preview, every menu is rendered as falling/condensing matrix
glyphs. You are the Operator at the console, watching the construct, and you "load programs"
(games) into it. No DOM cards anywhere — the medium is the message.

Two signature moments:
1. **Glyph-image condensation**: select a game and the ambient rain doesn't stop — it *condenses*,
   streams bending toward screen center, glyphs landing in place until they form that game's
   screenshot rendered AS glyphs (luminance-mapped, green-tinted, occasionally true-color flickers
   through "as the signal stabilizes"). This is the screenshot preview — made of rain.
2. **The pill choice**: first-ever visit shows the iconic choice. Blue pill → instant boring
   white-background HTML list of links, Times New Roman, "you chose comfort" (it fully works as a
   site! and doubles as the a11y/SEO/reduced-motion page). Red pill → the operator console.
   Choice remembered in localStorage; a tiny pill icon in the corner lets you switch worlds anytime.
   Award juries and Reddit alike love a committed joke.

## The glyph engine (core tech)

One full-screen canvas-2D glyph grid. This is the only renderer.

- Grid of cells ~14px (DPR-aware). Each cell: char, brightness 0..1, tint, and an owner —
  `rain` | `ui` | `image`.
- **Rain layer**: classic falling streams (katakana + digits) but written into the grid, with
  bright heads and fading tails (the current site's char set can be reused).
- **UI layer**: text written into the grid in a chunky way (each UI char = 1 cell, brightness 1,
  optional 2x2 "bold" blocks for headings using box-drawing/half-block chars). Menus, headers,
  HUD — everything is grid text. Blink/typing effects are per-cell operations.
- **Image layer**: screenshot drawn to small offscreen canvas (~grid resolution), sampled per cell:
  luminance → glyph ramp (` .:-=+*#%@` + katakana for mids), cell tint = pixel color desaturated
  toward green (a `signal` uniform 0..1 controls how much true color leaks through; idle pulses
  0.1→0.35).
- **Transitions are physical**: cells don't fade — they get *claimed*. A stream passing over a cell
  destined for the image "deposits" it (locks with a bright flash, then settles to target
  brightness). Releasing a preview lets streams wash the cells away. Target ramp-in ≈ 1.2s by
  spawning extra streams aimed at undeposited columns.
- Perf: only redraw dirty cells per frame where possible; full clears only during big transitions.
  ~(160×90)=14k cells max at 1080p — fine for canvas 2D with batched fillText by tint. Cap DPR at 1.5.

## Layout (all rendered in the grid)

```
┌──────────────────────────────────────────────────────────────┐
│ OPERATOR CONSOLE v2 · NODE JOJKOS · 14 PROGRAMS LOADED   [♪] │
│                                                              │
│  > PROGRAMS                 ┌────────────────────────┐      │
│    01 ZOOPALOOLA   ARCADE   │                        │      │
│    02 FACTORIO LAMP TOOL    │   (glyph-condensed     │      │
│  ▸ 03 LOL FUSION   PUZZLE   │    screenshot of the   │      │
│    04 PUG FIESTA   ACTION   │    selected program)   │      │
│    …                        │                        │      │
│    14 OK CORRAL    SHOOTER  └────────────────────────┘      │
│                              SIG 0x4F2A · TRACE STABLE      │
│                              [ ENTER ] LOAD PROGRAM          │
│ █ operator@construct:~$ _          buy_me_a_coffee ☕        │
└──────────────────────────────────────────────────────────────┘
```

- **Program list** (left): keyboard ↑/↓ or mouse hover (map pointer to cell → row). Selected row
  inverts (block-highlight cells) and triggers the condensation preview on the right.
- **Command line** (bottom): a REAL terminal prompt. Typing works: `load 4` or `load pug` launches,
  `list`, `help`, `theme amber|ice|classic`, `rain more|less`, `pill blue`, `whoami`, plus easter
  eggs (`neo`, `sudo make me a sandwich`, Konami code → every stream turns into pugs `ᶘᵒᴥᵒᶅ` for 5s).
  Casual users never need it; terminal people will scream with joy.
- **Coffee link**: rendered in-grid bottom-right as `buy_me_a_coffee ☕` glowing yellow (the ONLY
  non-green element on screen — intentional violation that draws the eye); cell-region is click-mapped.

## Entry sequence (first visit, ~6s, any-key skippable)

1. Black. Blinking cursor. Types: `Wake up, jojko's visitor...` (classic timing, typo-and-correct
   included: `follow the white pug`).
2. Rain starts as a single stream, multiplies to full storm in 2s with rising white-noise swell.
3. Streams part to reveal the pill choice (two glyph-drawn pills, red/blue, hover = they pulse).
4. Red → glyphs whirlpool into the console layout. (Return visits: 1.5s rain-in straight to console.)

## Launch sequence (the payoff, ~1.6s)

Selected program + Enter/click/`load`:
phone-dial SFX beat → console text rapidly logs a fake trace
(`TRACING ROUTE… NODE FOUND… INJECTING…`) → every glyph on screen
*becomes part of the image* (full-screen condensation of the screenshot, color bleeding in to ~80%
true color) → CRT power-off collapse (bright horizontal line) → navigate. It should feel like the
construct loaded you into the program.

## Sound (procedural Web Audio, mute toggle in-grid `[♪]`)

Rain hiss (filtered noise, intensity tracks stream count), per-deposit soft ticks (max ~20/s,
pitch-jittered), selection blip, typing clicks on the command line, dial-up-flavored launch sweep.

## Mobile

Same glyph engine, coarser grid (~18px cells). List becomes full-width; tap row = select + condense
preview below; tap preview/LOAD = launch. Command line hidden behind a `>` button (opens with
on-screen keyboard for the easter eggs). Touch-drag over the rain drags streams sideways (cheap,
delightful). No custom cursor.

## Tech stack

Zero libraries. Canvas 2D + vanilla JS + Web Audio. (GSAP unnecessary — all animation is cell-state
driven.) This concept's flex is craft-without-dependencies.

## File structure

```
v2c/
  index.html   (canvas + blue-pill fallback DOM + boot)
  grid.js      (glyph grid engine: cells, rain, deposit/claim system)
  ui.js        (layouts, list, command line, input mapping)
  imagecast.js (screenshot → glyph sampling, condensation choreography)
  audio.js
```

## Acceptance criteria

Everything in 00-overview "definition of done", plus:
- Zero DOM UI in red-pill mode (inspect element shows just canvas + hidden a11y nav) — the flex must be real.
- Condensation preview is recognizable as the actual screenshot within ~1.5s, and is mesmerizing
  to watch repeatedly (the bar: you switch between games just to see it again).
- Command line works with at least: load/list/help/theme/pill + 3 easter eggs.
- Blue pill page is a complete functional site (and is what reduced-motion/no-JS users get).
- 60fps storm on desktop; no jank while condensing.
