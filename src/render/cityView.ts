// Economy game visuals: roads and bridges (merged meshes per 32x32-tile chunk,
// rebuilt when roads change), trucks and crews driving along them (instanced),
// and region borders.

import * as THREE from 'three';
import { GOODS } from '../data/goods.ts';
import { surfaceHeight, groundHeight, type GameMap } from '../sim/map.ts';
import type { World } from '../sim/world.ts';
import { routePoint } from '../sim/city/trade.ts';
import { applyFow, applyOverlay } from './fog.ts';
import { infraTextures } from './textures.ts';

const RCHUNK = 32;
const ROAD_W = 0.36; // half width
const LIFT = 0.05;

/**
 * What each triangle of a road, rail or pipe mesh is made of (a per-vertex
 * attribute): the shader picks its texture detail, roughness and metalness from it.
 */
const SURF = { asphalt: 0, paint: 1, pavement: 2, kerb: 3, deck: 4, ballast: 5, sleeper: 6, steel: 7, concrete: 8, pipe: 9, glow: 10 } as const;
type Surf = (typeof SURF)[keyof typeof SURF];

/** Road condition per tile (red channel, 255 = new), sampled by the road shader to show wear. */
const condUniforms = { uRoadCond: { value: null as THREE.DataTexture | null }, uRoadSize: { value: new THREE.Vector2(1, 1) } };

const INFRA_FRAG = /* glsl */ `
  float infraRough = -1.0;
  float infraMetal = -1.0;
  float infraGlow = 0.0;
  {
    int surf = int(vInfSurf + 0.5);
    vec3 P = vInfPos;
    vec3 fn = normalize(cross(dFdx(P), dFdy(P)));
    bool top = abs(fn.y) > 0.55;
    // Top faces map by xz; sides by their own vertical plane.
    vec2 uv = top ? P.xz : (abs(fn.x) > abs(fn.z) ? vec2(P.z, -P.y) : vec2(P.x, -P.y));
    float grime = texture2D(uInfra, P.xz * 0.09 + 0.17).a;
    vec3 c = diffuseColor.rgb;
    if (surf == ${SURF.asphalt} || surf == ${SURF.paint} || surf == ${SURF.deck}) {
      float grain = texture2D(uInfra, P.xz * 0.5).r;
      float coarse = texture2D(uInfra, P.xz * 0.13 + 0.31).r;
      c *= mix(1.0, grain * 2.0, surf == ${SURF.paint} ? 0.3 : 0.75) * mix(1.0, coarse * 2.0, 0.3);
      c *= 0.86 + 0.28 * grime;
      if (uRoadSize.x > 1.0) {
        float wear = 1.0 - texture2D(uRoadCond, P.xz / uRoadSize).r;
        vec4 W = texture2D(uWear, P.xz * 0.42 + 0.07);
        // Lane paint fades first.
        if (surf == ${SURF.paint}) c = mix(c, vec3(0.3, 0.3, 0.29) * grain * 2.0, smoothstep(0.15, 0.85, wear) * 0.75);
        // Repair patches: darker, fresher tar.
        float patchV = smoothstep(W.r, W.r + 0.04, wear);
        c = mix(c, vec3(0.17, 0.17, 0.165) * mix(1.0, grain * 2.0, 0.5), patchV * 0.9);
        // Badly worn: the surface breaks up to gravel and dirt.
        float dirtN = texture2D(uInfra, P.xz * 0.35 + 0.53).a;
        float worn = clamp((wear - 0.45) * 2.0 - (dirtN - 0.5) * 0.9, 0.0, 1.0);
        float grav = texture2D(uInfra, P.xz * 0.8).g;
        c = mix(c, vec3(0.56, 0.5, 0.41) * mix(1.0, grav * 2.0, 0.6), worn * 0.8);
        // Cracks, then potholes, as wear grows.
        float crack = smoothstep(W.g, W.g + 0.05, wear);
        c *= 1.0 - crack * 0.72 * (1.0 - worn * 0.45);
      }
      infraRough = 0.88;
      infraMetal = 0.0;
    } else if (surf == ${SURF.pavement}) {
      float slab = texture2D(uInfra, P.xz * 1.25).b;
      c *= mix(1.0, slab * 2.0, 0.65) * (0.88 + 0.24 * grime);
      infraRough = 0.85;
      infraMetal = 0.0;
    } else if (surf == ${SURF.kerb} || surf == ${SURF.concrete}) {
      float grain = texture2D(uInfra, uv * 0.6).r;
      c *= mix(1.0, grain * 2.0, 0.22) * (0.84 + 0.32 * grime);
      infraRough = 0.9;
      infraMetal = 0.0;
    } else if (surf == ${SURF.ballast}) {
      float g = texture2D(uInfra, P.xz * 0.7).g;
      float g2 = texture2D(uInfra, P.xz * 0.23 + 0.4).g;
      c *= mix(1.0, g * 2.0, 0.85) * mix(1.0, g2 * 2.0, 0.25) * (0.86 + 0.28 * grime);
      infraRough = 0.95;
      infraMetal = 0.0;
    } else if (surf == ${SURF.sleeper}) {
      float wood = texture2D(uWear, uv * 1.3).a;
      c *= mix(1.0, wood * 2.0, 0.6);
      infraRough = 0.9;
      infraMetal = 0.0;
    } else if (surf == ${SURF.steel}) {
      // Polished running surface on top, rusty web on the sides.
      if (top) {
        c *= 1.2;
        infraRough = 0.28;
        infraMetal = 0.7;
      } else {
        c = mix(c, vec3(0.34, 0.22, 0.15), 0.75) * (0.8 + 0.4 * grime);
        infraRough = 0.85;
        infraMetal = 0.1;
      }
    } else if (surf == ${SURF.pipe}) {
      float m = texture2D(uWear, uv * 0.8).b;
      c *= mix(1.0, m * 2.0, 0.55) * (0.82 + 0.36 * grime);
      infraRough = 0.38;
      infraMetal = 0.45;
    } else if (surf == ${SURF.glow}) {
      infraGlow = 0.7;
    }
    diffuseColor.rgb = c;
  }
`;

/** Detail textures, wear, and per-surface roughness/metalness for road, rail and pipe meshes. */
function applyInfra(material: THREE.MeshStandardMaterial, key: string): void {
  material.onBeforeCompile = (shader) => {
    const [infra, wear] = infraTextures();
    shader.uniforms.uRoadCond = condUniforms.uRoadCond;
    shader.uniforms.uRoadSize = condUniforms.uRoadSize;
    shader.uniforms.uInfra = { value: infra };
    shader.uniforms.uWear = { value: wear };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSurf;\nvarying float vInfSurf;\nvarying vec3 vInfPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvInfPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvInfSurf = aSurf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vInfSurf;\nvarying vec3 vInfPos;\nuniform sampler2D uRoadCond;\nuniform vec2 uRoadSize;\nuniform sampler2D uInfra;\nuniform sampler2D uWear;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${INFRA_FRAG}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (infraRough >= 0.0) roughnessFactor = infraRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (infraMetal >= 0.0) metalnessFactor = infraMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * infraGlow;');
  };
  material.customProgramCacheKey = () => key;
}

const roadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
applyInfra(roadMat, 'infra-road');
applyOverlay(roadMat);
applyFow(roadMat);

const ASPHALT = new THREE.Color(0x4a4a47);
const DECK = new THREE.Color(0x8a8780);
const LINE = new THREE.Color(0xe8e2c8);
const PILLAR = new THREE.Color(0x7a776f);
const PAVEMENT = new THREE.Color(0xa9a69c);
const KERB = new THREE.Color(0xc4c1b8);
/** Pavement each side of the carriageway: width, and the kerb's height above the road. */
const WALK_W = 0.1;
const KERB_H = 0.03;

type XZ = [number, number];
type HFn = (x: number, z: number) => number;

class Builder {
  pos: number[] = [];
  col: number[] = [];
  surfs: number[] = [];
  /** Surface of the triangles added next. */
  surf: Surf = SURF.asphalt;
  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, c: THREE.Color): void {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let i = 0; i < 3; i++) {
      this.col.push(c.r, c.g, c.b);
      this.surfs.push(this.surf);
    }
  }
  /** Quad through four 3D points, wound so it faces along (nx, ny, nz). */
  quad(p: Array<[number, number, number]>, nx: number, ny: number, nz: number, c: THREE.Color): void {
    const [a, b, cc, d] = p as [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
    const dot = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
    if (dot >= 0) {
      this.tri(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2], c);
      this.tri(a[0], a[1], a[2], cc[0], cc[1], cc[2], d[0], d[1], d[2], c);
    } else {
      this.tri(a[0], a[1], a[2], cc[0], cc[1], cc[2], b[0], b[1], b[2], c);
      this.tri(a[0], a[1], a[2], d[0], d[1], d[2], cc[0], cc[1], cc[2], c);
    }
  }
  /** Quad on the ground through 4 xz points (in order round the edge), facing up, heights from h(). */
  flat(pts: XZ[], h: HFn, c: THREE.Color): void {
    this.quad(pts.map(([x, z]) => [x, h(x, z), z] as [number, number, number]), 0, 1, 0, c);
  }
  /** Vertical face along a-b between heights lo() and hi(), facing (nx, nz). */
  wall(a: XZ, b: XZ, lo: HFn, hi: HFn, nx: number, nz: number, c: THREE.Color): void {
    this.quad([[a[0], lo(a[0], a[1]), a[1]], [b[0], lo(b[0], b[1]), b[1]], [b[0], hi(b[0], b[1]), b[1]], [a[0], hi(a[0], a[1]), a[1]]], nx, 0, nz, c);
  }
  /** A block on 4 xz corners (in order round the edge) from lo() up to hi(): top and sides. */
  prism(pts: XZ[], lo: HFn, hi: HFn, c: THREE.Color): void {
    this.flat(pts, hi, c);
    const mx = (pts[0]![0] + pts[1]![0] + pts[2]![0] + pts[3]![0]) / 4;
    const mz = (pts[0]![1] + pts[1]![1] + pts[2]![1] + pts[3]![1]) / 4;
    for (let i = 0; i < 4; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % 4]!;
      this.wall(a, b, lo, hi, (a[0] + b[0]) / 2 - mx, (a[1] + b[1]) / 2 - mz, c);
    }
  }
  box(x: number, y0: number, z: number, sx: number, h: number, sz: number, c: THREE.Color): void {
    const lo = () => y0;
    const hi = () => y0 + h;
    this.prism([[x - sx / 2, z - sz / 2], [x - sx / 2, z + sz / 2], [x + sx / 2, z + sz / 2], [x + sx / 2, z - sz / 2]], lo, hi, c);
  }
  /** A horizontal octagonal tube along x or z from a to b, centred at height y. */
  tube(a: XZ, b: XZ, y: number, r: number, c: THREE.Color, caps = false): void {
    const alongX = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
    const N = 8;
    const ring = (p: XZ, k: number): [number, number, number] => {
      const t = ((k + 0.5) / N) * Math.PI * 2;
      const s = Math.cos(t) * r;
      return alongX ? [p[0], y + Math.sin(t) * r, p[1] + s] : [p[0] + s, y + Math.sin(t) * r, p[1]];
    };
    for (let k = 0; k < N; k++) {
      const t = ((k + 1) / N) * Math.PI * 2;
      const nx = alongX ? 0 : Math.cos(t);
      const nz = alongX ? Math.cos(t) : 0;
      this.quad([ring(a, k), ring(b, k), ring(b, k + 1), ring(a, k + 1)], nx, Math.sin(t), nz, c);
    }
    if (!caps) return;
    for (const [p, sgn] of [[a, -1], [b, 1]] as const) {
      const dir = alongX ? Math.sign(b[0] - a[0]) * sgn : Math.sign(b[1] - a[1]) * sgn;
      for (let k = 1; k < N - 1; k += 2) {
        // Fan of quads (pairs of triangles) across the octagon.
        this.quad([ring(p, 0), ring(p, k), ring(p, k + 1), ring(p, Math.min(N - 1, k + 2))], alongX ? dir : 0, 0, alongX ? 0 : dir, c);
      }
    }
  }
  mesh(material: THREE.Material): THREE.Mesh | null {
    if (!this.pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.surfs, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    return m;
  }
}

/** A small stable hash of a tile and a salt, 0..1 (for per-piece colour variation). */
function hash01(x: number, y: number, s: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + s * 2147483647, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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
    const hk = (x: number, z: number) => h(x, z) + KERB_H;
    const ground = (x: number, z: number) => h(x, z) - LIFT - 0.02;
    const R = ROAD_W;
    const SW = WALK_W;
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
        b.surf = r === 2 ? SURF.deck : SURF.asphalt;
        // Centre square.
        b.flat([[cx - ROAD_W, cz - ROAD_W], [cx - ROAD_W, cz + ROAD_W], [cx + ROAD_W, cz + ROAD_W], [cx + ROAD_W, cz - ROAD_W]], h, col);
        // Arms towards connected neighbours (they meet the neighbour's arm at the tile edge).
        if (n) b.flat([[cx - ROAD_W, ty], [cx - ROAD_W, cz - ROAD_W], [cx + ROAD_W, cz - ROAD_W], [cx + ROAD_W, ty]], h, col);
        if (s) b.flat([[cx - ROAD_W, cz + ROAD_W], [cx - ROAD_W, ty + 1], [cx + ROAD_W, ty + 1], [cx + ROAD_W, cz + ROAD_W]], h, col);
        if (wv) b.flat([[tx, cz - ROAD_W], [tx, cz + ROAD_W], [cx - ROAD_W, cz + ROAD_W], [cx - ROAD_W, cz - ROAD_W]], h, col);
        if (e) b.flat([[cx + ROAD_W, cz - ROAD_W], [cx + ROAD_W, cz + ROAD_W], [tx + 1, cz + ROAD_W], [tx + 1, cz - ROAD_W]], h, col);
        // Centre line on straight stretches.
        const hl = (x: number, z: number) => h(x, z) + 0.006;
        b.surf = SURF.paint;
        if ((n || s) && !(e || wv)) b.flat([[cx - 0.03, ty + 0.15], [cx - 0.03, ty + 0.55], [cx + 0.03, ty + 0.55], [cx + 0.03, ty + 0.15]], hl, LINE);
        if ((e || wv) && !(n || s)) b.flat([[tx + 0.15, cz - 0.03], [tx + 0.15, cz + 0.03], [tx + 0.55, cz + 0.03], [tx + 0.55, cz - 0.03]], hl, LINE);
        if (r === 1) {
          // Pavements with a kerb, wrapping the carriageway's outline. Directions are
          // unit xz vectors; P(d1, a, d2, b) is the point a along d1 and b along d2.
          const arm = { n, s, e, w: wv };
          const D: Record<'n' | 's' | 'e' | 'w', XZ> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
          const P = (d1: XZ, a: number, d2: XZ, bb: number): XZ => [cx + d1[0] * a + d2[0] * bb, cz + d1[1] * a + d2[1] * bb];
          const pave = (d1: XZ, a0: number, a1: number, d2: XZ, b0: number, b1: number) => {
            b.surf = SURF.pavement;
            b.flat([P(d1, a0, d2, b0), P(d1, a0, d2, b1), P(d1, a1, d2, b1), P(d1, a1, d2, b0)], hk, PAVEMENT);
          };
          // A kerb face (towards the road, sign -1) or the pavement's outer edge (sign +1).
          const face = (d1: XZ, a: number, d2: XZ, b0: number, b1: number, sign: 1 | -1) => {
            b.surf = SURF.kerb;
            b.wall(P(d1, a, d2, b0), P(d1, a, d2, b1), sign < 0 ? h : ground, hk, d1[0] * sign, d1[1] * sign, KERB);
          };
          const bridgeAt = (d: XZ) => {
            const x = tx + d[0];
            const y = ty + d[1];
            return x >= 0 && y >= 0 && x < w && y < map.height && road[y * w + x] === 2;
          };
          for (const k of ['n', 's', 'e', 'w'] as const) {
            if (arm[k]) continue;
            const d = D[k];
            const p: XZ = [-d[1], d[0]];
            pave(d, R, R + SW, p, -R, R);
            face(d, R, p, -R, R, -1);
            face(d, R + SW, p, -R, R, 1);
          }
          for (const k1 of ['n', 's'] as const) {
            for (const k2 of ['e', 'w'] as const) {
              const d1 = D[k1];
              const d2 = D[k2];
              const a1 = arm[k1];
              const a2 = arm[k2];
              if (a1) {
                pave(d2, R, R + SW, d1, R, 0.5);
                face(d2, R, d1, R, 0.5, -1);
                face(d2, R + SW, d1, a2 ? R + SW : R, 0.5, 1);
                if (bridgeAt(d1)) face(d1, 0.5, d2, R, R + SW, 1);
              }
              if (a2) {
                pave(d1, R, R + SW, d2, a1 ? R + SW : R, 0.5);
                face(d1, R, d2, R, 0.5, -1);
                face(d1, R + SW, d2, a1 ? R + SW : R, 0.5, 1);
                if (bridgeAt(d2)) face(d2, 0.5, d1, R, R + SW, 1);
              }
              if (!a1 && !a2) {
                pave(d1, R, R + SW, d2, R, R + SW);
                face(d1, R + SW, d2, R, R + SW, 1);
                face(d2, R + SW, d1, R, R + SW, 1);
              }
            }
          }
        }
        b.surf = SURF.concrete;
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
    const m = b.mesh(roadMat);
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
applyInfra(railMat, 'infra-rail');
applyOverlay(railMat);
applyFow(railMat);
const BALLAST = new THREE.Color(0x857d72);
const SLEEPER = new THREE.Color(0x544638);
const SLEEPER_SHADE = new THREE.Color();
const STEEL = new THREE.Color(0xb8bcc0);
const RAIL_LIFT = 0.07;
const GUIDEWAY = new THREE.Color(0xe0e2e4);
const GUIDEWAY_WEB = new THREE.Color(0xb4b6b8);
const MAGSTRIP = new THREE.Color(0x4aa0ff);

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
    const ground = (x: number, z: number) => surfaceHeight(map, x, z) - 0.01;
    const hs0 = (x: number, z: number) => h(x, z) - 0.01;
    const hs = (x: number, z: number) => h(x, z) + 0.025;
    const hr = (x: number, z: number) => h(x, z) + 0.06;
    const gTop = (x: number, z: number) => h(x, z) + 0.12;
    const gUnder = (x: number, z: number) => h(x, z) + 0.075;
    const D: Record<'n' | 's' | 'e' | 'w', XZ> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
    const BW = 0.27; // ballast top half width
    const SH = 0.09; // shoulder, sloping down to the ground
    for (let ty = y0; ty < Math.min(y0 + RCHUNK, map.height); ty++) {
      for (let tx = x0; tx < Math.min(x0 + RCHUNK, w); tx++) {
        const kind = rail[ty * w + tx]!;
        if (!kind) continue;
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
        const has = { n: arms.includes('n'), s: arms.includes('s'), e: arms.includes('e'), w: arms.includes('w') };
        const P = (d1: XZ, a: number, d2: XZ, bb: number): XZ => [cx + d1[0] * a + d2[0] * bb, cz + d1[1] * a + d2[1] * bb];
        const P3 = (d1: XZ, a: number, d2: XZ, bb: number, f: HFn): [number, number, number] => {
          const [x, z] = P(d1, a, d2, bb);
          return [x, f(x, z), z];
        };
        if (kind === 1) {
          // Ballast bed: a flat top over the centre and arms, with sloping shoulders.
          b.surf = SURF.ballast;
          b.flat([[cx - BW, cz - BW], [cx - BW, cz + BW], [cx + BW, cz + BW], [cx + BW, cz - BW]], h, BALLAST);
          const slope = (d1: XZ, a: number, d2: XZ, b0: number, b1: number) =>
            b.quad([P3(d1, a, d2, b0, h), P3(d1, a, d2, b1, h), P3(d1, a + SH, d2, b1, ground), P3(d1, a + SH, d2, b0, ground)], d1[0], 0.6, d1[1], BALLAST);
          for (const k of ['n', 's', 'e', 'w'] as const) {
            const d = D[k];
            const p: XZ = [-d[1], d[0]];
            if (has[k]) b.flat([P(d, BW, p, -BW), P(d, BW, p, BW), P(d, 0.5, p, BW), P(d, 0.5, p, -BW)], h, BALLAST);
            else slope(d, BW, p, -BW, BW);
          }
          for (const k1 of ['n', 's'] as const) {
            for (const k2 of ['e', 'w'] as const) {
              const d1 = D[k1];
              const d2 = D[k2];
              if (has[k1]) slope(d2, BW, d1, BW, 0.5);
              if (has[k2]) slope(d1, BW, d2, BW, 0.5);
              if (!has[k1] && !has[k2]) {
                // Outer corner: a little pyramid face joining the two shoulders.
                const top = P3(d1, BW, d2, BW, h);
                b.quad([top, P3(d1, BW + SH, d2, BW, ground), P3(d1, BW + SH, d2, BW + SH, ground), P3(d1, BW, d2, BW + SH, ground)], d1[0] + d2[0], 0.8, d1[1] + d2[1], BALLAST);
              }
            }
          }
        }
        for (const a of arms) {
          const d = D[a];
          const p: XZ = [-d[1], d[0]];
          const rect = (u0: number, u1: number, v0: number, v1: number): XZ[] => [P(d, u0, p, v0), P(d, u0, p, v1), P(d, u1, p, v1), P(d, u1, p, v0)];
          if (kind === 2) {
            // Maglev: a concrete T-beam guideway on a central web, with a glowing power strip.
            b.surf = SURF.concrete;
            b.prism(rect(0, 0.5, -0.24, 0.24), gUnder, gTop, GUIDEWAY);
            b.prism(rect(0, 0.5, -0.07, 0.07), ground, gUnder, GUIDEWAY_WEB);
            for (const v of [-0.2, 0.2]) b.prism(rect(0, 0.5, v - 0.025, v + 0.025), gTop, (x, z) => gTop(x, z) + 0.025, GUIDEWAY);
            b.surf = SURF.glow;
            b.flat(rect(0, 0.5, -0.04, 0.04), (x, z) => gTop(x, z) + 0.004, MAGSTRIP);
            continue;
          }
          // Sleepers, each a slightly different weathered shade, then the two rails on top.
          b.surf = SURF.sleeper;
          for (const [i, u] of [1 / 12, 3 / 12, 5 / 12].entries()) {
            const t = 0.8 + 0.4 * hash01(tx, ty, i + (a === 'n' || a === 'w' ? 7 : 0));
            b.prism(rect(u - 0.035, u + 0.035, -0.27, 0.27), hs0, hs, SLEEPER_SHADE.copy(SLEEPER).multiplyScalar(t));
          }
          b.surf = SURF.steel;
          for (const v of [-0.15, 0.15]) b.prism(rect(0, 0.5, v - 0.02, v + 0.02), hs, hr, STEEL);
        }
      }
    }
    const m = b.mesh(railMat);
    if (!m) return;
    m.castShadow = true;
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
const bargeGeo = new THREE.BoxGeometry(1.5, 0.22, 0.5).translate(0, 0.08, 0);
const bargeCabGeo = new THREE.BoxGeometry(0.3, 0.25, 0.4).translate(-0.6, 0.32, 0);
const bargeLoadGeo = new THREE.BoxGeometry(0.9, 0.16, 0.4).translate(0.15, 0.27, 0);

export class TrainsView {
  readonly group = new THREE.Group();
  private readonly world: World;
  private cap = 0;
  private loco!: THREE.InstancedMesh;
  private cab!: THREE.InstancedMesh;
  private wagon!: THREE.InstancedMesh;
  private load!: THREE.InstancedMesh;
  private plane!: THREE.InstancedMesh;
  private barge!: THREE.InstancedMesh;
  private bargeCab!: THREE.InstancedMesh;
  private bargeLoad!: THREE.InstancedMesh;

  constructor(world: World) {
    this.world = world;
    this.grow(8);
  }

  private grow(n: number): void {
    for (const m of [this.loco, this.cab, this.wagon, this.load, this.plane, this.barge, this.bargeCab, this.bargeLoad]) if (m) {
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
    this.barge = mk(bargeGeo, 0x5a4a3a, n);
    this.bargeCab = mk(bargeCabGeo, 0xe8e4dc, n);
    this.bargeLoad = mk(bargeLoadGeo, 0xffffff, n);
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
    let nb = 0;
    let nbl = 0;
    for (const t of trains) {
      const f = t.prevPos + (t.pos - t.prevPos) * alpha;
      if (t.boat) {
        place(t.path, f);
        v.y = 0.04;
        m.compose(v, q, one);
        this.barge.setMatrixAt(nb, m);
        this.bargeCab.setMatrixAt(nb, m);
        nb++;
        if (t.good && t.amount > 0) {
          this.bargeLoad.setMatrixAt(nbl, m);
          this.bargeLoad.setColorAt(nbl, c.set(GOODS[t.good].color));
          nbl++;
        }
        continue;
      }
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
    this.barge.count = this.bargeCab.count = nb;
    this.bargeLoad.count = nbl;
    for (const im of [this.loco, this.cab, this.wagon, this.load, this.plane, this.barge, this.bargeCab, this.bargeLoad]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Pipelines: a grey pipe on short posts, joints at bends.

const PIPE_COL = new THREE.Color(0xa4aab0);
const JOINT_COL = new THREE.Color(0x8a9096);
const POST_COL = new THREE.Color(0x5a5f64);
const FOOTING_COL = new THREE.Color(0x9a978f);
const PIPE_H = 0.32;
const PIPE_R = 0.05;

export class PipesView {
  readonly group = new THREE.Group();
  onPipe: (tx: number, ty: number) => void = () => {};
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
    if (!city?.pipe || city.pipeVersion === this.version) return;
    this.version = city.pipeVersion;
    const map = this.world.map;
    const w = map.width;
    const cw = Math.ceil(w / RCHUNK);
    const dirty = new Set<number>();
    for (let i = 0; i < city.pipe.length; i++) {
      if (city.pipe[i] === this.last[i]) continue;
      const tx = i % w;
      const ty = (i - tx) / w;
      if (city.pipe[i]) this.onPipe(tx, ty);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= w || y >= map.height) continue;
        dirty.add(Math.floor(y / RCHUNK) * cw + Math.floor(x / RCHUNK));
      }
    }
    this.last = new Uint8Array(city.pipe);
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
    const pipe = this.world.city!.pipe;
    const w = map.width;
    const x0 = (c % cw) * RCHUNK;
    const y0 = Math.floor(c / cw) * RCHUNK;
    const b = new Builder();
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < map.height && pipe[y * w + x]! > 0;
    for (let ty = y0; ty < Math.min(y0 + RCHUNK, map.height); ty++) {
      for (let tx = x0; tx < Math.min(x0 + RCHUNK, w); tx++) {
        if (!pipe[ty * w + tx]) continue;
        const cx = tx + 0.5;
        const cz = ty + 0.5;
        // Offset towards the tile's north-west corner so it runs beside roads and rails.
        const ox = cx - 0.3;
        const oz = cz - 0.3;
        const base = Math.max(surfaceHeight(map, ox, oz), 0) + LIFT;
        const y = base + PIPE_H;
        const n = at(tx, ty - 1);
        const s = at(tx, ty + 1);
        const e = at(tx + 1, ty);
        const wv = at(tx - 1, ty);
        const yc = y - 0.01; // pipe axis
        // A concrete footing, a steel post and a saddle under the pipe.
        b.surf = SURF.concrete;
        b.box(ox, base - 0.04, oz, 0.13, 0.06, 0.13, FOOTING_COL);
        b.surf = SURF.pipe;
        b.box(ox, base, oz, 0.05, yc - base - PIPE_R, 0.05, POST_COL);
        b.box(ox, yc - PIPE_R - 0.025, oz, 0.13, 0.03, 0.13, POST_COL);
        const straight = (n && s && !e && !wv) || (e && wv && !n && !s);
        if (straight) {
          // Bolted flange where two lengths meet.
          if (e || wv) b.tube([ox - 0.025, oz], [ox + 0.025, oz], yc, PIPE_R * 1.45, PIPE_COL, true);
          else b.tube([ox, oz - 0.025], [ox, oz + 0.025], yc, PIPE_R * 1.45, PIPE_COL, true);
        } else {
          // Bend, tee or end: a cast fitting.
          b.box(ox, yc - 0.075, oz, 0.15, 0.15, 0.15, JOINT_COL);
        }
        if (e) b.tube([ox, oz], [ox + 1, oz], yc, PIPE_R, PIPE_COL);
        if (s) b.tube([ox, oz], [ox, oz + 1], yc, PIPE_R, PIPE_COL);
        if (!(n || s || e || wv)) b.tube([ox - 0.25, oz], [ox + 0.25, oz], yc, PIPE_R, PIPE_COL, true);
      }
    }
    const m = b.mesh(railMat);
    if (!m) return;
    m.castShadow = true;
    this.chunks.set(c, m);
    this.group.add(m);
  }
}
