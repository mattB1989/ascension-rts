// Intelligence (spies): a report on a nation's weak points, bought with credits,
// and covert sabotage that knocks a building out for a while. A report on
// yourself costs less and lists what an enemy would hit first.
//
// Reports are part of the game state (deterministic: they are commands, and the
// chance of being caught comes from the world's own random numbers).

import { YEAR_SECONDS, sumTiers } from '../../data/goods.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { atWar } from './military.ts';
import { changeOpinion } from './treaties.ts';

export const INTEL = {
  /** Report price: base plus this much per resident of the target. Half price on yourself. */
  reportBase: 1200,
  reportPerResident: 1.5,
  selfFactor: 0.5,
  /** Sabotage: price, how long the building is out, chance of being caught. */
  sabotageCost: 3500,
  sabotageSeconds: YEAR_SECONDS / 2,
  caughtChance: 0.35,
  /** A report stays usable (for sabotage) this long. */
  reportLife: 2 * YEAR_SECONDS,
  /** Opinion lost when a sabotage is traced back. */
  caughtOpinion: -35,
} as const;

export type IntelKind = 'power' | 'water' | 'food' | 'industry' | 'research' | 'trade' | 'army' | 'defence' | 'money' | 'mood';

export interface IntelItem {
  kind: IntelKind;
  /** 3: critical, 2: serious, 1: worth knowing. */
  severity: 1 | 2 | 3;
  text: string;
  /** What to do about it (attack plan, or a fix on yourself). */
  plan: string;
  /** The building it is about, if any (sabotage / show). */
  building?: number;
  x?: number;
  y?: number;
}

export interface IntelReport {
  id: number;
  by: number;
  target: number;
  time: number;
  self: boolean;
  summary: { population: number; gdp: number; credits: number; net: number; army: number; age: number; happiness: number };
  items: IntelItem[];
}

export function reportPrice(world: World, by: number, target: number): number {
  const pop = sumTiers(world.city!.players[target]!.population);
  const p = INTEL.reportBase + pop * INTEL.reportPerResident;
  return Math.round((by === target ? p * INTEL.selfFactor : p) / 50) * 50;
}

export function reportProblem(world: World, by: number, target: number): string | null {
  const t = world.players[target];
  if (!t || t.defeated) return 'Nobody to spy on';
  if (target !== by && t.role !== 'nation' && t.role !== 'human') return 'Spies work on nations only';
  const price = reportPrice(world, by, target);
  if (world.city!.players[by]!.credits < price) return `Needs ₡${price}`;
  return null;
}

const owned = (world: World, p: number) => world.buildings.filter((b) => b.owner === p && b.complete && b.city);
const at = (b: Building) => ({ building: b.id, x: b.x, y: b.y });
const name = (b: Building) => b.def.name;

/** Look at a nation (or yourself) and list its weak points, worst first. */
export function analyse(world: World, by: number, target: number): IntelReport {
  const city = world.city!;
  const pc = city.players[target]!;
  const self = by === target;
  const them = self ? 'your' : 'their';
  const Them = self ? 'Your' : 'Their';
  const items: IntelItem[] = [];
  const mine = owned(world, target);
  const count = (type: string) => mine.filter((b) => b.type === type);

  // Power: few plants make most of it.
  const plants = mine.filter((b) => (b.def.econ?.power ?? 0) < 0).sort((a, b) => b.city!.powerOut - a.city!.powerOut || a.id - b.id);
  const supply = plants.reduce((s, b) => s + b.city!.powerOut, 0);
  if (plants.length && supply > 0) {
    const top = plants[0]!;
    const share = top.city!.powerOut / supply;
    if (share >= 0.5) {
      items.push({
        kind: 'power', severity: share >= 0.75 ? 3 : 2,
        text: `${Them} ${name(top)} makes ${Math.round(share * 100)}% of ${them} power (${Math.round(top.city!.powerOut)} of ${Math.round(supply)} MW).`,
        plan: self ? 'Build a second power plant on another road network, so one hit cannot black out your city.' : `Bomb or sabotage it: houses lose power and their technicians, industry and services stop.`,
        ...at(top),
      });
    }
  } else if (pc.powerDemand > 0) {
    items.push({ kind: 'power', severity: 2, text: `${Them} city has no working power plant.`, plan: self ? 'Build a power plant (oil, hydro, later nuclear).' : 'They are already weak: press now.' });
  }
  if (pc.powerDemand > pc.powerSupply + 0.5) {
    items.push({ kind: 'power', severity: 2, text: `${Them} power is short: ${Math.round(pc.powerDemand)} MW needed, ${Math.round(pc.powerSupply)} MW made.`, plan: self ? 'More power before you grow further.' : 'Any hit on their plants makes it worse.' });
  }

  // Water: one or two pumping stations.
  const pumps = mine.filter((b) => b.def.econ?.waterSupply);
  if (pumps.length === 1) {
    const p = pumps[0]!;
    items.push({ kind: 'water', severity: 3, text: `${Them} whole water supply comes from one ${name(p)}.`, plan: self ? 'Build a second pumping station or a well.' : 'Knock it out and every house loses water within a minute.', ...at(p) });
  }

  // Food: few producers, or little in stock.
  const food = mine.filter((b) => b.def.econ?.recipe?.out.food);
  const foodStock = pc.stockpile.food ?? 0;
  if (food.length && food.length <= 2) {
    const f = food[0]!;
    items.push({ kind: 'food', severity: foodStock < 60 ? 3 : 2, text: `${Them} food comes from ${food.length === 1 ? `a single ${name(f)}` : `just ${food.length} producers`} (${Math.floor(foodStock)} food in stock).`, plan: self ? 'Spread food production: more farms with food plants, or fishing harbours.' : 'Hit the food producers: hungry houses shrink and taxes fall.', ...at(f) });
  }

  // Industry: the only producer of something that matters.
  for (const [type, why] of [
    ['steel_mill', 'steel for buildings, tanks and ships'],
    ['oil_refinery', 'fuel for the army and plastics for goods'],
    ['cement_works', 'concrete for construction'],
    ['goods_factory', 'goods for bigger houses'],
    ['electronics_plant', 'electronics for towers and modern units'],
    ['nano_fab', 'nanomaterials'],
  ] as const) {
    const list = count(type);
    if (list.length === 1) {
      const b = list[0]!;
      items.push({ kind: 'industry', severity: type === 'steel_mill' || type === 'oil_refinery' ? 2 : 1, text: `${Them} only ${name(b)} makes ${why}.`, plan: self ? `Build a second one elsewhere.` : `Sabotage it to choke ${why.split(' ')[0]}.`, ...at(b) });
    }
  }

  // Research towards the next age.
  const labs = count('research_institute');
  if (labs.length === 1 && pc.research > 50) {
    const b = labs[0]!;
    items.push({ kind: 'research', severity: 1, text: `All ${them} research (${Math.round(pc.research)} points) runs through one ${name(b)}.`, plan: self ? 'A second institute keeps the next age on track.' : 'Sabotage it to delay their next age.', ...at(b) });
  }

  // Trade: income from one port.
  const ports = count('trade_port');
  const income = pc.lastYear.taxes + pc.lastYear.trade;
  if (ports.length === 1 && income > 0 && pc.lastYear.trade / income > 0.25) {
    const b = ports[0]!;
    items.push({ kind: 'trade', severity: 2, text: `${Math.round((pc.lastYear.trade / income) * 100)}% of ${them} income is exports through one ${name(b)}.`, plan: self ? 'Guard it with a Coast Guard; trade with neighbours by road too.' : 'Blockade it with warships, or sabotage it.', ...at(b) });
  }

  // Army and what counters it.
  const army = world.units.filter((u) => u.owner === target && !u.def.builder);
  const by_ = (pred: (u: (typeof army)[number]) => boolean) => army.filter(pred).length;
  const inf = by_((u) => u.def.armor === 'inf');
  const veh = by_((u) => u.def.armor === 'lt' || u.def.armor === 'hv' || u.def.armor === 'mech');
  const air = by_((u) => u.def.domain === 'air');
  const sea = by_((u) => u.def.domain === 'sea');
  if (army.length) {
    const counter = veh >= inf && veh >= air ? 'rocket troopers and anti-tank artillery' : air > inf ? 'anti-air (flak, skyguards)' : 'tanks and machine guns';
    items.push({ kind: 'army', severity: army.length >= 10 ? 2 : 1, text: `Army: ${army.length} units (${inf} infantry, ${veh} vehicles${air ? `, ${air} aircraft` : ''}${sea ? `, ${sea} ships` : ''}).`, plan: self ? `An enemy would bring ${counter.split(' and ')[0]} against this mix.` : `Counter with ${counter}.` });
  } else {
    items.push({ kind: 'army', severity: self ? 2 : 1, text: `${Them} nation has no army at all.`, plan: self ? 'A few riflemen garrisoned in your seats stop a cheap capture.' : 'A small force could take their seats.' });
  }

  // Seats with nobody guarding them.
  for (const s of mine.filter((b) => b.type === 'town_hall' || b.type === 'regional_office')) {
    const guards = army.filter((u) => (u.x - s.x) ** 2 + (u.y - s.y) ** 2 < 100).length + (s.garrison?.length ?? 0);
    if (guards === 0) items.push({ kind: 'defence', severity: s.type === 'town_hall' ? 3 : 2, text: `${Them} ${name(s)} at ${Math.round(s.x)},${Math.round(s.y)} has no defenders nearby.`, plan: self ? 'Garrison infantry there or build a bunker or turret.' : `Troops holding it for 30 s take ${s.type === 'town_hall' ? 'their capital' : 'the region'}.`, ...at(s) });
  }

  // Money and mood.
  const net = pc.lastYear.taxes + pc.lastYear.trade - pc.lastYear.imports - pc.lastYear.upkeep - pc.lastYear.roads - pc.lastYear.construction - pc.lastYear.military;
  if (pc.credits < 3000 || net < 0) items.push({ kind: 'money', severity: pc.credits < 1000 && net < 0 ? 3 : 2, text: `${Them} treasury: ₡${Math.round(pc.credits)}, ${net >= 0 ? '+' : ''}${Math.round(net)} last year.`, plan: self ? 'Raise taxes a little, export surpluses, or cut idle buildings.' : 'They cannot afford a long war: an embargo or a war of attrition will break them.' });
  if (pc.happiness < 0.45 || pc.weariness > 0.1) items.push({ kind: 'mood', severity: 1, text: `${Them} people are unhappy (${Math.round(pc.happiness * 100)}%${pc.weariness > 0.1 ? ', war-weary' : ''}).`, plan: self ? 'Services, goods and peace keep people happy.' : 'A long war will sap them further.' });

  items.sort((a, b) => b.severity - a.severity);
  return {
    id: city.nextReportId = (city.nextReportId ?? 0) + 1,
    by,
    target,
    time: world.time,
    self,
    summary: { population: sumTiers(pc.population), gdp: Math.round(pc.lastGdp), credits: Math.round(pc.credits), net: Math.round(net), army: army.length, age: pc.age, happiness: pc.happiness },
    items,
  };
}

/** Buy a report: credits now, the report goes to `by` (latest per target kept). */
export function commissionReport(world: World, by: number, target: number): string | null {
  const why = reportProblem(world, by, target);
  if (why) return why;
  const city = world.city!;
  const price = reportPrice(world, by, target);
  const pc = city.players[by]!;
  pc.credits -= price;
  pc.year.military += price;
  const r = analyse(world, by, target);
  city.reports = (city.reports ?? []).filter((x) => !(x.by === by && x.target === target));
  city.reports.push(r);
  world.emit({ kind: 'notify', player: by, text: `🕵 ${by === target ? 'Report on your own weak points' : `Spy report on ${world.players[target]!.name}`} is ready (${r.items.length} findings): see 🕵 Intelligence` });
  return null;
}

export function latestReport(world: World, by: number, target: number): IntelReport | undefined {
  return world.city!.reports?.find((r) => r.by === by && r.target === target);
}

export function sabotageProblem(world: World, by: number, b: Building | undefined): string | null {
  if (!b || !b.complete || !b.city) return 'Nothing to sabotage';
  if (b.owner === by) return 'That is yours';
  const t = world.players[b.owner];
  if (!t || (t.role !== 'nation' && t.role !== 'human')) return 'Spies work on nations only';
  const r = latestReport(world, by, b.owner);
  if (!r || world.time - r.time > INTEL.reportLife) return `Needs a recent spy report on ${t.name}`;
  if ((b.city.sabotagedUntil ?? 0) > world.time) return 'Already out of action';
  if (world.city!.players[by]!.credits < INTEL.sabotageCost) return `Needs ₡${INTEL.sabotageCost}`;
  return null;
}

/** Covert sabotage: the building stops for half a year; the spies may be caught. */
export function sabotage(world: World, by: number, buildingId: number): string | null {
  const b = world.getBuilding(buildingId);
  const why = sabotageProblem(world, by, b);
  if (why) return why;
  const pc = world.city!.players[by]!;
  pc.credits -= INTEL.sabotageCost;
  pc.year.military += INTEL.sabotageCost;
  b!.city!.sabotagedUntil = world.time + INTEL.sabotageSeconds;
  const caught = world.rng.next() < INTEL.caughtChance;
  const victim = world.players[b!.owner]!;
  world.emit({ kind: 'notify', player: b!.owner, text: caught ? `💥 Saboteurs from ${world.players[by]!.name} wrecked your ${b!.def.name}: repairs take half a year` : `💥 An explosion wrecked your ${b!.def.name} (cause unknown): repairs take half a year`, x: b!.x, y: b!.y });
  world.emit({ kind: 'notify', player: by, text: caught ? `🕵 Sabotage of ${victim.name}'s ${b!.def.name} succeeded, but our agents were caught: ${victim.name} is furious` : `🕵 Sabotage of ${victim.name}'s ${b!.def.name} succeeded, undetected`, x: b!.x, y: b!.y });
  if (caught) {
    changeOpinion(world, b!.owner, by, INTEL.caughtOpinion);
    for (const p of world.players) if (p.id !== by && p.id !== b!.owner) changeOpinion(world, p.id, by, -5);
  }
  return null;
}

/** Is this building knocked out by sabotage right now? */
export function sabotaged(world: World, b: Building): boolean {
  return (b.city?.sabotagedUntil ?? 0) > world.time;
}

/** For the AI: is `by` at war with or hostile to `target`? */
export function hostile(world: World, by: number, target: number): boolean {
  return atWar(world, by, target);
}
