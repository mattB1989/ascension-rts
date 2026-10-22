// Explore: a unit keeps heading for the nearest unexplored ground it can reach,
// until there is nothing left to discover.

import { setDestination } from './movement.ts';
import { NavLayer } from './nav.ts';
import { takeOff } from './transport.ts';
import type { Unit } from './types.ts';
import type { World } from './world.ts';

type ExploreTask = Extract<NonNullable<Unit['task']>, { kind: 'explore' }>;

const STEP = 3; // sample every 3rd tile
const ATTEMPTS = 6; // unreachable candidates tried per pick
const MAX_TRIED = 400;

export function orderExplore(world: World, units: Unit[]): void {
  for (const u of units) {
    u.task = { kind: 'explore', tried: [] };
    u.working = false;
    takeOff(u);
    pickTarget(world, u, u.task);
  }
}

export function updateExplore(world: World, u: Unit): void {
  const task = u.task;
  if (task?.kind !== 'explore') return;
  // Jets never stop: "arrived" means circling the goal.
  const arrived = u.def.move === 'jet' ? (u.x - u.goalX) ** 2 + (u.y - u.goalY) ** 2 < 25 : u.state === 'idle';
  if (arrived) pickTarget(world, u, task);
}

function pickTarget(world: World, u: Unit, task: ExploreTask): void {
  const p = world.players[u.owner]!;
  const { width: w, height: h } = world.map;
  const air = u.layer === NavLayer.Air;
  const tried = new Set(task.tried);
  const cands: Array<{ key: number; x: number; y: number; d: number }> = [];
  for (let ty = 1; ty < h; ty += STEP) {
    for (let tx = 1; tx < w; tx += STEP) {
      const key = ty * w + tx;
      if (p.explored[key] || tried.has(key)) continue;
      if (!air && !world.nav.passable(u.layer, tx, ty)) continue;
      const x = tx + 0.5;
      const y = ty + 0.5;
      cands.push({ key, x, y, d: (x - u.x) * (x - u.x) + (y - u.y) * (y - u.y) });
    }
  }
  cands.sort((a, b) => a.d - b.d || a.key - b.key);
  for (let i = 0; i < Math.min(ATTEMPTS, cands.length); i++) {
    const c = cands[i]!;
    if (air) {
      u.goalX = c.x;
      u.goalY = c.y;
      u.path = [c.x, c.y];
      u.pathIdx = 0;
      u.state = 'moving';
      return;
    }
    setDestination(world, u, c.x, c.y);
    const ex = u.path.length >= 2 ? u.path[u.path.length - 2]! : u.x;
    const ey = u.path.length >= 2 ? u.path[u.path.length - 1]! : u.y;
    if ((ex - c.x) * (ex - c.x) + (ey - c.y) * (ey - c.y) <= 16 && u.state === 'moving') return;
    // Out of reach (an island, the far shore for a ship): skip it from now on.
    task.tried.push(c.key);
    if (task.tried.length > MAX_TRIED) task.tried.shift();
  }
  if (cands.length === 0) {
    u.task = null;
    world.emit({ kind: 'notify', player: u.owner, text: `${u.def.name}: nothing left to explore`, x: u.x, y: u.y });
  }
}
