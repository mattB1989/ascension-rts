// Pipelines (DESIGN.md §6): drawn like roads, they carry crude oil and fuel with
// no trucks at all. Every building touching a pipeline network belongs to it: oil
// wells and refineries feed it, refineries, power plants and launch sites draw
// from it, up to a flow per network each second.

import { isOpenLand, Terrain, type TerrainId } from '../map.ts';
import type { GoodId } from '../../data/goods.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { roadAllowed } from './roads.ts';
import { add, get } from './state.ts';

export const PIPE = {
  cost: 20,
  upkeepPerYear: 1,
  /** Units a network moves per second, per good. */
  flow: 4,
  goods: ['oil', 'fuel'] as const satisfies readonly GoodId[],
} as const;

export function pipeProblem(world: World, player: number, tx: number, ty: number): string | null {
  const map = world.map;
  const city = world.city!;
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'Off the map';
  const i = ty * map.width + tx;
  if (city.pipe[i]) return 'Already a pipeline';
  if (!roadAllowed(world, player, map.nearRegion[i]!)) return 'Not your territory';
  if (world.occupancy[i]) return 'Blocked';
  const t = map.terrain[i] as TerrainId;
  if (isOpenLand(t) || t === Terrain.Forest || t === Terrain.Bridge || t === Terrain.Shallow) return null;
  if (t === Terrain.Deep) return 'Too deep';
  return 'Too steep';
}

export function placePipes(world: World, player: number, tiles: ReadonlyArray<readonly [number, number]>): { built: number; problem: string | null } {
  const pc = world.city!.players[player]!;
  let built = 0;
  let problem: string | null = null;
  for (const [tx, ty] of tiles) {
    const why = pipeProblem(world, player, tx, ty);
    if (why) {
      if (why !== 'Already a pipeline') problem ??= why;
      continue;
    }
    if (pc.credits < PIPE.cost) {
      problem = 'Not enough credits';
      break;
    }
    pc.credits -= PIPE.cost;
    pc.year.construction += PIPE.cost;
    setPipe(world, tx, ty, true);
    built++;
  }
  return { built, problem };
}

export function setPipe(world: World, tx: number, ty: number, on: boolean): void {
  const map = world.map;
  const city = world.city!;
  const i = ty * map.width + tx;
  if (on === !!city.pipe[i]) return;
  if (on && map.terrain[i] === Terrain.Forest) map.terrain[i] = Terrain.Grass;
  city.pipe[i] = on ? 1 : 0;
  city.pipeCount += on ? 1 : -1;
  city.pipeVersion++;
}

export function removePipes(world: World, player: number, tiles: ReadonlyArray<readonly [number, number]>): number {
  const map = world.map;
  const city = world.city!;
  let n = 0;
  for (const [tx, ty] of tiles) {
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
    const i = ty * map.width + tx;
    if (!city.pipe[i]) continue;
    const reg = map.nearRegion[i]!;
    if (reg && city.regionOwner[reg] !== player && city.regionOwner[reg] !== -1) continue;
    setPipe(world, tx, ty, false);
    n++;
  }
  return n;
}

/** The pipeline network a building touches (0: none). */
export function pipeNetwork(world: World, b: Pick<Building, 'tx' | 'ty' | 'w' | 'h'>): number {
  const map = world.map;
  const city = world.city!;
  const w = map.width;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < map.height ? city.pipeComp[y * w + x]! : 0);
  for (let x = b.tx; x < b.tx + b.w; x++) for (const y of [b.ty - 1, b.ty + b.h]) if (at(x, y)) return at(x, y);
  for (let y = b.ty; y < b.ty + b.h; y++) for (const x of [b.tx - 1, b.tx + b.w]) if (at(x, y)) return at(x, y);
  return 0;
}

/** Once a second: on each network, oil and fuel flow from producers to whoever needs them. */
export function updatePipes(world: World, demand: (b: Building, g: GoodId) => number): void {
  const city = world.city!;
  if (!city.pipeCount) return;
  const nets = new Map<string, Building[]>();
  for (const b of world.buildings) {
    if (!b.complete || !b.city || !b.def.econ) continue;
    const net = pipeNetwork(world, b);
    b.city.pipe = net;
    if (!net) continue;
    const k = `${b.owner}:${net}`;
    let list = nets.get(k);
    if (!list) nets.set(k, (list = []));
    list.push(b);
  }
  for (const list of nets.values()) {
    for (const g of PIPE.goods) {
      const sources = list.filter((b) => b.def.econ!.recipe?.out[g] && get(b.city!.stock, g) >= 0.5);
      if (!sources.length) continue;
      let flow: number = PIPE.flow;
      for (const c of list) {
        if (flow <= 0) break;
        if (c.def.econ!.recipe?.out[g]) continue;
        const want = Math.min(flow, demand(c, g));
        if (want <= 0) continue;
        let got = 0;
        for (const s of sources) {
          const n = Math.min(want - got, get(s.city!.stock, g));
          if (n <= 0) continue;
          add(s.city!.stock, g, -n);
          got += n;
          if (got >= want) break;
        }
        add(c.city!.stock, g, got);
        flow -= got;
      }
    }
  }
}

let pipeOwners: { world: World; version: number; counts: number[] } | null = null;

/** Pipeline tiles per owner (for upkeep). */
export function pipesByOwner(world: World): number[] {
  const city = world.city!;
  if (pipeOwners && pipeOwners.world === world && pipeOwners.version === city.pipeVersion) return pipeOwners.counts;
  const counts = new Array(world.players.length).fill(0);
  pipeOwners = { world, version: city.pipeVersion, counts };
  const near = world.map.nearRegion;
  for (let i = 0; i < city.pipe.length; i++) {
    if (!city.pipe[i]) continue;
    const o = city.regionOwner[near[i]!] ?? -1;
    counts[o >= 0 ? o : 0]++;
  }
  return counts;
}
