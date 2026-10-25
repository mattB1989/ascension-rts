// Treaties between nations (DESIGN.md §8): non-aggression pacts, research pacts
// and trade agreements, proposed by one side and accepted or refused by the
// other. AI nations decide at once, by how they feel about you and the balance
// of power. Ending a war works the same way: you offer peace, they decide.

import { YEAR_SECONDS } from '../../data/goods.ts';
import type { World } from '../world.ts';
import { DIPLO, isCityState, newRelations, relationsOf, type Relations } from './diplomacy.ts';
import { atWar, reparations, setWar } from './military.ts';
import { PERSONALITIES } from '../../ai/cityBot.ts';

export type TreatyKind = 'peace' | 'research' | 'trade';

export interface Treaty {
  a: number;
  b: number;
  kind: TreatyKind;
  /** Game time it runs out. */
  until: number;
}

export const TREATIES: Record<TreatyKind, { name: string; years: number; opinion: number; text: string }> = {
  peace: { name: 'Non-aggression pact', years: 10, opinion: 0, text: 'Neither side may declare war while it lasts.' },
  research: { name: 'Research pact', years: 5, opinion: 20, text: 'Both sides research 25% faster.' },
  trade: { name: 'Trade agreement', years: 10, opinion: 5, text: 'Your trucks may trade with their town hall, as with a city-state (set deals per good).' },
};

/** Research bonus per research pact. */
export const RESEARCH_PACT_BONUS = 0.25;

export function treatiesOf(world: World, player: number): Treaty[] {
  return world.city!.treaties.filter((t) => t.a === player || t.b === player);
}

export function hasTreaty(world: World, a: number, b: number, kind: TreatyKind): boolean {
  return world.city!.treaties.some((t) => t.kind === kind && ((t.a === a && t.b === b) || (t.a === b && t.b === a)));
}

/** Can `player`'s trucks trade with `partner`'s town hall? City-states unless they honour an embargo on you; nations with a trade agreement. */
export function canTrade(world: World, player: number, partner: number): boolean {
  if (player === partner || world.players[partner]?.defeated) return false;
  if (embargoBetween(world, player, partner)) return false;
  if (isCityState(world, partner)) return honouredEmbargo(world, partner, player) < 0;
  return hasTreaty(world, player, partner, 'trade') && !atWar(world, player, partner);
}

// --- Embargoes (DESIGN.md §8): the peaceful weapon. A nation stops all trade with
// another, and city-states that like it enough (and more than the target) follow suit.

export interface Embargo {
  by: number;
  on: number;
  /** Game time it was declared. */
  since: number;
}

export const EMBARGO = {
  /** How much the target's opinion of you drops when you declare one. */
  opinion: -25,
  /** A city-state honours a nation's embargo when it likes that nation this much (and more than the target). */
  honourOpinion: 40,
  /** Lifting one mends a little. */
  lift: 10,
} as const;

export function hasEmbargo(world: World, by: number, on: number): boolean {
  return (world.city!.embargoes ?? []).some((e) => e.by === by && e.on === on);
}

/** Either side has an embargo on the other. */
export function embargoBetween(world: World, a: number, b: number): boolean {
  return hasEmbargo(world, a, b) || hasEmbargo(world, b, a);
}

/** The nation whose embargo on `player` this city-state honours (-1: none). */
export function honouredEmbargo(world: World, state: number, player: number): number {
  const list = world.city!.embargoes;
  if (!list?.length) return -1;
  const rel = relationsOf(world, state);
  if (!rel) return -1;
  const theirs = rel.opinion[player] ?? DIPLO.baseline;
  for (const e of list) {
    if (e.on !== player || e.by === state || world.players[e.by]?.defeated) continue;
    const op = rel.opinion[e.by] ?? DIPLO.baseline;
    if (op >= EMBARGO.honourOpinion && op > theirs) return e.by;
  }
  return -1;
}

/** Why `by` can't put an embargo on `on` (null: it can). */
export function embargoProblem(world: World, by: number, on: number): string | null {
  const them = world.players[on];
  const me = world.players[by];
  if (!them || !me || them.defeated || by === on) return 'Nobody to embargo';
  if (me.role !== 'nation' && me.role !== 'human') return 'Only nations declare embargoes';
  if (them.role !== 'nation' && them.role !== 'human') return 'Only nations can be embargoed';
  if (hasEmbargo(world, by, on)) return 'Already under your embargo';
  return null;
}

export function setEmbargo(world: World, by: number, on: number, active: boolean): string | null {
  const city = world.city!;
  city.embargoes ??= [];
  if (active) {
    const why = embargoProblem(world, by, on);
    if (why) return why;
    city.embargoes.push({ by, on, since: world.time });
    // It ends any trade agreement between them.
    city.treaties = city.treaties.filter((t) => !(t.kind === 'trade' && ((t.a === by && t.b === on) || (t.a === on && t.b === by))));
    changeOpinion(world, on, by, EMBARGO.opinion);
    world.emit({ kind: 'notify', player: -1, text: `⛔ ${world.players[by]!.name} placed an embargo on ${world.players[on]!.name}` });
    return null;
  }
  const before = city.embargoes.length;
  city.embargoes = city.embargoes.filter((e) => !(e.by === by && e.on === on));
  if (city.embargoes.length === before) return null;
  changeOpinion(world, on, by, EMBARGO.lift);
  world.emit({ kind: 'notify', player: -1, text: `✅ ${world.players[by]!.name} lifted its embargo on ${world.players[on]!.name}` });
  return null;
}

/** How a nation (or city-state) feels about another player. */
export function opinionOf(world: World, who: number, about: number): number {
  return relationsOf(world, who)?.opinion[about] ?? DIPLO.baseline;
}

/** Nudge how `who` feels about `about` (clamped to -100..100). */
export function changeOpinion(world: World, who: number, about: number, by: number): void {
  const rel = relationsOf(world, who);
  if (rel) rel.opinion[about] = Math.max(-100, Math.min(100, (rel.opinion[about] ?? DIPLO.baseline) + by));
}

/** Nations get relations too (opinions of everyone), created on demand for older saves. */
export function ensureRelations(world: World, player: number): Relations {
  const pc = world.city!.players[player]!;
  pc.relations ??= newRelations(world.players.length);
  return pc.relations;
}

function armySize(world: World, player: number): number {
  return world.units.filter((u) => u.owner === player && u.def.domain === 'land' && !u.def.builder).length;
}

/** Would `to` accept this treaty from `from`? Returns why not, or null. */
export function treatyProblem(world: World, from: number, to: number, kind: TreatyKind): string | null {
  const them = world.players[to];
  if (!them || them.defeated || from === to) return 'Nobody to sign with';
  if (them.role !== 'nation' && them.role !== 'human') return 'Only nations sign treaties';
  if (atWar(world, from, to)) return 'You are at war: offer peace first';
  if (hasTreaty(world, from, to, kind)) return 'Already signed';
  if (kind === 'trade' && embargoBetween(world, from, to)) return 'An embargo stands between you: lift it first';
  const op = opinionOf(world, to, from);
  const bot = world.city!.bots.find((b) => b.player === to);
  const need = TREATIES[kind].opinion + (kind === 'peace' && bot?.difficulty === 'hard' ? 25 : 0) + (bot?.personality ? PERSONALITIES[bot.personality].treaty : 0);
  if (op < need) return `${them.name} won't sign: they like you too little (${Math.round(op)}, need ${need})`;
  return null;
}

/** Propose a treaty; AI nations answer at once. */
export function proposeTreaty(world: World, from: number, to: number, kind: TreatyKind): string | null {
  const why = treatyProblem(world, from, to, kind);
  if (why) return why;
  world.city!.treaties.push({ a: from, b: to, kind, until: world.time + TREATIES[kind].years * YEAR_SECONDS });
  changeOpinion(world, to, from, 10);
  changeOpinion(world, from, to, 10);
  const text = `📜 ${world.players[from]!.name} and ${world.players[to]!.name} signed a ${TREATIES[kind].name.toLowerCase()}`;
  world.emit({ kind: 'notify', player: from, text });
  world.emit({ kind: 'notify', player: to, text });
  return null;
}

/** Break a treaty early. Breaking a non-aggression pact angers everyone. */
export function cancelTreaty(world: World, from: number, to: number, kind: TreatyKind): void {
  const city = world.city!;
  const before = city.treaties.length;
  city.treaties = city.treaties.filter((t) => !(t.kind === kind && ((t.a === from && t.b === to) || (t.a === to && t.b === from))));
  if (city.treaties.length === before) return;
  changeOpinion(world, to, from, kind === 'peace' ? -40 : -15);
  if (kind === 'peace') for (const p of world.players) if (p.id !== from && p.id !== to) changeOpinion(world, p.id, from, -10);
  world.emit({ kind: 'notify', player: to, text: `📜 ${world.players[from]!.name} ended the ${TREATIES[kind].name.toLowerCase()}` });
  world.emit({ kind: 'notify', player: from, text: `📜 You ended the ${TREATIES[kind].name.toLowerCase()} with ${world.players[to]!.name}` });
}

/** Offer to end a war. City-states always accept; nations when the war is long or going badly for them. */
export function peaceProblem(world: World, from: number, to: number): string | null {
  if (!atWar(world, from, to)) return 'Not at war';
  const them = world.players[to]!;
  if (them.role !== 'nation') return null;
  const since = world.city!.warStart[from]?.[to] ?? 0;
  const long = world.time - since >= 2 * YEAR_SECONDS;
  const theirs = armySize(world, to);
  const yours = armySize(world, from);
  if (long || theirs <= yours || opinionOf(world, to, from) >= 30) return null;
  return `${them.name} wants to fight on (army ${theirs} against your ${yours}; they may talk after two years of war)`;
}

export function offerPeace(world: World, from: number, to: number): string | null {
  const why = peaceProblem(world, from, to);
  if (why) return why;
  reparations(world, from, to);
  setWar(world, from, to, false);
  world.emit({ kind: 'notify', player: -1, text: `🕊 ${world.players[from]!.name} and ${world.players[to]!.name} made peace` });
  return null;
}

/** Once a second: treaties run out. */
export function updateTreaties(world: World): void {
  const city = world.city!;
  const gone = (e: Embargo) => !!world.players[e.by]?.defeated || !!world.players[e.on]?.defeated;
  if (city.embargoes?.some(gone)) city.embargoes = city.embargoes.filter((e) => !gone(e));
  if (!city.treaties.length) return;
  const keep = city.treaties.filter((t) => t.until > world.time && !world.players[t.a]?.defeated && !world.players[t.b]?.defeated);
  if (keep.length === city.treaties.length) return;
  for (const t of city.treaties) {
    if (keep.includes(t)) continue;
    const text = `📜 The ${TREATIES[t.kind].name.toLowerCase()} between ${world.players[t.a]!.name} and ${world.players[t.b]!.name} has run out`;
    world.emit({ kind: 'notify', player: t.a, text });
    world.emit({ kind: 'notify', player: t.b, text });
  }
  city.treaties = keep;
}

/** Research speed from research pacts. */
export function researchBonus(world: World, player: number): number {
  return 1 + RESEARCH_PACT_BONUS * world.city!.treaties.filter((t) => t.kind === 'research' && (t.a === player || t.b === player)).length;
}
