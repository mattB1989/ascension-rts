// Strategy tournament: AI-only economy games with the four nation characters
// (Traders, Builders, Expansionists, Warlords) rotated through every seat, so a
// good or bad start position doesn't decide the result. Prints, per strategy:
// wins (and how), average final share of world GDP, population, age reached,
// eliminations. Games that reach the year limit without a winner are scored by
// GDP share.
//
//   node --experimental-strip-types --no-warnings tools/tournament.ts [games] [size] [years] [difficulty] [biomes] [jobs]
//   (env SPREAD=1: a new map every game; PLAY_ON=1: keep playing after a win, to time the ages)
//   e.g. tools/tournament.ts 8 256 30 normal temperate,arid,lakeland 2
//
// Each game runs in its own child process (`jobs` at a time). One game alone:
//   tools/tournament.ts --game <seed> <size> <years> <difficulty> <biome> <rotation>

import { nextAge } from '../src/sim/city/ages.ts';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { newBot, PERSONALITIES, type Difficulty, type Personality } from '../src/ai/cityBot.ts';
import { sumTiers } from '../src/data/goods.ts';
import { createCity } from '../src/sim/city/index.ts';
import { gdpShare } from '../src/sim/city/victory.ts';
import type { GenBiome } from '../src/sim/mapgen.ts';

const STRATEGIES: Personality[] = ['trader', 'builder', 'expansionist', 'warlike'];

interface SeatResult {
  strategy: Personality;
  seat: number;
  won: boolean;
  how: string;
  share: number;
  population: number;
  age: number;
  /** Year this seat reached each age (index = age; 0 = start). */
  ageYears: number[];
  /** What the next age still lacked at the end ("research 900/1500 …"). */
  lacking: string;
  regions: number;
  defeated: boolean;
}

interface GameResult {
  seed: number;
  biome: string;
  year: number;
  winner: Personality | null;
  how: string;
  seats: SeatResult[];
  /** First year any nation reached each age (null: never). */
  firstAge: Array<number | null>;
}

function playGame(seed: number, size: number, years: number, difficulty: Difficulty, biome: GenBiome, rotation: number): GameResult {
  const world = createCity({ seed, size, biome, difficulty, nations: 3, victory: true });
  const city = world.city!;
  // Seat 0 is played by a nation bot as well.
  city.bots.push(newBot(0, Infinity, true, difficulty));
  const seats = world.players.filter((p) => p.role === 'human' || p.role === 'nation').map((p) => p.id);
  seats.forEach((id, k) => {
    const bot = city.bots.find((b) => b.player === id && b.nation)!;
    bot.personality = STRATEGIES[(k + rotation) % STRATEGIES.length];
  });
  let year = 1950;
  const ageYears = new Map<number, number[]>(seats.map((id) => [id, [1950]]));
  for (let y = 1; y <= years; y++) {
    for (let i = 0; i < 15 * 120; i++) world.step();
    year = 1950 + y;
    for (const id of seats) {
      const list = ageYears.get(id)!;
      while (list.length <= city.players[id]!.age) list.push(year);
    }
    if (city.victory.winner >= 0 && !process.env.PLAY_ON) break;
  }
  const firstAge: Array<number | null> = [0, 1, 2, 3].map((a) => {
    const ys = seats.map((id) => ageYears.get(id)![a]).filter((v): v is number => v !== undefined);
    return ys.length ? Math.min(...ys) : null;
  });
  const strategyOf = (id: number) => city.bots.find((b) => b.player === id && b.nation)?.personality ?? STRATEGIES[(seats.indexOf(id) + rotation) % STRATEGIES.length]!;
  const out: SeatResult[] = seats.map((id) => {
    const pc = city.players[id]!;
    let regions = 0;
    for (let r = 1; r < city.regionOwner.length; r++) if (city.regionOwner[r] === id) regions++;
    return {
      strategy: strategyOf(id),
      seat: seats.indexOf(id),
      won: city.victory.winner === id,
      how: city.victory.winner === id ? city.victory.how : '',
      share: world.players[id]!.defeated ? 0 : gdpShare(world, id),
      population: sumTiers(pc.population),
      age: pc.age,
      ageYears: ageYears.get(id)!,
      lacking: (nextAge(world, id)?.checks ?? []).filter((c) => !c.ok).map((c) => `${c.label.replace(/^\S+ /, '')} ${c.have}/${c.need}`).join(', '),
      regions,
      defeated: !!world.players[id]!.defeated,
    };
  });
  // No winner by the year limit: the largest economy takes it on points.
  let winner = out.find((s) => s.won);
  let how = winner?.how ?? '';
  if (!winner) {
    winner = [...out].sort((a, b) => b.share - a.share)[0]!;
    winner.won = true;
    how = winner.how = 'points (GDP share)';
  }
  return { seed, biome, year, winner: winner.strategy, how, seats: out, firstAge };
}

function runChild(args: string[]): Promise<GameResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url), '--game', ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    p.stdout.on('data', (d) => (text += d));
    p.on('close', (code) => (code === 0 ? resolve(JSON.parse(text) as GameResult) : reject(new Error(`game ${args.join(' ')} exited ${code}`))));
  });
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);

function report(results: GameResult[]): void {
  console.log(`\n${results.length} games\n`);
  console.log('strategy        wins   win%  economic federation domination space conquest points   GDP share  pop    age  regions  eliminated');
  for (const s of STRATEGIES) {
    const seats = results.flatMap((r) => r.seats.filter((x) => x.strategy === s));
    const wins = seats.filter((x) => x.won);
    const by = (h: string) => wins.filter((x) => x.how.startsWith(h)).length;
    const avg = (f: (x: SeatResult) => number) => seats.reduce((a, x) => a + f(x), 0) / Math.max(1, seats.length);
    console.log(
      `${PERSONALITIES[s].name.padEnd(15)} ${String(wins.length).padStart(4)} ${pct(wins.length / Math.max(1, results.length))}  ` +
        `${String(by('economic')).padStart(8)} ${String(by('federation')).padStart(10)} ${String(by('domination')).padStart(10)} ${String(by('space')).padStart(5)} ${String(by('conquest')).padStart(8)} ${String(by('points')).padStart(6)}   ` +
        `${pct(avg((x) => x.share)).padStart(9)} ${String(Math.round(avg((x) => x.population))).padStart(5)}  ${avg((x) => x.age).toFixed(2)}  ${avg((x) => x.regions).toFixed(1).padStart(7)}  ${String(seats.filter((x) => x.defeated).length).padStart(10)}`,
    );
  }
  console.log('\nages (first nation to get there, per game):');
  for (let a = 1; a <= 3; a++) {
    const ys = results.map((r) => r.firstAge[a]).filter((v): v is number => v !== null && v !== undefined);
    const seatYs = results.flatMap((r) => r.seats.map((x) => x.ageYears[a])).filter((v): v is number => v !== undefined);
    const mean = (v: number[]) => (v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : '—');
    console.log(`  age ${a}: reached in ${pct(ys.length / Math.max(1, results.length)).trim()} of games (first ~${mean(ys)}), by ${pct(seatYs.length / Math.max(1, results.length * 3)).trim()} of nations (avg ~${mean(seatYs)})`);
  }
  console.log('\nstill lacking for the next age at the end:');
  for (const r of results) for (const x of r.seats) if (x.lacking) console.log(`  seed ${r.seed} ${x.strategy.padEnd(12)} age ${x.age}: ${x.lacking}`);
  console.log('\nper game:');
  for (const r of results) console.log(`  seed ${r.seed} ${r.biome.padEnd(11)} ${r.year}  ${PERSONALITIES[r.winner!].name} (${r.how})  ` + r.seats.map((x) => `${x.strategy}:${pct(x.share).trim()}${x.defeated ? '✝' : ''}[${x.ageYears.slice(1).map((y) => String(y).slice(2)).join(',')}]`).join(' '));
}

const argv = process.argv.slice(2);
if (argv[0] === '--game') {
  const [seed, size, years, difficulty, biome, rotation] = argv.slice(1);
  process.stdout.write(JSON.stringify(playGame(Number(seed), Number(size), Number(years), difficulty as Difficulty, biome as GenBiome, Number(rotation))));
} else {
  const games = Number(argv[0] ?? 8);
  const size = Number(argv[1] ?? 256);
  const years = Number(argv[2] ?? 30);
  const difficulty = (argv[3] ?? 'normal') as Difficulty;
  const biomes = (argv[4] ?? 'temperate,arid,lakeland,alpine').split(',') as GenBiome[];
  const jobs = Number(argv[5] ?? 2);
  // By default each map is played four times, every strategy in every seat; SPREAD=1 plays a new map each game instead.
  const spread = !!process.env.SPREAD;
  const queue = Array.from({ length: games }, (_, i) => {
    const m = spread ? i : Math.floor(i / 4);
    return [String(100 + m), String(size), String(years), difficulty, biomes[m % biomes.length]!, String(i % 4)];
  });
  const results: GameResult[] = [];
  const started = performance.now();
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const r = await runChild(job);
      results.push(r);
      console.log(`game ${results.length}/${games}: seed ${r.seed} ${r.biome} → ${PERSONALITIES[r.winner!].name} (${r.how}, ${r.year})`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  results.sort((a, b) => a.seed - b.seed || a.biome.localeCompare(b.biome) || a.seats[0]!.strategy.localeCompare(b.seats[0]!.strategy));
  report(results);
  console.log(`\n${((performance.now() - started) / 1000).toFixed(0)} s`);
}
