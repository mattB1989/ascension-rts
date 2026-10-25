// AI nations pick policies to suit their character, once settled in (and nuclear
// once they reach the Digital age with uranium to hand).

import type { Command } from '../sim/commands.ts';
import { policyOf, policyProblem, type PolicyArea } from '../sim/city/policies.ts';
import type { World } from '../sim/world.ts';
import type { BotState } from './cityBot.ts';

type PolicyBot = BotState & { policyAt?: number };

const BY_CHARACTER: Record<string, Partial<Record<PolicyArea, string>>> = {
  trader: { trade: 'free', economy: 'market' },
  builder: { economy: 'welfare' },
  expansionist: { economy: 'market' },
  warlike: { military: 'conscription', trade: 'protect' },
};

export function policyStep(world: World, bot: PolicyBot): Command[] {
  if (world.time < (bot.policyAt ?? 360)) return [];
  bot.policyAt = world.time + 120;
  const p = bot.player;
  const pc = world.city!.players[p]!;
  if (pc.credits < 15000) return [];
  const wants: Array<[PolicyArea, string]> = Object.entries(BY_CHARACTER[bot.personality ?? 'builder'] ?? {}) as Array<[PolicyArea, string]>;
  const uranium = world.buildings.some((b) => b.owner === p && b.type === 'uranium_mine' && b.complete);
  if (pc.age >= 1 && uranium) wants.push(['energy', 'nuclear']);
  for (const [area, option] of wants) {
    if (policyOf(world, p, area) === option || policyProblem(world, p, area, option)) continue;
    bot.log.push(`policy ${area}: ${option}`);
    return [{ kind: 'setPolicy', player: p, area, option }];
  }
  return [];
}
