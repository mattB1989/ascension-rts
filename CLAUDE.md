# Ascension — notes for Claude Code

Browser city/nation builder (three.js + TypeScript), SimCity/Pharaoh-style economy with
Empire Earth's late ages (Industrial → Digital → Nano → Space). Design in `docs/DESIGN.md`,
roadmap and balance notes in `docs/PLAN.md`, player-facing summary in `README.md`.
Keep README and PLAN up to date with every change that players or balance would notice.

## Commands

- `npm install`, then `npm run dev` (Vite) to play at http://localhost:5173
- `npm run typecheck` (three tsconfigs: app, sim, node tools)
- `npm test` (node:test, no browser; must stay green)
- `npm run docs` regenerates `docs/TECH_TREE.md` from the data; a test fails if it is stale,
  so run it after changing anything in `src/data/`
- Balance: `node --experimental-strip-types --no-warnings tools/tournament.ts [games] [size] [years] [difficulty] [biomes] [jobs]`
  - `jobs` = games run in parallel (one process each): use the number of cores, e.g. `$(nproc)`
  - `SPREAD=1` a new map every game (else each map is played 4 times, every strategy in every seat)
  - `PLAY_ON=1` keep playing after a win (to time the ages)
  - e.g. `SPREAD=1 node --experimental-strip-types --no-warnings tools/tournament.ts 24 256 70 normal temperate,arid,lakeland,alpine $(nproc)`
- `tools/headless.ts` one AI-only game with stats; `tools/play.ts` play a nation from the CLI
- URL options for watching AI play: `?mode=city&spectate=1&fog=0&seed=7`

## Architecture rules

- `src/sim/` never imports three.js or touches the DOM; it is deterministic (15 Hz ticks,
  `world.rng` for all randomness, no `Math.random`, no WeakMaps for game state). Replays and
  saves depend on it. Saves use structuredClone: new state fields must be optional or
  migrated with `??=`.
- AI pacing fields live on the saved bot state (`BotState` and intersections), not module state.
- Economy data tables are in `src/data/city.ts` (buildings, `AGE_STEPS`, `VICTORY`, house levels).
- AI: `src/ai/cityBot.ts` (`botStep` → embargo, spies, policy, military, town). `botTrace`
  (exported) records why a nation skipped each building it wanted: set `botTrace.player`.

## Current balance state (see PLAN.md for history)

12 maps × 70 years: Digital ~1966, Nano ~1983 (all games), Space in 9 of 12 (~1993).
Economic, federation and domination wins need the Space Age (`VICTORY.minAge = 3`).
Open items: Expansionists win least (1 in 12) and Warlords most (6 in 12); Space came earlier
than the ~2005 aim; early conquests can end a game before the late ages.

## Git

Commit in small steps with clear messages and push to `main` (CI deploys to GitHub Pages).
