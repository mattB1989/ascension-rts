// Placing and demolishing buildings in the economy game, and how good the land
// under a raw producer is.

import { BUILDINGS, type BuildingTypeId } from '../../data/buildings.ts';
import type { BuildingDef } from '../../data/types.ts';
import { Deposit, isOpenLand, Terrain, type GameMap, type TerrainId } from '../map.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { findAccess } from './roads.ts';
import { dockTile } from './trade.ts';
import { add, newCityBuilding } from './state.ts';

const FERTILITY: Partial<Record<TerrainId, number>> = {
  [Terrain.Fertile]: 1,
  [Terrain.Grass]: 0.6,
  [Terrain.Beach]: 0.3,
  [Terrain.Sand]: 0.2,
};

const isWaterT = (t: number) => t === Terrain.Shallow || t === Terrain.Deep;

function countAround(map: GameMap, tx: number, ty: number, w: number, h: number, r: number, pred: (i: number) => boolean): number {
  let n = 0;
  for (let y = ty - r; y < ty + h + r; y++) {
    for (let x = tx - r; x < tx + w + r; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
      if (pred(y * map.width + x)) n++;
    }
  }
  return n;
}

function touches(map: GameMap, tx: number, ty: number, w: number, h: number, pred: (i: number) => boolean): boolean {
  for (let x = tx; x < tx + w; x++) {
    for (const y of [ty - 1, ty + h]) if (y >= 0 && y < map.height && pred(y * map.width + x)) return true;
  }
  for (let y = ty; y < ty + h; y++) {
    for (const x of [tx - 1, tx + w]) if (x >= 0 && x < map.width && pred(y * map.width + x)) return true;
  }
  return false;
}

/**
 * How productive a raw producer would be here, 0..1 (1 for everything else),
 * and a short explanation for the placement preview.
 */
export function landYield(map: GameMap, def: BuildingDef, tx: number, ty: number): { yield: number; note: string } {
  const [w, h] = def.size;
  const tiles: number[] = [];
  for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) if (x >= 0 && y >= 0 && x < map.width && y < map.height) tiles.push(y * map.width + x);
  const deposit = (d: number) => tiles.filter((i) => map.deposit[i] === d).length;
  switch (def.placement) {
    case 'fertile': {
      const f = tiles.reduce((s, i) => s + (FERTILITY[map.terrain[i] as TerrainId] ?? 0), 0) / Math.max(1, tiles.length);
      return { yield: f, note: `Fertility ${Math.round(f * 100)}%` };
    }
    case 'forest': {
      const n = countAround(map, tx, ty, w, h, 5, (i) => map.terrain[i] === Terrain.Forest);
      const y = Math.min(1, n / 40);
      return { yield: y, note: `Forest nearby: ${Math.round(y * 100)}%` };
    }
    case 'stone':
    case 'ore':
    case 'oil': {
      const d = def.placement === 'stone' ? Deposit.Stone : def.placement === 'ore' ? Deposit.Ore : Deposit.Oil;
      const n = deposit(d);
      const y = Math.min(1, n / Math.max(2, Math.ceil(tiles.length * 0.6)));
      return { yield: y, note: `Deposit under it: ${Math.round(y * 100)}%` };
    }
    case 'coast': {
      const n = countAround(map, tx, ty, w, h, 6, (i) => isWaterT(map.terrain[i]!));
      const y = Math.min(1, n / 70);
      return { yield: y, note: `Fishing waters: ${Math.round(y * 100)}%` };
    }
    default:
      return { yield: 1, note: '' };
  }
}

/** Why `type` cannot go at (tx, ty) for this player (null: it can). Position and territory only. */
export function cityPlacementProblem(world: World, player: number, type: BuildingTypeId, tx: number, ty: number): string | null {
  const def: BuildingDef = BUILDINGS[type];
  const map = world.map;
  const city = world.city!;
  const [w, h] = def.size;
  if (tx < 0 || ty < 0 || tx + w > map.width || ty + h > map.height) return 'Off the map';
  const regional = type === 'regional_office';
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      const i = y * map.width + x;
      const owner = city.regionOwner[map.region[i]!]!;
      if (regional ? owner !== -1 || map.region[i] === 0 : owner !== player) return regional ? 'Must be in unclaimed land' : 'Not your territory';
      if (world.occupancy[i]) return 'Blocked';
      if (city.road[i]) return 'On a road';
      const t = map.terrain[i] as TerrainId;
      if (!isOpenLand(t) && !(t === Terrain.Forest && def.placement !== 'forest')) return 'Must be on open ground';
    }
  }
  if (regional) {
    const reg = map.region[ty * map.width + tx]!;
    const near = map.regions[reg - 1]?.neighbors.some((n) => city.regionOwner[n] === player);
    if (!near) return 'Must border your territory';
  }
  const { yield: y } = landYield(map, def, tx, ty);
  switch (def.placement) {
    case 'fertile':
      if (y < 0.3) return 'Needs farmland';
      break;
    case 'forest':
      if (y < 0.2) return 'Needs forest nearby';
      break;
    case 'stone':
      if (y <= 0) return 'Must be on a stone deposit';
      break;
    case 'ore':
      if (y <= 0) return 'Must be on an ore deposit';
      break;
    case 'oil':
      if (y <= 0) return 'Must be on an oil deposit';
      break;
    case 'coast':
      if (!touches(map, tx, ty, w, h, (i) => isWaterT(map.terrain[i]!))) return 'Must touch the water';
      if (type === 'trade_port') {
        if (dockTile(map, tx, ty, w, h) < 0) return 'Must be on water that reaches the open sea';
      } else if (y < 0.2) return 'Needs open water';
      break;
    case 'freshWater':
      if (!touches(map, tx, ty, w, h, (i) => map.fresh[i] === 1)) return 'Must touch a river or lake';
      break;
  }
  return null;
}

/** Lock reason that isn't about position: limits, credits. */
export function cityBuildProblem(world: World, player: number, type: BuildingTypeId): string | null {
  const def: BuildingDef = BUILDINGS[type];
  if (def.mode === 'skirmish' || !def.econ) return 'Not available';
  if (def.limit !== undefined && world.buildings.filter((b) => b.owner === player && b.type === type).length >= def.limit) return `Limit ${def.limit}`;
  if (world.city!.players[player]!.credits < def.econ.credits) return 'Not enough credits';
  return null;
}

/** Place a building: pay, lay the foundation. Returns the building or a reason. */
export function placeCityBuilding(world: World, player: number, type: BuildingTypeId, tx: number, ty: number): Building | string {
  const why = cityBuildProblem(world, player, type) ?? cityPlacementProblem(world, player, type, tx, ty);
  if (why) return why;
  const def: BuildingDef = BUILDINGS[type];
  const pc = world.city!.players[player]!;
  pc.credits -= def.econ!.credits;
  pc.year.construction += def.econ!.credits;
  return addCityBuilding(world, type, player, tx, ty, false);
}

/** Create a city building (also used to set up the start). Clears forest under it. */
export function addCityBuilding(world: World, type: BuildingTypeId, owner: number, tx: number, ty: number, complete: boolean): Building {
  const map = world.map;
  const def: BuildingDef = BUILDINGS[type];
  const [w, h] = def.size;
  const { yield: y } = landYield(map, def, tx, ty);
  for (let yy = ty; yy < ty + h; yy++) {
    for (let x = tx; x < tx + w; x++) {
      const i = yy * map.width + x;
      if (map.terrain[i] === Terrain.Forest) map.terrain[i] = Terrain.Grass;
    }
  }
  const b = world.addBuilding(type, owner, tx, ty, complete);
  const c = newCityBuilding();
  c.yield = y;
  c.access = findAccess(world, b);
  b.city = c;
  return b;
}

/** Demolish a building: no refund; whatever it stored is lost, trucks heading there turn back. */
export function demolish(world: World, b: Building): void {
  world.removeBuilding(b);
}

/** Give a building some goods (start stock, tests). */
export function stockUp(b: Building, goods: Partial<Record<string, number>>): void {
  for (const [g, n] of Object.entries(goods)) add(b.city!.stock, g as never, n!);
}
