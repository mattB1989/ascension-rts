// Logistics: trucks carry goods along roads from where they are (producers,
// warehouses, the town hall) to where they are needed (factories, markets,
// construction sites), or from producers into storage when nobody needs them yet.
// Construction crews drive out to sites whose materials have arrived.
//
// Every source looks for work once per second (staggered by id): a breadth-first
// search along the roads finds the nearest building that wants one of its goods.

import { ROAD } from '../../data/city.ts';
import { GOOD_IDS, TRUCK_LOAD, type GoodId } from '../../data/goods.ts';
import { DT } from '../time.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { pathTo, searchRoads } from './roads.ts';
import { add, automatable, get, type Stock, type Truck } from './state.ts';
import { exportDemand } from './trade.ts';
import { dealFor, marketOf, settle, stateOffers, stateWants, theyCharge, theyPay } from './diplomacy.ts';
import { canTrade } from './treaties.ts';
import { RAIL, stationDemand } from './rail.ts';

/** Inputs a factory keeps on hand: this many production cycles. */
const INPUT_CYCLES = 4;
/** Stock a market tries to hold of each thing it sells. */
export const MARKET_STOCK = 60;
/** Outputs a producer can hold before it stops (waiting for trucks). */
export const OUTPUT_CAP = 30;
const MAX_TRIP = 220;
/** Trips to city-states may be longer. */
const TRADE_TRIP = 400;
const MAX_CREWS_PER_SITE = 3;

export function stockTotal(s: Stock): number {
  let n = 0;
  for (const g of GOOD_IDS) n += s[g] ?? 0;
  return n;
}

/** Units of `g` this building wants delivered (after what is already on its way). */
export function demandFor(b: Building, g: GoodId, world?: World): number {
  const c = b.city;
  const e = b.def.econ;
  if (!c || !e) return 0;
  if (b.type === 'trade_port' && b.complete) return world ? exportDemand(world, b, g) : 0;
  if ((b.type === 'rail_station' || b.type === 'airport' || b.type === 'river_dock') && b.complete) return world ? stationDemand(world, b, g) : 0;
  const incoming = get(c.incoming, g);
  if (!b.complete) {
    if (b.type === 'house') return 0;
    return Math.max(0, (e.materials[g] ?? 0) - get(c.delivered, g) - incoming);
  }
  if (e.recipe) {
    const per = e.recipe.in[g];
    if (per) return Math.max(0, Math.max(TRUCK_LOAD, per * INPUT_CYCLES) - get(c.stock, g) - incoming);
  }
  if (e.service?.kind === 'market' && (g === 'food' || g === 'goods' || g === 'electronics' || g === 'pharma')) return Math.max(0, MARKET_STOCK - get(c.stock, g) - incoming);
  // Nano age: robots for farms, mines and factories (they then need half the staff).
  if (g === 'robotics' && world && (world.city?.players[b.owner]?.age ?? 0) >= 2 && automatable(b)) return Math.max(0, 2 - get(c.stock, g) - incoming);
  const sup = e.supplies?.[g];
  if (sup) return Math.max(0, sup - get(c.stock, g) - incoming);
  return 0;
}

/** Free space in a warehouse (or the town hall). */
export function storageSpace(b: Building): number {
  const cap = b.def.econ?.storage ?? 0;
  if (!cap || !b.complete || !b.city) return 0;
  return cap - stockTotal(b.city.stock) - stockTotal(b.city.incoming);
}

/** Goods a source can send out right now. Producers send their outputs; storage sends anything. */
function shippable(b: Building): GoodId[] {
  const c = b.city!;
  const e = b.def.econ!;
  const out: GoodId[] = [];
  if (e.storage) {
    for (const g of GOOD_IDS) if (get(c.stock, g) >= 1) out.push(g);
  } else if (e.recipe) {
    for (const g of Object.keys(e.recipe.out) as GoodId[]) if (get(c.stock, g) >= 1) out.push(g);
  }
  return out;
}

/** Map from road tile to the buildings reached from it. Rebuilt every second. */
export function accessIndex(world: World): Map<number, Building[]> {
  const idx = new Map<number, Building[]>();
  for (const b of world.buildings) {
    const a = b.city?.access ?? -1;
    if (a < 0) continue;
    let list = idx.get(a);
    if (!list) idx.set(a, (list = []));
    list.push(b);
  }
  return idx;
}

function newTruck(world: World, home: Building, kind: 'truck' | 'crew', path: number[], to: number, good: GoodId | null, amount: number): Truck {
  const city = world.city!;
  const t: Truck = { id: city.nextTruckId++, owner: home.owner, home: home.id, kind, path, pos: 0, prevPos: 0, phase: 'out', good, amount, to, buy: null };
  city.trucks.push(t);
  if (kind === 'crew') home.city!.crewsOut++;
  else home.city!.trucksOut++;
  return t;
}

/** One source looks for a delivery to make. */
function dispatchFrom(world: World, src: Building, idx: Map<number, Building[]>): void {
  const c = src.city!;
  const e = src.def.econ!;
  if ((e.trucks ?? 0) <= c.trucksOut || c.access < 0) return;
  const goods = shippable(src);
  if (!goods.length) return;
  const isStore = !!e.storage;
  let target: Building | null = null;
  let good: GoodId | null = null;
  let amount = 0;
  let fallback: Building | null = null;
  let fallbackGood: GoodId | null = null;
  let fallbackTile = -1;
  // Stations hand out locally; trains do the long haul.
  const reach = src.type === 'rail_station' || src.type === 'airport' || src.type === 'river_dock' ? RAIL.reach : TRADE_TRIP;
  const end = searchRoads(world, c.access, reach, (tile) => {
    const list = idx.get(tile);
    if (!list) return false;
    for (const b of list) {
      if (b === src || !b.city) continue;
      if (b.owner !== src.owner) {
        // A city-state's town hall: sell what our deal with them says to export.
        if (b.type !== 'town_hall' || !canTrade(world, src.owner, b.owner)) continue;
        for (const g of goods) {
          const deal = dealFor(world, src.owner, b.owner, g);
          if (!deal || deal.export < 0) continue;
          const surplus = get(world.city!.players[src.owner]!.stockpile, g) - deal.export;
          const d = Math.min(surplus, stateWants(world, b.owner, g));
          if (d < 1) continue;
          const n = Math.min(get(c.stock, g), TRUCK_LOAD, d);
          if (n < Math.min(TRUCK_LOAD, d)) continue;
          target = b;
          good = g;
          amount = Math.floor(n);
          return true;
        }
        continue;
      }
      for (const g of goods) {
        const d = demandFor(b, g, world);
        if (d < 1) continue;
        // No trickle deliveries: a working building that still has some waits until it needs half a load.
        if (d < TRUCK_LOAD / 2 && b.complete && get(b.city.stock, g) >= 1) continue;
        const have = get(c.stock, g);
        const n = Math.min(have, TRUCK_LOAD, d);
        // Wait for a full load unless that covers the whole demand.
        if (n < Math.min(TRUCK_LOAD, d)) continue;
        target = b;
        good = g;
        amount = Math.floor(n * 1000) / 1000;
        return true;
      }
      if (!isStore && !fallback && b.def.econ?.storage && storageSpace(b) >= TRUCK_LOAD) {
        const g = goods.find((gg) => get(c.stock, gg) >= TRUCK_LOAD);
        if (g) {
          fallback = b;
          fallbackGood = g;
          fallbackTile = tile;
        }
      }
    }
    return false;
  });
  let path: number[];
  if (target && good) {
    path = pathTo(world, end);
  } else if (fallback && fallbackGood) {
    // Search again to the warehouse to get its path (the last search ran past it).
    const fTile = fallbackTile;
    const found = searchRoads(world, c.access, MAX_TRIP, (tile) => tile === fTile);
    if (found < 0) return;
    path = pathTo(world, found);
    target = fallback;
    good = fallbackGood;
    amount = TRUCK_LOAD;
  } else {
    return;
  }
  const dest = target as Building;
  const g = good as GoodId;
  add(c.stock, g, -amount);
  add(dest.city!.incoming, g, amount);
  newTruck(world, src, 'truck', path, dest.id, g, amount);
}

/** Storage sends an empty truck to buy from a city-state when a deal says to import. */
function dispatchImport(world: World, src: Building, idx: Map<number, Building[]>): void {
  const c = src.city!;
  const e = src.def.econ!;
  if ((e.trucks ?? 0) <= c.trucksOut || c.access < 0 || !e.storage) return;
  const pc = world.city!.players[src.owner]!;
  const states = Object.keys(pc.deals).map(Number);
  if (!states.length) return;
  const pending = (g: GoodId) => world.city!.trucks.reduce((s, t) => s + (t.owner === src.owner && t.buy === g && t.phase === 'out' ? TRUCK_LOAD : 0), 0);
  const space = (e.storage ?? 0) - stockTotal(c.stock) - stockTotal(c.incoming);
  if (space < TRUCK_LOAD) return;
  for (const state of states) {
    const m = marketOf(world, state);
    if (!m?.city || m.city.access < 0 || !canTrade(world, src.owner, state)) continue;
    for (const g of GOOD_IDS) {
      const deal = pc.deals[state]?.[g];
      if (!deal || deal.import <= 0) continue;
      const need = deal.import - get(pc.stockpile, g) - pending(g);
      if (need < Math.min(TRUCK_LOAD, deal.import) / 2) continue;
      if (stateOffers(world, state, g) < Math.min(TRUCK_LOAD, need)) continue;
      if (pc.credits < theyCharge(world, state, g) * TRUCK_LOAD) continue;
      const goal = m.city.access;
      const end = searchRoads(world, c.access, TRADE_TRIP, (tile) => tile === goal);
      if (end < 0) continue;
      const t = newTruck(world, src, 'truck', pathTo(world, end), m.id, null, 0);
      t.buy = g;
      void idx;
      return;
    }
  }
}

/** Crews from the town hall and construction offices go to sites whose materials are in. */
function dispatchCrews(world: World, home: Building, idx: Map<number, Building[]>, assigned: Map<number, number>): void {
  const c = home.city!;
  const e = home.def.econ!;
  if ((e.crews ?? 0) <= c.crewsOut || c.access < 0) return;
  let site: Building | null = null;
  const end = searchRoads(world, c.access, MAX_TRIP, (tile) => {
    const list = idx.get(tile);
    if (!list) return false;
    for (const b of list) {
      if (b.complete || b.owner !== home.owner || b.type === 'house' || !b.city) continue;
      if ((assigned.get(b.id) ?? 0) >= MAX_CREWS_PER_SITE) continue;
      if (!materialsIn(b)) continue;
      site = b;
      return true;
    }
    return false;
  });
  if (!site) return;
  const s = site as Building;
  assigned.set(s.id, (assigned.get(s.id) ?? 0) + 1);
  newTruck(world, home, 'crew', pathTo(world, end), s.id, null, 0);
}

export function materialsIn(b: Building): boolean {
  const mats = b.def.econ?.materials ?? {};
  for (const [g, n] of Object.entries(mats)) if (get(b.city!.delivered, g as GoodId) < n!) return false;
  return true;
}

/** Once per second for each source (staggered across ticks). */
export function dispatch(world: World, idx: Map<number, Building[]>): void {
  const slot = world.tick % 15;
  const assigned = new Map<number, number>();
  for (const t of world.city!.trucks) if (t.kind === 'crew' && t.phase !== 'back') assigned.set(t.to, (assigned.get(t.to) ?? 0) + 1);
  for (const b of world.buildings) {
    if (!b.city || !b.complete || b.id % 15 !== slot) continue;
    const e = b.def.econ;
    if (!e) continue;
    if (e.trucks) dispatchFrom(world, b, idx);
    if (e.storage && world.players[b.owner]?.role !== 'cityState') dispatchImport(world, b, idx);
    if (e.crews) dispatchCrews(world, b, idx, assigned);
  }
}

// ---------------------------------------------------------------------------
// Driving

function finish(world: World, t: Truck, home: Building | undefined): void {
  const city = world.city!;
  const i = city.trucks.indexOf(t);
  if (i >= 0) city.trucks.splice(i, 1);
  if (!home?.city) return;
  if (t.kind === 'crew') home.city.crewsOut = Math.max(0, home.city.crewsOut - 1);
  else home.city.trucksOut = Math.max(0, home.city.trucksOut - 1);
  if (t.good && t.amount > 0) add(home.city.stock, t.good, t.amount);
}

/** Turn back home (keeping any cargo). */
function turnBack(t: Truck): void {
  const k = Math.min(t.path.length - 1, Math.floor(t.pos));
  t.path = t.path.slice(0, k + 1).reverse();
  t.pos = t.prevPos = 0;
  t.phase = 'back';
}

export function moveTrucks(world: World): void {
  const city = world.city!;
  const base = ROAD.speed * DT;
  for (const t of [...city.trucks]) {
    t.prevPos = t.pos;
    const home = world.getBuilding(t.home);
    if (t.phase === 'working') {
      const site = world.getBuilding(t.to);
      if (!site || site.complete) {
        if (site?.city) site.city.crewsHere = Math.max(0, site.city.crewsHere - 1);
        turnBack(t);
      }
      continue;
    }
    const last = t.path.length - 1;
    // Worn roads slow trucks down.
    const here = t.path[Math.min(last, Math.floor(t.pos))]!;
    const step = base * (ROAD.worstSpeed + (1 - ROAD.worstSpeed) * city.condition[here]!);
    const next = Math.min(last, t.pos + step);
    // A road taken away under the truck: it gives up and its cargo goes back home.
    const k = Math.min(last, Math.ceil(next));
    if (!city.road[t.path[k]!]) {
      if (t.phase === 'out' && t.good) {
        const dest = world.getBuilding(t.to);
        if (dest?.city) add(dest.city.incoming, t.good, -t.amount);
      }
      finish(world, t, home);
      continue;
    }
    // Every truck wears the road it drives onto.
    if (Math.floor(next) !== Math.floor(t.pos)) {
      const tile = t.path[Math.floor(next)]!;
      city.condition[tile] = Math.max(0, city.condition[tile]! - ROAD.truckWear);
    }
    t.pos = next;
    if (t.pos < last) continue;
    if (t.phase === 'back') {
      finish(world, t, home);
      continue;
    }
    // Arrived.
    const dest = world.getBuilding(t.to);
    if (t.kind === 'crew') {
      if (dest?.city && !dest.complete) {
        dest.city.crewsHere++;
        t.phase = 'working';
      } else {
        turnBack(t);
      }
      continue;
    }
    if (dest?.city && t.buy && dest.owner !== t.owner) {
      // Buying from a city-state: take what they can spare, pay, drive home with it.
      const g = t.buy;
      const n = Math.min(TRUCK_LOAD, stateOffers(world, dest.owner, g));
      const cost = n * theyCharge(world, dest.owner, g);
      if (n > 0 && world.city!.players[t.owner]!.credits >= cost) {
        add(dest.city.stock, g, -n);
        settle(world, dest.owner, t.owner, cost);
        t.good = g;
        t.amount = n;
      }
      t.buy = null;
      turnBack(t);
      continue;
    }
    if (dest?.city && t.good) {
      add(dest.city.incoming, t.good, -t.amount);
      if (dest.owner !== t.owner) {
        // Selling to a city-state.
        settle(world, t.owner, dest.owner, t.amount * theyPay(world, dest.owner, t.good));
        add(dest.city.stock, t.good, t.amount);
      } else if (!dest.complete) add(dest.city.delivered, t.good, t.amount);
      else add(dest.city.stock, t.good, t.amount);
      t.amount = 0;
      t.good = null;
    }
    turnBack(t);
  }
}
