// Client-side placement helpers: snap the footprint under the pointer and say
// whether it can be built there (the sim re-checks when the command arrives).

import { BUILDINGS, type BuildingTypeId } from '../data/buildings.ts';
import { buildLockReason, canAfford, footprintAt, placementProblem } from '../sim/placement.ts';
import type { World } from '../sim/world.ts';

/** Top-left tile for a building centred on the pointer; derricks and rigs snap onto nearby oil. */
export function snapFootprint(world: World, type: BuildingTypeId, x: number, y: number): [number, number] {
  const def = BUILDINGS[type];
  const [w, h] = def.size;
  if (def.placement === 'landOil' || def.placement === 'seaOil') {
    let best: [number, number] | null = null;
    let bestD = 4 * 4;
    for (const r of world.resources) {
      if (r.kind !== 'oil' || r.claimedBy !== 0 || r.offshore !== (def.placement === 'seaOil')) continue;
      const d = (r.x - x) ** 2 + (r.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [r.tx - Math.floor((w - 1) / 2), r.ty - Math.floor((h - 1) / 2)];
      }
    }
    if (best) return best;
  }
  return footprintAt(type, x, y);
}

export function placementCheck(world: World, player: number, type: BuildingTypeId, tx: number, ty: number): string | null {
  const lock = buildLockReason(world, player, type);
  if (lock) return lock;
  if (!canAfford(world.players[player]!, BUILDINGS[type].cost)) return 'Not enough resources';
  return placementProblem(world, player, type, tx, ty);
}
