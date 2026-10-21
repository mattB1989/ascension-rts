// Short-lived visual feedback: move-order markers.

import * as THREE from 'three';

interface Marker {
  mesh: THREE.Mesh;
  age: number;
}

const LIFE = 0.7;

export class Effects {
  readonly group = new THREE.Group();
  private readonly markers: Marker[] = [];
  private readonly geo = new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2);

  moveMarker(x: number, y: number, z: number): void {
    const m = new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 1, depthWrite: false });
    const mesh = new THREE.Mesh(this.geo, m);
    mesh.position.set(x, y + 0.08, z);
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.markers.push({ mesh, age: 0 });
  }

  update(dt: number): void {
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const mk = this.markers[i]!;
      mk.age += dt;
      const t = mk.age / LIFE;
      if (t >= 1) {
        this.group.remove(mk.mesh);
        (mk.mesh.material as THREE.Material).dispose();
        this.markers.splice(i, 1);
        continue;
      }
      const s = 1.6 - t * 1.1;
      mk.mesh.scale.set(s, 1, s);
      (mk.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }
  }
}
