// The deterministic simulation. No DOM, no three.js: it runs the same in the
// browser and in Node (tests, headless AI-vs-AI). Advances in fixed ticks.

import { BUILDINGS, type BuildingTypeId } from '../data/buildings.ts';
import type { UnitDef } from '../data/types.ts';
import { UNITS, type UnitTypeId } from '../data/units.ts';
import type { Command } from './commands.ts';
import {
  cancelConstruction, cancelQueueItem, claimOil, orderBuildAssist, orderGather, orderPlace, orderResearch, orderTrain,
  updateBuildings, updateWorker,
} from './economy.ts';
import { FOG_INTERVAL, updateFog } from './fog.ts';
import type { GameMap } from './map.ts';
import { moveUnit, orderMove, separate, stopUnit } from './movement.ts';
import { layerForDomain, NavGrid } from './nav.ts';
import { Pathfinder } from './pathfinding.ts';
import { Rng } from './rng.ts';
import { DT } from './time.ts';
import { POP_LIMIT, type Building, type Entity, type GameEvent, type PlayerState, type ResourceState, type Unit } from './types.ts';

export { DT, TICK_RATE } from './time.ts';
export type { Building, Entity, GameEvent, PlayerState, ResourceState, Unit, UnitState } from './types.ts';

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
  readonly players: PlayerState[];
  /** Kept sorted by id: iteration order is part of determinism. */
  readonly units: Unit[] = [];
  readonly buildings: Building[] = [];
  readonly resources: ResourceState[];
  /** Tile index -> resource index, for spots still on the map. */
  readonly resourceAtTile = new Map<number, number>();
  /** Per tile: building id occupying it, or 0. */
  readonly occupancy: Int32Array;
  /** Events raised during the last step (UI notifications, sounds). */
  events: GameEvent[] = [];
  private readonly byId = new Map<number, Entity>();
  private nextId = 1;

  constructor(map: GameMap, players: PlayerInfo[], seed: number) {
    this.map = map;
    this.nav = new NavGrid(map);
    this.pathfinder = new Pathfinder(this.nav);
    this.rng = new Rng(seed);
    this.occupancy = new Int32Array(map.width * map.height);
    const n = map.width * map.height;
    this.players = players.map((p) => ({
      ...p,
      age: 'modern',
      res: { ore: 0, energy: 0 },
      gathered: { ore: 0, energy: 0 },
      researched: new Set(),
      mult: { gather: { ore: 1, energy: 1 }, produce: { ore: 1, energy: 1 }, buildSpeed: 1 },
      popUsed: 0,
      popCap: 0,
      visible: new Uint8Array(n),
      explored: new Uint8Array(n),
    }));
    this.resources = map.resources.map((r, index) => ({
      index,
      kind: r.kind,
      x: r.x,
      y: r.y,
      tx: Math.floor(r.x),
      ty: Math.floor(r.y),
      amount: r.amount,
      max: r.amount,
      offshore: r.offshore,
      claimedBy: 0,
    }));
    for (const r of this.resources) {
      const i = r.ty * map.width + r.tx;
      this.resourceAtTile.set(i, r.index);
      // Ore crystals block movement; oil spots are flat until a derrick is built on them.
      if (r.kind === 'ore') this.nav.setBlocked(r.tx, r.ty, true, map);
    }
  }

  // -------------------------------------------------------------------------
  // Lookup

  getEntity(id: number): Entity | undefined {
    return this.byId.get(id);
  }

  getUnit(id: number): Unit | undefined {
    const e = this.byId.get(id);
    return e?.kind === 'unit' ? e : undefined;
  }

  getBuilding(id: number): Building | undefined {
    const e = this.byId.get(id);
    return e?.kind === 'building' ? e : undefined;
  }

  unitsOf(player: number): Unit[] {
    return this.units.filter((u) => u.owner === player);
  }

  buildingsOf(player: number): Building[] {
    return this.buildings.filter((b) => b.owner === player);
  }

  hasCompleted(player: number, type: BuildingTypeId): boolean {
    return this.buildings.some((b) => b.owner === player && b.type === type && b.complete);
  }

  /** Ore spot within `radius` of a point, or -1. */
  oreNear(x: number, y: number, radius: number): number {
    let best = -1;
    let bestD = radius * radius;
    for (const r of this.resources) {
      if (r.kind !== 'ore' || r.amount <= 0) continue;
      const d = (r.x - x) * (r.x - x) + (r.y - y) * (r.y - y);
      if (d <= bestD) {
        bestD = d;
        best = r.index;
      }
    }
    return best;
  }

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  // -------------------------------------------------------------------------
  // Creation and removal

  spawnUnit(type: UnitTypeId, owner: number, x: number, y: number, angle = 0): Unit {
    const def: UnitDef = UNITS[type];
    const u: Unit = {
      kind: 'unit',
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
      task: null,
      carry: 0,
      working: false,
    };
    this.units.push(u);
    this.byId.set(u.id, u);
    this.recomputePop(this.players[owner]!);
    return u;
  }

  addBuilding(type: BuildingTypeId, owner: number, tx: number, ty: number, complete: boolean): Building {
    const def = BUILDINGS[type];
    const [w, h] = def.size;
    const b: Building = {
      kind: 'building',
      id: this.nextId++,
      owner,
      type,
      def,
      tx, ty, w, h,
      x: tx + w / 2,
      y: ty + h / 2,
      hp: complete ? def.hp : def.hp * 0.1,
      maxHp: def.hp,
      progress: complete ? 1 : 0,
      complete,
      queue: [],
      rally: null,
      resource: -1,
      builders: 0,
      waitingForPop: false,
    };
    this.buildings.push(b);
    this.byId.set(b.id, b);
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        this.occupancy[y * this.map.width + x] = b.id;
        this.nav.setBlocked(x, y, true, this.map);
      }
    }
    claimOil(this, b);
    this.recomputePop(this.players[owner]!);
    return b;
  }

  removeBuilding(b: Building): void {
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    this.byId.delete(b.id);
    for (let y = b.ty; y < b.ty + b.h; y++) {
      for (let x = b.tx; x < b.tx + b.w; x++) {
        this.occupancy[y * this.map.width + x] = 0;
        this.nav.setBlocked(x, y, false, this.map);
      }
    }
    if (b.resource >= 0) this.resources[b.resource]!.claimedBy = 0;
    for (const u of this.units) if (u.task?.kind === 'build' && u.task.building === b.id) u.task = null;
    this.recomputePop(this.players[b.owner]!);
  }

  depleteResource(r: ResourceState): void {
    r.amount = 0;
    const i = r.ty * this.map.width + r.tx;
    this.resourceAtTile.delete(i);
    if (r.kind === 'ore' && this.occupancy[i] === 0) this.nav.setBlocked(r.tx, r.ty, false, this.map);
  }

  recomputePop(p: PlayerState): void {
    let used = 0;
    for (const u of this.units) if (u.owner === p.id) used += u.def.pop;
    let cap = 0;
    for (const b of this.buildings) if (b.owner === p.id && b.complete) cap += b.def.pop;
    p.popUsed = used;
    p.popCap = Math.min(POP_LIMIT, cap);
  }

  // -------------------------------------------------------------------------
  // Simulation step

  /** Advance one tick, applying the given commands first. */
  step(commands: readonly Command[] = []): void {
    this.events = [];
    for (const u of this.units) {
      u.px = u.x;
      u.py = u.y;
      u.pa = u.angle;
    }
    for (const c of commands) this.apply(c);
    for (const u of this.units) updateWorker(this, u);
    for (const u of this.units) moveUnit(this, u);
    separate(this);
    updateBuildings(this);
    if (this.tick % FOG_INTERVAL === 0) updateFog(this);
    this.tick++;
  }

  /** Seconds of game time elapsed. */
  get time(): number {
    return this.tick * DT;
  }

  private ownedUnits(player: number, ids: readonly number[]): Unit[] {
    const out: Unit[] = [];
    const seen = new Set<number>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const u = this.getUnit(id);
      if (u && u.owner === player) out.push(u);
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  private ownedBuilding(player: number, id: number): Building | undefined {
    const b = this.getBuilding(id);
    return b && b.owner === player ? b : undefined;
  }

  private notify(player: number, text: string | null): void {
    if (text) this.emit({ kind: 'notify', player, text });
  }

  private apply(c: Command): void {
    switch (c.kind) {
      case 'move': {
        const units = this.ownedUnits(c.player, c.units);
        for (const u of units) {
          u.task = null;
          u.working = false;
        }
        orderMove(this, units, c.x, c.y);
        break;
      }
      case 'stop':
        for (const u of this.ownedUnits(c.player, c.units)) {
          u.task = null;
          u.working = false;
          stopUnit(u);
        }
        break;
      case 'gather':
        orderGather(this, this.ownedUnits(c.player, c.units), c.resource);
        break;
      case 'build': {
        const r = orderPlace(this, c.player, this.ownedUnits(c.player, c.units), c.building, c.tx, c.ty);
        if (typeof r === 'string') this.notify(c.player, `Can't build: ${r}`);
        break;
      }
      case 'assist': {
        const b = this.ownedBuilding(c.player, c.target);
        if (b) orderBuildAssist(this, this.ownedUnits(c.player, c.units), b);
        break;
      }
      case 'train': {
        const b = this.ownedBuilding(c.player, c.building);
        if (b) this.notify(c.player, orderTrain(this, c.player, b, c.unit));
        break;
      }
      case 'research': {
        const b = this.ownedBuilding(c.player, c.building);
        if (b) this.notify(c.player, orderResearch(this, c.player, b, c.tech));
        break;
      }
      case 'cancel': {
        const b = this.ownedBuilding(c.player, c.building);
        if (b) cancelQueueItem(this, b, c.index);
        break;
      }
      case 'cancelBuild': {
        const b = this.ownedBuilding(c.player, c.building);
        if (b) cancelConstruction(this, b);
        break;
      }
      case 'rally': {
        const b = this.ownedBuilding(c.player, c.building);
        if (b) b.rally = { x: c.x, y: c.y };
        break;
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
      mix(u.carry);
    }
    for (const b of this.buildings) {
      mix(b.id);
      mix(b.progress);
      mix(b.hp);
      for (const q of b.queue) mix(q.progress);
    }
    for (const p of this.players) {
      mix(p.res.ore);
      mix(p.res.energy);
    }
    for (const r of this.resources) mix(r.amount);
    mix(this.rng.state);
    return h >>> 0;
  }
}
