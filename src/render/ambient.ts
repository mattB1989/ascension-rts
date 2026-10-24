// Ambient life, drawn only (nothing here touches the simulation): private cars
// wandering the streets, more of them as towns grow. They move only while the game
// runs, at game speed, and use their own random numbers so the sim stays
// deterministic.

import * as THREE from 'three';
import { surfaceHeight } from '../sim/map.ts';
import { DT, type World } from '../sim/world.ts';
import { sumTiers } from '../data/goods.ts';
import { applyFow } from './fog.ts';

const MAX_CARS = 220;
/** One car per this many residents (all players together). */
const RESIDENTS_PER_CAR = 7;
const COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0xecf0f1, 0x27ae60, 0x34495e, 0xe67e22, 0x8e44ad, 0x95a5a6, 0x1c1c1c];

interface Car {
  from: number;
  to: number;
  /** 0..1 along from → to. */
  f: number;
  speed: number;
  color: number;
  /** Seconds of game time left before it parks (and another appears elsewhere). */
  life: number;
}

const bodyGeo = new THREE.BoxGeometry(0.34, 0.11, 0.18).translate(0, 0.075, 0);
const topGeo = new THREE.BoxGeometry(0.18, 0.08, 0.15).translate(-0.02, 0.17, 0);

export class CarsView {
  readonly group = new THREE.Group();
  private readonly world: World;
  private readonly body: THREE.InstancedMesh;
  private readonly top: THREE.InstancedMesh;
  private cars: Car[] = [];
  private roads: number[] = [];
  private roadVersion = -1;
  private lastTick = -1;
  private seed = 12345;

  constructor(world: World) {
    this.world = world;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.3 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.2, metalness: 0.5 });
    applyFow(bodyMat);
    applyFow(topMat);
    this.body = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX_CARS);
    this.top = new THREE.InstancedMesh(topGeo, topMat, MAX_CARS);
    for (const m of [this.body, this.top]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
      this.group.add(m);
    }
  }

  private rand(): number {
    // Mulberry32: the renderer's own random numbers.
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Road tiles next to tile i. */
  private neighbours(i: number): number[] {
    const city = this.world.city!;
    const w = this.world.map.width;
    const h = this.world.map.height;
    const x = i % w;
    const y = (i / w) | 0;
    const out: number[] = [];
    if (x > 0 && city.road[i - 1]) out.push(i - 1);
    if (x < w - 1 && city.road[i + 1]) out.push(i + 1);
    if (y > 0 && city.road[i - w]) out.push(i - w);
    if (y < h - 1 && city.road[i + w]) out.push(i + w);
    return out;
  }

  private spawn(): Car | null {
    if (!this.roads.length) return null;
    for (let tries = 0; tries < 6; tries++) {
      const from = this.roads[Math.floor(this.rand() * this.roads.length)]!;
      const n = this.neighbours(from);
      if (!n.length) continue;
      return { from, to: n[Math.floor(this.rand() * n.length)]!, f: this.rand(), speed: 1.4 + this.rand() * 1.2, color: COLORS[Math.floor(this.rand() * COLORS.length)]!, life: 20 + this.rand() * 40 };
    }
    return null;
  }

  update(): void {
    const city = this.world.city;
    if (!city) return;
    if (city.roadVersion !== this.roadVersion) {
      this.roadVersion = city.roadVersion;
      this.roads = [];
      for (let i = 0; i < city.road.length; i++) if (city.road[i]) this.roads.push(i);
      // Cars on roads that are gone vanish.
      this.cars = this.cars.filter((c) => city.road[c.from] && city.road[c.to]);
    }
    let residents = 0;
    for (const p of city.players) residents += sumTiers(p.population);
    const want = Math.min(MAX_CARS, Math.floor(residents / RESIDENTS_PER_CAR), this.roads.length >> 1);
    // Move only while the game runs, at game speed.
    const ticks = this.lastTick < 0 ? 0 : Math.max(0, Math.min(15, this.world.tick - this.lastTick));
    this.lastTick = this.world.tick;
    const dt = ticks * DT;
    if (dt > 0) {
      for (let k = this.cars.length - 1; k >= 0; k--) {
        const c = this.cars[k]!;
        c.life -= dt;
        c.f += c.speed * dt;
        while (c.f >= 1) {
          c.f -= 1;
          const n = this.neighbours(c.to).filter((t) => t !== c.from);
          const next = n.length ? n[Math.floor(this.rand() * n.length)]! : c.from;
          c.from = c.to;
          c.to = next;
        }
        if (c.life <= 0 || this.cars.length > want) this.cars.splice(k, 1);
      }
      for (let k = 0; this.cars.length < want && k < 4; k++) {
        const c = this.spawn();
        if (c) this.cars.push(c);
      }
    }
    const map = this.world.map;
    const w = map.width;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    let n = 0;
    for (const c of this.cars) {
      const ax = (c.from % w) + 0.5;
      const ay = Math.floor(c.from / w) + 0.5;
      const bx = (c.to % w) + 0.5;
      const by = Math.floor(c.to / w) + 0.5;
      const dx = bx - ax;
      const dy = by - ay;
      // Drive on the right.
      const x = ax + dx * c.f - dy * 0.17;
      const y = ay + dy * c.f + dx * 0.17;
      q.setFromAxisAngle(up, Math.atan2(-dy, dx));
      v.set(x, surfaceHeight(map, x, y) + 0.05, y);
      m.compose(v, q, one);
      this.body.setMatrixAt(n, m);
      this.top.setMatrixAt(n, m);
      this.body.setColorAt(n, col.setHex(c.color));
      n++;
    }
    this.body.count = n;
    this.top.count = n;
    this.body.instanceMatrix.needsUpdate = true;
    this.top.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Street lights: warm glows along the roads that come on at dusk.

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.25, 'rgba(255,200,120,0.55)');
  grad.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class StreetLights {
  readonly group = new THREE.Group();
  private readonly world: World;
  private readonly material: THREE.PointsMaterial;
  private points: THREE.Points | null = null;
  private roadVersion = -1;

  constructor(world: World) {
    this.world = world;
    this.material = new THREE.PointsMaterial({ size: 1.6, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true });
    applyFow(this.material);
  }

  /** `night`: 0 (day, lights off) .. 1 (full night). */
  update(night: number): void {
    const city = this.world.city;
    if (!city) return;
    this.material.opacity = Math.max(0, Math.min(1, (night - 0.25) / 0.6));
    this.group.visible = this.material.opacity > 0.01;
    if (!this.group.visible || city.roadVersion === this.roadVersion) return;
    this.roadVersion = city.roadVersion;
    const map = this.world.map;
    const w = map.width;
    const pos: number[] = [];
    for (let i = 0; i < city.road.length; i++) {
      if (!city.road[i]) continue;
      const x = i % w;
      const y = (i / w) | 0;
      // A lamp every few tiles, on the kerb.
      if ((x * 7 + y * 13) % 4 !== 0) continue;
      const lx = x + 0.5 + (y % 2 ? 0.38 : -0.38);
      const ly = y + 0.5 + (x % 2 ? 0.38 : -0.38);
      pos.push(lx, surfaceHeight(map, lx, ly) + 0.55, ly);
    }
    if (this.points) {
      this.group.remove(this.points);
      this.points.geometry.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.group.add(this.points);
  }
}
