// What the human player has selected, plus control groups. UI state, not sim state.

import type { World } from '../sim/world.ts';

export class Selection {
  readonly ids = new Set<number>();
  private readonly groups = new Map<number, number[]>();
  private readonly listeners: Array<() => void> = [];
  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  set(ids: Iterable<number>, additive = false): void {
    if (!additive) this.ids.clear();
    for (const id of ids) this.ids.add(id);
    this.changed();
  }

  toggle(id: number): void {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    this.changed();
  }

  clear(): void {
    if (this.ids.size === 0) return;
    this.ids.clear();
    this.changed();
  }

  list(): number[] {
    return [...this.ids].sort((a, b) => a - b);
  }

  /** Drop ids of units that no longer exist (from M3, units can die). */
  prune(): void {
    let removed = false;
    for (const id of this.ids) {
      if (!this.world.getUnit(id)) {
        this.ids.delete(id);
        removed = true;
      }
    }
    if (removed) this.changed();
  }

  assignGroup(n: number): void {
    this.groups.set(n, this.list());
  }

  recallGroup(n: number): boolean {
    const g = this.groups.get(n);
    if (!g || g.length === 0) return false;
    this.set(g.filter((id) => this.world.getUnit(id)));
    return true;
  }
}
