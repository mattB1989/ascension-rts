// Progress through the ages in the economy game (DESIGN.md §10): an age is reached
// by research, people of the top tier so far, a yearly GDP, and a price.

import { AGE_ORDER } from '../../data/ages.ts';
import { AGE_STEPS, MAX_AGE } from '../../data/city.ts';
import { TIERS } from '../../data/goods.ts';
import type { World } from '../world.ts';

export interface AgeCheck {
  label: string;
  have: number;
  need: number;
  ok: boolean;
}

/** The next age for a player, with each requirement and whether it is met (null: none left to reach yet). */
export function nextAge(world: World, player: number): { age: number; name: string; unlocks: string; checks: AgeCheck[]; ready: boolean } | null {
  const pc = world.city!.players[player]!;
  const age = pc.age + 1;
  const step = AGE_STEPS[age];
  if (!step || age > MAX_AGE) return null;
  const tierName = TIERS[step.tier]!.name;
  const checks: AgeCheck[] = [
    { label: '🔬 Research', have: Math.floor(pc.research), need: step.research, ok: pc.research >= step.research },
    { label: `👥 ${tierName}`, have: pc.population[step.tier]!, need: step.people, ok: pc.population[step.tier]! >= step.people },
    { label: '📈 GDP last year', have: Math.round(pc.lastGdp), need: step.gdp, ok: pc.lastGdp >= step.gdp },
    { label: '₡ Cost', have: Math.floor(pc.credits), need: step.credits, ok: pc.credits >= step.credits },
  ];
  return { age, name: step.name, unlocks: step.unlocks, checks, ready: checks.every((c) => c.ok) };
}

/** Advance to the next age if every requirement is met. Returns why not, or null. */
export function advanceAge(world: World, player: number): string | null {
  const next = nextAge(world, player);
  if (!next) return 'No further age yet';
  const missing = next.checks.find((c) => !c.ok);
  if (missing) return `${next.name} needs ${missing.label.replace(/^\S+ /, '').toLowerCase()} ${missing.need.toLocaleString('en')}`;
  const pc = world.city!.players[player]!;
  const step = AGE_STEPS[next.age]!;
  pc.credits -= step.credits;
  pc.year.construction += step.credits;
  pc.research -= step.research;
  pc.age = next.age;
  world.players[player]!.age = AGE_ORDER[next.age]!;
  world.emit({ kind: 'notify', player, text: `🎉 You have reached the ${next.name}! New buildings are in the build menu.` });
  for (const p of world.players) if (p.id !== player && !p.defeated) world.emit({ kind: 'notify', player: p.id, text: `${world.players[player]!.name} has reached the ${next.name}` });
  return null;
}
