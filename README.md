# Ascension (working title)

A browser city and nation builder with real-time war, from the Modern age to the Space
age, in the spirit of Pharaoh, Anno and SimCity. Economics comes first (production chains,
infrastructure, trade, population), and you grow by settling, trade, diplomacy or war.
Single player against AI nations (Easy / Normal / Hard) and city-states. Desktop and mobile.

Design: [docs/DESIGN.md](docs/DESIGN.md). Milestones: [docs/PLAN.md](docs/PLAN.md). Catalog
(generated from the game data): [docs/TECH_TREE.md](docs/TECH_TREE.md).

## Playable today

The start screen offers a **new nation** (map size, landscape, seed), **continue** a save, or the
original **Twin Shores** skirmish.

**Economy game (E1–E3):**
- **Generated worlds**: four landscapes (temperate, great river desert, alpine, archipelago),
  256² or 512² tiles, rivers that drain to the sea, lakes, floodplains, forests, mountains, ore,
  stone and oil deposits, and 10–50 named regions. Terrain is drawn in chunks with levels of
  detail so big maps stay smooth.
- **Roads** (drag to draw; bridges over shallow water), and a **construction** chain: you pay
  credits, trucks deliver lumber, concrete and steel to the site, a crew builds it.
- **People**: houses fill with settlers while there is work, and grow from cottage to house,
  terrace and apartment as their needs are met (food, water, power, police, goods, health,
  school). Cottages and houses supply workers, terraces and apartments technicians.
- **Production chains**: farms and fishing, food plants, logging and sawmills, quarries and
  cement, iron and steel, oil wells, refinery, goods factory; warehouses; oil power plants;
  pumping stations and water towers; markets, police, clinics, schools. Power and water reach
  buildings along the roads. Pollution, happiness, taxes and upkeep.
- **Regions**: a Regional Office claims a neighbouring region.
- **Overseas trade (E4)**: a Trade Port on a coast that reaches the open sea; per good, import up
  to an amount and export everything above another; cargo ships sail in from the map edge; world
  prices drift. A Hydro Plant gives power on rivers without oil. Roads wear with traffic;
  Maintenance Depots repair them.
- **City-states (E5)**: 3–5 neighbours run by the same rules as you (an AI plays them with the
  same commands): they build their own towns in their region. Connect a road to one and set deals
  per good: your trucks sell to them and buy from them at their local prices. Trade raises their
  opinion and their dependence on you; a friendly, dependent city-state asks to join your nation,
  and friends can be bought outright. 🤝 Diplomacy shows it all.
- **Information**: click anything to see what it needs and why it isn't working; 📦 goods made
  and used, ₡ budget and tax rate; pause and 1× / 2× / 4× / 8× speed; saves (and an autosave
  every game year) stay in the browser.

**Skirmish (M1–M3):** the RTS groundwork: Twin Shores, engineers and ore, the full Modern
army on land, sea and air, transports, walls, gates, garrisoned towers, victory.

URL options: `?mode=city&size=512&biome=temperate&seed=7` starts a nation directly;
`?mode=skirmish` or `?mode=sandbox` (two armies) the RTS; `?load=auto` continues; `?fog=0`
turns the fog of war off.

Next: rival nations and war (**E6**), then rail. See [docs/PLAN.md](docs/PLAN.md). See [docs/PLAN.md](docs/PLAN.md).

## Controls

| | Mouse & keyboard | Touch |
|---|---|---|
| Select | Left click, drag a box, Shift to add, double-click for all of a type | Tap, double-tap for all of a type, **Select** mode for box |
| Move / work | Right click: ground = move, enemy = attack, ore = mine, foundation or damaged building = build/repair, tower = garrison; with a building selected = rally point | Tap: same rules |
| Build | Select engineers, pick a building in the command card, click to place (Shift for several) | Pick a building, tap to position, then ✓ |
| Camera | WASD/arrows/screen edge, right drag, wheel zoom, Q/E or middle drag rotate | One finger pans, two fingers pan/pinch/twist |
| Combat | F attack-move, G eject garrison | ➤ Attack button, then tap |
| Economy game | R road, B bulldozer, drag to draw; click a building in the palette then the map (Shift: keep placing); Space pause, 1–4 speed | Pick a tool, tap start and end (or the spot), then ✓ |
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
src/data/     ages, buildings, units, research, goods, city buildings: the single source of truth
src/sim/      deterministic simulation: map, map generator, nav, A*, movement, combat, fog, saves. No DOM, no three.js.
src/sim/city/ economy game: roads, placement, logistics (trucks, crews), labour, power, water, services, households, budget
src/ai/       scripted city builder (balance tests now, AI nations later)
src/render/   three.js: chunked terrain, water, roads, trucks, unit and building models, fog of war, camera
src/ui/       start menu, input (mouse/keyboard/touch), city tools and HUD, skirmish command card, minimap, saves
tools/        gen-docs.ts: regenerates the tech-tree tables (npm run docs)
tests/        sim and map tests
```

CI (`.github/workflows/ci.yml`) typechecks, tests, builds both versions and deploys to GitHub Pages on every push to `main`.
