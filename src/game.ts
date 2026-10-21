// Fixed-timestep driver around the simulation. Player input becomes commands,
// which are applied on the next tick and logged (for replays later).

import type { Command, TimedCommand } from './sim/commands.ts';
import { DT, type World } from './sim/world.ts';

export class Game {
  readonly world: World;
  readonly humanPlayer: number;
  readonly log: TimedCommand[] = [];
  timeScale = 1;
  paused = false;
  private pending: Command[] = [];
  private acc = 0;

  constructor(world: World, humanPlayer: number) {
    this.world = world;
    this.humanPlayer = humanPlayer;
  }

  issue(cmd: Command): void {
    this.pending.push(cmd);
  }

  /** Advance by real elapsed time. Returns the interpolation factor for rendering. */
  update(frameDt: number): number {
    if (this.paused) return 1;
    this.acc += Math.min(frameDt, 0.25) * this.timeScale;
    let steps = 0;
    while (this.acc >= DT && steps < 8) {
      const cmds = this.pending;
      this.pending = [];
      for (const cmd of cmds) this.log.push({ tick: this.world.tick, cmd });
      this.world.step(cmds);
      this.acc -= DT;
      steps++;
    }
    if (steps === 8) this.acc = 0; // too far behind (tab was in background): drop the backlog
    return this.acc / DT;
  }
}
