// Every change to the game goes through a command. The human player, the AI and
// (later) network peers all produce the same commands, which makes replays,
// AI-vs-AI and lockstep multiplayer possible.

export type Command =
  | { kind: 'move'; player: number; units: number[]; x: number; y: number }
  | { kind: 'stop'; player: number; units: number[] };

/** A command stamped with the tick it executes on (for replays). */
export interface TimedCommand {
  tick: number;
  cmd: Command;
}
