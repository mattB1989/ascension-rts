// Buildings of the economy game, Modern age (DESIGN.md §4-6). Starting values
// for the balance harness. Time: a game year is 120 s; recipes are per cycle.

import type { BuildingDef } from './types.ts';

const NONE = { ore: 0, energy: 0 } as const;
const common = { age: 'modern', cost: NONE, pop: 0, builtBy: 'engineer', mode: 'city' } as const;

export const CITY_BUILDINGS = {
  // --- Core and logistics ---------------------------------------------------
  town_hall: {
    ...common, id: 'town_hall', name: 'Town Hall', category: 'core', requires: [], buildTime: 120, hp: 4000, size: [5, 5],
    placement: 'land', vision: 12, limit: 1,
    econ: { credits: 0, materials: {}, upkeep: 0, storage: 500, trucks: 2, crews: 2 },
    description: 'Seat of government. Stores goods, sends trucks and runs two construction crews.',
  },
  regional_office: {
    ...common, id: 'regional_office', name: 'Regional Office', category: 'core', requires: [], buildTime: 40, hp: 2000, size: [3, 3],
    placement: 'land', vision: 10,
    econ: { credits: 2500, materials: { lumber: 30, concrete: 20 }, upkeep: 150, jobs: { tier: 0, count: 4 } },
    description: 'Claims an unclaimed region next to yours once built. Place it inside that region and connect it by road.',
  },
  construction_office: {
    ...common, id: 'construction_office', name: 'Construction Office', category: 'logistics', requires: [], buildTime: 25, hp: 1200, size: [3, 3],
    placement: 'land', vision: 5,
    econ: { credits: 900, materials: { lumber: 20, concrete: 10 }, upkeep: 120, jobs: { tier: 0, count: 6 }, crews: 3 },
    description: 'Three more construction crews: build faster, in more places at once.',
  },
  warehouse: {
    ...common, id: 'warehouse', name: 'Warehouse', category: 'logistics', requires: [], buildTime: 25, hp: 1500, size: [4, 3],
    placement: 'land', vision: 5,
    econ: { credits: 600, materials: { lumber: 30, concrete: 10 }, upkeep: 80, jobs: { tier: 0, count: 6 }, storage: 400, trucks: 3 },
    description: 'Takes in what producers make and sends it on to whoever needs it. Three trucks.',
  },
  trade_port: {
    ...common, id: 'trade_port', name: 'Trade Port', category: 'logistics', requires: [], buildTime: 40, hp: 2000, size: [4, 3],
    placement: 'coast', vision: 8,
    econ: { credits: 3000, materials: { lumber: 50 }, upkeep: 200, jobs: { tier: 0, count: 8 }, storage: 400, trucks: 3 },
    description: 'Trade with the overseas market: cargo ships take your surplus and bring what you lack (set it in 🚢 Trade). Must be on a coast that reaches the open sea.',
  },
  // --- Housing --------------------------------------------------------------
  house: {
    ...common, id: 'house', name: 'House', category: 'housing', requires: [], buildTime: 12, hp: 500, size: [2, 2],
    placement: 'land', vision: 3,
    econ: { credits: 60, materials: {}, upkeep: 0, housing: [8, 16, 24, 40] },
    description: 'Settlers build it themselves once it has a road. Grows from cottage to apartment as its needs are met.',
  },
  // --- Raw producers ----------------------------------------------------------
  farm: {
    ...common, id: 'farm', name: 'Farm', category: 'resource', requires: [], buildTime: 20, hp: 800, size: [4, 4],
    placement: 'fertile', vision: 4,
    econ: { credits: 400, materials: { lumber: 10 }, upkeep: 30, jobs: { tier: 0, count: 6 }, extract: true, recipe: { in: {}, out: { crops: 4 }, seconds: 20 }, trucks: 1 },
    description: 'Grows crops. Fertile floodplain yields full output, grassland 60%, sand 20%.',
  },
  fishing_harbour: {
    ...common, id: 'fishing_harbour', name: 'Fishing Harbour', category: 'resource', requires: [], buildTime: 20, hp: 800, size: [3, 3],
    placement: 'coast', vision: 5,
    econ: { credits: 500, materials: { lumber: 15 }, upkeep: 40, jobs: { tier: 0, count: 4 }, extract: true, recipe: { in: {}, out: { food: 3 }, seconds: 12 }, trucks: 1 },
    description: 'Lands fish straight as food. Output depends on open water nearby.',
  },
  logging_camp: {
    ...common, id: 'logging_camp', name: 'Logging Camp', category: 'resource', requires: [], buildTime: 15, hp: 600, size: [2, 2],
    placement: 'forest', vision: 4,
    econ: { credits: 250, materials: {}, upkeep: 20, jobs: { tier: 0, count: 4 }, extract: true, recipe: { in: {}, out: { timber: 4 }, seconds: 18 }, trucks: 1 },
    description: 'Fells timber. Output depends on forest within 5 tiles.',
  },
  quarry: {
    ...common, id: 'quarry', name: 'Quarry', category: 'resource', requires: [], buildTime: 20, hp: 800, size: [3, 3],
    placement: 'stone', vision: 4,
    econ: { credits: 400, materials: { lumber: 10 }, upkeep: 40, jobs: { tier: 0, count: 6 }, extract: true, recipe: { in: {}, out: { stone: 4 }, seconds: 18 }, trucks: 1, pollution: 0.3 },
    description: 'Cuts stone. Must stand on a stone deposit; more deposit under it, more output.',
  },
  iron_mine: {
    ...common, id: 'iron_mine', name: 'Iron Mine', category: 'resource', requires: [], buildTime: 25, hp: 1000, size: [3, 3],
    placement: 'ore', vision: 4,
    econ: { credits: 600, materials: { lumber: 15, concrete: 5 }, upkeep: 60, jobs: { tier: 0, count: 8 }, extract: true, recipe: { in: {}, out: { ore: 4 }, seconds: 18 }, trucks: 1, pollution: 0.4 },
    description: 'Digs iron ore. Must stand on an ore deposit.',
  },
  oil_well: {
    ...common, id: 'oil_well', name: 'Oil Well', category: 'resource', requires: [], buildTime: 20, hp: 700, size: [2, 2],
    placement: 'oil', vision: 4,
    econ: { credits: 700, materials: { steel: 5, concrete: 5 }, upkeep: 60, jobs: { tier: 0, count: 4 }, extract: true, recipe: { in: {}, out: { oil: 4 }, seconds: 16 }, trucks: 1, pollution: 0.3 },
    description: 'Pumps crude oil. Must stand on an oil deposit.',
  },
  // --- Industry -------------------------------------------------------------
  food_plant: {
    ...common, id: 'food_plant', name: 'Food Plant', category: 'industry', requires: [], buildTime: 25, hp: 1000, size: [3, 3],
    placement: 'land', vision: 4,
    econ: { credits: 700, materials: { lumber: 20, concrete: 10 }, upkeep: 60, jobs: { tier: 0, count: 8 }, recipe: { in: { crops: 2 }, out: { food: 3 }, seconds: 10 }, trucks: 1 },
    description: 'Turns crops into food.',
  },
  sawmill: {
    ...common, id: 'sawmill', name: 'Sawmill', category: 'industry', requires: [], buildTime: 20, hp: 900, size: [3, 3],
    placement: 'land', vision: 4,
    econ: { credits: 500, materials: { lumber: 10 }, upkeep: 40, jobs: { tier: 0, count: 6 }, recipe: { in: { timber: 2 }, out: { lumber: 2 }, seconds: 8 }, trucks: 1 },
    description: 'Saws timber into lumber.',
  },
  cement_works: {
    ...common, id: 'cement_works', name: 'Cement Works', category: 'industry', requires: [], buildTime: 25, hp: 1200, size: [3, 3],
    placement: 'land', vision: 4,
    econ: { credits: 800, materials: { lumber: 20, steel: 5 }, upkeep: 70, jobs: { tier: 0, count: 8 }, recipe: { in: { stone: 2 }, out: { concrete: 2 }, seconds: 8 }, power: 4, trucks: 1, pollution: 0.5 },
    description: 'Grinds and fires stone into concrete. Needs power.',
  },
  steel_mill: {
    ...common, id: 'steel_mill', name: 'Steel Mill', category: 'industry', requires: [], buildTime: 35, hp: 1800, size: [4, 4],
    placement: 'land', vision: 5,
    econ: { credits: 1500, materials: { lumber: 20, concrete: 30 }, upkeep: 120, jobs: { tier: 0, count: 12 }, recipe: { in: { ore: 2 }, out: { steel: 1 }, seconds: 8 }, power: 10, trucks: 1, pollution: 0.8 },
    description: 'Smelts iron ore into steel. Needs a lot of power.',
  },
  oil_refinery: {
    ...common, id: 'oil_refinery', name: 'Oil Refinery', category: 'industry', requires: [], buildTime: 35, hp: 1600, size: [4, 4],
    placement: 'land', vision: 5,
    econ: { credits: 1600, materials: { steel: 20, concrete: 20 }, upkeep: 120, jobs: { tier: 0, count: 10 }, recipe: { in: { oil: 2 }, out: { fuel: 1, plastics: 1 }, seconds: 8 }, power: 6, trucks: 2, pollution: 0.8 },
    description: 'Splits crude oil into fuel and plastics.',
  },
  goods_factory: {
    ...common, id: 'goods_factory', name: 'Goods Factory', category: 'industry', requires: [], buildTime: 30, hp: 1400, size: [3, 3],
    placement: 'land', vision: 4,
    econ: { credits: 1400, materials: { steel: 15, concrete: 15 }, upkeep: 100, jobs: { tier: 1, count: 10 }, recipe: { in: { steel: 1, plastics: 1 }, out: { goods: 2 }, seconds: 10 }, power: 6, trucks: 1, pollution: 0.5 },
    description: 'Makes consumer goods from steel and plastics. Needs technicians.',
  },
  // --- Utilities ------------------------------------------------------------
  power_plant: {
    ...common, id: 'power_plant', name: 'Oil Power Plant', category: 'utility', requires: [], buildTime: 35, hp: 1600, size: [4, 3],
    placement: 'land', vision: 5,
    econ: { credits: 1200, materials: { lumber: 10, concrete: 20, steel: 10 }, upkeep: 100, jobs: { tier: 0, count: 6 }, recipe: { in: { oil: 1 }, out: {}, seconds: 6 }, power: -30, pollution: 0.7 },
    description: 'Burns crude oil: 30 MW for every building connected to it by road.',
  },
  hydro_plant: {
    ...common, id: 'hydro_plant', name: 'Hydro Plant', category: 'utility', requires: [], buildTime: 45, hp: 2000, size: [3, 3],
    placement: 'freshWater', vision: 5,
    econ: { credits: 2200, materials: { concrete: 40, steel: 10 }, upkeep: 120, jobs: { tier: 0, count: 4 }, recipe: { in: {}, out: {}, seconds: 10 }, power: -20 },
    description: 'A dam on a river or lake: 20 MW with no fuel. Needs concrete and steel to build.',
  },
  pumping_station: {
    ...common, id: 'pumping_station', name: 'Pumping Station', category: 'utility', requires: [], buildTime: 20, hp: 800, size: [2, 2],
    placement: 'freshWater', vision: 4,
    econ: { credits: 500, materials: { concrete: 10, steel: 5 }, upkeep: 50, jobs: { tier: 0, count: 2 }, waterSupply: 600 },
    description: 'Pumps river or lake water for 600 residents. Water Towers spread it to houses.',
  },
  water_tower: {
    ...common, id: 'water_tower', name: 'Water Tower', category: 'utility', requires: [], buildTime: 15, hp: 600, size: [2, 2],
    placement: 'land', vision: 5,
    econ: { credits: 250, materials: { concrete: 5, steel: 2 }, upkeep: 20, service: { kind: 'water', radius: 24, capacity: 400 } },
    description: 'Gives running water to houses within 24 road tiles, fed by a Pumping Station on the same roads.',
  },
  // --- Services -------------------------------------------------------------
  market: {
    ...common, id: 'market', name: 'Market', category: 'service', requires: [], buildTime: 20, hp: 900, size: [3, 3],
    placement: 'land', vision: 4,
    econ: { credits: 400, materials: { lumber: 15 }, upkeep: 40, jobs: { tier: 0, count: 4 }, service: { kind: 'market', radius: 26, capacity: 500 } },
    description: 'Sells food and consumer goods to households within 26 road tiles. Trucks keep it stocked.',
  },
  police_station: {
    ...common, id: 'police_station', name: 'Police Station', category: 'service', requires: [], buildTime: 20, hp: 900, size: [2, 2],
    placement: 'land', vision: 6,
    econ: { credits: 500, materials: { lumber: 10, concrete: 10 }, upkeep: 90, jobs: { tier: 0, count: 4 }, service: { kind: 'police', radius: 28, capacity: 600 } },
    description: 'Keeps the peace within 28 road tiles. Terraces and apartments need it.',
  },
  clinic: {
    ...common, id: 'clinic', name: 'Clinic', category: 'service', requires: [], buildTime: 25, hp: 900, size: [3, 2],
    placement: 'land', vision: 4,
    econ: { credits: 700, materials: { concrete: 15, steel: 5 }, upkeep: 120, jobs: { tier: 1, count: 4 }, service: { kind: 'health', radius: 26, capacity: 500 }, power: 2 },
    description: 'Healthcare within 26 road tiles. Apartments need it.',
  },
  school: {
    ...common, id: 'school', name: 'School', category: 'service', requires: [], buildTime: 25, hp: 900, size: [3, 3],
    placement: 'land', vision: 4,
    econ: { credits: 700, materials: { lumber: 15, concrete: 15 }, upkeep: 120, jobs: { tier: 1, count: 4 }, service: { kind: 'school', radius: 26, capacity: 500 } },
    description: 'Education within 26 road tiles. Apartments need it.',
  },
} as const satisfies Record<string, BuildingDef>;

/** House levels: names and what each needs to reach it (DESIGN.md §4). */
export const HOUSE_LEVELS = [
  { name: 'Cottage', tier: 0, needs: [] },
  { name: 'House', tier: 0, needs: ['food', 'water'] },
  { name: 'Terrace', tier: 1, needs: ['food', 'water', 'power', 'police'] },
  { name: 'Apartment', tier: 1, needs: ['food', 'water', 'goods', 'power', 'police', 'health', 'school'] },
] as const;
export type HouseNeed = (typeof HOUSE_LEVELS)[number]['needs'][number];

/** Order of the build palette in the economy game. */
export const CITY_PALETTE: Array<{ tab: string; icon: string; items: string[] }> = [
  { tab: 'Roads', icon: '🛣', items: ['road'] },
  { tab: 'Housing', icon: '🏠', items: ['house'] },
  { tab: 'Raw', icon: '⛏', items: ['farm', 'fishing_harbour', 'logging_camp', 'quarry', 'iron_mine', 'oil_well'] },
  { tab: 'Industry', icon: '🏭', items: ['food_plant', 'sawmill', 'cement_works', 'steel_mill', 'oil_refinery', 'goods_factory'] },
  { tab: 'Logistics', icon: '🚚', items: ['warehouse', 'trade_port', 'construction_office', 'regional_office'] },
  { tab: 'Utilities', icon: '⚡', items: ['power_plant', 'hydro_plant', 'pumping_station', 'water_tower'] },
  { tab: 'Services', icon: '🏛', items: ['market', 'police_station', 'clinic', 'school'] },
];

/** Consumption per resident per game year. */
export const CONSUMPTION = { food: 0.4, goods: 0.2 } as const;
/** Taxes per resident per game year, by tier, at the default rate. */
export const TAX_PER_RESIDENT = [10, 22] as const;
/** Road costs and upkeep (credits). */
export const ROAD = { cost: 10, bridgeCost: 120, upkeepPerYear: 1, speed: 3 } as const;
export const START_CREDITS = 30000;
export const START_STOCK = { lumber: 180, concrete: 100, steel: 50, food: 60 } as const;

/** Overseas market (DESIGN.md §7): what it pays and charges, relative to reference prices. */
export const OVERSEAS = {
  /** Share of the world price you get when exporting. */
  sell: 0.75,
  /** Share of the world price you pay when importing. */
  buy: 1.3,
  /** Units a cargo ship carries each way. */
  capacity: 200,
  /** Seconds a ship stays docked. */
  dock: 6,
  /** Tiles per second at sea. */
  speed: 5,
  /** World prices drift by up to this much every 30 seconds, within the bounds. */
  drift: 0.04,
  min: 0.7,
  max: 1.45,
} as const;
