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
import { roadsByOwner } from '../sim/city/economy.ts';
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
  /** Game time of the next attempt to expand (after one found nowhere to go). */
  expandAt?: number;
  /** Game time of the next check for streets cut off from the town hall. */
  linkAt?: number;
  difficulty: Difficulty;
  /** Game time of the next military decision, and of the earliest war it may start. */
  warAt: number;
  /** Current attack target (a seat building id), 0 when defending. */
  attackTarget: number;
  /** Grid rings laid out so far. */
  rings: number;
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

export function newBot(player: number, maxPop = Infinity, nation = false, difficulty: Difficulty = 'normal'): BotState {
  return { player, noLand: [], tradeAt: 0, maxPop, nation, difficulty, warAt: 0, attackTarget: 0, rings: 0, wait: 0, log: [] };
}

function hall(world: World, player: number): Building | undefined {
  return world.buildings.find((b) => b.owner === player && b.type === 'town_hall');
}

function count(world: World, player: number, type: string): number {
  return world.buildings.filter((b) => b.owner === player && b.type === type).length;
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

/** Lay one more ring of the street grid around the town hall. */
function growGrid(world: World, bot: BotState): Command | null {
  const th = hall(world, bot.player);
  if (!th) return null;
  const r = ++bot.rings;
  const cx = th.tx + 2;
  const cy = th.ty + 5; // the starting street runs below the hall
  const tiles: Array<[number, number]> = [];
  const span = r * BLOCK * 2;
  for (let k = -r; k <= r; k++) {
    for (let t = -span; t <= span; t++) {
      tiles.push([cx + t, cy + k * BLOCK]);
      tiles.push([cx + k * BLOCK * 2 - 1, cy + t]);
    }
  }
  const ok = tiles.filter(([x, y]) => roadProblem(world, bot.player, x, y) === null);
  if (!ok.length) return null;
  bot.log.push(`grid ring ${r}: ${ok.length} tiles`);
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

/** Breadth-first search for a road from just below a footprint to the nearest existing road. */
function roadTo(world: World, player: number, sx: number, sy: number, spot: [number, number], size: readonly [number, number]): Array<[number, number]> | null {
  const map = world.map;
  const W = map.width;
  const city = world.city!;
  const inFoot = (x: number, y: number) => x >= spot[0] && x < spot[0] + size[0] && y >= spot[1] && y < spot[1] + size[1];
  const start = sy * W + sx;
  if (!city.road[start] && roadProblem(world, player, sx, sy) !== null) return null;
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
      if (tail < queue.length && (city.road[j] || roadProblem(world, player, nx, ny) === null)) queue[tail++] = j;
    }
  }
  return null;
}

let search: { prev: Int32Array; stamp: Int32Array; queue: Int32Array; run: number } | null = null;

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
  const spot = spotByRoad(world, bot.player, type, cx, cy, 14 + bot.rings * BLOCK);
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
  if (bot.nation) {
    const m = militaryStep(world, bot);
    if (m.length) return m;
  }
  const p = bot.player;
  const pc = world.city!.players[p]!;
  if (bot.rings === 0) {
    const g = growGrid(world, bot);
    return g ? [g] : [];
  }
  // Streets that ended up cut off from the town hall's network: join them up.
  if (world.time >= (bot.linkAt ?? 0)) {
    bot.linkAt = world.time + 30;
    const th = hall(world, p);
    const home = th?.city && th.city.access >= 0 ? world.city!.comp[th.city.access]! : 0;
    const cut = home ? world.buildings.find((b) => b.owner === p && b.city && b.city.access >= 0 && b.city.comp !== home) : undefined;
    if (cut) {
      const a = cut.city!.access;
      const W = world.map.width;
      const road = roadTo(world, p, a % W, Math.floor(a / W), [-10, -10], [0, 0]);
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

  // A new age as soon as it is ready (nations and the scripted player; city-states stay as they are).
  if (bot.maxPop === Infinity && nextAge(world, p)?.ready) return [{ kind: 'advanceAge', player: p }];

  // Trade: once there is a port, buy what the land can't give and sell surpluses.
  if (has('trade_port') && world.time >= bot.tradeAt) {
    bot.tradeAt = world.time + 30;
    const missing: Partial<Record<string, GoodId>> = { oil_well: 'oil', quarry: 'concrete', iron_mine: 'steel', logging_camp: 'lumber', rare_earth_mine: 'rare', uranium_mine: 'uranium' };
    const rules: Array<[GoodId, number, number]> = [['steel', 60, -1], ['concrete', 40, -1], ['crops', 0, 150], ['timber', 0, 150], ['stone', 0, 150], ['food', 0, 250], ['lumber', 0, 200]];
    for (const t of bot.noLand) {
      const g = missing[t];
      if (g) {
        const r = rules.find((x) => x[0] === g);
        if (r) r[1] = 80;
        else rules.push([g, 80, -1]);
      }
    }
    // Power plants short of oil: buy it in.
    if (pc.powerDemand > pc.powerSupply - 2 && has('power_plant') > 0) {
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
    if (credits > 2500) {
      for (const g of ['lumber', 'concrete', 'steel'] as const) {
        const short = world.buildings.filter((b) => b.owner === p && !b.complete && b.city).reduce((s, b) => s + Math.max(0, (b.def.econ?.materials[g] ?? 0) - get(b.city!.delivered, g) - get(b.city!.incoming, g)), 0);
        if (short <= 0 || stock(g) >= short) continue;
        const want = Math.min(400, Math.ceil((short + 40) / 20) * 20);
        const r = rules.find((x) => x[0] === g);
        if (r) {
          r[1] = Math.max(r[1], want);
          r[2] = -1;
        } else rules.push([g, want, -1]);
      }
    }
    const changed = rules.filter(([g, imp, exp]) => pc.trade[g]?.import !== imp || pc.trade[g]?.export !== exp);
    if (changed.length) return changed.map(([good, imp, exp]) => ({ kind: 'tradeRule', player: p, good, import: imp, export: exp }));
  }

  // Order matters: the first thing that applies is done.
  const wants: Array<[boolean, BuildingTypeId]> = [
    [!has('logging_camp'), 'logging_camp'],
    [!has('sawmill') && !bot.noLand.includes('logging_camp'), 'sawmill'],
    [!has('trade_port') && bot.noLand.length > 0, 'trade_port'],
    // Sites stuck for want of steel or concrete: a port buys them in.
    [!has('trade_port') && !bot.noLand.includes('trade_port') && world.buildings.some((b) => b.owner === p && !b.complete && /Waiting for .*(steel|concrete)/.test(b.city?.status ?? '')) && stock('steel') < 10, 'trade_port'],
    [credits > 150 && (room < 6 ? freeJobs > 4 || pop < 30 : freeJobs > room * 0.5 + 4), 'house'],
    [!has('farm') && pop >= 12, 'farm'],
    [!has('food_plant') && pop >= 12, 'food_plant'],
    [!has('market') && pop >= 16, 'market'],
    [!has('pumping_station') && pop >= 30, 'pumping_station'],
    [!has('water_tower') && has('pumping_station') > 0, 'water_tower'],
    // No river or lake: wells.
    [bot.noLand.includes('pumping_station') && has('water_well') * 180 < pop + 40 && pop >= 30, 'water_well'],
    [!has('water_tower') && has('water_well') > 0, 'water_tower'],
    [!has('quarry') && pop >= 30, 'quarry'],
    [!has('trade_port') && pop >= 100, 'trade_port'],
    [!has('oil_well') && pop >= 40, 'oil_well'],
    [!has('power_plant') && (has('oil_well') > 0 || bot.noLand.includes('oil_well')), 'power_plant'],
    [!has('hydro_plant') && pop >= 60 && bot.noLand.includes('oil_well'), 'hydro_plant'],
    [has('hydro_plant') < 2 && pop >= 200 && pc.powerDemand > pc.powerSupply - 5 && !bot.noLand.includes('hydro_plant'), 'hydro_plant'],
    [!has('cement_works') && has('power_plant') > 0, 'cement_works'],
    [!has('warehouse') && pop >= 50, 'warehouse'],
    [!has('police_station') && pop >= 60, 'police_station'],
    [!has('construction_office') && pop >= 60, 'construction_office'],
    [made('food') < (pop * CONSUMPTION.food * 60) / YEAR_SECONDS * 1.3 && has('farm') < has('food_plant') * 1.3 && pop >= 40, 'farm'],
    [has('farm') >= has('food_plant') * 1.3 && made('food') < used('food') * 1.2, 'food_plant'],
    [made('lumber') < used('lumber') + 6 && stock('lumber') < 60 && has('logging_camp') < 5, 'logging_camp'],
    [has('logging_camp') > has('sawmill') * 1.5, 'sawmill'],
    [stock('concrete') < 30 && has('cement_works') > 0 && has('quarry') <= has('cement_works'), 'quarry'],
    [!has('iron_mine') && pop >= 80, 'iron_mine'],
    [!has('steel_mill') && has('iron_mine') > 0, 'steel_mill'],
    [!has('oil_refinery') && (has('steel_mill') > 0 || bot.noLand.includes('iron_mine')) && pop >= 120, 'oil_refinery'],
    [!has('goods_factory') && has('oil_refinery') > 0 && pc.population[1] >= 20, 'goods_factory'],
    [has('goods_factory') > 0 && has('goods_factory') < 4 && made('goods') < used('goods') * 1.1 + 2 && stock('goods') < 40, 'goods_factory'],
    [has('oil_refinery') > 0 && has('oil_refinery') < has('goods_factory') + has('electronics_plant') && stock('plastics') < 30, 'oil_refinery'],
    // Each plant burns about two thirds of a well's oil.
    [pc.powerDemand > pc.powerSupply - 5 && has('power_plant') > 0 && has('oil_well') * 1.5 < has('power_plant') + 1 && !bot.noLand.includes('oil_well'), 'oil_well'],
    [pc.powerDemand > pc.powerSupply - 5 && has('power_plant') > 0 && has('oil_well') * 1.5 >= has('power_plant') + 1, 'power_plant'],
    [has('market') * 400 < pop, 'market'],
    [has('water_tower') * 350 < pop && has('pumping_station') + has('water_well') > 0, 'water_tower'],
    [has('pumping_station') * 550 < pop, 'pumping_station'],
    [has('police_station') * 550 < pop && pop >= 60, 'police_station'],
    [!has('clinic') && pc.population[1] >= 30, 'clinic'],
    [bot.nation && !has('barracks') && pop >= 120, 'barracks'],
    [bot.nation && !has('vehicle_factory') && has('barracks') > 0 && pop >= 300 && has('oil_refinery') > 0, 'vehicle_factory'],
    [has('maintenance_depot') * 300 < roadsByOwner(world)[p]! && roadsByOwner(world)[p]! > 150, 'maintenance_depot'],
    // Towards the Digital age, and what it brings.
    [pc.age < MAX_AGE && !has('research_institute') && pc.population[1] >= 120 && bot.maxPop === Infinity, 'research_institute'],
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
    [bot.nation && pc.age >= 1 && !has('mech_foundry') && pop >= 600 && has('vehicle_factory') > 0, 'mech_foundry'],
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
      const lacking = houses.filter((h) => h.complete && h.city!.level >= (kind === 'market' || kind === 'water' ? 0 : kind === 'data' ? 3 : kind === 'university' ? 4 : 1) && !h.city!.covered[kind]);
      if (lacking.length < 4) continue;
      // Skip if one is already under construction, or the ones there are idle (no staff, no power).
      if (world.buildings.some((b) => b.owner === p && b.type === type && (!b.complete || (b.city!.status !== '' && b.city!.served === 0)))) continue;
      const cx = lacking.reduce((s, h) => s + h.x, 0) / lacking.length;
      const cy = lacking.reduce((s, h) => s + h.y, 0) / lacking.length;
      const cmds = place(world, bot, type, [cx, cy]);
      if (cmds.length) return cmds;
    }
  }
  for (const [cond, type] of wants) {
    if (!cond) continue;
    // One of a kind at a time: wait for the last one to be finished.
    if (type !== 'house' && world.buildings.some((b) => b.owner === p && b.type === type && !b.complete)) continue;
    // Producers of building materials are never held back: everything else waits on them.
    if (busy && !['house', 'logging_camp', 'sawmill', 'quarry', 'trade_port'].includes(type)) continue;
    // City-states keep money in hand to trade with; nations save up to expand when it is time.
    if (bot.maxPop < Infinity && credits < 2500 + buildingDef(type).econ!.credits && type !== 'house') continue;
    if (bot.nation && pop >= DIFFICULTY[bot.difficulty].expandPop * (1 + seatsOf(world, p).length * 0.5) && credits < 5500 && !['house', 'logging_camp', 'sawmill', 'farm', 'food_plant', 'market'].includes(type)) continue;
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
  const options = map.regions
    .filter((r) => city.regionOwner[r.id] === -1 && r.siteX >= 0 && r.neighbors.some((n) => city.regionOwner[n] === p))
    .map((r) => ({ r, d: Math.sqrt((r.cx - th.x) * (r.cx - th.x) + (r.cy - th.y) * (r.cy - th.y)), score: r.fertile / 300 + r.forest / 400 + (r.ore + r.stone + r.oil + r.rare + r.uranium) / 60 + (r.ocean ? 1 : 0) }))
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
        const road = roadTo(world, p, tx + 1, ty + 3, [tx, ty], [3, 3]);
        if (!road) continue;
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
  return world.units.filter((u) => u.owner === player && u.def.domain === 'land' && !u.def.builder);
}

function seatsOf(world: World, player: number): Building[] {
  return world.buildings.filter((b) => b.owner === player && b.complete && (b.type === 'town_hall' || b.type === 'regional_office'));
}

/** Expansion, recruiting, defence, and (on Normal and Hard) wars of conquest. */
function militaryStep(world: World, bot: BotState): Command[] {
  const p = bot.player;
  const pc = world.city!.players[p]!;
  const d = DIFFICULTY[bot.difficulty];
  const pop = sumTiers(pc.population);
  const out: Command[] = [];

  // Grow: claim land while there is money and people.
  if (pop >= d.expandPop * (1 + seatsOf(world, p).length * 0.5) && pc.credits > 4000 && world.time >= (bot.expandAt ?? 0)) {
    const e = expand(world, bot);
    if (e.length) return e;
    // Nowhere to go for now: look again in a minute.
    bot.expandAt = world.time + 60;
  }

  // Recruit up to a share of the army limit.
  const army = armyOf(world, p);
  const cap = armyCap(world, p);
  // Building sites come first: no recruiting while they wait for materials and money is short.
  const starved = pc.credits < 6000 && world.buildings.some((b) => b.owner === p && !b.complete && b.type !== 'house' && /Waiting for (lumber|concrete|steel)/.test(b.city?.status ?? ''));
  if (army.length < cap * d.army && pc.credits > 3000 && !starved) {
    for (const b of world.buildings) {
      if (b.owner !== p || !b.complete || b.queue.length >= 2) continue;
      const digital = pc.age >= 1;
      const types: UnitTypeId[] =
        b.type === 'barracks' ? (digital ? ['exo_trooper', 'rocket_trooper', 'rifleman'] : ['rifleman', 'rocket_trooper', 'rifleman'])
        : b.type === 'vehicle_factory' ? (pc.age >= 2 ? ['disruptor', 'battle_tank', 'rocket_artillery'] : digital ? ['battle_tank', 'rocket_artillery', 'flak_track', 'scout_buggy'] : ['battle_tank', 'scout_buggy', 'flak_track'])
        : b.type === 'mech_foundry' ? (pc.age >= 2 ? ['juggernaut', 'arclight', 'warden'] : ['warden']) : [];
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
  const enemies = world.players.filter((o) => o.id !== p && !o.defeated && o.role !== 'cityState' && atWar(world, p, o.id));
  if (!enemies.length && year >= d.warYear && world.time >= bot.warAt) {
    bot.warAt = world.time + 120;
    // Not against those it has a pact with, or likes.
    const rivals = world.players.filter((o) => o.id !== p && !o.defeated && o.role !== 'cityState' && !hasTreaty(world, p, o.id, 'peace') && opinionOf(world, p, o.id) < 40);
    for (const o of rivals) {
      const theirs = armyOf(world, o.id).length;
      if (army.length >= Math.max(6, theirs * d.warRatio)) {
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
      for (const o of enemies) out.push({ kind: 'makePeace', player: p, target: o.id });
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
    if (target && army.length >= 4) {
      bot.attackTarget = target.id;
      // March on the seat (shooting what comes in range); fight enemy troops that are near.
      const enemyNear = (u: Unit) => world.units.some((e) => atWar(world, p, e.owner) && (e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y) < 64);
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
