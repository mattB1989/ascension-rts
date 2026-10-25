// Shared vocabulary for the game data. See docs/TECH_TREE.md (generated from these files).

import type { GoodId, Tier } from './goods.ts';

export type AgeId = 'modern' | 'digital' | 'nano' | 'space';

export type ResourceId = 'ore' | 'energy';

/** Where a unit can go. Decides which navigation layer it uses. */
export type Domain = 'land' | 'sea' | 'air';

/** Armor class, used by the damage-vs-armor table (TECH_TREE.md §6). */
export type ArmorClass = 'inf' | 'lt' | 'hv' | 'mech' | 'ship' | 'sub' | 'air' | 'orb' | 'str';

/** How a unit moves. Drives turning and acceleration behaviour in the sim. */
export type MoveStyle =
  | 'infantry' // turns almost instantly
  | 'vehicle' // must face roughly the right way before driving
  | 'ship' // like vehicle but slower to turn
  | 'jet' // always moving forward, circles when idle
  | 'heli'; // hovers, turns in place

export interface Cost {
  ore: number;
  energy: number;
}

export interface AgeDef {
  id: AgeId;
  name: string;
  index: number;
  theme: string;
  /** Cost and time to advance INTO this age (at the Command Center). */
  cost: Cost;
  time: number;
  /** All of these buildings, completed. */
  requiresAll: BuildingId[];
  /** And at least `anyCount` of these. */
  requiresAny: BuildingId[];
  anyCount: number;
}

export type BuildingCategory =
  | 'core' | 'housing' | 'resource' | 'military' | 'tech' | 'support' | 'defense' | 'special' | 'wonder'
  // Economy game
  | 'industry' | 'logistics' | 'utility' | 'service';

/** What the footprint must stand on. */
export type Placement =
  | 'land' // open land
  | 'coast' // land, touching water (shipyards, coastal batteries)
  | 'landOil' // on a land oil spot
  | 'seaOil' // on an offshore oil spot
  | 'water' // open water (sonar nets)
  // Economy game: raw producers sit on what they extract
  | 'fertile' // farms: open land; fertile floodplain yields most
  | 'forest' // logging camps: next to forest
  | 'stone' // quarries: on a stone deposit
  | 'ore' // mines: on an ore deposit
  | 'oil' // oil wells: on an oil deposit
  | 'rare' // rare-earth mines: on a rare-earth deposit
  | 'uranium' // uranium mines: on a uranium deposit
  | 'freshWater'; // pumping stations: next to a river or lake

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  age: AgeId;
  requires: readonly BuildingId[];
  cost: Cost;
  /** Seconds for one builder. */
  buildTime: number;
  hp: number;
  /** Footprint in tiles. */
  size: readonly [number, number];
  placement: Placement;
  /** Population capacity added once complete. */
  pop: number;
  vision: number;
  /** Who can build it. */
  builtBy: 'engineer' | 'sea_engineer';
  /** Resources that can be dropped off here. */
  dropOff?: readonly ResourceId[];
  /** Energy produced per second (derricks, rigs, fusion plants). */
  produces?: { resource: ResourceId; perSecond: number };
  /** Production goes into a tank instead of straight to the player: a pipeline drains it slowly, haulers empty it faster. */
  tank?: { capacity: number; pipeline: number };
  garrison?: number;
  /** Airfields: parking spots for aircraft that need to land and refuel. */
  dock?: number;
  /** Max number per player (wonders, superweapons). */
  limit?: number;
  /** Which game it belongs to (default: both). */
  mode?: 'city' | 'skirmish';
  /** Economy game: costs, jobs, production. */
  econ?: EconDef;
  description: string;
}

export type ServiceKind = 'market' | 'water' | 'police' | 'health' | 'school' | 'data' | 'university';

/** How a building takes part in the economy game (DESIGN.md §3-6). */
export interface EconDef {
  /** Price in credits, paid when placed. */
  credits: number;
  /** Materials trucks must deliver to the site before crews can build. */
  materials: Readonly<Partial<Record<GoodId, number>>>;
  /** Credits per game year. */
  upkeep: number;
  /** Staff needed for full output. */
  jobs?: { tier: Tier; count: number };
  /** One production cycle at full staff: inputs consumed, outputs made. */
  recipe?: { in: Readonly<Partial<Record<GoodId, number>>>; out: Readonly<Partial<Record<GoodId, number>>>; seconds: number };
  /** Raw producers: output scales with the land (see Placement). */
  extract?: boolean;
  /** Megawatts used (negative: produced). */
  power?: number;
  /** Power sources: firm (on demand), variable (wind and sun decide), or storage that evens out the rest. */
  powerKind?: 'fossil' | 'hydro' | 'nuclear' | 'wind' | 'solar' | 'clean' | 'battery';
  /** Energy it can store, in MW·seconds (hydro reservoirs, batteries). */
  powerStore?: number;
  /** Goods it can store (warehouses, town hall). */
  storage?: number;
  /** Delivery trucks. */
  trucks?: number;
  /** Trains (rail stations). */
  trains?: number;
  /** Construction crews. */
  crews?: number;
  /** Housing: residents at each level. */
  housing?: readonly number[];
  /** Covers households within `radius` road tiles, up to `capacity` residents. */
  service?: { kind: ServiceKind; radius: number; capacity: number };
  /** Water supply (residents) for pumping stations. */
  waterSupply?: number;
  /** Ground made worse for housing nearby (0..1). */
  pollution?: number;
  /** Research points per second at full staff (and power). */
  research?: number;
  /** Military buildings: goods kept in stock for training (trucks deliver them). */
  supplies?: Readonly<Partial<Record<GoodId, number>>>;
}

/** What a unit costs in the economy game. */
export interface UnitEcon {
  credits: number;
  goods: Readonly<Partial<Record<GoodId, number>>>;
  /** Credits per game year while it lives. */
  upkeep: number;
  /** Where the economy game trains it, when not where the skirmish does. */
  at?: BuildingId;
}

export interface UnitDef {
  id: string;
  name: string;
  domain: Domain;
  armor: ArmorClass;
  age: AgeId;
  cost: Cost;
  pop: number;
  hp: number;
  /** Tiles per second. */
  speed: number;
  /** Radians per second. */
  turnRate: number;
  /** Collision radius in tiles. */
  radius: number;
  vision: number;
  move: MoveStyle;
  trainedAt: BuildingId;
  trainTime: number;
  /** Render-only: flying height in tiles for air units. */
  flyHeight?: number;
  /** Builders: which building list they can construct. */
  builder?: 'engineer' | 'sea_engineer';
  /** Ore gathered per second while mining. */
  gatherRate?: number;
  /** Tankers: oil loaded per second at a rig, and how much they carry per trip. */
  haul?: { rate: number; capacity: number };
  /** Max per player. */
  limit?: number;
  /** Transports: how many cargo slots, and what may board (infantry take 1 slot, vehicles 3). */
  cargo?: { slots: number; carries: 'land' | 'infantry' };
  /** Aircraft that must land at an airfield: seconds of flight on a full tank. */
  fuel?: number;
  strongVs: string;
  weakVs: string;
  description: string;
}

/** Groups that research upgrades apply to. */
export type UpgradeGroup = 'infantry' | 'vehicles' | 'aircraft' | 'ships' | 'walls' | 'defenses' | 'buildings';

export type TechEffect =
  | { kind: 'gatherRate'; resource: ResourceId; mult: number }
  | { kind: 'produceRate'; resource: ResourceId; mult: number }
  | { kind: 'buildSpeed'; mult: number }
  | { kind: 'hp'; group: UpgradeGroup; mult: number }
  | { kind: 'speed'; group: UpgradeGroup; mult: number }
  | { kind: 'range'; group: UpgradeGroup; mult: number }
  | { kind: 'damage'; mult: number }
  | { kind: 'garrisonRange'; add: number }
  /** Effect not implemented yet: the tech is listed but cannot be researched. */
  | { kind: 'pending'; milestone: string };

export interface TechDef {
  id: string;
  name: string;
  at: BuildingId;
  age: AgeId;
  cost: Cost;
  time: number;
  summary: string;
  effects: readonly TechEffect[];
}

// Ids are plain strings in the defs (so the data files can reference each other
// without circular types); the catalog checks every reference in a test.
export type BuildingId = string;

export function unitGroup(def: Pick<UnitDef, 'domain' | 'armor'>): UpgradeGroup {
  if (def.domain === 'air') return 'aircraft';
  if (def.domain === 'sea') return 'ships';
  return def.armor === 'inf' ? 'infantry' : 'vehicles';
}

export function buildingGroup(def: Pick<BuildingDef, 'id' | 'category'>): UpgradeGroup {
  if (def.id === 'wall' || def.id === 'gate') return 'walls';
  return def.category === 'defense' ? 'defenses' : 'buildings';
}

/** Cargo slots a unit takes in a transport (0 = cannot be carried). */
export function cargoSize(def: Pick<UnitDef, 'domain' | 'armor' | 'pop'>): number {
  if (def.domain !== 'land') return 0;
  if (def.armor === 'inf') return def.pop >= 2 ? 2 : 1;
  if (def.armor === 'lt' || def.armor === 'hv') return 3;
  return 0;
}
