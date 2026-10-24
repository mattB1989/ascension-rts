// The overseas market (DESIGN.md §7): trade ports send your surplus away and
// bring in what you lack, on cargo ships that sail in from the open sea. World
// prices drift a little over time. Rival and neighbour markets arrive in E5.

import { OVERSEAS } from '../../data/city.ts';
import { GOOD_IDS, GOODS, type GoodId } from '../../data/goods.ts';
import { fatan2 } from '../fmath.ts';
import { Terrain, type GameMap } from '../map.ts';
import { NavLayer } from '../nav.ts';
import { DT } from '../time.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { stockTotal } from './logistics.ts';
import { add, get, type Ship, type Stock } from './state.ts';

const isWater = (t: number) => t === Terrain.Deep || t === Terrain.Shallow || t === Terrain.Bridge;

const oceanCache = new WeakMap<GameMap, Uint8Array>();

/** Water tiles connected to the map edge (where ships come from). */
export function oceanReach(map: GameMap): Uint8Array {
  let r = oceanCache.get(map);
  if (r) return r;
  const { width: w, height: h } = map;
  r = new Uint8Array(w * h);
  const queue: number[] = [];
  const seed = (x: number, y: number) => {
    const i = y * w + x;
    if (!r![i] && isWater(map.terrain[i]!) && !map.fresh[i]) {
      r![i] = 1;
      queue.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      // Rivers count too: ships may sail up a river to a port on its bank.
      if (!r[j] && isWater(map.terrain[j]!)) {
        r[j] = 1;
        queue.push(j);
      }
    }
  }
  oceanCache.set(map, r);
  return r;
}

/** Water tile where ships tie up next to a port footprint, or -1. */
export function dockTile(map: GameMap, tx: number, ty: number, w: number, h: number): number {
  const reach = oceanReach(map);
  const W = map.width;
  let best = -1;
  let bestD = Infinity;
  const cx = tx + w / 2;
  const cy = ty + h / 2;
  for (let y = ty - 1; y <= ty + h; y++) {
    for (let x = tx - 1; x <= tx + w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= map.height) continue;
      if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
      const i = y * W + x;
      if (!reach[i]) continue;
      const d = (x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best;
}

/** Goods held across all of a player's buildings: storage, and producers' finished goods. */
export function updateStockpiles(world: World): void {
  const city = world.city!;
  for (const pc of city.players) pc.stockpile = {};
  for (const b of world.buildings) {
    const c = b.city;
    if (!c || !b.complete) continue;
    const pile = city.players[b.owner]!.stockpile;
    const e = b.def.econ!;
    if (e.storage) for (const g of GOOD_IDS) add(pile, g, get(c.stock, g));
    else if (e.recipe) for (const g of Object.keys(e.recipe.out) as GoodId[]) add(pile, g, get(c.stock, g));
  }
}

/** How much of `g` a port wants trucked in to export. */
export function exportDemand(world: World, port: Building, g: GoodId): number {
  const pc = world.city!.players[port.owner]!;
  const rule = pc.trade[g];
  if (!rule || rule.export < 0) return 0;
  const c = port.city!;
  const space = (port.def.econ!.storage ?? 0) - stockTotal(c.stock) - stockTotal(c.incoming);
  // The surplus that isn't already at (or heading to) this port.
  const surplus = get(pc.stockpile, g) - rule.export - get(c.stock, g) - get(c.incoming, g);
  return Math.max(0, Math.min(space, surplus, 40));
}

export function sellPrice(world: World, g: GoodId): number {
  return GOODS[g].price * world.city!.prices[g] * OVERSEAS.sell;
}

export function buyPrice(world: World, g: GoodId): number {
  return GOODS[g].price * world.city!.prices[g] * OVERSEAS.buy;
}

/** Once a second: prices drift, ships set out for ports that have business. */
export function updateTrade(world: World): void {
  const city = world.city!;
  const sec = Math.floor(world.tick / 15);
  if (sec % 30 === 0) {
    for (const g of GOOD_IDS) {
      const step = (world.rng.next() * 2 - 1) * OVERSEAS.drift;
      city.prices[g] = Math.max(OVERSEAS.min, Math.min(OVERSEAS.max, city.prices[g] * (1 + step)));
    }
  }
  for (const port of world.buildings) {
    if (port.type !== 'trade_port' || !port.complete || !port.city) continue;
    const c = port.city;
    if (city.ships.some((s) => s.port === port.id)) continue;
    if (c.workers <= 0) {
      c.status = 'No workers';
      continue;
    }
    const pc = city.players[port.owner]!;
    const hasExports = GOOD_IDS.some((g) => (pc.trade[g]?.export ?? -1) >= 0 && get(c.stock, g) >= 1);
    const wantsImports = GOOD_IDS.some((g) => (pc.trade[g]?.import ?? 0) > get(pc.stockpile, g) + 5);
    if (!hasExports && !wantsImports) {
      c.status = 'Idle: set what to import or export in 🚢 Trade';
      continue;
    }
    const route = seaRoute(world, port);
    if (!route) {
      c.status = 'No route to the open sea';
      continue;
    }
    c.status = 'Ship on its way';
    let length = 0;
    for (let i = 2; i < route.length; i += 2) {
      const dx = route[i]! - route[i - 2]!;
      const dy = route[i + 1]! - route[i - 1]!;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    const ship: Ship = { id: city.nextShipId++, owner: port.owner, port: port.id, path: route, pos: 0, prevPos: 0, length, phase: 'in', dock: 0, cargo: {} };
    city.ships.push(ship);
  }
}

const routeCache = new WeakMap<World, Map<number, number[] | null>>();

/** Sea route from the nearest edge of the map to a port's dock (flat x, y list). */
export function seaRoute(world: World, port: Building): number[] | null {
  let cache = routeCache.get(world);
  if (!cache) routeCache.set(world, (cache = new Map()));
  if (cache.has(port.id)) return cache.get(port.id)!;
  const map = world.map;
  const dock = dockTile(map, port.tx, port.ty, port.w, port.h);
  let route: number[] | null = null;
  if (dock >= 0) {
    const reach = oceanReach(map);
    const W = map.width;
    const dx = dock % W;
    const dy = (dock - dx) / W;
    // Nearest edge tile of open water.
    let best = -1;
    let bestD = Infinity;
    const consider = (x: number, y: number) => {
      const i = y * W + x;
      if (!reach[i] || map.fresh[i]) return;
      const d = (x - dx) * (x - dx) + (y - dy) * (y - dy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    };
    for (let x = 0; x < W; x++) {
      consider(x, 0);
      consider(x, map.height - 1);
    }
    for (let y = 0; y < map.height; y++) {
      consider(0, y);
      consider(W - 1, y);
    }
    if (best >= 0) {
      const sx = (best % W) + 0.5;
      const sy = Math.floor(best / W) + 0.5;
      const p = world.pathfinder.findPath(NavLayer.Water, sx, sy, dx + 0.5, dy + 0.5);
      if (p && p.length >= 2) {
        const ex = p[p.length - 2]!;
        const ey = p[p.length - 1]!;
        if (Math.floor(ex) === dx && Math.floor(ey) === dy) route = [sx, sy, ...p];
      }
    }
  }
  cache.set(port.id, route);
  return route;
}

/** Point at distance `d` along a route. */
export function routePoint(path: number[], d: number): { x: number; y: number; angle: number } {
  let left = d;
  for (let i = 2; i < path.length; i += 2) {
    const ax = path[i - 2]!;
    const ay = path[i - 1]!;
    const bx = path[i]!;
    const by = path[i + 1]!;
    const seg = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    if (left <= seg || i === path.length - 2) {
      const k = seg > 0 ? Math.min(1, left / seg) : 1;
      return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, angle: fatan2(by - ay, bx - ax) };
    }
    left -= seg;
  }
  return { x: path[0]!, y: path[1]!, angle: 0 };
}

/** Every tick: ships sail, dock (trade happens), and sail away. */
export function moveShips(world: World): void {
  const city = world.city!;
  const step = OVERSEAS.speed * DT;
  for (const s of [...city.ships]) {
    s.prevPos = s.pos;
    const port = world.getBuilding(s.port);
    if (s.phase === 'in') {
      if (!port) {
        s.phase = 'out';
        continue;
      }
      s.pos = Math.min(s.length, s.pos + step);
      if (s.pos >= s.length) {
        s.phase = 'docked';
        s.dock = OVERSEAS.dock;
        trade(world, s, port);
      }
    } else if (s.phase === 'docked') {
      s.dock -= DT;
      if (s.dock <= 0) s.phase = 'out';
    } else {
      s.pos = Math.max(0, s.pos - step);
      if (s.pos <= 0) {
        city.ships.splice(city.ships.indexOf(s), 1);
        if (port?.city) port.city.status = '';
      }
    }
  }
}

/** At the dock: sell what is waiting for export, buy what is wanted. */
function trade(world: World, ship: Ship, port: Building): void {
  const pc = world.city!.players[port.owner]!;
  const c = port.city!;
  let room = OVERSEAS.capacity;
  const sold: Stock = {};
  for (const g of GOOD_IDS) {
    const rule = pc.trade[g];
    if (!rule || rule.export < 0) continue;
    const n = Math.min(room, Math.floor(get(c.stock, g)));
    if (n <= 0) continue;
    add(c.stock, g, -n);
    room -= n;
    const income = n * sellPrice(world, g);
    pc.credits += income;
    pc.year.trade += income;
    sold[g] = n;
  }
  room = OVERSEAS.capacity;
  const space = () => (port.def.econ!.storage ?? 0) - stockTotal(c.stock) - stockTotal(c.incoming);
  for (const g of GOOD_IDS) {
    const rule = pc.trade[g];
    if (!rule || rule.import <= 0) continue;
    const want = Math.floor(rule.import - get(pc.stockpile, g));
    const price = buyPrice(world, g);
    const n = Math.min(want, room, Math.floor(space()), Math.floor(Math.max(0, pc.credits) / price));
    if (n <= 0) continue;
    add(c.stock, g, n);
    add(pc.stockpile, g, n);
    room -= n;
    pc.credits -= n * price;
    pc.year.imports += n * price;
  }
  ship.cargo = sold;
}
