// Keeps a three.js object for every sim unit, interpolated between sim ticks.

import * as THREE from 'three';
import { groundHeight, surfaceHeight } from '../sim/map.ts';
import { DT, type Unit, type World } from '../sim/world.ts';
import { buildUnitModel } from './models.ts';

interface UnitObject {
  root: THREE.Group;
  model: THREE.Group;
  ring: THREE.Mesh;
  rotor: THREE.Object3D | null;
  tailRotor: THREE.Object3D | null;
  radar: THREE.Object3D | null;
  tool: THREE.Object3D | null;
  carry: THREE.Object3D | null;
  bank: number;
}

const ringGeoCache = new Map<number, THREE.RingGeometry>();
function ringGeo(r: number): THREE.RingGeometry {
  const key = Math.round(r * 100);
  let g = ringGeoCache.get(key);
  if (!g) {
    g = new THREE.RingGeometry(r * 0.88, r, 28).rotateX(-Math.PI / 2);
    ringGeoCache.set(key, g);
  }
  return g;
}

const ringMat = new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.9, depthWrite: false });

export class UnitsView {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, UnitObject>();
  private readonly world: World;

  constructor(world: World) {
    this.world = world;
  }

  /** World-space render position of a unit (interpolated). */
  renderPosition(u: Unit, alpha: number, out = new THREE.Vector3()): THREE.Vector3 {
    const x = u.px + (u.x - u.px) * alpha;
    const z = u.py + (u.y - u.py) * alpha;
    out.set(x, this.baseHeight(u, x, z), z);
    return out;
  }

  private baseHeight(u: Unit, x: number, z: number): number {
    const d = u.def;
    if (d.domain === 'air') return Math.max(0, groundHeight(this.world.map, x, z)) + (d.flyHeight ?? 4);
    if (d.domain === 'sea') return 0;
    return surfaceHeight(this.world.map, x, z);
  }

  private create(u: Unit): UnitObject {
    const color = this.world.players[u.owner]?.color ?? 0xffffff;
    const root = new THREE.Group();
    const model = buildUnitModel(u.type, color);
    root.add(model);
    const ring = new THREE.Mesh(ringGeo(u.def.radius * 1.35 + 0.15), ringMat);
    ring.visible = false;
    ring.renderOrder = 2;
    this.group.add(ring);
    this.group.add(root);
    return {
      root,
      model,
      ring,
      rotor: model.getObjectByName('rotor') ?? null,
      tailRotor: model.getObjectByName('tailRotor') ?? null,
      radar: model.getObjectByName('radar') ?? null,
      tool: model.getObjectByName('tool') ?? null,
      carry: model.getObjectByName('carry') ?? null,
      bank: 0,
    };
  }

  /** Is this unit shown to the viewer (own units always; others only where the viewer can see)? */
  isShown(u: Unit, viewer: number): boolean {
    if (u.owner === viewer) return true;
    const p = this.world.players[viewer];
    if (!p) return true;
    const tx = Math.floor(u.x);
    const ty = Math.floor(u.y);
    return p.visible[ty * this.world.map.width + tx] === 1;
  }

  update(alpha: number, time: number, frameDt: number, selected: ReadonlySet<number>, viewer: number): void {
    const seen = new Set<number>();
    const pos = new THREE.Vector3();
    for (const u of this.world.units) {
      seen.add(u.id);
      let o = this.objects.get(u.id);
      if (!o) {
        o = this.create(u);
        this.objects.set(u.id, o);
      }
      this.renderPosition(u, alpha, pos);
      // Interpolate angle along the shortest arc.
      let da = u.angle - u.pa;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      const angle = u.pa + da * alpha;
      o.root.position.copy(pos);
      o.root.rotation.set(0, -angle, 0);

      const phase = u.id * 1.7;
      if (u.def.domain === 'sea') {
        o.root.position.y += Math.sin(time * 1.6 + phase) * 0.05;
        o.model.rotation.x = Math.sin(time * 1.1 + phase) * 0.04;
        o.model.rotation.z = Math.sin(time * 0.9 + phase) * 0.025;
      } else if (u.def.move === 'heli') {
        o.root.position.y += Math.sin(time * 2 + phase) * 0.12;
        // Nose down when flying forward.
        const target = u.state === 'moving' ? -0.18 : 0;
        o.model.rotation.z += (target - o.model.rotation.z) * Math.min(1, frameDt * 3);
      } else if (u.def.move === 'jet') {
        o.root.position.y += Math.sin(time * 0.8 + phase) * 0.2;
        const turnRate = da / DT;
        const targetBank = Math.max(-0.9, Math.min(0.9, -turnRate * 0.55));
        o.bank += (targetBank - o.bank) * Math.min(1, frameDt * 4);
        o.model.rotation.x = o.bank;
      }
      if (o.rotor) o.rotor.rotation.y += frameDt * 22;
      if (o.tailRotor) o.tailRotor.rotation.z += frameDt * 30;
      if (o.radar) o.radar.rotation.y += frameDt * 2;
      if (o.carry) o.carry.visible = u.carry > 0;
      if (o.tool) o.tool.rotation.z = u.working ? Math.sin(time * 9 + u.id) * 0.7 - 0.2 : 0;
      if (u.working && u.def.domain === 'land') o.root.position.y += Math.abs(Math.sin(time * 9 + u.id)) * 0.03;
      const shown = this.isShown(u, viewer);
      o.root.visible = shown;

      const isSel = selected.has(u.id) && shown;
      o.ring.visible = isSel;
      if (isSel) {
        // Aircraft get the ring around them in the air; everything else on the ground/water.
        const ringY = u.def.domain === 'air' ? o.root.position.y - 0.35 : u.def.domain === 'sea' ? 0.06 : pos.y + 0.06;
        o.ring.position.set(pos.x, ringY, pos.z);
      }
    }
    for (const [id, o] of this.objects) {
      if (seen.has(id)) continue;
      this.group.remove(o.root, o.ring);
      this.objects.delete(id);
    }
  }
}
