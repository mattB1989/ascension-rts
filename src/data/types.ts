// Shared vocabulary for the game data. See docs/TECH_TREE.md.

export type AgeId = 'modern' | 'digital' | 'nano' | 'space';

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
  move: MoveStyle;
  /** Render-only: flying height in tiles for air units. */
  flyHeight?: number;
  description: string;
}
