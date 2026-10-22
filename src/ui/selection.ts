// What the human player has selected, plus control groups. UI state, not sim state.

import type { World } from '../sim/world.ts';

/** Something the player clicked that they don't control: shown in the info card, not commanded. */
export type Inspect =
  | { kind: 'resource'; index: number }
  | { kind: 'entity'; id: number }
  | { kind: 'ground'; x: number; y: number };

export class Selection {
  readonly ids = new Set<number>();
  inspect: Inspect | null = null;
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
    this.inspect = null;
    this.changed();
  }

  /** Look at something we don't control (clears the selection). */
  setInspect(i: Inspect): void {
    this.ids.clear();
    this.inspect = i;
    this.changed();
  }

  toggle(id: number): void {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    this.inspect = null;
    this.changed();
  }

  clear(): void {
    if (this.ids.size === 0 && !this.inspect) return;
    this.ids.clear();
    this.inspect = null;
    this.changed();
  }

  list(): number[] {
    return [...this.ids].sort((a, b) => a - b);
  }

  /** Drop ids of units that no longer exist (from M3, units can die). */
  prune(): void {
    let removed = false;
    const i = this.inspect;
    if (i && ((i.kind === 'entity' && !this.world.getEntity(i.id)) || (i.kind === 'resource' && (this.world.resources[i.index]?.amount ?? 0) <= 0))) {
      this.inspect = null;
      removed = true;
    }
    for (const id of this.ids) {
      // Gone, or riding inside a transport (select the transport instead).
      if (!this.world.getEntity(id) || this.world.getUnit(id)?.carrier) {
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
    this.set(g.filter((id) => this.world.getEntity(id)));
    return true;
  }
}
