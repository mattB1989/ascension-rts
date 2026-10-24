// Every change to the game goes through a command. The human player, the AI and
// (later) network peers all produce the same commands, which makes replays,
// AI-vs-AI and lockstep multiplayer possible. The sim validates every command
// (ownership, cost, placement), so a client cannot cheat by sending bad ones.

import type { BuildingTypeId } from '../data/buildings.ts';
import type { TechId } from '../data/techs.ts';
import type { UnitTypeId } from '../data/units.ts';
import type { CityCommand } from './city/index.ts';

export type Command =
  | { kind: 'move'; player: number; units: number[]; x: number; y: number }
  | { kind: 'stop'; player: number; units: number[] }
  /** Engineers mine an ore spot (by resource index). */
  | { kind: 'gather'; player: number; units: number[]; resource: number }
  /** Place a foundation with its top-left tile at (tx, ty) and send the builders. */
  | { kind: 'build'; player: number; units: number[]; building: BuildingTypeId; tx: number; ty: number }
  /** Help construct an existing foundation. */
  | { kind: 'assist'; player: number; units: number[]; target: number }
  | { kind: 'train'; player: number; building: number; unit: UnitTypeId }
  | { kind: 'research'; player: number; building: number; tech: TechId }
  /** Cancel a queue item (refunded). */
  | { kind: 'cancel'; player: number; building: number; index: number }
  /** Cancel an unfinished building (refunded for the unbuilt part). */
  | { kind: 'cancelBuild'; player: number; building: number }
  | { kind: 'rally'; player: number; building: number; x: number; y: number }
  /** Units get into a transport (ship or cargo plane). */
  | { kind: 'board'; player: number; units: number[]; carrier: number }
  /** Transports put their passengers ashore near (x, y). */
  | { kind: 'unload'; player: number; units: number[]; x: number; y: number }
  /** Cargo planes drop their passengers by parachute over (x, y). */
  | { kind: 'paradrop'; player: number; units: number[]; x: number; y: number }
  /** Aircraft fly back to an airfield and land. */
  | { kind: 'returnBase'; player: number; units: number[] }
  /** Sea Engineers haul oil from a rig's tank to a Shipyard. */
  | { kind: 'haul'; player: number; units: number[]; building: number }
  /** Units head off into unexplored territory by themselves. */
  | { kind: 'explore'; player: number; units: number[] }
  /** Attack one enemy unit or building. */
  | { kind: 'attack'; player: number; units: number[]; target: number }
  /** Move, fighting anything met on the way. */
  | { kind: 'attackMove'; player: number; units: number[]; x: number; y: number }
  /** Infantry enter a building and fire from it. */
  | { kind: 'garrison'; player: number; units: number[]; building: number }
  /** Everyone out of a building. */
  | { kind: 'eject'; player: number; building: number }
  /** Place a line of foundations (walls) and send the builders along it. */
  | { kind: 'buildLine'; player: number; units: number[]; building: BuildingTypeId; tiles: Array<[number, number]> }
  | CityCommand;

/** A command stamped with the tick it executes on (for replays). */
export interface TimedCommand {
  tick: number;
  cmd: Command;
}
