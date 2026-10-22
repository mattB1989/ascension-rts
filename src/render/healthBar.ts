// Small billboarded health bar shown over damaged or selected units and buildings.

import * as THREE from 'three';

const bgGeo = new THREE.PlaneGeometry(1, 0.13);
const fgGeo = new THREE.PlaneGeometry(1, 0.09).translate(0.5, 0, 0.001);
const bgMat = new THREE.MeshBasicMaterial({ color: 0x0b0f14, transparent: true, opacity: 0.75, depthWrite: false });
const greenMat = new THREE.MeshBasicMaterial({ color: 0x5ee06a, depthWrite: false });
const yellowMat = new THREE.MeshBasicMaterial({ color: 0xf2c94c, depthWrite: false });
const redMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, depthWrite: false });

export class HealthBar {
  readonly group = new THREE.Group();
  private readonly fg: THREE.Mesh;
  private readonly width: number;

  constructor(width: number) {
    this.width = width;
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.scale.x = width + 0.06;
    bg.renderOrder = 10;
    this.fg = new THREE.Mesh(fgGeo, greenMat);
    this.fg.position.x = -width / 2;
    this.fg.renderOrder = 11;
    this.group.add(bg, this.fg);
    this.group.visible = false;
  }

  /** Show at a world position with a fill fraction, facing the camera. */
  set(x: number, y: number, z: number, frac: number, camera: THREE.Camera): void {
    const f = Math.max(0, Math.min(1, frac));
    this.fg.scale.x = Math.max(0.001, this.width * f);
    this.fg.material = f > 0.6 ? greenMat : f > 0.3 ? yellowMat : redMat;
    this.group.position.set(x, y, z);
    this.group.quaternion.copy(camera.quaternion);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }
}
