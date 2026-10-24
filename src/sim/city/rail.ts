// Railways (DESIGN.md §6): track drawn like roads (level crossings allowed, and
// over road bridges), stations that are warehouses on the line, and trains that
// carry big loads fast between stations of the same network. A station collects
// goods that other stations on its line want (what the buildings around them are
// short of), so trucks drop them at the nearest station and trains do the long haul.

import { isOpenLand, Terrain, type TerrainId } from '../map.ts';
import { GOOD_IDS, type GoodId } from '../../data/goods.ts';
import { DT } from '../time.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { pathTo, roadAllowed, searchRoads } from './roads.ts';
import { add, get, type Stock } from './state.ts';

export const RAIL = {
  cost: 40,
  upkeepPerYear: 2,
  /** Tiles per second. */
  speed: 8,
  /** Units a train carries. */
  load: 60,
  /** Smallest load worth a trip. */
  minLoad: 15,
  /** Road tiles around a station whose needs it serves. */
  reach: 40,
} as const;

export interface Train {
  id: number;
  owner: number;
  /** Station it belongs to and goes back to. */
  home: number;
  to: number;
  path: number[];
  pos: number;
  prevPos: number;
  phase: 'out' | 'back';
  good: GoodId | null;
  amount: number;
}

/** Why a railway cannot go on this tile (null: it can). */
export function railProblem(world: World, player: number, tx: number, ty: number): string | null {
  const map = world.map;
  const city = world.city!;
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'Off the map';
  const i = ty * map.width + tx;
  if (city.rail[i]) return 'Already a railway';
  if (!roadAllowed(world, player, map.nearRegion[i]!)) return 'Not your territory';
  if (world.occupancy[i]) return 'Blocked';
  const t = map.terrain[i] as TerrainId;
  if (isOpenLand(t) || t === Terrain.Forest) return null;
  if (t === Terrain.Bridge) return null;
  if (t === Terrain.Shallow || t === Terrain.Deep) return 'Railways cross water on road bridges';
  return 'Too steep';
}

export function placeRails(world: World, player: number, tiles: ReadonlyArray<readonly [number, number]>): { built: number; problem: string | null } {
  const pc = world.city!.players[player]!;
  let built = 0;
  let problem: string | null = null;
  for (const [tx, ty] of tiles) {
    const why = railProblem(world, player, tx, ty);
    if (why) {
      if (why !== 'Already a railway') problem ??= why;
      continue;
    }
    if (pc.credits < RAIL.cost) {
      problem = 'Not enough credits';
      break;
    }
    pc.credits -= RAIL.cost;
    pc.year.construction += RAIL.cost;
    setRail(world, tx, ty, true);
    built++;
  }
  return { built, problem };
}

export function setRail(world: World, tx: number, ty: number, on: boolean): void {
  const map = world.map;
  const city = world.city!;
  const i = ty * map.width + tx;
  if (on === !!city.rail[i]) return;
  if (on && map.terrain[i] === Terrain.Forest) map.terrain[i] = Terrain.Grass;
  city.rail[i] = on ? 1 : 0;
  city.railCount += on ? 1 : -1;
  city.railVersion++;
}

/** Remove railways (no refund). */
export function removeRails(world: World, player: number, tiles: ReadonlyArray<readonly [number, number]>): number {
  const map = world.map;
  const city = world.city!;
  let n = 0;
  for (const [tx, ty] of tiles) {
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
    const i = ty * map.width + tx;
    if (!city.rail[i]) continue;
    const reg = map.nearRegion[i]!;
    if (reg && city.regionOwner[reg] !== player && city.regionOwner[reg] !== -1) continue;
    setRail(world, tx, ty, false);
    n++;
  }
  return n;
}

/** The rail tile a station is reached from (first rail tile along its edge), or -1. */
export function railAccess(world: World, b: Pick<Building, 'tx' | 'ty' | 'w' | 'h'>): number {
  const map = world.map;
  const rail = world.city!.rail;
  const w = map.width;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < map.height && rail[y * w + x] ? y * w + x : -1);
  for (let x = b.tx; x < b.tx + b.w; x++) for (const y of [b.ty + b.h, b.ty - 1]) {
    const a = at(x, y);
    if (a >= 0) return a;
  }
  for (let y = b.ty; y < b.ty + b.h; y++) for (const x of [b.tx + b.w, b.tx - 1]) {
    const a = at(x, y);
    if (a >= 0) return a;
  }
  return -1;
}

function stations(world: World, owner: number): Building[] {
  return world.buildings.filter((b) => b.type === 'rail_station' && b.owner === owner && b.complete && b.city);
}

/** What the buildings around a station are short of (computed every few seconds). */
function updateWants(world: World, idx: Map<number, Building[]>, demand: (b: Building, g: GoodId) => number): void {
  for (const s of world.buildings) {
    if (s.type !== 'rail_station' || !s.complete || !s.city) continue;
    const c = s.city;
    const wants: Stock = {};
    c.rail = railAccess(world, s);
    if (c.access >= 0) {
      searchRoads(world, c.access, RAIL.reach, (tile) => {
        const list = idx.get(tile);
        if (!list) return false;
        for (const b of list) {
          if (b === s || b.owner !== s.owner || !b.city || b.type === 'rail_station' || b.type === 'trade_port') continue;
          for (const g of GOOD_IDS) {
            const d = demand(b, g);
            if (d > 0) add(wants, g, d);
          }
        }
        return false;
      });
    }
    c.wants = wants;
  }
}

/** Goods this station should collect for others on its line (trucks bring them; see demandFor). */
export function stationDemand(world: World, s: Building, g: GoodId): number {
  const c = s.city!;
  if (c.rail === undefined || c.rail < 0) return 0;
  const comp = world.city!.railComp[c.rail]!;
  if (!comp) return 0;
  let want = 0;
  for (const d of stations(world, s.owner)) {
    if (d === s || d.city!.rail === undefined || d.city!.rail < 0 || world.city!.railComp[d.city!.rail] !== comp) continue;
    want += Math.max(0, get(d.city!.wants ?? {}, g) - get(d.city!.stock, g) - get(d.city!.incoming, g));
  }
  return Math.max(0, Math.min(RAIL.load * 2, want) - get(c.stock, g) - get(c.incoming, g));
}

/** A station with an idle train sends it where its goods are wanted most. */
function dispatchTrain(world: World, s: Building): void {
  const city = world.city!;
  const c = s.city!;
  const e = s.def.econ!;
  if ((e.trains ?? 0) <= (c.trainsOut ?? 0) || c.rail === undefined || c.rail < 0 || c.workers <= 0) return;
  const comp = city.railComp[c.rail]!;
  let best: { d: Building; g: GoodId; n: number } | null = null;
  for (const d of stations(world, s.owner)) {
    if (d === s || d.city!.rail === undefined || d.city!.rail < 0 || city.railComp[d.city!.rail] !== comp) continue;
    for (const g of GOOD_IDS) {
      const spare = get(c.stock, g) - get(c.wants ?? {}, g);
      if (spare < 1) continue;
      const want = get(d.city!.wants ?? {}, g) - get(d.city!.stock, g) - get(d.city!.incoming, g);
      const n = Math.floor(Math.min(spare, want, RAIL.load));
      if (n >= Math.min(RAIL.minLoad, want) && n >= 1 && (!best || n > best.n)) best = { d, g, n };
    }
  }
  if (!best) return;
  const goal = best.d.city!.rail!;
  const end = searchRoads(world, c.rail, 10000, (tile) => tile === goal, city.rail);
  if (end < 0) return;
  const path = pathTo(world, end);
  add(c.stock, best.g, -best.n);
  add(best.d.city!.incoming, best.g, best.n);
  c.trainsOut = (c.trainsOut ?? 0) + 1;
  city.trains.push({ id: city.nextTrainId++, owner: s.owner, home: s.id, to: best.d.id, path, pos: 0, prevPos: 0, phase: 'out', good: best.g, amount: best.n });
}

function finishTrain(world: World, t: Train): void {
  const city = world.city!;
  city.trains.splice(city.trains.indexOf(t), 1);
  const home = world.getBuilding(t.home);
  if (home?.city) {
    home.city.trainsOut = Math.max(0, (home.city.trainsOut ?? 1) - 1);
    if (t.good && t.amount > 0) add(home.city.stock, t.good, t.amount);
  }
}

/** Every tick: trains run; once a second each station may send one; every 5 s stations work out what they need. */
export function updateRail(world: World, idx: Map<number, Building[]>, demand: (b: Building, g: GoodId) => number): void {
  const city = world.city!;
  if (!city.railCount && !city.trains.length) return;
  const step = RAIL.speed * DT;
  for (const t of [...city.trains]) {
    t.prevPos = t.pos;
    const last = t.path.length - 1;
    const next = Math.min(last, t.pos + step);
    const k = Math.min(last, Math.ceil(next));
    if (!city.rail[t.path[k]!]) {
      // Track taken up: the train is lost, its cargo goes back to the station.
      if (t.phase === 'out' && t.good) {
        const dest = world.getBuilding(t.to);
        if (dest?.city) add(dest.city.incoming, t.good, -t.amount);
      }
      finishTrain(world, t);
      continue;
    }
    t.pos = next;
    if (t.pos < last) continue;
    if (t.phase === 'back') {
      finishTrain(world, t);
      continue;
    }
    const dest = world.getBuilding(t.to);
    if (dest?.city && t.good) {
      add(dest.city.incoming, t.good, -t.amount);
      add(dest.city.stock, t.good, t.amount);
    }
    t.good = null;
    t.amount = 0;
    t.path = t.path.slice().reverse();
    t.pos = t.prevPos = 0;
    t.phase = 'back';
  }
  const sec = Math.floor(world.tick / 15);
  if (world.tick % 15 === 7 && sec % 5 === 0) updateWants(world, idx, demand);
  const slot = world.tick % 15;
  for (const b of world.buildings) if (b.type === 'rail_station' && b.complete && b.city && b.id % 15 === slot) dispatchTrain(world, b);
}

let railOwners: { world: World; version: number; counts: number[] } | null = null;

/** Rail tiles per owner (for upkeep), recounted when the railways change. */
export function railsByOwner(world: World): number[] {
  const city = world.city!;
  if (railOwners && railOwners.world === world && railOwners.version === city.railVersion) return railOwners.counts;
  const counts = new Array(world.players.length).fill(0);
  railOwners = { world, version: city.railVersion, counts };
  if (!city.railCount) return counts;
  const near = world.map.nearRegion;
  for (let i = 0; i < city.rail.length; i++) {
    if (!city.rail[i]) continue;
    const o = city.regionOwner[near[i]!] ?? -1;
    counts[o >= 0 ? o : 0]++;
  }
  return counts;
}
