# Design Research Report (2025–2026) — input for v2d

> Produced by a research sweep of Awwwards annual winners, Codrops case studies, WebGPU showcase,
> and named site case studies. This is reference material; the actionable build prompt distilled
> from it is `v2d-signal-degrades.md`.

## A) Named reference sites

1. **Messenger** (messenger.abeto.co) — Awwwards **Developer Site of the Year 2025**. A multiplayer WebGL delivery game on a tiny cel-shaded planet; even UI and text glyphs render in WebGL/WASM. The current peak of "the site IS the game."
2. **Lando Norris** (landonorris.com, by OFF+BRAND) — **Site of the Year 2025** + Users' Choice. WebGL 3D + **Rive** motion + scroll-driven cinematics, aggressively lazy-loaded.
3. **Bruno Simon 2025** (bruno-simon.com) — SOTM Jan 2026. The drive-a-car portfolio rebuilt with WebGL **and WebGPU**, plus persistent multiplayer "Whispers" (visitor-left flames with messages). The 2026 answer to "what came after the car": *shared presence*.
4. **Gen-02 by Samsy** — SOTD + Developer Award Oct 2025. Explorable 3D world portfolio, Vue + GSAP + custom WebGPU.
5. **Stas Bondar '25** (stabondar.com) — GSAP Site of the Month; Codrops case study. GSAP + Three.js + **Matter.js**: typography that breaks apart and tumbles under physics on scroll.
6. **Ponpon Mania** (ponpon-mania.com) — SOTM Oct 2025. Interactive WebGL comic; flat illustration staged in 3D, every panel reacts to the mouse. Charm over photorealism.
7. **The Renaissance Edition** (Shopify) — SOTM Feb 2026. 150+ boring product updates presented as a generative Renaissance gallery. Lesson: any *list* becomes an exhibition with one strong conceit.
8. **MindMarket** (mindmarket.com) — SOTM Dec 2025. Zero stock/AI imagery; hand-drawn characters, a "thread" motif. Wins on human craft, not shader firepower.
9. **Terminal Industries** (terminal-industries.com, by Propagande) — SOTD. The "technical mono / console aesthetic" done as premium design rather than retro kitsch — the upscale evolution of a Matrix theme.
10. **MADCLEM Portfolio** — Honorable Mention. The portfolio is just an **infinite draggable grid with fabric-like bouncy physics** — the grid itself is the experience.
11. **Henry Heffernan** (henryheffernan.com) — the benchmark "playable CRT computer" (3D 90s PC running a real OS via iframes). The OS-desktop genre it spawned is now saturated.
12. **fly.pieter.com** — Pieter Levels' vibe-coded flight sim ($1M ARR in 17 days, Feb 2026). Culturally defining for the "vibe-coded games" niche — leaning into that identity is itself a concept.

Also notable: Anime.js v4 docs site (SOTM May 2025), Immersive Garden (Agency of the Year 2025), Louis Paquet (Independent of the Year 2025), Scout Motors (E-commerce of the Year), **Efecto** (real-time ASCII/dither/CRT shader playground, Codrops Jan 2026).

## B) Top 5 interaction/visual trends right now

1. **ASCII / dithering / CRT shaders as post-processing — the "Technical Mono" wave.** Bayer-matrix ordered dithering + pixelation as composable passes (Niccolò Fanton's open-source `dithering-shader`; Efecto's in-shader ASCII: 5×7 glyph grid, luminance→character-density). Key 2026 nuance: applied to *live content*, not static images. Canonical write-up: Maxime Heckel, "The Art of Dithering and Retro Shading."
2. **The grid IS the experience.** Infinite/draggable/physics project grids: virtualized tiles with modulo wrapping, drag inertia (GSAP Draggable/InertiaPlugin — GSAP is now fully free incl. SplitText), per-tile parallax from velocity, WebGL hover distortion. Codrops has step-by-step tutorials (Infinite Parallax Grid, June 2025; seamless infinite scroll with GSAP+Lenis, May 2026).
3. **Multiplayer presence as the new wow.** Bruno's Whispers, Messenger's shared planet. Cheap now: WebSocket/PartyKit/Supabase Realtime broadcasting cursors/markers. Even "12 people are in the arcade right now" is memorable.
4. **Scroll as cinematography.** The default award stack: **Lenis** + **GSAP ScrollTrigger** (+ optional Three.js driven by scroll). View Transitions API graduating to production for page-to-page morphs.
5. **WebGPU + "honest tech" aesthetics, with a perf reality-check.** Winners brag about being < 6MB and lazy-loaded; judges punish 2MB hero scenes. Brutalism/bento persist; pure OS-desktop clones considered saturated.

## C) Synthesized original concepts (the 3 candidates)

1. **"THE SIGNAL DEGRADES" — live phosphor wall** *(chosen for v2d — see `v2d-signal-degrades.md`)*: the portal is one giant CRT phosphor surface; 14 screenshots live as dither-quantized "transmissions" on an infinite draggable wall; cursor proximity "tunes in" a tile from green dither to full color; fast drags smear with phosphor persistence.
2. **"INSERT COIN ARCADE" — attract-mode cabinets + live visitor ghosts**: top-down arcade hall, cabinets wake on approach, other visitors as sprite ghosts via realtime presence. *(Overlaps v2a; the presence layer is noted as a v2a/v2d phase-2 differentiator.)*
3. **"PATCH NOTES FROM THE VOID" — brutalist terminal zine with physics**: monospace release-log of the games written like a human (`v0.7.3 — PUG FIESTA 3D — shipped in one evening, 0 regrets`), Matter.js letter physics, image trails, seamless infinite loop scroll, command palette. *(Backup direction if v2d should be non-WebGL — fastest to build, easiest to keep at 100 Lighthouse.)*

## Key sources

[Awwwards Annual winners](https://www.awwwards.com/annual-awards/winners) · [Messenger SOTD](https://www.awwwards.com/sites/messenger) · [Lando Norris case study](https://www.itsoffbrand.com/our-work/lando-norris) · [Bruno's Portfolio SOTD](https://www.awwwards.com/sites/brunos-portfolio) · [Codrops 2025 Year in Review](https://tympanus.net/codrops/2025/12/29/2025-a-very-special-year-in-review/) · [Stas Bondar '25 case study](https://tympanus.net/codrops/2025/03/25/stas-bondar-25-the-code-techniques-behind-a-next-level-portfolio/) · [Efecto ASCII/dither shaders](https://tympanus.net/codrops/2026/01/04/efecto-building-real-time-ascii-and-dithering-effects-with-webgl-shaders/) · [Real-Time Dithering Shader](https://tympanus.net/codrops/2025/06/04/building-a-real-time-dithering-shader/) · [Maxime Heckel — Art of Dithering](https://blog.maximeheckel.com/posts/the-art-of-dithering-and-retro-shading-web/) · [Infinite Parallax Grid](https://tympanus.net/codrops/2025/06/11/building-an-infinite-parallax-grid-with-gsap-and-seamless-tiling/) · [Seamless Infinite Scroll](https://tympanus.net/codrops/2026/05/28/the-never-ending-story-building-a-seamless-infinite-scroll-experience-with-gsap-lenis/) · [Terminal Industries](https://www.awwwards.com/sites/terminal-industries) · [MADCLEM](https://www.awwwards.com/sites/madclem-portfolio) · [Lenis](https://www.lenis.dev/)
