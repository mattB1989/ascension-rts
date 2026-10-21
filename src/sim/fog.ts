// Fog of war: what each player can currently see, and what they have explored.
// Recomputed every few ticks from unit and building vision radii.

import type { World } from './world.ts';

const circleCache = new Map<number, Int16Array>();

/** Tile offsets (dx, dy pairs) within a radius. */
function circle(r: number): Int16Array {
  const key = Math.round(r * 2);
  let c = circleCache.get(key);
  if (!c) {
    const pts: number[] = [];
    const rr = (key / 2) * (key / 2);
    const ir = Math.ceil(key / 2);
    for (let dy = -ir; dy <= ir; dy++) for (let dx = -ir; dx <= ir; dx++) if (dx * dx + dy * dy <= rr) pts.push(dx, dy);
    c = Int16Array.from(pts);
    circleCache.set(key, c);
  }
  return c;
}

export const FOG_INTERVAL = 4; // ticks

export function updateFog(world: World): void {
  const { width: w, height: h } = world.map;
  for (const p of world.players) {
    const vis = p.visible;
    vis.fill(0);
    const stamp = (x: number, y: number, r: number) => {
      const c = circle(r);
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      for (let i = 0; i < c.length; i += 2) {
        const tx = cx + c[i]!;
        const ty = cy + c[i + 1]!;
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const k = ty * w + tx;
        vis[k] = 1;
        p.explored[k] = 1;
      }
    };
    for (const u of world.units) if (u.owner === p.id) stamp(u.x, u.y, u.def.vision);
    for (const b of world.buildings) if (b.owner === p.id) stamp(b.x, b.y, b.complete ? b.def.vision + Math.max(b.w, b.h) / 2 : 3);
  }
}

export function isVisible(world: World, player: number, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= world.map.width || ty >= world.map.height) return false;
  return world.players[player]!.visible[ty * world.map.width + tx] === 1;
}
