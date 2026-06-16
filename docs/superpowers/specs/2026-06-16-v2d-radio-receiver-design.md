# v2d — "THE SIGNAL DEGRADES": radio receiver redesign

**Date:** 2026-06-16
**Status:** approved, implementing
**Scope:** Replace v2d's infinite 2D glyph wall with a single 1D radio receiver. One spec, one implementation pass.

## Concept

The whole page is one radio receiver. The 14 games are stations on an 88.1–105.0 FM band.
You hunt across mostly-static air by dragging the dial; stations resolve from green glyphs into
the real screenshot as you tune in. Manual ("assisted analog") tuning **or** auto-seek, like a
digital car radio. Tune in, then click to play.

This fixes the core flaw of the old wall: everything was visible at once, so it was browsing,
not tuning. Now there is scarcity (static between stations), skill+ease (assisted analog + seek),
a payoff (the lock/snap), and focus (one station centered at a time).

## Interaction model

### The band (1D)
- Stations sit on a horizontal frequency strip; `freq(i) = 88.1 + i * 1.3` (→ 88.1 … 105.0).
- A **fixed center needle ▼**; the band scrolls *under* it as you tune (classic analog).
- `currentFreq` is the single source of truth. Clamp to the band ends with a little static margin.
- Map: `x = (freq - 88.1) * PX_PER_MHZ`, where `PX_PER_MHZ = (stageW + gap) / 1.3`.

### Signal strength
- `signal(tile) = 1 - smoothstep(0, halfChannel, |tileFreq - currentFreq|)`.
- Drives, on the centered station: static thinning, glyph→photo resolve, carrier-tone swell,
  VU climb, readout crispness, name de-scramble. Off-centre tiles stay dim glyphs; true gaps
  between stations show rolling static/void.

### Manual tuning — "assisted analog"
- Drag horizontally anywhere (GSAP Draggable + inertia) → changes `currentFreq`.
- **Magnetic detents:** within ~half a channel of a station, a spring eases `currentFreq` toward
  the exact station frequency; on release within range it settles with an eased snap + soft click.
  You can still drag through into static, but never get stuck mid-channel on release.

### Auto-seek
- `◂◂ / ▸▸` buttons and `← / →` keys animate an eased sweep (scanning hiss) to the prev/next
  station, landing perfectly locked. Effortless mode.

### Launch
- Click/tap the tuned station when signal is high → over-tune blowout + CRT power-off collapse →
  navigate (reuse existing launch sequence). Click while not locked → seek to nearest station.

## Staging — "receiver stage"
- WebGL stage: a framed CRT screen centred on the page shows the tuned content.
- Neighbour stations' glyph-ghosts are visible at the screen edges and slide as you tune (the band
  scrolling past), giving spatial continuity.
- Keep phosphor dither, persistence smear on fast sweeps, CRT finish.

## HUD (DOM, crisp type)
- Bottom dial: frequency ruler with ticks + station pips + fixed center needle.
- Frequency readout (`094.6 FM`), VU signal meter, station name (de-scrambles on lock).
- `◂◂ / ▸▸` seek buttons. Keep INDEX, SND toggle, coffee, version switcher.

## Audio (reuse engine)
- Static bed loudest between stations; per-index carrier fades up with signal; seek = pitch sweep;
  lock = soft blip; launch = sweep + power-off thump. Mute toggle persists.

## Award-detail flourish
- **Pirate station:** one hidden station tucked in a gap between two real frequencies (~100.35),
  not in the INDEX, resolves only if you manually tune into it — ASCII art / a secret message.

## Mobile / a11y / fallback
- Needle is always centre → touch is "drag to tune" with momentum, no cursor needed. Big seek
  buttons; tap tuned station to play.
- INDEX overlay + static fallback unchanged for reduced-motion / no-WebGL / SEO. Switcher stays.

## Removed (YAGNI)
Infinite 2D wall, both-axis modulo wrapping, parallax depth rows, the 2D cursor tune-field.

## Reused
Glyph render, texture atlas/loading, audio carriers, CRT/dither post, INDEX fallback, switcher,
the `cullFace: false` fix.

## File impact (filenames kept to avoid import churn)
- `wall.js` — repurposed to the 1D band/receiver: frequency→x layout, drag→freq + inertia,
  magnetic detents, seek animation, stage tile + neighbour ghosts, glyph + texture reuse.
- `tune.js` — conductor: `currentFreq` state, signal computation, lock detection, HUD (readout/
  VU/name/seek/dial), launch, intro/teach, audio hookup, pirate + konami eggs.
- `post.js` — keep dither/persistence/CRT; signal becomes per-tile (already is). Drop unused 2D field.
- `audio.js` — add seek sweep + lock blip.
- `index.html` — dial + seek + readout/VU HUD; fallback untouched.

## Deferred (not in this pass)
SCAN tour (auto-advance through all stations). Live presence (phase 2).
