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
- **Generated worlds**: five landscapes (temperate, great river desert, alpine, archipelago, lakeland),
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
- **Railways (E4)**: drag track like roads (it crosses roads, and water on road bridges). Rail
  Stations on a line are warehouses with a train: it carries 60 units at a time to stations
  whose surroundings need them, while trucks bring each station what the others want. In the
  Digital age, Cargo Airports do the same by air between any of your airports, and River Docks
  send barges between docks on the same river, lake or coast. Towns far from
  rivers get their water from Water Wells. Pipelines carry oil and fuel from wells and refineries
  straight to the power plants and refineries touching them, no trucks needed. From 1955 pirates raid cargo ships at ports that no
  Coast Guard station watches.
- **City-states (E5)**: 3–5 neighbours run by the same rules as you (an AI plays them with the
  same commands): they build their own towns in their region. Connect a road to one and set deals
  per good: your trucks sell to them and buy from them at their local prices. Trade raises their
  opinion and their dependence on you; a friendly, dependent city-state asks to join your nation,
  and friends can be bought outright. 🤝 Diplomacy shows it all.
- **Rival nations and war (E6)**: 1–3 AI nations (Easy never attacks, Normal goes to war when
  it is stronger, Hard early and often), each with a character (Traders, Builders,
  Expansionists, Warlords), build, trade, absorb city-states and expand with Regional Offices. The
  Military tab has barracks, vehicle factories and defences; units cost credits plus steel or
  fuel delivered to the building, and upkeep; the army limit grows with population. Declare war
  or make peace in Diplomacy. Hold an enemy town hall or regional office for 30 s with no
  defenders nearby and its region is yours; garrisoned infantry defend it. Lose every seat and
  the game is over.
- **Advisor**: a card with your top three priorities right now (power shortage, food, water,
  jobs, services, money, stalled construction, the next age, threats), each with the reason and a
  button that picks the building to place; the starter checklist comes first. ☰ turns it off.
- **Spies (🕵)**: buy a report on a rival nation (price grows with its size) to see its weak
  points and how to hit them: the plant that makes most of its power, its only steel mill or
  refinery, food or water from one or two buildings, undefended seats, its army and the
  counter. With a recent report, sabotage a building (it stops for half a year; agents are
  caught 35% of the time). A report on yourself costs half and lists what to fix.
- **Treaties (E5)**: rival nations keep an opinion of you. Propose a non-aggression pact (no
  war while it lasts), a research pact (both research 25% faster) or a trade agreement (trade
  with their town hall by truck, as with a city-state). Breaking a pact costs trust, and peace
  must be agreed: a nation talks after a long war or when it is losing, and its own offers of
  peace wait for your answer. Long wars make people weary (less happy) until peace returns.
  Troops far from your seats and Supply Depots wear down; near them they mend. Shipyards and
  Airfields build a navy and an air force; enemy warships off a trade port blockade it.
  An **embargo** stops all trade with a nation, and city-states that like you (40+) more than
  them stop trading with them too; it ends any trade agreement and is a cause for war. AI
  nations embargo whoever they fight, and Hard or Trader nations also those they loathe.
- **The Digital age (E7)**: 🔬 Ages shows what the next age needs: research from Research
  Institutes, enough technicians, a yearly GDP and a price. The Digital age brings Engineers and
  glass towers (they want electronics and the data network), rare-earth and uranium deposits,
  electronics and pharmaceutical plants, hospitals, data exchanges, nuclear power, and
  exo-troopers, rocket artillery and the Warden mech (Mech Foundry), nuclear submarines, Aegis
  cruisers and aircraft carriers (Shipyard), stealth bombers (Airfield). Rival nations research,
  advance and field gunships too.
- **The Nano age (E8)**: Scientists and spires (they want pharmaceuticals and a university),
  universities (research and higher education), nano fabs, robotics plants, fusion power, and
  the Disruptor (its EMP stuns vehicles and mechs), Juggernaut, Arclight and repair nano swarms, and shield
  generators, and maglev track for faster trains. Robots in stock halve the staff a farm, mine
  or factory needs.
- **The Space age and ways to win (E9)**: launch sites bring orbital alloys down from the
  asteroids and build orbital fighters, drop ships and one Star Lance; orbital solar relays;
  the Space Elevator. Win by the economy (half the world's GDP
  for 10 years), federation (half the regions, at least half of them joined peacefully), space
  (keep the Space Elevator running for 5 years) or conquest (every rival nation defeated).
  🔬 shows your progress. Or choose Sandbox in the menu and play forever.
- **Sound and graphs (E10)**: procedural sound effects (building, roads, battles, alerts) and
  a slow generative music pad, all made in the browser; on/off and volume in ☰. ₡ Budget shows
  population and GDP over the years against the rival nations.
- **Building models (E10)**: every economy building is modelled with a kit (src/render/kit.ts):
  bevelled blocks with lit edges, baked shading, framed windows that glow at night and a surface
  texture per part, merged into one mesh per building. `?mode=models` shows them all in a
  gallery (`&night=1`, `&only=farm,house`).
- **Textures (E10)**: procedural surface textures drawn at start-up (no image files): grass,
  rock strata on slopes, sand ripples and soil on smoothly blended ground; brick, roof tiles,
  concrete, timber, plaster, metal panels and glass curtain walls on buildings.
- **Day and night (E10)**: the light turns golden at dusk; at night windows and street lights
  glow (☰ → Graphics turns it off). Private cars fill the streets as towns grow.
- **Scenarios (E10)**: four hand-picked starts with one goal and a deadline, from the start menu:
  Boomtown (grow fast), The River Republic (bring two city-states in peacefully), Island Hopping
  (a trade economy across the water) and Cold Front (reach the Digital age between two warlike
  powers). The goal and your progress show under Next steps and in 🔬 Ages.
- **Replays (E10)**: the simulation is deterministic, so a game is its setup plus your orders.
  ☰ → 🎬 Watch the replay (or the button on the end screen) replays your game from the first
  day at any speed; the start menu keeps the last one.
- **Information**: click anything to see what it needs and why it isn't working; 📦 goods made
  and used, ₡ budget and tax rate; pause and 1× / 2× / 4× / 8× speed; saves (and an autosave
  every game year) stay in the browser.

**Skirmish (M1–M3):** the RTS groundwork: Twin Shores, engineers and ore, the full Modern
army on land, sea and air, transports, walls, gates, garrisoned towers, victory.

URL options: `?mode=city&size=512&biome=temperate&seed=7` starts a nation directly (add
`&spectate=1&fog=0` to watch AI nations play every seat, `&victory=0` for a sandbox);
`?mode=skirmish` or `?mode=sandbox` (two armies) the RTS; `?load=auto` continues; `?replay=replay` replays; `?mode=city&scenario=boomtown` starts a scenario; `?fog=0`
turns the fog of war off. `node --experimental-strip-types tools/headless.ts 7 256 temperate normal 30`
plays an AI-only game in Node and prints how every nation does (the balance harness).

Next: more polish (graphics, post-game report), barges and pipelines. See [docs/PLAN.md](docs/PLAN.md).

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
