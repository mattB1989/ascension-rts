// Ore crystals and oil spots. Crystals shrink as they are mined and vanish
// when empty; oil pools hide under the derrick or rig built on them.

import * as THREE from 'three';
import { groundHeight } from '../sim/map.ts';
import type { World } from '../sim/world.ts';
import { buildOilSpot, buildOreCrystals } from './models.ts';

export class ResourcesView {
  readonly group = new THREE.Group();
  private readonly objects: THREE.Group[] = [];
  private readonly world: World;

  constructor(world: World) {
    this.world = world;
    for (const r of world.resources) {
      const model = r.kind === 'ore' ? buildOreCrystals(Math.floor(r.x * 7 + r.y * 13 + r.index)) : buildOilSpot(r.offshore);
      model.position.set(r.x, r.offshore ? 0 : groundHeight(world.map, r.x, r.y), r.y);
      this.objects.push(model);
      this.group.add(model);
    }
  }

  update(): void {
    for (const r of this.world.resources) {
      const o = this.objects[r.index]!;
      if (r.kind === 'ore') {
        o.visible = r.amount > 0;
        const s = 0.35 + 0.65 * Math.sqrt(Math.max(0, r.amount / r.max));
        o.scale.set(s, s, s);
      } else {
        o.visible = r.claimedBy === 0;
      }
    }
  }
}
