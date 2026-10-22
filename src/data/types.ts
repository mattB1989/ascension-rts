// Shared vocabulary for the game data. See docs/TECH_TREE.md (generated from these files).

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

export type BuildingCategory = 'core' | 'housing' | 'resource' | 'military' | 'tech' | 'support' | 'defense' | 'special' | 'wonder';

/** What the footprint must stand on. */
export type Placement =
  | 'land' // open land
  | 'coast' // land, touching water (shipyards, coastal batteries)
  | 'landOil' // on a land oil spot
  | 'seaOil' // on an offshore oil spot
  | 'water'; // open water (sonar nets)

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
  description: string;
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
