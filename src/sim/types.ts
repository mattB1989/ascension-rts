// Simulation entity and player types.

import type { BuildingTypeId } from '../data/buildings.ts';
import type { TechId } from '../data/techs.ts';
import type { AgeId, BuildingDef, ResourceId, UnitDef } from '../data/types.ts';
import type { UnitTypeId } from '../data/units.ts';
import type { NavLayerId } from './nav.ts';

export type UnitState = 'idle' | 'moving';

export type UnitTask =
  /** Mine ore at a resource spot, carry it to a drop-off, repeat. */
  | { kind: 'gather'; res: number; phase: 'toResource' | 'mining' | 'toDropOff'; dropId: number }
  /** Construct a building (foundation) until complete. */
  | { kind: 'build'; building: number }
  /** Walk to a transport (ship at the shore, or a cargo plane parked at its airfield) and get in. */
  | { kind: 'board'; carrier: number }
  /** Transport ship: sail to the coast nearest (x, y), put everyone ashore, send them to (x, y). */
  | { kind: 'unload'; x: number; y: number }
  /** Cargo plane: fly over (x, y) and drop everyone by parachute, then fly home. */
  | { kind: 'paradrop'; x: number; y: number }
  /** Aircraft: fly back to an airfield and land. */
  | { kind: 'return' }
  /** Tanker: load oil at a rig's tank, carry it to a Shipyard, repeat. */
  | { kind: 'haul'; rig: number; phase: 'toRig' | 'loading' | 'toDropOff'; dropId: number }
  /** Wander towards unexplored ground until the map (reachable by this unit) is explored. */
  | { kind: 'explore'; tried: number[] };

export interface Unit {
  kind: 'unit';
  id: number;
  owner: number;
  type: UnitTypeId;
  def: UnitDef;
  layer: NavLayerId;
  x: number;
  y: number;
  angle: number;
  /** Position and angle at the start of the current tick, for render interpolation. */
  px: number;
  py: number;
  pa: number;
  hp: number;
  state: UnitState;
  /** Remaining waypoints, flat [x, y, ...]. */
  path: number[];
  pathIdx: number;
  goalX: number;
  goalY: number;
  speed: number;
  stuckTicks: number;
  task: UnitTask | null;
  /** Ore being carried (engineers). */
  carry: number;
  /** True while mining or constructing (render: work animation). */
  working: boolean;
  /** Units inside this transport. */
  cargo: number[];
  /** Transport this unit is riding in, or 0. */
  carrier: number;
  /** Seconds left under a parachute (0 when on the ground). */
  chute: number;
  /** Aircraft that must land: fuel left (seconds of flight), parked state and home airfield. */
  fuel: number;
  parked: boolean;
  home: number;
  /** Parking spot index at the home airfield. */
  slot: number;
}

export type QueueItem =
  | { kind: 'unit'; unit: UnitTypeId; progress: number; total: number }
  | { kind: 'tech'; tech: TechId; progress: number; total: number };

export interface Building {
  kind: 'building';
  id: number;
  owner: number;
  type: BuildingTypeId;
  def: BuildingDef;
  /** Footprint: top-left tile and size. */
  tx: number;
  ty: number;
  w: number;
  h: number;
  /** Centre (world coords). */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Construction progress 0..1. */
  progress: number;
  complete: boolean;
  queue: QueueItem[];
  rally: { x: number; y: number } | null;
  /** Resource spot this building sits on (derricks, rigs), else -1. */
  resource: number;
  /** Builders working on it this tick (recomputed every tick). */
  builders: number;
  /** Builders who worked on it during the last tick (for the UI). */
  activeBuilders: number;
  /** True when the front of the queue is done but waiting for housing. */
  waitingForPop: boolean;
  /** Oil waiting in a rig's tank. */
  stored: number;
}

export type Entity = Unit | Building;

export interface ResourceState {
  index: number;
  kind: 'ore' | 'oil';
  x: number;
  y: number;
  tx: number;
  ty: number;
  amount: number;
  max: number;
  offshore: boolean;
  /** Building sitting on this spot (oil), or 0. */
  claimedBy: number;
}

export interface PlayerState {
  id: number;
  name: string;
  color: number;
  isHuman: boolean;
  age: AgeId;
  res: Record<ResourceId, number>;
  /** Cumulative totals, for income rates and the post-game report. */
  gathered: Record<ResourceId, number>;
  researched: Set<TechId>;
  mult: { gather: Record<ResourceId, number>; produce: Record<ResourceId, number>; buildSpeed: number };
  popUsed: number;
  popCap: number;
  /** Fog of war, one byte per tile: currently visible / ever explored. */
  visible: Uint8Array;
  explored: Uint8Array;
}

export type GameEvent =
  | { kind: 'notify'; player: number; text: string; x?: number; y?: number }
  | { kind: 'unitLost'; player: number; unit: number; reason: string }
  | { kind: 'buildingComplete'; player: number; building: number }
  | { kind: 'unitTrained'; player: number; unit: number }
  | { kind: 'researchComplete'; player: number; tech: TechId };

export const POP_LIMIT = 200;
export const CARRY_CAPACITY = 10;
export const MAX_QUEUE = 5;
