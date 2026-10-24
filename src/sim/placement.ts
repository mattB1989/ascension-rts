// Where buildings may go, and what is missing when they may not.

import { AGE_ORDER } from '../data/ages.ts';
import { BUILDINGS, type BuildingTypeId } from '../data/buildings.ts';
import type { BuildingDef, Cost } from '../data/types.ts';
import { isOpenLand, Terrain, type TerrainId } from './map.ts';
import { NavLayer } from './nav.ts';
import type { PlayerState } from './types.ts';
import type { World } from './world.ts';

export function ageIndex(age: string): number {
  return AGE_ORDER.indexOf(age as never);
}

export function canAfford(p: PlayerState, cost: Cost): boolean {
  return p.res.ore >= cost.ore && p.res.energy >= cost.energy;
}

export function pay(p: PlayerState, cost: Cost): void {
  p.res.ore -= cost.ore;
  p.res.energy -= cost.energy;
}

export function refund(p: PlayerState, cost: Cost): void {
  p.res.ore += cost.ore;
  p.res.energy += cost.energy;
}

/**
 * Why a player cannot build this type at all right now (age, prerequisites, limit),
 * or null if they can. Does not check cost or position.
 */
export function buildLockReason(world: World, player: number, type: BuildingTypeId): string | null {
  const def: BuildingDef = BUILDINGS[type];
  const p = world.players[player]!;
  if (ageIndex(def.age) > ageIndex(p.age)) return `Needs the ${def.age[0]!.toUpperCase()}${def.age.slice(1)} Age`;
  const missing = def.requires.filter((r) => !world.hasCompleted(player, r as BuildingTypeId));
  if (missing.length) return `Needs ${missing.map((r) => BUILDINGS[r as BuildingTypeId].name).join(' + ')}`;
  if (def.limit !== undefined && world.buildingsOf(player).filter((b) => b.type === type).length >= def.limit) {
    return `Limit ${def.limit}`;
  }
  return null;
}

const isLand = isOpenLand;
const isOpenWater = (t: TerrainId) => t === Terrain.Shallow || t === Terrain.Deep;

/**
 * Can `type` be placed with its top-left tile at (tx, ty)? Returns null if yes,
 * otherwise a short reason. Checks position only (not cost or prerequisites).
 */
export function placementProblem(world: World, player: number, type: BuildingTypeId, tx: number, ty: number): string | null {
  const def: BuildingDef = BUILDINGS[type];
  const [w, h] = def.size;
  const map = world.map;
  const p = world.players[player]!;
  if (tx < 0 || ty < 0 || tx + w > map.width || ty + h > map.height) return 'Off the map';

  let oil = -1;
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      const i = y * map.width + x;
      if (!p.explored[i]) return 'Unexplored';
      if (world.occupancy[i] !== 0) {
        // Gates may replace a segment of the player's own finished wall.
        const occ = world.getBuilding(world.occupancy[i]!);
        if (!(type === 'gate' && occ && occ.type === 'wall' && occ.owner === player && occ.complete)) return 'Blocked';
      }
      const t = map.terrain[i] as TerrainId;
      const wantWater = def.placement === 'seaOil' || def.placement === 'water';
      if (wantWater ? !isOpenWater(t) : !isLand(t)) return wantWater ? 'Must be on open water' : 'Must be on open ground';
      const r = world.resourceAtTile.get(i);
      if (r !== undefined) {
        const res = world.resources[r]!;
        if (res.kind === 'oil' && res.claimedBy === 0) oil = r;
        else return 'Blocked';
      }
    }
  }
  if ((def.placement === 'landOil' || def.placement === 'seaOil') && oil < 0) return 'Must be placed on an oil spot';
  if (def.placement !== 'landOil' && def.placement !== 'seaOil' && oil >= 0) return 'Oil spots are for derricks and rigs';

  if (def.placement === 'coast') {
    let water = 0;
    for (let y = ty - 1; y <= ty + h; y++) {
      for (let x = tx - 1; x <= tx + w; x++) {
        if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        if (isOpenWater(map.terrain[y * map.width + x] as TerrainId)) water++;
      }
    }
    if (water < 3) return 'Must touch the water';
  }

  // Units standing in the footprint (other than the player's own, which step aside).
  for (const u of world.units) {
    if (u.layer === NavLayer.Air) continue;
    if (u.owner === player) continue;
    if (u.x >= tx && u.x < tx + w && u.y >= ty && u.y < ty + h) return 'Units in the way';
  }
  return null;
}

/** Oil spot index under a footprint, or -1. */
export function oilUnder(world: World, tx: number, ty: number, w: number, h: number): number {
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      const r = world.resourceAtTile.get(y * world.map.width + x);
      if (r !== undefined && world.resources[r]!.kind === 'oil') return r;
    }
  }
  return -1;
}

/** Best top-left tile to place a building of size (w, h) centred near world point (x, y). */
export function footprintAt(type: BuildingTypeId, x: number, y: number): [number, number] {
  const [w, h] = BUILDINGS[type].size;
  return [Math.round(x - w / 2), Math.round(y - h / 2)];
}

/**
 * Nearest valid top-left tile for a building near (x, y), searching outward in rings.
 * Leaves a one-tile gap around other buildings so units can always walk between them.
 */
export function findPlacement(world: World, player: number, type: BuildingTypeId, x: number, y: number, maxR = 24): [number, number] | null {
  const [w, h] = BUILDINGS[type].size;
  const cx = Math.round(x - w / 2);
  const cy = Math.round(y - h / 2);
  const spot = BUILDINGS[type].placement === 'landOil' || BUILDINGS[type].placement === 'seaOil';
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (placementProblem(world, player, type, tx, ty) !== null) continue;
        if (!spot && !hasClearance(world, tx, ty, w, h)) continue;
        return [tx, ty];
      }
    }
  }
  return null;
}

function hasClearance(world: World, tx: number, ty: number, w: number, h: number): boolean {
  for (let y = ty - 1; y <= ty + h; y++) {
    for (let x = tx - 1; x <= tx + w; x++) {
      if (x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) continue;
      if (world.occupancy[y * world.map.width + x] !== 0) return false;
    }
  }
  return true;
}

/**
 * Tiles from (x0, y0) to (x1, y1), 4-connected (each tile shares an edge with the
 * next) so a wall drawn on a diagonal has no gaps units could slip through.
 */
export function lineTiles(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[x0, y0]];
  const nx = Math.abs(x1 - x0);
  const ny = Math.abs(y1 - y0);
  const sx = x1 > x0 ? 1 : -1;
  const sy = y1 > y0 ? 1 : -1;
  let x = x0;
  let y = y0;
  // Walk the grid: always take the step whose crossing comes first along the ideal line.
  for (let ix = 0, iy = 0; (ix < nx || iy < ny) && out.length < 400; ) {
    if ((0.5 + ix) * ny < (0.5 + iy) * nx) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    out.push([x, y]);
  }
  return out;
}
