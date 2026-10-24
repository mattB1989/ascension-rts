// Economy game visuals: roads and bridges (merged meshes per 32x32-tile chunk,
// rebuilt when roads change), trucks and crews driving along them (instanced),
// and region borders.

import * as THREE from 'three';
import { GOODS } from '../data/goods.ts';
import { surfaceHeight, groundHeight, type GameMap } from '../sim/map.ts';
import type { World } from '../sim/world.ts';
import { applyFow } from './fog.ts';

const RCHUNK = 32;
const ROAD_W = 0.36; // half width
const LIFT = 0.05;

const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
applyFow(roadMat);

const ASPHALT = new THREE.Color(0x4a4a47);
const DECK = new THREE.Color(0x8a8780);
const LINE = new THREE.Color(0xe8e2c8);
const PILLAR = new THREE.Color(0x7a776f);

class Builder {
  pos: number[] = [];
  col: number[] = [];
  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, c: THREE.Color): void {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let i = 0; i < 3; i++) this.col.push(c.r, c.g, c.b);
  }
  /** Quad on the ground through 4 xz points (counter-clockwise seen from above), heights from h(). */
  flat(pts: Array<[number, number]>, h: (x: number, z: number) => number, c: THREE.Color): void {
    const [a, b, cc, d] = pts.map(([x, z]) => [x, h(x, z), z] as const);
    this.tri(a![0], a![1], a![2], b![0], b![1], b![2], cc![0], cc![1], cc![2], c);
    this.tri(a![0], a![1], a![2], cc![0], cc![1], cc![2], d![0], d![1], d![2], c);
  }
  box(x: number, y0: number, z: number, sx: number, h: number, sz: number, c: THREE.Color): void {
    const x0 = x - sx / 2;
    const x1 = x + sx / 2;
    const z0 = z - sz / 2;
    const z1 = z + sz / 2;
    const y1 = y0 + h;
    const q = (p: number[][]) => {
      const [a, b, cc, d] = p as [number[], number[], number[], number[]];
      this.tri(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, cc[0]!, cc[1]!, cc[2]!, c);
      this.tri(a[0]!, a[1]!, a[2]!, cc[0]!, cc[1]!, cc[2]!, d[0]!, d[1]!, d[2]!, c);
    };
    q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
    q([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
    q([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]);
    q([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
  }
  mesh(): THREE.Mesh | null {
    if (!this.pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, roadMat);
    m.receiveShadow = true;
    return m;
  }
}

export class RoadsView {
  readonly group = new THREE.Group();
  /** Called for every tile that got a road (the terrain clears trees there). */
  onRoad: (tx: number, ty: number) => void = () => {};
  private readonly world: World;
  private readonly chunks = new Map<number, THREE.Mesh>();
  private last: Uint8Array;
  private version = -1;

  constructor(world: World) {
    this.world = world;
    this.last = new Uint8Array(world.map.width * world.map.height);
  }

  update(): void {
    const city = this.world.city;
    if (!city || city.roadVersion === this.version) return;
    this.version = city.roadVersion;
    const map = this.world.map;
    const w = map.width;
    const cw = Math.ceil(w / RCHUNK);
    const dirty = new Set<number>();
    for (let i = 0; i < city.road.length; i++) {
      if (city.road[i] === this.last[i]) continue;
      const tx = i % w;
      const ty = (i - tx) / w;
      if (city.road[i]) this.onRoad(tx, ty);
      // Neighbouring chunks too: a tile's arms reach its neighbours' edges.
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= w || y >= map.height) continue;
        dirty.add(Math.floor(y / RCHUNK) * cw + Math.floor(x / RCHUNK));
      }
    }
    this.last = new Uint8Array(city.road);
    for (const c of dirty) this.rebuild(c, cw);
  }

  private rebuild(c: number, cw: number): void {
    const old = this.chunks.get(c);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      this.chunks.delete(c);
    }
    const map = this.world.map;
    const road = this.world.city!.road;
    const w = map.width;
    const x0 = (c % cw) * RCHUNK;
    const y0 = Math.floor(c / cw) * RCHUNK;
    const b = new Builder();
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < map.height && road[y * w + x]! > 0;
    const h = (x: number, z: number) => surfaceHeight(map, x, z) + LIFT;
    for (let ty = y0; ty < Math.min(y0 + RCHUNK, map.height); ty++) {
      for (let tx = x0; tx < Math.min(x0 + RCHUNK, w); tx++) {
        const r = road[ty * w + tx]!;
        if (!r) continue;
        const cx = tx + 0.5;
        const cz = ty + 0.5;
        const col = r === 2 ? DECK : ASPHALT;
        const n = at(tx, ty - 1);
        const s = at(tx, ty + 1);
        const e = at(tx + 1, ty);
        const wv = at(tx - 1, ty);
        // Centre square.
        b.flat([[cx - ROAD_W, cz - ROAD_W], [cx - ROAD_W, cz + ROAD_W], [cx + ROAD_W, cz + ROAD_W], [cx + ROAD_W, cz - ROAD_W]], h, col);
        // Arms towards connected neighbours (they meet the neighbour's arm at the tile edge).
        if (n) b.flat([[cx - ROAD_W, ty], [cx - ROAD_W, cz - ROAD_W], [cx + ROAD_W, cz - ROAD_W], [cx + ROAD_W, ty]], h, col);
        if (s) b.flat([[cx - ROAD_W, cz + ROAD_W], [cx - ROAD_W, ty + 1], [cx + ROAD_W, ty + 1], [cx + ROAD_W, cz + ROAD_W]], h, col);
        if (wv) b.flat([[tx, cz - ROAD_W], [tx, cz + ROAD_W], [cx - ROAD_W, cz + ROAD_W], [cx - ROAD_W, cz - ROAD_W]], h, col);
        if (e) b.flat([[cx + ROAD_W, cz - ROAD_W], [cx + ROAD_W, cz + ROAD_W], [tx + 1, cz + ROAD_W], [tx + 1, cz - ROAD_W]], h, col);
        // Centre line on straight stretches.
        const hl = (x: number, z: number) => h(x, z) + 0.006;
        if ((n || s) && !(e || wv)) b.flat([[cx - 0.03, ty + 0.15], [cx - 0.03, ty + 0.55], [cx + 0.03, ty + 0.55], [cx + 0.03, ty + 0.15]], hl, LINE);
        if ((e || wv) && !(n || s)) b.flat([[tx + 0.15, cz - 0.03], [tx + 0.15, cz + 0.03], [tx + 0.55, cz + 0.03], [tx + 0.55, cz - 0.03]], hl, LINE);
        if (r === 2) {
          // Bridge: a pillar down to the riverbed and low parapets.
          const deck = surfaceHeight(map, cx, cz);
          const bed = groundHeight(map, cx, cz);
          if ((tx + ty) % 2 === 0) b.box(cx, bed, cz, 0.22, deck - bed, 0.22, PILLAR);
          const along = n || s ? 'z' : 'x';
          for (const side of [-1, 1]) {
            if (along === 'z') b.box(cx + side * (ROAD_W + 0.03), deck, cz, 0.06, 0.16, 1, DECK);
            else b.box(cx, deck, cz + side * (ROAD_W + 0.03), 1, 0.16, 0.06, DECK);
          }
        }
      }
    }
    const m = b.mesh();
    if (m) {
      this.chunks.set(c, m);
      this.group.add(m);
    }
  }
}

// ---------------------------------------------------------------------------
// Trucks

const bodyGeo = new THREE.BoxGeometry(0.42, 0.2, 0.22).translate(0, 0.16, 0);
const cabGeo = new THREE.BoxGeometry(0.16, 0.2, 0.22).translate(0.27, 0.2, 0);
const cargoGeo = new THREE.BoxGeometry(0.38, 0.14, 0.2).translate(-0.02, 0.33, 0);

export class TrucksView {
  readonly group = new THREE.Group();
  private readonly world: World;
  private cap = 0;
  private body!: THREE.InstancedMesh;
  private cab!: THREE.InstancedMesh;
  private cargo!: THREE.InstancedMesh;

  constructor(world: World) {
    this.world = world;
    this.grow(64);
  }

  private grow(n: number): void {
    for (const m of [this.body, this.cab, this.cargo]) if (m) {
      this.group.remove(m);
      m.dispose();
    }
    this.cap = n;
    const mk = (geo: THREE.BufferGeometry, color: number) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });
      applyFow(material);
      const m = new THREE.InstancedMesh(geo, material, n);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
      return m;
    };
    this.body = mk(bodyGeo, 0xffffff);
    this.cab = mk(cabGeo, 0xdcdcdc);
    this.cargo = mk(cargoGeo, 0xffffff);
  }

  update(alpha: number): void {
    const city = this.world.city;
    if (!city) return;
    const trucks = city.trucks;
    if (trucks.length > this.cap) this.grow(Math.max(trucks.length + 32, this.cap * 2));
    const map = this.world.map;
    const w = map.width;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Color();
    let n = 0;
    let nc = 0;
    for (const t of trucks) {
      if (t.phase === 'working') continue;
      const f = t.prevPos + (t.pos - t.prevPos) * alpha;
      const last = t.path.length - 1;
      const k = Math.min(last, Math.floor(f));
      const a = t.path[k]!;
      const bIdx = t.path[Math.min(last, k + 1)]!;
      const ax = (a % w) + 0.5;
      const ay = Math.floor(a / w) + 0.5;
      const bx = (bIdx % w) + 0.5;
      const by = Math.floor(bIdx / w) + 0.5;
      const fr = f - k;
      let dx = bx - ax;
      let dy = by - ay;
      if (dx === 0 && dy === 0) {
        const p = t.path[Math.max(0, k - 1)]!;
        dx = ax - ((p % w) + 0.5);
        dy = ay - (Math.floor(p / w) + 0.5);
      }
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // Drive on the right.
      const x = ax + (bx - ax) * fr - (dy / len) * 0.16;
      const y = ay + (by - ay) * fr + (dx / len) * 0.16;
      q.setFromAxisAngle(up, Math.atan2(-dy, dx));
      v.set(x, surfaceHeight(map, x, y) + LIFT, y);
      m.compose(v, q, one);
      this.body.setMatrixAt(n, m);
      this.cab.setMatrixAt(n, m);
      this.body.setColorAt(n, c.setHex(t.kind === 'crew' ? 0xe0b23a : 0xe8e8e4));
      this.cab.setColorAt(n, c.setHex(t.kind === 'crew' ? 0xc08a20 : 0x3a6fb0));
      if (t.good && t.amount > 0) {
        this.cargo.setMatrixAt(nc, m);
        this.cargo.setColorAt(nc, c.set(GOODS[t.good].color));
        nc++;
      }
      n++;
    }
    this.body.count = n;
    this.cab.count = n;
    this.cargo.count = nc;
    for (const im of [this.body, this.cab, this.cargo]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Region borders: a thin line where regions meet; yours in your colour.

export class RegionBorders {
  readonly group = new THREE.Group();
  private readonly world: World;
  private sig = '';

  constructor(world: World) {
    this.world = world;
  }

  update(viewer: number): void {
    const city = this.world.city;
    const map = this.world.map;
    if (!map.regions.length) return;
    const sig = city ? Array.from(city.regionOwner).join(',') : '';
    if (sig === this.sig) return;
    this.sig = sig;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      (c as THREE.LineSegments).geometry.dispose();
    }
    const owned: number[] = [];
    const other: number[] = [];
    const w = map.width;
    const own = (r: number) => !!city && r > 0 && city.regionOwner[r] === viewer;
    const y = (x: number, z: number) => Math.max(0, groundHeight(map, x, z)) + 0.12;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const a = map.region[ty * w + tx]!;
        if (!a) continue;
        if (tx + 1 < w) {
          const b = map.region[ty * w + tx + 1]!;
          if (b && b !== a) (own(a) !== own(b) ? owned : other).push(tx + 1, y(tx + 1, ty), ty, tx + 1, y(tx + 1, ty + 1), ty + 1);
        }
        if (ty + 1 < map.height) {
          const b = map.region[(ty + 1) * w + tx]!;
          if (b && b !== a) (own(a) !== own(b) ? owned : other).push(tx, y(tx, ty + 1), ty + 1, tx + 1, y(tx + 1, ty + 1), ty + 1);
        }
      }
    }
    const mk = (pts: number[], color: number, opacity: number) => {
      if (!pts.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      l.renderOrder = 3;
      this.group.add(l);
    };
    mk(other, 0xfff0b0, 0.35);
    mk(owned, this.world.players[viewer]?.color ?? 0x3a7bd5, 0.95);
  }
}

export function mapIsGenerated(map: GameMap): boolean {
  return map.regions.length > 0;
}
