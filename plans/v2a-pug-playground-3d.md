# v2a — PUG PLAYGROUND 3D

> Build prompt — self-contained. Read `plans/00-overview.md` first for shared requirements
> (game data, paths, tech constraints, definition of done). Output goes to `/v2a/index.html`.

## Pitch

The landing page IS a tiny game. You are a low-poly pug in a neon arcade park at night.
Each of the 14 games is a glowing arcade cabinet whose screen plays that game's screenshot.
You run/drift around, collect bones, bark at things, and walk up to a cabinet to launch the game.
This is the bruno-simon.com pattern ("portfolio you drive through") but with original character
and on-brand humor — the pug already stars in two of the games (Pug Fiesta / Pug Fiesta 3D).

The feeling: Saturday-night county fair built inside TRON. Warm neon against deep blue night,
springy cartoon physics, constant small rewards.

## Tech stack

- **Three.js** (latest, via CDN importmap) — renderer, scene, post-processing.
- **No physics engine.** Custom character controller: velocity + friction on a flat ground plane,
  circle-vs-circle collision against cabinet footprints (14 static circles). Keeps it light and tunable.
- **GSAP** (CDN) for UI/DOM tweens (HUD, intro, launch overlay) — not for the game loop.
- **Web Audio** procedural sounds (footsteps tick, bark, coin chime, cabinet hum swell).
- Post: `UnrealBloomPass` at modest strength; auto-disable on weak GPUs (see Performance).

## Scene & art direction

All geometry is procedural primitives (boxes, cylinders, spheres, capsules) — no model files,
no textures except the 14 screenshot PNGs. Cartoon-flat materials (`MeshToonMaterial` or
`MeshStandardMaterial` with flat colors), strong emissive accents for everything neon.

- **Ground**: large dark plane (deep navy `#0a0e1f`) with a custom grid shader — subtle glowing
  grid lines that brighten in a radius around the pug (uniform = pug position). A few colored
  point lights scattered for pools of neon light.
- **Sky**: black-to-navy gradient + ~400 star points + a big low-poly moon. Slow-drifting fog
  (`scene.fog`) for depth.
- **Arcade cabinets** (x14): classic cabinet silhouette built from 3-4 boxes (body, marquee, control
  deck). Screen = plane textured with that game's screenshot, `emissiveMap` so it glows in the dark.
  Marquee = small canvas-generated texture with the game name in pixel font + tag color. Each cabinet
  gets a hue from its tag (ARCADE=orange, PUZZLE=violet, TOOL=cyan, ACTION=red, SHOOTER=yellow,
  PVP=magenta, CLICKER=green, RNG=pink, RACE=blue). Subtle idle bob/hum on the screen brightness.
- **Layout**: cabinets arranged as a midway — two gentle arcs forming a boulevard, pug spawns at the
  entrance under a neon archway sign "JOJKOS GAMES" (built from glowing tube geometry or canvas
  texture on a plane). Spacing ≥ 8 units so each cabinet reads individually.
- **Props for life** (cheap, procedural): floating balloons on strings, a few trees made of cones,
  popcorn-cart, spotlight cones of volumetric-ish transparent geometry, fireflies (drifting points).
- **The pug**: built from primitives — fat capsule body, round head, squashed muzzle, fold ears
  (flattened spheres), curled tail (torus segment), 4 stubby legs. Cream body + dark mask face.
  Procedural animation: legs swing sin-phase with speed, body bounce, ear flop on jump landing,
  tail wag always (faster when near a cabinet). Squash & stretch on jump/land. This must be CUTE —
  spend effort on proportions (big head ~60% of body size, tiny legs).

## Controls & movement

- **Desktop**: WASD/arrows to move (camera-relative), Space = jump, B = bark, Shift = sprint
  (with drift: when turning hard at sprint, the pug slides slightly and kicks up particle puffs).
- **Mobile**: custom virtual joystick (left thumb zone, appears where the thumb lands), tap right
  side = jump, double-tap = bark. Buttons big, semi-transparent.
- **Camera**: third-person spring-arm — follows position with critically-damped smoothing, slight
  look-ahead in movement direction, gentle FOV widening at sprint (62 → 70). Camera never goes
  below ground; collision-free since the park is open.
- Movement tuning targets: snappy (reach max speed in ~0.2s), max speed ~9 u/s sprint, jump feels
  floaty-cartoony (low gravity ~ -18, jump vel ~7).

## Game-launch interaction (the core loop)

1. Proximity: when pug is within ~4 units of a cabinet, that cabinet becomes "hot": screen brightens,
   marquee pulses, a floating prompt appears above it (`E` / "WALK CLOSER" on mobile → "TAP TO PLAY"),
   and the HUD shows the game title + tag.
2. Confirm: press E / Enter (desktop) or tap the prompt (mobile) — or simply keep walking into the
   cabinet for 0.5s (forgiving for casual visitors).
3. Launch sequence (~1.2s, skippable by repeat press): pug jumps INTO the cabinet screen — camera
   dollies fast toward the screen, screen-space CRT flash, white-noise burst, then `location.href`.
   Pure GSAP + camera tween; cheap but cinematic.
4. There must ALSO be a zero-effort path: a small "MENU" button in the HUD opens a styled overlay
   list of all 14 games as plain links (this doubles as the reduced-motion/a11y/SEO path).

## Juice & secondary mechanics (the award-winning layer)

- **Bones** (~25 scattered): golden glowing bone pickups, sparkle burst + chime + counter tick on
  collect. Collecting all 25 triggers a small fireworks show over the park + "GOOD DOG" banner.
  Persist count in `localStorage`.
- **Bark** (B): expanding ring shockwave from the pug; nearby balloons wobble, fireflies scatter,
  nearby cabinet screens flicker. Pure delight, no mechanics.
- **Footstep dust**: tiny particle puffs while running; bigger puff + screen-shake (2px, 80ms) on landing.
- **Intro choreography** (first 3s): camera starts high over the park, sweeps down behind the pug
  while the neon archway letters flicker on one by one (sound: buzz-clink), HUD fades in, control
  hints float above pug for 5s. Skippable with any input.
- **Idle behavior**: if no input for 8s the pug sits, then lies down and sleeps (Z particles).
  Any input → spring up instantly.

## HUD (DOM, not canvas)

Minimal, rounded, slightly translucent panels matching the neon palette:
top-left: bone counter (icon + n/25). Top-right: MENU button + sound toggle.
Bottom-center (desktop only, fades after first move): key hints. Coffee link: bottom-right,
restyled as a small neon sign that fits the park aesthetic, still clearly "Buy me a coffee" yellow.

## Performance & fallbacks

- Cap pixel ratio at 1.5; everything in one scene, no shadows (fake blob shadows: dark transparent
  circles under pug/cabinets). Target < 100 draw calls (merge static props with
  `BufferGeometryUtils.mergeGeometries` where easy).
- Lazy-load screenshot textures after first render (start with dark screens that "boot up" as
  textures arrive — turn the constraint into charm).
- Detect weak GPU (mobile UA or `WEBGL_debug_renderer_info` heuristic or first-100-frames FPS
  sampling): disable bloom, halve particle counts, cap DPR at 1.
- WebGL unavailable or `prefers-reduced-motion` → swap to the styled static grid (same DOM as the
  MENU overlay, shown full-page).

## File structure

```
v2a/
  index.html      (markup + CSS + bootstrap, importmap)
  main.js         (scene setup, loop)
  pug.js          (pug builder + controller + animations)
  park.js         (ground, cabinets, props, lights)
  fx.js           (particles, audio, launch sequence)
```
Keep each file < ~500 lines; plain ES modules, no bundler.

## Acceptance criteria

Everything in 00-overview "definition of done", plus:
- Pug controllable within 3s of load on broadband; movement feels good (snappy accel, no slide-on-ice).
- All 14 cabinets show correct screenshot + name; walking into any of them launches the right URL.
- Mobile: joystick works one-handed in portrait; cabinets reachable; tap-to-play works.
- The pug is genuinely cute (subjective gate: if it looks like a generic dog, iterate on proportions).
- Bones, bark, intro sweep, sleep idle all present.
