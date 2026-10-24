// AI nations use spies too: when at war (or, on Hard, against a rival they
// loathe), they buy a report on the enemy and sabotage what it says matters most.

import type { Command } from '../sim/commands.ts';
import { INTEL, latestReport, reportProblem, sabotageProblem } from '../sim/city/intel.ts';
import { atWar } from '../sim/city/military.ts';
import { opinionOf } from '../sim/city/treaties.ts';
import type { World } from '../sim/world.ts';
import type { BotState } from './cityBot.ts';

/** Bots remember when they next look at spying (saved with the bot, so replays stay in step). */
type SpyBot = BotState & { spyAt?: number };

/** Seconds between spy decisions, by difficulty. */
const SPY_EVERY = { easy: Infinity, normal: 240, hard: 150 } as const;

export function spyStep(world: World, bot: SpyBot): Command[] {
  const p = bot.player;
  const every = SPY_EVERY[bot.difficulty];
  if (!Number.isFinite(every) || world.time < (bot.spyAt ?? every)) return [];
  bot.spyAt = world.time + every * (bot.personality === 'warlike' ? 0.7 : bot.personality === 'builder' ? 1.5 : 1);
  const credits = world.city!.players[p]!.credits;
  if (credits < 12000) return [];
  const targets = world.players.filter((o) => o.id !== p && !o.defeated && (o.role === 'nation' || o.role === 'human') && (atWar(world, p, o.id) || (bot.difficulty === 'hard' && opinionOf(world, p, o.id) < -40)));
  for (const t of targets) {
    const r = latestReport(world, p, t.id);
    if (!r || world.time - r.time > INTEL.reportLife * 0.75) {
      if (reportProblem(world, p, t.id) === null) {
        bot.log.push(`spy report on ${t.name}`);
        return [{ kind: 'spyReport', player: p, target: t.id }];
      }
      continue;
    }
    if (credits < INTEL.sabotageCost + 10000) continue;
    for (const item of r.items) {
      if (!item.building || item.severity < 2) continue;
      if (sabotageProblem(world, p, world.getBuilding(item.building)) !== null) continue;
      bot.log.push(`sabotage ${t.name} #${item.building}`);
      return [{ kind: 'sabotage', player: p, building: item.building }];
    }
  }
  return [];
}
