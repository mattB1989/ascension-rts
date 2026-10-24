// Fixed-timestep driver around the simulation. Player input becomes commands,
// which are applied on the next tick and logged (for replays later).

import type { Command, TimedCommand } from './sim/commands.ts';
import { DT, type GameEvent, type World } from './sim/world.ts';

export class Game {
  readonly world: World;
  readonly humanPlayer: number;
  readonly log: TimedCommand[] = [];
  timeScale = 1;
  paused = false;
  private pending: Command[] = [];
  /** Replay mode: the recorded orders, played back at their ticks (your own orders are ignored). */
  private replay: TimedCommand[] | null = null;
  private cursor = 0;
  private events: GameEvent[] = [];
  private acc = 0;

  constructor(world: World, humanPlayer: number) {
    this.world = world;
    this.humanPlayer = humanPlayer;
  }

  issue(cmd: Command): void {
    if (!this.replay) this.pending.push(cmd);
  }

  /** Play back a recorded game: `world` must be freshly created from the same setup. */
  playBack(log: TimedCommand[]): void {
    this.replay = log;
    this.cursor = 0;
  }

  get replaying(): boolean {
    return !!this.replay;
  }

  /** Events raised since the last call (UI notifications). */
  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Advance by real elapsed time. Returns the interpolation factor for rendering. */
  update(frameDt: number): number {
    if (this.paused) return 1;
    this.acc += Math.min(frameDt, 0.25) * this.timeScale;
    let steps = 0;
    while (this.acc >= DT && steps < 8) {
      let cmds = this.pending;
      this.pending = [];
      if (this.replay) {
        cmds = [];
        const r = this.replay;
        while (this.cursor < r.length && r[this.cursor]!.tick <= this.world.tick) {
          if (r[this.cursor]!.tick === this.world.tick) cmds.push(r[this.cursor]!.cmd);
          this.cursor++;
        }
      }
      for (const cmd of cmds) {
        this.log.push({ tick: this.world.tick, cmd });
        this.world.city?.log?.push({ tick: this.world.tick, cmd });
      }
      this.world.step(cmds);
      if (this.world.events.length) this.events.push(...this.world.events);
      this.acc -= DT;
      steps++;
    }
    if (steps === 8) this.acc = 0; // too far behind (tab was in background): drop the backlog
    return this.acc / DT;
  }
}
