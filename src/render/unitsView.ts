// Keeps a three.js object for every sim unit, interpolated between sim ticks.

import * as THREE from 'three';
import { groundHeight, surfaceHeight } from '../sim/map.ts';
import { DT, type Unit, type World } from '../sim/world.ts';
import { footprintBase } from './buildingsView.ts';
import { HealthBar } from './healthBar.ts';
import { buildChute, buildUnitModel } from './models.ts';

interface UnitObject {
  root: THREE.Group;
  model: THREE.Group;
  ring: THREE.Mesh;
  rotor: THREE.Object3D | null;
  tailRotor: THREE.Object3D | null;
  radar: THREE.Object3D | null;
  tool: THREE.Object3D | null;
  carry: THREE.Object3D | null;
  props: THREE.Object3D[];
  chute: THREE.Group | null;
  turret: THREE.Object3D | null;
  hb: HealthBar;
  /** Top of the model, for the health bar. */
  top: number;
  bank: number;
  /** Current height above the ground for aircraft (eased: take-off and landing). */
  alt: number;
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
const enemyRingMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false });

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

  /** Ground under an aircraft: the airfield apron when parked, else terrain or sea. */
  private airGround(u: Unit, x: number, z: number): number {
    if (u.parked) {
      const field = this.world.getBuilding(u.home);
      if (field) return footprintBase(this.world.map, field.tx, field.ty, field.w, field.h) + 0.12;
    }
    return Math.max(0, groundHeight(this.world.map, x, z));
  }

  /** Height the aircraft is heading for: parked on the apron, or a helicopter settled on land. */
  private targetAlt(u: Unit, x: number, z: number): number {
    const d = u.def;
    if (u.parked) return 0.15;
    if (d.move === 'heli' && u.state === 'idle' && groundHeight(this.world.map, x, z) > 0.1) return 0.35;
    return d.flyHeight ?? 4;
  }

  private baseHeight(u: Unit, x: number, z: number): number {
    const d = u.def;
    if (d.domain === 'air') return this.airGround(u, x, z) + (this.objects.get(u.id)?.alt ?? this.targetAlt(u, x, z));
    if (d.domain === 'sea') return 0;
    const ground = surfaceHeight(this.world.map, x, z);
    // Paratroopers drift down from the drop height.
    if (u.chute > 0) return Math.max(ground, 0) + (u.chute / 3) * 5.5;
    return ground;
  }

  private create(u: Unit): UnitObject {
    const color = this.world.players[u.owner]?.color ?? 0xffffff;
    const root = new THREE.Group();
    const model = buildUnitModel(u.type, color);
    root.add(model);
    const hb = new HealthBar(Math.max(0.6, u.def.radius * 1.8));
    this.group.add(hb.group);
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
      props: (() => {
        const out: THREE.Object3D[] = [];
        model.traverse((c) => c.name === 'prop' && out.push(c));
        return out;
      })(),
      chute: null,
      turret: model.getObjectByName('turret') ?? null,
      hb,
      top: new THREE.Box3().setFromObject(model).max.y + 0.35,
      bank: 0,
      alt: this.targetAlt(u, u.x, u.y),
    };
  }

  /** Can this unit be clicked (false while carried inside a transport). */
  isPickable(u: Unit): boolean {
    return this.objects.get(u.id)?.root.visible ?? true;
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

  update(alpha: number, time: number, frameDt: number, selected: ReadonlySet<number>, viewer: number, inspected = 0, camera?: THREE.Camera): void {
    const seen = new Set<number>();
    const pos = new THREE.Vector3();
    for (const u of this.world.units) {
      seen.add(u.id);
      let o = this.objects.get(u.id);
      if (!o) {
        o = this.create(u);
        this.objects.set(u.id, o);
      }
      if (u.def.domain === 'air') {
        const target = this.targetAlt(u, u.x, u.y);
        // Climb out quickly, settle gently.
        const rate = target > o.alt ? 1.6 : 1.1;
        o.alt += (target - o.alt) * Math.min(1, frameDt * rate);
        const k = u.parked ? 0.72 : 1;
        const sc = o.model.scale.x + (k - o.model.scale.x) * Math.min(1, frameDt * 2);
        o.model.scale.setScalar(sc);
      }
      this.renderPosition(u, alpha, pos);
      // Interpolate angle along the shortest arc.
      let da = u.angle - u.pa;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      let angle = u.pa + da * alpha;
      // Units without a turret turn to face what they are shooting at.
      if (!o.turret && u.target && u.state === 'idle' && u.def.domain !== 'air') angle = u.aim;
      o.root.position.copy(pos);
      o.root.rotation.set(0, -angle, 0);
      if (o.turret) {
        let want = u.target ? -(u.aim - angle) : 0;
        let cur = o.turret.rotation.y;
        while (want - cur > Math.PI) want -= Math.PI * 2;
        while (want - cur < -Math.PI) want += Math.PI * 2;
        cur += (want - cur) * Math.min(1, frameDt * 6);
        o.turret.rotation.y = cur;
      }
      // Recoil after a shot.
      o.model.position.x = u.firedAgo < 4 ? -0.07 * (1 - u.firedAgo / 4) : 0;

      const phase = u.id * 1.7;
      if (u.def.domain === 'sea') {
        o.root.position.y += Math.sin(time * 1.6 + phase) * 0.05;
        o.model.rotation.x = Math.sin(time * 1.1 + phase) * 0.04;
        o.model.rotation.z = Math.sin(time * 0.9 + phase) * 0.025;
      } else if (u.def.move === 'heli') {
        if (o.alt > 1) o.root.position.y += Math.sin(time * 2 + phase) * 0.12;
        // Nose down when flying forward.
        const target = u.state === 'moving' ? -0.18 : 0;
        o.model.rotation.z += (target - o.model.rotation.z) * Math.min(1, frameDt * 3);
      } else if (u.def.move === 'jet' && !u.parked) {
        o.root.position.y += Math.sin(time * 0.8 + phase) * 0.2 * Math.min(1, o.alt / 4);
        const turnRate = da / DT;
        const targetBank = Math.max(-0.9, Math.min(0.9, -turnRate * 0.55));
        o.bank += (targetBank - o.bank) * Math.min(1, frameDt * 4);
        o.model.rotation.x = o.bank;
      }
      if (u.parked) o.model.rotation.x += (0 - o.model.rotation.x) * Math.min(1, frameDt * 4);
      if (o.rotor) o.rotor.rotation.y += frameDt * (o.alt > 0.5 ? 22 : 4);
      for (const pr of o.props) pr.rotation.x += frameDt * (u.parked ? 2 : 30);
      if (u.chute > 0 && !o.chute) {
        o.chute = buildChute(this.world.players[u.owner]?.color ?? 0xffffff);
        o.model.add(o.chute);
      }
      if (o.chute) {
        o.chute.visible = u.chute > 0;
        o.chute.scale.setScalar(0.75);
      }
      if (o.tailRotor) o.tailRotor.rotation.z += frameDt * 30;
      if (o.radar) o.radar.rotation.y += frameDt * 2;
      if (o.carry) o.carry.visible = u.carry > 0;
      if (o.tool) o.tool.rotation.z = u.working ? Math.sin(time * 9 + u.id) * 0.7 - 0.2 : 0;
      if (u.working && u.def.domain === 'land') o.root.position.y += Math.abs(Math.sin(time * 9 + u.id)) * 0.03;
      const shown = !u.carrier && this.isShown(u, viewer);
      o.root.visible = shown;

      const isSel = (selected.has(u.id) || u.id === inspected) && shown;
      if (camera && shown && (u.hp < u.maxHp - 0.5 || isSel)) o.hb.set(o.root.position.x, o.root.position.y + o.top * o.model.scale.y, o.root.position.z, u.hp / u.maxHp, camera);
      else o.hb.hide();
      if (isSel) o.ring.material = u.owner === viewer ? ringMat : enemyRingMat;
      o.ring.visible = isSel;
      if (isSel) {
        // Aircraft get the ring around them in the air; everything else on the ground/water.
        const ringY = u.def.domain === 'air' ? o.root.position.y - 0.35 : u.def.domain === 'sea' ? 0.06 : pos.y + 0.06;
        o.ring.position.set(pos.x, ringY, pos.z);
      }
    }
    for (const [id, o] of this.objects) {
      if (seen.has(id)) continue;
      this.group.remove(o.root, o.ring, o.hb.group);
      this.objects.delete(id);
    }
  }
}
