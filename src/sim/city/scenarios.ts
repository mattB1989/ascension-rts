// Scenarios (PLAN.md E10): hand-picked maps with a starting situation and one goal
// to reach by a deadline. They are ordinary economy games underneath (the usual ways
// to win still count), so they save, load and replay like any other.

import { sumTiers } from '../../data/goods.ts';
import type { World } from '../world.ts';
import type { CityOptions } from './index.ts';
import type { Personality } from '../../ai/cityBot.ts';

export interface Scenario {
  id: string;
  name: string;
  /** The situation, in a sentence or two. */
  blurb: string;
  /** The goal, as shown to the player. */
  goal: string;
  setup: Omit<CityOptions, 'scenario' | 'spectate'>;
  /** Game year by which the goal must be met (the end of that year). */
  by: number;
  /** Starting credits for you, and the rivals' characters. */
  credits?: number;
  rivals?: Personality;
  /** How far along you are (1: done). */
  progress: (world: World) => { frac: number; text: string };
}

const START_YEAR = 1950;

export const SCENARIOS: Scenario[] = [
  {
    id: 'boomtown',
    name: 'Boomtown',
    blurb: 'Open farmland, two friendly towns down the road and nobody to fight. Build fast.',
    goal: 'Reach 1,200 residents by the end of 1966.',
    setup: { seed: 21, size: 256, biome: 'temperate', nations: 0, cityStates: 2, difficulty: 'easy' },
    by: 1966,
    progress: (w) => {
      const pop = sumTiers(w.city!.players[0]!.population);
      return { frac: Math.min(1, pop / 1200), text: `${pop.toLocaleString('en')} of 1,200 residents` };
    },
  },
  {
    id: 'river_republic',
    name: 'The River Republic',
    blurb: 'A country of lakes and rivers shared with four independent towns. Win them over with trade, not tanks.',
    goal: 'Bring two city-states into your nation (union or purchase) by the end of 1975.',
    setup: { seed: 4, size: 256, biome: 'lakeland', nations: 0, cityStates: 4, difficulty: 'normal' },
    by: 1975,
    progress: (w) => {
      const n = w.city!.victory.joined?.[0] ?? 0;
      return { frac: Math.min(1, n / 2), text: `${n} of 2 city-states joined` };
    },
  },
  {
    id: 'island_hopping',
    name: 'Island Hopping',
    blurb: 'A scatter of islands and one rival across the water. Ports, ships and trade are everything.',
    goal: 'Make ₡8,000 of GDP in a single year by the end of 1972.',
    setup: { seed: 9, size: 256, biome: 'archipelago', nations: 1, cityStates: 3, difficulty: 'normal' },
    by: 1972,
    credits: 40000,
    progress: (w) => {
      const pc = w.city!.players[0]!;
      const best = Math.max(pc.lastGdp, pc.bestGdp ?? 0);
      return { frac: Math.min(1, best / 8000), text: `Best year so far ₡${Math.round(best).toLocaleString('en')} of ₡8,000` };
    },
  },
  {
    id: 'cold_front',
    name: 'Cold Front',
    blurb: 'A mountain valley between two warlike powers. Arm, hold your ground and out-think them.',
    goal: 'Reach the Digital age by the end of 1968 without losing your capital.',
    setup: { seed: 12, size: 256, biome: 'alpine', nations: 2, cityStates: 2, difficulty: 'hard' },
    by: 1968,
    credits: 30000,
    rivals: 'warlike',
    progress: (w) => {
      const pc = w.city!.players[0]!;
      return { frac: pc.age >= 1 ? 1 : Math.min(0.99, pc.research / 300), text: pc.age >= 1 ? 'Digital age reached' : `Research ${Math.round(pc.research)} of 300 (see 🔬 Ages)` };
    },
  },
];

export function scenarioById(id: string | undefined): Scenario | undefined {
  return id ? SCENARIOS.find((s) => s.id === id) : undefined;
}

/** Set up a new game for a scenario (after the map and players are made). */
export function applyScenario(world: World, s: Scenario): void {
  const city = world.city!;
  if (s.credits !== undefined) city.players[0]!.credits = s.credits;
  if (s.rivals) for (const b of city.bots) if (b.nation && b.player !== 0) b.personality = s.rivals;
  city.victory.scenario = s.id;
  city.victory.scenarioDone = '';
}

/** Once a second: has the scenario been won, or lost (deadline passed, capital fallen)? */
export function updateScenario(world: World): void {
  const v = world.city!.victory;
  const s = scenarioById(v.scenario);
  if (!s || v.scenarioDone) return;
  const pc = world.city!.players[0]!;
  pc.bestGdp = Math.max(pc.bestGdp ?? 0, pc.lastGdp);
  const year = START_YEAR + Math.floor(world.time / 120);
  const capital = world.buildings.some((b) => b.owner === 0 && b.type === 'town_hall');
  if (s.progress(world).frac >= 1) {
    v.scenarioDone = 'won';
    world.emit({ kind: 'victory', player: 0, how: 'scenario' });
  } else if (world.players[0]!.defeated || (s.id === 'cold_front' && !capital)) {
    v.scenarioDone = 'lost';
    world.emit({ kind: 'victory', player: -1, how: 'scenario' });
  } else if (year > s.by) {
    v.scenarioDone = 'lost';
    world.emit({ kind: 'victory', player: -1, how: 'scenario' });
  }
}
