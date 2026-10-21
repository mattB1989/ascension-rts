// Terrain mesh (low-poly, one colour per tile), map border, trees, rocks and resource spots.

import * as THREE from 'three';
import { fbm, hash2 } from '../sim/rng.ts';
import { groundHeight, Terrain, type GameMap, type TerrainId } from '../sim/map.ts';
import { buildBridges } from './bridges.ts';

/** Two colours per terrain; large-scale noise blends between them. */
const TERRAIN_COLORS: Record<TerrainId, [number, number]> = {
  [Terrain.Deep]: [0x1f3a4d, 0x274656],
  [Terrain.Shallow]: [0x4c8a7f, 0x83a985],
  [Terrain.Beach]: [0xd6c493, 0xe2d3a6],
  [Terrain.Grass]: [0x67913f, 0x8aab55],
  [Terrain.Forest]: [0x456d2c, 0x557f35],
  [Terrain.Rock]: [0x7f796f, 0x968f84],
  [Terrain.Bridge]: [0x4c8a7f, 0x83a985], // seabed under the deck
};

export const BORDER_DEPTH = -3.6;

export class TerrainView {
  readonly group = new THREE.Group();
  /** The ground mesh. */
  readonly mesh: THREE.Mesh;
  /** Everything a click can land on (ground and bridge decks). */
  readonly pickables: THREE.Object3D[];
  private treeSpots: Array<[number, number, number]> = [];
  private treeMeshes: THREE.InstancedMesh[] = [];

  constructor(map: GameMap) {
    this.mesh = this.buildGround(map);
    this.group.add(this.mesh);
    const bridges = buildBridges(map);
    this.group.add(bridges);
    this.pickables = [this.mesh, bridges];
    this.group.add(this.buildSkirt(map));
    this.group.add(this.buildTrees(map));
    this.group.add(this.buildRocks(map));
  }

  private buildGround(map: GameMap): THREE.Mesh {
    const w = map.width;
    const h = map.height;
    const s = w + 1;
    const triCount = w * h * 2;
    const pos = new Float32Array(triCount * 9);
    const col = new Float32Array(triCount * 9);
    const c = new THREE.Color();
    const tmp = new THREE.Color();
    let p = 0;
    const put = (x: number, y: number, z: number) => {
      pos[p] = x;
      pos[p + 1] = y;
      pos[p + 2] = z;
      col[p] = c.r;
      col[p + 1] = c.g;
      col[p + 2] = c.b;
      p += 3;
    };
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = map.terrain[ty * w + tx] as TerrainId;
        const [ca, cb] = TERRAIN_COLORS[t];
        const r = hash2(map.seed + 5, tx, ty);
        const n = fbm(map.seed + 9, tx * 0.07, ty * 0.07, 3);
        c.setHex(ca).lerp(tmp.setHex(cb), Math.min(1, Math.max(0, (n - 0.3) * 2.5)));
        // Height tint: higher ground slightly lighter, deep water darker.
        const e = map.elev[ty * w + tx]!;
        const k = t === Terrain.Deep || t === Terrain.Shallow || t === Terrain.Bridge ? 1 + e * 0.12 : 1 + Math.min(0.25, e * 0.05);
        c.multiplyScalar(k * (0.965 + r * 0.07));
        const h00 = map.velev[ty * s + tx]!;
        const h10 = map.velev[ty * s + tx + 1]!;
        const h01 = map.velev[(ty + 1) * s + tx]!;
        const h11 = map.velev[(ty + 1) * s + tx + 1]!;
        // Alternate the diagonal for a less regular look.
        if ((tx + ty) % 2 === 0) {
          put(tx, h00, ty); put(tx, h01, ty + 1); put(tx + 1, h10, ty);
          put(tx + 1, h10, ty); put(tx, h01, ty + 1); put(tx + 1, h11, ty + 1);
        } else {
          put(tx, h00, ty); put(tx, h01, ty + 1); put(tx + 1, h11, ty + 1);
          put(tx, h00, ty); put(tx + 1, h11, ty + 1); put(tx + 1, h10, ty);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    return mesh;
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

  private buildTrees(map: GameMap): THREE.Group {
    const g = new THREE.Group();
    const spots: Array<[number, number, number]> = [];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const t = map.terrain[ty * map.width + tx];
        const r = hash2(map.seed + 31, tx, ty);
        const n = t === Terrain.Forest ? (r < 0.5 ? 2 : 1) : t === Terrain.Grass && r < 0.012 ? 1 : 0;
        for (let k = 0; k < n; k++) {
          const x = tx + 0.15 + hash2(map.seed + 32 + k, tx, ty) * 0.7;
          const y = ty + 0.15 + hash2(map.seed + 33 + k, tx, ty) * 0.7;
          spots.push([x, y, hash2(map.seed + 34 + k, tx, ty)]);
        }
      }
    }
    const canopyGeo = new THREE.ConeGeometry(0.42, 1.1, 6);
    canopyGeo.translate(0, 0.95, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.45, 5);
    trunkGeo.translate(0, 0.22, 0);
    const canopy = new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), spots.length);
    const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1, flatShading: true }), spots.length);
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    trunk.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const color = new THREE.Color();
    const greens = [0x2f6b34, 0x3b7a3a, 0x27592c, 0x4a8a3c];
    spots.forEach(([x, y, r], i) => {
      const s = 0.8 + r * 0.6;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28);
      v.set(x, groundHeight(map, x, y) - 0.05, y);
      sc.set(s, s * (0.9 + r * 0.4), s);
      m.compose(v, q, sc);
      canopy.setMatrixAt(i, m);
      trunk.setMatrixAt(i, m);
      canopy.setColorAt(i, color.setHex(greens[Math.floor(r * greens.length)]!));
    });
    g.add(canopy, trunk);
    this.treeSpots = spots;
    this.treeMeshes = [canopy, trunk];
    return g;
  }

  /** Remove trees standing inside a building footprint (a building was placed there). */
  clearTrees(tx: number, ty: number, w: number, h: number): void {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let changed = false;
    this.treeSpots.forEach(([x, y], i) => {
      if (x >= tx - 0.2 && x < tx + w + 0.2 && y >= ty - 0.2 && y < ty + h + 0.2) {
        for (const m of this.treeMeshes) m.setMatrixAt(i, zero);
        changed = true;
      }
    });
    if (changed) for (const m of this.treeMeshes) m.instanceMatrix.needsUpdate = true;
  }

  private buildRocks(map: GameMap): THREE.Group {
    const g = new THREE.Group();
    const spots: Array<[number, number, number]> = [];
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (map.terrain[ty * map.width + tx] !== Terrain.Rock) continue;
        const r = hash2(map.seed + 41, tx, ty);
        if (r < 0.45) spots.push([tx + 0.5, ty + 0.5, r]);
      }
    }
    const geo = new THREE.DodecahedronGeometry(0.6, 0);
    const rocks = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a8378, flatShading: true, roughness: 0.95 }), spots.length);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach(([x, y, r], i) => {
      const s = 0.7 + r * 1.6;
      q.setFromEuler(e.set(r * 3, r * 7, r * 5));
      m.compose(new THREE.Vector3(x, groundHeight(map, x, y), y), q, new THREE.Vector3(s, s * 0.8, s));
      rocks.setMatrixAt(i, m);
    });
    g.add(rocks);
    return g;
  }
}
