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
  private readonly ring: THREE.Mesh;

  constructor(world: World) {
    this.world = world;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.42, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.ring.renderOrder = 2;
    this.ring.visible = false;
    this.group.add(this.ring);
    for (const r of world.resources) {
      const model = r.kind === 'ore' ? buildOreCrystals(Math.floor(r.x * 7 + r.y * 13 + r.index)) : buildOilSpot(r.offshore);
      model.position.set(r.x, r.offshore ? 0 : groundHeight(world.map, r.x, r.y), r.y);
      this.objects.push(model);
      this.group.add(model);
    }
  }

  update(highlight = -1, time = 0): void {
    const hr = highlight >= 0 ? this.world.resources[highlight] : undefined;
    this.ring.visible = !!hr;
    if (hr) {
      const o = this.objects[hr.index]!;
      const k = (hr.offshore ? 1.4 : 1) * (1 + Math.sin(time * 4) * 0.04);
      this.ring.position.set(hr.x, o.position.y + 0.08, hr.y);
      this.ring.scale.set(k, 1, k);
    }
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
