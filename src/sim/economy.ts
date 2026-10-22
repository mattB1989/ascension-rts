// Economy: gathering, construction, energy production, unit production and research.

import { BUILDINGS, type BuildingTypeId } from '../data/buildings.ts';
import { TECHS, techImplemented, type TechId } from '../data/techs.ts';
import type { ResourceId, TechEffect, UnitDef } from '../data/types.ts';
import { UNITS, type UnitTypeId } from '../data/units.ts';
import { fatan2, fcos, fsin } from './fmath.ts';
import { evict, orderMove, setDestination, stopUnit } from './movement.ts';
import { airfieldLoad, dockNew, takeOff } from './transport.ts';
import { layerFor, NavLayer } from './nav.ts';
import { ageIndex, buildLockReason, canAfford, oilUnder, pay, placementProblem, refund } from './placement.ts';
import { DT } from './time.ts';
import { CARRY_CAPACITY, MAX_QUEUE, POP_LIMIT, type Building, type PlayerState, type ResourceState, type Unit } from './types.ts';
import type { World } from './world.ts';

const MINE_REACH = 1.6;

/** Euclidean distance using only sqrt (Math.hypot is not guaranteed bit-identical across browsers). */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}
const BUILD_REACH = 0.9;

// ---------------------------------------------------------------------------
// Geometry helpers

export function distToRect(x: number, y: number, b: Building): number {
  const dx = Math.max(b.tx - x, 0, x - (b.tx + b.w));
  const dy = Math.max(b.ty - y, 0, y - (b.ty + b.h));
  return Math.sqrt(dx * dx + dy * dy);
}

/** A point just outside a building's footprint, on the side facing (x, y). */
function approachRect(b: Building, x: number, y: number): [number, number] {
  const cx = Math.max(b.tx, Math.min(b.tx + b.w, x));
  const cy = Math.max(b.ty, Math.min(b.ty + b.h, y));
  let dx = x - cx;
  let dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) {
    dx = x - b.x;
    dy = y - b.y;
    const d2 = Math.sqrt(dx * dx + dy * dy) || 1;
    return [b.x + (dx / d2) * (b.w / 2 + 0.7), b.y + (dy / d2) * (b.h / 2 + 0.7)];
  }
  return [cx + (dx / d) * 0.7, cy + (dy / d) * 0.7];
}

/**
 * Where a worker stands to mine a deposit: on the side facing it, fanned out by
 * unit id so a crowd spreads around the crystals instead of queueing for one spot.
 */
function approachPoint(world: World, u: Unit, res: ResourceState): [number, number] {
  const base = fatan2(u.y - res.y, u.x - res.x);
  const fan = ((u.id * 7) % 9 - 4) * 0.32;
  for (const extra of [0, 0.9, -0.9, 1.8, -1.8, 2.7, -2.7, 3.14]) {
    const a = base + fan + extra;
    const x = res.x + fcos(a) * 1.1;
    const y = res.y + fsin(a) * 1.1;
    if (world.nav.passableAt(u.layer, x, y)) return [x, y];
  }
  return [res.x + fcos(base) * 1.1, res.y + fsin(base) * 1.1];
}

// ---------------------------------------------------------------------------
// Orders

export function orderGather(world: World, units: Unit[], resIndex: number): void {
  const res = world.resources[resIndex];
  if (!res || res.kind !== 'ore' || res.amount <= 0) return;
  for (const u of units) {
    if (!u.def.gatherRate) continue;
    u.task = { kind: 'gather', res: resIndex, phase: u.carry >= CARRY_CAPACITY ? 'toDropOff' : 'toResource', dropId: 0 };
    u.working = false;
    const [ax, ay] = approachPoint(world, u, res);
    if (u.task.phase === 'toResource') setDestination(world, u, ax, ay);
    else stopUnit(u);
  }
}

export function orderBuildAssist(world: World, units: Unit[], b: Building): void {
  if (b.complete) return;
  for (const u of units) {
    if (u.def.builder !== b.def.builtBy) continue;
    u.task = { kind: 'build', building: b.id };
    u.working = false;
    const [ax, ay] = approachRect(b, u.x, u.y);
    setDestination(world, u, ax, ay);
  }
}

/** Place a foundation and send builders to it. Returns the building or a reason it failed. */
export function orderPlace(world: World, player: number, units: Unit[], type: BuildingTypeId, tx: number, ty: number): Building | string {
  const def = BUILDINGS[type];
  const builders = units.filter((u) => u.def.builder === def.builtBy);
  if (builders.length === 0) return def.builtBy === 'sea_engineer' ? 'Needs a Sea Engineer' : 'Needs an Engineer';
  const lock = buildLockReason(world, player, type);
  if (lock) return lock;
  const problem = placementProblem(world, player, type, tx, ty);
  if (problem) return problem;
  const p = world.players[player]!;
  if (!canAfford(p, def.cost)) return 'Not enough resources';
  pay(p, def.cost);
  const b = world.addBuilding(type, player, tx, ty, false);
  for (const u of world.units) evict(world, u);
  orderBuildAssist(world, builders, b);
  return b;
}

export function cancelConstruction(world: World, b: Building): void {
  if (b.complete) return;
  const p = world.players[b.owner]!;
  const keep = 1 - b.progress;
  refund(p, { ore: Math.floor(b.def.cost.ore * keep), energy: Math.floor(b.def.cost.energy * keep) });
  world.removeBuilding(b);
}

export function trainLockReason(world: World, player: number, b: Building, type: UnitTypeId): string | null {
  const def: UnitDef = UNITS[type];
  const p = world.players[player]!;
  if (!b.complete) return 'Under construction';
  if (def.trainedAt !== b.type) return 'Not built here';
  if (ageIndex(def.age) > ageIndex(p.age)) return `Needs the ${def.age[0]!.toUpperCase()}${def.age.slice(1)} Age`;
  if (def.limit !== undefined) {
    const have = world.unitsOf(player).filter((u) => u.type === type).length + queuedCount(world, player, type);
    if (have >= def.limit) return `Limit ${def.limit}`;
  }
  if (b.queue.length >= MAX_QUEUE) return 'Queue full';
  if (def.fuel && b.def.dock && airfieldLoad(world, b) >= b.def.dock) return `Airfield full (${b.def.dock} planes)`;
  return null;
}

function queuedCount(world: World, player: number, type: UnitTypeId): number {
  let n = 0;
  for (const b of world.buildingsOf(player)) for (const q of b.queue) if (q.kind === 'unit' && q.unit === type) n++;
  return n;
}

export function orderTrain(world: World, player: number, b: Building, type: UnitTypeId): string | null {
  const lock = trainLockReason(world, player, b, type);
  if (lock) return lock;
  const p = world.players[player]!;
  const def = UNITS[type];
  if (!canAfford(p, def.cost)) return 'Not enough resources';
  pay(p, def.cost);
  b.queue.push({ kind: 'unit', unit: type, progress: 0, total: def.trainTime });
  return null;
}

export function researchLockReason(world: World, player: number, b: Building, tech: TechId): string | null {
  const t = TECHS[tech];
  const p = world.players[player]!;
  if (!b.complete) return 'Under construction';
  if (t.at !== b.type) return 'Not researched here';
  if (!techImplemented(tech)) {
    const pending = t.effects.find((e) => e.kind === 'pending');
    return `Coming in ${pending && 'milestone' in pending ? pending.milestone : 'a later milestone'}`;
  }
  if (ageIndex(t.age) > ageIndex(p.age)) return `Needs the ${t.age[0]!.toUpperCase()}${t.age.slice(1)} Age`;
  if (p.researched.has(tech)) return 'Done';
  for (const ob of world.buildingsOf(player)) for (const q of ob.queue) if (q.kind === 'tech' && q.tech === tech) return 'In progress';
  if (b.queue.length >= MAX_QUEUE) return 'Queue full';
  return null;
}

export function orderResearch(world: World, player: number, b: Building, tech: TechId): string | null {
  const lock = researchLockReason(world, player, b, tech);
  if (lock) return lock;
  const p = world.players[player]!;
  const t = TECHS[tech];
  if (!canAfford(p, t.cost)) return 'Not enough resources';
  pay(p, t.cost);
  b.queue.push({ kind: 'tech', tech, progress: 0, total: t.time });
  return null;
}

export function cancelQueueItem(world: World, b: Building, index: number): void {
  const item = b.queue[index];
  if (!item) return;
  const p = world.players[b.owner]!;
  refund(p, item.kind === 'unit' ? UNITS[item.unit].cost : TECHS[item.tech].cost);
  b.queue.splice(index, 1);
  if (index === 0) b.waitingForPop = false;
}

// ---------------------------------------------------------------------------
// Per-tick worker behaviour (runs before movement)

export function updateWorker(world: World, u: Unit): void {
  const task = u.task;
  u.working = false;
  if (!task) return;
  if (task.kind === 'gather') updateGather(world, u, task);
  else if (task.kind === 'build') updateBuild(world, u, task);
}

function nearestOre(world: World, x: number, y: number, maxDist: number): number {
  let best = -1;
  let bestD = maxDist * maxDist;
  for (const r of world.resources) {
    if (r.kind !== 'ore' || r.amount <= 0) continue;
    const d = (r.x - x) * (r.x - x) + (r.y - y) * (r.y - y);
    if (d < bestD) {
      bestD = d;
      best = r.index;
    }
  }
  return best;
}

function nearestDropOff(world: World, u: Unit, resource: ResourceId): Building | undefined {
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of world.buildingsOf(u.owner)) {
    if (!b.complete || !b.def.dropOff?.includes(resource)) continue;
    const d = distToRect(u.x, u.y, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function updateGather(world: World, u: Unit, task: Extract<Unit['task'], { kind: 'gather' }>): void {
  const p = world.players[u.owner]!;
  if (task.phase === 'toDropOff') {
    let drop = world.getBuilding(task.dropId);
    if (!drop || !drop.complete || drop.owner !== u.owner) {
      drop = nearestDropOff(world, u, 'ore');
      if (!drop) {
        // Nowhere to deliver: wait with the cargo.
        if (u.state === 'idle') u.task = null;
        return;
      }
      task.dropId = drop.id;
      const [ax, ay] = approachRect(drop, u.x, u.y);
      setDestination(world, u, ax, ay);
    }
    if (distToRect(u.x, u.y, drop) <= u.def.radius + BUILD_REACH) {
      p.res.ore += u.carry;
      p.gathered.ore += u.carry;
      u.carry = 0;
      stopUnit(u);
      task.phase = 'toResource';
      task.dropId = 0;
      let res = world.resources[task.res];
      if (!res || res.amount <= 0) {
        const next = nearestOre(world, u.x, u.y, 18);
        if (next < 0) {
          u.task = null;
          return;
        }
        task.res = next;
        res = world.resources[next]!;
      }
      const [ax, ay] = approachPoint(world, u, res);
      setDestination(world, u, ax, ay);
    } else if (u.state === 'idle') {
      const [ax, ay] = approachRect(drop, u.x, u.y);
      setDestination(world, u, ax, ay);
    }
    return;
  }

  let res = world.resources[task.res];
  if (!res || res.amount <= 0) {
    const next = nearestOre(world, res?.x ?? u.x, res?.y ?? u.y, 15);
    if (next < 0) {
      if (u.carry > 0) startDelivery(world, u, task);
      else u.task = null;
      return;
    }
    task.res = next;
    res = world.resources[next]!;
    task.phase = 'toResource';
    const [ax, ay] = approachPoint(world, u, res);
    setDestination(world, u, ax, ay);
  }
  const d = dist(res.x, res.y, u.x, u.y);
  if (d <= MINE_REACH + u.def.radius) {
    if (task.phase !== 'mining') {
      task.phase = 'mining';
      stopUnit(u);
    }
    u.working = true;
    u.angle = fatan2(res.y - u.y, res.x - u.x);
    const rate = (u.def.gatherRate ?? 0) * p.mult.gather.ore * DT;
    const take = Math.min(rate, res.amount, CARRY_CAPACITY - u.carry);
    u.carry += take;
    res.amount -= take;
    if (res.amount <= 0) world.depleteResource(res);
    if (u.carry >= CARRY_CAPACITY - 1e-9) startDelivery(world, u, task);
  } else if (u.state === 'idle') {
    task.phase = 'toResource';
    const [ax, ay] = approachPoint(world, u, res);
    setDestination(world, u, ax, ay);
    // Could not get close (crowded): try another spot next time round.
    if (u.state === 'idle') {
      const next = nearestOre(world, u.x, u.y, 15);
      if (next >= 0 && next !== task.res) task.res = next;
    }
  }
}

function startDelivery(world: World, u: Unit, task: Extract<Unit['task'], { kind: 'gather' }>): void {
  task.phase = 'toDropOff';
  const drop = nearestDropOff(world, u, 'ore');
  if (!drop) {
    stopUnit(u);
    return;
  }
  task.dropId = drop.id;
  const [ax, ay] = approachRect(drop, u.x, u.y);
  setDestination(world, u, ax, ay);
}

function updateBuild(world: World, u: Unit, task: Extract<Unit['task'], { kind: 'build' }>): void {
  const b = world.getBuilding(task.building);
  if (!b || b.complete || b.owner !== u.owner) {
    u.task = null;
    afterBuilding(world, u, b ?? null);
    return;
  }
  if (distToRect(u.x, u.y, b) <= u.def.radius + BUILD_REACH) {
    if (u.state !== 'idle') stopUnit(u);
    u.working = true;
    b.builders++;
  } else if (u.state === 'idle') {
    const [ax, ay] = approachRect(b, u.x, u.y);
    setDestination(world, u, ax, ay);
  }
}

/** What a builder does once its building is finished. */
function afterBuilding(world: World, u: Unit, done: Building | null): void {
  if (done && done.complete && done.def.dropOff?.includes('ore') && u.def.gatherRate) {
    const ore = nearestOre(world, done.x, done.y, 12);
    if (ore >= 0) {
      orderGather(world, [u], ore);
      return;
    }
  }
  // Help with another foundation nearby.
  for (const b of world.buildingsOf(u.owner)) {
    if (!b.complete && b.def.builtBy === u.def.builder && dist(b.x, b.y, u.x, u.y) < 12) {
      orderBuildAssist(world, [u], b);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Per-tick building behaviour (runs after units)

/** Construction speed for n builders: the first works at 100%, each extra adds 60%. */
export function buildRate(n: number): number {
  return n <= 0 ? 0 : 1 + 0.6 * (n - 1);
}

/** Seconds left to finish a foundation at its current builder count (Infinity if nobody is working). */
export function buildTimeLeft(world: World, b: Building): number {
  const rate = buildRate(b.activeBuilders) * world.players[b.owner]!.mult.buildSpeed;
  return rate > 0 ? ((1 - b.progress) * b.def.buildTime) / rate : Infinity;
}

export function updateBuildings(world: World): void {
  for (const b of world.buildings) {
    const p = world.players[b.owner]!;
    if (!b.complete) {
      b.activeBuilders = b.builders;
      if (b.builders > 0) {
        const rate = (buildRate(b.builders) * p.mult.buildSpeed * DT) / b.def.buildTime;
        const before = b.progress;
        b.progress = Math.min(1, b.progress + rate);
        b.hp = Math.min(b.maxHp, b.hp + (b.progress - before) * b.maxHp * 0.9);
        if (b.progress >= 1) completeBuilding(world, b);
      }
      b.builders = 0;
      continue;
    }
    b.builders = 0;

    // Energy production (derricks, rigs, fusion plants).
    const prod = b.def.produces;
    if (prod) {
      let amount = prod.perSecond * p.mult.produce[prod.resource] * DT;
      const res = b.resource >= 0 ? world.resources[b.resource] : undefined;
      if (res) {
        amount = Math.min(amount, res.amount);
        res.amount -= amount;
      }
      p.res[prod.resource] += amount;
      p.gathered[prod.resource] += amount;
    }

    // Production queue.
    const item = b.queue[0];
    if (!item) continue;
    if (item.progress < item.total) {
      item.progress = Math.min(item.total, item.progress + DT);
    }
    if (item.progress < item.total) continue;
    if (item.kind === 'unit') {
      const def = UNITS[item.unit];
      if (p.popUsed + def.pop > p.popCap) {
        if (!b.waitingForPop) {
          b.waitingForPop = true;
          world.emit({ kind: 'notify', player: b.owner, text: p.popCap >= POP_LIMIT ? 'Population limit reached' : 'Need more housing', x: b.x, y: b.y });
        }
        continue;
      }
      b.waitingForPop = false;
      b.queue.shift();
      spawnFromBuilding(world, b, item.unit);
    } else {
      b.queue.shift();
      completeResearch(world, p, item.tech);
    }
  }
}

function completeBuilding(world: World, b: Building): void {
  b.complete = true;
  b.progress = 1;
  b.hp = b.maxHp;
  world.emit({ kind: 'buildingComplete', player: b.owner, building: b.id });
  world.recomputePop(world.players[b.owner]!);
}

function completeResearch(world: World, p: PlayerState, tech: TechId): void {
  p.researched.add(tech);
  for (const e of TECHS[tech].effects as readonly TechEffect[]) {
    if (e.kind === 'gatherRate') p.mult.gather[e.resource] *= e.mult;
    else if (e.kind === 'produceRate') p.mult.produce[e.resource] *= e.mult;
    else if (e.kind === 'buildSpeed') p.mult.buildSpeed *= e.mult;
  }
  world.emit({ kind: 'researchComplete', player: p.id, tech });
}

/** Spawn a freshly trained unit beside its building, then send it to the rally point. */
function spawnFromBuilding(world: World, b: Building, type: UnitTypeId): void {
  const def: UnitDef = UNITS[type];
  if (def.fuel && b.def.dock) {
    const plane = world.spawnUnit(type, b.owner, b.x, b.y, 0);
    if (!dockNew(world, plane, b)) {
      plane.goalX = b.x;
      plane.goalY = b.y;
    }
    world.emit({ kind: 'unitTrained', player: b.owner, unit: plane.id });
    if (b.rally) {
      takeOff(plane);
      orderMove(world, [plane], b.rally.x, b.rally.y);
    }
    return;
  }
  const layer = layerFor(def);
  const toward = b.rally ?? { x: world.map.width / 2, y: world.map.height / 2 };
  let sx = b.x;
  let sy = b.y;
  if (layer !== NavLayer.Air) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let ring = 1; ring <= 4 && !best; ring++) {
      for (let y = b.ty - ring; y < b.ty + b.h + ring; y++) {
        for (let x = b.tx - ring; x < b.tx + b.w + ring; x++) {
          const onRing = x === b.tx - ring || x === b.tx + b.w + ring - 1 || y === b.ty - ring || y === b.ty + b.h + ring - 1;
          if (!onRing || !world.nav.passable(layer, x, y)) continue;
          const d = (x + 0.5 - toward.x) ** 2 + (y + 0.5 - toward.y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = [x + 0.5, y + 0.5];
          }
        }
      }
    }
    if (!best) {
      world.emit({ kind: 'notify', player: b.owner, text: `No room to deploy ${def.name}`, x: b.x, y: b.y });
      return;
    }
    [sx, sy] = best;
  }
  const u = world.spawnUnit(type, b.owner, sx, sy, fatan2(toward.y - sy, toward.x - sx));
  world.emit({ kind: 'unitTrained', player: b.owner, unit: u.id });
  if (b.rally) {
    const ore = u.def.gatherRate ? world.oreNear(b.rally.x, b.rally.y, 1.5) : -1;
    if (ore >= 0) orderGather(world, [u], ore);
    else orderMove(world, [u], b.rally.x, b.rally.y);
  }
}

/** Every oil derrick/rig claims the spot under it. */
export function claimOil(world: World, b: Building): void {
  if (b.def.placement !== 'landOil' && b.def.placement !== 'seaOil') return;
  const r = oilUnder(world, b.tx, b.ty, b.w, b.h);
  if (r >= 0) {
    b.resource = r;
    world.resources[r]!.claimedBy = b.id;
  }
}
