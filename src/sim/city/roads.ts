// Roads: placing and removing them (bridges over shallow water), road networks
// (connected components), which road tile serves each building, and breadth-first
// search along roads for trucks and service coverage.

import { ROAD } from '../../data/city.ts';
import { isOpenLand, Terrain, type GameMap, type TerrainId } from '../map.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import type { CityState } from './state.ts';

export const BRIDGE_DECK = 0.55;

const DX = [0, 1, 0, -1];
const DY = [1, 0, -1, 0];

/** Why a road cannot go on this tile (null: it can). Bridges are allowed over shallow water. */
export function roadProblem(world: World, player: number, tx: number, ty: number): string | null {
  const map = world.map;
  const city = world.city!;
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'Off the map';
  const i = ty * map.width + tx;
  if (city.road[i]) return 'Already a road';
  if (!roadAllowed(world, player, map.region[i]!) && !waterNextToOwned(world, player, tx, ty)) return 'Not your territory';
  if (world.occupancy[i]) return 'Blocked';
  const t = map.terrain[i] as TerrainId;
  if (isOpenLand(t) || t === Terrain.Forest) return null;
  if (t === Terrain.Shallow) return null;
  if (t === Terrain.Deep) return 'Too deep to bridge';
  return 'Too steep';
}

/**
 * Where a player may build roads: their own regions; the human player also on
 * unclaimed land and through city-states (to reach them for trade). AI players
 * keep to their own land.
 */
export function roadAllowed(world: World, player: number, region: number): boolean {
  if (!region) return false;
  const owner = world.city!.regionOwner[region]!;
  if (owner === player) return true;
  if (!world.players[player]?.isHuman) return false;
  return owner === -1 || world.players[owner]?.role === 'cityState';
}

/** Water tiles have no region: a bridge may start from (or cross to) land you own nearby. */
function waterNextToOwned(world: World, player: number, tx: number, ty: number): boolean {
  const map = world.map;
  const i = ty * map.width + tx;
  if (map.region[i] !== 0) return false;
  for (let r = 1; r <= 6; r++) {
    for (let k = 0; k < 4; k++) {
      const x = tx + DX[k]! * r;
      const y = ty + DY[k]! * r;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const reg = map.region[y * map.width + x]!;
      if (reg && roadAllowed(world, player, reg)) return true;
    }
  }
  return false;
}

export function isBridgeTile(map: GameMap, i: number): boolean {
  return map.terrain[i] === Terrain.Shallow || map.terrain[i] === Terrain.Bridge;
}

export function roadTileCost(map: GameMap, i: number): number {
  return isBridgeTile(map, i) ? ROAD.bridgeCost : ROAD.cost;
}

/** Lay roads on the given tiles (in order) as far as credits allow. Returns how many were built. */
export function placeRoads(world: World, player: number, tiles: ReadonlyArray<readonly [number, number]>): { built: number; problem: string | null } {
  const map = world.map;
  const city = world.city!;
  const pc = city.players[player]!;
  let built = 0;
  let problem: string | null = null;
  for (const [tx, ty] of tiles) {
    const why = roadProblem(world, player, tx, ty);
    if (why) {
      if (why !== 'Already a road') problem ??= why;
      continue;
    }
    const i = ty * map.width + tx;
    const cost = roadTileCost(map, i);
    if (pc.credits < cost) {
      problem = 'Not enough credits';
      break;
    }
    pc.credits -= cost;
    pc.year.construction += cost;
    setRoad(world, tx, ty, true);
    built++;
  }
  return { built, problem };
}

/** Put a road on a tile or take it away, fixing terrain, bridge decks and navigation. */
export function setRoad(world: World, tx: number, ty: number, on: boolean): void {
  const map = world.map;
  const city = world.city!;
  const i = ty * map.width + tx;
  if (on) {
    const t = map.terrain[i];
    if (t === Terrain.Forest) map.terrain[i] = Terrain.Grass;
    if (t === Terrain.Shallow) {
      map.terrain[i] = Terrain.Bridge;
      map.deck[i] = BRIDGE_DECK;
      city.road[i] = 2;
    } else {
      city.road[i] = 1;
    }
    city.roadCount++;
    city.condition[i] = 1;
  } else {
    if (!city.road[i]) return;
    if (city.road[i] === 2) {
      map.terrain[i] = Terrain.Shallow;
      map.deck[i] = 0;
    }
    city.road[i] = 0;
    city.condition[i] = 0;
    city.roadCount--;
  }
  refreshSurface(map, tx, ty);
  if (!world.occupancy[i]) world.nav.setBlocked(tx, ty, false, map);
  city.roadVersion++;
}

/** Recompute the surface height (bridge decks) at the four corners of a tile. */
function refreshSurface(map: GameMap, tx: number, ty: number): void {
  const w = map.width;
  for (let vy = ty; vy <= ty + 1; vy++) {
    for (let vx = tx; vx <= tx + 1; vx++) {
      let sum = 0;
      let n = 0;
      for (let oy = -1; oy <= 0; oy++) {
        for (let ox = -1; ox <= 0; ox++) {
          const x = vx + ox;
          const y = vy + oy;
          if (x < 0 || y < 0 || x >= w || y >= map.height) continue;
          const d = map.deck[y * w + x]!;
          if (d > 0) {
            sum += d;
            n++;
          }
        }
      }
      const vi = vy * (w + 1) + vx;
      map.vsurf[vi] = n > 0 ? sum / n : map.velev[vi]!;
    }
  }
}

/** Remove roads (no refund). */
export function removeRoads(world: World, player: number, tiles: ReadonlyArray<readonly [number, number]>): number {
  const map = world.map;
  const city = world.city!;
  let n = 0;
  for (const [tx, ty] of tiles) {
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
    const i = ty * map.width + tx;
    if (!city.road[i]) continue;
    const reg = map.nearRegion[i]!;
    if (reg && city.regionOwner[reg] !== player && city.regionOwner[reg] !== -1) continue;
    setRoad(world, tx, ty, false);
    n++;
  }
  return n;
}

/** Label connected road networks (if roads changed since the last time). */
export function updateComponents(city: CityState, map: GameMap): void {
  if (city.compVersion === city.roadVersion) return;
  city.compVersion = city.roadVersion;
  const { width: w, height: h } = map;
  const comp = city.comp;
  comp.fill(0);
  let next = 1;
  const queue = scratch(map).queue;
  for (let s = 0; s < comp.length; s++) {
    if (!city.road[s] || comp[s]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    comp[s] = next;
    while (head < tail) {
      const i = queue[head++]!;
      const tx = i % w;
      const ty = (i - tx) / w;
      for (let k = 0; k < 4; k++) {
        const x = tx + DX[k]!;
        const y = ty + DY[k]!;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = y * w + x;
        if (city.road[j] && !comp[j]) {
          comp[j] = next;
          queue[tail++] = j;
        }
      }
    }
    next++;
  }
}

/** The road tile a building is reached from: first road tile along its edge (bottom, right, top, left). */
export function findAccess(world: World, b: Pick<Building, 'tx' | 'ty' | 'w' | 'h'>): number {
  const map = world.map;
  const city = world.city!;
  const w = map.width;
  const check = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < map.height && city.road[y * w + x] ? y * w + x : -1;
  for (let x = b.tx; x < b.tx + b.w; x++) {
    const a = check(x, b.ty + b.h);
    if (a >= 0) return a;
  }
  for (let y = b.ty; y < b.ty + b.h; y++) {
    const a = check(b.tx + b.w, y);
    if (a >= 0) return a;
  }
  for (let x = b.tx; x < b.tx + b.w; x++) {
    const a = check(x, b.ty - 1);
    if (a >= 0) return a;
  }
  for (let y = b.ty; y < b.ty + b.h; y++) {
    const a = check(b.tx - 1, y);
    if (a >= 0) return a;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Breadth-first search along roads. Scratch buffers live outside the world (not saved).

interface Scratch {
  queue: Int32Array;
  parent: Int32Array;
  dist: Int32Array;
  stamp: Int32Array;
  run: number;
}

const scratches = new WeakMap<GameMap, Scratch>();

function scratch(map: GameMap): Scratch {
  let s = scratches.get(map);
  if (!s) {
    const n = map.width * map.height;
    s = { queue: new Int32Array(n), parent: new Int32Array(n), dist: new Int32Array(n), stamp: new Int32Array(n), run: 0 };
    scratches.set(map, s);
  }
  return s;
}

/**
 * Visit road tiles outward from `start` (nearest first, up to `maxDist`). `visit`
 * returns true to stop. Returns the tile it stopped on, or -1.
 */
export function searchRoads(world: World, start: number, maxDist: number, visit: (tile: number, dist: number) => boolean): number {
  const map = world.map;
  const road = world.city!.road;
  const s = scratch(map);
  s.run++;
  const { queue, parent, dist, stamp } = s;
  const w = map.width;
  const h = map.height;
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  stamp[start] = s.run;
  parent[start] = -1;
  dist[start] = 0;
  while (head < tail) {
    const i = queue[head++]!;
    const d = dist[i]!;
    if (visit(i, d)) return i;
    if (d >= maxDist) continue;
    const tx = i % w;
    const ty = (i - tx) / w;
    for (let k = 0; k < 4; k++) {
      const x = tx + DX[k]!;
      const y = ty + DY[k]!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (!road[j] || stamp[j] === s.run) continue;
      stamp[j] = s.run;
      parent[j] = i;
      dist[j] = d + 1;
      queue[tail++] = j;
    }
  }
  return -1;
}

/** The road path from the last search's start to `end` (tile indices, start first). */
export function pathTo(world: World, end: number): number[] {
  const s = scratch(world.map);
  const out: number[] = [];
  for (let i = end; i >= 0; i = s.parent[i]!) out.push(i);
  return out.reverse();
}
