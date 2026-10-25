// War in the economy game (DESIGN.md §9): units are paid for in credits and
// goods, cost upkeep, and their number is limited by population. Wars are
// declared between players; a region changes hands when enemy troops hold its
// seat (town hall or regional office) with no defenders nearby.

import { AGES } from '../../data/ages.ts';
import { ARMY, CAPTURE, econTrainedAt, UNIT_ECON } from '../../data/city.ts';
import { sumTiers, YEAR_SECONDS, type GoodId } from '../../data/goods.ts';
import { UNITS, type UnitTypeId } from '../../data/units.ts';
import type { UnitDef } from '../../data/types.ts';
import { airfieldLoad } from '../transport.ts';
import { armyFactor } from './policies.ts';
import { MAX_QUEUE, type Building } from '../types.ts';
import type { World } from '../world.ts';
import { exploreRegion } from './economy.ts';
import { get } from './state.ts';

/** Is `a` at war with `b`? (economy game; in skirmish everyone else is an enemy) */
export function atWar(world: World, a: number, b: number): boolean {
  const war = world.city?.war;
  if (!war) return a !== b;
  return a !== b && (war[a]?.[b] ?? 0) === 1;
}

export function setWar(world: World, a: number, b: number, on: boolean): void {
  const war = world.city!.war;
  war[a]![b] = on ? 1 : 0;
  war[b]![a] = on ? 1 : 0;
  if (on) {
    const start = (world.city!.warStart ??= world.players.map(() => world.players.map(() => 0)));
    start[a]![b] = start[b]![a] = world.time;
  }
  // Any standing offers of peace between them are settled either way.
  const city = world.city!;
  if (city.peaceOffers?.length) city.peaceOffers = city.peaceOffers.filter((o) => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
}

/** Army size limit: grows with population. */
export function armyCap(world: World, player: number): number {
  const pc = world.city!.players[player]!;
  return Math.floor((ARMY.base + Math.floor(sumTiers(pc.population) / ARMY.perResidents)) * armyFactor(world, player).cap);
}

/** Why this unit can't be recruited here now, or null. */
export function recruitProblem(world: World, player: number, b: Building, type: UnitTypeId): string | null {
  const cost = UNIT_ECON[type];
  const def = UNITS[type];
  if (!cost || econTrainedAt(type) !== b.type) return 'Not trained here';
  if (b.owner !== player || !b.complete || !b.city) return 'Not ready';
  if (AGES[def.age].index > world.city!.players[player]!.age) return `Needs the ${AGES[def.age].name}`;
  if (b.city.workers <= 0) return 'No staff';
  if ((b.def.econ?.power ?? 0) > 0 && !b.city.powered) return 'No power';
  if (b.queue.length >= MAX_QUEUE) return 'Queue full';
  if ((def as UnitDef).fuel && b.def.dock && airfieldLoad(world, b) >= b.def.dock) return `Airfield full (${b.def.dock} planes)`;
  const limit = (def as UnitDef).limit;
  if (limit) {
    const have = world.units.filter((u) => u.owner === player && u.type === type).length + world.buildings.reduce((s, x) => s + (x.owner === player ? x.queue.filter((q) => q.kind === 'unit' && q.unit === type).length : 0), 0);
    if (have >= limit) return `At most ${limit}`;
  }
  const p = world.players[player]!;
  const queued = world.buildings.reduce((s, x) => s + (x.owner === player ? x.queue.filter((q) => q.kind === 'unit').reduce((t, q) => t + (q.kind === 'unit' ? UNITS[q.unit].pop : 0), 0) : 0), 0);
  if (p.popUsed + queued + def.pop > armyCap(world, player)) return `Army limit ${armyCap(world, player)} (grows with population)`;
  const price = Math.round(cost.credits * armyFactor(world, player).cost);
  if (world.city!.players[player]!.credits < price) return `Needs ₡${price}`;
  for (const [g, n] of Object.entries(cost.goods) as Array<[GoodId, number]>) {
    if (get(b.city.stock, g) < n) return `Needs ${n} ${g} here (trucks bring it)`;
  }
  return null;
}

export function recruit(world: World, player: number, b: Building, type: UnitTypeId): string | null {
  const why = recruitProblem(world, player, b, type);
  if (why) return why;
  const cost = UNIT_ECON[type]!;
  const pc = world.city!.players[player]!;
  const price = Math.round(cost.credits * armyFactor(world, player).cost);
  pc.credits -= price;
  pc.year.military += price;
  for (const [g, n] of Object.entries(cost.goods) as Array<[GoodId, number]>) b.city!.stock[g] = get(b.city!.stock, g) - n;
  b.queue.push({ kind: 'unit', unit: type, progress: 0, total: UNITS[type].trainTime });
  return null;
}

/** War weariness: grows while at war with a nation (full after WEARINESS.years), fades twice as fast in peace. */
export const WEARINESS = { max: 0.25, years: 2 } as const;

/**
 * Supply: land units far from their own seats and supply depots, outside their own land,
 * wear down (attrition); near them, out of combat, they mend.
 */
export const SUPPLY = { radius: 30, attrition: 0.004, heal: 0.01 } as const;

function updateSupply(world: World): void {
  const city = world.city!;
  const posts = world.buildings.filter((b) => b.complete && (b.type === 'town_hall' || b.type === 'regional_office' || b.type === 'supply_depot'));
  const r2 = SUPPLY.radius * SUPPLY.radius;
  const map = world.map;
  for (const u of world.units) {
    if (u.def.domain !== 'land' || u.carrier || u.def.builder) continue;
    const supplied = posts.some((b) => b.owner === u.owner && (b.x - u.x) * (b.x - u.x) + (b.y - u.y) * (b.y - u.y) <= r2);
    if (supplied) {
      // Mend when not fighting (no shot for 5 s).
      if (u.firedAgo > 75 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * SUPPLY.heal);
      continue;
    }
    const reg = map.region[Math.floor(u.y) * map.width + Math.floor(u.x)] ?? 0;
    if (city.regionOwner[reg] === u.owner) continue;
    u.hp -= u.maxHp * SUPPLY.attrition;
    if (u.hp <= 0) world.removeUnit(u, 'attrition', true);
  }
}

/** Debt at which unpaid units start to desert. */
export const DESERT_DEBT = -5000;

/** Once a second: unit upkeep, war weariness, supply, and seats being captured. */
export function updateMilitary(world: World): void {
  const city = world.city!;
  for (const p of world.players) {
    const pc = city.players[p.id]!;
    const war = world.players.some((o) => o.id !== p.id && o.role !== 'cityState' && !o.defeated && atWar(world, p.id, o.id));
    const step = WEARINESS.max / (WEARINESS.years * YEAR_SECONDS);
    pc.weariness = war ? Math.min(WEARINESS.max, pc.weariness + step) : Math.max(0, pc.weariness - 2 * step);
  }
  for (const u of world.units) {
    const cost = UNIT_ECON[u.type];
    if (!cost) continue;
    const pc = city.players[u.owner];
    if (!pc) continue;
    const up = cost.upkeep / YEAR_SECONDS;
    pc.credits -= up;
    pc.year.military += up;
  }
  // Unpaid soldiers desert: deep in debt, a unit a second walks away (the dearest first).
  for (const p of world.players) {
    const pc = city.players[p.id]!;
    if (pc.credits > DESERT_DEBT) continue;
    const mine = world.units.filter((u) => u.owner === p.id && UNIT_ECON[u.type]);
    if (!mine.length) continue;
    const u = mine.reduce((a, b) => (UNIT_ECON[b.type]!.upkeep > UNIT_ECON[a.type]!.upkeep || (UNIT_ECON[b.type]!.upkeep === UNIT_ECON[a.type]!.upkeep && b.id > a.id) ? b : a));
    world.removeUnit(u, 'deserted', true);
    if (world.tick % (15 * 30) < 15) world.emit({ kind: 'notify', player: p.id, text: `💸 Your soldiers go unpaid and desert: the treasury is ₡${Math.round(-pc.credits).toLocaleString('en')} in debt` });
  }
  for (const b of world.buildings) if (b.city?.stun) b.city.stun = Math.max(0, b.city.stun - 1);
  updateSupply(world);
  updateCapture(world);
}

/** Seats of power: lose one and its region goes to whoever took it. */
function isSeat(b: Building): boolean {
  return b.complete && (b.type === 'town_hall' || b.type === 'regional_office');
}

function updateCapture(world: World): void {
  for (const b of world.buildings) {
    if (!isSeat(b) || !b.city) continue;
    const c = b.city;
    let attacker = -1;
    // Infantry garrisoned in the seat defend it.
    let defenders = b.garrison.length;
    for (const u of world.units) {
      if (u.def.domain !== 'land' || u.carrier) continue;
      const dx = u.x - b.x;
      const dy = u.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) - Math.max(b.w, b.h) / 2;
      if (u.owner === b.owner && d <= CAPTURE.defenderRange) defenders++;
      else if (d <= CAPTURE.attackerRange && atWar(world, u.owner, b.owner) && (attacker < 0 || u.owner < attacker)) attacker = u.owner;
    }
    if (attacker >= 0 && defenders === 0) {
      if (c.captureBy !== attacker) {
        c.captureBy = attacker;
        c.capture = 0;
        world.emit({ kind: 'underAttack', player: b.owner, x: b.x, y: b.y });
        world.emit({ kind: 'notify', player: b.owner, text: `⚠ ${b.def.name} is being taken!`, x: b.x, y: b.y });
      }
      c.capture += 1 / CAPTURE.seconds;
      if (c.capture >= 1) captureRegion(world, b, attacker);
    } else if (c.capture > 0) {
      c.capture = Math.max(0, c.capture - 2 / CAPTURE.seconds);
      if (c.capture === 0) c.captureBy = -1;
    }
  }
}

/** What winning pays: share of the loser's treasury taken with a region (or its capital), and reparations at peace. */
export const WAR_SPOILS = { region: 0.2, capital: 0.4, reparations: 0.25, reparationsGdp: 0.5, weakerRatio: 0.7 } as const;

/**
 * Peace terms: the clearly weaker side (fewer troops, or fewer regions than it started the war
 * with) pays reparations to the stronger one.
 */
export function reparations(world: World, a: number, b: number): void {
  const city = world.city!;
  const army = (p: number) => world.units.filter((u) => u.owner === p && !u.def.builder).length;
  const [ia, ib] = [army(a), army(b)];
  let payer = -1;
  if (ia < ib * WAR_SPOILS.weakerRatio) payer = a;
  else if (ib < ia * WAR_SPOILS.weakerRatio) payer = b;
  if (payer < 0) return;
  const to = payer === a ? b : a;
  const pc = city.players[payer]!;
  const amount = Math.floor(Math.max(0, Math.min(pc.credits * WAR_SPOILS.reparations, 3000 + pc.lastGdp * WAR_SPOILS.reparationsGdp)));
  if (amount <= 0) return;
  pc.credits -= amount;
  city.players[to]!.credits += amount;
  city.players[to]!.year.trade += amount;
  world.emit({ kind: 'notify', player: payer, text: `🕊 Peace terms: you pay ₡${amount.toLocaleString('en')} in reparations to ${world.players[to]!.name}` });
  world.emit({ kind: 'notify', player: to, text: `🕊 Peace terms: ${world.players[payer]!.name} pays you ₡${amount.toLocaleString('en')} in reparations` });
}

/** A seat falls: its region, and everything built in it, changes hands. */
export function captureRegion(world: World, seat: Building, to: number): void {
  const city = world.city!;
  const from = seat.owner;
  const map = world.map;
  const reg = map.region[Math.floor(seat.y) * map.width + Math.floor(seat.x)]!;
  if (reg) {
    city.regionOwner[reg] = to;
    city.victory.conquered[to] = (city.victory.conquered[to] ?? 0) + 1;
  }
  // Spoils: a share of the loser's treasury (more for a capital).
  const loser = city.players[from]!;
  const winner = city.players[to]!;
  const loot = Math.floor(Math.max(0, loser.credits) * (seat.type === 'town_hall' ? WAR_SPOILS.capital : WAR_SPOILS.region));
  if (loot > 0) {
    loser.credits -= loot;
    winner.credits += loot;
    winner.year.trade += loot;
  }
  for (const b of world.buildings) {
    const r = map.region[Math.floor(b.y) * map.width + Math.floor(b.x)]!;
    if (b.owner === from && r === reg) {
      b.owner = to;
      b.queue = [];
      if (b.city) {
        b.city.capture = 0;
        b.city.captureBy = -1;
        // Conquered people are unhappy for a while.
        b.city.happiness = Math.min(b.city.happiness, 0.3);
      }
    }
  }
  for (const t of city.trucks) {
    const home = world.getBuilding(t.home);
    if (home) t.owner = home.owner;
  }
  exploreRegion(world, to, reg);
  const name = map.regions[reg - 1]?.name ?? 'A region';
  world.emit({ kind: 'notify', player: to, text: `⚔ ${name} taken, with its people and industry${loot ? `, and ₡${loot.toLocaleString('en')} in spoils` : ''}`, x: seat.x, y: seat.y });
  world.emit({ kind: 'notify', player: from, text: `⚔ ${name} has fallen to ${world.players[to]?.name ?? 'the enemy'}${loot ? ` (₡${loot.toLocaleString('en')} lost)` : ''}`, x: seat.x, y: seat.y });
  // No seat left: that player is out.
  if (!world.buildings.some((b) => b.owner === from && isSeat(b))) {
    world.players[from]!.defeated = true;
    world.emit({ kind: 'defeated', player: from, by: to });
    // The whole treasury goes to the victor.
    if (loser.credits > 0) {
      winner.credits += loser.credits;
      winner.year.trade += loser.credits;
      loser.credits = 0;
    }
    for (const b of world.buildings) if (b.owner === from) b.owner = to;
    for (let r = 0; r < city.regionOwner.length; r++) {
      if (city.regionOwner[r] !== from) continue;
      city.regionOwner[r] = to;
      city.victory.conquered[to] = (city.victory.conquered[to] ?? 0) + 1;
    }
    for (const u of [...world.units]) if (u.owner === from) world.removeUnit(u, 'surrendered', true);
    city.bots = city.bots.filter((bot) => bot.player !== from);
    world.emit({ kind: 'notify', player: -1, text: `${world.players[from]!.name} is no more` });
  }
  // Everyone notices aggression against city-states.
  if (world.players[from]?.role === 'cityState') {
    for (const p of world.players) {
      const rel = city.players[p.id]?.relations;
      if (rel && p.id !== from) rel.opinion[to] = Math.max(-100, (rel.opinion[to] ?? 0) - 20);
    }
  }
  for (const p of world.players) world.recomputePop(p);
}
