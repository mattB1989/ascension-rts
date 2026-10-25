// State of the economy game, kept on the World (world.city). Plain data only:
// typed arrays, arrays and records, so a save is a structured clone.

import { AUTOMATION, type HouseNeed } from '../../data/city.ts';
import type { Building } from '../types.ts';
import { GOOD_IDS, perTier, type GoodId, type PerTier } from '../../data/goods.ts';
import type { ServiceKind } from '../../data/types.ts';
import type { BotState } from '../../ai/cityBot.ts';
import type { Command, TimedCommand } from '../commands.ts';
import type { CityOptions } from './index.ts';
import type { Relations } from './diplomacy.ts';
import { newVictoryState, type VictoryState } from './victory.ts';
import type { Embargo, Treaty } from './treaties.ts';
import type { IntelReport } from './intel.ts';
import type { Weather } from './energy.ts';
import type { Train } from './rail.ts';

export type Stock = Partial<Record<GoodId, number>>;

/** What a building does in the economy (on Building.city). */
export interface CityBuildingState {
  /** Goods held: inputs waiting to be used, outputs waiting for a truck, or storage. */
  stock: Stock;
  /** Units on their way here in trucks (already promised). */
  incoming: Stock;
  /** Construction: materials delivered so far. */
  delivered: Stock;
  /** Road tile index trucks use to reach it, or -1 when it has no road. */
  access: number;
  /** Road network it is connected to (0: none). */
  comp: number;
  /** Staff at work, and staff wanted. */
  workers: number;
  /** Production cycle progress, 0..1. */
  cycle: number;
  /** Raw producers: how good the land is, 0..1. */
  yield: number;
  /** Output rate last second, 0..1 (UI). */
  efficiency: number;
  /** Why it isn't working, or '' (UI). */
  status: string;
  /** Knocked out by enemy saboteurs (or closed after a nuclear accident) until this game time. */
  sabotagedUntil?: number;
  /** Why it is out of action (sabotage, flood, strike, accident). */
  outReason?: string;
  /** Storage (reservoirs, batteries): energy held, MW·s. */
  stored?: number;
  powered: boolean;
  /** Power plants: megawatts actually produced last second. */
  powerOut: number;
  /** Trucks and crews away from home. */
  trucksOut: number;
  crewsOut: number;
  /** Construction crews working on this site now. */
  crewsHere: number;
  /** Housing. */
  level: number;
  residents: number;
  /** Fractional residents (growth accumulates here). */
  growth: number;
  needs: Record<HouseNeed, boolean>;
  /** Seconds the next level's needs have all been met / the current level's have not. */
  upFor: number;
  downFor: number;
  happiness: number;
  /** Services: residents covered last time coverage was computed. */
  served: number;
  /** Houses: the market that sells to it (0: none) and which services reach it. */
  market: number;
  covered: Record<ServiceKind, boolean>;
  /** Houses: pollution from industry nearby, 0..1. */
  pollution: number;
  /** Seats (town hall, regional office): capture progress 0..1 and by whom (-1: nobody). */
  capture: number;
  captureBy: number;
  /** Rail stations: rail tile they are reached from (-1: none), what the area around them is short of, trains away. */
  rail?: number;
  wants?: Stock;
  trainsOut?: number;
  /** Pipeline network it touches (0: none). */
  pipe?: number;
  /** Shield generators: seconds knocked out by an EMP. */
  stun?: number;
}

export interface Truck {
  id: number;
  owner: number;
  /** Building the truck belongs to (it returns there). */
  home: number;
  kind: 'truck' | 'crew';
  /** Road tiles to drive through (tile indices). */
  path: number[];
  /** Position along the path in tiles, and at the start of the tick (render interpolation). */
  pos: number;
  prevPos: number;
  phase: 'out' | 'working' | 'back';
  good: GoodId | null;
  amount: number;
  /** Destination building. */
  to: number;
  /** Trade run: drive out empty and buy this at the destination (a city-state's town hall). */
  buy: GoodId | null;
}

export interface Budget {
  taxes: number;
  /** Exports sold. */
  trade: number;
  /** Imports bought. */
  imports: number;
  upkeep: number;
  roads: number;
  construction: number;
  /** Recruiting and army upkeep. */
  military: number;
}

/** What to do with a good at the trade port: import up to `import` (0: never), export everything above `export` (-1: never). */
export interface TradeRule {
  import: number;
  export: number;
}

/** A cargo ship between the open sea and a trade port. */
export interface Ship {
  id: number;
  owner: number;
  port: number;
  /** Route at sea, flat [x, y, ...] from the map edge to the port. */
  path: number[];
  /** Distance travelled along the route (tiles), and at the start of the tick. */
  pos: number;
  prevPos: number;
  length: number;
  phase: 'in' | 'docked' | 'out';
  /** Seconds left at the dock. */
  dock: number;
  /** Goods on board (imports on the way in). */
  cargo: Stock;
}

export interface PlayerCity {
  credits: number;
  /** 1 = normal taxes; 0.5..1.5. */
  taxRate: number;
  /** This year so far, and the whole of last year. */
  year: Budget;
  lastYear: Budget;
  /** Population and jobs by tier (computed each second). */
  population: PerTier;
  workforce: PerTier;
  jobs: PerTier;
  employed: PerTier;
  /** War weariness: happiness lost to long wars (0..WEARINESS.max), recovers in peace. */
  weariness: number;
  /** Age reached (0 Modern, 1 Digital, 2 Nano, 3 Space) and research points towards the next. */
  age: number;
  research: number;
  happiness: number;
  /** Power across all networks (MW). */
  powerSupply: number;
  powerDemand: number;
  /** Gradual unlocks on (see unlocks.ts), and what has opened up so far. */
  gradual?: boolean;
  unlocked?: string[];
  /** National policies by area (policies.ts), and when each was last changed. */
  policies?: Partial<Record<string, string>>;
  policyAt?: Partial<Record<string, number>>;
  /** Energy mix (energy.ts): fossil MW, share from wind and sun, storage, smog deaths last year, shock after an accident. */
  fossilMW?: number;
  variableShare?: number;
  storeCapacity?: number;
  storeLevel?: number;
  smogDeaths?: number;
  shakenUntil?: number;
  /** Demand above supply at the last check (for the warning). */
  powerShort?: boolean;
  /** Goods made and used in the last 60 game seconds, per good (UI table). */
  made: Stock;
  used: Stock;
  /** Rolling per-second history for the last minute (ring buffers). */
  madeLog: Stock[];
  usedLog: Stock[];
  /** Trade port rules per good. */
  trade: Partial<Record<GoodId, TradeRule>>;
  /** Deals with city-states: per city-state player id, per good. */
  deals: Record<number, Partial<Record<GoodId, TradeRule>>>;
  /** City-states only: how they feel about everyone. */
  relations: Relations | null;
  /** Goods held across all your buildings (computed each second). */
  stockpile: Stock;
  /** Value of goods made this year and last year (credits at reference prices). */
  gdp: number;
  lastGdp: number;
  /** Best yearly GDP so far (scenarios). */
  bestGdp?: number;
  /** Yearly history for graphs. */
  history: Array<{ year: number; population: number; credits: number; gdp: number }>;
}

export interface CityState {
  /** Road per tile: 0 none, 1 road, 2 bridge. */
  road: Uint8Array;
  /** Road condition per tile, 1 new to 0 ruined. */
  condition: Float32Array;
  roadCount: number;
  /** Railway per tile (0 none, 1 track), network ids, and trains running. */
  rail: Uint8Array;
  railComp: Int32Array;
  railCount: number;
  railVersion: number;
  railCompVersion: number;
  trains: Train[];
  nextTrainId: number;
  /** Pipelines per tile, network ids. */
  pipe: Uint8Array;
  pipeComp: Int32Array;
  pipeCount: number;
  pipeVersion: number;
  pipeCompVersion: number;
  /** Road network id per road tile (0: none). Recomputed when roads change. */
  comp: Int32Array;
  /** Bumped on every road change; buildings refresh their road access when it moves. */
  roadVersion: number;
  compVersion: number;
  /** Owner of each region (index: region id), -1 for nobody. */
  regionOwner: Int8Array;
  trucks: Truck[];
  nextTruckId: number;
  players: PlayerCity[];
  /** Service coverage per tile of road access: residents allowed by the nearest service, recomputed every few seconds. */
  coverage: Partial<Record<ServiceKind, Int32Array>>;
  ships: Ship[];
  nextShipId: number;
  /** AI players (city-states, later nations): their planner state, and commands for the next tick. */
  bots: BotState[];
  aiQueue: Command[];
  /** war[a][b] = 1 while players a and b are at war, and when that war began (game time). */
  war: number[][];
  warStart: number[][];
  /** Treaties in force between nations. */
  treaties: Treaty[];
  /** Embargoes in force: no trade between the two, and friendly city-states follow suit. */
  embargoes: Embargo[];
  /** Peace offered by an AI nation to you, waiting for your answer. */
  peaceOffers: Array<{ from: number; to: number }>;
  /** Overseas market price multiplier per good (drifts over time). */
  prices: Record<GoodId, number>;
  /** Ways to win: progress and the winner. */
  victory: VictoryState;
  /** World crises (events.ts): oil shock and recession, until these game times. */
  oilShockUntil?: number;
  recessionUntil?: number;
  /** Shared weather: wind, cloud, calm spells, droughts (energy.ts). */
  weather?: Weather;
  /** Spy reports bought (latest per buyer and target), and the id counter. */
  reports?: IntelReport[];
  nextReportId?: number;
  /** Replays: the options the game was created with, and every player order since (absent in games from older saves). */
  setup?: CityOptions;
  log?: TimedCommand[];
}

export function emptyBudget(): Budget {
  return { taxes: 0, trade: 0, imports: 0, upkeep: 0, roads: 0, construction: 0, military: 0 };
}

export function newPlayerCity(credits: number): PlayerCity {
  return {
    credits,
    taxRate: 1,
    year: emptyBudget(),
    lastYear: emptyBudget(),
    population: perTier(),
    workforce: perTier(),
    jobs: perTier(),
    employed: perTier(),
    weariness: 0,
    age: 0,
    research: 0,
    happiness: 0.6,
    powerSupply: 0,
    powerDemand: 0,
    made: {},
    used: {},
    madeLog: [],
    usedLog: [],
    trade: {},
    deals: {},
    relations: null,
    stockpile: {},
    gdp: 0,
    lastGdp: 0,
    history: [],
  };
}

export function newCityBuilding(): CityBuildingState {
  return {
    stock: {},
    incoming: {},
    delivered: {},
    access: -1,
    comp: 0,
    workers: 0,
    cycle: 0,
    yield: 1,
    efficiency: 0,
    status: '',
    powered: false,
    powerOut: 0,
    trucksOut: 0,
    crewsOut: 0,
    crewsHere: 0,
    level: 0,
    residents: 0,
    growth: 0,
    needs: { food: false, water: false, goods: false, power: false, police: false, health: false, school: false, electronics: false, data: false, pharma: false, university: false },
    upFor: 0,
    downFor: 0,
    happiness: 0.6,
    served: 0,
    market: 0,
    covered: { market: false, water: false, police: false, health: false, school: false, data: false, university: false },
    pollution: 0,
    capture: 0,
    captureBy: -1,
  };
}

export function createCityState(width: number, height: number, regions: number, players: number, credits: number): CityState {
  return {
    road: new Uint8Array(width * height),
    condition: new Float32Array(width * height),
    roadCount: 0,
    comp: new Int32Array(width * height),
    rail: new Uint8Array(width * height),
    railComp: new Int32Array(width * height),
    railCount: 0,
    railVersion: 1,
    railCompVersion: 0,
    trains: [],
    nextTrainId: 1,
    pipe: new Uint8Array(width * height),
    pipeComp: new Int32Array(width * height),
    pipeCount: 0,
    pipeVersion: 1,
    pipeCompVersion: 0,
    roadVersion: 1,
    compVersion: 0,
    regionOwner: new Int8Array(regions + 1).fill(-1),
    trucks: [],
    nextTruckId: 1,
    players: Array.from({ length: players }, () => newPlayerCity(credits)),
    coverage: {},
    ships: [],
    nextShipId: 1,
    bots: [],
    aiQueue: [],
    war: Array.from({ length: players }, () => new Array(players).fill(0)),
    warStart: Array.from({ length: players }, () => new Array(players).fill(0)),
    treaties: [],
    embargoes: [],
    peaceOffers: [],
    prices: Object.fromEntries(GOOD_IDS.map((g) => [g, 1])) as Record<GoodId, number>,
    victory: newVictoryState(players),
  };
}

export function add(s: Stock, g: GoodId, n: number): void {
  s[g] = (s[g] ?? 0) + n;
}

export function get(s: Stock, g: GoodId): number {
  return s[g] ?? 0;
}

/** Farms, mines and factories can run on robots (Nano age). */
export function automatable(b: Building): boolean {
  const e = b.def.econ;
  return !!e?.jobs && !!e.recipe && (b.def.category === 'industry' || b.def.category === 'resource') && b.type !== 'robotics_plant';
}

/** Is this building running on robots now? */
export function automated(b: Building): boolean {
  return automatable(b) && get(b.city!.stock, 'robotics') >= 0.05;
}

/** Staff a building needs for full output (half when automated). */
export function jobsOf(b: Building): number {
  const n = b.def.econ?.jobs?.count ?? 0;
  return automated(b) ? Math.ceil(n * AUTOMATION.share) : n;
}

