// Terrain: low-poly ground (one colour per tile) in 64x64-tile chunks, each with
// three levels of detail, plus trees, rocks and deposit markers per chunk (hidden
// when far away). Chunking keeps 512x512 maps fast: off-screen chunks are culled,
// far chunks draw 4x or 16x fewer triangles.

import * as THREE from 'three';
import { fbm, hash2 } from '../sim/rng.ts';
import { Deposit, groundHeight, Terrain, type GameMap, type TerrainId } from '../sim/map.ts';
import { buildBridges } from './bridges.ts';
import { applyOverlay } from './fog.ts';
import { applyDetail, applyGroundDetail } from './textures.ts';
import { canopyGeometry, TREE_KINDS, treeMaterials, TRUNK_HEIGHT, trunkGeometry, type TreeKind } from './trees.ts';

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
  [Deposit.Rare]: [0x4fb88a, 0.55],
  [Deposit.Uranium]: [0xa8d040, 0.5],
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
  /** Per tree spot: its canopy mesh and index there (the trunk shares the spot's index). */
  treeSlots: Array<[THREE.InstancedMesh, number]>;
  trunks: THREE.InstancedMesh | null;
}

const sharedMaterials = {
  ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8a8378, flatShading: true, roughness: 0.95 }),
  ore: new THREE.MeshStandardMaterial({ color: 0x9a4a32, flatShading: true, roughness: 0.8, metalness: 0.2 }),
  stone: new THREE.MeshStandardMaterial({ color: 0xc9c4ba, flatShading: true, roughness: 0.9 }),
  oil: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.3 }),
  rare: new THREE.MeshStandardMaterial({ color: 0x3fae7e, flatShading: true, roughness: 0.5, metalness: 0.4 }),
  uranium: new THREE.MeshStandardMaterial({ color: 0x9cc83a, flatShading: true, roughness: 0.6, emissive: 0x3a5a10, emissiveIntensity: 0.5 }),
};
applyOverlay(sharedMaterials.ground);
applyDetail(sharedMaterials.rock, 'rock');
applyDetail(sharedMaterials.ore, 'rock');
applyDetail(sharedMaterials.stone, 'rock');

/** A dodecahedron with its corners pushed about, so boulders aren't all the same regular solid. */
function lumpy(r: number, amount: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(r, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const h = (x: number, y: number, z: number, k: number) => {
    const s = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + (seed + k) * 4.581) * 43758.5453;
    return s - Math.floor(s) - 0.5;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    p.setXYZ(i, x + h(x, y, z, 0) * r * amount, y + h(x, y, z, 1) * r * amount, z + h(x, y, z, 2) * r * amount);
  }
  g.computeVertexNormals();
  return g;
}

const rockGeo = lumpy(0.6, 0.42, 1);
const lumpGeo = lumpy(0.28, 0.5, 2);
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
    this.texturize(map);
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

  /** Ground textures: per-tile colour and surface kind as textures the ground shader blends smoothly. */
  private texturize(map: GameMap): void {
    const n = map.width * map.height;
    const rgb = new Uint8Array(n * 4);
    const kind = new Uint8Array(n * 4);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.setRGB(this.colors[i * 3]!, this.colors[i * 3 + 1]!, this.colors[i * 3 + 2]!);
      const hex = c.getHex();
      rgb[i * 4] = (hex >> 16) & 255;
      rgb[i * 4 + 1] = (hex >> 8) & 255;
      rgb[i * 4 + 2] = hex & 255;
      rgb[i * 4 + 3] = 255;
      // Weights: grass, rock, sand (and snow, and the seabed), soil.
      const t = map.terrain[i] as TerrainId;
      const wts =
        t === Terrain.Grass ? [255, 0, 0, 40]
        : t === Terrain.Fertile ? [120, 0, 0, 200]
        : t === Terrain.Forest ? [90, 0, 0, 255]
        : t === Terrain.Rock ? [0, 255, 0, 30]
        : t === Terrain.Snow ? [0, 60, 255, 0]
        : [0, 0, 255, 20];
      kind.set(wts, i * 4);
    }
    const tex = (data: Uint8Array, srgb: boolean) => {
      const tx = new THREE.DataTexture(data, map.width, map.height, THREE.RGBAFormat);
      tx.magFilter = THREE.LinearFilter;
      tx.minFilter = THREE.LinearFilter;
      tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
      if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
      tx.needsUpdate = true;
      return tx;
    };
    applyGroundDetail(sharedMaterials.ground, tex(rgb, true), tex(kind, false), map.width, map.height);
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
    const chunk: Chunk = { x0, y0, size, cx, cz, lod, props, treeSpots: [], treeSlots: [], trunks: null };
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
    // Smooth normals from the height field (the ground reads as rolling land, not facets).
    const nrm = new Float32Array(p);
    for (let k = 0; k < p; k += 3) {
      const vx = Math.round(pos[k]!);
      const vz = Math.round(pos[k + 2]!);
      const gx = (hAt(Math.min(w, vx + 1), vz) - hAt(Math.max(0, vx - 1), vz)) / 2;
      const gz = (hAt(vx, Math.min(map.height, vz + 1)) - hAt(vx, Math.max(0, vz - 1))) / 2;
      const len = Math.sqrt(gx * gx + 1 + gz * gz);
      nrm[k] = -gx / len;
      nrm[k + 1] = 1 / len;
      nrm[k + 2] = -gz / len;
    }
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
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

  /**
   * Trees, instanced per chunk: one mesh per kind for the canopies and one for all
   * the trunks. Forests grow in groves (conifer stands and broadleaf woods, picked by
   * large-scale noise and height); lone trees on open ground are mostly broadleaf.
   */
  private buildTrees(chunk: Chunk): void {
    const map = this.map;
    const spots = chunk.treeSpots;
    const kinds: TreeKind[] = [];
    const dry = map.biome === 'arid';
    const alpine = map.biome === 'alpine';
    for (let ty = chunk.y0; ty < chunk.y0 + chunk.size; ty++) {
      for (let tx = chunk.x0; tx < chunk.x0 + chunk.size; tx++) {
        const i = ty * map.width + tx;
        const t = map.terrain[i];
        if (map.deposit[i]) continue;
        const r = hash2(map.seed + 31, tx, ty);
        const scatter = t === Terrain.Grass ? 0.012 : t === Terrain.Fertile ? 0.006 : 0;
        const n = t === Terrain.Forest ? (r < 0.5 ? 2 : 1) : r < scatter ? 1 : 0;
        if (!n) continue;
        // Groves: conifers where the noise is high (more of them uphill and on alpine maps).
        const grove = fbm(map.seed + 77, tx * 0.045, ty * 0.045, 2) + Math.min(0.25, map.elev[i]! * 0.04) + (alpine ? 0.2 : 0) - (dry ? 0.12 : 0);
        for (let k = 0; k < n; k++) {
          const x = tx + 0.15 + hash2(map.seed + 32 + k, tx, ty) * 0.7;
          const y = ty + 0.15 + hash2(map.seed + 33 + k, tx, ty) * 0.7;
          const rr = hash2(map.seed + 34 + k, tx, ty);
          const pick = hash2(map.seed + 35 + k, tx, ty);
          let kind: TreeKind;
          if (t === Terrain.Forest) {
            // Mixed woodland where the groves meet.
            const conifer = Math.max(0, Math.min(1, (grove - 0.45) / 0.2));
            kind = pick < conifer ? 'conifer' : pick > 0.9 ? 'poplar' : 'broadleaf';
          } else {
            kind = pick < 0.2 ? 'conifer' : pick < 0.45 ? 'poplar' : 'broadleaf';
          }
          spots.push([x, y, rr]);
          kinds.push(kind);
        }
      }
    }
    if (!spots.length) return;
    const mats = treeMaterials();
    const counts = new Map<TreeKind, number>();
    for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
    const canopies = new Map<TreeKind, THREE.InstancedMesh>();
    for (const kind of TREE_KINDS) {
      const c = counts.get(kind);
      if (!c) continue;
      const mesh = new THREE.InstancedMesh(canopyGeometry(kind), kind === 'conifer' ? mats.needles : mats.foliage, c);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      canopies.set(kind, mesh);
    }
    const trunk = new THREE.InstancedMesh(trunkGeometry(), mats.bark, spots.length);
    // Trunks are thin and mostly under the canopy: no shadow pass for them.
    trunk.castShadow = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const color = new THREE.Color();
    const greens: Record<TreeKind, number[]> = dry
      ? { conifer: [0x4f6e3a, 0x5a7840, 0x46643a], broadleaf: [0x7a9244, 0x86984a, 0x6f8a3e, 0x92a050], poplar: [0x8aa04c, 0x96a858] }
      : { conifer: [0x326e40, 0x3c7a48, 0x2b623a, 0x38723f], broadleaf: [0x4e8e3c, 0x5c9a42, 0x467f38, 0x689f44], poplar: [0x74a84a, 0x80b050, 0x689c44] };
    const next = new Map<TreeKind, number>();
    spots.forEach(([x, y, r], i) => {
      const kind = kinds[i]!;
      const mesh = canopies.get(kind)!;
      const idx = next.get(kind) ?? 0;
      next.set(kind, idx + 1);
      const s = 0.8 + r * 0.6;
      const r2 = hash2(map.seed + 36, Math.floor(x * 7), Math.floor(y * 7));
      // A slight lean, a random turn, and (dry maps) broad flat-topped broadleaves.
      e.set((r2 - 0.5) * 0.16, r * 6.28, (r - 0.5) * 0.16);
      q.setFromEuler(e);
      v.set(x, groundHeight(map, x, y) - 0.05, y);
      const wide = dry && kind === 'broadleaf' ? 1.3 : 1;
      sc.set(s * wide * (0.9 + r2 * 0.2), s * (0.9 + r * 0.4) / wide, s * wide * (1.1 - r2 * 0.2));
      m.compose(v, q, sc);
      mesh.setMatrixAt(idx, m);
      const g = greens[kind];
      mesh.setColorAt(idx, color.setHex(g[Math.floor(r2 * g.length) % g.length]!));
      sc.set(s, s * TRUNK_HEIGHT[kind], s);
      m.compose(v, q, sc);
      trunk.setMatrixAt(i, m);
      chunk.treeSlots.push([mesh, idx]);
    });
    for (const mesh of canopies.values()) {
      mesh.computeBoundingSphere();
      chunk.props.add(mesh);
    }
    trunk.computeBoundingSphere();
    chunk.props.add(trunk);
    chunk.trunks = trunk;
  }

  /** Rocks on rocky ground, lumps on ore and stone deposits, pools on oil. */
  private buildScatter(chunk: Chunk): void {
    const map = this.map;
    const kinds: Record<string, Array<[number, number, number]>> = { rock: [], ore: [], stone: [], oil: [], rare: [], uranium: [] };
    for (let ty = chunk.y0; ty < chunk.y0 + chunk.size; ty++) {
      for (let tx = chunk.x0; tx < chunk.x0 + chunk.size; tx++) {
        const i = ty * map.width + tx;
        const r = hash2(map.seed + 41, tx, ty);
        if (map.terrain[i] === Terrain.Rock && r < 0.45) kinds.rock!.push([tx + 0.5, ty + 0.5, r]);
        const d = map.deposit[i];
        if (d === Deposit.Ore && r < 0.5) kinds.ore!.push([tx + 0.3 + r * 0.4, ty + 0.5, r]);
        if (d === Deposit.Stone && r < 0.45) kinds.stone!.push([tx + 0.5, ty + 0.3 + r * 0.4, r]);
        if (d === Deposit.Oil && r < 0.22) kinds.oil!.push([tx + 0.5, ty + 0.5, r]);
        if (d === Deposit.Rare && r < 0.45) kinds.rare!.push([tx + 0.4 + r * 0.3, ty + 0.5, r]);
        if (d === Deposit.Uranium && r < 0.4) kinds.uranium!.push([tx + 0.5, ty + 0.4 + r * 0.3, r]);
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
    make(kinds.rare!, lumpGeo, sharedMaterials.rare, 0.9);
    make(kinds.uranium!, lumpGeo, sharedMaterials.uranium, 0.8);
  }

  /** Remove trees standing inside a footprint (a building or road was placed there). */
  clearTrees(tx: number, ty: number, w: number, h: number): void {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const c of this.chunks) {
      if (tx + w < c.x0 - 1 || ty + h < c.y0 - 1 || tx > c.x0 + c.size + 1 || ty > c.y0 + c.size + 1) continue;
      const changed = new Set<THREE.InstancedMesh>();
      c.treeSpots.forEach(([x, y], i) => {
        if (x >= tx - 0.2 && x < tx + w + 0.2 && y >= ty - 0.2 && y < ty + h + 0.2) {
          const [mesh, idx] = c.treeSlots[i]!;
          mesh.setMatrixAt(idx, zero);
          changed.add(mesh);
          if (c.trunks) {
            c.trunks.setMatrixAt(i, zero);
            changed.add(c.trunks);
          }
        }
      });
      for (const m of changed) m.instanceMatrix.needsUpdate = true;
    }
  }
}
