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
  }
}
