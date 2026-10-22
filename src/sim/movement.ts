// Unit movement: destinations and paths, group formations, steering, jets, separation.

import { fatan2, fcos, fsin, PI, TAU, wrapAngle } from './fmath.ts';
import { FOREST_SPEED, isGroundLayer, NavLayer, type NavLayerId } from './nav.ts';
import { unitGroup } from '../data/types.ts';
import type { Unit } from './types.ts';
import { DT } from './time.ts';
import type { World } from './world.ts';

export function setDestination(world: World, u: Unit, x: number, y: number): void {
  u.goalX = x;
  u.goalY = y;
  u.stuckTicks = 0;
  if (u.layer === NavLayer.Air) {
    u.path = [x, y];
  } else {
    u.path = world.pathfinder.findPath(u.layer, u.x, u.y, x, y, u.owner) ?? [];
    if (u.path.length >= 2) {
      u.goalX = u.path[u.path.length - 2]!;
      u.goalY = u.path[u.path.length - 1]!;
    }
  }
  u.pathIdx = 0;
  u.state = u.path.length > 0 ? 'moving' : 'idle';
}

export function stopUnit(u: Unit): void {
  u.path = [];
  u.pathIdx = 0;
  u.goalX = u.x;
  u.goalY = u.y;
  u.state = 'idle';
  u.speed = 0;
}

/** Group move: give each unit its own slot in a loose formation around the target. */
export function orderMove(world: World, units: Unit[], x: number, y: number): void {
  // Ground units (vehicles and infantry) share one formation; ships and aircraft get their own.
  const groups = new Map<string, Unit[]>();
  for (const u of units) {
    const key = isGroundLayer(u.layer) ? 'ground' : String(u.layer);
    const list = groups.get(key) ?? [];
    list.push(u);
    groups.set(key, list);
  }
  for (const key of ['ground', String(NavLayer.Water), String(NavLayer.Air)]) {
    const group = groups.get(key);
    if (!group) continue;
    const air = key === String(NavLayer.Air);
    // Slots are laid out on the most permissive layer present; each unit takes the
    // first free slot it can actually stand on.
    const slotLayer: NavLayerId = key === 'ground' ? (group.some((u) => u.layer === NavLayer.Foot) ? NavLayer.Foot : NavLayer.Land) : group[0]!.layer;
    let spacing = 0;
    for (const u of group) spacing = Math.max(spacing, u.def.radius * 2 + 0.25);
    if (air) spacing = Math.max(spacing, 1.6);
    const slots = formationSlots(world, slotLayer, x, y, group.length * 2, spacing);
    const used = new Array<boolean>(slots.length).fill(false);
    // Closest units take the closest slots: fewer crossing paths.
    const ordered = group
      .map((u) => ({ u, d: (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y) }))
      .sort((a, b) => a.d - b.d || a.u.id - b.u.id);
    for (const { u } of ordered) {
      let pick = -1;
      for (let i = 0; i < slots.length; i++) {
        if (used[i]) continue;
        const [sx, sy] = slots[i]!;
        if (air || world.nav.passableAt(u.layer, sx, sy)) {
          pick = i;
          break;
        }
      }
      if (pick < 0) pick = used.indexOf(false);
      if (pick < 0) pick = 0;
      used[pick] = true;
      const [sx, sy] = slots[pick]!;
      setDestination(world, u, sx, sy);
    }
  }
}

/** Spiral of slot positions around (x, y) on passable tiles of a layer. */
function formationSlots(world: World, layer: NavLayerId, x: number, y: number, n: number, spacing: number): Array<[number, number]> {
  const slots: Array<[number, number]> = [];
  if (layer !== NavLayer.Air && !world.nav.passableAt(layer, x, y)) {
    const near = world.pathfinder.nearestPassable(layer, Math.floor(x), Math.floor(y), 24);
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
      if (layer === NavLayer.Air || world.nav.passableAt(layer, sx, sy)) slots.push([sx, sy]);
    }
  }
  while (slots.length < n) slots.push([x, y]);
  return slots;
}

export function moveUnit(world: World, u: Unit): void {
  const def = u.def;
  const spd = def.speed * (world.players[u.owner]?.mult.speed[unitGroup(def)] ?? 1);
  if (def.move === 'jet') {
    moveJet(world, u);
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
  const arrive = isLast ? 0.12 : Math.max(0.35, spd * DT * 1.5);
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
    factor = absDiff > PI / 3 ? 0 : 1 - (absDiff / (PI / 3)) * 0.6;
  } else if (def.move === 'heli') {
    factor = absDiff > PI / 2 ? 0.2 : 1;
  }
  if (isLast) factor *= Math.min(1, 0.35 + dist / 1.5);
  if (u.layer === NavLayer.Foot && world.nav.cost(NavLayer.Foot, Math.floor(u.x), Math.floor(u.y)) > 1) factor *= FOREST_SPEED;
  const accel = def.move === 'ship' ? 0.6 : 3;
  const target = spd * factor;
  u.speed += Math.max(-accel * 2 * DT * spd, Math.min(accel * DT * spd, target - u.speed));

  const step = Math.min(u.speed * DT, dist);
  const nx = u.x + fcos(u.angle) * step;
  const ny = u.y + fsin(u.angle) * step;
  if (u.layer === NavLayer.Air || world.nav.passableAt(u.layer, nx, ny, u.owner)) {
    u.x = nx;
    u.y = ny;
  } else {
    u.speed = 0;
  }

  // Stuck detection: crowded at the destination, or blocked on the way.
  const moved = Math.abs(u.x - u.px) + Math.abs(u.y - u.py);
  if (u.speed > 0.2 * spd && moved < 0.25 * spd * DT) u.stuckTicks++;
  else if (absDiff < 0.5 && moved < 0.05 * spd * DT) u.stuckTicks++;
  else u.stuckTicks = Math.max(0, u.stuckTicks - 1);
  if (u.stuckTicks > 20) {
    const gdx = u.goalX - u.x;
    const gdy = u.goalY - u.y;
    if (gdx * gdx + gdy * gdy < 6.25) {
      stopUnit(u);
    } else if (u.stuckTicks > 45) {
      setDestination(world, u, u.goalX, u.goalY);
    }
  }
}

/** Jets always fly forward; when there is nothing to do they circle their goal. */
function moveJet(world: World, u: Unit): void {
  const def = u.def;
  const spd = def.speed * (world.players[u.owner]?.mult.speed[unitGroup(def)] ?? 1);
  const dx = u.goalX - u.x;
  const dy = u.goalY - u.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const orbitR = 4;
  let want = fatan2(dy, dx);
  // Landing and paradrop runs fly straight at the target instead of circling it.
  const direct = u.task?.kind === 'return' || u.task?.kind === 'paradrop';
  if (dist < orbitR * 1.4 && !direct) {
    const pull = (dist - orbitR) / orbitR;
    want = want + PI / 2 - Math.max(-0.8, Math.min(0.8, pull));
    u.state = 'idle';
  } else {
    u.state = 'moving';
  }
  const diff = wrapAngle(want - u.angle);
  const maxTurn = def.turnRate * DT;
  u.angle = wrapAngle(u.angle + Math.max(-maxTurn, Math.min(maxTurn, diff)));
  const cruise = u.state === 'idle' ? spd * 0.6 : spd;
  u.speed += Math.max(-spd * DT, Math.min(spd * DT, cruise - u.speed));
  u.x += fcos(u.angle) * u.speed * DT;
  u.y += fsin(u.angle) * u.speed * DT;
  u.x = Math.max(1, Math.min(world.map.width - 1, u.x));
  u.y = Math.max(1, Math.min(world.map.height - 1, u.y));
}

/** Units on the same surface collide: vehicles and infantry share the ground. */
function surface(u: Unit): number {
  return isGroundLayer(u.layer) ? NavLayer.Land : u.layer;
}

/** Push overlapping units apart (per surface), using a coarse spatial hash. */
export function separate(world: World): void {
  const cell = 2;
  const cols = Math.ceil(world.map.width / cell);
  const buckets = new Map<number, Unit[]>();
  const units = world.units;
  for (const u of units) {
    if (u.def.move === 'jet' || u.carrier || u.chute > 0) continue;
    const key = surface(u) * 100000 + Math.floor(u.y / cell) * cols + Math.floor(u.x / cell);
    const b = buckets.get(key);
    if (b) b.push(u);
    else buckets.set(key, [u]);
  }
  for (const u of units) {
    if (u.def.move === 'jet' || u.carrier || u.chute > 0) continue;
    const cx = Math.floor(u.x / cell);
    const cy = Math.floor(u.y / cell);
    let pushX = 0;
    let pushY = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const b = buckets.get(surface(u) * 100000 + (cy + oy) * cols + (cx + ox));
        if (!b) continue;
        for (const o of b) {
          if (o === u || o.def.move === 'jet') continue;
          // Workers on a job (mining, hauling, building) pass through each other, like
          // harvesters in most RTS games: otherwise busy ore fields jam.
          if (u.task && o.task) continue;
          const dx = u.x - o.x;
          const dy = u.y - o.y;
          const minD = u.def.radius + o.def.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD) continue;
          const d = Math.sqrt(d2);
          const overlap = minD - d;
          const nx = d > 1e-6 ? dx / d : fcos(u.id * 2.39996);
          const ny = d > 1e-6 ? dy / d : fsin(u.id * 2.39996);
          // Idle units yield to moving ones; working units (mining, building) hold their spot.
          const uw = u.working ? 0.2 : u.state === 'idle' ? 0.8 : 0.5;
          const ow = o.working ? 0.2 : o.state === 'idle' ? 0.8 : 0.5;
          const share = uw / (uw + ow);
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
    if (world.nav.passableAt(u.layer, u.x + pushX, u.y + pushY, u.owner)) {
      u.x += pushX;
      u.y += pushY;
    } else if (world.nav.passableAt(u.layer, u.x + pushX, u.y, u.owner)) {
      u.x += pushX;
    } else if (world.nav.passableAt(u.layer, u.x, u.y + pushY, u.owner)) {
      u.y += pushY;
    }
  }
}

/** Move a unit standing on a now-blocked tile to the nearest free one (e.g. a building was placed). */
export function evict(world: World, u: Unit): void {
  if (u.layer === NavLayer.Air || world.nav.passableAt(u.layer, u.x, u.y, u.owner)) return;
  const near = world.pathfinder.nearestPassable(u.layer, Math.floor(u.x), Math.floor(u.y), 8, u.owner);
  if (!near) return;
  u.x = near[0] + 0.5;
  u.y = near[1] + 0.5;
  u.px = u.x;
  u.py = u.y;
}
