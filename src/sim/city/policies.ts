// National policies: one choice per area, each a trade-off. Changing one costs
// credits and can't be done again in the same area for a year.
//
// Energy is deliberately honest: a renewables push makes wind and solar cheap and
// fossil power dear, but wind and sun come and go — without dams, batteries or
// firm (nuclear) power behind them that means blackouts. Less oil burnt means
// cleaner air and fewer deaths (energy.ts). Nuclear is firm and clean but needs
// uranium and engineers.

import { YEAR_SECONDS } from '../../data/goods.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';

export type PolicyArea = 'energy' | 'trade' | 'economy' | 'military';

export interface PolicyOption {
  id: string;
  name: string;
  text: string;
  /** Age needed to choose it. */
  age?: number;
}

export const POLICIES: Record<PolicyArea, { name: string; icon: string; options: PolicyOption[] }> = {
  energy: {
    name: 'Energy', icon: '⚡',
    options: [
      { id: 'balanced', name: 'Balanced', text: 'No thumb on the scale.' },
      { id: 'fossil', name: 'Cheap oil power', text: 'Oil power plants cost 20% less to build and 30% less to run. More smoke, more deaths from bad air.' },
      { id: 'green', name: 'Renewables push', text: 'Wind, solar, hydro and batteries cost 35% less to build and 25% less to run; a carbon tax adds 40% to oil plants\' running costs. Wind and sun come and go: back them with dams, batteries or nuclear, or expect blackouts.' },
      { id: 'nuclear', name: 'Nuclear programme', text: 'Nuclear plants cost 35% less to build, uranium imports 30% less, and stricter safety lowers accident risk by a third. Needs uranium and engineers.', age: 1 },
    ],
  },
  trade: {
    name: 'Trade', icon: '🚢',
    options: [
      { id: 'balanced', name: 'Balanced', text: 'Ordinary tariffs.' },
      { id: 'free', name: 'Free trade', text: 'Overseas buyers pay 8% more and sellers charge 8% less. Local industry faces competition: factories make 5% less.' },
      { id: 'protect', name: 'Protectionism', text: 'Tariffs: imports cost 25% more, but local factories make 10% more.' },
    ],
  },
  economy: {
    name: 'Economy', icon: '₡',
    options: [
      { id: 'balanced', name: 'Mixed economy', text: 'The middle way.' },
      { id: 'market', name: 'Free market', text: 'Taxes bring in 10% more; people are a little less happy (−3%).' },
      { id: 'welfare', name: 'Welfare state', text: 'People are happier (+6%), but buildings cost 12% more to run.' },
    ],
  },
  military: {
    name: 'Military', icon: '⚔',
    options: [
      { id: 'balanced', name: 'Volunteer army', text: 'A professional army of volunteers.' },
      { id: 'conscription', name: 'Conscription', text: 'Army limit +50% and units cost 20% less; people resent it (−5% happiness).' },
    ],
  },
};

/** Price of a change: grows with the age. */
export function policyCost(world: World, player: number): number {
  return 2000 * (1 + world.city!.players[player]!.age);
}

export function policyOf(world: World, player: number, area: PolicyArea): string {
  return world.city!.players[player]?.policies?.[area] ?? 'balanced';
}

export function policyProblem(world: World, player: number, area: PolicyArea, option: string): string | null {
  const def = POLICIES[area]?.options.find((o) => o.id === option);
  if (!def) return 'No such policy';
  const pc = world.city!.players[player]!;
  if (policyOf(world, player, area) === option) return 'Already in force';
  if ((def.age ?? 0) > pc.age) return 'Needs the Digital Age';
  const last = pc.policyAt?.[area] ?? -Infinity;
  if (world.time - last < YEAR_SECONDS) return `Changed recently: wait ${Math.ceil((YEAR_SECONDS - (world.time - last)) / 12) / 10} years`;
  if (pc.credits < policyCost(world, player)) return `Needs ₡${policyCost(world, player)}`;
  return null;
}

export function setPolicy(world: World, player: number, area: PolicyArea, option: string): string | null {
  const why = policyProblem(world, player, area, option);
  if (why) return why;
  const pc = world.city!.players[player]!;
  const cost = policyCost(world, player);
  pc.credits -= cost;
  pc.year.upkeep += cost;
  (pc.policies ??= {})[area] = option;
  (pc.policyAt ??= {})[area] = world.time;
  const name = POLICIES[area].options.find((o) => o.id === option)!.name;
  world.emit({ kind: 'notify', player, text: `📜 New ${POLICIES[area].name.toLowerCase()} policy: ${name}` });
  return null;
}

// --- Effects (read by the economy) -------------------------------------------------

const GREEN = new Set(['wind', 'solar', 'hydro', 'battery']);

/** Build price multiplier. */
export function buildCostFactor(world: World, player: number, type: string, kind: string | undefined): number {
  const energy = policyOf(world, player, 'energy');
  if (energy === 'fossil' && kind === 'fossil') return 0.8;
  if (energy === 'green' && kind && GREEN.has(kind)) return 0.65;
  if (energy === 'nuclear' && type === 'nuclear_plant') return 0.65;
  return 1;
}

/** Running-cost multiplier for a building. */
export function upkeepFactor(world: World, b: Building): number {
  const kind = b.def.econ?.powerKind;
  let f = 1;
  const energy = policyOf(world, b.owner, 'energy');
  if (energy === 'fossil' && kind === 'fossil') f *= 0.7;
  if (energy === 'green' && kind === 'fossil') f *= 1.4;
  if (energy === 'green' && kind && GREEN.has(kind)) f *= 0.75;
  if (policyOf(world, b.owner, 'economy') === 'welfare') f *= 1.12;
  return f;
}

export function taxFactor(world: World, player: number): number {
  return policyOf(world, player, 'economy') === 'market' ? 1.1 : 1;
}

export function policyHappiness(world: World, player: number): number {
  let h = 0;
  const econ = policyOf(world, player, 'economy');
  if (econ === 'market') h -= 0.03;
  if (econ === 'welfare') h += 0.06;
  if (policyOf(world, player, 'military') === 'conscription') h -= 0.05;
  return h;
}

/** Overseas prices for this player: what buyers pay (sell) and what sellers charge (buy). */
export function tradeFactors(world: World, player: number, good: string): { sell: number; buy: number } {
  const t = policyOf(world, player, 'trade');
  let sell = t === 'free' ? 1.08 : 1;
  let buy = t === 'free' ? 0.92 : t === 'protect' ? 1.25 : 1;
  if (good === 'uranium' && policyOf(world, player, 'energy') === 'nuclear') buy *= 0.7;
  return { sell, buy };
}

/** Factory output multiplier (not raw extraction). */
export function factoryFactor(world: World, player: number): number {
  const t = policyOf(world, player, 'trade');
  return t === 'protect' ? 1.1 : t === 'free' ? 0.95 : 1;
}

export function armyFactor(world: World, player: number): { cap: number; cost: number } {
  return policyOf(world, player, 'military') === 'conscription' ? { cap: 1.5, cost: 0.8 } : { cap: 1, cost: 1 };
}

export function meltdownFactor(world: World, player: number): number {
  return policyOf(world, player, 'energy') === 'nuclear' ? 0.67 : 1;
}
