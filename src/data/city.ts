// Buildings of the economy game, Modern age (DESIGN.md §4-6). Starting values
// for the balance harness. Time: a game year is 120 s; recipes are per cycle.

import type { BuildingDef, BuildingId, EconDef, UnitEcon } from './types.ts';
import { UNITS, type UnitTypeId } from './units.ts';

const NONE = { ore: 0, energy: 0 } as const;
const common = { age: 'modern', cost: NONE, pop: 0, builtBy: 'engineer', mode: 'city' } as const;
const digital = { ...common, age: 'digital' } as const;
const nano = { ...common, age: 'nano' } as const;
const space = { ...common, age: 'space' } as const;

export const CITY_BUILDINGS = {
  // --- Core and logistics ---------------------------------------------------
  town_hall: {
    ...common, id: 'town_hall', name: 'Town Hall', category: 'core', requires: [], buildTime: 120, hp: 4000, size: [5, 5],
    placement: 'land', vision: 12, limit: 1, garrison: 8,
    econ: { credits: 0, materials: {}, upkeep: 0, storage: 500, trucks: 2, crews: 2 },
    description: 'Seat of government. Stores goods, sends trucks and runs two construction crews. Its militia and up to 8 garrisoned infantry defend it: lose it and its region falls.',
  },
  regional_office: {
    ...common, id: 'regional_office', name: 'Regional Office', category: 'core', requires: [], buildTime: 40, hp: 2000, size: [3, 3],
    placement: 'land', vision: 10, garrison: 4,
    econ: { credits: 2500, materials: { lumber: 30, concrete: 20 }, upkeep: 150, jobs: { tier: 0, count: 4 } },
    description: 'Claims an unclaimed region next to yours once built. Place it inside that region and connect it by road.',
  },
  maintenance_depot: {
    ...common, id: 'maintenance_depot', name: 'Maintenance Depot', category: 'logistics', requires: [], buildTime: 20, hp: 1000, size: [3, 2],
    placement: 'land', vision: 5,
    econ: { credits: 700, materials: { lumber: 10, concrete: 20 }, upkeep: 90, jobs: { tier: 0, count: 6 } },
    description: 'Road crews repair worn roads within 30 road tiles, worst first. Worn roads slow every truck down.',
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
  rail_station: {
    ...common, id: 'rail_station', name: 'Rail Station', category: 'logistics', requires: [], buildTime: 35, hp: 1500, size: [4, 2],
    placement: 'land', vision: 6,
    econ: { credits: 2000, materials: { lumber: 20, concrete: 20, steel: 20 }, upkeep: 160, jobs: { tier: 0, count: 6 }, storage: 300, trucks: 3, trains: 1 },
    description: 'A warehouse on the railway: its train carries 60 units at a time, fast, to other stations on the same line whose surroundings need them. Trucks bring it what the other stations want. Must touch a railway and a road.',
  },
  river_dock: {
    ...common, id: 'river_dock', name: 'River Dock', category: 'logistics', requires: [], buildTime: 30, hp: 1200, size: [3, 3],
    placement: 'coast', vision: 6,
    econ: { credits: 1800, materials: { lumber: 30, concrete: 10 }, upkeep: 120, jobs: { tier: 0, count: 6 }, storage: 250, trucks: 2, trains: 1 },
    description: 'A warehouse on a river or lake: its barge carries 40 units to your other docks on the same water, wherever the surroundings need them.',
  },
  airport: {
    ...digital, id: 'airport', name: 'Cargo Airport', category: 'logistics', requires: [], buildTime: 60, hp: 2500, size: [6, 4],
    placement: 'land', vision: 10,
    econ: { credits: 9000, materials: { concrete: 80, steel: 30 }, upkeep: 600, jobs: { tier: 1, count: 10 }, power: 8, storage: 300, trucks: 3, trains: 1 },
    description: 'Digital age. A warehouse with a cargo plane: it flies 30 units at a time to any of your other airports whose surroundings need them. No track needed.',
  },
  supply_depot: {
    ...common, id: 'supply_depot', name: 'Supply Depot', category: 'military', requires: [], buildTime: 25, hp: 1200, size: [3, 3],
    placement: 'land', vision: 8,
    econ: { credits: 900, materials: { lumber: 20, concrete: 10 }, upkeep: 90, jobs: { tier: 0, count: 4 } },
    description: 'Keeps your troops supplied within 30 tiles: they don\'t wear down away from home, and mend when out of combat. Build one near the front.',
  },
  coast_guard: {
    ...common, id: 'coast_guard', name: 'Coast Guard', category: 'logistics', requires: [], buildTime: 25, hp: 1200, size: [3, 3],
    placement: 'coast', vision: 10,
    econ: { credits: 1500, materials: { lumber: 15, concrete: 15, steel: 5 }, upkeep: 150, jobs: { tier: 0, count: 6 } },
    description: 'Patrol boats keep pirates away from your trade ports within 40 tiles. Without one, about one cargo ship in ten is raided (from 1955).',
  },
  trade_port: {
    ...common, id: 'trade_port', name: 'Trade Port', category: 'logistics', requires: [], buildTime: 40, hp: 2000, size: [4, 3],
    placement: 'coast', vision: 8,
    econ: { credits: 3000, materials: { lumber: 50 }, upkeep: 200, jobs: { tier: 0, count: 8 }, storage: 400, trucks: 6 },
    description: 'Trade with the overseas market: cargo ships take your surplus and bring what you lack (set it in 🚢 Trade). Must be on a coast that reaches the open sea.',
  },
  // --- Housing --------------------------------------------------------------
  house: {
    ...common, id: 'house', name: 'House', category: 'housing', requires: [], buildTime: 12, hp: 500, size: [2, 2],
    placement: 'land', vision: 3,
    econ: { credits: 60, materials: {}, upkeep: 0, housing: [8, 16, 24, 40, 64, 96] },
    description: 'Settlers build it themselves once it has a road. Grows from cottage to apartment (to a tower in the Digital age, a spire in the Nano age) as its needs are met.',
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
  rare_earth_mine: {
    ...digital, id: 'rare_earth_mine', name: 'Rare-Earth Mine', category: 'resource', requires: [], buildTime: 30, hp: 1000, size: [3, 3],
    placement: 'rare', vision: 4,
    econ: { credits: 1200, materials: { concrete: 15, steel: 10 }, upkeep: 90, jobs: { tier: 0, count: 8 }, extract: true, recipe: { in: {}, out: { rare: 3 }, seconds: 20 }, trucks: 1, pollution: 0.5 },
    description: 'Digital age. Digs rare earths for electronics. Must stand on a rare-earth deposit (green).',
  },
  uranium_mine: {
    ...digital, id: 'uranium_mine', name: 'Uranium Mine', category: 'resource', requires: [], buildTime: 30, hp: 1000, size: [3, 3],
    placement: 'uranium', vision: 4,
    econ: { credits: 1500, materials: { concrete: 20, steel: 10 }, upkeep: 110, jobs: { tier: 0, count: 8 }, extract: true, recipe: { in: {}, out: { uranium: 2 }, seconds: 24 }, trucks: 1, pollution: 0.6 },
    description: 'Digital age. Mines uranium for nuclear power. Must stand on a uranium deposit (yellow-green).',
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
    econ: { credits: 1600, materials: { steel: 20, concrete: 20 }, upkeep: 120, jobs: { tier: 0, count: 10 }, recipe: { in: { oil: 2 }, out: { fuel: 1, plastics: 2 }, seconds: 8 }, power: 6, trucks: 2, pollution: 0.8 },
    description: 'Splits crude oil into fuel and plastics.',
  },
  goods_factory: {
    ...common, id: 'goods_factory', name: 'Goods Factory', category: 'industry', requires: [], buildTime: 30, hp: 1400, size: [3, 3],
    placement: 'land', vision: 4,
    econ: { credits: 1400, materials: { steel: 15, concrete: 15 }, upkeep: 100, jobs: { tier: 1, count: 10 }, recipe: { in: { steel: 1, plastics: 1 }, out: { goods: 2 }, seconds: 10 }, power: 6, trucks: 1, pollution: 0.5 },
    description: 'Makes consumer goods from steel and plastics. Needs technicians.',
  },
  electronics_plant: {
    ...digital, id: 'electronics_plant', name: 'Electronics Plant', category: 'industry', requires: [], buildTime: 40, hp: 1600, size: [4, 3],
    placement: 'land', vision: 4,
    econ: { credits: 3000, materials: { concrete: 30, steel: 20 }, upkeep: 220, jobs: { tier: 1, count: 12 }, recipe: { in: { rare: 2, plastics: 1 }, out: { electronics: 2 }, seconds: 12 }, power: 10, trucks: 1, pollution: 0.3 },
    description: 'Digital age. Electronics from rare earths and plastics. Needs technicians and power.',
  },
  nano_fab: {
    ...nano, id: 'nano_fab', name: 'Nano Fab', category: 'industry', requires: [], buildTime: 50, hp: 2000, size: [4, 4],
    placement: 'land', vision: 5,
    econ: { credits: 9000, materials: { concrete: 60, steel: 40, electronics: 20 }, upkeep: 600, jobs: { tier: 3, count: 8 }, recipe: { in: { rare: 1, electronics: 1 }, out: { nano: 1 }, seconds: 15 }, power: 30, trucks: 1 },
    description: 'Nano age. Nanomaterials from rare earths and electronics. Needs scientists and 30 MW.',
  },
  robotics_plant: {
    ...nano, id: 'robotics_plant', name: 'Robotics Plant', category: 'industry', requires: [], buildTime: 45, hp: 1800, size: [4, 3],
    placement: 'land', vision: 5,
    econ: { credits: 7000, materials: { concrete: 50, steel: 40, electronics: 10 }, upkeep: 450, jobs: { tier: 2, count: 10 }, recipe: { in: { steel: 2, electronics: 1, nano: 1 }, out: { robotics: 2 }, seconds: 15 }, power: 15, trucks: 1, pollution: 0.2 },
    description: 'Nano age. Robots from steel, electronics and nanomaterials. Farms, mines and factories stocked with robots need half the staff.',
  },
  launch_site: {
    ...space, id: 'launch_site', name: 'Launch Site', category: 'industry', requires: [], buildTime: 80, hp: 3000, size: [5, 5],
    placement: 'land', vision: 8,
    econ: { credits: 25000, materials: { concrete: 150, steel: 100, nano: 20 }, upkeep: 1500, jobs: { tier: 3, count: 10 }, recipe: { in: { fuel: 6, electronics: 2, nano: 1 }, out: { orbital: 3 }, seconds: 30 }, power: 40, trucks: 2, pollution: 0.4, supplies: { electronics: 24, nano: 16 } },
    description: 'Space age. Sends mining craft to the asteroids; they bring back orbital alloys. Burns fuel, electronics and nanomaterials. Needs scientists. Also builds orbital fighters, drop ships and the Star Lance.',
  },
  pharma_plant: {
    ...digital, id: 'pharma_plant', name: 'Pharmaceutical Plant', category: 'industry', requires: [], buildTime: 40, hp: 1400, size: [3, 3],
    placement: 'land', vision: 4,
    econ: { credits: 2600, materials: { concrete: 30, steel: 10 }, upkeep: 200, jobs: { tier: 2, count: 8 }, recipe: { in: { crops: 2, plastics: 1 }, out: { pharma: 2 }, seconds: 12 }, power: 6, trucks: 1, pollution: 0.2 },
    description: 'Digital age. Medicines from crops and plastics, for hospitals. Needs engineers.',
  },
  // --- Utilities ------------------------------------------------------------
  power_plant: {
    ...common, id: 'power_plant', name: 'Oil Power Plant', category: 'utility', requires: [], buildTime: 35, hp: 1600, size: [4, 3],
    placement: 'land', vision: 5,
    econ: { credits: 1200, materials: { lumber: 10, concrete: 20, steel: 10 }, upkeep: 100, jobs: { tier: 0, count: 6 }, recipe: { in: { oil: 1 }, out: {}, seconds: 6 }, power: -30, powerKind: 'fossil', pollution: 0.7 },
    description: 'Burns crude oil: 30 MW on demand, day and night, for every building connected to it by road. Its smoke harms health across the nation.',
  },
  hydro_plant: {
    ...common, id: 'hydro_plant', name: 'Hydro Plant', category: 'utility', requires: [], buildTime: 45, hp: 2000, size: [3, 3],
    placement: 'freshWater', vision: 5,
    econ: { credits: 2200, materials: { concrete: 40, steel: 10 }, upkeep: 120, jobs: { tier: 0, count: 4 }, recipe: { in: {}, out: {}, seconds: 10 }, power: -20, powerKind: 'hydro', powerStore: 600 },
    description: 'A dam on a river or lake: 20 MW with no fuel, and its reservoir stores surplus power to cover calm, dark spells. Weak in droughts.',
  },
  wind_farm: {
    ...common, id: 'wind_farm', name: 'Wind Farm', category: 'utility', requires: [], buildTime: 25, hp: 900, size: [3, 3],
    placement: 'land', vision: 5,
    econ: { credits: 1500, materials: { concrete: 10, steel: 15 }, upkeep: 60, jobs: { tier: 0, count: 2 }, recipe: { in: {}, out: {}, seconds: 10 }, power: -18, powerKind: 'wind' },
    description: 'Up to 18 MW with no fuel or smoke, but only when the wind blows: calm spells need storage (a dam or batteries) or firm power behind it.',
  },
  solar_farm: {
    ...digital, id: 'solar_farm', name: 'Solar Farm', category: 'utility', requires: [], buildTime: 25, hp: 800, size: [4, 3],
    placement: 'land', vision: 4,
    econ: { credits: 2400, materials: { concrete: 10, steel: 10, electronics: 6 }, upkeep: 70, jobs: { tier: 1, count: 2 }, recipe: { in: {}, out: {}, seconds: 10 }, power: -30, powerKind: 'solar' },
    description: 'Digital age. Up to 30 MW from the sun: none at night and little in winter or under cloud. Pair it with storage.',
  },
  battery_storage: {
    ...digital, id: 'battery_storage', name: 'Grid Battery', category: 'utility', requires: [], buildTime: 25, hp: 900, size: [3, 2],
    placement: 'land', vision: 4,
    econ: { credits: 3000, materials: { concrete: 10, steel: 10, electronics: 12 }, upkeep: 90, jobs: { tier: 1, count: 1 }, recipe: { in: {}, out: {}, seconds: 10 }, power: 0, powerKind: 'battery', powerStore: 800 },
    description: 'Digital age. Stores surplus power and gives it back when wind and sun fail: no blackouts on a calm night, if it was charged.',
  },
  nuclear_plant: {
    ...digital, id: 'nuclear_plant', name: 'Nuclear Plant', category: 'utility', requires: [], buildTime: 60, hp: 3000, size: [4, 4],
    placement: 'land', vision: 6,
    econ: { credits: 6000, materials: { concrete: 80, steel: 40 }, upkeep: 400, jobs: { tier: 2, count: 8 }, recipe: { in: { uranium: 1 }, out: {}, seconds: 30 }, power: -100, powerKind: 'nuclear' },
    description: 'Digital age. 100 MW from a little uranium, with no smoke. Needs engineers.',
  },
  fusion_plant: {
    ...nano, id: 'fusion_plant', name: 'Fusion Plant', category: 'utility', requires: [], buildTime: 70, hp: 4000, size: [5, 5],
    placement: 'land', vision: 7,
    econ: { credits: 15000, materials: { concrete: 100, steel: 60, nano: 10 }, upkeep: 800, jobs: { tier: 3, count: 6 }, recipe: { in: {}, out: {}, seconds: 10 }, power: -250, powerKind: 'clean' },
    description: 'Nano age. 250 MW from seawater fusion: no fuel, no smoke. Needs scientists.',
  },
  orbital_relay: {
    ...space, id: 'orbital_relay', name: 'Orbital Solar Relay', category: 'utility', requires: [], buildTime: 60, hp: 2000, size: [4, 4],
    placement: 'land', vision: 6,
    econ: { credits: 20000, materials: { concrete: 60, steel: 40, orbital: 10 }, upkeep: 900, jobs: { tier: 3, count: 4 }, recipe: { in: { orbital: 1 }, out: {}, seconds: 60 }, power: -400, powerKind: 'clean' },
    description: 'Space age. Beams down sunlight collected in orbit: 400 MW. Needs a little orbital alloy to maintain.',
  },
  space_elevator: {
    ...space, id: 'space_elevator', name: 'Space Elevator', category: 'service', requires: [], buildTime: 300, hp: 10000, size: [6, 6],
    placement: 'land', vision: 14, limit: 1,
    econ: { credits: 150000, materials: { concrete: 400, steel: 300, nano: 100, orbital: 60 }, upkeep: 4000, jobs: { tier: 3, count: 20 }, power: 100 },
    description: 'Space age wonder. A cable to orbit. Keep it staffed and powered for 5 years and your nation wins.',
  },
  pumping_station: {
    ...common, id: 'pumping_station', name: 'Pumping Station', category: 'utility', requires: [], buildTime: 20, hp: 800, size: [2, 2],
    placement: 'freshWater', vision: 4,
    econ: { credits: 500, materials: { concrete: 10, steel: 5 }, upkeep: 50, jobs: { tier: 0, count: 2 }, waterSupply: 600 },
    description: 'Pumps river or lake water for 600 residents. Water Towers spread it to houses.',
  },
  water_well: {
    ...common, id: 'water_well', name: 'Water Well', category: 'utility', requires: [], buildTime: 15, hp: 500, size: [2, 2],
    placement: 'land', vision: 3,
    econ: { credits: 400, materials: { lumber: 5, concrete: 5 }, upkeep: 40, jobs: { tier: 0, count: 2 }, waterSupply: 200 },
    description: 'Groundwater for 200 residents, anywhere: for towns far from rivers and lakes. Water Towers spread it to houses.',
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
    description: 'Sells food, consumer goods, and later electronics and pharmaceuticals, to households within 26 road tiles. Trucks keep it stocked.',
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
  hospital: {
    ...digital, id: 'hospital', name: 'Hospital', category: 'service', requires: [], buildTime: 45, hp: 1600, size: [4, 3],
    placement: 'land', vision: 5,
    econ: { credits: 3000, materials: { concrete: 40, steel: 15 }, upkeep: 300, jobs: { tier: 1, count: 10 }, recipe: { in: { pharma: 1 }, out: {}, seconds: 20 }, service: { kind: 'health', radius: 40, capacity: 1600 }, power: 6 },
    description: 'Digital age. Healthcare for 1,600 residents within 40 road tiles, while trucks bring it pharmaceuticals.',
  },
  research_institute: {
    ...common, id: 'research_institute', name: 'Research Institute', category: 'service', requires: [], buildTime: 40, hp: 1400, size: [3, 3],
    placement: 'land', vision: 5,
    econ: { credits: 3500, materials: { concrete: 40, steel: 20 }, upkeep: 300, jobs: { tier: 1, count: 8 }, power: 6, research: 1 },
    description: 'Research towards the next age (see 🔬 Ages). Needs technicians and power.',
  },
  university: {
    ...digital, id: 'university', name: 'University', category: 'service', requires: [], buildTime: 50, hp: 1800, size: [4, 4],
    placement: 'land', vision: 5,
    econ: { credits: 6000, materials: { concrete: 50, steel: 20, lumber: 20 }, upkeep: 500, jobs: { tier: 2, count: 8 }, power: 6, research: 2, service: { kind: 'university', radius: 36, capacity: 1200 } },
    description: 'Digital age. Twice the research of an institute, and higher education for 1,200 residents within 36 road tiles (Nano-age spires need it). Needs engineers.',
  },
  data_exchange: {
    ...digital, id: 'data_exchange', name: 'Data Exchange', category: 'service', requires: [], buildTime: 25, hp: 900, size: [2, 2],
    placement: 'land', vision: 5,
    econ: { credits: 1200, materials: { concrete: 10, steel: 5 }, upkeep: 120, jobs: { tier: 1, count: 3 }, power: 3, service: { kind: 'data', radius: 32, capacity: 800 } },
    description: 'Digital age. Connects houses within 32 road tiles to the data network. Towers need it.',
  },
} as const satisfies Record<string, BuildingDef>;

/** House levels: names and what each needs to reach it (DESIGN.md §4). */
export const HOUSE_LEVELS = [
  { name: 'Cottage', tier: 0, needs: [] },
  { name: 'House', tier: 0, needs: ['food', 'water'] },
  { name: 'Terrace', tier: 1, needs: ['food', 'water', 'power', 'police'] },
  { name: 'Apartment', tier: 1, needs: ['food', 'water', 'goods', 'power', 'police', 'health', 'school'] },
  { name: 'Tower', tier: 2, age: 1, needs: ['food', 'water', 'goods', 'power', 'police', 'health', 'school', 'electronics', 'data'] },
  { name: 'Spire', tier: 3, age: 2, needs: ['food', 'water', 'goods', 'power', 'police', 'health', 'school', 'electronics', 'data', 'pharma', 'university'] },
] as const;
/** Age index a house level needs (towers: Digital). */
export const houseLevelAge = (level: number): number => (HOUSE_LEVELS[level] as { age?: number } | undefined)?.age ?? 0;
export type HouseNeed = (typeof HOUSE_LEVELS)[number]['needs'][number];

/** Order of the build palette in the economy game. */
export const CITY_PALETTE: Array<{ tab: string; icon: string; items: string[] }> = [
  { tab: 'Roads', icon: '🛣', items: ['road', 'rail', 'maglev', 'pipe'] },
  { tab: 'Housing', icon: '🏠', items: ['house'] },
  { tab: 'Raw', icon: '⛏', items: ['farm', 'fishing_harbour', 'logging_camp', 'quarry', 'iron_mine', 'oil_well', 'rare_earth_mine', 'uranium_mine'] },
  { tab: 'Industry', icon: '🏭', items: ['food_plant', 'sawmill', 'cement_works', 'steel_mill', 'oil_refinery', 'goods_factory', 'electronics_plant', 'pharma_plant', 'nano_fab', 'robotics_plant', 'launch_site'] },
  { tab: 'Logistics', icon: '🚚', items: ['warehouse', 'rail_station', 'river_dock', 'airport', 'trade_port', 'coast_guard', 'maintenance_depot', 'construction_office', 'regional_office'] },
  { tab: 'Utilities', icon: '⚡', items: ['power_plant', 'hydro_plant', 'wind_farm', 'solar_farm', 'battery_storage', 'nuclear_plant', 'fusion_plant', 'orbital_relay', 'pumping_station', 'water_well', 'water_tower'] },
  { tab: 'Services', icon: '🏛', items: ['market', 'police_station', 'clinic', 'school', 'research_institute', 'hospital', 'data_exchange', 'university', 'space_elevator'] },
  { tab: 'Military', icon: '⚔', items: ['barracks', 'vehicle_factory', 'shipyard', 'airfield', 'mech_foundry', 'supply_depot', 'watchtower', 'bunker', 'gun_turret', 'shield_generator'] },
];

/** Economy-game costs for the skirmish's military buildings (DESIGN.md §9: war is paid for by the economy). */
export const MILITARY_ECON: Record<string, EconDef> = {
  barracks: { credits: 1200, materials: { lumber: 20, concrete: 20 }, upkeep: 120, jobs: { tier: 0, count: 4 }, supplies: { steel: 8, fuel: 4, electronics: 4 } },
  vehicle_factory: { credits: 2500, materials: { concrete: 30, steel: 20 }, upkeep: 200, jobs: { tier: 0, count: 10 }, power: 6, supplies: { steel: 30, fuel: 12, electronics: 8, nano: 4 } },
  mech_foundry: { credits: 4000, materials: { concrete: 40, steel: 40 }, upkeep: 300, jobs: { tier: 1, count: 8 }, power: 12, supplies: { steel: 60, electronics: 16, nano: 10 } },
  watchtower: { credits: 300, materials: { lumber: 10, concrete: 5 }, upkeep: 20 },
  bunker: { credits: 500, materials: { concrete: 30 }, upkeep: 30 },
  gun_turret: { credits: 600, materials: { concrete: 10, steel: 10 }, upkeep: 40 },
  shipyard: { credits: 3000, materials: { concrete: 30, steel: 30 }, upkeep: 250, jobs: { tier: 0, count: 10 }, power: 6, supplies: { steel: 40, fuel: 20, electronics: 12, uranium: 4 } },
  airfield: { credits: 4000, materials: { concrete: 60, steel: 20 }, upkeep: 300, jobs: { tier: 1, count: 8 }, power: 6, supplies: { steel: 20, fuel: 30, electronics: 12 } },
  shield_generator: { credits: 6000, materials: { concrete: 40, steel: 30, nano: 10 }, upkeep: 400, jobs: { tier: 2, count: 4 }, power: 40 },
};

/** What units cost in the economy game: credits now, goods from the building's stock, upkeep. */
export const UNIT_ECON: Record<string, UnitEcon> = {
  rifleman: { credits: 120, goods: { steel: 1 }, upkeep: 15 },
  rocket_trooper: { credits: 220, goods: { steel: 2, fuel: 1 }, upkeep: 20 },
  skyguard: { credits: 260, goods: { steel: 2, fuel: 1 }, upkeep: 20 },
  scout_buggy: { credits: 300, goods: { steel: 3, fuel: 2 }, upkeep: 30 },
  battle_tank: { credits: 700, goods: { steel: 10, fuel: 4 }, upkeep: 60 },
  flak_track: { credits: 500, goods: { steel: 7, fuel: 3 }, upkeep: 45 },
  howitzer: { credits: 800, goods: { steel: 10, fuel: 3 }, upkeep: 60 },
  // Navy and air force
  patrol_boat: { credits: 500, goods: { steel: 6, fuel: 3 }, upkeep: 40 },
  destroyer: { credits: 1400, goods: { steel: 20, fuel: 8 }, upkeep: 100 },
  frigate: { credits: 1200, goods: { steel: 16, fuel: 6 }, upkeep: 90 },
  transport_ship: { credits: 700, goods: { steel: 10, fuel: 4 }, upkeep: 50 },
  fighter_jet: { credits: 1200, goods: { steel: 8, fuel: 10 }, upkeep: 90 },
  attack_helicopter: { credits: 1000, goods: { steel: 6, fuel: 8 }, upkeep: 80 },
  cargo_plane: { credits: 900, goods: { steel: 8, fuel: 8 }, upkeep: 60 },
  // Digital age
  exo_trooper: { credits: 320, goods: { steel: 2, electronics: 1 }, upkeep: 30 },
  rocket_artillery: { credits: 1200, goods: { steel: 12, fuel: 4, electronics: 3 }, upkeep: 90 },
  warden: { credits: 2000, goods: { steel: 20, electronics: 6 }, upkeep: 140 },
  nuclear_submarine: { credits: 2600, goods: { steel: 24, fuel: 6, electronics: 6, uranium: 2 }, upkeep: 180 },
  aegis_cruiser: { credits: 2400, goods: { steel: 26, fuel: 8, electronics: 8 }, upkeep: 170 },
  aircraft_carrier: { credits: 5000, goods: { steel: 60, fuel: 20, electronics: 10 }, upkeep: 380 },
  stealth_bomber: { credits: 2400, goods: { steel: 10, fuel: 12, electronics: 8 }, upkeep: 170 },
  // Nano age
  disruptor: { credits: 1400, goods: { steel: 8, electronics: 4, nano: 2 }, upkeep: 100 },
  juggernaut: { credits: 4500, goods: { steel: 40, electronics: 10, nano: 8 }, upkeep: 300 },
  arclight: { credits: 4000, goods: { steel: 30, electronics: 12, nano: 6 }, upkeep: 260 },
  nano_swarm: { credits: 900, goods: { electronics: 2, nano: 3 }, upkeep: 60, at: 'mech_foundry' },
  // Space age: from the Launch Site
  orbital_fighter: { credits: 3000, goods: { electronics: 6, nano: 4, orbital: 3 }, upkeep: 200, at: 'launch_site' },
  drop_ship: { credits: 3500, goods: { electronics: 6, nano: 4, orbital: 4 }, upkeep: 220, at: 'launch_site' },
  star_lance: { credits: 20000, goods: { electronics: 20, nano: 15, orbital: 10 }, upkeep: 1200, at: 'launch_site' },
};

/** Where the economy game trains a unit. */
export function econTrainedAt(type: UnitTypeId): BuildingId {
  return UNIT_ECON[type]?.at ?? UNITS[type].trainedAt;
}

/** Army size: this many units, plus one per this many residents. */
export const ARMY = { base: 6, perResidents: 20 } as const;

/** Taking a region: seconds attackers must hold its seat with no defenders near. */
export const CAPTURE = { seconds: 30, attackerRange: 4, defenderRange: 8 } as const;

/** Consumption per resident per game year. */
export const CONSUMPTION = { food: 0.4, goods: 0.2, electronics: 0.12, pharma: 0.1 } as const;
/** Nano age: robots in stock halve the staff of farms, mines and factories; each uses this many robots a year. */
export const AUTOMATION = { share: 0.5, perYear: 0.5 } as const;
/** Taxes per resident per game year, by tier, at the default rate. */
export const TAX_PER_RESIDENT = [10, 22, 40, 70] as const;

/**
 * Reaching the next age (DESIGN.md §10): research from institutes, enough people of
 * the top tier so far, a yearly GDP, and a price. Index: the age being reached.
 */
export const AGE_STEPS = [
  null,
  { name: 'Digital Age', research: 300, tier: 1, people: 300, gdp: 3000, credits: 8000, unlocks: 'Engineers and towers, electronics, rare earths and uranium, pharmaceuticals and hospitals, nuclear power, the data network, exo-troopers, rocket artillery and the Warden mech' },
  { name: 'Nano Age', research: 1500, tier: 2, people: 120, gdp: 9000, credits: 20000, unlocks: 'Scientists and spires, nanomaterials, robotics and automation, fusion power, the Disruptor, the Juggernaut and the Arclight' },
  { name: 'Space Age', research: 3500, tier: 3, people: 60, gdp: 14000, credits: 40000, unlocks: 'launch sites and orbital alloys, orbital solar relays, and the Space Elevator: run it for 5 years to win' },
] as const;
/** Highest age that can be reached. */
export const MAX_AGE = 3;

/**
 * Ways to win (DESIGN.md §11). Checked once a game year; the game goes on afterwards.
 * Economic: a share of world GDP (every nation and city-state) held for some years.
 * Federation: a share of all regions, at least half of them gained peacefully.
 * Space: the Space Elevator kept running. Conquest: every rival nation defeated.
 */
export const VICTORY = { gdpShare: 0.5, gdpYears: 10, regionShare: 0.5, peacefulShare: 0.5, elevatorYears: 5, minAge: 3 } as const;
/** Road costs and upkeep (credits). */
export const ROAD = {
  cost: 10,
  bridgeCost: 120,
  upkeepPerYear: 1,
  /** Truck speed on a perfect road, tiles per second. */
  speed: 3,
  /** Condition lost per truck driving onto a tile, and per tile every 10 seconds of age. */
  truckWear: 0.002,
  ageWear: 0.004,
  /** Speed on a ruined road, as a share of full speed. */
  worstSpeed: 0.45,
  /** Repair per second a fully staffed depot spreads over its worst roads, and its reach. */
  repair: 0.35,
  depotRadius: 30,
} as const;
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
