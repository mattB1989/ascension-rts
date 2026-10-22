// Translucent preview of a building while the player chooses where to place it.

import * as THREE from 'three';
import { BUILDINGS, type BuildingTypeId } from '../data/buildings.ts';
import type { GameMap } from '../sim/map.ts';
import { buildBuildingModel } from './buildingModels.ts';
import { footprintBase, waterFacing } from './buildingsView.ts';

const okMat = new THREE.MeshStandardMaterial({ color: 0x7dff8a, emissive: 0x2a8a3a, transparent: true, opacity: 0.55, depthWrite: false });
const badMat = new THREE.MeshStandardMaterial({ color: 0xff6a5a, emissive: 0x8a2a2a, transparent: true, opacity: 0.55, depthWrite: false });
const okPad = new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.35, depthWrite: false });
const badPad = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.4, depthWrite: false });

export class PlacementGhost {
  readonly group = new THREE.Group();
  private type: BuildingTypeId | null = null;
  private model: THREE.Group | null = null;
  private readonly pad: THREE.Mesh;
  private valid = true;
  private readonly map: GameMap;

  constructor(map: GameMap) {
    this.map = map;
    this.pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), okPad);
    this.pad.renderOrder = 4;
    this.group.add(this.pad);
    this.group.visible = false;
  }

  show(type: BuildingTypeId, tx: number, ty: number, valid: boolean): void {
    this.line.visible = false;
    const def = BUILDINGS[type];
    const [w, h] = def.size;
    if (type !== this.type) {
      if (this.model) this.group.remove(this.model);
      this.model = buildBuildingModel(type, 0x7dff8a);
      this.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = okMat;
          m.castShadow = false;
          m.renderOrder = 5;
        }
      });
      this.group.add(this.model);
      this.type = type;
      this.valid = true;
    }
    if (valid !== this.valid) {
      this.model!.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = valid ? okMat : badMat;
      });
      this.valid = valid;
    }
    const onWater = def.placement === 'seaOil' || def.placement === 'water';
    const inMap = tx >= 0 && ty >= 0 && tx + w <= this.map.width && ty + h <= this.map.height;
    const base = onWater || !inMap ? 0 : Math.max(0, footprintBase(this.map, tx, ty, w, h));
    this.model!.position.set(tx + w / 2, base, ty + h / 2);
    this.model!.rotation.y = type === 'shipyard' && inMap ? waterFacing(this.map, tx, ty, w, h) : 0;
    this.pad.material = valid ? okPad : badPad;
    this.pad.scale.set(w, 1, h);
    this.pad.position.set(tx + w / 2, base + 0.12, ty + h / 2);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
    this.line.visible = false;
  }

  /** Wall line preview: one block per tile, green where it can go, red where it can't. */
  private readonly line = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1.1, 0.7).translate(0, 0.55, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), 120);

  showLine(tiles: ReadonlyArray<readonly [number, number]>, ok: (tx: number, ty: number) => boolean): void {
    if (!this.line.parent) {
      this.line.renderOrder = 5;
      this.line.frustumCulled = false;
      this.group.parent?.add(this.line);
    }
    this.group.visible = false;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const n = Math.min(tiles.length, 120);
    for (let i = 0; i < n; i++) {
      const [tx, ty] = tiles[i]!;
      const inMap = tx >= 0 && ty >= 0 && tx < this.map.width && ty < this.map.height;
      const h = inMap ? Math.max(0, footprintBase(this.map, tx, ty, 1, 1)) : 0;
      m.makeTranslation(tx + 0.5, h, ty + 0.5);
      this.line.setMatrixAt(i, m);
      this.line.setColorAt(i, c.setHex(ok(tx, ty) ? 0x7dff8a : 0xff5a4a));
    }
    this.line.count = n;
    this.line.instanceMatrix.needsUpdate = true;
    if (this.line.instanceColor) this.line.instanceColor.needsUpdate = true;
    this.line.visible = true;
  }
}
