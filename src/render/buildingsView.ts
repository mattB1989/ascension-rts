// Three.js objects for every building: model, foundation skirt, scaffolding
// while under construction, selection outline, animated parts, rally flag.

import * as THREE from 'three';
import { groundHeight, Terrain, type GameMap } from '../sim/map.ts';
import type { Building, World } from '../sim/world.ts';
import { buildBuildingModel, buildScaffold } from './buildingModels.ts';
import { HealthBar } from './healthBar.ts';
import { box, mat } from './models.ts';

interface BuildingObject {
  root: THREE.Group;
  model: THREE.Group;
  scaffold: THREE.Group | null;
  outline: THREE.Group;
  spins: THREE.Object3D[];
  beams: THREE.Object3D[];
  cranks: THREE.Object3D[];
  flares: THREE.Object3D[];
  turret: THREE.Object3D | null;
  gateBar: THREE.Object3D | null;
  smokes: Smoke[];
  hb: HealthBar;
  top: number;
  /** House level the model was built for. */
  level: number;
}

/** A few puffs rising from a chimney top while the building works. */
interface Smoke {
  anchor: THREE.Object3D;
  puffs: THREE.Mesh[];
}

const smokeGeo = new THREE.SphereGeometry(0.16, 6, 4);
const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.45, depthWrite: false });

const isWallish = (t: string) => t === 'wall' || t === 'gate';

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.9, depthWrite: false });
const enemyOutlineMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false });

function outlineRect(w: number, h: number, material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const t = 0.08;
  const add = (sx: number, sz: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.04, sz), material);
    m.position.set(x, 0, z);
    m.renderOrder = 2;
    g.add(m);
  };
  add(w + 0.3, t, 0, h / 2 + 0.15);
  add(w + 0.3, t, 0, -h / 2 - 0.15);
  add(t, h + 0.3, w / 2 + 0.15, 0);
  add(t, h + 0.3, -w / 2 - 0.15, 0);
  return g;
}

/** Highest ground under a footprint, so buildings never sink into a slope. */
export function footprintBase(map: GameMap, tx: number, ty: number, w: number, h: number): number {
  let m = -Infinity;
  for (let y = ty; y <= ty + h; y++) for (let x = tx; x <= tx + w; x++) m = Math.max(m, groundHeight(map, x, y));
  return m;
}

/** Which way (multiple of 90°) faces the most water around a footprint; 0 = +x. */
export function waterFacing(map: GameMap, tx: number, ty: number, w: number, h: number): number {
  const dirs: Array<[number, number, number]> = [[1, 0, 0], [0, 1, -Math.PI / 2], [-1, 0, Math.PI], [0, -1, Math.PI / 2]];
  let best = 0;
  let bestN = -1;
  for (const [dx, dy, rot] of dirs) {
    let n = 0;
    for (let k = 1; k <= 4; k++) {
      for (let i = 0; i < Math.max(w, h); i++) {
        const x = dx === 1 ? tx + w - 1 + k : dx === -1 ? tx - k : tx + Math.min(i, w - 1);
        const y = dy === 1 ? ty + h - 1 + k : dy === -1 ? ty - k : ty + Math.min(i, h - 1);
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const t = map.terrain[y * map.width + x];
        if (t === Terrain.Shallow || t === Terrain.Deep) n++;
      }
    }
    if (n > bestN) {
      bestN = n;
      best = rot;
    }
  }
  return best;
}

/** The wall pieces between neighbouring wall/gate segments, rebuilt when the walls change. */
class WallLinks {
  readonly group = new THREE.Group();
  private sig = '';
  private readonly geo = new THREE.BoxGeometry(1, 0.95, 0.42);

  update(world: World, viewer: number): void {
    const walls = world.buildings.filter((b) => isWallish(b.type));
    const sig = walls.map((b) => `${b.id}:${Math.floor(b.progress * 5)}`).join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c instanceof THREE.InstancedMesh) c.dispose();
    }
    const w = world.map.width;
    const byOwner = new Map<number, THREE.Matrix4[]>();
    const explored = world.players[viewer]?.explored;
    for (const b of walls) {
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const n = world.getBuilding(world.occupancy[(b.ty + dy) * w + b.tx + dx] ?? 0);
        if (!n || !isWallish(n.type) || n.owner !== b.owner) continue;
        if (b.owner !== viewer && explored && !explored[b.ty * w + b.tx]) continue;
        const x = (b.x + n.x) / 2;
        const y = (b.y + n.y) / 2;
        const h = Math.max(footprintBase(world.map, b.tx, b.ty, 1, 1), footprintBase(world.map, n.tx, n.ty, 1, 1));
        const progress = Math.min(b.complete ? 1 : b.progress, n.complete ? 1 : n.progress);
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, h + 0.475 * (0.1 + 0.9 * progress), y),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx ? 0 : Math.PI / 2),
          new THREE.Vector3(1, 0.1 + 0.9 * progress, 1),
        );
        const list = byOwner.get(b.owner) ?? [];
        list.push(m);
        byOwner.set(b.owner, list);
      }
    }
    for (const [owner, mats] of byOwner) {
      const mesh = new THREE.InstancedMesh(this.geo, mat(0xb8b4aa, { rough: 0.9 }), mats.length);
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.owner = owner;
      this.group.add(mesh);
    }
  }
}

export class BuildingsView {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, BuildingObject>();
  private readonly world: World;
  private readonly rally: THREE.Group;
  private readonly walls = new WallLinks();
  /** Called when a building first appears (the terrain clears trees under it). */
  onCreate: (b: Building) => void = () => {};

  constructor(world: World) {
    this.world = world;
    this.rally = new THREE.Group();
    this.rally.add(box(0.05, 1.4, 0.05, mat(0x2b2f33), 0, 0.7, 0));
    this.rally.add(box(0.5, 0.3, 0.03, new THREE.MeshBasicMaterial({ color: 0x7dff8a }), 0.27, 1.25, 0));
    this.rally.visible = false;
    this.group.add(this.rally, this.walls.group);
  }

  private create(b: Building): BuildingObject {
    const map = this.world.map;
    const color = this.world.players[b.owner]?.color ?? 0xffffff;
    const root = new THREE.Group();
    const onWater = b.def.placement === 'seaOil' || b.def.placement === 'water';
    const base = onWater ? 0 : footprintBase(map, b.tx, b.ty, b.w, b.h);
    root.position.set(b.x, base, b.y);
    const level = b.city?.level ?? 0;
    const model = buildBuildingModel(b.type, color, level);
    if (b.type === 'shipyard' || b.type === 'fishing_harbour') model.rotation.y = waterFacing(map, b.tx, b.ty, b.w, b.h);
    if (b.type === 'gate') {
      // Turn the gate to run along its wall: N/S neighbours mean the wall runs along y.
      const at = (dx: number, dy: number) => this.world.getBuilding(this.world.occupancy[(b.ty + dy) * map.width + b.tx + dx] ?? 0);
      const ns = [at(0, -1), at(0, 1)].some((n) => n && isWallish(n.type));
      const ew = [at(-1, 0), at(1, 0)].some((n) => n && isWallish(n.type));
      if (ns && !ew) model.rotation.y = Math.PI / 2;
    }
    root.add(model);
    if (!onWater && !isWallish(b.type)) {
      // Foundation skirt hides gaps where the ground slopes away.
      const skirt = box(b.w - 0.1, 1.2, b.h - 0.1, mat(0x7f7d76, { rough: 1 }), 0, -0.58, 0);
      skirt.castShadow = false;
      root.add(skirt);
    }
    const outline = outlineRect(b.w, b.h, b.owner === this.viewerId ? outlineMat : enemyOutlineMat);
    outline.position.y = 0.2;
    outline.visible = false;
    root.add(outline);
    const bbox = new THREE.Box3().setFromObject(model);
    const height = Math.max(1, bbox.max.y);
    const scaffold = b.complete ? null : buildScaffold(b.w, b.h, height);
    if (scaffold) root.add(scaffold);
    this.group.add(root);
    const named = (n: string) => {
      const out: THREE.Object3D[] = [];
      model.traverse((o) => o.name === n && out.push(o));
      return out;
    };
    const hb = new HealthBar(Math.max(0.8, Math.min(3, b.w * 0.8)));
    this.group.add(hb.group);
    const smokes: Smoke[] = named('smoke').map((anchor) => {
      const puffs: THREE.Mesh[] = [];
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(smokeGeo, smokeMat);
        p.visible = false;
        anchor.add(p);
        puffs.push(p);
      }
      return { anchor, puffs };
    });
    return {
      root, model, scaffold, outline, spins: named('spin'), beams: named('beam'), cranks: named('crank'), flares: named('flare'),
      turret: model.getObjectByName('turret') ?? null,
      gateBar: model.getObjectByName('gateBar') ?? null,
      smokes,
      hb,
      top: base + height + 0.4,
      level,
    };
  }

  private viewerId = 0;

  update(time: number, dt: number, selected: ReadonlySet<number>, viewer: number, inspected = 0, camera?: THREE.Camera): void {
    this.viewerId = viewer;
    this.walls.update(this.world, viewer);
    const seen = new Set<number>();
    const explored = this.world.players[viewer]?.explored;
    const w = this.world.map.width;
    let rallyShown = false;
    for (const b of this.world.buildings) {
      seen.add(b.id);
      let o = this.objects.get(b.id);
      if (o && b.city && b.complete && o.level !== b.city.level) {
        // A house grew (or shrank): new model.
        this.group.remove(o.root, o.hb.group);
        this.objects.delete(b.id);
        o = undefined;
      }
      if (!o) {
        o = this.create(b);
        this.objects.set(b.id, o);
        this.onCreate(b);
      }
      // Enemy buildings show once their ground has been explored.
      o.root.visible = b.owner === viewer || !explored || explored[Math.floor(b.y) * w + Math.floor(b.x)] === 1;

      if (!b.complete) {
        o.model.scale.y = 0.08 + 0.92 * b.progress;
      } else if (o.scaffold) {
        o.root.remove(o.scaffold);
        o.scaffold = null;
        o.model.scale.y = 1;
      }

      const active = b.city
        ? b.complete && (b.city.efficiency > 0 || b.city.powerOut > 0 || (!b.def.econ?.recipe && b.city.status === ''))
        : b.complete && (!b.def.produces || (b.resource >= 0 ? (this.world.resources[b.resource]?.amount ?? 0) > 0 : true));
      for (const sm of o.smokes) {
        sm.puffs.forEach((p, i) => {
          const k = (time * 0.35 + i / sm.puffs.length + b.id * 0.13) % 1;
          p.visible = active && o!.root.visible;
          p.position.set(k * 0.5, k * 1.6, k * 0.2);
          p.scale.setScalar(0.6 + k * 2.2);
        });
      }
      for (const s of o.spins) s.rotation.y += dt * (b.complete ? 1.4 : 0);
      for (const beam of o.beams) beam.rotation.z = active ? Math.sin(time * 2.2 + b.id) * 0.28 : 0;
      for (const c of o.cranks) c.rotation.z = active ? time * 2.2 + b.id : 0;
      for (const f of o.flares) {
        const k = 0.8 + 0.25 * Math.sin(time * 17 + b.id) + 0.15 * Math.sin(time * 7.3);
        f.scale.set(k, active || b.type === 'airfield' || b.type === 'police_station' ? k * 1.2 : 0.01, k);
      }

      if (o.turret) {
        let want = b.target || b.firedAgo < 30 ? -(b.aim - 0) - o.model.rotation.y : o.turret.rotation.y;
        let cur = o.turret.rotation.y;
        while (want - cur > Math.PI) want -= Math.PI * 2;
        while (want - cur < -Math.PI) want += Math.PI * 2;
        cur += (want - cur) * Math.min(1, dt * 5);
        o.turret.rotation.y = cur;
      }
      if (o.gateBar) {
        // Lift the barrier when one of the owner's ground units is close.
        let open = false;
        for (const u of this.world.units) {
          if (u.owner !== b.owner || u.def.domain !== 'land' || u.carrier) continue;
          if ((u.x - b.x) ** 2 + (u.y - b.y) ** 2 < 4) {
            open = true;
            break;
          }
        }
        const want = open ? 1.35 : 0;
        o.gateBar.rotation.z += (want - o.gateBar.rotation.z) * Math.min(1, dt * 6);
      }

      const isSel = selected.has(b.id) || b.id === inspected;
      o.outline.visible = isSel;
      if (camera && o.root.visible && b.complete && (b.hp < b.maxHp - 0.5 || isSel)) o.hb.set(b.x, o.top, b.y, b.hp / b.maxHp, camera);
      else o.hb.hide();
      if (isSel && b.rally && b.owner === viewer) {
        this.rally.visible = true;
        rallyShown = true;
        this.rally.position.set(b.rally.x, Math.max(0, groundHeight(this.world.map, b.rally.x, b.rally.y)), b.rally.y);
      }
    }
    if (!rallyShown) this.rally.visible = false;
    for (const [id, o] of this.objects) {
      if (seen.has(id)) continue;
      this.group.remove(o.root, o.hb.group);
      this.objects.delete(id);
    }
  }
}
