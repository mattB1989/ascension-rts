// A scripted city builder. It plays the economy game through commands only, the
// same way a player does: lays out a street grid around the town hall, places
// buildings by a priority list driven by what is short, and connects distant
// farms, mines and wells with roads. Used by the balance tests now, and as the
// city manager of AI nations later (E5/E6).

import { BUILDINGS, buildingDef, type BuildingTypeId } from '../data/buildings.ts';
import { CONSUMPTION, MAX_AGE } from '../data/city.ts';
import { nextAge } from '../sim/city/ages.ts';
import { sumTiers, YEAR_SECONDS, type GoodId } from '../data/goods.ts';
import type { Command } from '../sim/commands.ts';
import { cityBuildProblem, cityPlacementProblem, landYield } from '../sim/city/place.ts';
import { roadProblem } from '../sim/city/roads.ts';
import { get } from '../sim/city/state.ts';
import type { Building, Unit } from '../sim/types.ts';
import type { UnitTypeId } from '../data/units.ts';
import { armyCap, atWar, recruitProblem } from '../sim/city/military.ts';
import { hasTreaty, opinionOf } from '../sim/city/treaties.ts';
import { spyStep } from './spies.ts';
import { DIPLO, marketOf, purchasePrice, relationsOf } from '../sim/city/diplomacy.ts';
import { roadsByOwner } from '../sim/city/economy.ts';
import { buyPrice } from '../sim/city/trade.ts';
import type { World } from '../sim/world.ts';

const BLOCK = 8; // street spacing

export interface BotState {
  player: number;
  /** Raw producers it could find no land for (it imports their goods instead). */
  noLand: string[];
  /** Game time of the next look at the trade rules. */
  tradeAt: number;
  /** Stop adding houses at this population (city-states stay small). */
  maxPop: number;
  /** Nations: expand into new regions and keep an army. */
  nation: boolean;
  /** Game time of the next attempt to expand (after one found nowhere to go), and attempts in a row that found nowhere. */
  expandAt?: number;
  expandFails?: number;
  /** Game time of the next check for streets cut off from the town hall. */
  linkAt?: number;
  /** Game time of the next look at the books when broke. */
  austerityAt?: number;
  /** Nations: their character (see PERSONALITIES). */
  personality?: Personality;
  /** Nations: game time of the next look at city-states (deals, unions, roads), and those out of road reach. */
  dealAt?: number;
  /** Nations: game time of the next look at embargoes. */
  embargoAt?: number;
  noRoadTo?: number[];
  /** Regions held when last looked (new land: try again what found no land before). */
  regions?: number;
  /** Buildings it tried to link back to the town hall's roads, and how often. */
  linkTries?: Array<[number, number]>;
  difficulty: Difficulty;
  /** Game time of the next military decision, and of the earliest war it may start. */
  warAt: number;
  /** Game time of the next offer of peace while too weak to fight. */
  peaceAt?: number;
  /** Current attack target (a seat building id), 0 when defending. */
  attackTarget: number;
  /** Grid rings laid out so far (round the town hall, and round each regional office: [office id, rings]). */
  rings: number;
  seatRings?: Array<[number, number]>;
  /** Seconds until the next decision. */
  wait: number;
  log: string[];
}

export type Difficulty = 'easy' | 'normal' | 'hard';

/** How each difficulty plays: decision pace, expansion, when it may go to war. */
export const DIFFICULTY: Record<Difficulty, { think: number; expandPop: number; warYear: number; warRatio: number; army: number }> = {
  easy: { think: 5, expandPop: 260, warYear: Infinity, warRatio: Infinity, army: 0.35 },
  normal: { think: 3, expandPop: 180, warYear: 14, warRatio: 1.6, army: 0.5 },
  hard: { think: 2, expandPop: 140, warYear: 9, warRatio: 1.2, army: 0.7 },
};

/** Nations' characters: they change how early they expand, how keen they are on war, how big an army they keep and how readily they sign treaties. */
export type Personality = 'trader' | 'builder' | 'expansionist' | 'warlike';
export const PERSONALITIES: Record<Personality, { name: string; blurb: string; expand: number; war: number; army: number; treaty: number }> = {
  trader: { name: 'Traders', blurb: 'courts city-states and signs treaties readily', expand: 1.2, war: 1.4, army: 0.8, treaty: -15 },
  builder: { name: 'Builders', blurb: 'grows its cities first, slow to fight', expand: 1.1, war: 1.6, army: 0.7, treaty: -5 },
  expansionist: { name: 'Expansionists', blurb: 'claims land early and often, and guards it', expand: 0.85, war: 1.1, army: 1.25, treaty: 0 },
  warlike: { name: 'Warlords', blurb: 'arms early and picks fights, city-states included', expand: 1.0, war: 0.8, army: 1.15, treaty: 15 },
};

function traits(bot: BotState) {
  return PERSONALITIES[bot.personality ?? 'builder'];
}

export function newBot(player: number, maxPop = Infinity, nation = false, difficulty: Difficulty = 'normal'): BotState {
  return { player, noLand: [], tradeAt: 0, maxPop, nation, difficulty, warAt: 0, attackTarget: 0, rings: 0, wait: 0, log: [] };
}

/** The seat the bot builds around: its town hall, or (if that has fallen) a regional office. */
function hall(world: World, player: number): Building | undefined {
  return world.buildings.find((b) => b.owner === player && b.type === 'town_hall') ?? world.buildings.find((b) => b.owner === player && b.type === 'regional_office' && b.complete);
}

function count(world: World, player: number, type: string): number {
  return world.buildings.filter((b) => b.owner === player && b.type === type).length;
}

/** Buildings that keep a town growing and its houses moving up a level (taxes come from people): never held back to save money. */
const ESSENTIAL = new Set<string>(['house', 'farm', 'food_plant', 'fishing_harbour', 'market', 'pumping_station', 'water_well', 'water_tower', 'police_station', 'logging_camp', 'sawmill', 'quarry', 'cement_works', 'oil_well', 'power_plant', 'hydro_plant', 'clinic', 'school']);

/** A finished building of this kind standing idle: another one would idle too. */
const IDLE = /^(Needs|No |Short of staff|Storage full)/;

/** Yearly balance as things stand now: last year's income and costs, with upkeep of everything built or being built since. */
function projectedNet(world: World, player: number): number {
  const pc = world.city!.players[player]!;
  const ly = pc.lastYear;
  let upkeep = 0;
  for (const b of world.buildings) if (b.owner === player && b.city && b.type !== 'house') upkeep += b.def.econ?.upkeep ?? 0;
  // Idle buildings cost less: never count less than what was actually paid.
  upkeep = Math.max(ly.upkeep, upkeep * 0.85);
  return ly.taxes + ly.trade - ly.imports - upkeep - ly.roads - ly.military;
}

/**
 * Nations: the largest army among rival nations that are at war (with us or anyone), hostile,
 * or armed without a peace pact with us. 0 when nobody looks dangerous.
 */
function threatOf(world: World, p: number): number {
  let worst = 0;
  const nations = world.players.filter((o) => !o.defeated && (o.role === 'nation' || o.role === 'human'));
  for (const o of nations) {
    if (o.id === p) continue;
    const theirs = armyOf(world, o.id).length;
    const fighting = atWar(world, p, o.id) || nations.some((x) => x.id !== o.id && atWar(world, o.id, x.id));
    const hostile = Math.min(opinionOf(world, p, o.id), opinionOf(world, o.id, p)) < -20;
    const armed = theirs >= 6 && !hasTreaty(world, p, o.id, 'peace');
    if (fighting || hostile || armed) worst = Math.max(worst, theirs, 4);
  }
  return worst;
}

function touchesRoad(world: World, tx: number, ty: number, w: number, h: number): boolean {
  const road = world.city!.road;
  const W = world.map.width;
  const H = world.map.height;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && road[y * W + x]! > 0;
  for (let x = tx; x < tx + w; x++) if (at(x, ty - 1) || at(x, ty + h)) return true;
  for (let y = ty; y < ty + h; y++) if (at(tx - 1, y) || at(tx + w, y)) return true;
  return false;
}

/** Nearest valid spot touching a road, searching outward from (cx, cy). */
function spotByRoad(world: World, player: number, type: BuildingTypeId, cx: number, cy: number, maxR = 50): [number, number] | null {
  const [w, h] = BUILDINGS[type].size;
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = Math.floor(cx) + dx;
        const ty = Math.floor(cy) + dy;
        if (!touchesRoad(world, tx, ty, w, h) || overlapsReserved(tx, ty, w, h)) continue;
        if (cityPlacementProblem(world, player, type, tx, ty) === null) return [tx, ty];
      }
    }
  }
  return null;
}

/** Lay one more ring of the street grid around the town hall (or, once that has no room left, around a regional office). */
function growGrid(world: World, bot: BotState): Command | null {
  const th = hall(world, bot.player);
  if (!th) return null;
  // The next ring with anything left to lay on our land (the starting street runs below the hall).
  while (bot.rings < 40) {
    const g = gridRing(world, bot, th.tx + 2, th.ty + 5, ++bot.rings);
    if (g) return g;
  }
  // The land round the hall is full: streets round the regional offices, the least built-up first.
  const rings = (bot.seatRings ??= []);
  const offices = world.buildings.filter((b) => b.owner === bot.player && b.type === 'regional_office' && b.complete && b !== th);
  offices.sort((a, b) => (rings.find((x) => x[0] === a.id)?.[1] ?? 0) - (rings.find((x) => x[0] === b.id)?.[1] ?? 0) || a.id - b.id);
  for (const o of offices) {
    let entry = rings.find((x) => x[0] === o.id);
    if (!entry) rings.push((entry = [o.id, 0]));
    while (entry[1] < 12) {
      const g = gridRing(world, bot, o.tx + 1, o.ty + 4, ++entry[1]);
      if (g) return g;
    }
  }
  return null;
}

function gridRing(world: World, bot: BotState, cx: number, cy: number, r: number): Command | null {
  const tiles: Array<[number, number]> = [];
  const span = r * BLOCK * 2;
  for (let k = -r; k <= r; k++) {
    for (let t = -span; t <= span; t++) {
      tiles.push([cx + t, cy + k * BLOCK]);
      tiles.push([cx + k * BLOCK * 2 - 1, cy + t]);
    }
  }
  // Only on our own land: nothing can be built beside streets on unclaimed land (and a town hemmed in would otherwise pave it ring after ring).
  const W = world.map.width;
  const ok = tiles.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < world.map.height && world.city!.regionOwner[world.map.nearRegion[y * W + x]!] === bot.player && ownRoadOk(world, bot.player, x, y));
  if (!ok.length) return null;
  bot.log.push(`grid ring ${r} at ${cx},${cy}: ${ok.length} tiles`);
  return { kind: 'road', player: bot.player, tiles: ok };
}

/** Best spot for a raw producer anywhere in our land, plus a road to it. */
function rawSpot(world: World, player: number, type: BuildingTypeId): { spot: [number, number]; road: Array<[number, number]> } | null {
  const def = buildingDef(type);
  const th = hall(world, player)!;
  const map = world.map;
  let best: [number, number] | null = null;
  let bestScore = -Infinity;
  for (let ty = 1; ty < map.height - def.size[1]; ty += 2) {
    for (let tx = 1; tx < map.width - def.size[0]; tx += 2) {
      const reg = map.region[ty * map.width + tx]!;
      if (!reg || world.city!.regionOwner[reg] !== player) continue;
      const { yield: y } = landYield(map, def, tx, ty);
      if (y < 0.5) continue;
      const d = Math.sqrt((tx - th.x) * (tx - th.x) + (ty - th.y) * (ty - th.y));
      const score = y - d / 120;
      if (score <= bestScore) continue;
      if (cityPlacementProblem(world, player, type, tx, ty) !== null) continue;
      best = [tx, ty];
      bestScore = score;
    }
  }
  if (!best) return null;
  if (touchesRoad(world, best[0], best[1], def.size[0], def.size[1])) return { spot: best, road: [] };
  const road = roadTo(world, player, best[0], best[1] + def.size[1], best, def.size);
  return road ? { spot: best, road } : null;
}

/** A road the bot may lay for its own town: allowed, and on its own or unclaimed land (not through city-states). */
function ownRoadOk(world: World, player: number, x: number, y: number): boolean {
  if (roadProblem(world, player, x, y) !== null) return false;
  const owner = world.city!.regionOwner[world.map.nearRegion[y * world.map.width + x]!] ?? -1;
  return owner === player || owner === -1;
}

/** Breadth-first search for a road from just below a footprint to the nearest existing road. */
function roadTo(world: World, player: number, sx: number, sy: number, spot: [number, number], size: readonly [number, number]): Array<[number, number]> | null {
  const map = world.map;
  const W = map.width;
  const city = world.city!;
  const inFoot = (x: number, y: number) => x >= spot[0] && x < spot[0] + size[0] && y >= spot[1] && y < spot[1] + size[1];
  const start = sy * W + sx;
  if (!city.road[start] && !ownRoadOk(world, player, sx, sy)) return null;
  // Join our own road network (the one the town hall is on), not a neighbour's.
  const th = hall(world, player);
  const home = th?.city && th.city.access >= 0 ? city.comp[th.city.access]! : -1;
  // Scratch arrays shared between searches (a stamp marks this search's visits).
  const n = W * map.height;
  if (!search || search.prev.length !== n) search = { prev: new Int32Array(n), stamp: new Int32Array(n), queue: new Int32Array(40001), run: 0 };
  const s = search;
  s.run++;
  const queue = s.queue;
  let tail = 0;
  queue[tail++] = start;
  s.stamp[start] = s.run;
  s.prev[start] = -1;
  for (let q = 0; q < tail; q++) {
    const i = queue[q]!;
    const x = i % W;
    const y = (i - x) / W;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height || inFoot(nx, ny)) continue;
      const j = ny * W + nx;
      if (s.stamp[j] === s.run) continue;
      s.stamp[j] = s.run;
      s.prev[j] = i;
      if (city.road[j] && (home < 0 || city.comp[j] === home)) {
        const path: Array<[number, number]> = [];
        for (let m = i; m >= 0; m = s.prev[m]!) path.push([m % W, Math.floor(m / W)]);
        return path.reverse();
      }
      if (tail < queue.length && (city.road[j] || ownRoadOk(world, player, nx, ny))) queue[tail++] = j;
    }
  }
  return null;
}

let search: { prev: Int32Array; stamp: Int32Array; queue: Int32Array; run: number } | null = null;

/**
 * A long road from a road tile (e.g. a city-state's town hall) to our own network, searched
 * towards (tx, ty) first (best-first on distance travelled plus distance left).
 */
export function longRoad(world: World, player: number, start: number, tx: number, ty: number, limit = 120000, block?: [number, number, number, number]): Array<[number, number]> | null {
  const map = world.map;
  const W = map.width;
  const city = world.city!;
  const th = hall(world, player);
  const home = th?.city && th.city.access >= 0 ? city.comp[th.city.access]! : -1;
  if (home < 0) return null;
  const n = W * map.height;
  if (!search || search.prev.length !== n) search = { prev: new Int32Array(n), stamp: new Int32Array(n), queue: new Int32Array(40001), run: 0 };
  const s = search;
  s.run++;
  // Bucket queue on f = steps + manhattan distance left.
  const buckets: number[][] = [];
  const g = new Map<number, number>();
  const h = (i: number) => Math.abs((i % W) - tx) + Math.abs(Math.floor(i / W) - ty);
  const push = (i: number, cost: number) => {
    const f = cost + h(i);
    (buckets[f] ??= []).push(i);
  };
  s.stamp[start] = s.run;
  s.prev[start] = -1;
  g.set(start, 0);
  push(start, 0);
  let expanded = 0;
  for (let f = 0; f < buckets.length && expanded < limit; f++) {
    const b = buckets[f];
    if (!b) continue;
    while (b.length && expanded < limit) {
      const i = b.pop()!;
      expanded++;
      const cost = g.get(i)!;
      const x = i % W;
      const y = (i - x) / W;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
        const j = ny * W + nx;
        if (s.stamp[j] === s.run) continue;
        if (block && nx >= block[0] && nx < block[0] + block[2] && ny >= block[1] && ny < block[1] + block[3]) continue;
        if (!city.road[j] && roadProblem(world, player, nx, ny) !== null) continue;
        s.stamp[j] = s.run;
        s.prev[j] = i;
        if (city.road[j] && city.comp[j] === home) {
          const path: Array<[number, number]> = [];
          for (let m = i; m >= 0; m = s.prev[m]!) path.push([m % W, Math.floor(m / W)]);
          return path.reverse();
        }
        g.set(j, cost + 1);
        push(j, cost + 1);
      }
    }
  }
  return null;
}

/** Footprints promised by commands not yet executed (several houses in one decision). */
let reserved: Array<[number, number, number, number]> = [];

function overlapsReserved(tx: number, ty: number, w: number, h: number): boolean {
  return reserved.some(([x, y, rw, rh]) => tx < x + rw && x < tx + w && ty < y + rh && y < ty + h);
}

/** Middle of our houses (services go there). */
function houseCentre(world: World, player: number): [number, number] | undefined {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const b of world.buildings) {
    if (b.owner !== player || b.type !== 'house') continue;
    x += b.x;
    y += b.y;
    n++;
  }
  return n ? [x / n, y / n] : undefined;
}

function place(world: World, bot: BotState, type: BuildingTypeId, near?: [number, number]): Command[] {
  if (cityBuildProblem(world, bot.player, type)) return [];
  const def = buildingDef(type);
  if (def.placement !== 'land') {
    const r = rawSpot(world, bot.player, type);
    if (!r) {
      if (!bot.noLand.includes(type)) bot.noLand.push(type);
      return [];
    }
    bot.log.push(`${type} at ${r.spot} (${r.road.length} road)`);
    const out: Command[] = [];
    if (r.road.length) out.push({ kind: 'road', player: bot.player, tiles: r.road });
    out.push({ kind: 'place', player: bot.player, building: type, tx: r.spot[0], ty: r.spot[1] });
    return out;
  }
  const th = hall(world, bot.player)!;
  const [cx, cy] = near ?? [th.x, th.y];
  let spot = spotByRoad(world, bot.player, type, cx, cy, Math.min(100, 14 + bot.rings * BLOCK));
  // No room round the hall: by the streets round a regional office.
  for (const [id, r] of bot.seatRings ?? []) {
    if (spot) break;
    const o = world.getBuilding(id);
    if (o && o.owner === bot.player) spot = spotByRoad(world, bot.player, type, o.x, o.y, 14 + r * BLOCK);
  }
  if (!spot) {
    const g = growGrid(world, bot);
    return g ? [g] : [];
  }
  bot.log.push(`${type} at ${spot}`);
  reserved.push([spot[0], spot[1], def.size[0], def.size[1]]);
  return [{ kind: 'place', player: bot.player, building: type, tx: spot[0], ty: spot[1] }];
}

/** Decide what to do this second. Returns commands to issue. */
export function botStep(world: World, bot: BotState): Command[] {
  if (world.tick % 15 !== 0) return [];
  if (world.players[bot.player]?.defeated || !hall(world, bot.player)) return [];
  if (--bot.wait > 0) return [];
  bot.wait = bot.nation ? DIFFICULTY[bot.difficulty].think : 3;
  reserved = [];
  // A new age as soon as it is ready (nations and the scripted player; city-states stay as they are).
  if (bot.maxPop === Infinity && nextAge(world, bot.player)?.ready) return [{ kind: 'advanceAge', player: bot.player }];
  if (bot.nation) {
    const e = embargoStep(world, bot);
    if (e.length) return e;
    const sp = spyStep(world, bot);
    if (sp.length) return sp;
    const m = militaryStep(world, bot);
    // Claiming land, or going to war, is a decision of its own; orders to troops, recruits and offers of peace
    // go with the town's business (a war must not stop the economy: an army marching every turn would).
    if (m.some((c) => c.kind === 'place' || c.kind === 'road' || c.kind === 'declareWar')) return m;
    return [...m, ...townStep(world, bot)];
  }
  return townStep(world, bot);
}

/** The town's business: streets, the books, trade, and what to build next. */
function townStep(world: World, bot: BotState): Command[] {
  const p = bot.player;
  const pc = world.city!.players[p]!;
  if (bot.rings === 0) {
    const g = growGrid(world, bot);
    return g ? [g] : [];
  }
  // New land (expanded, or won in a war): look again for what found no land before.
  const regions = world.city!.regionOwner.reduce((s, o) => s + (o === p ? 1 : 0), 0);
  if (regions !== (bot.regions ?? regions)) {
    bot.noLand = [];
    bot.noRoadTo = [];
    // Streets go only on our own land: lay the rings again over what is ours now.
    bot.rings = Math.min(bot.rings, 1);
  }
  bot.regions = regions;
  // Streets that ended up cut off from the town hall's network: join them up (a few tries each).
  if (world.time >= (bot.linkAt ?? 0)) {
    bot.linkAt = world.time + 30;
    const th = hall(world, p);
    const home = th?.city && th.city.access >= 0 ? world.city!.comp[th.city.access]! : 0;
    const tries = (bot.linkTries ??= []);
    const cut = home ? world.buildings.find((b) => b.owner === p && b.city && b.city.access >= 0 && b.city.comp !== home && (tries.find((t) => t[0] === b.id)?.[1] ?? 0) < 3) : undefined;
    if (cut) {
      const a = cut.city!.access;
      const W = world.map.width;
      const road = roadTo(world, p, a % W, Math.floor(a / W), [-10, -10], [0, 0]);
      const t = tries.find((x) => x[0] === cut.id);
      if (t) t[1]++;
      else tries.push([cut.id, 1]);
      if (tries.length > 40) tries.shift();
      if (road && road.length > 1) {
        bot.log.push(`link ${cut.type} (${road.length} road)`);
        return [{ kind: 'road', player: p, tiles: road }];
      }
    }
  }
  const pending = world.buildings.filter((b) => b.owner === p && !b.complete && b.type !== 'house').length;
  const busy = pending >= 3 + count(world, p, 'construction_office') * 2;
  const has = (t: string) => count(world, p, t);
  const pop = sumTiers(pc.population);
  const houses = world.buildings.filter((b) => b.owner === p && b.type === 'house');
  const room = houses.reduce((s, h) => s + (h.city!.level < 3 ? [8, 16, 24, 40][h.city!.level]! - h.city!.residents : 0), 0);
  const freeJobs = sumTiers(pc.jobs) - sumTiers(pc.employed);
  const credits = pc.credits;
  const made = (g: GoodId) => get(pc.made, g);
  const used = (g: GoodId) => get(pc.used, g);
  const stock = (g: GoodId) => world.buildings.filter((b) => b.owner === p && b.city).reduce((s, b) => s + get(b.city!.stock, g), 0);

  // Out of money and losing more each year: raise taxes (not so far that people leave), then close what costs most and does least.
  const ly = pc.lastYear;
  const net = ly.taxes + ly.trade - ly.imports - ly.upkeep - ly.roads - ly.military;
  const threat = bot.nation ? threatOf(world, p) : 0;
  if (bot.maxPop === Infinity && world.time >= (bot.austerityAt ?? 0)) {
    if (credits < 300 && net < 0) {
      bot.austerityAt = world.time + 60;
      if (pc.taxRate < 1.15) return [{ kind: 'taxRate', player: p, rate: 1.15 }];
      if (pc.taxRate < 1.3 && pc.happiness >= 0.55) return [{ kind: 'taxRate', player: p, rate: 1.3 }];
      const keepBarracks = threat > 0 && count(world, p, 'barracks') <= 1;
      const idle = world.buildings
        .filter((b) => b.owner === p && b.complete && b.city && ['coast_guard', 'barracks', 'supply_depot', 'maintenance_depot', 'vehicle_factory', 'warehouse'].includes(b.type) && !(keepBarracks && b.type === 'barracks'))
        .sort((a, b) => (b.def.econ?.upkeep ?? 0) - (a.def.econ?.upkeep ?? 0) || a.id - b.id);
      if (idle.length) {
        bot.log.push(`close ${idle[0]!.type} (broke)`);
        return [{ kind: 'demolish', player: p, building: idle[0]!.id }];
      }
    } else if (credits > 4000 && pc.taxRate > 1) {
      bot.austerityAt = world.time + 60;
      return [{ kind: 'taxRate', player: p, rate: pc.taxRate > 1.15 ? 1.15 : 1 }];
    }
  }

  // Nations court city-states: trade with them by road, accept their requests to join, buy friends.
  if (bot.nation) {
    const d = nationDiplomacy(world, bot, stock);
    if (d.length) return d;
  }


  // Trade: once there is a port, buy what the land can't give and sell surpluses.
  if (has('trade_port') && world.time >= bot.tradeAt) {
    bot.tradeAt = world.time + 30;
    const missing: Partial<Record<string, GoodId>> = { oil_well: 'oil', quarry: 'concrete', iron_mine: 'steel', logging_camp: 'lumber', rare_earth_mine: 'rare', uranium_mine: 'uranium', farm: 'food' };
    // Stockpiling imports only with money to spare: ships buy whatever the rule asks for, down to the last credit.
    const flush = credits > 3000;
    const rules: Array<[GoodId, number, number]> = [['steel', flush ? 60 : 0, -1], ['concrete', flush ? 40 : 0, -1], ['crops', 0, 150], ['timber', 0, 150], ['stone', 0, 150], ['food', 0, 250], ['lumber', 0, 200]];
    // What the town can't do without (power, materials for its sites, what its land lacks) is bought first, even when money is short.
    const critical = new Set<GoodId>();
    for (const t of bot.noLand) {
      const g = missing[t];
      if (g) {
        critical.add(g);
        const r = rules.find((x) => x[0] === g);
        if (r) r[1] = 80;
        else rules.push([g, 80, -1]);
      }
    }
    // Power plants short of oil: buy it in.
    if (pc.powerDemand > pc.powerSupply - 2 && has('power_plant') > 0) {
      critical.add('oil');
      const r = rules.find((x) => x[0] === 'oil');
      if (r) r[1] = Math.max(r[1], 120);
      else rules.push(['oil', 120, -1]);
    }
    // Factories idle for want of an input, while there is money: buy it in.
    if (credits > 5000) {
      const short = new Set<GoodId>();
      for (const b of world.buildings) {
        const rec = b.def.econ?.recipe;
        if (b.owner !== p || !b.complete || !rec || !b.city!.status.startsWith('Needs')) continue;
        for (const [g, n] of Object.entries(rec.in) as Array<[GoodId, number]>) if (get(b.city!.stock, g) < n && stock(g) < 20) short.add(g);
      }
      for (const g of short) {
        const r = rules.find((x) => x[0] === g);
        if (r) {
          r[1] = Math.max(r[1], 60);
          r[2] = -1;
        } else rules.push([g, 60, -1]);
      }
    }
    // Sites stuck waiting for materials while there is money: buy them in.
    if (credits > 800) {
      for (const g of ['lumber', 'concrete', 'steel'] as const) {
        const short = world.buildings.filter((b) => b.owner === p && !b.complete && b.city).reduce((s, b) => s + Math.max(0, (b.def.econ?.materials[g] ?? 0) - get(b.city!.delivered, g) - get(b.city!.incoming, g)), 0);
        if (short <= 0 || stock(g) >= short) continue;
        critical.add(g);
        const want = Math.min(400, Math.ceil((short + 40) / 20) * 20);
        const r = rules.find((x) => x[0] === g);
        if (r) {
          r[1] = Math.max(r[1], want);
          r[2] = -1;
        } else rules.push([g, want, -1]);
      }
    }
    // Never let ships spend the treasury down to nothing (they buy what a rule asks for while there is a credit left):
    // what is bought beyond the stock in hand fits in a purse, the essentials first.
    let spent = 0;
    // Oil for power first (no power, no houses past a cottage), then the rest in order.
    const order = [...rules].sort((a, b) => (a[0] === 'oil' ? 0 : 1) - (b[0] === 'oil' ? 0 : 1));
    for (const [crit, purse] of [[true, Math.max(0, credits - 400) * 0.7], [false, Math.max(0, credits - 1500) * 0.5]] as const) {
      for (const r of order) {
        if (r[1] <= 0 || critical.has(r[0]) !== crit) continue;
        const have = get(pc.stockpile, r[0]);
        const price = buyPrice(world, r[0]);
        const can = Math.floor(Math.max(0, purse - spent) / price);
        const imp = Math.max(0, Math.min(r[1], Math.floor((have + can) / 20) * 20));
        spent += Math.max(0, imp - have) * price;
        r[1] = imp;
      }
    }
    // Stop buying what no rule asks for any more (an old shortage, or money gone).
    for (const g of Object.keys(pc.trade) as GoodId[]) {
      const r = pc.trade[g];
      if (r && r.import > 0 && !rules.some((x) => x[0] === g)) rules.push([g, 0, r.export]);
    }
    const changed = rules.filter(([g, imp, exp]) => pc.trade[g]?.import !== imp || pc.trade[g]?.export !== exp);
    if (changed.length) return changed.map(([good, imp, exp]) => ({ kind: 'tradeRule', player: p, good, import: imp, export: exp }));
  }

  const mine = world.buildings.filter((b) => b.owner === p && b.city);
  const idleAs = (type: string, re: RegExp) => mine.some((b) => b.type === type && b.complete && re.test(b.city!.status));
  const cropsShort = idleAs('food_plant', /Needs crops/);
  const timberShort = idleAs('sawmill', /Needs timber/);
  const waitingFor = (g: GoodId) => mine.filter((b) => !b.complete && b.type !== 'house' && new RegExp(`Waiting for .*${g}`).test(b.city!.status)).length;
  const foodNeed = (pop * CONSUMPTION.food * 60) / YEAR_SECONDS;
  const projNet = projectedNet(world, p);
  const powerShort = pc.powerDemand > pc.powerSupply - 5;
  const workforce = sumTiers(pc.workforce);
  const jobless = workforce - sumTiers(pc.employed);
  const techJobless = workforce - pc.workforce[0] - (sumTiers(pc.employed) - pc.employed[0]) > 8;
  const crewsShort = mine.filter((b) => !b.complete && b.type !== 'house' && b.city!.status === 'Waiting for a crew').length >= 2 && has('construction_office') < 1 + Math.floor(pop / 500);
  const wantJobs = bot.maxPop === Infinity && pop >= 100 && freeJobs < 6 && (jobless > Math.max(10, workforce * 0.1) || (room < 20 && credits > 6000));
  // Nations save up to expand when it is time, as long as the savings come within reach in a couple of years (else it would wait for ever).
  const saving = bot.nation && pop >= expandPop(world, bot) && credits < 5500 && credits + 2 * projNet >= 5500 && world.time >= (bot.expandAt ?? 0);
  const keepForOffice = landStarved(world, bot);

  // Order matters: the first thing that applies is done.
  const wants: Array<[boolean, BuildingTypeId]> = [
    [!has('logging_camp'), 'logging_camp'],
    [!has('sawmill') && !bot.noLand.includes('logging_camp'), 'sawmill'],
    [!has('trade_port') && bot.noLand.length > 0, 'trade_port'],
    // Sites stuck for want of steel or concrete: a port buys them in.
    [!has('trade_port') && !bot.noLand.includes('trade_port') && world.buildings.some((b) => b.owner === p && !b.complete && /Waiting for .*(steel|concrete)/.test(b.city?.status ?? '')) && stock('steel') < 10, 'trade_port'],
    [credits > 150 && (room < 6 ? freeJobs > 4 || pop < 30 : freeJobs > room * 0.5 + 4), 'house'],
    [!has('farm') && pop >= 12, 'farm'],
    [!has('food_plant') && pop >= 12 && (!bot.noLand.includes('farm') || has('farm') > 0), 'food_plant'],
    [!has('market') && pop >= 16, 'market'],
    [!has('pumping_station') && pop >= 30, 'pumping_station'],
    [!has('water_tower') && has('pumping_station') > 0, 'water_tower'],
    // No river or lake: wells.
    [bot.noLand.includes('pumping_station') && has('water_well') * 180 < pop + 40 && pop >= 30, 'water_well'],
    [!has('water_tower') && has('water_well') > 0, 'water_tower'],
    // Terraces (twice the taxes) need police: early, it is cheap.
    [!has('police_station') && pop >= 60, 'police_station'],
    // Short of power: houses are the last to get it, and without it none grows past a cottage.
    // Each plant burns about two thirds of a well's oil (a port can buy the rest).
    [powerShort && has('power_plant') > 0 && has('oil_well') * 1.5 < has('power_plant') + 1 && !bot.noLand.includes('oil_well'), 'oil_well'],
    [powerShort && has('power_plant') > 0 && (has('oil_well') * 1.5 >= has('power_plant') + 1 || has('trade_port') > 0), 'power_plant'],
    // Sites waiting for a construction crew: more crews.
    [crewsShort, 'construction_office'],
    // A rival under arms or at war: a barracks for a home guard.
    [bot.nation && threat > 0 && !has('barracks') && pop >= 60 && credits > 1500, 'barracks'],
    [!has('quarry') && pop >= 30, 'quarry'],
    [!has('trade_port') && pop >= 100, 'trade_port'],
    [has('trade_port') > 0 && !has('coast_guard') && world.time >= 5 * YEAR_SECONDS && credits > 3000, 'coast_guard'],
    [!has('oil_well') && pop >= 40, 'oil_well'],
    [!has('power_plant') && (has('oil_well') > 0 || bot.noLand.includes('oil_well')), 'power_plant'],
    [!has('hydro_plant') && pop >= 60 && bot.noLand.includes('oil_well'), 'hydro_plant'],
    [has('hydro_plant') < 2 && pop >= 200 && pc.powerDemand > pc.powerSupply - 5 && !bot.noLand.includes('hydro_plant'), 'hydro_plant'],
    [!has('cement_works') && has('power_plant') > 0, 'cement_works'],
    [!has('warehouse') && pop >= 50, 'warehouse'],
    [!has('construction_office') && pop >= 60, 'construction_office'],
    // Food for everyone (what markets sell is capped by what is made, so go by mouths to feed).
    [pop >= 40 && has('farm') < 10 + regions * 4 && (cropsShort || (made('food') < foodNeed * 1.3 && has('farm') < has('food_plant') * 1.3)), 'farm'],
    [!cropsShort && made('food') < Math.max(used('food'), foodNeed) * 1.2 && (has('farm') >= has('food_plant') * 1.3 || stock('crops') > 40), 'food_plant'],
    // No more farmland: fish.
    [bot.noLand.includes('farm') && has('fishing_harbour') < 4 && made('food') < used('food') * 1.2 && !bot.noLand.includes('fishing_harbour'), 'fishing_harbour'],
    // Lumber goes into building sites (not counted as used): go by sites waiting for it, and sawmills short of timber.
    [has('logging_camp') < 6 && stock('lumber') < 60 && (made('lumber') < used('lumber') + 6 || waitingFor('lumber') >= 2 || (timberShort && has('logging_camp') < has('sawmill') * 2)), 'logging_camp'],
    [has('logging_camp') > has('sawmill') * 1.5, 'sawmill'],
    [stock('concrete') < 30 && has('cement_works') > 0 && has('quarry') <= has('cement_works'), 'quarry'],
    [stock('concrete') < 30 && waitingFor('concrete') >= 2 && stock('stone') > 60 && has('cement_works') > 0 && has('cement_works') < 3, 'cement_works'],
    [!has('iron_mine') && pop >= 80, 'iron_mine'],
    [!has('steel_mill') && has('iron_mine') > 0, 'steel_mill'],
    [!has('oil_refinery') && (has('steel_mill') > 0 || bot.noLand.includes('iron_mine')) && pop >= 120 && (pc.population[1] >= 15 || pop >= 250), 'oil_refinery'],
    [!has('goods_factory') && has('oil_refinery') > 0 && pc.population[1] >= 20, 'goods_factory'],
    // Research towards the next age once there are technicians to staff it.
    [pc.age < MAX_AGE && !has('research_institute') && pc.population[1] >= 120 && bot.maxPop === Infinity && credits > 4500, 'research_institute'],
    // Work for those out of it (settlers only come while there is), or for growth when all is quiet and money piles up:
    // the most useful employer first. Even one making what nobody needs pays for itself in the taxes of those it brings.
    [wantJobs && techJobless && pc.age < MAX_AGE && bot.maxPop === Infinity && has('research_institute') < 1 + Math.floor(pc.population[1] / 500) && pc.population[1] >= 60, 'research_institute'],
    [wantJobs && techJobless && has('oil_refinery') > 0 && has('goods_factory') < 2 + regions && stock('goods') < 80, 'goods_factory'],
    [wantJobs && made('food') < foodNeed * 1.6 && has('farm') < 10 + regions * 4 && (cropsShort || has('farm') < has('food_plant') * 1.3), 'farm'],
    [wantJobs && made('food') < foodNeed * 1.6 && !cropsShort && stock('crops') > 30, 'food_plant'],
    [wantJobs && has('warehouse') < regions + Math.floor(pop / 500), 'warehouse'],
    [wantJobs && has('construction_office') < 1 + Math.floor(pop / 700), 'construction_office'],
    [wantJobs && stock('concrete') < 120 && has('quarry') < 2 + regions, 'quarry'],
    [wantJobs && stock('stone') > 40 && stock('concrete') < 150 && has('cement_works') < 1 + regions, 'cement_works'],
    [wantJobs && stock('ore') < 60 && stock('steel') < 120 && has('iron_mine') < regions, 'iron_mine'],
    [wantJobs && stock('ore') > 20 && has('steel_mill') < has('iron_mine'), 'steel_mill'],
    [wantJobs && stock('oil') < 120 && has('oil_well') < 2 + regions, 'oil_well'],
    [wantJobs && has('oil_refinery') > 0 && has('oil_refinery') < 1 + regions && stock('plastics') < 60 && stock('oil') > 40, 'oil_refinery'],
    [wantJobs && has('fishing_harbour') < 1 + regions && !bot.noLand.includes('fishing_harbour'), 'fishing_harbour'],
    [wantJobs && stock('timber') < 120 && has('logging_camp') < 4 + regions * 3, 'logging_camp'],
    [wantJobs && has('market') < 1 + Math.floor(pop / 250), 'market'],
    [has('goods_factory') > 0 && has('goods_factory') < 4 && made('goods') < used('goods') * 1.1 + 2 && stock('goods') < 40, 'goods_factory'],
    [has('oil_refinery') > 0 && has('oil_refinery') < has('goods_factory') + has('electronics_plant') && stock('plastics') < 30, 'oil_refinery'],
    [has('market') * 400 < pop, 'market'],
    [has('water_tower') * 350 < pop && has('pumping_station') + has('water_well') > 0, 'water_tower'],
    [has('pumping_station') * 550 < pop, 'pumping_station'],
    [has('police_station') * 550 < pop && pop >= 60, 'police_station'],
    [!has('clinic') && pc.population[1] >= 30, 'clinic'],
    [bot.nation && !has('barracks') && pop >= 120, 'barracks'],
    [bot.nation && !has('vehicle_factory') && has('barracks') > 0 && pop >= 300 && has('oil_refinery') > 0, 'vehicle_factory'],
    [has('maintenance_depot') * 300 < roadsByOwner(world)[p]! && roadsByOwner(world)[p]! > 150, 'maintenance_depot'],
    // Towards the Digital age, and what it brings.
    [pc.age >= 1 && !has('data_exchange'), 'data_exchange'],
    [pc.age >= 1 && !has('electronics_plant') && has('oil_refinery') > 0, 'electronics_plant'],
    [pc.age >= 1 && !has('rare_earth_mine') && has('electronics_plant') > 0, 'rare_earth_mine'],
    [pc.age >= 1 && !has('pharma_plant') && pc.population[2] >= 20, 'pharma_plant'],
    [pc.age >= 1 && !has('hospital') && has('pharma_plant') > 0, 'hospital'],
    [pc.age >= 1 && !has('uranium_mine') && pc.population[2] >= 30, 'uranium_mine'],
    [pc.age >= 1 && pc.powerDemand > pc.powerSupply - 20 && !has('nuclear_plant') && pc.population[2] >= 30 && (has('uranium_mine') > 0 || bot.noLand.includes('uranium_mine')), 'nuclear_plant'],
    // Towards the Nano age.
    [pc.age >= 1 && pc.age < MAX_AGE && has('research_institute') < 2 && pc.population[1] >= 300 && bot.maxPop === Infinity, 'research_institute'],
    [pc.age >= 1 && !has('university') && pc.population[2] >= 40, 'university'],
    [pc.age >= 2 && !has('nano_fab') && pc.population[3] >= 10, 'nano_fab'],
    [pc.age >= 2 && !has('robotics_plant') && has('nano_fab') > 0, 'robotics_plant'],
    [pc.age >= 2 && pc.powerDemand > pc.powerSupply - 30 && !has('fusion_plant') && pc.population[3] >= 20, 'fusion_plant'],
    // The Space age, and the Space Elevator to win.
    [pc.age >= 2 && pc.age < MAX_AGE && has('university') < 2 && pc.population[2] >= 150, 'university'],
    [pc.age >= 3 && !has('launch_site') && pc.population[3] >= 40, 'launch_site'],
    [pc.age >= 3 && pc.powerDemand > pc.powerSupply - 50 && !has('orbital_relay') && has('launch_site') > 0, 'orbital_relay'],
    [pc.age >= 3 && !has('space_elevator') && has('launch_site') > 0 && credits > 160000, 'space_elevator'],
    [bot.nation && pc.age >= 2 && !has('shield_generator') && pop >= 800, 'shield_generator'],
    [bot.nation && has('barracks') > 0 && !has('supply_depot') && world.players.some((o) => o.id !== p && atWar(world, p, o.id)), 'supply_depot'],
    [bot.nation && pc.age >= 1 && !has('mech_foundry') && pop >= 600 && has('vehicle_factory') > 0, 'mech_foundry'],
    [bot.nation && pc.age >= 1 && !has('airfield') && pop >= 900 && has('mech_foundry') > 0, 'airfield'],
    [!has('school') && pc.population[1] >= 30, 'school'],
  ];
  const services = new Set<string>(['market', 'water_tower', 'police_station', 'clinic', 'school', 'data_exchange', 'hospital', 'university']);
  const centre = houseCentre(world, p);

  // Coverage: wherever houses lack a service the town already has, add one among them.
  if (!busy) {
    const kinds: Array<[BuildingTypeId, 'market' | 'water' | 'police' | 'health' | 'school' | 'data' | 'university', boolean]> = [
      ['market', 'market', has('market') > 0],
      ['water_tower', 'water', has('water_tower') > 0 && has('pumping_station') + has('water_well') > 0],
      ['police_station', 'police', has('police_station') > 0],
      ['clinic', 'health', has('clinic') > 0],
      ['school', 'school', has('school') > 0],
      ['data_exchange', 'data', has('data_exchange') > 0],
      ['university', 'university', has('university') > 0],
    ];
    for (const [type, kind, active] of kinds) {
      if (!active) continue;
      if (!ESSENTIAL.has(type) && credits < buildingDef(type).econ!.credits + 1000) continue;
      const lacking = houses.filter((h) => h.complete && h.city!.level >= (kind === 'market' || kind === 'water' ? 0 : kind === 'data' ? 3 : kind === 'university' ? 4 : 1) && !h.city!.covered[kind]);
      if (lacking.length < 4) continue;
      // Skip if one is already under construction, or the ones there are idle (no staff, no power).
      if (world.buildings.some((b) => b.owner === p && b.type === type && (!b.complete || (b.city!.status !== '' && b.city!.served === 0)))) continue;
      const cx = lacking.reduce((s, h) => s + h.x, 0) / lacking.length;
      const cy = lacking.reduce((s, h) => s + h.y, 0) / lacking.length;
      // One already stands among them (they are out of its reach by road, or over its capacity): another there would not help.
      if (world.buildings.some((b) => b.owner === p && b.type === type && (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy) < 12 * 12)) continue;
      // Plenty of them for everyone already.
      if (has(type) * buildingDef(type).econ!.service!.capacity > Math.max(2000, pop * 3)) continue;
      const cmds = place(world, bot, type, [cx, cy]);
      if (cmds.length) return cmds;
    }
  }
  for (const [cond, type] of wants) {
    if (!cond) continue;
    // One of a kind at a time: wait for the last one to be finished.
    if (type !== 'house' && world.buildings.some((b) => b.owner === p && b.type === type && !b.complete)) continue;
    // Producers of building materials are never held back: everything else waits on them.
    if (busy && !['house', 'logging_camp', 'sawmill', 'quarry', 'trade_port', 'construction_office'].includes(type)) continue;
    // City-states keep money in hand to trade with; nations save up to expand when it is time.
    if (bot.maxPop < Infinity && credits < 2500 + buildingDef(type).econ!.credits && type !== 'house') continue;
    if (saving && !ESSENTIAL.has(type)) continue;
    if (type !== 'house') {
      const econ = buildingDef(type).econ!;
      // Another of a kind whose last one stands idle (no input, no staff, no power) would idle too.
      if (idleAs(type, IDLE)) continue;
      // Materials: not a site that would wait for ever for what is neither in stock, nor being made, nor to be bought,
      // and (land to claim, and none at home to make them) keep enough for a regional office.
      const mats = Object.entries(econ.materials) as Array<[GoodId, number]>;
      if (mats.some(([g, n]) => stock(g) < n + (keepForOffice ? (g === 'concrete' ? 25 : g === 'lumber' ? 35 : 0) : 0) && (keepForOffice || (made(g) <= 0 && !has('trade_port'))))) continue;
      if (!ESSENTIAL.has(type) && !(type === 'barracks' && threat > 0) && !(type === 'construction_office' && crewsShort)) {
        // Only what the books can carry: money for it with some to spare, and its upkeep covered by income.
        if (credits < econ.credits + 1000) continue;
        if (world.time >= YEAR_SECONDS && credits < 8000 && projNet - (econ.upkeep ?? 0) < 0) continue;
        // Only what can be staffed: not while jobs already stand empty.
        if (econ.jobs && freeJobs > 10 + sumTiers(pc.workforce) * 0.15) continue;
        // Only what can be powered: houses get what is left, and without it none grows past a cottage.
        if ((econ.power ?? 0) > 0 && pc.powerSupply - pc.powerDemand < econ.power!) continue;
      } else if (world.time >= YEAR_SECONDS && projNet < 0 && credits < econ.credits + 400) continue;
    }
    if (type === 'house') {
      if (pop >= bot.maxPop) continue;
      const out: Command[] = [];
      for (let i = 0; i < 4; i++) out.push(...place(world, bot, 'house'));
      if (out.length) return out.slice(0, 4);
      continue;
    }
    const cmds = place(world, bot, type, services.has(type) ? centre : undefined);
    if (cmds.length) return cmds;
  }
  return [];
}


// ---------------------------------------------------------------------------
// Nations and city-states

/** Nations: embargoes on whoever they fight (Hard bots and Traders also on a rival they loathe), lifted once tempers cool. */
function embargoStep(world: World, bot: BotState): Command[] {
  const p = bot.player;
  if (world.time < (bot.embargoAt ?? 0)) return [];
  bot.embargoAt = world.time + 10;
  const grudge = bot.difficulty === 'hard' || bot.personality === 'trader';
  for (const o of world.players) {
    if (o.id === p || o.defeated || (o.role !== 'nation' && o.role !== 'human')) continue;
    const op = opinionOf(world, p, o.id);
    const hostile = atWar(world, p, o.id) || (grudge && op < -40);
    const mine = world.city!.embargoes.find((e) => e.by === p && e.on === o.id);
    if (hostile && !mine) {
      bot.log.push(`embargo on ${o.name}`);
      return [{ kind: 'embargo', player: p, target: o.id, on: true }];
    }
    if (!hostile && mine && (op >= -20 || world.time - mine.since > 6 * 120)) {
      bot.log.push(`lift embargo on ${o.name}`);
      return [{ kind: 'embargo', player: p, target: o.id, on: false }];
    }
  }
  return [];
}

function nationDiplomacy(world: World, bot: BotState, stock: (g: GoodId) => number): Command[] {
  const p = bot.player;
  if (world.time < (bot.dealAt ?? 0)) return [];
  bot.dealAt = world.time + 30;
  const pc = world.city!.players[p]!;
  const states = world.players.filter((o) => o.role === 'cityState' && !o.defeated && !atWar(world, p, o.id));
  for (const o of states) {
    if (relationsOf(world, o.id)?.offer === p) {
      bot.log.push(`union with ${o.name}`);
      return [{ kind: 'acceptUnion', player: p, state: o.id }];
    }
    if ((relationsOf(world, o.id)?.opinion[p] ?? 0) >= DIPLO.buyOpinion && pc.credits > purchasePrice(world, o.id) * 1.5 + 8000) {
      bot.log.push(`buy ${o.name}`);
      return [{ kind: 'buyState', player: p, state: o.id }];
    }
  }
  const th = hall(world, p);
  if (!th?.city || th.city.access < 0) return [];
  const home = world.city!.comp[th.city.access]!;
  // The two nearest city-states.
  const near = states
    .map((o) => ({ o, m: marketOf(world, o.id) }))
    .filter((x) => x.m?.city && x.m.city.access >= 0)
    .sort((a, b) => Math.hypot(a.m!.x - th.x, a.m!.y - th.y) - Math.hypot(b.m!.x - th.x, b.m!.y - th.y))
    .slice(0, 2);
  for (const { o, m } of near) {
    const a = m!.city!.access;
    if (world.city!.comp[a] !== home) {
      // Not connected yet: a road from their town hall to ours, if it isn't too long and we can afford it.
      if (pc.credits < 10000) continue;
      if (bot.noRoadTo?.includes(o.id)) continue;
      const road = longRoad(world, p, a, Math.floor(th.x), Math.floor(th.y));
      if (!road || road.length >= 300) {
        (bot.noRoadTo ??= []).push(o.id);
        continue;
      }
      if (road.length > 1 && pc.credits > Math.max(10000, road.length * 40)) {
        bot.log.push(`road to ${o.name} (${road.length})`);
        return [{ kind: 'road', player: p, tiles: road }];
      }
      continue;
    }
    // Connected: buy what building sites and factories lack, sell surpluses.
    const want: Array<[GoodId, number, number]> = [];
    for (const g of ['steel', 'concrete', 'lumber'] as const) if (stock(g) < 40) want.push([g, 60, -1]);
    for (const [g, above] of [['food', 200], ['crops', 150], ['timber', 150], ['stone', 150], ['goods', 120]] as const) if (stock(g) > above) want.push([g, 0, above]);
    const book = pc.deals[o.id] ?? {};
    const out: Command[] = [];
    for (const [g, imp, exp] of want) {
      const r = book[g];
      if (!r || r.import !== imp || r.export !== exp) out.push({ kind: 'deal', player: p, state: o.id, good: g, import: imp, export: exp });
    }
    // Stop trading what we no longer lack or have too much of.
    for (const g of Object.keys(book) as GoodId[]) {
      if (!want.some(([x]) => x === g)) out.push({ kind: 'deal', player: p, state: o.id, good: g, import: 0, export: -1 });
    }
    if (out.length) return out;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Nations: expansion and war

/** Claim an unclaimed neighbouring region with a Regional Office (and a road to it). */
function expand(world: World, bot: BotState): Command[] {
  const p = bot.player;
  const map = world.map;
  const city = world.city!;
  if (world.buildings.some((b) => b.owner === p && b.type === 'regional_office' && !b.complete)) return [];
  const th = hall(world, p);
  if (!th) return [];
  const mine = map.regions.filter((r) => city.regionOwner[r.id] === p);
  // What the land we hold lacks counts for more.
  const lack = (t: string) => (bot.noLand.includes(t) ? 3 : 1);
  const options = map.regions
    .filter((r) => city.regionOwner[r.id] === -1 && r.siteX >= 0 && r.neighbors.some((n) => city.regionOwner[n] === p))
    .map((r) => ({ r, d: Math.sqrt((r.cx - th.x) * (r.cx - th.x) + (r.cy - th.y) * (r.cy - th.y)), score: (r.fertile / 300) * lack('farm') + (r.forest / 400) * lack('logging_camp') + (r.ore * lack('iron_mine') + r.stone * lack('quarry') + r.oil * lack('oil_well') + r.rare + r.uranium) / 60 + (r.ocean ? lack('trade_port') : 0) }))
    .sort((a, b) => b.score - b.d / 80 - (a.score - a.d / 80) || a.r.id - b.r.id);
  void mine;
  let tries = 0;
  for (const { r } of options) {
    if (tries >= 3) break;
    // The office sits on the region's clear site; look for a spot near it (one road search per region).
    let placed = false;
    for (let dy = 0; dy <= 3 && !placed; dy++) {
      for (let dx = 0; dx <= 3 && !placed; dx++) {
        const tx = r.siteX + dx;
        const ty = r.siteY + dy;
        if (cityPlacementProblem(world, p, 'regional_office', tx, ty) !== null) continue;
        placed = true;
        tries++;
        const W = world.map.width;
        const road = roadTo(world, p, tx + 1, ty + 3, [tx, ty], [3, 3]) ?? longRoad(world, p, (ty + 3) * W + tx + 1, Math.floor(th.x), Math.floor(th.y), 120000, [tx, ty, 3, 3]);
        if (!road) {
          bot.log.push(`no road to ${r.name}`);
          continue;
        }
        bot.log.push(`expand into ${r.name}`);
        return [
          { kind: 'road', player: p, tiles: road },
          { kind: 'place', player: p, building: 'regional_office', tx, ty },
        ];
      }
    }
  }
  return [];
}

function armyOf(world: World, player: number): Unit[] {
  // Land troops and gunships (helicopters need no airfield to come back to).
  return world.units.filter((u) => u.owner === player && !u.def.builder && (u.def.domain === 'land' || (u.def.domain === 'air' && u.def.move === 'heli' && !u.def.cargo && !u.def.fuel)));
}

function seatsOf(world: World, player: number): Building[] {
  return world.buildings.filter((b) => b.owner === player && b.complete && (b.type === 'town_hall' || b.type === 'regional_office'));
}

/** Nations: no farmland or no stone at home, and no port to buy them in: new land is the way out. */
function landStarved(world: World, bot: BotState): boolean {
  return bot.nation && (bot.expandFails ?? 0) < 3 && count(world, bot.player, 'trade_port') === 0 && (bot.noLand.includes('farm') || bot.noLand.includes('quarry'));
}

/** Population at which a nation claims its next region. */
function expandPop(world: World, bot: BotState): number {
  const n = DIFFICULTY[bot.difficulty].expandPop * traits(bot).expand * (1 + seatsOf(world, bot.player).length * 0.5);
  return landStarved(world, bot) ? Math.min(n, 40) : n;
}

/** Expansion, recruiting, defence, and (on Normal and Hard) wars of conquest. */
function militaryStep(world: World, bot: BotState): Command[] {
  const p = bot.player;
  const pc = world.city!.players[p]!;
  const d = DIFFICULTY[bot.difficulty];
  const pop = sumTiers(pc.population);
  const out: Command[] = [];

  // Grow: claim land while there is money and people.
  const tr = traits(bot);
  if (pop >= expandPop(world, bot) && pc.credits > 4000 && world.time >= (bot.expandAt ?? 0)) {
    const e = expand(world, bot);
    if (e.length) {
      bot.expandFails = 0;
      return e;
    }
    // Nowhere to go for now: look again in a minute (less often after each miss).
    bot.expandFails = (bot.expandFails ?? 0) + 1;
    bot.expandAt = world.time + 60 * Math.min(5, bot.expandFails);
  }

  // Recruit up to a share of the army limit.
  const army = armyOf(world, p);
  const cap = armyCap(world, p);
  // Building sites come first: no recruiting while they wait for materials and money is short.
  const starved = pc.credits < 6000 && world.buildings.some((b) => b.owner === p && !b.complete && b.type !== 'house' && /Waiting for (lumber|concrete|steel)/.test(b.city?.status ?? ''));
  // A rival under arms or at war: keep at least a home guard (about half their army), even when money is short.
  const threat = threatOf(world, p);
  const inWar = world.players.some((o) => o.id !== p && !o.defeated && o.role !== 'cityState' && atWar(world, p, o.id));
  const guard = threat > 0 ? Math.min(cap * 0.9, Math.max(4, Math.ceil(threat * (inWar ? 0.8 : 0.5)))) : 0;
  const guardShort = army.length < guard && pc.credits > (inWar ? 300 : 500);
  if ((army.length < cap * Math.min(0.9, d.army * tr.army) && pc.credits > 3000 && !starved) || guardShort) {
    for (const b of world.buildings) {
      if (b.owner !== p || !b.complete || b.queue.length >= 2) continue;
      const digital = pc.age >= 1;
      const types: UnitTypeId[] =
        b.type === 'barracks' ? (digital ? ['exo_trooper', 'rocket_trooper', 'rifleman'] : ['rifleman', 'rocket_trooper', 'rifleman'])
        : b.type === 'vehicle_factory' ? (pc.age >= 2 ? ['disruptor', 'battle_tank', 'rocket_artillery'] : digital ? ['battle_tank', 'rocket_artillery', 'flak_track', 'scout_buggy'] : ['battle_tank', 'scout_buggy', 'flak_track'])
        : b.type === 'mech_foundry' ? (pc.age >= 2 ? ['juggernaut', 'arclight', 'warden'] : ['warden'])
        : b.type === 'airfield' ? ['attack_helicopter'] : [];
      for (const t of types) {
        if (recruitProblem(world, p, b, t) === null) {
          out.push({ kind: 'recruit', player: p, building: b.id, unit: t });
          break;
        }
      }
    }
  }

  // War: pick a fight with the weakest neighbour when strong enough (not on Easy).
  const year = world.time / 120;
  const warlike = bot.personality === 'warlike';
  const enemies = world.players.filter((o) => o.id !== p && !o.defeated && (o.role !== 'cityState' || warlike) && atWar(world, p, o.id));
  const pcw = world.city!.players[p]!;
  const lyw = pcw.lastYear;
  const solvent = pcw.credits > 8000 || lyw.taxes + lyw.trade - lyw.imports - lyw.upkeep - lyw.roads - lyw.military > 0;
  if (!enemies.length && year >= d.warYear && world.time >= bot.warAt && solvent) {
    bot.warAt = world.time + 120;
    // Not against those it has a pact with, or likes. Warlords also prey on city-states (land and spoils), nearest first.
    const home = hall(world, p);
    const dist = (o: number) => {
      const s = seatsOf(world, o)[0];
      return home && s ? Math.hypot(s.x - home.x, s.y - home.y) : 1e9;
    };
    const rivals = world.players
      .filter((o) => o.id !== p && !o.defeated && (o.role !== 'cityState' || warlike) && !hasTreaty(world, p, o.id, 'peace') && opinionOf(world, p, o.id) < 40)
      .sort((a, b) => dist(a.id) - dist(b.id) || a.id - b.id);
    for (const o of rivals) {
      const theirs = armyOf(world, o.id).length;
      if (army.length >= Math.max(6, theirs * d.warRatio * tr.war)) {
        out.push({ kind: 'declareWar', player: p, target: o.id });
        bot.log.push(`war on ${o.name}`);
        break;
      }
    }
  }

  // At war: send the army at the nearest enemy seat; make peace when it is spent.
  if (enemies.length) {
    const th = hall(world, p);
    const targets = enemies.flatMap((o) => seatsOf(world, o.id));
    if (army.length < 3 && targets.length) {
      // Offer peace now and then (they may refuse), and meanwhile build up a guard.
      if (world.time >= (bot.peaceAt ?? 0)) {
        bot.peaceAt = world.time + 30;
        for (const o of enemies) out.push({ kind: 'makePeace', player: p, target: o.id });
      }
      bot.attackTarget = 0;
      bot.warAt = world.time + 240;
      return out;
    }
    const current = world.getBuilding(bot.attackTarget);
    let target = current && atWar(world, p, current.owner) ? current : undefined;
    if (!target && th) {
      targets.sort((a, b) => (a.x - th.x) * (a.x - th.x) + (a.y - th.y) * (a.y - th.y) - ((b.x - th.x) * (b.x - th.x) + (b.y - th.y) * (b.y - th.y)) || a.id - b.id);
      target = targets[0];
    }
    // Much weaker than the enemy: hold the seat at home rather than march out.
    const theirs = Math.max(...enemies.map((o) => armyOf(world, o.id).length));
    const defend = army.length < theirs * 0.7;
    const enemyNear = (u: Unit) => world.units.some((e) => atWar(world, p, e.owner) && (e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y) < 64);
    if (defend && th) {
      bot.attackTarget = 0;
      const hx = th.x + 4;
      const hy = th.y + 8;
      const away = army.filter((u) => !u.order && !enemyNear(u) && (u.goalX - hx) * (u.goalX - hx) + (u.goalY - hy) * (u.goalY - hy) > 100 && (u.x - hx) * (u.x - hx) + (u.y - hy) * (u.y - hy) > 100).map((u) => u.id);
      if (away.length) out.push({ kind: 'move', player: p, units: away, x: hx, y: hy });
    } else if (target && army.length >= 4) {
      bot.attackTarget = target.id;
      // March on the seat (shooting what comes in range); fight enemy troops that are near.
      const tx = target.x;
      const ty = target.y + target.h / 2 + 1.5;
      // Anyone not already heading there (e.g. still walking home from peacetime) turns round.
      const going = army.filter((u) => !u.order && !enemyNear(u) && (u.goalX - tx) * (u.goalX - tx) + (u.goalY - ty) * (u.goalY - ty) > 16 && (u.x - tx) * (u.x - tx) + (u.y - ty) * (u.y - ty) > 9);
      if (going.length) out.push({ kind: 'move', player: p, units: going.map((u) => u.id), x: tx, y: ty });
    }
  } else if (army.length) {
    // Peace: keep the army near home.
    const th = hall(world, p);
    const far = army.filter((u) => th && (u.x - th.x) * (u.x - th.x) + (u.y - th.y) * (u.y - th.y) > 18 * 18 && u.state === 'idle').map((u) => u.id);
    if (th && far.length) out.push({ kind: 'move', player: p, units: far, x: th.x + 4, y: th.y + 8 });
  }
  return out;
}
