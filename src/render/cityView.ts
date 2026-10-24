// Economy game visuals: roads and bridges (merged meshes per 32x32-tile chunk,
// rebuilt when roads change), trucks and crews driving along them (instanced),
// and region borders.

import * as THREE from 'three';
import { GOODS } from '../data/goods.ts';
import { surfaceHeight, groundHeight, type GameMap } from '../sim/map.ts';
import type { World } from '../sim/world.ts';
import { routePoint } from '../sim/city/trade.ts';
import { applyFow, applyOverlay } from './fog.ts';

const RCHUNK = 32;
const ROAD_W = 0.36; // half width
const LIFT = 0.05;

const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

/** Road condition per tile (red channel, 255 = new), sampled by the road shader to show wear. */
const condUniforms = { uRoadCond: { value: null as THREE.DataTexture | null }, uRoadSize: { value: new THREE.Vector2(1, 1) } };
roadMat.onBeforeCompile = (shader) => {
  shader.uniforms.uRoadCond = condUniforms.uRoadCond;
  shader.uniforms.uRoadSize = condUniforms.uRoadSize;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vRoadXZ;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvRoadXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vRoadXZ;\nuniform sampler2D uRoadCond;\nuniform vec2 uRoadSize;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      if (uRoadSize.x > 1.0) {
        float cond = texture2D(uRoadCond, vRoadXZ / uRoadSize).r;
        float speck = fract(sin(dot(floor(vRoadXZ * 6.0), vec2(12.9898, 78.233))) * 43758.5453);
        float worn = clamp((1.0 - cond) * 1.3 - speck * 0.35, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.5, 0.41), worn * 0.8);
      }`,
    );
};
roadMat.customProgramCacheKey = () => 'road';
applyOverlay(roadMat);
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

  private condTex: THREE.DataTexture | null = null;
  private condAt = -1;

  /** Copy road condition into the texture the road shader reads (once a second of game time). */
  private updateCondition(): void {
    const city = this.world.city!;
    const map = this.world.map;
    const sec = Math.floor(this.world.tick / 15);
    if (sec === this.condAt) return;
    this.condAt = sec;
    if (!this.condTex) {
      this.condTex = new THREE.DataTexture(new Uint8Array(map.width * map.height * 4), map.width, map.height, THREE.RGBAFormat);
      this.condTex.magFilter = THREE.NearestFilter;
      this.condTex.minFilter = THREE.NearestFilter;
      condUniforms.uRoadCond.value = this.condTex;
      condUniforms.uRoadSize.value.set(map.width, map.height);
    }
    const data = this.condTex.image.data as Uint8Array;
    for (let i = 0; i < city.condition.length; i++) data[i * 4] = Math.round(city.condition[i]! * 255);
    this.condTex.needsUpdate = true;
  }

  update(): void {
    const city = this.world.city;
    if (city) this.updateCondition();
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
    // One line set per colour: borders of owned land in the owner's colour, others faint.
    const byColor = new Map<number, number[]>();
    const w = map.width;
    const ownerOf = (r: number) => (city ? city.regionOwner[r] ?? -1 : -1);
    const y = (x: number, z: number) => Math.max(0, groundHeight(map, x, z)) + 0.12;
    const push = (a: number, b: number, pts: number[]) => {
      const oa = ownerOf(a);
      const ob = ownerOf(b);
      const o = oa === viewer || ob === viewer ? viewer : oa >= 0 ? oa : ob;
      const color = o >= 0 && oa !== ob ? this.world.players[o]?.color ?? 0xfff0b0 : -1;
      const list = byColor.get(color) ?? [];
      list.push(...pts);
      byColor.set(color, list);
    };
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const a = map.region[ty * w + tx]!;
        if (!a) continue;
        if (tx + 1 < w) {
          const b = map.region[ty * w + tx + 1]!;
          if (b && b !== a) push(a, b, [tx + 1, y(tx + 1, ty), ty, tx + 1, y(tx + 1, ty + 1), ty + 1]);
        }
        if (ty + 1 < map.height) {
          const b = map.region[(ty + 1) * w + tx]!;
          if (b && b !== a) push(a, b, [tx, y(tx, ty + 1), ty + 1, tx + 1, y(tx + 1, ty + 1), ty + 1]);
        }
      }
    }
    for (const [color, pts] of byColor) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: color < 0 ? 0xfff0b0 : color, transparent: true, opacity: color < 0 ? 0.35 : 0.95, depthWrite: false }));
      l.renderOrder = 3;
      this.group.add(l);
    }
  }
}

export function mapIsGenerated(map: GameMap): boolean {
  return map.regions.length > 0;
}

// ---------------------------------------------------------------------------
// Overlay marks: translucent coloured boxes around buildings (info views).

const markGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

export class OverlayMarks {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private readonly map: GameMap;

  constructor(map: GameMap) {
    this.map = map;
  }

  set(marks: ReadonlyArray<{ x: number; y: number; w: number; h: number; color: number }>): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = null;
    }
    if (!marks.length) return;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false });
    const mesh = new THREE.InstancedMesh(markGeo, mat, marks.length);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    marks.forEach((k, i) => {
      const base = groundHeight(this.map, k.x + k.w / 2, k.y + k.h / 2);
      const height = 1.2 + Math.min(k.w, k.h) * 0.45;
      m.makeScale(k.w + 0.1, height, k.h + 0.1).setPosition(k.x + k.w / 2, Math.max(0, base), k.y + k.h / 2);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(k.color));
    });
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.group.add(mesh);
  }
}

// ---------------------------------------------------------------------------
// Cargo ships (overseas trade)

const hullGeo = (() => {
  const shape = new THREE.Shape([
    new THREE.Vector2(-1.3, -0.42), new THREE.Vector2(0.9, -0.42), new THREE.Vector2(1.45, 0), new THREE.Vector2(0.9, 0.42), new THREE.Vector2(-1.3, 0.42),
  ]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.12, 0);
  return g;
})();
const bridgeGeo = new THREE.BoxGeometry(0.34, 0.42, 0.62).translate(-1.0, 0.45, 0);
const boxesGeo = new THREE.BoxGeometry(1.5, 0.3, 0.6).translate(0.05, 0.38, 0);

export class ShipsView {
  readonly group = new THREE.Group();
  private readonly world: World;
  private readonly hull: THREE.InstancedMesh;
  private readonly bridge: THREE.InstancedMesh;
  private readonly boxes: THREE.InstancedMesh;

  constructor(world: World) {
    this.world = world;
    const mk = (geo: THREE.BufferGeometry, color: number, n = 16) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, flatShading: true });
      applyFow(material);
      const m = new THREE.InstancedMesh(geo, material, n);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
      return m;
    };
    this.hull = mk(hullGeo, 0x3a4a5a);
    this.bridge = mk(bridgeGeo, 0xeeeeea);
    this.boxes = mk(boxesGeo, 0xffffff);
  }

  update(alpha: number, time: number): void {
    const ships = this.world.city?.ships ?? [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3(1.4, 1.4, 1.4);
    const c = new THREE.Color();
    const palette = [0xc0402a, 0x3a7bd5, 0xe0b23a, 0x5fa043, 0xd070b0];
    let n = 0;
    for (const s of ships) {
      if (n >= 16) break;
      const d = s.prevPos + (s.pos - s.prevPos) * alpha;
      const p = routePoint(s.path, d);
      const heading = s.phase === 'out' ? p.angle + Math.PI : p.angle;
      q.setFromAxisAngle(up, -heading);
      v.set(p.x, 0.05 + Math.sin(time * 1.3 + s.id) * 0.04, p.y);
      m.compose(v, q, sc);
      this.hull.setMatrixAt(n, m);
      this.bridge.setMatrixAt(n, m);
      this.boxes.setMatrixAt(n, m);
      this.boxes.setColorAt(n, c.setHex(palette[s.id % palette.length]!));
      n++;
    }
    for (const im of [this.hull, this.bridge, this.boxes]) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Railways and trains

const railMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
applyOverlay(railMat);
applyFow(railMat);
const BALLAST = new THREE.Color(0x7d766c);
const SLEEPER = new THREE.Color(0x5a4232);
const STEEL = new THREE.Color(0xb8bcc0);
const RAIL_LIFT = 0.07;

export class RailsView {
  readonly group = new THREE.Group();
  onRail: (tx: number, ty: number) => void = () => {};
  private readonly world: World;
  private readonly chunks = new Map<number, THREE.Mesh>();
  private last: Uint8Array;
  private version = -1;
  private roadVersion = -1;

  constructor(world: World) {
    this.world = world;
    this.last = new Uint8Array(world.map.width * world.map.height);
  }

  update(): void {
    const city = this.world.city;
    if (!city?.rail || (city.railVersion === this.version && city.roadVersion === this.roadVersion)) return;
    const map = this.world.map;
    const w = map.width;
    const cw = Math.ceil(w / RCHUNK);
    const dirty = new Set<number>();
    // Bridges change the surface under the track: rebuild every chunk with rails when roads change.
    const all = city.roadVersion !== this.roadVersion && city.railVersion === this.version;
    this.version = city.railVersion;
    this.roadVersion = city.roadVersion;
    for (let i = 0; i < city.rail.length; i++) {
      if (city.rail[i] === this.last[i] && !(all && city.rail[i])) continue;
      const tx = i % w;
      const ty = (i - tx) / w;
      if (city.rail[i]) this.onRail(tx, ty);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= w || y >= map.height) continue;
        dirty.add(Math.floor(y / RCHUNK) * cw + Math.floor(x / RCHUNK));
      }
    }
    this.last = new Uint8Array(city.rail);
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
    const rail = this.world.city!.rail;
    const w = map.width;
    const x0 = (c % cw) * RCHUNK;
    const y0 = Math.floor(c / cw) * RCHUNK;
    const b = new Builder();
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < map.height && rail[y * w + x]! > 0;
    const h = (x: number, z: number) => surfaceHeight(map, x, z) + RAIL_LIFT;
    const hs = (x: number, z: number) => h(x, z) + 0.02;
    const hr = (x: number, z: number) => h(x, z) + 0.05;
    for (let ty = y0; ty < Math.min(y0 + RCHUNK, map.height); ty++) {
      for (let tx = x0; tx < Math.min(x0 + RCHUNK, w); tx++) {
        if (!rail[ty * w + tx]) continue;
        const cx = tx + 0.5;
        const cz = ty + 0.5;
        const n = at(tx, ty - 1);
        const s = at(tx, ty + 1);
        const e = at(tx + 1, ty);
        const wv = at(tx - 1, ty);
        const vertical = (n || s) && !(e || wv);
        const arms: Array<'n' | 's' | 'e' | 'w'> = [];
        if (n) arms.push('n');
        if (s) arms.push('s');
        if (e) arms.push('e');
        if (wv) arms.push('w');
        if (!arms.length) arms.push(...(vertical ? (['n', 's'] as const) : (['e', 'w'] as const)));
        // Ballast bed in the centre, then each arm: ballast, sleepers, two rails.
        const BW = 0.3;
        b.flat([[cx - BW, cz - BW], [cx - BW, cz + BW], [cx + BW, cz + BW], [cx + BW, cz - BW]], h, BALLAST);
        for (const a of arms) {
          const along = a === 'n' || a === 's' ? 'z' : 'x';
          const sign = a === 's' || a === 'e' ? 1 : -1;
          const lo = (u: number, v: number): [number, number] => (along === 'x' ? [cx + sign * u, cz + v] : [cx + v, cz + sign * u]);
          const quad = (u0: number, u1: number, v0: number, v1: number, hh: (x: number, z: number) => number, col: THREE.Color) => {
            const p = [lo(u0, v0), lo(u0, v1), lo(u1, v1), lo(u1, v0)];
            // Keep counter-clockwise winding seen from above.
            const cross = (p[1]![0] - p[0]![0]) * (p[2]![1] - p[0]![1]) - (p[1]![1] - p[0]![1]) * (p[2]![0] - p[0]![0]);
            b.flat(cross > 0 ? p : p.reverse(), hh, col);
          };
          quad(0, 0.5, -BW, BW, h, BALLAST);
          for (const u of [0.12, 0.37]) quad(u - 0.05, u + 0.05, -0.26, 0.26, hs, SLEEPER);
          for (const v of [-0.15, 0.15]) quad(0, 0.5, v - 0.025, v + 0.025, hr, STEEL);
        }
      }
    }
    if (!b.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, railMat);
    m.receiveShadow = true;
    this.chunks.set(c, m);
    this.group.add(m);
  }
}

const locoGeo = new THREE.BoxGeometry(0.9, 0.42, 0.42).translate(0, 0.3, 0);
const locoCabGeo = new THREE.BoxGeometry(0.3, 0.18, 0.4).translate(-0.25, 0.6, 0);
const wagonGeo = new THREE.BoxGeometry(0.85, 0.32, 0.4).translate(0, 0.27, 0);
const loadGeo = new THREE.BoxGeometry(0.75, 0.14, 0.34).translate(0, 0.5, 0);
const CARS = 3;
// A cargo plane: fuselage, wings, tail.
const planeGeo = (() => {
  const parts = [
    new THREE.BoxGeometry(1.6, 0.26, 0.26),
    new THREE.BoxGeometry(0.4, 0.05, 1.8).translate(0.05, 0.02, 0),
    new THREE.BoxGeometry(0.25, 0.04, 0.7).translate(-0.7, 0.05, 0),
    new THREE.BoxGeometry(0.25, 0.35, 0.04).translate(-0.7, 0.2, 0),
  ];
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of parts) {
    const ng = g.toNonIndexed();
    pos.push(...(ng.getAttribute('position').array as Float32Array));
    nor.push(...(ng.getAttribute('normal').array as Float32Array));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
})();
const PLANE_ALT = 5;

export class TrainsView {
  readonly group = new THREE.Group();
  private readonly world: World;
  private cap = 0;
  private loco!: THREE.InstancedMesh;
  private cab!: THREE.InstancedMesh;
  private wagon!: THREE.InstancedMesh;
  private load!: THREE.InstancedMesh;
  private plane!: THREE.InstancedMesh;

  constructor(world: World) {
    this.world = world;
    this.grow(8);
  }

  private grow(n: number): void {
    for (const m of [this.loco, this.cab, this.wagon, this.load, this.plane]) if (m) {
      this.group.remove(m);
      m.dispose();
    }
    this.cap = n;
    const mk = (geo: THREE.BufferGeometry, color: number, count: number) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
      applyFow(material);
      const m = new THREE.InstancedMesh(geo, material, count);
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
      return m;
    };
    this.loco = mk(locoGeo, 0xffffff, n);
    this.cab = mk(locoCabGeo, 0x2a2e33, n);
    this.wagon = mk(wagonGeo, 0x6a5a4a, n * CARS);
    this.load = mk(loadGeo, 0xffffff, n * CARS);
    this.plane = mk(planeGeo, 0xe8ecf0, n);
  }

  update(alpha: number): void {
    const city = this.world.city;
    if (!city?.trains) return;
    const trains = city.trains;
    if (trains.length > this.cap) this.grow(Math.max(trains.length + 8, this.cap * 2));
    const map = this.world.map;
    const w = map.width;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Color();
    // Position and heading at distance f along a path of tiles.
    const place = (path: number[], f: number) => {
      const last = path.length - 1;
      const g = Math.max(0, Math.min(last, f));
      const k = Math.min(last, Math.floor(g));
      const a = path[k]!;
      const bIdx = path[Math.min(last, k + 1)]!;
      const ax = (a % w) + 0.5;
      const ay = Math.floor(a / w) + 0.5;
      const bx = (bIdx % w) + 0.5;
      const by = Math.floor(bIdx / w) + 0.5;
      let dx = bx - ax;
      let dy = by - ay;
      if (dx === 0 && dy === 0) {
        const p = path[Math.max(0, k - 1)]!;
        dx = ax - ((p % w) + 0.5);
        dy = ay - (Math.floor(p / w) + 0.5);
      }
      const fr = g - k;
      const x = ax + (bx - ax) * fr;
      const y = ay + (by - ay) * fr;
      q.setFromAxisAngle(up, Math.atan2(-dy, dx));
      v.set(x, surfaceHeight(map, x, y) + RAIL_LIFT + 0.04, y);
      m.compose(v, q, one);
    };
    let n = 0;
    let nw = 0;
    let nl = 0;
    let np = 0;
    for (const t of trains) {
      const f = t.prevPos + (t.pos - t.prevPos) * alpha;
      if (t.air) {
        // Climb out, cruise, descend.
        place(t.path, f);
        const lastP = t.path.length - 1;
        const climb = Math.min(PLANE_ALT, f * 0.9, (lastP - f) * 0.9);
        v.y += Math.max(0, climb);
        m.compose(v, q, one);
        this.plane.setMatrixAt(np, m);
        this.plane.setColorAt(np, c.setHex(this.world.players[t.owner]?.color ?? 0xe8ecf0).lerp(new THREE.Color(0xffffff), 0.6));
        np++;
        continue;
      }
      place(t.path, f);
      this.loco.setMatrixAt(n, m);
      this.cab.setMatrixAt(n, m);
      const color = this.world.players[t.owner]?.color ?? 0xc04030;
      this.loco.setColorAt(n, c.setHex(color));
      n++;
      for (let k = 1; k <= CARS; k++) {
        place(t.path, f - k * 0.95);
        this.wagon.setMatrixAt(nw++, m);
        if (t.good && t.amount > 0) {
          this.load.setMatrixAt(nl, m);
          this.load.setColorAt(nl, c.set(GOODS[t.good].color));
          nl++;
        }
      }
    }
    this.loco.count = this.cab.count = n;
    this.wagon.count = nw;
    this.load.count = nl;
    this.plane.count = np;
    for (const im of [this.loco, this.cab, this.wagon, this.load, this.plane]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
