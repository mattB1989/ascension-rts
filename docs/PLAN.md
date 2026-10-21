# Project plan

Working title: **Ascension** (rename freely). A browser RTS inspired by the late ages of
Empire Earth: modern armies, nuclear submarines and carriers, then giant mechs and finally
orbital warfare. Single player against an AI with three difficulty levels. Mobile friendly.

All names, units and designs are original. Nothing is copied from Empire Earth.

See [TECH_TREE.md](TECH_TREE.md) for the full catalog of ages, buildings, units, research
and counters.

---

## 1. Technical approach

### Stack

- **TypeScript (strict)** for compile-time feedback on a large codebase, **Vite** as the
  dev server and build tool, **three.js** from npm (pinned).
- **Dev:** `npm install`, `npm run dev`, open the printed URL (also on your phone over the
  LAN with `npm run dev -- --host`). Hot reload on save.
- **Checks:** `npm run typecheck` (tsc, no emit) and `npm test` (Vitest, sim unit tests).
  Both run in CI on every push.
- **Deploy:** a GitHub Actions workflow builds and publishes to **GitHub Pages** on every
  push to `main`. The output is static files only; no server.

### Hard requirements: offline, mobile, desktop

- **Offline:** the game is a **PWA**. A service worker precaches every asset, so after the
  first visit it plays with no connection, and it can be installed to the home screen.
  There are no external fetches at runtime: models, textures, sounds and music are all
  generated in code.
- **Single file too:** `npm run build:single` produces **one self-contained
  `dist-single/ascension.html`** (all JS and CSS inlined). It opens by double-click from
  disk, can be sent to someone, or published as a link.
- **Mobile and desktop:** touch and mouse/keyboard are both first-class (see §3). Every
  milestone is checked on a phone and a desktop browser before it's called done.

### Architecture

```
index.html              entry page, canvas, UI root
vite.config.ts          dev server, PWA plugin, single-file build mode
src/
  data/                 SINGLE SOURCE OF TRUTH: ages, resources, buildings, units, techs, counters
  sim/                  deterministic simulation — no three.js, no DOM, runs in Node too
    world.ts            entities, components, fixed tick (15 Hz)
    rng.ts fmath.ts     seeded RNG, deterministic math
    commands.ts         every action is a command (player, AI and future network alike)
    pathfinding.ts      grid A* + flow fields, three nav layers: land / water / air
    combat.ts economy.ts production.ts research.ts fog.ts
  ai/                   strategic planner, build orders, squad tactics, difficulty profiles
  render/               three.js: terrain, water, procedural models, effects, interpolation
  ui/                   HUD, command card, minimap, tech tree screen, codex, touch controls
  audio/                procedural SFX + adaptive music (WebAudio, no files)
tools/
  headless.ts           run AI-vs-AI matches in Node, output stats as JSON
  gen-docs.ts           regenerate TECH_TREE tables from src/data so docs never drift
tests/                  Vitest: sim determinism, pathfinding, combat math, data integrity
.github/workflows/      typecheck + tests + build + deploy to Pages
```

Key rules:
1. **The sim never imports three.js or touches the DOM.** It can run headless at 100× speed.
2. **Everything is a command.** Player clicks, AI decisions and (later) network packets all
   go through `commands.ts`. This gives us replays, AI-vs-AI, and lockstep multiplayer later.
3. **Determinism:** seeded RNG, fixed tick, custom trig. A seed + command list reproduces a match.
4. **Data-driven:** units, buildings and techs are plain objects in `src/data/`. The game, the
   AI, the in-game tech tree and the docs all read from them.

---

## 2. Core game rules

- **Resources:** **Ore** (engineers mine it at deposits, drop it at a Refinery or HQ) and
  **Energy** (Oil Derricks on land oil, Offshore Rigs on sea oil, later Fusion Plants).
  Offshore oil gives a real reason to fight for the sea.
- **Population:** each unit has a pop cost; capacity comes from housing. Hard cap 200.
- **Ages:** Modern → Digital → Nano → Space. You advance at the HQ by paying a cost and
  meeting building requirements. Each age unlocks buildings, units and research.
- **Fog of war:** unexplored (black), explored (terrain + last-seen buildings), visible.
- **Victory:** destroy all enemy production buildings and HQs, **or** complete the Space
  Elevator wonder and hold it for 5 minutes.
- **Defense is a real strategy:** cheap drag-to-build walls that upgrade with each age,
  gates, and towers that infantry garrison and shoot from (+range, damage reduction).
  Breaking a fortified base needs siege units (artillery, bombers, mechs, EMP, nukes).
  Details in TECH_TREE.md §4. The AI builds walls too: Hard walls off chokepoints and bridges.
- **Domains:** land, sea (surface and submerged), air, orbit. A counter system (see
  TECH_TREE.md) means no single unit type wins alone.

### Map

First map, handcrafted: **"Twin Shores"**, 160×160 tiles, rotationally symmetric.
- Each player has a home coast. A central sea separates them, with two land bridges and a
  chain of islands.
- Ore on land, oil on land and offshore, rich contested deposits on the islands.
- A random map generator (seeded, symmetric, multiple biomes) comes in a later milestone.

---

## 3. Understanding the state of the game (UI)

The player should always be able to answer "what do I have, what can I do next, what am
I missing".

| Element | What it shows |
|---|---|
| **Top bar** | Ore, Energy (with income/min), Population used/capacity, current age, age-up progress, game clock |
| **Selection panel** | Unit/building stats, health, armor type, weapon vs. target effectiveness, current order |
| **Command card** | Buildable/trainable/researchable items for the selection, greyed with the reason when locked ("Needs Radar Station", "Digital Age") |
| **Production tray** | All active queues and research across the base, tap to jump |
| **Tech tree screen** (key `T` / button) | Full tree by age, generated from `src/data`: researched (filled), available (outlined), locked (grey, with missing prerequisites). Tap a node to see what it unlocks |
| **Empire overview** (key `O`) | Buildings grouped by category (Core, Housing, Resource, Military, Tech, Defense, Special), counts per type, idle engineers, idle production, army value by domain |
| **Codex** | Encyclopedia of every unit/building: stats, cost, prereqs, strong vs / weak vs |
| **Alerts** | "Base under attack", "Enemy reached Nano Age", "Idle engineers", "Nuke detected" |
| **Post-game report** | Graphs of economy, army value and age timing for both sides |

### Mobile controls

- Tap select; tap ground to move; tap enemy to attack.
- Drag on empty ground = box select (toggle button switches drag to camera pan).
- Two fingers: pan / pinch zoom / rotate.
- Bottom command card with large buttons; control-group buttons on the side.
- Desktop gets the classic mouse + hotkeys on top.
- Installable as a PWA, works offline.

---

## 4. AI opponent

One AI, same commands as the player, sees only what its own fog of war shows (no cheating
at any level). Three layers:

1. **Strategic planner** (every ~2 s): economy target, when to age up, army composition
   (counters what it has scouted), when to attack or defend.
2. **Build manager:** turns the plan into build orders, placement, research queue.
3. **Tactical squads:** groups units, moves, focus fire, retreat, regroup, uses abilities.

| | Easy | Normal | Hard |
|---|---|---|---|
| Reaction delay | 3–4 s | 1.5 s | 0.5 s |
| Economy | ~60% engineers, idle time | standard | optimized, expands to islands |
| Age-up timing | late | standard | aggressive |
| Scouting & counters | none | reacts to what it sees | scouts actively, adapts composition |
| Attacks | one blob, infrequent | timed waves | harassment + multi-front, naval landings |
| Micro | none | basic focus fire | focus fire, retreat damaged units, kite |
| Special units | rarely | uses subs, carriers, mechs | combined arms, superweapon timing |

**Balance harness:** `tools/headless.ts` runs hundreds of AI-vs-AI matches in Node.
Targets: Hard beats Normal ~80%, Normal beats Easy ~90%, average game 20–35 min, no unit
type dominating usage. Later this also powers an AI-vs-AI spectator mode.

---

## 5. Milestones

Each milestone ends with a playable build on GitHub Pages and a short release note.

| # | Milestone | Done when |
|---|---|---|
| **M0** | Repo, plan, data files | This plan committed; `src/data` holds the full catalog; docs generated from it |
| **M1** | Skeleton | Vite + TS project, CI, Pages deploy, PWA offline, single-file build; Twin Shores terrain with water, RTS camera (mouse + touch), selection, move orders, land/water/air pathfinding |
| **M2** | Economy & base | Engineers gather Ore/Energy, build with placement rules, housing/pop, production queues, fog, minimap, top bar |
| **M3** | Modern-age combat & defense | Full Modern roster on land/sea/air, damage types and counters, transports; walls, gates, garrisonable Watchtowers/Bunkers, turrets, SAM, coastal batteries |
| **M4** | AI v1 + harness | All three difficulty levels play Modern age; headless runner works; you can win and lose |
| **M5** | Digital & Nano ages | Age-up, nuclear subs (submerge/sonar), carriers (launch/recover fighters), mechs, EMP, shields, nuke silo; AI uses them |
| **M6** | Space age | Spaceport, orbital units, orbital uplink powers, Space Elevator wonder victory |
| **M7** | Game-state UI | Tech tree screen, empire overview, codex, post-game report |
| **M8** | Juice | Procedural explosions, sound, adaptive music, unit voices, polish pass, then a "make it a lot more fun" pass driven by harness stats |
| **M9** | Content | Random map generator, more biomes, AI personalities, AI-vs-AI spectator, replays |
| Later | Multiplayer | Lockstep over WebSocket relay or WebRTC, built on the command system |

M7 elements start appearing earlier (top bar in M2, codex stubs in M3); M7 is where they
get finished.

---

## 6. Risks and how we handle them

- **Performance on phones:** instanced meshes, low-poly procedural models, LOD, capped
  particles, simple water shader. Test on a mid-range Android from M1.
- **Pathfinding with hundreds of units:** flow fields for group moves, A* for individuals,
  hierarchical grid if needed.
- **"Looks like a game but isn't fun":** the headless harness gives numbers (game length,
  comebacks, unit usage) so balance isn't guesswork. Play-test every milestone.
- **Scope creep:** the data catalog is big on purpose, but milestones only implement what
  each needs. Space age can be cut without affecting anything before it.
