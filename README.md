# Ascension (working title)

A browser real-time strategy game inspired by the late ages of Empire Earth: modern
armies, nuclear submarines and aircraft carriers, giant mechs, then orbital warfare.
Single player against an AI (Easy / Normal / Hard). Desktop and mobile.

**Play:** https://mattb1989.github.io/ascension-rts/ (installable, works offline after the first visit)
**Single-file version:** https://mattb1989.github.io/ascension-rts/ascension-single.html (save it, open from disk)

TypeScript + three.js + Vite. Static site, no server. Every model, texture and sound is generated in code.

## Status: M1, movement sandbox

- **Twin Shores** map (160×160): two continents, a sea channel with islands, two bridges
  (tanks drive over, ships sail under), ore fields and land/offshore oil.
- Each side has a mixed Modern-age force: tanks, buggies, flak, infantry, engineers,
  destroyers, patrol boats, jets and helicopters.
- Land units path on land, ships on water, aircraft fly anywhere. Jets circle when idle.
- Full mouse/keyboard and touch controls, diamond minimap, control groups.
- Deterministic simulation (seeded, fixed tick, custom trig): the foundation for
  replays, AI-vs-AI and multiplayer later.

Next: M2, economy and base building. See [docs/PLAN.md](docs/PLAN.md) and
[docs/TECH_TREE.md](docs/TECH_TREE.md).

## Controls

| | Mouse & keyboard | Touch |
|---|---|---|
| Select | Left click, drag a box, Shift to add, double-click for all of a type | Tap, double-tap for all of a type, **Select** mode for box |
| Move | Right click (or on the minimap) | Tap the ground |
| Camera | WASD/arrows/screen edge, right drag, wheel zoom, Q/E or middle drag rotate | One finger pans, two fingers pan/pinch/twist |
| Other | Ctrl+1..9 / 1..9 groups, Ctrl+A army, X stop, Space centre, H home | Buttons at the bottom right |

## Develop

```sh
npm install
npm run dev            # add `-- --host` to open it from your phone on the same Wi-Fi
npm run typecheck      # three configs: browser code, DOM-free sim, Node tests/tools
npm test               # Node's built-in test runner, runs the .ts files directly
npm run build          # static PWA in dist/
npm run build:single   # one self-contained HTML file in dist-single/
```

Append `?seed=42` to the URL for a different map seed.

### Layout

```
src/data/     unit definitions (single source of truth for stats)
src/sim/      deterministic simulation: map generator, nav layers, A*, movement. No DOM, no three.js.
src/render/   three.js: terrain, water shader, bridges, procedural models, camera
src/ui/       input (mouse/keyboard/touch), selection, minimap, HUD
tests/        sim and map tests
```

CI (`.github/workflows/ci.yml`) typechecks, tests, builds both versions and deploys to GitHub Pages on every push to `main`.
