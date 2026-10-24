// Game map: terrain grid, elevations, start positions and resource spots.
// "Twin Shores": two continents facing each other across a sea channel that
// runs from corner to corner, two bridges across it, a chain of islands.
// Bridges are their own terrain type: land units drive over them and ships pass
// underneath, so they never cut the sea in two.
// The map is rotationally symmetric (180 degrees) so both sides are equal.

import { fcos, fsin } from './fmath.ts';
import { fbm, hash2 } from './rng.ts';

export const Terrain = {
  Deep: 0,
  Shallow: 1,
  Beach: 2,
  Grass: 3,
  Forest: 4,
  Rock: 5,
  Bridge: 6,
  /** Dry ground (arid maps): buildable, poor for farming. */
  Sand: 7,
  /** River floodplain: buildable, the best farmland. */
  Fertile: 8,
  /** High peaks: impassable, like rock. */
  Snow: 9,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export const TERRAIN_NAMES: Record<TerrainId, string> = {
  0: 'Deep water',
  1: 'Shallow water',
  2: 'Beach',
  3: 'Grassland',
  4: 'Forest',
  5: 'Rock',
  6: 'Bridge',
  7: 'Sand',
  8: 'Fertile land',
  9: 'Snow',
};

export type ResourceKind = 'ore' | 'oil';

/** Underground deposits on generated maps (one per tile). Mines, quarries and wells sit on them. */
export const Deposit = { None: 0, Ore: 1, Oil: 2, Stone: 3 } as const;
export type DepositId = (typeof Deposit)[keyof typeof Deposit];
export const DEPOSIT_NAMES: Record<DepositId, string> = { 0: '', 1: 'Iron ore', 2: 'Oil', 3: 'Stone' };

export type Biome = 'twin' | 'temperate' | 'arid' | 'alpine' | 'archipelago';

/** A province: the unit of ownership on generated maps. */
export interface RegionInfo {
  /** 1-based (0 on the region grid means "no region": open water). */
  id: number;
  name: string;
  tiles: number;
  /** Centroid of its land. */
  cx: number;
  cy: number;
  /** Top-left tile of a clear 6x6 spot near the centre (for a town hall), or -1. */
  siteX: number;
  siteY: number;
  neighbors: number[];
  /** What the land offers (tile counts). */
  fertile: number;
  forest: number;
  ore: number;
  stone: number;
  oil: number;
  coast: number;
  river: number;
  /** Touches water connected to the open sea (a trade port can go here). */
  ocean: boolean;
}

export interface ResourceSpot {
  kind: ResourceKind;
  /** World coordinates (tile units, tile centre = integer + 0.5). */
  x: number;
  y: number;
  amount: number;
  offshore: boolean;
}

/**
 * A straight bridge running along the (1, 1) diagonal. Positions along it are
 * measured as p = (x + y) / sqrt(2); across it as q = (x - y) / sqrt(2).
 */
export interface BridgeInfo {
  /** Which bridge: sign of (x - y) of its tiles. */
  side: number;
  pStart: number;
  pEnd: number;
  /** Centre line, across the bridge. */
  q: number;
  /** Half the deck width, in tiles. */
  halfWidth: number;
}

export const BRIDGE_PEAK = 1.6;

/** Deck height at position p along a bridge: ramps up from both ends to the peak. */
export function bridgeDeckHeight(b: BridgeInfo, p: number): number {
  const fromEnd = Math.min(p - b.pStart, b.pEnd - p);
  return Math.max(0.3, Math.min(BRIDGE_PEAK, 0.3 + 0.32 * fromEnd));
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
  /** Surface land units stand on, per tile corner: like velev, but bridge decks instead of the seabed. */
  vsurf: Float32Array;
  /** Bridge deck height per tile (0 where there is no bridge). */
  deck: Float32Array;
  bridges: BridgeInfo[];
  starts: StartPos[];
  resources: ResourceSpot[];
  biome: Biome;
  /** Deposit per tile (generated maps). */
  deposit: Uint8Array;
  /** Region id per tile, 0 for none. */
  region: Uint16Array;
  regions: RegionInfo[];
  /** Region each start position is in (generated maps). */
  startRegions: number[];
  /** 1 on river and lake tiles (fresh water), 0 elsewhere. */
  fresh: Uint8Array;
  /** Region of each tile, or for water the nearest region within 12 tiles (0: none). For visibility. */
  nearRegion: Uint16Array;
}

/** Land you can build on and drive over. */
export function isOpenLand(t: TerrainId): boolean {
  return t === Terrain.Grass || t === Terrain.Beach || t === Terrain.Sand || t === Terrain.Fertile;
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

/** Corner elevations = average of the surrounding tiles. */
export function cornerElevations(elev: Float32Array, w: number, h: number): Float32Array {
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
  return velev;
}

function bilinear(grid: Float32Array, map: GameMap, x: number, y: number): number {
  const w = map.width;
  const h = map.height;
  const cx = Math.max(0, Math.min(w - 0.0001, x));
  const cy = Math.max(0, Math.min(h - 0.0001, y));
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  const fx = cx - ix;
  const fy = cy - iy;
  const s = w + 1;
  const a = grid[iy * s + ix]!;
  const b = grid[iy * s + ix + 1]!;
  const c = grid[(iy + 1) * s + ix]!;
  const d = grid[(iy + 1) * s + ix + 1]!;
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** Bilinear terrain height at a world position (seabed under water). */
export function groundHeight(map: GameMap, x: number, y: number): number {
  return bilinear(map.velev, map, x, y);
}

/** Height a land unit stands at: the terrain, or the deck on bridges. */
export function surfaceHeight(map: GameMap, x: number, y: number): number {
  return bilinear(map.vsurf, map, x, y);
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

/** Two bridges cross the sea, at t = +0.33 and t = -0.33 along the channel. */
const BRIDGES_T = [0.33, -0.33];
const BRIDGE_HALF_WIDTH = 0.0165; // ~5 tiles wide

function onBridge(u: number, v: number): boolean {
  const t = (u - v) * SQRT1_2;
  return BRIDGES_T.some((tb) => Math.abs(t - tb) < BRIDGE_HALF_WIDTH);
}

function fieldAt(seed: number, u: number, v: number): Field {
  const L = landness(seed, u, v);
  if (L < 0) {
    const elev = Math.max(-3, L * 22) - 0.08;
    if (onBridge(u, v)) return { terrain: Terrain.Bridge, elev };
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

function measureBridges(terrain: Uint8Array, w: number, h: number): BridgeInfo[] {
  const out: BridgeInfo[] = [];
  for (const side of [1, -1]) {
    let pMin = Infinity;
    let pMax = -Infinity;
    let qSum = 0;
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (terrain[i] !== Terrain.Bridge) continue;
      const cx = (i % w) + 0.5;
      const cy = Math.floor(i / w) + 0.5;
      if (Math.sign(cx - cy) !== side) continue;
      const p = (cx + cy) * SQRT1_2;
      pMin = Math.min(pMin, p);
      pMax = Math.max(pMax, p);
      qSum += (cx - cy) * SQRT1_2;
      n++;
    }
    if (n === 0) continue;
    // Extend a little onto each shore so the ramps meet the land.
    out.push({ side, pStart: pMin - 1, pEnd: pMax + 1, q: qSum / n, halfWidth: BRIDGE_HALF_WIDTH * w + 0.45 });
  }
  return out;
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

  const velev = cornerElevations(elev, w, h);

  // Bridges: one straight deck per bridge, rising from each shore to a peak so
  // ships fit underneath. Tiles get the deck height of the profile at their centre.
  const bridges = measureBridges(terrain, w, h);
  const deck = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (terrain[i] !== Terrain.Bridge) continue;
    const cx = (i % w) + 0.5;
    const cy = Math.floor(i / w) + 0.5;
    const b = bridges.find((br) => Math.sign(cx - cy) === br.side)!;
    deck[i] = bridgeDeckHeight(b, (cx + cy) * SQRT1_2);
  }

  const vsurf = new Float32Array(velev);
  for (let vy = 0; vy <= h; vy++) {
    for (let vx = 0; vx <= w; vx++) {
      let sum = 0;
      let n = 0;
      for (let oy = -1; oy <= 0; oy++) {
        for (let ox = -1; ox <= 0; ox++) {
          const tx = vx + ox;
          const ty = vy + oy;
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
          const d = deck[ty * w + tx]!;
          if (d > 0) {
            sum += d;
            n++;
          }
        }
      }
      if (n > 0) vsurf[vy * (w + 1) + vx] = sum / n;
    }
  }

  const starts: StartPos[] = [
    { x: BASE_U * w, y: BASE_U * h },
    { x: w - BASE_U * w, y: h - BASE_U * h },
  ];

  const map: GameMap = {
    name: 'Twin Shores', seed, width: w, height: h, terrain, elev, velev, vsurf, deck, bridges, starts, resources: [],
    biome: 'twin', deposit: new Uint8Array(w * h), region: new Uint16Array(w * h), regions: [], startRegions: [], fresh: new Uint8Array(w * h), nearRegion: new Uint16Array(w * h),
  };
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
      add('ore', x + fcos(a) * r, y + fsin(a) * r, amount, okFn);
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
