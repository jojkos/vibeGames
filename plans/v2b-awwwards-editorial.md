# v2b — THE STUDIO CUT (award-style editorial / WebGL portfolio)

> Build prompt — self-contained. Read `plans/00-overview.md` first for shared requirements
> (game data, paths, tech constraints, definition of done). Output goes to `/v2b/index.html`.

## Pitch

Not a game — a piece of confident editorial design that treats 14 vibe-coded games like a fashion
house treats a collection. This is the "generally accepted award-winning" formula executed with
craft: oversized kinetic typography, buttery smooth scroll, a WebGL layer that makes images feel
liquid, choreographed page load, and one signature interaction (the hover-reveal list) polished to
perfection. Visitors should think "this person ships toys, but the storefront is a museum."

The feeling: a dark gallery at night. Quiet, premium, and then images EXPLODE with motion the
moment you touch the list.

## Art direction

- **Palette**: near-black ink `#0e0e0c`, bone white `#f4f1ea` text, one electric accent
  (acid lime `#d6ff3f` — playful enough for games, fresher than matrix green). Generous whitespace.
- **Type**: one display family at extreme sizes — variable font, e.g. "Anton"/"Archivo Black" for
  impact or a variable grotesk ("Inter" tight-tracked at 900) — game titles set at `clamp(48px, 9vw, 140px)`.
  Tiny mono ("JetBrains Mono") for meta labels (index numbers, tags, year). Title case NEVER —
  all-caps display + lowercase mono.
- **Texture**: film grain overlay (animated noise, CSS or tiny canvas), 1px hairline rules,
  big index numbers (01–14) as graphic elements.

## Structure (one long scrolled page)

1. **Preloader / load choreography** (~1.5s, real loading masked as design): counter 0→100 in huge
   type bottom-left, thin progress hairline; screenshots preload during it. Exit: counter slams to
   100, page wipes open with a vertical curtain split. (Skip instantly on repeat visits via sessionStorage.)
2. **Hero**: full viewport. "JOJKO'S GAMES" set gigantic, broken across 2 lines, each word animating
   in with a masked line-reveal (translateY + clip). Under it one mono line:
   "14 playable experiments · vibe-coded · 2024–2026". A slow marquee strip of tag words
   (ARCADE · PUZZLE · SHOOTER · …) scrolls along the bottom edge. Scroll hint: animated ↓.
3. **The List** (the centerpiece): all 14 games as full-width rows — index number, huge title, tag +
   domain in mono on the right. Interactions below.
4. **About / outro**: short statement ("built for fun, fueled by coffee"), the Buy-me-a-coffee link
   as a big lime pill button (its one moment of color), GitHub/contact if desired, and a footer
   with local time + "made with Claude" wink.

## The signature interaction — WebGL hover reveal list

This single interaction must be flawless; it's what gets sites featured.

- One full-screen WebGL canvas (Three.js or raw WebGL — **OGL** via CDN is lighter and ideal)
  sits fixed behind/above the DOM list (pointer-events: none).
- Hovering a row makes that game's screenshot appear as a floating plane that **follows the cursor
  with lag** (lerp ~0.08), tilting slightly with cursor velocity, with a **fragment-shader distortion**:
  RGB-shift + liquid bend proportional to mouse speed (classic "velocity distortion"), settling to
  crisp when still.
- Moving across rows crossfades textures with a ripple. Leaving the list eases the plane to scale 0.
- The hovered row itself: title skews/weights up (variable font axis or scaleY), index number flips,
  a hairline draws across, the other rows dim to 30%. Title also gets an infinite marquee shimmer
  while hovered.
- Click → the floating image expands to fullscreen (GSAP FLIP-feel: tween plane scale/position to
  cover viewport), a white flash beat, then navigate. This doubles as the page transition.

Mobile (no hover): rows become a vertical stack of large "cards" — screenshot visible inline with a
scroll-driven parallax inside a masked window, title overlapping the image edge. Tap = same
expand-then-navigate transition. The WebGL canvas can be skipped entirely on touch; CSS-only
parallax keeps it light.

## Scroll & motion system

- **Lenis** (CDN) for smooth scroll, synced with GSAP **ScrollTrigger**.
- Every section animates in on scroll: masked line reveals for text, hairlines drawing, numbers
  counting. Stagger 60–90ms, ease `power3.out`, durations ~0.9s — consistent system, not a demo reel.
- Subtle parallax depths: hero title moves at 0.9x, marquee at 1.1x.
- **Custom cursor**: small dot + trailing ring; over list rows it morphs into a "PLAY ●" chip.
  Native cursor on touch/reduced-motion.
- Grain + a barely-there vignette unify everything.

## Sound (optional but differentiating)

Single toggle in header. Tiny procedural UI sounds: soft tick on row hover (pitch rises with row
index — the list becomes an instrument), muffled thump on click, low room-tone amb at -30dB.

## Tech stack

- GSAP + ScrollTrigger (CDN), Lenis (CDN), OGL (CDN, ~minimal WebGL lib) — or Three.js if OGL
  fights back; the shader is a simple textured plane either way.
- No build step; one HTML + `style.css` + `app.js` + `gl.js`.
- Fonts via Google Fonts with `font-display: swap`; preload the two screenshot images "above the fold".

## Performance & fallbacks

- The WebGL layer renders ONLY while the list is in viewport and a row is hovered (rAF gated).
- `prefers-reduced-motion`: Lenis off, reveals become simple fades, WebGL off, list shows inline
  static thumbnails — still a beautiful typographic page.
- No layout shift: reserve space for everything; CLS ≈ 0. Lighthouse perf ≥ 90 mobile.

## File structure

```
v2b/
  index.html
  style.css
  app.js      (Lenis, ScrollTrigger choreography, cursor, sound)
  gl.js       (hover-reveal WebGL: plane, shader, texture mgmt)
```

## Acceptance criteria

Everything in 00-overview "definition of done", plus:
- The hover-reveal feels liquid: no texture pop-in, no stutter when sweeping across all 14 rows fast.
- Load choreography → hero reveal reads as one continuous designed moment.
- Mobile card layout is genuinely nice, not a degraded afterthought.
- Typography passes the squint test: hierarchy obvious at any scroll position.
- Click-to-launch transition lands < 1.5s from click to navigation start.
