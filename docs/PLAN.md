# Project plan

Working title: **Ascension**. A browser city and nation builder with real-time war, from
the Modern age to the Space age, in the spirit of Pharaoh, Caesar III, Anno and SimCity.
Economics is the core: production chains, infrastructure, trade, population. You grow
through settling, trade, diplomacy or war. Single player against AI nations (Easy /
Normal / Hard) and neutral city-states. Mobile friendly, works offline.

All names, units and designs are original.

- [DESIGN.md](DESIGN.md): the game design (economy, infrastructure, trade, regions,
  diplomacy, war, ages, victory).
- [TECH_TREE.md](TECH_TREE.md): the catalog of what is in the game today, generated
  from `src/data/`. It grows as each part of the design is built.

### History

Milestones M0–M3 built an Empire Earth style RTS: engine, Twin Shores map, base
building, and the full Modern-age combat and defense layer. In October 2026 the design
moved to economy first. Everything built so far is kept: the engine, the deterministic
sim, the command system, rendering, fog, transports and combat. The Twin Shores skirmish
stays playable as a mode while the new game grows.

---

## 1. Technical approach

### Stack (unchanged)

- **TypeScript (strict)**, **Vite**, **three.js** (pinned). `npm run dev`, `npm run
  typecheck`, `npm test` (Node's test runner), `npm run build`, `npm run build:single`.
- **Offline:** PWA with every asset precached; no runtime fetches (all models, textures
  and sounds are generated in code). Also a single self-contained HTML file.
- **CI:** typecheck, tests, both builds, deploy to GitHub Pages on every push to `main`.

### Architecture

```
src/data/       single source of truth: goods, buildings, chains, tiers, networks, units, techs
src/sim/        deterministic simulation, no DOM, no three.js, runs in Node
  world.ts        entities, fixed tick
  mapgen/         seeded generator: heightmap, rivers, biomes, resources, regions
  network/        road/rail/pipeline/power graphs, routing, capacity, condition
  logistics.ts    supply/demand matching, warehouses, freight vehicles on the networks
  economy/        production, households and tiers, services, budget, happiness
  trade.ts        markets, prices, routes, overseas market
  regions.ts      ownership, claiming, annexation, unrest
  diplomacy.ts    relations, treaties, war state
  combat.ts …     (M3: weapons, garrisons, projectiles, victory) + supply and attrition
  save.ts         serialize / load the whole world
src/ai/         city-state AI, nation AI (economy, expansion, diplomacy, military), difficulty
src/render/     chunked terrain with LOD, rivers, networks, buildings, traffic, overlays
src/ui/         build palette, overlays, info sheets, economy / trade / diplomacy screens
tools/          headless.ts (AI-vs-AI runs, stats as JSON), gen-docs.ts (catalog tables)
tests/          determinism, map generation, networks, logistics, economy balance, combat
```

Key rules (unchanged, more important now):
1. **The sim never imports three.js or touches the DOM.** It runs headless at high speed.
2. **Everything is a command.** Player, AI and future network play all go through
   `commands.ts`. Replays, AI-vs-AI and save files come from this.
3. **Determinism:** seeded RNG, fixed tick, custom trig. Seed + commands reproduce a game.
4. **Data-driven:** goods, chains and buildings are plain data. Game, AI, UI and docs read them.

### Two clocks

- **Movement and combat:** 15 Hz, as now.
- **Economy:** production, logistics matching, households, prices run at 1 Hz in staggered
  slices (one fifteenth of the cities' blocks each tick), so a large map stays cheap.

### Scale

- Maps up to 768² tiles: terrain in 64² chunks with distance LOD; instanced buildings and
  vehicles; fog stored per tile but drawn per chunk.
- Freight moves along network edges (position = edge + distance), which is cheap even for
  thousands of vehicles. Off-road military movement uses hierarchical pathfinding over
  the tile grid (clusters + A*), replacing plain A* for long trips.
- Saves: the world serialized to IndexedDB, autosave every few game years, export a save
  to a file.

---

## 2. Game rules

See [DESIGN.md](DESIGN.md). In short: credits, materials and labour; four citizen tiers;
production chains per age; networks with capacity and wear; physical trade routes;
regions gained by settling, economic union, treaty, conquest or secession; war paid for by
the economy with supply lines; ages reached by milestones; economic, federation, space or
conquest victory, or endless sandbox.

---

## 3. Understanding the state of the game (UI)

| Element | What it shows |
|---|---|
| **Top bar** | Credits (with net per year), population by tier, happiness, date and speed, current age and milestone progress, alerts |
| **Overlays** (one button) | Traffic, network condition, power, water, coverage per service, happiness, pollution, land value, regions and opinion, supply lines |
| **Info sheet** | Inputs, outputs, stock, workers filled, upkeep, and one line saying why it isn't working |
| **Economy panel** | Budget by category, taxes, a goods table: production vs consumption with trend arrows |
| **Trade / Diplomacy / Regions** | Routes and prices; relations and treaties; region owner, resources, unrest, dependence |
| **Tech tree, codex** | Generated from `src/data`, as planned before |
| **Graphs, post-game report** | Population, GDP, trade, army value, compared with rivals you know about |

Mobile: build palette at the bottom, drag to draw roads/rail/walls (the M3 wall tool),
bottom sheets for info, pause in one tap. Desktop gets hotkeys on top.

---

## 4. AI

Same commands as the player, own fog of war, no cheating at any level.

- **City-state AI:** grows its city, produces what its regions allow, prices its market,
  forms opinions, defends itself. No expansion. Simple and predictable on purpose.
- **Nation AI**, three layers:
  1. **Strategy** (every few game months): economic goals, which regions to claim, which
     partners to court, when to go to war, when to make peace.
  2. **City manager:** zoning, chains, networks, services, budget.
  3. **Military:** defense, supply lines, campaigns, convoy escorts (the M3 combat layer).

| | Easy | Normal | Hard |
|---|---|---|---|
| City management | slow, leaves shortages | balanced | efficient chains, good networks |
| Expansion | few regions | steady | contests key regions early |
| Trade and diplomacy | passive | uses treaties | courts city-states, uses embargoes |
| War | rarely, defends | when it has a reason | raids convoys, cuts supply, picks targets |

**Harness:** `tools/headless.ts` runs AI-only games in Node and reports GDP curves, game
length, how regions changed hands (peaceful vs war), and which goods are always short.
That is how the economy gets balanced.

---

## 5. Milestones

Each milestone ends with a playable build on GitHub Pages.

| # | Milestone | Done when |
|---|---|---|
| **M0** ✅ | Repo, plan | Plan and catalog committed |
| **M1** ✅ | Engine skeleton | Vite + TS, CI, Pages, PWA, single file; terrain, water, bridges, camera, selection, pathfinding |
| **M2** ✅ | RTS economy | Data catalog + generated docs, gathering, building, production, fog |
| **M3** ✅ | Combat and defense | Weapons and counters, transports, walls, gates, garrisons, turrets, victory |
| **E1** ✅ | Big world | Seeded map generator (rivers, biomes, resources, regions), 512² map with chunked terrain and LOD, pause and game speeds, save/load, Twin Shores kept as a skirmish mode |
| **E2** ✅ | Roads and building | Drag roads (tiers), road graph and routing, construction with credits + materials delivered by trucks, Construction Office, budget and upkeep |
| **E3** ✅ | A living city | Housing, Workers and Technicians, jobs and labour, Modern chains (food, lumber, concrete, steel, fuel, goods), warehouses and logistics, power grid, water, services coverage, happiness, overlays and info sheets. **Checkpoint: is the solo city fun?** |
| **E4** ✅ | Networks and trade | ✅ overseas market, trade ports and ships, network condition and maintenance, hydro power, railways with stations and trains. pirates raiding cargo ships, coast guard, oil pipelines, river docks and barges |
| **E5** ✅ | Neighbours | City-states with their own economies (AI on the same rules), local prices, trade deals by road, opinion and dependence, regional offices, economic union, purchase; treaties with nations (non-aggression, research pacts, trade agreements) and negotiated peace |
| **E6** ◐ | Rivals and war | ✅ nation AI (Easy / Normal / Hard) that builds, trades, expands and makes war; units paid in credits and goods with upkeep; army limit by population; war and peace; capturing seats and their regions; garrisons; defeat. war weariness; peace offers; supply depots, attrition and mending; shipyards, airfields and blockades of trade ports. balance harness (`tools/headless.ts`). Still to do: embargoes |
| **E7** ◐ | Digital age | ✅ ages reached by research, people, GDP and a price; Engineers tier and towers, rare earths and uranium, electronics, pharmaceuticals and hospitals, nuclear power, data network, exo-troopers, rocket artillery, the Warden mech; AI nations advance too. cargo airports. Still to do: Digital navy and air force in the economy game |
| **E8** ✅ | Nano age | ✅ Scientists tier and spires, universities, nanomaterials, robotics and automation, fusion, Disruptor (EMP stuns vehicles and mechs), Juggernaut, Arclight. shield generators, maglev |
| **E9** ✅ | Space age | Launch sites and orbital alloys, orbital solar relays, the Space Elevator; economic, federation, space and conquest victories (or sandbox) |
| **E10** ◐ | Polish and content | ✅ sound effects and generative music (WebAudio, no files), history graphs, post-game report, AI personalities, AI-vs-AI spectator, house colour variety. Still to do: more graphics, more biomes, scenarios, replays |
| Later | Multiplayer | Lockstep over a relay or WebRTC, on the command system |

Graphics improve alongside each milestone (buildings and tier upgrades are the first
visual priority, since a city builder is looked at a lot).

---

## 6. Risks and how we handle them

- **Scope.** This is a much bigger game. E3 is a checkpoint: if the solo city isn't fun,
  we fix that before adding trade, neighbours or war.
- **Economy balance.** Chains can deadlock or snowball. The harness and per-good
  production vs consumption stats make this measurable; data tables keep tuning cheap.
- **Phone performance on big maps.** Chunked terrain, LOD, instancing, staggered economy
  ticks, aggregate citizens. Test on a mid-range Android from E1.
- **UI density on mobile.** Overlays and bottom sheets instead of many floating windows;
  every screen designed for a phone first.
- **AI difficulty.** City-states first (simple), nations last, built on the harness.
- **Long games.** Save/load and autosave arrive in E1, before anything else needs them.
