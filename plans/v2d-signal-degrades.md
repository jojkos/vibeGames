# v2d — THE SIGNAL DEGRADES (live phosphor wall)

> Build prompt — self-contained. Read `plans/00-overview.md` first for shared requirements
> (game data, paths, tech constraints, definition of done). Output goes to `/v2d/index.html`.
> Concept distilled from 2025–2026 award-site research — see `plans/research-report.md`.
> Riding the "Technical Mono / dither-shader" wave (Efecto, Terminal Industries, Maxime Heckel's
> retro-shading work) + the "grid IS the experience" pattern (MADCLEM) — a combination no games
> portal currently owns.

## Pitch

The Matrix theme grown up: from CSS scanlines to a real signal-processing aesthetic. The whole
portal is one giant CRT phosphor surface rendered in WebGL. The 14 games are "transmissions" pinned
on an **infinite draggable wall**. At rest, every screenshot is quantized through an ordered-dither
shader into a 4-shade green phosphor palette — the page looks like a wall of intercepted broadcasts.
Move your cursor toward a tile and it **tunes in**: dithering dissolves, true color bleeds through,
ASCII noise around it resolves into the game's title, a hum sharpens into that tile's tone. Drag the
wall fast and everything smears with phosphor persistence (feedback-buffer ghosting), like dragging
a real CRT image. Click a tuned tile → full-screen detune-then-snap transition into the game.

The feeling: a numbers-station operator scanning frequencies and finding games instead of spies.
The cursor is a tuning knob. Signal strength = proximity.

## Tech stack

- **OGL** (CDN) — minimal WebGL lib; everything renders on planes + one fullscreen post quad.
  (Three.js acceptable if OGL fights back, but stay lean — total payload budget < 6MB incl. images.)
- **GSAP** (CDN, now fully free) + **Draggable + InertiaPlugin** for wall dragging with momentum.
- **Web Audio** for the radio-scanning soundscape (procedural, no files).
- No scroll, no Lenis — the page is a draggable canvas, not a document.

## Rendering architecture

Two-pass pipeline:

1. **Scene pass** → framebuffer: the tile wall. Each visible tile = textured plane (screenshot from
   a lazy-built texture atlas / individual textures). Per-tile uniform `uSignal` (0..1).
2. **Post pass** → screen: one fullscreen quad combining:
   - **Ordered dithering** (4×4 or 8×8 Bayer matrix): luminance (0.299r + 0.587g + 0.114b) quantized
     to a 4-step green phosphor ramp (`#021a06 → #0a3d12 → #1f7a2e → bright #4dff7a`-style; tune it).
     Dither amount per-pixel is driven by sampling a low-res "signal map" texture (tiles write their
     `uSignal` into it) so tuning is a smooth spatial field, not a per-tile toggle: color bleeds in
     from the cursor outward across the tile.
   - **Phosphor persistence**: blend previous frame's output back in (`mix(current, previous, p)`,
     p scales with drag velocity 0.0→0.85). Fast drags = glowing smears that settle when you stop.
   - **CRT finishing**: faint scanlines, slight barrel distortion, chromatic aberration that scales
     with drag velocity, soft vignette, animated grain. All subtle — Terminal-Industries premium,
     not retro-kitsch.

## The wall

- Layout: tiles in a staggered 2-row-deep brick arrangement on an infinite plane, wrapping with
  modulo virtualization in BOTH axes (drag any direction forever; the 14 repeat — that's a feature:
  the wall feels endless). Tile size ~38vmin, generous gutters where ambient static lives.
- Between tiles: ambient content rendered into the scene pass — drifting ASCII static, frequency
  numbers (`104.7`, `0x4F2A`), thin calibration crosses, an oscilloscope line that reacts to drag
  velocity. The wall must feel alive even where there's no game.
- Each tile carries: screenshot, and a monospace caption strip (canvas-generated texture):
  `04 · PUG FIESTA · ACTION` — captions stay dithered-green always (only the artwork tunes to color).

## Interactions

- **Drag to explore** (mouse or touch): inertia, slight tile parallax by depth row, persistence
  smear, pitch-shifting scan noise while moving.
- **Tune (the signature)**: `uSignal` per tile = smoothstep of cursor distance (desktop) /
  distance from screen center (mobile — so flick-scrolling auto-tunes whatever lands center).
  As signal rises: dither cell size shrinks → true color crossfades in → caption glitch-resolves
  from scrambled chars to clean text → audio: that tile's hum (each game gets a pitch from its
  index — scanning the wall plays a scale) fades up while static fades down.
- **Launch**: click/tap a tile with `uSignal > 0.6` → tile scales to fullscreen while OVER-tuning
  (color blows out, aberration spikes, one frame of full static) → snap to black with a CRT
  power-off line → navigate. ~1.1s, skip on second click.
- **HUD** (DOM, minimal mono text, corners): top-left `JOJKO'S GAMES — 14 TRANSMISSIONS`;
  top-right sound toggle + `INDEX` button (overlay list of all games as plain links — the
  zero-effort / a11y / SEO path); bottom-left live "frequency" readout that changes as you drag
  (pure flavor); bottom-right Buy-me-a-coffee as a small amber "ON AIR"-style sign — the only
  warm-colored DOM element.
- **Intro** (~2.5s, skippable): black → single white scanline blooms open (CRT power-on) → wall
  fades in fully dithered while a tuning sweep whistles → nearest tile auto-tunes once as a teach:
  "move to tune · click to play" in mono fades after first drag.
- **Easter egg**: Konami code or typing `static` → signal collapses for 5s, every tile becomes raw
  ASCII art of its screenshot (Efecto-style glyph mapping), then recovers. Bonus: typing `pug`
  auto-drags the wall to Pug Fiesta and tunes it.

## Sound design (procedural, mute toggle)

Base bed of band-passed noise (the static). Drag velocity opens the filter + adds crackle. Each
tile's "carrier tone" = soft detuned sine pair, pitch by index. Tuning crossfades static↔carrier
with a small theremin glide. Launch = rising sweep + power-off thump. Total silence until first
user gesture; toggle always visible.

## Mobile strategy

Same canvas and shaders. Touch-drag with momentum; center-tune instead of cursor-tune (works
beautifully: flick, and whatever stops in the middle comes alive). Tap tuned tile = launch; tap
untuned tile = glide it to center and tune. DPR capped at 1.5; persistence pass dropped on weak
GPUs (FPS-sampled over first 100 frames); grain via cheap noise not extra pass.
Fallback chain: weak GPU → no persistence/aberration; no WebGL or `prefers-reduced-motion` →
the INDEX overlay rendered as a static, still-handsome dithered-look CSS grid (use pre-dithered
look via CSS filter approximations; functionality first).

## Phase 2 (note, not in scope for prototype): live presence

Research's 2026 differentiator is shared presence (Bruno Simon's "Whispers", Messenger). The wall
is ready for it: other visitors' cursors as faint phosphor blips drifting on the wall +
"N operators listening" in the HUD, via PartyKit/Supabase Realtime. Requires a backend, so it's
explicitly out of the static-host prototype — but design the HUD with an empty slot for it.

## File structure

```
v2d/
  index.html   (canvas, HUD DOM, INDEX overlay/fallback, importmap)
  wall.js      (virtualized infinite tile wall, drag/inertia, layout)
  post.js      (dither + persistence + CRT post pipeline, signal map)
  tune.js      (signal field, captions, launch sequence, intro)
  audio.js     (static bed, carriers, sweeps)
```

## Acceptance criteria

Everything in 00-overview "definition of done", plus:
- The tune-in moment is the hero: dither→color transition reads clearly within 300ms of approach
  and is smooth at 60fps even while dragging.
- Phosphor smear is visible on fast drags and fully settles within ~0.8s of stopping (no permanent ghosting).
- Wall drags infinitely in all directions with no visible seams or texture pops.
- Total transfer < 6MB; first interactive < 1.5s broadband (tiles may tune in from black as textures arrive).
- Mobile center-tune flick feels like a slot machine — inertial, satisfying, auto-tuning.
- INDEX overlay reachable in one tap/click at all times.
