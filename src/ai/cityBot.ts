// A scripted city builder. It plays the economy game through commands only, the
// same way a player does: lays out a street grid around the town hall, places
// buildings by a priority list driven by what is short, and connects distant
// farms, mines and wells with roads. Used by the balance tests now, and as the
// city manager of AI nations later (E5/E6).

import { BUILDINGS, buildingDef, type BuildingTypeId } from '../data/buildings.ts';
import { CONSUMPTION } from '../data/city.ts';
import { YEAR_SECONDS, type GoodId } from '../data/goods.ts';
import type { Command } from '../sim/commands.ts';
import { cityBuildProblem, cityPlacementProblem, landYield } from '../sim/city/place.ts';
import { roadProblem } from '../sim/city/roads.ts';
import { get } from '../sim/city/state.ts';
import type { Building, Unit } from '../sim/types.ts';
import type { UnitTypeId } from '../data/units.ts';
import { armyCap, atWar, recruitProblem } from '../sim/city/military.ts';
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
  const prev = new Map<number, number>();
  const start = sy * W + sx;
  if (roadProblem(world, player, sx, sy) !== null) return null;
  // Join our own road network (the one the town hall is on), not a neighbour's.
  const th = hall(world, player);
  const home = th?.city && th.city.access >= 0 ? city.comp[th.city.access]! : -1;
  const queue = [start];
  prev.set(start, -1);
  for (let q = 0; q < queue.length && q < 40000; q++) {
    const i = queue[q]!;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height || inFoot(nx, ny)) continue;
      const j = ny * W + nx;
      if (prev.has(j)) continue;
      prev.set(j, i);
      if (city.road[j] && (home < 0 || city.comp[j] === home)) {
        const path: Array<[number, number]> = [];
        for (let k = i; k >= 0; k = prev.get(k)!) path.push([k % W, Math.floor(k / W)]);
        return path.reverse();
      }
      if (roadProblem(world, player, nx, ny) === null || city.road[j]) queue.push(j);
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
  const pending = world.buildings.filter((b) => b.owner === p && !b.complete && b.type !== 'house').length;
  const busy = pending >= 3 + count(world, p, 'construction_office') * 2;
  const has = (t: string) => count(world, p, t);
  const pop = pc.population[0] + pc.population[1];
  const houses = world.buildings.filter((b) => b.owner === p && b.type === 'house');
  const room = houses.reduce((s, h) => s + (h.city!.level < 3 ? [8, 16, 24, 40][h.city!.level]! - h.city!.residents : 0), 0);
  const freeJobs = pc.jobs[0] + pc.jobs[1] - pc.employed[0] - pc.employed[1];
  const credits = pc.credits;
  const made = (g: GoodId) => get(pc.made, g);
  const used = (g: GoodId) => get(pc.used, g);
  const stock = (g: GoodId) => world.buildings.filter((b) => b.owner === p && b.city).reduce((s, b) => s + get(b.city!.stock, g), 0);

  // Trade: once there is a port, buy what the land can't give and sell surpluses.
  if (has('trade_port') && world.time >= bot.tradeAt) {
    bot.tradeAt = world.time + 30;
    const missing: Partial<Record<string, GoodId>> = { oil_well: 'oil', quarry: 'concrete', iron_mine: 'steel', logging_camp: 'lumber' };
    const rules: Array<[GoodId, number, number]> = [['steel', 60, -1], ['concrete', 40, -1], ['crops', 0, 150], ['timber', 0, 150], ['stone', 0, 150], ['food', 0, 250], ['lumber', 0, 200]];
    for (const t of bot.noLand) {
      const g = missing[t];
      if (g) {
        const r = rules.find((x) => x[0] === g);
        if (r) r[1] = 80;
        else rules.push([g, 80, -1]);
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
    [credits > 400 && (room < 6 ? freeJobs > 4 || pop < 30 : freeJobs > room * 0.5 + 4), 'house'],
    [!has('farm') && pop >= 12, 'farm'],
    [!has('food_plant') && pop >= 12, 'food_plant'],
    [!has('market') && pop >= 16, 'market'],
    [!has('pumping_station') && pop >= 30, 'pumping_station'],
    [!has('water_tower') && has('pumping_station') > 0, 'water_tower'],
    [!has('quarry') && pop >= 30, 'quarry'],
    [!has('trade_port') && pop >= 100, 'trade_port'],
    [!has('oil_well') && pop >= 40, 'oil_well'],
    [!has('power_plant') && (has('oil_well') > 0 || bot.noLand.includes('oil_well')), 'power_plant'],
    [!has('hydro_plant') && pop >= 60 && bot.noLand.includes('oil_well'), 'hydro_plant'],
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
    [!has('oil_refinery') && has('steel_mill') > 0 && pop >= 120, 'oil_refinery'],
    [!has('goods_factory') && has('oil_refinery') > 0 && pc.population[1] >= 20, 'goods_factory'],
    // Each plant burns about two thirds of a well's oil.
    [pc.powerDemand > pc.powerSupply - 5 && has('power_plant') > 0 && has('oil_well') * 1.5 < has('power_plant') + 1 && !bot.noLand.includes('oil_well'), 'oil_well'],
    [pc.powerDemand > pc.powerSupply - 5 && has('power_plant') > 0 && has('oil_well') * 1.5 >= has('power_plant') + 1, 'power_plant'],
    [has('market') * 400 < pop, 'market'],
    [has('water_tower') * 350 < pop && has('pumping_station') > 0, 'water_tower'],
    [has('pumping_station') * 550 < pop, 'pumping_station'],
    [has('police_station') * 550 < pop && pop >= 60, 'police_station'],
    [!has('clinic') && pc.population[1] >= 30, 'clinic'],
    [bot.nation && !has('barracks') && pop >= 120, 'barracks'],
    [bot.nation && !has('vehicle_factory') && has('barracks') > 0 && pop >= 300 && has('oil_refinery') > 0, 'vehicle_factory'],
    [has('maintenance_depot') * 300 < world.city!.roadCount && world.city!.roadCount > 150, 'maintenance_depot'],
    [!has('school') && pc.population[1] >= 30, 'school'],
  ];
  const services = new Set<string>(['market', 'water_tower', 'police_station', 'clinic', 'school']);
  const centre = houseCentre(world, p);

  // Coverage: wherever houses lack a service the town already has, add one among them.
  if (!busy) {
    const kinds: Array<[BuildingTypeId, 'market' | 'water' | 'police' | 'health' | 'school', boolean]> = [
      ['market', 'market', has('market') > 0],
      ['water_tower', 'water', has('water_tower') > 0 && has('pumping_station') > 0],
      ['police_station', 'police', has('police_station') > 0],
      ['clinic', 'health', has('clinic') > 0],
      ['school', 'school', has('school') > 0],
    ];
    for (const [type, kind, active] of kinds) {
      if (!active) continue;
      const lacking = houses.filter((h) => h.complete && h.city!.level >= (kind === 'market' || kind === 'water' ? 0 : 1) && !h.city!.covered[kind]);
      if (lacking.length < 4) continue;
      // Skip if one is already under construction.
      if (world.buildings.some((b) => b.owner === p && b.type === type && !b.complete)) continue;
      const cx = lacking.reduce((s, h) => s + h.x, 0) / lacking.length;
      const cy = lacking.reduce((s, h) => s + h.y, 0) / lacking.length;
      const cmds = place(world, bot, type, [cx, cy]);
      if (cmds.length) return cmds;
    }
  }
  for (const [cond, type] of wants) {
    if (!cond) continue;
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
    .map((r) => ({ r, d: Math.sqrt((r.cx - th.x) * (r.cx - th.x) + (r.cy - th.y) * (r.cy - th.y)), score: r.fertile / 300 + r.forest / 400 + (r.ore + r.stone + r.oil) / 60 + (r.ocean ? 1 : 0) }))
    .sort((a, b) => b.score - b.d / 80 - (a.score - a.d / 80) || a.r.id - b.r.id);
  void mine;
  for (const { r } of options) {
    // The office sits on the region's clear site; look for a spot near it.
    for (let dy = 0; dy <= 3; dy++) {
      for (let dx = 0; dx <= 3; dx++) {
        const tx = r.siteX + dx;
        const ty = r.siteY + dy;
        if (cityPlacementProblem(world, p, 'regional_office', tx, ty) !== null) continue;
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
  const pop = pc.population[0] + pc.population[1];
  const out: Command[] = [];

  // Grow: claim land while there is money and people.
  if (pop >= d.expandPop * (1 + seatsOf(world, p).length * 0.5) && pc.credits > 4000) {
    const e = expand(world, bot);
    if (e.length) return e;
  }

  // Recruit up to a share of the army limit.
  const army = armyOf(world, p);
  const cap = armyCap(world, p);
  if (army.length < cap * d.army && pc.credits > 1500) {
    for (const b of world.buildings) {
      if (b.owner !== p || !b.complete || b.queue.length >= 2) continue;
      const types: UnitTypeId[] = b.type === 'barracks' ? ['rifleman', 'rocket_trooper', 'rifleman'] : b.type === 'vehicle_factory' ? ['battle_tank', 'scout_buggy', 'flak_track'] : [];
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
    const rivals = world.players.filter((o) => o.id !== p && !o.defeated && o.role !== 'cityState');
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
