// Transports and air logistics:
//   - transport ships load land units at a shore and put them ashore elsewhere;
//   - aircraft with fuel park at airfields, refuel there, return when low, crash when empty;
//   - cargo planes carry infantry and paradrop them anywhere.

import { cargoSize, type UnitDef } from '../data/types.ts';
import { UNITS, type UnitTypeId } from '../data/units.ts';
import { distToRect } from './economy.ts';
import { fcos, fsin, HALF_PI } from './fmath.ts';
import { orderMove, setDestination, stopUnit } from './movement.ts';
import { NavLayer, type NavLayerId } from './nav.ts';
import { DT } from './time.ts';
import type { Building, Unit } from './types.ts';
import type { World } from './world.ts';

const SHORE_REACH = 2.7; // how close a unit must be to a transport ship to board it
const LAND_REACH = 1.9; // aircraft land when this close to their parking spot
const DROP_REACH = 2.2; // cargo plane drops when this close to the target
const CHUTE_TIME = 3; // seconds under a parachute
const REFUEL_TIME = 10; // seconds to refuel from empty
const FUEL_MARGIN = 6; // seconds of fuel kept in reserve for the trip home

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}

// ---------------------------------------------------------------------------
// Airfields

/** Parking spots on an airfield, in footprint-local coordinates (x, y) and the facing angle. */
const SLOTS: Array<[number, number]> = [[-2.1, 0.15], [-0.7, 0.15], [0.7, 0.15], [2.1, 0.15]];

export function slotPosition(b: Building, slot: number): { x: number; y: number; angle: number } {
  const [lx, ly] = SLOTS[slot % SLOTS.length]!;
  return { x: b.x + lx, y: b.y + ly, angle: HALF_PI };
}

export function needsAirfield(u: Unit): boolean {
  return (u.def.fuel ?? 0) > 0;
}

/** Aircraft based at an airfield (parked or flying). */
export function basedAt(world: World, b: Building): Unit[] {
  return world.units.filter((u) => u.home === b.id && needsAirfield(u));
}

function freeSlot(world: World, b: Building): number {
  const n = b.def.dock ?? 0;
  const used = new Set(basedAt(world, b).map((u) => u.slot));
  for (let i = 0; i < n; i++) if (!used.has(i)) return i;
  return -1;
}

/** Aircraft (based + queued) that count against an airfield's parking. */
export function airfieldLoad(world: World, b: Building): number {
  let n = basedAt(world, b).length;
  for (const q of b.queue) if (q.kind === 'unit' && (UNITS[q.unit] as UnitDef).fuel) n++;
  return n;
}

/** Home airfield for an aircraft, re-homing it if its old one is gone or someone else's. */
function homeFor(world: World, u: Unit): Building | null {
  const h = world.getBuilding(u.home);
  if (h && h.owner === u.owner && h.complete && h.def.dock) return h;
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of world.buildings) {
    if (b.owner !== u.owner || !b.complete || !b.def.dock) continue;
    if (freeSlot(world, b) < 0) continue;
    const d = dist(u.x, u.y, b.x, b.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (best) {
    u.home = best.id;
    u.slot = freeSlot(world, best);
  } else {
    u.home = 0;
    u.slot = -1;
  }
  return best;
}

export function park(u: Unit, b: Building): void {
  const s = slotPosition(b, u.slot);
  u.x = s.x;
  u.y = s.y;
  u.angle = s.angle;
  u.parked = true;
  u.speed = 0;
  u.state = 'idle';
  u.path = [];
  u.goalX = u.x;
  u.goalY = u.y;
  if (u.task?.kind === 'return' || u.task?.kind === 'paradrop') u.task = null;
}

export function takeOff(u: Unit): void {
  if (!u.parked) return;
  u.parked = false;
  u.speed = u.def.speed * 0.5;
}

/** A freshly built aircraft that needs an airfield parks at the one that built it. */
export function dockNew(world: World, u: Unit, b: Building): boolean {
  if (!needsAirfield(u) || !b.def.dock) return false;
  const slot = freeSlot(world, b);
  if (slot < 0) return false;
  u.home = b.id;
  u.slot = slot;
  park(u, b);
  u.px = u.x;
  u.py = u.y;
  u.pa = u.angle;
  return true;
}

// ---------------------------------------------------------------------------
// Cargo

export function cargoUsed(world: World, carrier: Unit): number {
  let n = 0;
  for (const id of carrier.cargo) {
    const c = world.getUnit(id);
    if (c) n += cargoSize(c.def);
  }
  return n;
}

/** Why `u` cannot ride in `carrier`, or null if it can (space permitting). */
export function cannotCarry(carrier: Unit, u: Unit): string | null {
  const c = carrier.def.cargo;
  if (!c) return 'Not a transport';
  const size = cargoSize(u.def);
  if (size === 0) return `${u.def.name} is too big`;
  if (c.carries === 'infantry' && u.def.armor !== 'inf') return 'Infantry only';
  return null;
}

function load(world: World, carrier: Unit, u: Unit): boolean {
  if (cannotCarry(carrier, u)) return false;
  if (cargoUsed(world, carrier) + cargoSize(u.def) > carrier.def.cargo!.slots) {
    world.emit({ kind: 'notify', player: u.owner, text: `${carrier.def.name} is full`, x: carrier.x, y: carrier.y });
    return false;
  }
  stopUnit(u);
  u.task = null;
  u.working = false;
  u.carrier = carrier.id;
  carrier.cargo.push(u.id);
  return true;
}

/** Free tiles of a layer around (x, y), nearest first. */
export function spotsAround(world: World, layer: NavLayerId, x: number, y: number, n: number, maxR: number, player = -1): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let r = 0; r <= maxR && out.length < n; r++) {
    const ring: Array<[number, number, number]> = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!world.nav.passable(layer, cx + dx, cy + dy, player)) continue;
        ring.push([cx + dx + 0.5, cy + dy + 0.5, dx * dx + dy * dy]);
      }
    }
    ring.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);
    for (const [px, py] of ring) if (out.length < n) out.push([px, py]);
  }
  return out;
}

/** Put a transport's passengers on the ground around (x, y). Returns those that found room. */
function disembark(world: World, carrier: Unit, x: number, y: number, maxR: number): Unit[] {
  const out: Unit[] = [];
  const taken = new Set<string>();
  const remaining: number[] = [];
  for (const id of carrier.cargo) {
    const u = world.getUnit(id);
    if (!u) continue;
    const spot = spotsAround(world, u.layer, x, y, 40, maxR, u.owner).find(([px, py]) => !taken.has(`${px},${py}`));
    if (!spot) {
      remaining.push(id);
      continue;
    }
    taken.add(`${spot[0]},${spot[1]}`);
    u.carrier = 0;
    u.x = u.px = spot[0];
    u.y = u.py = spot[1];
    u.angle = u.pa = carrier.angle;
    stopUnit(u);
    out.push(u);
  }
  carrier.cargo = remaining;
  return out;
}

// ---------------------------------------------------------------------------
// Orders

export function orderBoard(world: World, units: Unit[], carrier: Unit): void {
  if (!carrier.def.cargo) return;
  const riders = units.filter((u) => u !== carrier && !u.carrier && !cannotCarry(carrier, u));
  if (riders.length === 0) {
    const why = units[0] ? cannotCarry(carrier, units[0]) : null;
    if (why && units[0]) world.emit({ kind: 'notify', player: units[0].owner, text: why });
    return;
  }
  for (const u of riders) {
    u.task = { kind: 'board', carrier: carrier.id };
    u.working = false;
    stopUnit(u);
  }
  // A ship comes to the shore nearest the passengers (unless it is busy unloading).
  if (carrier.def.domain === 'sea' && !carrier.task) {
    let cx = 0;
    let cy = 0;
    for (const u of riders) {
      cx += u.x;
      cy += u.y;
    }
    cx /= riders.length;
    cy /= riders.length;
    const w = world.pathfinder.nearestPassable(NavLayer.Water, Math.floor(cx), Math.floor(cy), 30);
    if (w && dist(w[0] + 0.5, w[1] + 0.5, carrier.x, carrier.y) > 2) setDestination(world, carrier, w[0] + 0.5, w[1] + 0.5);
  }
}

export function orderUnload(world: World, carriers: Unit[], x: number, y: number): void {
  for (const c of carriers) {
    if (!c.def.cargo || c.cargo.length === 0) continue;
    if (c.def.domain === 'air') {
      // A parked cargo plane unloads at its airfield.
      const home = world.getBuilding(c.home);
      if (c.parked && home) {
        const out = disembark(world, c, home.x, home.y, 6);
        if (out.length) orderMove(world, out, home.x + (x > home.x ? 4 : -4), home.y + 4);
      }
      continue;
    }
    c.task = { kind: 'unload', x, y };
    const w = world.pathfinder.nearestPassable(NavLayer.Water, Math.floor(x), Math.floor(y), 40);
    if (w) setDestination(world, c, w[0] + 0.5, w[1] + 0.5);
  }
}

export function orderParadrop(world: World, planes: Unit[], x: number, y: number): void {
  for (const p of planes) {
    if (p.def.domain !== 'air' || !p.def.cargo) continue;
    if (p.cargo.length === 0) {
      world.emit({ kind: 'notify', player: p.owner, text: 'Load infantry first (they board at the Airfield)' });
      continue;
    }
    takeOff(p);
    p.task = { kind: 'paradrop', x, y };
    p.goalX = x;
    p.goalY = y;
    p.path = [x, y];
    p.pathIdx = 0;
    p.state = 'moving';
  }
}

export function orderReturn(world: World, aircraft: Unit[]): void {
  for (const u of aircraft) {
    if (!needsAirfield(u) || u.parked) continue;
    u.task = { kind: 'return' };
    const h = homeFor(world, u);
    if (h) {
      const s = slotPosition(h, u.slot);
      u.goalX = s.x;
      u.goalY = s.y;
    } else {
      world.emit({ kind: 'notify', player: u.owner, text: 'No airfield with free parking', x: u.x, y: u.y });
    }
  }
}

// ---------------------------------------------------------------------------
// Per-tick behaviour

/** Tasks for boarding units and transports (runs before movement). */
export function updateTransport(world: World, u: Unit): void {
  const task = u.task;
  if (!task) return;
  if (task.kind === 'board') {
    const c = world.getUnit(task.carrier);
    if (!c || c.owner !== u.owner || c.carrier) {
      u.task = null;
      return;
    }
    if (c.def.domain === 'sea') {
      if (dist(u.x, u.y, c.x, c.y) <= c.def.radius + u.def.radius + SHORE_REACH) {
        load(world, c, u);
        return;
      }
      if (u.state === 'idle') {
        const near = world.pathfinder.nearestPassable(u.layer, Math.floor(c.x), Math.floor(c.y), 8);
        if (near && dist(near[0] + 0.5, near[1] + 0.5, u.goalX, u.goalY) > 0.8) setDestination(world, u, near[0] + 0.5, near[1] + 0.5);
      }
      return;
    }
    // Cargo plane: board at its airfield while it is parked.
    const field = world.getBuilding(c.home);
    if (!field) {
      u.task = null;
      return;
    }
    if (distToRect(u.x, u.y, field) <= u.def.radius + 1.3) {
      if (c.parked) load(world, c, u);
      else if (u.state !== 'idle') stopUnit(u); // wait for it to land
      return;
    }
    if (u.state === 'idle') {
      const near = world.pathfinder.nearestPassable(u.layer, Math.floor(field.x), Math.floor(field.y + field.h / 2 + 1), 6);
      if (near && dist(near[0] + 0.5, near[1] + 0.5, u.goalX, u.goalY) > 0.8) setDestination(world, u, near[0] + 0.5, near[1] + 0.5);
    }
    return;
  }
  if (task.kind === 'unload') {
    if (u.cargo.length === 0) {
      u.task = null;
      return;
    }
    if (u.state !== 'idle') return;
    // Arrived (or as close as the sea allows): everyone ashore.
    const out = disembark(world, u, u.x, u.y, 4);
    if (out.length === 0) {
      world.emit({ kind: 'notify', player: u.owner, text: "Can't reach the shore here", x: u.x, y: u.y });
      u.task = null;
      return;
    }
    const target = world.nav.passableAt(NavLayer.Foot, task.x, task.y);
    if (target) orderMove(world, out, task.x, task.y);
    u.task = null;
    return;
  }
}

/** Fuel, refuelling, returning home, landing, crashing, paradrops. */
export function updateAir(world: World, u: Unit): void {
  if (u.def.domain !== 'air') return;
  const fuelMax = u.def.fuel ?? 0;

  if (u.task?.kind === 'paradrop' && !u.parked) {
    const t = u.task;
    u.goalX = t.x;
    u.goalY = t.y;
    if (dist(u.x, u.y, t.x, t.y) <= DROP_REACH) {
      dropAll(world, u);
      u.task = null;
      if (fuelMax > 0) orderReturn(world, [u]);
    }
  }

  if (fuelMax <= 0) return;
  if (u.parked) {
    u.fuel = Math.min(fuelMax, u.fuel + (fuelMax / REFUEL_TIME) * DT);
    return;
  }
  u.fuel -= DT;

  const home = homeFor(world, u);
  if (u.task?.kind === 'return') {
    if (!home) {
      u.task = null;
    } else {
      const s = slotPosition(home, u.slot);
      u.goalX = s.x;
      u.goalY = s.y;
      if (dist(u.x, u.y, s.x, s.y) <= LAND_REACH) park(u, home);
    }
  } else if (home && u.task?.kind !== 'paradrop') {
    const s = slotPosition(home, u.slot);
    const need = dist(u.x, u.y, s.x, s.y) / u.def.speed + FUEL_MARGIN;
    if (u.fuel <= need) {
      world.emit({ kind: 'notify', player: u.owner, text: `${u.def.name} returning to refuel`, x: u.x, y: u.y });
      orderReturn(world, [u]);
    }
  }
  if (u.fuel <= 0) {
    world.removeUnit(u, 'out of fuel');
  }
}

function dropAll(world: World, plane: Unit): void {
  let i = 0;
  const hx = fcos(plane.angle);
  const hy = fsin(plane.angle);
  for (const id of plane.cargo) {
    const r = world.getUnit(id);
    if (!r) continue;
    // Spread the stick of paratroopers along the flight path, a little to either side.
    const back = i * 0.9;
    const side = (i % 2 === 0 ? 1 : -1) * 0.6;
    r.carrier = 0;
    r.x = r.px = plane.x - hx * back - hy * side;
    r.y = r.py = plane.y - hy * back + hx * side;
    r.chute = CHUTE_TIME;
    stopUnit(r);
    i++;
  }
  plane.cargo = [];
}

/** Paratroopers drift down; on landing they step onto the nearest ground they can stand on. */
export function updateChute(world: World, u: Unit): void {
  if (u.chute <= 0) return;
  u.chute -= DT;
  if (u.chute > 0) return;
  u.chute = 0;
  if (!world.nav.passableAt(u.layer, u.x, u.y)) {
    const near = world.pathfinder.nearestPassable(u.layer, Math.floor(u.x), Math.floor(u.y), 12);
    if (near) {
      u.x = u.px = near[0] + 0.5;
      u.y = u.py = near[1] + 0.5;
    }
  }
  stopUnit(u);
}

/** Passengers ride along with their transport. */
export function syncCargo(world: World): void {
  for (const u of world.units) {
    if (!u.carrier) continue;
    const c = world.getUnit(u.carrier);
    if (!c) continue;
    u.x = c.x;
    u.y = c.y;
  }
}

/** Is this unit out of play for movement (riding, parachuting or parked)? */
export function immobile(u: Unit): boolean {
  return u.carrier !== 0 || u.chute > 0 || u.parked;
}

export function isAircraftType(type: UnitTypeId): boolean {
  return ((UNITS[type] as UnitDef).fuel ?? 0) > 0;
}

