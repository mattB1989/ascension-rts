// City-states and the human player (DESIGN.md §7-8): local prices, trade by
// truck over connected roads, opinion and dependence, and the two peaceful ways
// a city-state joins your nation: economic union (it asks) or purchase.

import { GOOD_IDS, GOODS, sumTiers, type GoodId } from '../../data/goods.ts';
import { YEAR_SECONDS } from '../../data/goods.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { stockTotal } from './logistics.ts';
import { get, type TradeRule } from './state.ts';

export const DIPLO = {
  /** Opinion gained per credit of trade. */
  opinionPerCredit: 1 / 25,
  /** Opinion drifts back towards this, by `decay` every 10 seconds. */
  baseline: 10,
  decay: 0.25,
  /** They join you when opinion and dependence stay this high for `unionDelay` seconds. */
  unionOpinion: 60,
  unionDependence: 0.35,
  unionDelay: 60,
  /** You may buy them out once they like you this much. */
  buyOpinion: 40,
  /** What they charge over / pay under their local price. */
  spread: 0.06,
} as const;

/** Per city-state, towards each other player. Lives on the city-state's PlayerCity. */
export interface Relations {
  opinion: number[];
  /** Trade value with each player this year and last year. */
  traded: number[];
  tradedLast: number[];
  /** Seconds the union conditions have held for each player. */
  unionFor: number[];
  /** Player they have asked to join (-1: nobody). */
  offer: number;
}

export function newRelations(players: number): Relations {
  return { opinion: new Array(players).fill(DIPLO.baseline), traded: new Array(players).fill(0), tradedLast: new Array(players).fill(0), unionFor: new Array(players).fill(0), offer: -1 };
}

export function isCityState(world: World, player: number): boolean {
  return world.players[player]?.role === 'cityState' && !world.players[player]!.defeated;
}

export function relationsOf(world: World, state: number): Relations | null {
  return world.city?.players[state]?.relations ?? null;
}

/** The building trucks trade at: the city-state's town hall. */
export function marketOf(world: World, state: number): Building | undefined {
  return world.buildings.find((b) => b.owner === state && b.type === 'town_hall' && b.complete);
}

/** Their use of a good per minute, as a scale for how much they want to hold. */
function use(world: World, state: number, g: GoodId): number {
  const pc = world.city!.players[state]!;
  return get(pc.used, g);
}

/** Local price of a good at a city-state: dear when they hold little of what they use, cheap when they have plenty. */
export function localPrice(world: World, state: number, g: GoodId): number {
  const pc = world.city!.players[state]!;
  const ratio = get(pc.stockpile, g) / (30 + use(world, state, g) * 3);
  const k = Math.max(0.6, Math.min(1.6, 1.5 - 0.6 * ratio));
  return GOODS[g].price * k;
}

/** What they pay you per unit, and what they charge you. */
export function theyPay(world: World, state: number, g: GoodId): number {
  return localPrice(world, state, g) * (1 - DIPLO.spread);
}

export function theyCharge(world: World, state: number, g: GoodId): number {
  return localPrice(world, state, g) * (1 + DIPLO.spread);
}

/** How much more of `g` a city-state will buy now (they buy what they use, while they can pay and store it). */
export function stateWants(world: World, state: number, g: GoodId): number {
  const m = marketOf(world, state);
  if (!m?.city) return 0;
  const pc = world.city!.players[state]!;
  const used = use(world, state, g);
  const materials = g === 'lumber' || g === 'concrete' || g === 'steel';
  if (used <= 0 && !materials) return 0;
  const target = 40 + used * 3;
  const space = (m.def.econ!.storage ?? 0) - stockTotal(m.city.stock) - stockTotal(m.city.incoming);
  const afford = Math.floor(Math.max(0, pc.credits) / theyPay(world, state, g));
  return Math.max(0, Math.min(target - get(pc.stockpile, g) - get(m.city.incoming, g), space, afford));
}

/** How much of `g` a city-state can sell now: what its town hall holds beyond its own needs. */
export function stateOffers(world: World, state: number, g: GoodId): number {
  const m = marketOf(world, state);
  if (!m?.city) return 0;
  const keep = 20 + use(world, state, g) * 2;
  return Math.max(0, Math.floor(get(m.city.stock, g) - keep));
}

/** The human's deal with a city-state for one good (or undefined). */
export function dealFor(world: World, player: number, state: number, g: GoodId): TradeRule | undefined {
  return world.city!.players[player]!.deals[state]?.[g];
}

/** Record a sale or purchase between a player and a city-state: money changes hands, opinion rises. */
export function settle(world: World, seller: number, buyer: number, value: number): void {
  const city = world.city!;
  city.players[seller]!.credits += value;
  city.players[buyer]!.credits -= value;
  // Each side that keeps relations (city-states, nations) likes the other more.
  for (const [who, other] of [[seller, buyer], [buyer, seller]] as const) {
    const rel = relationsOf(world, who);
    if (!rel) continue;
    rel.traded[other] = (rel.traded[other] ?? 0) + value;
    rel.opinion[other] = Math.min(100, (rel.opinion[other] ?? 0) + value * DIPLO.opinionPerCredit);
  }
  city.players[seller]!.year.trade += value;
  city.players[buyer]!.year.imports += value;
}

/** Their size, for the purchase price and dependence. */
export function stateValue(world: World, state: number): { population: number; worth: number; gdp: number } {
  const pc = world.city!.players[state]!;
  let worth = 0;
  for (const b of world.buildings) if (b.owner === state && b.complete) worth += b.def.econ?.credits ?? 0;
  const population = sumTiers(pc.population);
  return { population, worth, gdp: pc.lastGdp || pc.gdp };
}

/** Price to buy a city-state outright. */
export function purchasePrice(world: World, state: number): number {
  const v = stateValue(world, state);
  return Math.round((3000 + v.worth * 0.9 + v.population * 40 + Math.max(0, world.city!.players[state]!.credits)) / 100) * 100;
}

/** Share of a city-state's economy that is trade with this player (0..1). */
export function dependence(world: World, state: number, player: number): number {
  const rel = relationsOf(world, state);
  if (!rel) return 0;
  const v = stateValue(world, state);
  const trade = Math.max(rel.traded[player] ?? 0, rel.tradedLast[player] ?? 0);
  const year = Math.max(0.25, ((world.time % YEAR_SECONDS) || YEAR_SECONDS) / YEAR_SECONDS);
  const tradeRate = rel.traded[player]! >= rel.tradedLast[player]! ? trade / year : trade;
  return Math.max(0, Math.min(1, tradeRate / Math.max(800, v.gdp + tradeRate)));
}

/** Once a second: opinion drifts, union conditions are checked. */
export function updateDiplomacy(world: World, sec: number): void {
  const city = world.city!;
  for (const p of world.players) {
    if (p.role === 'nation' && !p.defeated && sec % 10 === 0) {
      // Nations' opinions drift back towards neutral.
      const rel = city.players[p.id]!.relations;
      if (rel) rel.opinion = rel.opinion.map((op) => (op > DIPLO.baseline ? Math.max(DIPLO.baseline, op - DIPLO.decay) : Math.min(DIPLO.baseline, op + DIPLO.decay)));
    }
    if (p.role !== 'cityState' || p.defeated) continue;
    const rel = city.players[p.id]!.relations;
    if (!rel) continue;
    for (const other of world.players) {
      if (other.id === p.id || other.role === 'cityState') continue;
      const o = other.id;
      if (sec % 10 === 0) {
        const op = rel.opinion[o] ?? DIPLO.baseline;
        rel.opinion[o] = op > DIPLO.baseline ? Math.max(DIPLO.baseline, op - DIPLO.decay) : Math.min(DIPLO.baseline, op + DIPLO.decay);
      }
      const ok = (rel.opinion[o] ?? 0) >= DIPLO.unionOpinion && dependence(world, p.id, o) >= DIPLO.unionDependence;
      rel.unionFor[o] = ok ? (rel.unionFor[o] ?? 0) + 1 : 0;
      if (ok && rel.unionFor[o]! >= DIPLO.unionDelay && rel.offer !== o) {
        rel.offer = o;
        const hall = marketOf(world, p.id);
        world.emit({ kind: 'notify', player: o, text: `🤝 ${p.name} asks to join your nation (see Diplomacy)`, x: hall?.x, y: hall?.y });
      }
      if (!ok && rel.offer === o && (rel.opinion[o] ?? 0) < DIPLO.unionOpinion - 15) rel.offer = -1;
    }
    if (sec > 0 && sec % YEAR_SECONDS === 0) {
      rel.tradedLast = [...rel.traded];
      rel.traded = rel.traded.map(() => 0);
    }
  }
}

/** A city-state joins a player: its regions, buildings, roads' upkeep, trucks and stock become theirs. */
export function annex(world: World, state: number, player: number): void {
  const city = world.city!;
  for (let r = 0; r < city.regionOwner.length; r++) if (city.regionOwner[r] === state) city.regionOwner[r] = player;
  for (const b of world.buildings) if (b.owner === state) b.owner = player;
  for (const t of city.trucks) if (t.owner === state) t.owner = player;
  for (const s of city.ships) if (s.owner === state) s.owner = player;
  // Two town halls now: the old one becomes a regional seat (it keeps working as storage).
  const pcState = city.players[state]!;
  const pc = city.players[player]!;
  pc.credits += Math.max(0, pcState.credits);
  pcState.credits = 0;
  city.bots = city.bots.filter((b) => b.player !== state);
  world.players[state]!.defeated = true;
  // Other city-states take note.
  for (const p of world.players) {
    const rel = city.players[p.id]?.relations;
    if (rel && p.id !== state && p.role === 'cityState') rel.opinion[player] = Math.max(-100, (rel.opinion[player] ?? 0) - 5);
  }
  for (const id of new Set(world.buildings.filter((b) => b.owner === player).map((b) => b.owner))) world.recomputePop(world.players[id]!);
  world.emit({ kind: 'notify', player, text: `${world.players[state]!.name} has joined your nation` });
}

export function goodsTraded(): GoodId[] {
  return GOOD_IDS;
}
