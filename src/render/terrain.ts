// Terrain: low-poly ground (one colour per tile) in 64x64-tile chunks, each with
// three levels of detail, plus trees, rocks and deposit markers per chunk (hidden
// when far away). Chunking keeps 512x512 maps fast: off-screen chunks are culled,
// far chunks draw 4x or 16x fewer triangles.

import * as THREE from 'three';
import { fbm, hash2 } from '../sim/rng.ts';
import { Deposit, groundHeight, Terrain, type GameMap, type TerrainId } from '../sim/map.ts';
import { buildBridges } from './bridges.ts';
import { applyOverlay } from './fog.ts';

/** Two colours per terrain; large-scale noise blends between them. */
const TERRAIN_COLORS: Record<TerrainId, [number, number]> = {
  [Terrain.Deep]: [0x1f3a4d, 0x274656],
  [Terrain.Shallow]: [0x4c8a7f, 0x83a985],
  [Terrain.Beach]: [0xd6c493, 0xe2d3a6],
  [Terrain.Grass]: [0x67913f, 0x8aab55],
  [Terrain.Forest]: [0x456d2c, 0x557f35],
  [Terrain.Rock]: [0x7f796f, 0x968f84],
  [Terrain.Bridge]: [0x4c8a7f, 0x83a985], // seabed under the deck
  [Terrain.Sand]: [0xd4b77c, 0xe0c891],
  [Terrain.Fertile]: [0x7fa83f, 0x95b84a],
  [Terrain.Snow]: [0xe8edf0, 0xf6f8fa],
};

/** Deposits tint the ground so they can be spotted from afar. */
const DEPOSIT_TINT: Record<number, [number, number]> = {
  [Deposit.Ore]: [0xa0553a, 0.55],
  [Deposit.Stone]: [0xbdb8ae, 0.6],
  [Deposit.Oil]: [0x2a2622, 0.55],
};

export const BORDER_DEPTH = -3.6;
export const CHUNK = 64;
/** Beyond this distance from the camera, trees and props are hidden. */
const PROP_DISTANCE = 190;

interface Chunk {
  x0: number;
  y0: number;
  size: number;
  cx: number;
  cz: number;
  lod: THREE.LOD;
  props: THREE.Group;
  treeSpots: Array<[number, number, number]>;
  treeMeshes: THREE.InstancedMesh[];
}

const sharedMaterials = {
  ground: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }),
  canopy: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8a8378, flatShading: true, roughness: 0.95 }),
  ore: new THREE.MeshStandardMaterial({ color: 0x9a4a32, flatShading: true, roughness: 0.8, metalness: 0.2 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xc9c4ba, flatShading: true, roughness: 0.9 }),
  oil: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.3 }),
};
applyOverlay(sharedMaterials.ground);

const canopyGeo = new THREE.ConeGeometry(0.42, 1.1, 6).translate(0, 0.95, 0);
const trunkGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.45, 5).translate(0, 0.22, 0);
const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
const lumpGeo = new THREE.DodecahedronGeometry(0.28, 0);
const poolGeo = new THREE.CircleGeometry(0.42, 8).rotateX(-Math.PI / 2);

export class TerrainView {
  readonly group = new THREE.Group();
  /** Objects a click can land on besides the heightfield (bridge decks). */
  readonly pickables: THREE.Object3D[];
  private readonly chunks: Chunk[] = [];
  private readonly map: GameMap;
  /** Per-tile ground colour (r, g, b). */
  private readonly colors: Float32Array;

  constructor(map: GameMap) {
    this.map = map;
    this.colors = this.tileColors(map);
    for (let y0 = 0; y0 < map.height; y0 += CHUNK) {
      for (let x0 = 0; x0 < map.width; x0 += CHUNK) this.chunks.push(this.buildChunk(x0, y0));
    }
    const bridges = buildBridges(map);
    this.group.add(bridges);
    this.pickables = [bridges];
    this.group.add(this.buildSkirt(map));
  }

  /** Show props only near the camera. Call every frame. */
  update(camera: THREE.Camera): void {
    const p = camera.position;
    for (const c of this.chunks) {
      const dx = p.x - c.cx;
      const dz = p.z - c.cz;
      const d = Math.sqrt(dx * dx + dz * dz + p.y * p.y * 0.3);
      c.props.visible = d < PROP_DISTANCE + c.size * 0.7;
    }
  }

  private tileColors(map: GameMap): Float32Array {
    const n = map.width * map.height;
    const out = new Float32Array(n * 3);
    const c = new THREE.Color();
    const tmp = new THREE.Color();
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const i = ty * map.width + tx;
        const t = map.terrain[i] as TerrainId;
        const [ca, cb] = TERRAIN_COLORS[t];
        const r = hash2(map.seed + 5, tx, ty);
        const nz = fbm(map.seed + 9, tx * 0.07, ty * 0.07, 3);
        c.setHex(ca).lerp(tmp.setHex(cb), Math.min(1, Math.max(0, (nz - 0.3) * 2.5)));
        const d = map.deposit[i]!;
        if (d) c.lerp(tmp.setHex(DEPOSIT_TINT[d]![0]), DEPOSIT_TINT[d]![1]);
        // Height tint: higher ground slightly lighter, deep water darker.
        const e = map.elev[i]!;
        const water = t === Terrain.Deep || t === Terrain.Shallow || t === Terrain.Bridge;
        const k = water ? 1 + e * 0.12 : 1 + Math.min(0.25, e * 0.04);
        c.multiplyScalar(k * (0.965 + r * 0.07));
        out[i * 3] = c.r;
        out[i * 3 + 1] = c.g;
        out[i * 3 + 2] = c.b;
      }
    }
    return out;
  }

  private buildChunk(x0: number, y0: number): Chunk {
    const map = this.map;
    const size = Math.min(CHUNK, map.width - x0, map.height - y0);
    const lod = new THREE.LOD();
    const cx = x0 + size / 2;
    const cz = y0 + size / 2;
    lod.position.set(cx, 0, cz);
    const levels: Array<[number, number]> = [[1, 0], [2, 150], [4, 300]];
    for (const [step, dist] of levels) {
      if (step > size) continue;
      const mesh = new THREE.Mesh(this.groundGeometry(x0, y0, size, step), sharedMaterials.ground);
      mesh.position.set(-cx, 0, -cz);
      mesh.receiveShadow = step === 1;
      mesh.name = 'ground';
      const holder = new THREE.Group();
      holder.add(mesh);
      lod.addLevel(holder, dist);
    }
    this.group.add(lod);
    const props = new THREE.Group();
    const chunk: Chunk = { x0, y0, size, cx, cz, lod, props, treeSpots: [], treeMeshes: [] };
    this.buildTrees(chunk);
    this.buildScatter(chunk);
    this.group.add(props);
    return chunk;
  }

  private groundGeometry(x0: number, y0: number, size: number, step: number): THREE.BufferGeometry {
    const map = this.map;
    const w = map.width;
    const s = w + 1;
    const cells = Math.ceil(size / step);
    const skirt = cells * 4 * 2;
    const triCount = cells * cells * 2 + skirt;
    const pos = new Float32Array(triCount * 9);
    const col = new Float32Array(triCount * 9);
    let p = 0;
    let cr = 0;
    let cg = 0;
    let cb = 0;
    const put = (x: number, y: number, z: number) => {
      pos[p] = x;
      pos[p + 1] = y;
      pos[p + 2] = z;
      col[p] = cr;
      col[p + 1] = cg;
      col[p + 2] = cb;
      p += 3;
    };
    const hAt = (x: number, y: number) => map.velev[Math.min(map.height, y) * s + Math.min(w, x)]!;
    const blockColor = (tx: number, ty: number) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = ty; y < Math.min(ty + step, map.height); y++) {
        for (let x = tx; x < Math.min(tx + step, map.width); x++) {
          const i = (y * w + x) * 3;
          r += this.colors[i]!;
          g += this.colors[i + 1]!;
          b += this.colors[i + 2]!;
          n++;
        }
      }
      cr = r / n;
      cg = g / n;
      cb = b / n;
    };
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const tx = x0 + cx * step;
        const ty = y0 + cy * step;
        const tx1 = Math.min(tx + step, x0 + size);
        const ty1 = Math.min(ty + step, y0 + size);
        blockColor(tx, ty);
        const h00 = hAt(tx, ty);
        const h10 = hAt(tx1, ty);
        const h01 = hAt(tx, ty1);
        const h11 = hAt(tx1, ty1);
        // Alternate the diagonal for a less regular look.
        if (((tx + ty) / step) % 2 === 0) {
          put(tx, h00, ty); put(tx, h01, ty1); put(tx1, h10, ty);
          put(tx1, h10, ty); put(tx, h01, ty1); put(tx1, h11, ty1);
        } else {
          put(tx, h00, ty); put(tx, h01, ty1); put(tx1, h11, ty1);
          put(tx, h00, ty); put(tx1, h11, ty1); put(tx1, h10, ty);
        }
      }
    }
    // Skirts: short walls hanging from each chunk edge hide cracks between levels of detail.
    const drop = 1.2;
    const edge = (ax: number, az: number, bx: number, bz: number, ctx: number, cty: number) => {
      blockColor(ctx, cty);
      const ha = hAt(ax, az);
      const hb = hAt(bx, bz);
      put(ax, ha, az); put(ax, ha - drop, az); put(bx, hb, bz);
      put(bx, hb, bz); put(ax, ha - drop, az); put(bx, hb - drop, bz);
    };
    for (let k = 0; k < cells; k++) {
      const a = Math.min(x0 + k * step, x0 + size);
      const b = Math.min(a + step, x0 + size);
      edge(a, y0, b, y0, a, y0);
      edge(b, y0 + size, a, y0 + size, a, y0 + size - 1);
      const c = Math.min(y0 + k * step, y0 + size);
      const d = Math.min(c + step, y0 + size);
      edge(x0, d, x0, c, x0, c);
      edge(x0 + size, c, x0 + size, d, x0 + size - 1, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, p), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, p), 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  /** Vertical walls around the map edge and a dark floor beyond, so the map reads as a table. */
  private buildSkirt(map: GameMap): THREE.Group {
    const g = new THREE.Group();
    const w = map.width;
    const h = map.height;
    const s = w + 1;
    const pos: number[] = [];
    const edge = (x0: number, z0: number, y0: number, x1: number, z1: number, y1: number) => {
      pos.push(x0, y0, z0, x0, BORDER_DEPTH, z0, x1, y1, z1);
      pos.push(x1, y1, z1, x0, BORDER_DEPTH, z0, x1, BORDER_DEPTH, z1);
    };
    for (let i = 0; i < w; i++) {
      edge(i + 1, 0, map.velev[i + 1]!, i, 0, map.velev[i]!);
      edge(i, h, map.velev[h * s + i]!, i + 1, h, map.velev[h * s + i + 1]!);
    }
    for (let j = 0; j < h; j++) {
      edge(0, j, map.velev[j * s]!, 0, j + 1, map.velev[(j + 1) * s]!);
      edge(w, j + 1, map.velev[(j + 1) * s + w]!, w, j, map.velev[j * s + w]!);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3b3328, roughness: 1, side: THREE.DoubleSide })));
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 6, h * 6).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0f151c, roughness: 1 }),
    );
    floor.position.set(w / 2, BORDER_DEPTH, h / 2);
    g.add(floor);
    return g;
  }

  private buildTrees(chunk: Chunk): void {
    const map = this.map;
    const spots = chunk.treeSpots;
    const dry = map.biome === 'arid';
    for (let ty = chunk.y0; ty < chunk.y0 + chunk.size; ty++) {
      for (let tx = chunk.x0; tx < chunk.x0 + chunk.size; tx++) {
        const i = ty * map.width + tx;
        const t = map.terrain[i];
        if (map.deposit[i]) continue;
        const r = hash2(map.seed + 31, tx, ty);
        const scatter = t === Terrain.Grass ? 0.012 : t === Terrain.Fertile ? 0.006 : 0;
        const n = t === Terrain.Forest ? (r < 0.5 ? 2 : 1) : r < scatter ? 1 : 0;
        for (let k = 0; k < n; k++) {
          const x = tx + 0.15 + hash2(map.seed + 32 + k, tx, ty) * 0.7;
          const y = ty + 0.15 + hash2(map.seed + 33 + k, tx, ty) * 0.7;
          spots.push([x, y, hash2(map.seed + 34 + k, tx, ty)]);
        }
      }
    }
    if (!spots.length) return;
    const canopy = new THREE.InstancedMesh(canopyGeo, sharedMaterials.canopy, spots.length);
    const trunk = new THREE.InstancedMesh(trunkGeo, sharedMaterials.trunk, spots.length);
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    trunk.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    const greens = dry ? [0x5f7a34, 0x6f8a3a, 0x4f6a2c, 0x7a8f40] : [0x2f6b34, 0x3b7a3a, 0x27592c, 0x4a8a3c];
    spots.forEach(([x, y, r], i) => {
      const s = 0.8 + r * 0.6;
      q.setFromAxisAngle(up, r * 6.28);
      v.set(x, groundHeight(map, x, y) - 0.05, y);
      sc.set(s, s * (0.9 + r * 0.4), s);
      m.compose(v, q, sc);
      canopy.setMatrixAt(i, m);
      trunk.setMatrixAt(i, m);
      canopy.setColorAt(i, color.setHex(greens[Math.floor(r * greens.length)]!));
    });
    canopy.computeBoundingSphere();
    trunk.computeBoundingSphere();
    chunk.props.add(canopy, trunk);
    chunk.treeMeshes = [canopy, trunk];
  }

  /** Rocks on rocky ground, lumps on ore and stone deposits, pools on oil. */
  private buildScatter(chunk: Chunk): void {
    const map = this.map;
    const kinds: Record<string, Array<[number, number, number]>> = { rock: [], ore: [], stone: [], oil: [] };
    for (let ty = chunk.y0; ty < chunk.y0 + chunk.size; ty++) {
      for (let tx = chunk.x0; tx < chunk.x0 + chunk.size; tx++) {
        const i = ty * map.width + tx;
        const r = hash2(map.seed + 41, tx, ty);
        if (map.terrain[i] === Terrain.Rock && r < 0.45) kinds.rock!.push([tx + 0.5, ty + 0.5, r]);
        const d = map.deposit[i];
        if (d === Deposit.Ore && r < 0.5) kinds.ore!.push([tx + 0.3 + r * 0.4, ty + 0.5, r]);
        if (d === Deposit.Stone && r < 0.45) kinds.stone!.push([tx + 0.5, ty + 0.3 + r * 0.4, r]);
        if (d === Deposit.Oil && r < 0.22) kinds.oil!.push([tx + 0.5, ty + 0.5, r]);
      }
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const make = (spots: Array<[number, number, number]>, geo: THREE.BufferGeometry, mat: THREE.Material, scale: number, flat = false) => {
      if (!spots.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
      mesh.castShadow = !flat;
      mesh.receiveShadow = true;
      spots.forEach(([x, y, r], i) => {
        const s = scale * (0.7 + r * 1.6);
        q.setFromEuler(flat ? e.set(0, r * 7, 0) : e.set(r * 3, r * 7, r * 5));
        const water = map.terrain[Math.floor(y) * map.width + Math.floor(x)] === Terrain.Shallow || map.terrain[Math.floor(y) * map.width + Math.floor(x)] === Terrain.Deep;
        v.set(x, water ? 0.02 : groundHeight(map, x, y) + (flat ? 0.04 : 0), y);
        sc.set(s, flat ? 1 : s * 0.8, s);
        m.compose(v, q, sc);
        mesh.setMatrixAt(i, m);
      });
      mesh.computeBoundingSphere();
      chunk.props.add(mesh);
    };
    make(kinds.rock!, rockGeo, sharedMaterials.rock, 1);
    make(kinds.ore!, lumpGeo, sharedMaterials.ore, 1);
    make(kinds.stone!, lumpGeo, sharedMaterials.stone, 1.1);
    make(kinds.oil!, poolGeo, sharedMaterials.oil, 1, true);
  }

  /** Remove trees standing inside a footprint (a building or road was placed there). */
  clearTrees(tx: number, ty: number, w: number, h: number): void {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const c of this.chunks) {
      if (tx + w < c.x0 - 1 || ty + h < c.y0 - 1 || tx > c.x0 + c.size + 1 || ty > c.y0 + c.size + 1) continue;
      let changed = false;
      c.treeSpots.forEach(([x, y], i) => {
        if (x >= tx - 0.2 && x < tx + w + 0.2 && y >= ty - 0.2 && y < ty + h + 0.2) {
          for (const m of c.treeMeshes) m.setMatrixAt(i, zero);
          changed = true;
        }
      });
      if (changed) for (const m of c.treeMeshes) m.instanceMatrix.needsUpdate = true;
    }
  }
}
