// The deterministic simulation. No DOM, no three.js: it runs the same in the
// browser and in Node (tests, headless AI-vs-AI). Advances in fixed ticks.

import { BUILDINGS, type BuildingTypeId } from '../data/buildings.ts';
import { buildingGroup, unitGroup, type UnitDef, type UpgradeGroup } from '../data/types.ts';
import { UNITS, type UnitTypeId } from '../data/units.ts';
import type { Command } from './commands.ts';
import {
  cancelConstruction, cancelQueueItem, claimOil, orderBuildAssist, orderGather, orderLine, orderPlace, orderResearch, orderTrain,
  updateBuildings, updateWorker,
} from './economy.ts';
import {
  checkVictory, eject, orderAttack, orderAttackMove, orderGarrison, updateBuildingCombat, updateGarrisonTask, updateProjectiles, updateUnitCombat,
} from './combat.ts';
import { orderExplore, updateExplore } from './explore.ts';
import { FOG_INTERVAL, updateFog } from './fog.ts';
import { orderHaul } from './haul.ts';
import type { GameMap } from './map.ts';
import { moveUnit, orderMove, separate, stopUnit } from './movement.ts';
import {
  immobile, orderBoard, orderParadrop, orderReturn, orderUnload, syncCargo, takeOff, updateAir, updateChute, updateTransport,
} from './transport.ts';
import { layerFor, NavGrid } from './nav.ts';
import { Pathfinder } from './pathfinding.ts';
import { Rng } from './rng.ts';
import { applyCityCommand } from './city/index.ts';
import { updateCity } from './city/economy.ts';
import type { CityState } from './city/state.ts';
import { DT } from './time.ts';
import { POP_LIMIT, type Building, type Entity, type GameEvent, type PlayerState, type Projectile, type ResourceState, type Unit } from './types.ts';

export { DT, TICK_RATE } from './time.ts';
export type { Building, Entity, GameEvent, PlayerState, Projectile, ResourceState, Unit, UnitState } from './types.ts';

const ONES: Record<UpgradeGroup, number> = { infantry: 1, vehicles: 1, aircraft: 1, ships: 1, walls: 1, defenses: 1, buildings: 1 };

export interface PlayerInfo {
  id: number;
  name: string;
  color: number;
  isHuman: boolean;
  role?: import('./types.ts').PlayerRole;
}

export type GameMode = 'skirmish' | 'city';

export class World {
  tick = 0;
  readonly mode: GameMode;
  /** Economy game state (null in skirmish). */
  city: CityState | null = null;
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
  projectiles: Projectile[] = [];
  nextProjectileId = 1;
  /** Set when only one player is left (-1: nobody). */
  winner: number | null = null;
  private readonly byId = new Map<number, Entity>();
  private nextId = 1;

  constructor(map: GameMap, players: PlayerInfo[], seed: number, mode: GameMode = 'skirmish') {
    this.mode = mode;
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
      mult: {
        gather: { ore: 1, energy: 1 },
        produce: { ore: 1, energy: 1 },
        buildSpeed: 1,
        hp: { ...ONES },
        speed: { ...ONES },
        range: { ...ONES },
        damage: 1,
        garrisonRange: 0,
      },
      defeated: false,
      alertAt: -999,
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
      layer: layerFor(def),
      x, y, angle,
      px: x, py: y, pa: angle,
      hp: def.hp * this.players[owner]!.mult.hp[unitGroup(def)],
      maxHp: def.hp * this.players[owner]!.mult.hp[unitGroup(def)],
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
      cargo: [],
      carrier: 0,
      chute: 0,
      fuel: def.fuel ?? 0,
      parked: false,
      home: 0,
      slot: -1,
      order: null,
      target: 0,
      cooldowns: [],
      anchorX: x,
      anchorY: y,
      aim: angle,
      firedAgo: 999,
      chaseIn: 0,
    };
    this.units.push(u);
    this.byId.set(u.id, u);
    this.recomputePop(this.players[owner]!);
    return u;
  }

  addBuilding(type: BuildingTypeId, owner: number, tx: number, ty: number, complete: boolean): Building {
    const def = BUILDINGS[type];
    const [w, h] = def.size;
    const maxHp = def.hp * this.players[owner]!.mult.hp[buildingGroup(def)];
    const b: Building = {
      kind: 'building',
      id: this.nextId++,
      owner,
      type,
      def,
      tx, ty, w, h,
      x: tx + w / 2,
      y: ty + h / 2,
      hp: complete ? maxHp : maxHp * 0.1,
      maxHp,
      progress: complete ? 1 : 0,
      complete,
      queue: [],
      rally: null,
      resource: -1,
      builders: 0,
      activeBuilders: 0,
      stored: 0,
      garrison: [],
      target: 0,
      cooldowns: [],
      aim: 0,
      firedAgo: 999,
      waitingForPop: false,
      city: null,
    };
    this.buildings.push(b);
    this.byId.set(b.id, b);
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        this.occupancy[y * this.map.width + x] = b.id;
        // Gates stay walkable, but only for their owner.
        if (type === 'gate') this.nav.setGate(x, y, owner);
        else this.nav.setBlocked(x, y, true, this.map);
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
        this.nav.setGate(x, y, null);
        this.nav.setBlocked(x, y, false, this.map);
      }
    }
    if (b.resource >= 0) this.resources[b.resource]!.claimedBy = 0;
    for (const u of this.units) if (u.task?.kind === 'build' && u.task.building === b.id) u.task = null;
    this.recomputePop(this.players[b.owner]!);
  }

  /** Remove a unit from play (and anyone riding in it). */
  removeUnit(u: Unit, reason: string, silent = false): void {
    for (const id of u.cargo) {
      const c = this.getUnit(id);
      if (c) this.removeUnit(c, reason, true);
    }
    u.cargo = [];
    const i = this.units.indexOf(u);
    if (i < 0) return;
    this.units.splice(i, 1);
    this.byId.delete(u.id);
    if (u.carrier) {
      const c = this.getEntity(u.carrier);
      if (c?.kind === 'unit') c.cargo = c.cargo.filter((id) => id !== u.id);
      else if (c) c.garrison = c.garrison.filter((id) => id !== u.id);
    }
    this.recomputePop(this.players[u.owner]!);
    this.emit({ kind: 'unitLost', player: u.owner, unit: u.id, reason });
    if (!silent) this.emit({ kind: 'notify', player: u.owner, text: `${u.def.name} lost: ${reason}`, x: u.x, y: u.y });
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
    // Economy game: the army limit grows with population (checked when recruiting).
    p.popCap = this.city ? POP_LIMIT : Math.min(POP_LIMIT, cap);
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
    // AI players (economy game) decided these at the end of the last tick.
    if (this.city?.aiQueue.length) {
      const q = this.city.aiQueue;
      this.city.aiQueue = [];
      for (const c of q) this.apply(c);
    }
    for (const u of this.units) {
      if (u.carrier) continue;
      if (u.chute > 0) {
        updateChute(this, u);
        continue;
      }
      updateWorker(this, u);
      updateTransport(this, u);
      updateExplore(this, u);
      updateGarrisonTask(this, u);
    }
    for (const u of [...this.units]) {
      if (this.getUnit(u.id)) updateUnitCombat(this, u);
    }
    for (const u of this.units) if (!immobile(u)) moveUnit(this, u);
    for (const u of [...this.units]) updateAir(this, u);
    syncCargo(this);
    separate(this);
    for (const b of [...this.buildings]) {
      if (this.getBuilding(b.id)) updateBuildingCombat(this, b);
    }
    updateProjectiles(this);
    updateBuildings(this);
    if (this.city) updateCity(this);
    else checkVictory(this);
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
      case 'road':
      case 'unroad':
      case 'place':
      case 'placeMany':
      case 'demolish':
      case 'taxRate':
      case 'tradeRule':
      case 'deal':
      case 'acceptUnion':
      case 'buyState':
      case 'recruit':
      case 'declareWar':
      case 'makePeace':
      case 'advanceAge':
      case 'proposeTreaty':
      case 'cancelTreaty':
        applyCityCommand(this, c);
        break;
      case 'move': {
        const units = this.ownedUnits(c.player, c.units).filter((u) => !u.carrier && u.chute <= 0);
        for (const u of units) {
          u.task = null;
          u.working = false;
          u.order = null;
          u.target = 0;
          u.chaseIn = 0;
          takeOff(u);
        }
        orderMove(this, units, c.x, c.y);
        break;
      }
      case 'board': {
        const carrier = this.getUnit(c.carrier);
        if (carrier && carrier.owner === c.player) orderBoard(this, this.ownedUnits(c.player, c.units), carrier);
        break;
      }
      case 'unload':
        orderUnload(this, this.ownedUnits(c.player, c.units), c.x, c.y);
        break;
      case 'paradrop':
        orderParadrop(this, this.ownedUnits(c.player, c.units), c.x, c.y);
        break;
      case 'returnBase':
        orderReturn(this, this.ownedUnits(c.player, c.units));
        break;
      case 'haul': {
        const b = this.ownedBuilding(c.player, c.building);
        if (b) orderHaul(this, this.ownedUnits(c.player, c.units), b);
        break;
      }
      case 'attack': {
        const t = this.getEntity(c.target);
        if (t && t.owner !== c.player) {
          const units = this.ownedUnits(c.player, c.units).filter((u) => !u.carrier && u.chute <= 0);
          for (const u of units) takeOff(u);
          orderAttack(this, units, t);
        }
        break;
      }
      case 'attackMove': {
        const units = this.ownedUnits(c.player, c.units).filter((u) => !u.carrier && u.chute <= 0);
        for (const u of units) takeOff(u);
        orderAttackMove(this, units, c.x, c.y);
        break;
      }
      case 'garrison': {
        const b = this.ownedBuilding(c.player, c.building);
        if (b) orderGarrison(this, this.ownedUnits(c.player, c.units), b);
        break;
      }
      case 'eject': {
        const b = this.ownedBuilding(c.player, c.building);
        if (b) eject(this, b);
        break;
      }
      case 'buildLine':
        orderLine(this, c.player, this.ownedUnits(c.player, c.units), c.building, c.tiles);
        break;
      case 'explore':
        orderExplore(this, this.ownedUnits(c.player, c.units).filter((u) => !u.carrier && u.chute <= 0));
        break;
      case 'stop':
        for (const u of this.ownedUnits(c.player, c.units)) {
          if (u.carrier || u.chute > 0 || u.parked) continue;
          u.order = null;
          u.target = 0;
          u.chaseIn = 0;
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
      mix(u.fuel);
      mix(u.carrier);
      mix(u.chute);
    }
    for (const b of this.buildings) {
      mix(b.id);
      mix(b.stored);
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
