// Game map: terrain grid, elevations, start positions and resource spots.
// "Twin Shores": two continents facing each other across a sea channel that
// runs from corner to corner, two land bridges, a chain of islands.
// The map is rotationally symmetric (180 degrees) so both sides are equal.

import { fbm, hash2 } from './rng.ts';

export const Terrain = {
  Deep: 0,
  Shallow: 1,
  Beach: 2,
  Grass: 3,
  Forest: 4,
  Rock: 5,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export const TERRAIN_NAMES: Record<TerrainId, string> = {
  0: 'Deep water',
  1: 'Shallow water',
  2: 'Beach',
  3: 'Grassland',
  4: 'Forest',
  5: 'Rock',
};

export type ResourceKind = 'ore' | 'oil';

export interface ResourceSpot {
  kind: ResourceKind;
  /** World coordinates (tile units, tile centre = integer + 0.5). */
  x: number;
  y: number;
  amount: number;
  offshore: boolean;
}

export interface StartPos {
  x: number;
  y: number;
}

export interface GameMap {
  name: string;
  seed: number;
  width: number;
  height: number;
  /** Terrain id per tile, index = y * width + x. */
  terrain: Uint8Array;
  /** Elevation per tile centre. Water is negative, sea level is 0. */
  elev: Float32Array;
  /** Elevation per tile corner, (width+1) x (height+1). Used for rendering and unit heights. */
  velev: Float32Array;
  starts: StartPos[];
  resources: ResourceSpot[];
}

export function tileIndex(map: GameMap, tx: number, ty: number): number {
  return ty * map.width + tx;
}

export function inBounds(map: GameMap, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
}

export function terrainAt(map: GameMap, tx: number, ty: number): TerrainId {
  return map.terrain[ty * map.width + tx] as TerrainId;
}

export function isWater(t: TerrainId): boolean {
  return t === Terrain.Deep || t === Terrain.Shallow;
}

/** Bilinear ground height at a world position (clamped to the map). */
export function groundHeight(map: GameMap, x: number, y: number): number {
  const w = map.width;
  const h = map.height;
  const cx = Math.max(0, Math.min(w - 0.0001, x));
  const cy = Math.max(0, Math.min(h - 0.0001, y));
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  const fx = cx - ix;
  const fy = cy - iy;
  const s = w + 1;
  const a = map.velev[iy * s + ix]!;
  const b = map.velev[iy * s + ix + 1]!;
  const c = map.velev[(iy + 1) * s + ix]!;
  const d = map.velev[(iy + 1) * s + ix + 1]!;
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// ---------------------------------------------------------------------------
// Twin Shores generator

const SQRT1_2 = 0.7071067811865476;

interface Field {
  terrain: TerrainId;
  elev: number;
}

const BASE_U = 0.3; // player 1 base, normalised coordinates (player 2 is mirrored)
const BASE_CLEAR = 0.11; // radius kept flat and clear around a base

/** Land-ness: > 0 is land, < 0 is water. Units: normalised map size. */
function landness(seed: number, u: number, v: number): number {
  const d = (u + v - 1) * SQRT1_2; // signed distance from the diagonal (sea centre line)
  const t = (u - v) * SQRT1_2; // position along the diagonal
  const coast = (fbm(seed, u * 7, v * 7, 4) - 0.5) * 0.07;
  let L = Math.abs(d) - (0.115 + coast);

  // Two land bridges across the sea, at t = +0.33 and t = -0.33.
  for (const tb of [0.33, -0.33]) {
    const wobble = (fbm(seed + 7, u * 12, v * 12, 2) - 0.5) * 0.01;
    L = Math.max(L, 0.026 - Math.abs(t - tb + wobble) * 1.1);
  }

  // Island chain along the centre line.
  const islands: Array<[number, number]> = [
    [0, 0.065],
    [0.17, 0.035],
    [-0.17, 0.035],
    [0.52, 0.04],
    [-0.52, 0.04],
  ];
  for (const [ti, r] of islands) {
    const du = t - ti;
    const dist = Math.sqrt(du * du + d * d);
    const n = (fbm(seed + 11, u * 15, v * 15, 2) - 0.5) * 0.02;
    L = Math.max(L, r - dist + n);
  }
  return L;
}

function fieldAt(seed: number, u: number, v: number): Field {
  const L = landness(seed, u, v);
  if (L < 0) {
    const elev = Math.max(-3, L * 22) - 0.08;
    return { terrain: L > -0.028 ? Terrain.Shallow : Terrain.Deep, elev };
  }
  if (L < 0.011) {
    return { terrain: Terrain.Beach, elev: 0.05 + L * 25 };
  }
  const inland = Math.min(1, (L - 0.011) / 0.06);
  const hills = fbm(seed + 1, u * 5, v * 5, 4);
  let elev = 0.33 + inland * hills * 1.8;

  const du = u - BASE_U;
  const dv = v - BASE_U;
  const baseDist = Math.sqrt(du * du + dv * dv);
  if (baseDist < BASE_CLEAR + 0.05) {
    // Flatten the base area, blending to the surrounding terrain.
    const k = Math.max(0, Math.min(1, (baseDist - BASE_CLEAR) / 0.05));
    elev = 0.6 + (elev - 0.6) * k;
    if (baseDist < BASE_CLEAR) return { terrain: Terrain.Grass, elev };
  }

  const ridge = fbm(seed + 2, u * 6, v * 6, 4);
  if (ridge > 0.66 && L > 0.04) {
    return { terrain: Terrain.Rock, elev: elev + 1.2 + (ridge - 0.66) * 14 };
  }
  const forest = fbm(seed + 3, u * 9, v * 9, 3);
  if (forest > 0.6 && L > 0.025) {
    return { terrain: Terrain.Forest, elev };
  }
  return { terrain: Terrain.Grass, elev };
}

/** Tile whose generated values a tile uses: tiles on the far side mirror the near side. */
function canonical(w: number, h: number, tx: number, ty: number): [number, number] {
  const key = tx + ty - (w - 1);
  const mx = w - 1 - tx;
  const my = h - 1 - ty;
  if (key < 0 || (key === 0 && tx <= mx)) return [tx, ty];
  return [mx, my];
}

function nearestTile(
  map: GameMap,
  x: number,
  y: number,
  ok: (t: TerrainId, tx: number, ty: number) => boolean,
  maxR = 20,
): [number, number] | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (!inBounds(map, tx, ty)) continue;
        if (ok(terrainAt(map, tx, ty), tx, ty)) return [tx, ty];
      }
    }
  }
  return null;
}

export function generateTwinShores(seed = 1337, size = 160): GameMap {
  const w = size;
  const h = size;
  const terrain = new Uint8Array(w * h);
  const elev = new Float32Array(w * h);

  const cache = new Map<number, Field>();
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const [cx, cy] = canonical(w, h, tx, ty);
      const key = cy * w + cx;
      let f = cache.get(key);
      if (!f) {
        f = fieldAt(seed, (cx + 0.5) / w, (cy + 0.5) / h);
        cache.set(key, f);
      }
      terrain[ty * w + tx] = f.terrain;
      elev[ty * w + tx] = f.elev;
    }
  }

  // Corner elevations = average of the surrounding tiles.
  const velev = new Float32Array((w + 1) * (h + 1));
  for (let vy = 0; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      let sum = 0;
      let n = 0;
      for (let oy = -1; oy <= 0; oy++) {
        for (let ox = -1; ox <= 0; ox++) {
          const tx = vx + ox;
          const ty = vy + oy;
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
          sum += elev[ty * w + tx]!;
          n++;
        }
      }
      velev[vy * (w + 1) + vx] = sum / n;
    }
  }

  const starts: StartPos[] = [
    { x: BASE_U * w, y: BASE_U * h },
    { x: w - BASE_U * w, y: h - BASE_U * h },
  ];

  const map: GameMap = { name: 'Twin Shores', seed, width: w, height: h, terrain, elev, velev, starts, resources: [] };
  placeResources(map);
  return map;
}

function placeResources(map: GameMap): void {
  const w = map.width;
  const h = map.height;
  const s = map.starts[0]!;
  const land = (t: TerrainId) => t === Terrain.Grass || t === Terrain.Beach;
  const sea = (t: TerrainId) => t === Terrain.Shallow || t === Terrain.Deep;
  const half: ResourceSpot[] = [];
  const used = new Set<number>();

  const add = (kind: 'ore' | 'oil', x: number, y: number, amount: number, okFn: (t: TerrainId) => boolean) => {
    const found = nearestTile(map, x, y, (t, tx, ty) => okFn(t) && !used.has(ty * w + tx));
    if (!found) return;
    const [tx, ty] = found;
    // Reserve the tile and its neighbours so spots do not overlap.
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) used.add((ty + oy) * w + tx + ox);
    half.push({ kind, x: tx + 0.5, y: ty + 0.5, amount, offshore: sea(terrainAt(map, tx, ty)) });
  };

  const cluster = (x: number, y: number, n: number, amount: number, okFn: (t: TerrainId) => boolean) => {
    for (let i = 0; i < n; i++) {
      const a = hash2(map.seed + 99, Math.floor(x * 10) + i, Math.floor(y * 10)) * 6.283;
      const r = i === 0 ? 0 : 1.6 + hash2(map.seed + 98, i, Math.floor(x)) * 1.2;
      // Math.cos/sin are fine here: map generation output is checked for symmetry, and
      // positions are snapped to tiles, so tiny cross-browser differences cannot leak in.
      add('ore', x + Math.cos(a) * r, y + Math.sin(a) * r, amount, okFn);
    }
  };

  // Home ore fields and land oil, near the player 1 base.
  cluster(s.x - 12, s.y + 6, 5, 1500, land);
  cluster(s.x + 7, s.y - 12, 5, 1500, land);
  add('oil', s.x - 9, s.y - 8, 4000, land);
  add('oil', s.x + 12, s.y + 4, 4000, land);

  // Offshore oil off the home coast, and contested ore at the bridge heads.
  add('oil', 0.39 * w, 0.48 * h, 6000, sea);
  add('oil', 0.48 * w, 0.39 * h, 6000, sea);
  cluster(0.2 * w, 0.6 * h, 3, 2000, land);

  // Island ore: rich, only reachable by sea or air.
  cluster(0.5 * w - 2.5, 0.5 * h - 2.5, 4, 3000, land);
  cluster(0.5 * w + 0.12 * w, 0.5 * h - 0.12 * h, 3, 2500, land);

  map.resources = [];
  for (const r of half) {
    map.resources.push(r);
    map.resources.push({ ...r, x: w - r.x, y: h - r.y });
  }
}
