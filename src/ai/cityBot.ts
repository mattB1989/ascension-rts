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
import type { Building } from '../sim/types.ts';
import type { World } from '../sim/world.ts';

const BLOCK = 8; // street spacing

export interface BotState {
  player: number;
  /** Grid rings laid out so far. */
  rings: number;
  /** Seconds until the next decision. */
  wait: number;
  log: string[];
}

export function newBot(player: number): BotState {
  return { player, rings: 0, wait: 0, log: [] };
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
      if (city.road[j]) {
        const path: Array<[number, number]> = [];
        for (let k = i; k >= 0; k = prev.get(k)!) path.push([k % W, Math.floor(k / W)]);
        return path.reverse();
      }
      if (roadProblem(world, player, nx, ny) === null) queue.push(j);
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
    if (!r) return [];
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
  if (--bot.wait > 0) return [];
  bot.wait = 3;
  reserved = [];
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

  // Order matters: the first thing that applies is done.
  const wants: Array<[boolean, BuildingTypeId]> = [
    [!has('logging_camp'), 'logging_camp'],
    [!has('sawmill'), 'sawmill'],
    [credits > 400 && (room < 6 ? freeJobs > 4 || pop < 30 : freeJobs > room * 0.5 + 4), 'house'],
    [!has('farm') && pop >= 12, 'farm'],
    [!has('food_plant') && pop >= 12, 'food_plant'],
    [!has('market') && pop >= 16, 'market'],
    [!has('pumping_station') && pop >= 30, 'pumping_station'],
    [!has('water_tower') && has('pumping_station') > 0, 'water_tower'],
    [!has('quarry') && pop >= 30, 'quarry'],
    [!has('oil_well') && pop >= 40, 'oil_well'],
    [!has('power_plant') && has('oil_well') > 0, 'power_plant'],
    [!has('cement_works') && has('power_plant') > 0, 'cement_works'],
    [!has('warehouse') && pop >= 50, 'warehouse'],
    [!has('police_station') && pop >= 60, 'police_station'],
    [!has('construction_office') && pop >= 60, 'construction_office'],
    [made('food') < (pop * CONSUMPTION.food * 60) / YEAR_SECONDS * 1.3 && has('farm') < has('food_plant') * 1.3 && pop >= 40, 'farm'],
    [has('farm') >= has('food_plant') * 1.3 && made('food') < used('food') * 1.2, 'food_plant'],
    [made('lumber') < used('lumber') + 6 && stock('lumber') < 60 && has('logging_camp') < 4, 'logging_camp'],
    [has('logging_camp') > has('sawmill') * 1.5, 'sawmill'],
    [stock('concrete') < 30 && has('cement_works') > 0 && has('quarry') <= has('cement_works'), 'quarry'],
    [!has('iron_mine') && pop >= 80, 'iron_mine'],
    [!has('steel_mill') && has('iron_mine') > 0, 'steel_mill'],
    [!has('oil_refinery') && has('steel_mill') > 0 && pop >= 120, 'oil_refinery'],
    [!has('goods_factory') && has('oil_refinery') > 0 && pc.population[1] >= 20, 'goods_factory'],
    // Each plant burns about two thirds of a well's oil.
    [pc.powerDemand > pc.powerSupply - 5 && has('power_plant') > 0 && has('oil_well') * 1.5 < has('power_plant') + 1, 'oil_well'],
    [pc.powerDemand > pc.powerSupply - 5 && has('power_plant') > 0 && has('oil_well') * 1.5 >= has('power_plant') + 1, 'power_plant'],
    [has('market') * 400 < pop, 'market'],
    [has('water_tower') * 350 < pop && has('pumping_station') > 0, 'water_tower'],
    [has('pumping_station') * 550 < pop, 'pumping_station'],
    [has('police_station') * 550 < pop && pop >= 60, 'police_station'],
    [!has('clinic') && pc.population[1] >= 30, 'clinic'],
    [!has('school') && pc.population[1] >= 30, 'school'],
  ];
  const services = new Set<string>(['market', 'water_tower', 'police_station', 'clinic', 'school']);
  const centre = houseCentre(world, p);
  for (const [cond, type] of wants) {
    if (!cond) continue;
    if (busy && type !== 'house') continue;
    if (type === 'house') {
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
