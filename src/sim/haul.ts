// Tankers: Sea Engineers carry oil from an Offshore Rig's tank to a Shipyard.
// A rig's pipeline brings a trickle ashore on its own; hauling empties the tank
// faster, so a serviced rig yields about 2.5x as much (and its route can be raided).

import { approachRect, distToRect } from './economy.ts';
import { setDestination, stopUnit } from './movement.ts';
import { DT } from './time.ts';
import type { Building, Unit } from './types.ts';
import type { World } from './world.ts';

type HaulTask = Extract<NonNullable<Unit['task']>, { kind: 'haul' }>;

const REACH = 1.6;

/** A water point just off a building's edge, on the side facing the unit. */
function berth(world: World, u: Unit, b: Building): [number, number] {
  const [ax, ay] = approachRect(b, u.x, u.y);
  if (world.nav.passableAt(u.layer, ax, ay)) return [ax, ay];
  const near = world.pathfinder.nearestPassable(u.layer, Math.floor(ax), Math.floor(ay), 4);
  return near ? [near[0] + 0.5, near[1] + 0.5] : [ax, ay];
}

function nearestDock(world: World, u: Unit): Building | undefined {
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of world.buildings) {
    if (b.owner !== u.owner || !b.complete || !b.def.dropOff?.includes('energy')) continue;
    const d = distToRect(u.x, u.y, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function orderHaul(world: World, units: Unit[], rig: Building): void {
  if (!rig.def.tank || !rig.complete) return;
  for (const u of units) {
    if (!u.def.haul) continue;
    u.task = { kind: 'haul', rig: rig.id, phase: u.carry >= u.def.haul.capacity ? 'toDropOff' : 'toRig', dropId: 0 };
    u.working = false;
    if (u.task.phase === 'toRig') {
      const [x, y] = berth(world, u, rig);
      setDestination(world, u, x, y);
    } else {
      stopUnit(u);
    }
  }
}

export function updateHaul(world: World, u: Unit, task: HaulTask): void {
  const haul = u.def.haul;
  const rig = world.getBuilding(task.rig);
  if (!haul || !rig || rig.owner !== u.owner) {
    u.task = null;
    return;
  }
  if (task.phase === 'toDropOff') {
    let dock = world.getBuilding(task.dropId);
    if (!dock || !dock.complete || dock.owner !== u.owner) {
      dock = nearestDock(world, u);
      if (!dock) {
        if (u.state !== 'idle') stopUnit(u);
        return; // wait with the cargo until a Shipyard exists
      }
      task.dropId = dock.id;
      const [x, y] = berth(world, u, dock);
      setDestination(world, u, x, y);
    }
    if (distToRect(u.x, u.y, dock) <= u.def.radius + REACH) {
      const p = world.players[u.owner]!;
      p.res.energy += u.carry;
      p.gathered.energy += u.carry;
      u.carry = 0;
      task.phase = 'toRig';
      task.dropId = 0;
      const [x, y] = berth(world, u, rig);
      setDestination(world, u, x, y);
    } else if (u.state === 'idle') {
      const [x, y] = berth(world, u, dock);
      setDestination(world, u, x, y);
    }
    return;
  }
  if (distToRect(u.x, u.y, rig) <= u.def.radius + REACH) {
    if (task.phase !== 'loading') {
      task.phase = 'loading';
      stopUnit(u);
    }
    u.working = true;
    const take = Math.min(haul.rate * DT, rig.stored, haul.capacity - u.carry);
    u.carry += take;
    rig.stored -= take;
    // Leave when full, or when the tank is dry and we have something to deliver.
    if (u.carry >= haul.capacity - 1e-9 || (rig.stored <= 1e-9 && u.carry >= haul.capacity * 0.5)) {
      task.phase = 'toDropOff';
      const dock = nearestDock(world, u);
      if (dock) {
        task.dropId = dock.id;
        const [x, y] = berth(world, u, dock);
        setDestination(world, u, x, y);
      }
    }
  } else if (u.state === 'idle') {
    task.phase = 'toRig';
    const [x, y] = berth(world, u, rig);
    setDestination(world, u, x, y);
  }
}
