# Ascension (working title)

A browser real-time strategy game inspired by the late ages of Empire Earth: modern
armies, nuclear submarines and aircraft carriers, giant mechs, then orbital warfare.
Single player against an AI (Easy / Normal / Hard). Desktop and mobile.

**Play:** https://mattb1989.github.io/ascension-rts/ (installable, works offline after the first visit)
**Single-file version:** https://mattb1989.github.io/ascension-rts/ascension-single.html (save it, open from disk)

TypeScript + three.js + Vite. Static site, no server. Every model, texture and sound is generated in code.

## Status: M2, economy and base building

- **Economy:** Engineers mine **◆ Ore** and carry it to the Command Center or an Ore Refinery.
  Oil Derricks (on land oil) and Offshore Rigs (built by a Sea Engineer on sea oil) produce
  **⚡ Energy**. Habitat Blocks raise the population cap.
- **Base building:** all 11 Modern-age economy and production buildings with procedural 3D
  models, construction scaffolding, placement preview and real placement rules (open ground,
  coast for shipyards, oil spots for derricks and rigs, explored ground only).
- **Production:** unit queues with housing limits, rally points (engineers rallied onto ore start
  mining), cancel with refunds, economic research (Deep Drilling, Efficient Logistics).
- **Fog of war:** unexplored ground is black, explored-but-unseen ground is dimmed; enemy units
  only show where you can see.
- **Game-state UI:** resource bar with income per minute, population, age, idle engineers,
  a command card for whatever is selected, toasts.
- The full catalog of ages, buildings, units and research lives in `src/data/`, and
  [docs/TECH_TREE.md](docs/TECH_TREE.md) is generated from it.

URL options: `?mode=sandbox` starts with a mixed army, navy and air force (the M1 test bed);
`?fog=0` turns the fog of war off; `?seed=42` picks another map seed.

Next: M3, combat, walls and towers. See [docs/PLAN.md](docs/PLAN.md).

## Controls

| | Mouse & keyboard | Touch |
|---|---|---|
| Select | Left click, drag a box, Shift to add, double-click for all of a type | Tap, double-tap for all of a type, **Select** mode for box |
| Move / work | Right click: ground = move, ore = mine, foundation = help build; with a building selected = rally point | Tap: same rules |
| Build | Select engineers, pick a building in the command card, click to place (Shift for several) | Pick a building, tap to position, then ✓ |
| Camera | WASD/arrows/screen edge, right drag, wheel zoom, Q/E or middle drag rotate | One finger pans, two fingers pan/pinch/twist |
| Other | `.` next idle engineer, Ctrl+1..9 / 1..9 groups, Ctrl+A army, X stop, Space centre, H home | Idle button in the top bar, buttons at the bottom right |

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
src/data/     ages, buildings, units, research: the single source of truth for stats
src/sim/      deterministic simulation: map, nav, A*, movement, placement, economy, fog. No DOM, no three.js.
src/render/   three.js: terrain, water, bridges, unit and building models, fog-of-war shader, camera
src/ui/       input (mouse/keyboard/touch), selection, command card, minimap, HUD
tools/        gen-docs.ts: regenerates the tech-tree tables (npm run docs)
tests/        sim and map tests
```

CI (`.github/workflows/ci.yml`) typechecks, tests, builds both versions and deploys to GitHub Pages on every push to `main`.
