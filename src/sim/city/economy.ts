// The economy game's yearly-life loop, run once per game second:
//   road networks -> labour -> power -> water and services -> production ->
//   households (consumption, needs, levels, growth) -> taxes and upkeep.
// Construction advances every tick. See docs/DESIGN.md §3-6.

import { CONSUMPTION, HOUSE_LEVELS, ROAD, TAX_PER_RESIDENT, type HouseNeed } from '../../data/city.ts';
import { GOODS, START_YEAR, YEAR_SECONDS, type GoodId, type Tier } from '../../data/goods.ts';
import type { ServiceKind } from '../../data/types.ts';
import { DT } from '../time.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { accessIndex, dispatch, materialsIn, moveTrucks, OUTPUT_CAP } from './logistics.ts';
import { findAccess, searchRoads, updateComponents } from './roads.ts';
import { add, emptyBudget, get, type PlayerCity, type Stock } from './state.ts';
import { moveShips, updateStockpiles, updateTrade } from './trade.ts';
import { updateDiplomacy } from './diplomacy.ts';
import { botStep } from '../../ai/cityBot.ts';

const SECOND = 15; // ticks
/** Share of residents who work. */
export const WORK_SHARE = 0.5;
/** Power a house uses once it has grown past a cottage (MW). */
const HOUSE_POWER = 0.25;
const SERVICE_EVERY = 5; // seconds between coverage updates

const PRIORITY: Record<string, number> = { utility: 0, service: 1, core: 2, logistics: 3, resource: 4, industry: 5 };
const FOOD_FIRST = new Set(['farm', 'fishing_harbour', 'food_plant']);

function jobPriority(b: Building): number {
  if (FOOD_FIRST.has(b.type)) return 1.5;
  return PRIORITY[b.def.category] ?? 6;
}

export function houseCapacity(b: Building): number {
  const cap = b.def.econ?.housing;
  return cap ? cap[b.city!.level]! : 0;
}

export function houseTier(b: Building): Tier {
  return HOUSE_LEVELS[b.city!.level]!.tier as Tier;
}

/** Every tick: trucks drive, construction advances, sources dispatch (each once a second). */
export function updateCity(world: World): void {
  const city = world.city!;
  updateComponents(city, world.map);
  moveTrucks(world);
  moveShips(world);
  construction(world);
  if (world.tick % SECOND === 0) everySecond(world);
  dispatch(world, cachedIndex(world));
  for (const bot of city.bots) {
    if (!world.players[bot.player]) continue;
    city.aiQueue.push(...botStep(world, bot));
  }
}

let idxCache: { world: World; tick: number; idx: Map<number, Building[]> } | null = null;
function cachedIndex(world: World): Map<number, Building[]> {
  if (!idxCache || idxCache.world !== world || idxCache.tick !== Math.floor(world.tick / SECOND)) {
    idxCache = { world, tick: Math.floor(world.tick / SECOND), idx: accessIndex(world) };
  }
  return idxCache.idx;
}

// ---------------------------------------------------------------------------
// Construction

function construction(world: World): void {
  for (const b of world.buildings) {
    const c = b.city;
    if (!c || b.complete) continue;
    let rate = 0;
    if (b.type === 'house') {
      if (c.access >= 0) rate = 1;
    } else if (c.crewsHere > 0 && materialsIn(b)) {
      rate = 1 + 0.6 * (c.crewsHere - 1);
    }
    if (rate <= 0) continue;
    const before = b.progress;
    b.progress = Math.min(1, b.progress + (rate * DT) / b.def.buildTime);
    b.hp = Math.min(b.maxHp, b.hp + (b.progress - before) * b.maxHp * 0.9);
    if (b.progress >= 1) completeCityBuilding(world, b);
  }
}

function completeCityBuilding(world: World, b: Building): void {
  b.complete = true;
  b.progress = 1;
  b.hp = b.maxHp;
  b.city!.crewsHere = 0;
  b.city!.delivered = {};
  world.emit({ kind: 'buildingComplete', player: b.owner, building: b.id });
  if (b.type === 'regional_office') {
    const reg = world.map.region[Math.floor(b.ty) * world.map.width + Math.floor(b.tx)]!;
    if (reg && world.city!.regionOwner[reg] === -1) {
      world.city!.regionOwner[reg] = b.owner;
      exploreRegion(world, b.owner, reg);
      const name = world.map.regions[reg - 1]?.name ?? 'A region';
      world.emit({ kind: 'notify', player: b.owner, text: `${name} joins your nation`, x: b.x, y: b.y });
    }
  }
}

/** Mark a region and its neighbours explored for a player. */
export function exploreRegion(world: World, player: number, reg: number): void {
  const map = world.map;
  const info = map.regions[reg - 1];
  const regs = new Set([reg, ...(info?.neighbors ?? [])]);
  const ex = world.players[player]!.explored;
  for (let i = 0; i < map.region.length; i++) {
    if (regs.has(map.region[i]!)) ex[i] = 1;
  }
  // Water next to explored land too, so coasts and rivers show.
  const w = map.width;
  for (let i = 0; i < map.region.length; i++) {
    if (map.region[i] !== 0 || ex[i]) continue;
    const x = i % w;
    if ((x > 0 && ex[i - 1] && map.region[i - 1]) || (x < w - 1 && ex[i + 1] && map.region[i + 1]) || (i >= w && ex[i - w] && map.region[i - w]) || (i + w < ex.length && ex[i + w] && map.region[i + w])) ex[i] = 1;
  }
}

// ---------------------------------------------------------------------------
// Once a second

function everySecond(world: World): void {
  const city = world.city!;
  const sec = Math.floor(world.tick / SECOND);
  // Road access may have changed.
  for (const b of world.buildings) {
    const c = b.city;
    if (!c) continue;
    c.access = findAccess(world, b);
    c.comp = c.access >= 0 ? city.comp[c.access]! : 0;
  }
  for (const pc of city.players) {
    pc.madeLog.push({});
    pc.usedLog.push({});
    if (pc.madeLog.length > 60) pc.madeLog.shift();
    if (pc.usedLog.length > 60) pc.usedLog.shift();
  }
  updateStockpiles(world);
  labour(world);
  power(world);
  if (sec % SERVICE_EVERY === 0) {
    coverage(world);
    pollution(world);
  }
  production(world);
  households(world);
  budget(world);
  updateTrade(world);
  updateDiplomacy(world, sec);
  roadUpkeep(world, sec);
  for (const pc of city.players) {
    pc.made = sumLog(pc.madeLog);
    pc.used = sumLog(pc.usedLog);
  }
  // New year.
  if (sec > 0 && sec % YEAR_SECONDS === 0) {
    for (let p = 0; p < city.players.length; p++) {
      const pc = city.players[p]!;
      pc.lastYear = pc.year;
      pc.year = emptyBudget();
      pc.lastGdp = pc.gdp;
      pc.gdp = 0;
      pc.history.push({ year: START_YEAR + sec / YEAR_SECONDS - 1, population: pc.population[0] + pc.population[1], credits: pc.credits, gdp: pc.lastGdp });
    }
  }
}

function sumLog(log: Stock[]): Stock {
  const out: Stock = {};
  for (const s of log) for (const [g, n] of Object.entries(s)) add(out, g as GoodId, n!);
  return out;
}

function logMade(pc: PlayerCity, g: GoodId, n: number): void {
  add(pc.madeLog[pc.madeLog.length - 1]!, g, n);
  pc.gdp += n * GOODS[g].price;
}

function logUsed(pc: PlayerCity, g: GoodId, n: number): void {
  add(pc.usedLog[pc.usedLog.length - 1]!, g, n);
}

// ---------------------------------------------------------------------------
// Labour: residents fill jobs on the same road network, most important jobs first.

function labour(world: World): void {
  const city = world.city!;
  for (const pc of city.players) {
    pc.population = [0, 0];
    pc.workforce = [0, 0];
    pc.jobs = [0, 0];
    pc.employed = [0, 0];
  }
  // Workforce per (player, network, tier).
  const pool = new Map<string, number>();
  const key = (p: number, comp: number, t: number) => `${p}:${comp}:${t}`;
  for (const b of world.buildings) {
    const c = b.city;
    if (!c || b.type !== 'house' || !b.complete) continue;
    const t = houseTier(b);
    const pc = city.players[b.owner]!;
    pc.population[t] += Math.floor(c.residents);
    const workers = Math.floor(c.residents * WORK_SHARE);
    pc.workforce[t] += workers;
    if (c.comp) pool.set(key(b.owner, c.comp, t), (pool.get(key(b.owner, c.comp, t)) ?? 0) + workers);
  }
  const employers = world.buildings.filter((b) => b.city && b.complete && b.def.econ?.jobs);
  employers.sort((a, b) => jobPriority(a) - jobPriority(b) || a.id - b.id);
  for (const b of employers) {
    const c = b.city!;
    const job = b.def.econ!.jobs!;
    const pc = city.players[b.owner]!;
    pc.jobs[job.tier] += job.count;
    c.workers = 0;
    if (!c.comp) continue;
    // Technicians can do workers' jobs; workers can't do technicians'.
    for (let t = job.tier; t <= 1 && c.workers < job.count; t++) {
      const k = key(b.owner, c.comp, t);
      const free = pool.get(k) ?? 0;
      const take = Math.min(free, job.count - c.workers);
      if (take > 0) {
        pool.set(k, free - take);
        c.workers += take;
        pc.employed[t] += take;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Power: plants feed every building on the same road network (lines run along roads).

function power(world: World): void {
  const city = world.city!;
  for (const pc of city.players) {
    pc.powerSupply = 0;
    pc.powerDemand = 0;
  }
  // Each owner's grid is separate even where roads join up.
  const supply = new Map<number, number>();
  const key = (b: Building) => b.city!.comp * 64 + b.owner;
  for (const b of world.buildings) {
    const c = b.city;
    if (!c || !b.complete) continue;
    const mw = b.def.econ?.power ?? 0;
    if (mw < 0 && c.comp) {
      supply.set(key(b), (supply.get(key(b)) ?? 0) + c.powerOut);
      city.players[b.owner]!.powerSupply += c.powerOut;
    }
  }
  // Industry and services first, then houses.
  const users = world.buildings.filter((b) => b.city && b.complete && ((b.def.econ?.power ?? 0) > 0 || (b.type === 'house' && b.city.level >= 1)));
  users.sort((a, b) => (a.type === 'house' ? 1 : 0) - (b.type === 'house' ? 1 : 0) || a.id - b.id);
  for (const b of users) {
    const c = b.city!;
    const need = b.type === 'house' ? HOUSE_POWER : b.def.econ!.power!;
    city.players[b.owner]!.powerDemand += need;
    const left = supply.get(key(b)) ?? 0;
    c.powered = c.comp > 0 && left >= need;
    if (c.powered) supply.set(key(b), left - need);
  }
}

// ---------------------------------------------------------------------------
// Services and water: each covers houses within its radius along the roads, up to its capacity.

function coverage(world: World): void {
  const idx = cachedIndex(world);
  const houses = world.buildings.filter((b) => b.type === 'house' && b.city && b.complete);
  for (const h of houses) {
    const c = h.city!;
    c.market = 0;
    for (const k of Object.keys(c.covered) as ServiceKind[]) c.covered[k] = false;
  }
  // Water: pumping stations on a network supply its towers.
  const waterLeft = new Map<number, number>();
  for (const b of world.buildings) {
    const c = b.city;
    const sup = b.def.econ?.waterSupply;
    if (!c || !sup || !b.complete || !c.comp) continue;
    const ok = c.workers > 0 && (!(b.def.econ!.power ?? 0) || c.powered);
    if (ok) waterLeft.set(c.comp * 64 + b.owner, (waterLeft.get(c.comp * 64 + b.owner) ?? 0) + sup * Math.min(1, c.workers / (b.def.econ!.jobs?.count ?? 1)));
  }
  const services = world.buildings.filter((b) => b.city && b.complete && b.def.econ?.service);
  for (const s of services) {
    const c = s.city!;
    const svc = s.def.econ!.service!;
    c.served = 0;
    c.status = '';
    if (c.access < 0) {
      c.status = 'No road';
      continue;
    }
    const staffed = !s.def.econ!.jobs || c.workers > 0;
    if (!staffed) {
      c.status = 'No staff';
      continue;
    }
    if ((s.def.econ!.power ?? 0) > 0 && !c.powered) {
      c.status = 'No power';
      continue;
    }
    let capacity = svc.capacity * (s.def.econ!.jobs ? Math.min(1, c.workers / s.def.econ!.jobs.count) : 1);
    if (svc.kind === 'water') {
      const left = waterLeft.get(c.comp * 64 + s.owner) ?? 0;
      if (left <= 0) {
        c.status = 'No water: build a Pumping Station on these roads';
        continue;
      }
      capacity = Math.min(capacity, left);
    }
    let used = 0;
    searchRoads(world, c.access, svc.radius, (tile) => {
      const list = idx.get(tile);
      if (!list) return false;
      for (const h of list) {
        if (h.type !== 'house' || h.owner !== s.owner || !h.complete) continue;
        const hc = h.city!;
        if (hc.covered[svc.kind]) continue;
        const r = Math.max(1, hc.residents);
        if (used + r > capacity) return true;
        used += r;
        hc.covered[svc.kind] = true;
        if (svc.kind === 'market') hc.market = s.id;
      }
      return false;
    });
    c.served = used;
    if (svc.kind === 'water') waterLeft.set(c.comp * 64 + s.owner, (waterLeft.get(c.comp * 64 + s.owner) ?? 0) - used);
  }
}

/** Industry nearby makes houses less pleasant. */
function pollution(world: World): void {
  const sources = world.buildings.filter((b) => b.complete && (b.def.econ?.pollution ?? 0) > 0);
  for (const h of world.buildings) {
    if (h.type !== 'house' || !h.city) continue;
    let p = 0;
    for (const s of sources) {
      const dx = s.x - h.x;
      const dy = s.y - h.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 10) p += s.def.econ!.pollution! * (1 - d / 10);
    }
    h.city.pollution = Math.min(1, p);
  }
}

// ---------------------------------------------------------------------------
// Production

function production(world: World): void {
  const city = world.city!;
  for (const b of world.buildings) {
    const c = b.city;
    const e = b.def.econ;
    if (!c || !e) continue;
    if (!b.complete) {
      c.efficiency = 0;
      c.status = constructionStatus(b);
      continue;
    }
    if (!e.recipe) {
      if (!e.service) c.status = c.access < 0 && b.type !== 'house' ? 'No road' : '';
      continue;
    }
    const pc = city.players[b.owner]!;
    c.efficiency = 0;
    c.powerOut = 0;
    const staff = e.jobs ? c.workers / e.jobs.count : 1;
    if (c.access < 0) {
      c.status = 'No road';
      continue;
    }
    if (staff <= 0) {
      c.status = 'No workers: build houses on these roads';
      continue;
    }
    if ((e.power ?? 0) > 0 && !c.powered) {
      c.status = 'No power';
      continue;
    }
    const outs = Object.entries(e.recipe.out) as Array<[GoodId, number]>;
    if (outs.some(([g]) => get(c.stock, g) >= OUTPUT_CAP)) {
      c.status = 'Storage full: needs a warehouse or a buyer';
      continue;
    }
    if (c.cycle <= 0) {
      const ins = Object.entries(e.recipe.in) as Array<[GoodId, number]>;
      const missing = ins.filter(([g, n]) => get(c.stock, g) < n);
      if (missing.length) {
        c.status = `Needs ${missing.map(([g]) => GOODS[g].name.toLowerCase()).join(' and ')}`;
        continue;
      }
      for (const [g, n] of ins) {
        add(c.stock, g, -n);
        logUsed(pc, g, n);
      }
      c.cycle = 1e-9;
    }
    const rate = staff * (e.extract ? c.yield : 1);
    c.efficiency = rate;
    c.status = staff < 1 ? `Short of staff (${c.workers}/${e.jobs!.count})` : e.extract && c.yield < 0.5 ? 'Poor land' : '';
    if ((e.power ?? 0) < 0) c.powerOut = -e.power! * staff;
    c.cycle += rate / e.recipe.seconds;
    if (c.cycle >= 1) {
      c.cycle = 0;
      for (const [g, n] of outs) {
        add(c.stock, g, n);
        logMade(pc, g, n);
      }
    }
  }
}

function constructionStatus(b: Building): string {
  const c = b.city!;
  if (c.access < 0) return 'No road: connect it to your roads';
  if (b.type === 'house') return 'Settlers are building';
  const mats = b.def.econ?.materials ?? {};
  const missing: string[] = [];
  for (const [g, n] of Object.entries(mats) as Array<[GoodId, number]>) {
    const have = get(c.delivered, g);
    if (have < n) missing.push(`${GOODS[g].name.toLowerCase()} ${Math.floor(have)}/${n}`);
  }
  if (missing.length) return `Waiting for ${missing.join(', ')}`;
  return c.crewsHere > 0 ? `Building (${c.crewsHere} crew${c.crewsHere > 1 ? 's' : ''})` : 'Waiting for a crew';
}

// ---------------------------------------------------------------------------
// Households

function households(world: World): void {
  const city = world.city!;
  let happySum = new Array(city.players.length).fill(0);
  let happyN = new Array(city.players.length).fill(0);
  const unemployment = city.players.map((pc) => {
    const wf = pc.workforce[0] + pc.workforce[1];
    return wf > 0 ? 1 - (pc.employed[0] + pc.employed[1]) / wf : 0;
  });
  // Settlers come for work: they move in while there are jobs, or while few are out of work.
  const attractive = city.players.map((pc, i) => pc.jobs[0] + pc.jobs[1] > pc.employed[0] + pc.employed[1] || unemployment[i]! < 0.12 || pc.population[0] + pc.population[1] < 24);
  for (const h of world.buildings) {
    const c = h.city;
    if (!c || h.type !== 'house' || !h.complete) continue;
    const pc = city.players[h.owner]!;
    // Shopping: food and goods from the market that serves this house.
    const market = c.market ? world.getBuilding(c.market) : undefined;
    for (const g of ['food', 'goods'] as const) {
      const wants = g === 'food' || c.level >= 1;
      const need = (c.residents * CONSUMPTION[g]) / YEAR_SECONDS;
      let ok = false;
      if (market?.city && wants) {
        const have = get(market.city.stock, g);
        if (have >= need && have > 0) {
          add(market.city.stock, g, -need);
          logUsed(pc, g, need);
          ok = true;
        }
      }
      c.needs[g] = ok;
    }
    c.needs.water = c.covered.water;
    c.needs.power = c.powered;
    c.needs.police = c.covered.police;
    c.needs.health = c.covered.health;
    c.needs.school = c.covered.school;

    const cur = HOUSE_LEVELS[c.level]!;
    const next = HOUSE_LEVELS[c.level + 1];
    const curOk = cur.needs.every((n) => c.needs[n]);
    const nextOk = next ? next.needs.every((n) => c.needs[n]) : false;
    c.upFor = nextOk ? c.upFor + 1 : 0;
    c.downFor = curOk ? 0 : c.downFor + 1;
    if (next && c.upFor >= 15) {
      c.level++;
      c.upFor = 0;
    } else if (c.level > 0 && c.downFor >= 30) {
      c.level--;
      c.downFor = 0;
    }

    // Happiness: needs met (for the next level), minus pollution, taxes and unemployment.
    const target = next ?? cur;
    const wanted = target.needs.length ? target.needs : (['food'] as HouseNeed[]);
    const met = wanted.filter((n) => c.needs[n]).length / wanted.length;
    let happy = 0.4 + 0.45 * met + (curOk ? 0.1 : -0.15) - c.pollution * 0.35 - (pc.taxRate - 1) * 0.6 - unemployment[h.owner]! * 0.25;
    happy = Math.max(0, Math.min(1, happy));
    c.happiness = happy;
    happySum[h.owner] += happy * Math.max(1, c.residents);
    happyN[h.owner] += Math.max(1, c.residents);

    // People move in while there is room and the town is pleasant; leave when it isn't.
    const cap = houseCapacity(h);
    if (c.access < 0) c.growth -= 0.2;
    else if (c.residents > cap) c.growth -= 0.5;
    else if (happy < 0.25) c.growth -= 0.1;
    else if (c.residents < cap && happy >= 0.4 && attractive[h.owner]) c.growth += 0.15 + 0.25 * happy;
    if (c.growth >= 1 || c.growth <= -1) {
      const d = Math.trunc(c.growth);
      c.residents = Math.max(0, Math.min(Math.max(cap, c.residents), c.residents + d));
      if (c.residents > cap && d > 0) c.residents = cap;
      c.growth -= d;
    }
  }
  city.players.forEach((pc, p) => {
    if (happyN[p]) pc.happiness = happySum[p] / happyN[p];
  });
  happySum = happyN = [];
}

// ---------------------------------------------------------------------------
// Money

function budget(world: World): void {
  const city = world.city!;
  for (const b of world.buildings) {
    const c = b.city;
    if (!c) continue;
    const pc = city.players[b.owner]!;
    if (b.type === 'house' && b.complete) {
      const t = houseTier(b);
      const tax = (c.residents * TAX_PER_RESIDENT[t] * pc.taxRate * (0.6 + 0.4 * c.happiness)) / YEAR_SECONDS;
      pc.credits += tax;
      pc.year.taxes += tax;
    } else if (b.complete) {
      // Idle buildings cost less to keep: 40% when unstaffed, full price when fully staffed.
      const jobs = b.def.econ?.jobs;
      const staffed = jobs ? Math.min(1, c.workers / jobs.count) : 1;
      const up = ((b.def.econ?.upkeep ?? 0) * (0.4 + 0.6 * staffed)) / YEAR_SECONDS;
      pc.credits -= up;
      pc.year.upkeep += up;
    }
  }
  // Roads are paid for by whoever owns the region they're in (bridges: the nearest region).
  const perOwner = roadsByOwner(world);
  perOwner.forEach((n, p) => {
    const pc = city.players[p];
    if (!pc || !n) return;
    const cost = (n * ROAD.upkeepPerYear) / YEAR_SECONDS;
    pc.credits -= cost;
    pc.year.roads += cost;
  });
}

/** Roads age; maintenance depots repair the worst roads within their reach. */
function roadUpkeep(world: World, sec: number): void {
  const city = world.city!;
  if (sec % 10 === 0) {
    for (let i = 0; i < city.road.length; i++) if (city.road[i]) city.condition[i] = Math.max(0, city.condition[i]! - ROAD.ageWear);
  }
  for (const d of world.buildings) {
    if (d.type !== 'maintenance_depot' || !d.complete || !d.city) continue;
    const c = d.city;
    const staff = c.workers / (d.def.econ!.jobs?.count ?? 1);
    if (c.access < 0 || staff <= 0) {
      c.status = c.access < 0 ? 'No road' : 'No workers';
      continue;
    }
    const tiles: number[] = [];
    searchRoads(world, c.access, ROAD.depotRadius, (tile) => {
      if (city.condition[tile]! < 0.98) tiles.push(tile);
      return false;
    });
    tiles.sort((a, b) => city.condition[a]! - city.condition[b]! || a - b);
    let budget = ROAD.repair * staff;
    for (const t of tiles) {
      if (budget <= 0) break;
      const fix = Math.min(budget, 1 - city.condition[t]!, 0.08);
      city.condition[t] = city.condition[t]! + fix;
      budget -= fix;
    }
    c.served = tiles.length;
    c.status = tiles.length ? '' : 'All roads in reach are in good repair';
    c.efficiency = staff;
  }
}

let roadOwners: { world: World; version: number; counts: number[] } | null = null;

/** Road tiles per owner, recounted when roads change. */
export function roadsByOwner(world: World): number[] {
  const city = world.city!;
  if (roadOwners && roadOwners.world === world && roadOwners.version === city.roadVersion) return roadOwners.counts;
  const counts = new Array(world.players.length).fill(0);
  const near = world.map.nearRegion;
  for (let i = 0; i < city.road.length; i++) {
    if (!city.road[i]) continue;
    const o = city.regionOwner[near[i]!] ?? -1;
    if (o >= 0) counts[o]++;
    else counts[0]++; // roads on unclaimed land: whoever is building there is the human for now
  }
  roadOwners = { world, version: city.roadVersion, counts };
  return counts;
}

/** Game year (calendar) at the current tick. */
export function gameYear(world: World): number {
  return START_YEAR + Math.floor(world.time / YEAR_SECONDS);
}

/** Month 0..11 within the year. */
export function gameMonth(world: World): number {
  return Math.floor(((world.time % YEAR_SECONDS) / YEAR_SECONDS) * 12);
}
