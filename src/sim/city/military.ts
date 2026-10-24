// War in the economy game (DESIGN.md §9): units are paid for in credits and
// goods, cost upkeep, and their number is limited by population. Wars are
// declared between players; a region changes hands when enemy troops hold its
// seat (town hall or regional office) with no defenders nearby.

import { AGES } from '../../data/ages.ts';
import { ARMY, CAPTURE, UNIT_ECON } from '../../data/city.ts';
import { sumTiers, YEAR_SECONDS, type GoodId } from '../../data/goods.ts';
import { UNITS, type UnitTypeId } from '../../data/units.ts';
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
}

/** Army size limit: grows with population. */
export function armyCap(world: World, player: number): number {
  const pc = world.city!.players[player]!;
  return ARMY.base + Math.floor(sumTiers(pc.population) / ARMY.perResidents);
}

/** Why this unit can't be recruited here now, or null. */
export function recruitProblem(world: World, player: number, b: Building, type: UnitTypeId): string | null {
  const cost = UNIT_ECON[type];
  const def = UNITS[type];
  if (!cost || def.trainedAt !== b.type) return 'Not trained here';
  if (b.owner !== player || !b.complete || !b.city) return 'Not ready';
  if (AGES[def.age].index > world.city!.players[player]!.age) return `Needs the ${AGES[def.age].name}`;
  if (b.city.workers <= 0) return 'No staff';
  if ((b.def.econ?.power ?? 0) > 0 && !b.city.powered) return 'No power';
  if (b.queue.length >= MAX_QUEUE) return 'Queue full';
  const p = world.players[player]!;
  const queued = world.buildings.reduce((s, x) => s + (x.owner === player ? x.queue.filter((q) => q.kind === 'unit').reduce((t, q) => t + (q.kind === 'unit' ? UNITS[q.unit].pop : 0), 0) : 0), 0);
  if (p.popUsed + queued + def.pop > armyCap(world, player)) return `Army limit ${armyCap(world, player)} (grows with population)`;
  if (world.city!.players[player]!.credits < cost.credits) return `Needs ₡${cost.credits}`;
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
  pc.credits -= cost.credits;
  pc.year.military += cost.credits;
  for (const [g, n] of Object.entries(cost.goods) as Array<[GoodId, number]>) b.city!.stock[g] = get(b.city!.stock, g) - n;
  b.queue.push({ kind: 'unit', unit: type, progress: 0, total: UNITS[type].trainTime });
  return null;
}

/** Once a second: unit upkeep, and seats being captured. */
export function updateMilitary(world: World): void {
  const city = world.city!;
  for (const u of world.units) {
    const cost = UNIT_ECON[u.type];
    if (!cost) continue;
    const pc = city.players[u.owner];
    if (!pc) continue;
    const up = cost.upkeep / YEAR_SECONDS;
    pc.credits -= up;
    pc.year.military += up;
  }
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

/** A seat falls: its region, and everything built in it, changes hands. */
export function captureRegion(world: World, seat: Building, to: number): void {
  const city = world.city!;
  const from = seat.owner;
  const map = world.map;
  const reg = map.region[Math.floor(seat.y) * map.width + Math.floor(seat.x)]!;
  if (reg) city.regionOwner[reg] = to;
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
  world.emit({ kind: 'notify', player: to, text: `⚔ ${name} taken`, x: seat.x, y: seat.y });
  world.emit({ kind: 'notify', player: from, text: `⚔ ${name} has fallen to ${world.players[to]?.name ?? 'the enemy'}`, x: seat.x, y: seat.y });
  // No seat left: that player is out.
  if (!world.buildings.some((b) => b.owner === from && isSeat(b))) {
    world.players[from]!.defeated = true;
    world.emit({ kind: 'defeated', player: from, by: to });
    for (const b of world.buildings) if (b.owner === from) b.owner = to;
    for (let r = 0; r < city.regionOwner.length; r++) if (city.regionOwner[r] === from) city.regionOwner[r] = to;
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
