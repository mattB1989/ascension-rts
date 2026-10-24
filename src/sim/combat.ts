// Combat: picking targets, firing, projectiles, damage, death, victory.
//
// Units with weapons fire at enemies they can see:
//   - idle units engage anything that comes close and chase it a little (leash);
//   - units on a plain move order keep moving but shoot what is in range;
//   - "attack" chases one target; "attack-move" fights its way to a destination.
// Defensive buildings fire on their own; garrisoned infantry fire from inside.

import { buildingGroup, unitGroup } from '../data/types.ts';
import { DAMAGE, GARRISON_RANGE_BONUS, maxRange, weaponsOf, type TargetKind, type WeaponDef } from '../data/weapons.ts';
import { distToRect } from './economy.ts';
import { fatan2 } from './fmath.ts';
import { orderMove, setDestination, stopUnit } from './movement.ts';
import { NavLayer } from './nav.ts';
import { DT } from './time.ts';
import { immobile, spotsAround } from './transport.ts';
import type { Building, Entity, Projectile, Unit } from './types.ts';
import type { World } from './world.ts';
import { atWar } from './city/military.ts';

const LEASH = 10; // tiles an idle unit will chase before giving up
const ACQUIRE_EVERY = 4; // ticks between target scans (staggered by id)
const MISSILE_LIFE = 6; // seconds

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}

// ---------------------------------------------------------------------------
// Classification

export function targetKind(e: Entity): TargetKind | null {
  if (e.kind === 'building') return 'building';
  if (e.carrier || e.chute > 0) return null; // inside a transport / building, or still in the air under a chute
  if (e.parked) return 'land'; // planes on the ground can be shot like anything else on the ground
  if (e.def.domain === 'air') return 'air';
  if (e.def.domain === 'sea') return e.def.armor === 'sub' ? 'sub' : 'sea';
  return 'land';
}

export function armorOf(e: Entity): keyof (typeof DAMAGE)['bullet'] {
  return e.kind === 'building' ? 'str' : e.def.armor;
}

export function canHit(w: WeaponDef, e: Entity): boolean {
  const k = targetKind(e);
  return k !== null && w.targets.includes(k) && DAMAGE[w.type][armorOf(e)] > 0;
}

/** Height above the ground a shot leaves from / lands at (render hint). */
export function heightOf(e: Entity): number {
  if (e.kind === 'building') return Math.min(2, 0.6 + Math.max(e.w, e.h) * 0.2);
  if (e.def.domain === 'air' && !e.parked) return e.def.flyHeight ?? 4;
  return e.def.armor === 'inf' ? 0.45 : 0.6;
}

function visibleTo(world: World, player: number, e: Entity): boolean {
  const p = world.players[player]!;
  const w = world.map.width;
  if (e.kind === 'unit') return p.visible[Math.floor(e.y) * w + Math.floor(e.x)] === 1;
  // A building is visible if any of its tiles is.
  for (let y = e.ty; y < e.ty + e.h; y++) for (let x = e.tx; x < e.tx + e.w; x++) if (p.visible[y * w + x] === 1) return true;
  return false;
}

/** Distance from a point to an entity's edge. */
function reach(x: number, y: number, e: Entity): number {
  return e.kind === 'building' ? distToRect(x, y, e) : Math.max(0, dist(x, y, e.x, e.y) - e.def.radius * 0.6);
}

/** Distance from a shooting building's edge to a target. */
function reachFrom(b: Building, e: Entity): number {
  if (e.kind === 'unit') return Math.max(0, distToRect(e.x, e.y, b) - e.def.radius * 0.6);
  const dx = Math.max(0, Math.max(b.tx, e.tx) - Math.min(b.tx + b.w, e.tx + e.w));
  const dy = Math.max(0, Math.max(b.ty, e.ty) - Math.min(b.ty + b.h, e.ty + e.h));
  return Math.sqrt(dx * dx + dy * dy);
}

function isEnemy(world: World, a: number, b: number): boolean {
  return a !== b && !world.players[b]?.defeated && atWar(world, a, b);
}

// ---------------------------------------------------------------------------
// Target acquisition

type Shooter = { owner: number; x: number; y: number; from: Building | null };

/** Best visible enemy within `radius` that one of the weapons can hit. */
function acquire(world: World, s: Shooter, ws: readonly WeaponDef[], radius: number): Entity | undefined {
  let best: Entity | undefined;
  let bestScore = Infinity;
  const consider = (e: Entity) => {
    if (!isEnemy(world, s.owner, e.owner)) return;
    // Economy game: houses, farms and factories are not fair game unless ordered; defences are.
    if (world.city && e.kind === 'building' && !weaponsOf(e.type).length && !e.garrison.length) return;
    if (!ws.some((w) => canHit(w, e))) return;
    const d = s.from ? reachFrom(s.from, e) : reach(s.x, s.y, e);
    if (d > radius) return;
    if (!visibleTo(world, s.owner, e)) return;
    // Prefer things that shoot back, then other units, then buildings; nearer first.
    let score = d;
    if (e.kind === 'building') score += weaponsOf(e.type).length || e.garrison.length ? 3 : 8;
    else if (weaponsOf(e.type).length === 0) score += 3;
    if (score < bestScore || (score === bestScore && best && e.id < best.id)) {
      bestScore = score;
      best = e;
    }
  };
  for (const u of world.units) consider(u);
  for (const b of world.buildings) consider(b);
  return best;
}

/** Still worth shooting at? Ordered attacks on buildings only need them explored (they don't move). */
function validTarget(world: World, owner: number, ws: readonly WeaponDef[], e: Entity | undefined, ordered = false): e is Entity {
  if (!e || !isEnemy(world, owner, e.owner) || !ws.some((w) => canHit(w, e))) return false;
  if (visibleTo(world, owner, e)) return true;
  return ordered && e.kind === 'building' && world.players[owner]!.explored[Math.floor(e.y) * world.map.width + Math.floor(e.x)] === 1;
}

// ---------------------------------------------------------------------------
// Firing and damage

function damageMult(world: World, owner: number): number {
  return world.players[owner]?.mult.damage ?? 1;
}

function fire(world: World, owner: number, w: WeaponDef, t: Entity, sx: number, sy: number, sz: number, source: number): void {
  const damage = w.damage * damageMult(world, owner);
  const tz = heightOf(t);
  world.emit({ kind: 'shot', source, x: sx, y: sy, z: sz, tx: t.x, ty: t.y, tz, weapon: w });
  if (w.projectile === 'instant') {
    if (w.splash) splash(world, owner, w, damage, t.x, t.y);
    else hit(world, owner, w, damage, t);
    world.emit({ kind: 'impact', x: t.x, y: t.y, z: tz, weapon: w });
    return;
  }
  const d = dist(sx, sy, t.x, t.y);
  const p: Projectile = {
    id: world.nextProjectileId++,
    owner,
    weapon: w,
    damage,
    target: t.id,
    sx, sy, sz,
    x: sx,
    y: sy,
    tx: t.x,
    ty: t.y,
    t: 0,
    dur: Math.max(0.15, d / (w.speed ?? 20)),
  };
  world.projectiles.push(p);
}

/** Seconds an EMP hit stuns a vehicle or mech. */
export const EMP_STUN = 3;

/** Damage one entity. */
export function hit(world: World, owner: number, w: WeaponDef, damage: number, e: Entity): void {
  const amount = damage * DAMAGE[w.type][armorOf(e)];
  // EMP: vehicles and mechs are stunned for a few seconds.
  if (w.type === 'emp' && e.kind === 'unit' && ['lt', 'hv', 'mech'].includes(armorOf(e))) e.stun = Math.max(e.stun ?? 0, EMP_STUN);
  if (amount <= 0) return;
  e.hp -= amount;
  alert(world, e);
  // Economy game: seats of government are taken, not razed (they bottom out at a fifth of their health).
  if (world.city && e.kind === 'building' && (e.type === 'town_hall' || e.type === 'regional_office') && e.complete) e.hp = Math.max(e.hp, e.maxHp * 0.2);
  if (e.hp <= 0) {
    if (e.kind === 'unit') killUnit(world, e, owner);
    else destroyBuilding(world, e);
  }
}

/** Area damage around a point: full at the centre, half at the edge. */
function splash(world: World, owner: number, w: WeaponDef, damage: number, x: number, y: number): void {
  const r = w.splash ?? 0;
  const victims: Array<[Entity, number]> = [];
  for (const u of world.units) {
    if (!isEnemy(world, owner, u.owner) || !canHit(w, u)) continue;
    const d = dist(x, y, u.x, u.y);
    if (d <= r + u.def.radius * 0.5) victims.push([u, d]);
  }
  for (const b of world.buildings) {
    if (!isEnemy(world, owner, b.owner) || !canHit(w, b)) continue;
    const d = distToRect(x, y, b);
    if (d <= r) victims.push([b, d]);
  }
  for (const [e, d] of victims) hit(world, owner, w, damage * (1 - 0.5 * Math.min(1, d / Math.max(r, 0.01))), e);
}

function alert(world: World, e: Entity): void {
  const p = world.players[e.owner];
  if (!p || world.time - p.alertAt < 12) return;
  p.alertAt = world.time;
  world.emit({ kind: 'underAttack', player: e.owner, x: e.x, y: e.y });
}

function killUnit(world: World, u: Unit, _by: number): void {
  world.emit({ kind: 'died', entity: 'unit', type: u.type, owner: u.owner, x: u.x, y: u.y, size: u.def.radius, air: u.def.domain === 'air' && !u.parked });
  world.removeUnit(u, 'destroyed', true);
}

export function destroyBuilding(world: World, b: Building): void {
  world.emit({ kind: 'died', entity: 'building', type: b.type, owner: b.owner, x: b.x, y: b.y, size: Math.max(b.w, b.h), air: false });
  eject(world, b);
  // Planes parked here are lost with it.
  for (const u of [...world.units]) if (u.parked && u.home === b.id) world.removeUnit(u, 'airfield destroyed', true);
  world.removeBuilding(b);
}

// ---------------------------------------------------------------------------
// Garrisons

export function orderGarrison(_world: World, units: Unit[], b: Building): void {
  const cap = b.def.garrison ?? 0;
  if (cap === 0 || !b.complete) return;
  for (const u of units) {
    if (u.def.armor !== 'inf' || u.def.domain !== 'land' || u.carrier) continue;
    u.task = { kind: 'garrison', building: b.id };
    u.order = null;
    u.target = 0;
    u.working = false;
    stopUnit(u);
  }
}

export function updateGarrisonTask(world: World, u: Unit): void {
  const task = u.task;
  if (task?.kind !== 'garrison') return;
  const b = world.getBuilding(task.building);
  if (!b || b.owner !== u.owner || !b.complete) {
    u.task = null;
    return;
  }
  if (distToRect(u.x, u.y, b) <= u.def.radius + 1.0) {
    if (b.garrison.length >= (b.def.garrison ?? 0)) {
      world.emit({ kind: 'notify', player: u.owner, text: `${b.def.name} is full`, x: b.x, y: b.y });
      u.task = null;
      stopUnit(u);
      return;
    }
    stopUnit(u);
    u.task = null;
    u.carrier = b.id;
    u.x = u.px = b.x;
    u.y = u.py = b.y;
    b.garrison.push(u.id);
    return;
  }
  if (u.state === 'idle') {
    const near = world.pathfinder.nearestPassable(u.layer, Math.floor(b.x), Math.floor(b.ty + b.h), 4, u.owner);
    const [x, y] = near ? [near[0] + 0.5, near[1] + 0.5] : [b.x, b.ty + b.h + 0.5];
    setDestination(world, u, x, y);
  }
}

/** Everyone out, onto the ground around the building. */
export function eject(world: World, b: Building): Unit[] {
  const out: Unit[] = [];
  if (b.garrison.length === 0) return out;
  const spots = spotsAround(world, NavLayer.Foot, b.x, b.y, b.garrison.length + 8, Math.max(b.w, b.h) + 4, b.owner);
  let i = 0;
  for (const id of b.garrison) {
    const u = world.getUnit(id);
    if (!u) continue;
    const s = spots[i++] ?? [b.x, b.ty + b.h + 0.5];
    u.carrier = 0;
    u.x = u.px = s[0];
    u.y = u.py = s[1];
    stopUnit(u);
    out.push(u);
  }
  b.garrison = [];
  return out;
}

// ---------------------------------------------------------------------------
// Orders

export function orderAttack(world: World, units: Unit[], target: Entity): void {
  const chasers: Unit[] = [];
  for (const u of units) {
    if (u.carrier) continue;
    const ws = weaponsOf(u.type);
    if (!ws.some((w) => canHit(w, target))) continue;
    u.task = null;
    u.working = false;
    u.order = { kind: 'attack', target: target.id };
    u.target = target.id;
    u.chaseIn = 0;
    chasers.push(u);
  }
  // Those that cannot hurt it just go there.
  const rest = units.filter((u) => !chasers.includes(u) && !u.carrier);
  if (rest.length) orderMove(world, rest, target.x, target.y);
}

export function orderAttackMove(world: World, units: Unit[], x: number, y: number): void {
  for (const u of units) {
    u.task = null;
    u.working = false;
    u.target = 0;
    u.order = weaponsOf(u.type).length ? { kind: 'attackMove', x, y } : null;
  }
  orderMove(world, units, x, y);
}

// ---------------------------------------------------------------------------
// Per tick

export function updateUnitCombat(world: World, u: Unit): void {
  const ws = weaponsOf(u.type);
  if (ws.length === 0) return;
  u.firedAgo++;
  if (u.cooldowns.length !== ws.length) u.cooldowns = ws.map(() => 0);
  for (let i = 0; i < ws.length; i++) u.cooldowns[i] = Math.max(0, u.cooldowns[i]! - DT);
  if (immobile(u)) return;

  const order = u.order;
  let t: Entity | undefined;
  const scan = (world.tick + u.id) % ACQUIRE_EVERY === 0;
  const range = maxRange(ws);

  if (order?.kind === 'attack') {
    t = world.getEntity(order.target);
    if (!validTarget(world, u.owner, ws, t, true)) {
      u.order = null;
      u.target = 0;
      if (u.state === 'moving') stopUnit(u);
      return;
    }
  } else {
    t = u.target ? world.getEntity(u.target) : undefined;
    if (!validTarget(world, u.owner, ws, t)) t = undefined;
    const busy = u.task !== null && u.task.kind !== 'explore';
    // On a plain move order the unit keeps going and only shoots what is in range.
    const passing = order === null && u.chaseIn === 0 && u.state === 'moving' && u.def.move !== 'jet';
    if (!t && scan && !busy) {
      const radius = passing || u.task?.kind === 'explore' ? range : order?.kind === 'attackMove' ? range + 2 : Math.max(range + 1, Math.min(u.def.vision, range + 4));
      t = acquire(world, { owner: u.owner, x: u.x, y: u.y, from: null }, ws, radius);
      if (t && order === null && !passing && u.state === 'idle') {
        u.anchorX = u.x;
        u.anchorY = u.y;
      }
    }
    if (order?.kind === 'attackMove' && !t && u.state === 'idle' && u.def.move !== 'jet') u.order = null;
  }
  u.target = t?.id ?? 0;
  if (!t) {
    u.chaseIn = 0;
    if (u.order === null && u.state === 'idle') {
      u.anchorX = u.x;
      u.anchorY = u.y;
    }
    return;
  }

  const passing = u.order === null && u.chaseIn === 0 && u.state === 'moving' && u.def.move !== 'jet';
  const d = reach(u.x, u.y, t);
  u.aim = fatan2(t.y - u.y, t.x - u.x);
  let inRange = false;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    if (!canHit(w, t)) continue;
    if (d > w.range || d < (w.minRange ?? 0)) continue;
    inRange = true;
    if (u.cooldowns[i]! > 0) continue;
    u.cooldowns[i] = w.cooldown;
    u.firedAgo = 0;
    fire(world, u.owner, w, t, u.x, u.y, heightOf(u), u.id);
    if (!world.getEntity(t.id)) break;
  }

  if (inRange) {
    // Stop to shoot, unless just passing through on a move order.
    if (!passing && u.state === 'moving' && u.def.move !== 'jet') stopUnit(u);
    u.chaseIn = 0;
    return;
  }
  if (passing) return;
  // Leash: units that were standing around give up the chase after a while.
  if (u.order === null && dist(u.x, u.y, u.anchorX, u.anchorY) > LEASH) {
    u.target = 0;
    u.chaseIn = 0;
    setDestination(world, u, u.anchorX, u.anchorY);
    return;
  }
  // Too close for artillery: hold (the M4 AI will reposition).
  if (ws.every((w) => !canHit(w, t) || (w.minRange ?? 0) > d)) return;
  if (u.def.move === 'jet') {
    u.goalX = t.x;
    u.goalY = t.y;
    u.state = 'moving';
    return;
  }
  if (u.chaseIn > 1) {
    u.chaseIn--;
    return;
  }
  u.chaseIn = 12;
  setDestination(world, u, t.x, t.y);
}

export function updateBuildingCombat(world: World, b: Building): void {
  if (!b.complete) return;
  const own = weaponsOf(b.type);
  b.firedAgo++;
  const p = world.players[b.owner]!;
  const rangeMult = p.mult.range[buildingGroup(b.def)];
  const scan = (world.tick + b.id) % ACQUIRE_EVERY === 0;
  const sz = heightOf(b);

  if (own.length) {
    if (b.cooldowns.length !== own.length) b.cooldowns = own.map(() => 0);
    for (let i = 0; i < own.length; i++) b.cooldowns[i] = Math.max(0, b.cooldowns[i]! - DT);
    let t = b.target ? world.getEntity(b.target) : undefined;
    if (!validTarget(world, b.owner, own, t)) t = undefined;
    if (t && reachFrom(b, t) > maxRange(own) * rangeMult) t = undefined;
    if (!t && scan) t = acquire(world, { owner: b.owner, x: b.x, y: b.y, from: b }, own, maxRange(own) * rangeMult);
    b.target = t?.id ?? 0;
    if (t) {
      b.aim = fatan2(t.y - b.y, t.x - b.x);
      const d = reachFrom(b, t);
      for (let i = 0; i < own.length; i++) {
        const w = own[i]!;
        if (b.cooldowns[i]! > 0 || !canHit(w, t) || d > w.range * rangeMult || d < (w.minRange ?? 0)) continue;
        b.cooldowns[i] = w.cooldown;
        b.firedAgo = 0;
        fire(world, b.owner, w, t, b.x, b.y, sz, b.id);
        if (!world.getEntity(t.id)) break;
      }
    }
  }

  // Garrisoned infantry fire from the building, with extra range.
  const bonus = GARRISON_RANGE_BONUS + p.mult.garrisonRange;
  for (const id of b.garrison) {
    const u = world.getUnit(id);
    if (!u) continue;
    const ws = weaponsOf(u.type);
    if (!ws.length) continue;
    if (u.cooldowns.length !== ws.length) u.cooldowns = ws.map(() => 0);
    for (let i = 0; i < ws.length; i++) u.cooldowns[i] = Math.max(0, u.cooldowns[i]! - DT);
    let t = u.target ? world.getEntity(u.target) : undefined;
    if (!validTarget(world, u.owner, ws, t) || reachFrom(b, t!) > maxRange(ws) + bonus) t = undefined;
    if (!t && (world.tick + u.id) % ACQUIRE_EVERY === 0) t = acquire(world, { owner: u.owner, x: b.x, y: b.y, from: b }, ws, maxRange(ws) + bonus);
    u.target = t?.id ?? 0;
    if (!t) continue;
    b.aim = fatan2(t.y - b.y, t.x - b.x);
    const d = reachFrom(b, t);
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i]!;
      if (u.cooldowns[i]! > 0 || !canHit(w, t) || d > w.range + bonus) continue;
      u.cooldowns[i] = w.cooldown;
      b.firedAgo = 0;
      fire(world, u.owner, w, t, b.x, b.y, sz, b.id);
      if (!world.getEntity(t.id)) break;
    }
  }
}

export function updateProjectiles(world: World): void {
  const keep: Projectile[] = [];
  for (const p of world.projectiles) {
    p.t += DT;
    const w = p.weapon;
    let landed = false;
    if (w.projectile === 'shell') {
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k;
      landed = k >= 1;
    } else {
      const t = world.getEntity(p.target);
      if (t && targetKind(t)) {
        p.tx = t.x;
        p.ty = t.y;
      }
      const d = dist(p.x, p.y, p.tx, p.ty);
      const step = (w.speed ?? 20) * DT;
      if (d <= step + 0.3 || p.t > MISSILE_LIFE) {
        p.x = p.tx;
        p.y = p.ty;
        landed = true;
      } else {
        p.x += ((p.tx - p.x) / d) * step;
        p.y += ((p.ty - p.y) / d) * step;
      }
    }
    if (!landed) {
      keep.push(p);
      continue;
    }
    const t = world.getEntity(p.target);
    let z = 0.3;
    if (w.splash) {
      splash(world, p.owner, w, p.damage, p.x, p.y);
    } else if (t && targetKind(t) && reach(p.x, p.y, t) < 0.9) {
      z = heightOf(t);
      hit(world, p.owner, w, p.damage, t);
    }
    world.emit({ kind: 'impact', x: p.x, y: p.y, z, weapon: w });
  }
  world.projectiles = keep;
}

/** A player is out when no Command Center or production building is left. */
export function checkVictory(world: World): void {
  if (world.tick % 15 !== 0 || world.winner !== null) return;
  for (const p of world.players) {
    if (p.defeated) continue;
    const alive = world.buildings.some((b) => b.owner === p.id && (b.def.category === 'core' || b.def.category === 'military'));
    if (!alive) {
      p.defeated = true;
      world.emit({ kind: 'notify', player: -1, text: `${p.name} has been defeated` });
    }
  }
  const left = world.players.filter((p) => !p.defeated);
  if (left.length <= 1 && world.players.some((p) => p.defeated)) {
    world.winner = left[0]?.id ?? -1;
    world.emit({ kind: 'gameOver', winner: world.winner });
  }
}

/** Research that raises HP applies to everything already on the field too. */
export function scaleHp(world: World, player: number, group: string, mult: number): void {
  for (const u of world.units) {
    if (u.owner !== player || unitGroup(u.def) !== group) continue;
    u.maxHp *= mult;
    u.hp *= mult;
  }
  for (const b of world.buildings) {
    if (b.owner !== player || buildingGroup(b.def) !== group) continue;
    b.maxHp *= mult;
    b.hp *= mult;
  }
}

