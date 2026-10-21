// The deterministic simulation. No DOM, no three.js: it runs the same in the
// browser and in Node (tests, headless AI-vs-AI). Advances in fixed ticks.

import { UNITS, type UnitTypeId } from '../data/units.ts';
import type { UnitDef } from '../data/types.ts';
import type { Command } from './commands.ts';
import { fatan2, fcos, fsin, PI, TAU, wrapAngle } from './fmath.ts';
import type { GameMap } from './map.ts';
import { layerForDomain, NavGrid, NavLayer, type NavLayerId } from './nav.ts';
import { Pathfinder } from './pathfinding.ts';
import { Rng } from './rng.ts';

export const TICK_RATE = 15;
export const DT = 1 / TICK_RATE;

export type UnitState = 'idle' | 'moving';

export interface Unit {
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
}

export interface PlayerInfo {
  id: number;
  name: string;
  color: number;
  isHuman: boolean;
}

export class World {
  tick = 0;
  readonly map: GameMap;
  readonly nav: NavGrid;
  readonly pathfinder: Pathfinder;
  readonly rng: Rng;
  readonly players: PlayerInfo[];
  /** Kept sorted by id: iteration order is part of determinism. */
  readonly units: Unit[] = [];
  private readonly byId = new Map<number, Unit>();
  private nextId = 1;

  constructor(map: GameMap, players: PlayerInfo[], seed: number) {
    this.map = map;
    this.players = players;
    this.nav = new NavGrid(map);
    this.pathfinder = new Pathfinder(this.nav);
    this.rng = new Rng(seed);
  }

  getUnit(id: number): Unit | undefined {
    return this.byId.get(id);
  }

  spawnUnit(type: UnitTypeId, owner: number, x: number, y: number, angle = 0): Unit {
    const def = UNITS[type];
    const u: Unit = {
      id: this.nextId++,
      owner,
      type,
      def,
      layer: layerForDomain(def.domain),
      x, y, angle,
      px: x, py: y, pa: angle,
      hp: def.hp,
      state: 'idle',
      path: [],
      pathIdx: 0,
      goalX: x,
      goalY: y,
      speed: 0,
      stuckTicks: 0,
    };
    this.units.push(u);
    this.byId.set(u.id, u);
    return u;
  }

  /** Advance one tick, applying the given commands first. */
  step(commands: readonly Command[] = []): void {
    for (const u of this.units) {
      u.px = u.x;
      u.py = u.y;
      u.pa = u.angle;
    }
    for (const c of commands) this.apply(c);
    for (const u of this.units) this.moveUnit(u);
    this.separate();
    this.tick++;
  }

  private ownedUnits(player: number, ids: readonly number[]): Unit[] {
    const out: Unit[] = [];
    const seen = new Set<number>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const u = this.byId.get(id);
      if (u && u.owner === player) out.push(u);
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  private apply(c: Command): void {
    switch (c.kind) {
      case 'move':
        this.orderMove(this.ownedUnits(c.player, c.units), c.x, c.y);
        break;
      case 'stop':
        for (const u of this.ownedUnits(c.player, c.units)) {
          u.path = [];
          u.pathIdx = 0;
          u.goalX = u.x;
          u.goalY = u.y;
          u.state = 'idle';
        }
        break;
    }
  }

  /** Group move: give each unit its own slot in a loose formation around the target. */
  private orderMove(units: Unit[], x: number, y: number): void {
    const byLayer = new Map<NavLayerId, Unit[]>();
    for (const u of units) {
      const list = byLayer.get(u.layer) ?? [];
      list.push(u);
      byLayer.set(u.layer, list);
    }
    for (const layer of [NavLayer.Land, NavLayer.Water, NavLayer.Air] as const) {
      const group = byLayer.get(layer);
      if (!group) continue;
      let spacing = 0;
      for (const u of group) spacing = Math.max(spacing, u.def.radius * 2 + 0.25);
      if (layer === NavLayer.Air) spacing = Math.max(spacing, 1.6);
      const slots = this.formationSlots(layer, x, y, group.length, spacing);
      // Closest units take the closest slots: fewer crossing paths.
      const ordered = group
        .map((u) => ({ u, d: (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) }))
        .sort((a, b) => a.d - b.d || a.u.id - b.u.id);
      ordered.forEach(({ u }, i) => {
        const [sx, sy] = slots[i]!;
        this.setDestination(u, sx, sy);
      });
    }
  }

  /** Spiral of slot positions around (x, y) on passable tiles of a layer. */
  private formationSlots(layer: NavLayerId, x: number, y: number, n: number, spacing: number): Array<[number, number]> {
    const slots: Array<[number, number]> = [];
    if (layer !== NavLayer.Air && !this.nav.passableAt(layer, x, y)) {
      const near = this.pathfinder.nearestPassable(layer, Math.floor(x), Math.floor(y), 24);
      if (near) {
        x = near[0] + 0.5;
        y = near[1] + 0.5;
      }
    }
    slots.push([x, y]);
    for (let ring = 1; slots.length < n && ring < 30; ring++) {
      const r = ring * spacing;
      const count = Math.max(6, Math.floor((TAU * r) / spacing));
      for (let k = 0; k < count && slots.length < n; k++) {
        const a = (k / count) * TAU + ring * 0.5;
        const sx = x + fcos(a) * r;
        const sy = y + fsin(a) * r;
        if (layer === NavLayer.Air || this.nav.passableAt(layer, sx, sy)) slots.push([sx, sy]);
      }
    }
    while (slots.length < n) slots.push([x, y]);
    return slots;
  }

  private setDestination(u: Unit, x: number, y: number): void {
    u.goalX = x;
    u.goalY = y;
    u.stuckTicks = 0;
    if (u.layer === NavLayer.Air) {
      u.path = [x, y];
    } else {
      u.path = this.pathfinder.findPath(u.layer, u.x, u.y, x, y) ?? [];
      if (u.path.length >= 2) {
        u.goalX = u.path[u.path.length - 2]!;
        u.goalY = u.path[u.path.length - 1]!;
      }
    }
    u.pathIdx = 0;
    u.state = u.path.length > 0 ? 'moving' : 'idle';
  }

  private moveUnit(u: Unit): void {
    const def = u.def;
    if (def.move === 'jet') {
      this.moveJet(u);
      return;
    }
    if (u.state !== 'moving' || u.pathIdx >= u.path.length) {
      u.state = 'idle';
      u.speed = 0;
      return;
    }
    const tx = u.path[u.pathIdx]!;
    const ty = u.path[u.pathIdx + 1]!;
    const dx = tx - u.x;
    const dy = ty - u.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const isLast = u.pathIdx + 2 >= u.path.length;
    const arrive = isLast ? 0.12 : Math.max(0.35, def.speed * DT * 1.5);
    if (dist < arrive) {
      u.pathIdx += 2;
      if (u.pathIdx >= u.path.length) {
        u.state = 'idle';
        u.speed = 0;
      }
      return;
    }

    // Turn towards the waypoint.
    const want = fatan2(dy, dx);
    const diff = wrapAngle(want - u.angle);
    const maxTurn = def.turnRate * DT;
    u.angle = wrapAngle(u.angle + Math.max(-maxTurn, Math.min(maxTurn, diff)));

    // Vehicles and ships only drive when roughly facing the right way; slow down in turns.
    const absDiff = Math.abs(diff);
    let factor = 1;
    if (def.move === 'vehicle' || def.move === 'ship') {
      factor = absDiff > PI / 3 ? 0 : 1 - absDiff / (PI / 3) * 0.6;
    } else if (def.move === 'heli') {
      factor = absDiff > PI / 2 ? 0.2 : 1;
    }
    // Ease in on the final approach.
    if (isLast) factor *= Math.min(1, 0.35 + dist / 1.5);
    const accel = def.move === 'ship' ? 0.6 : 3;
    const target = def.speed * factor;
    u.speed += Math.max(-accel * 2 * DT * def.speed, Math.min(accel * DT * def.speed, target - u.speed));

    const step = Math.min(u.speed * DT, dist);
    const nx = u.x + fcos(u.angle) * step;
    const ny = u.y + fsin(u.angle) * step;
    if (u.layer === NavLayer.Air || this.nav.passableAt(u.layer, nx, ny)) {
      u.x = nx;
      u.y = ny;
    } else {
      u.speed = 0;
    }

    // Stuck detection: crowded at the destination, or blocked on the way.
    const moved = Math.abs(u.x - u.px) + Math.abs(u.y - u.py);
    if (u.speed > 0.2 * def.speed && moved < 0.25 * def.speed * DT) u.stuckTicks++;
    else if (absDiff < 0.5 && moved < 0.05 * def.speed * DT) u.stuckTicks++;
    else u.stuckTicks = Math.max(0, u.stuckTicks - 1);
    if (u.stuckTicks > 20) {
      const gdx = u.goalX - u.x;
      const gdy = u.goalY - u.y;
      if (gdx * gdx + gdy * gdy < 6.25) {
        u.state = 'idle';
        u.path = [];
        u.pathIdx = 0;
        u.speed = 0;
      } else if (u.stuckTicks > 45) {
        this.setDestination(u, u.goalX, u.goalY);
      }
    }
  }

  /** Jets always fly forward; when there is nothing to do they circle their goal. */
  private moveJet(u: Unit): void {
    const def = u.def;
    const dx = u.goalX - u.x;
    const dy = u.goalY - u.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const orbitR = 4;
    let want = fatan2(dy, dx);
    if (dist < orbitR * 1.4) {
      // Steer along a circle: tangent direction, pulled in or out towards the orbit radius.
      const pull = (dist - orbitR) / orbitR;
      want = want + PI / 2 - Math.max(-0.8, Math.min(0.8, pull));
      u.state = 'idle';
    } else {
      u.state = 'moving';
    }
    const diff = wrapAngle(want - u.angle);
    const maxTurn = def.turnRate * DT;
    u.angle = wrapAngle(u.angle + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    const cruise = u.state === 'idle' ? def.speed * 0.6 : def.speed;
    u.speed += Math.max(-def.speed * DT, Math.min(def.speed * DT, cruise - u.speed));
    u.x += fcos(u.angle) * u.speed * DT;
    u.y += fsin(u.angle) * u.speed * DT;
    // Keep inside the map.
    u.x = Math.max(1, Math.min(this.map.width - 1, u.x));
    u.y = Math.max(1, Math.min(this.map.height - 1, u.y));
  }

  /** Push overlapping units apart (per layer), using a coarse spatial hash. */
  private separate(): void {
    const cell = 2;
    const cols = Math.ceil(this.map.width / cell);
    const buckets = new Map<number, Unit[]>();
    for (const u of this.units) {
      if (u.def.move === 'jet') continue;
      const key = (u.layer * 100000) + Math.floor(u.y / cell) * cols + Math.floor(u.x / cell);
      const b = buckets.get(key);
      if (b) b.push(u);
      else buckets.set(key, [u]);
    }
    for (const u of this.units) {
      if (u.def.move === 'jet') continue;
      const cx = Math.floor(u.x / cell);
      const cy = Math.floor(u.y / cell);
      let pushX = 0;
      let pushY = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const b = buckets.get(u.layer * 100000 + (cy + oy) * cols + (cx + ox));
          if (!b) continue;
          for (const o of b) {
            if (o === u || o.def.move === 'jet') continue;
            const dx = u.x - o.x;
            const dy = u.y - o.y;
            const minD = u.def.radius + o.def.radius;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minD * minD) continue;
            const d = Math.sqrt(d2);
            const overlap = minD - d;
            // Identical positions: separate along an id-based direction.
            const nx = d > 1e-6 ? dx / d : fcos(u.id * 2.39996);
            const ny = d > 1e-6 ? dy / d : fsin(u.id * 2.39996);
            // Idle units yield to moving ones.
            const share = u.state === 'idle' && o.state === 'moving' ? 0.8 : u.state === 'moving' && o.state === 'idle' ? 0.2 : 0.5;
            pushX += nx * overlap * share;
            pushY += ny * overlap * share;
          }
        }
      }
      if (pushX === 0 && pushY === 0) continue;
      const maxPush = 0.15;
      const len = Math.sqrt(pushX * pushX + pushY * pushY);
      if (len > maxPush) {
        pushX = (pushX / len) * maxPush;
        pushY = (pushY / len) * maxPush;
      }
      if (u.layer === NavLayer.Air) {
        u.x += pushX;
        u.y += pushY;
        continue;
      }
      if (this.nav.passableAt(u.layer, u.x + pushX, u.y + pushY)) {
        u.x += pushX;
        u.y += pushY;
      } else if (this.nav.passableAt(u.layer, u.x + pushX, u.y)) {
        u.x += pushX;
      } else if (this.nav.passableAt(u.layer, u.x, u.y + pushY)) {
        u.y += pushY;
      }
    }
  }

  /** Hash of the whole simulation state, for determinism checks and desync detection. */
  stateHash(): number {
    const buf = new DataView(new ArrayBuffer(8));
    let h = 0x811c9dc5 ^ this.tick;
    const mix = (v: number) => {
      buf.setFloat64(0, v);
      for (let i = 0; i < 8; i++) {
        h ^= buf.getUint8(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    };
    for (const u of this.units) {
      mix(u.id);
      mix(u.x);
      mix(u.y);
      mix(u.angle);
      mix(u.hp);
      mix(u.speed);
    }
    mix(this.rng.state);
    return h >>> 0;
  }
}
