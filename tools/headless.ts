// Balance harness (docs/PLAN.md §4): plays an AI-only economy game in Node and prints,
// every few game years, each player's population, GDP, regions, age, army and credits,
// then the winner and how. Usage:
//   node --experimental-strip-types tools/headless.ts [seed] [size] [biome] [difficulty] [years]
// e.g. node --experimental-strip-types tools/headless.ts 7 256 temperate normal 30

import { newBot } from '../src/ai/cityBot.ts';
import { sumTiers } from '../src/data/goods.ts';
import { createCity } from '../src/sim/city/index.ts';
import type { GenBiome } from '../src/sim/mapgen.ts';
import type { Difficulty } from '../src/ai/cityBot.ts';

const [seedArg, sizeArg, biomeArg, diffArg, yearsArg] = process.argv.slice(2);
const seed = Number(seedArg ?? 7);
const size = Number(sizeArg ?? 256);
const biome = (biomeArg ?? 'temperate') as GenBiome;
const difficulty = (diffArg ?? 'normal') as Difficulty;
const years = Number(yearsArg ?? 20);

const world = createCity({ seed, size, biome, difficulty });
// Your seat is played by an AI nation too.
world.city!.bots.push(newBot(0, Infinity, true, difficulty));
world.players[0]!.name = 'Blue League';

const started = performance.now();
const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(`seed ${seed} · ${size}² ${biome} · ${difficulty} · ${world.players.length} players`);
for (let y = 1; y <= years; y++) {
  for (let i = 0; i < 15 * 120; i++) world.step();
  if (y % 2 !== 0 && y !== years) continue;
  console.log(`\n${1950 + y}`);
  for (const p of world.players) {
    const pc = world.city!.players[p.id]!;
    const regions = Array.from(world.city!.regionOwner).filter((o) => o === p.id).length;
    const army = world.units.filter((u) => u.owner === p.id).length;
    console.log(`  ${p.name.padEnd(16)} ${(p.role ?? '').padEnd(9)} ${p.defeated ? 'gone' : `pop ${pad(sumTiers(pc.population), 5)}  gdp ${pad(Math.round(pc.lastGdp), 6)}  regions ${pad(regions, 2)}  age ${pc.age} res ${pad(Math.round(pc.research), 4)} T ${pad(pc.population[1], 4)}  army ${pad(army, 3)}  ₡${pad(Math.round(pc.credits), 7)}`}`);
  }
  if (process.env.BUDGET) {
    for (const p of world.players.filter((x) => x.role !== 'cityState')) {
      const b = world.city!.players[p.id]!.lastYear;
      console.log(`  ${p.name} budget: ` + Object.entries(b).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
    }
  }
  const v = world.city!.victory;
  if (v.winner >= 0) {
    console.log(`\n🏆 ${world.players[v.winner]!.name} won (${v.how}) in ${1950 + y}`);
    break;
  }
}
console.log(`\n${((performance.now() - started) / 1000).toFixed(1)} s`);
