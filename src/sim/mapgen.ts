// Seeded map generator for the economy game: continents, rivers that really
// drain to the sea, lakes, valleys, floodplains, forests, mountains, deposits
// and regions (provinces). Same seed and options, same map, everywhere: only
// integer hashing and IEEE + - * / sqrt are used.
//
// Steps:
//   1. landness per biome (where the sea is), raw elevation from noise
//   2. priority flood from the sea: every land tile gets a downstream neighbour,
//      depressions fill into lakes
//   3. flow accumulation of rain -> rivers where enough water gathers
//   4. distance to water -> valleys (land slopes down to rivers and coasts)
//   5. terrain types, deposits, regions, start positions

import { fcos, fsin } from './fmath.ts';
import {
  cornerElevations, Deposit, Terrain, type Biome, type GameMap, type RegionInfo, type StartPos, type TerrainId,
} from './map.ts';
import { fbm, hash2 } from './rng.ts';

export type GenBiome = Exclude<Biome, 'twin'>;

export interface MapGenOptions {
  seed: number;
  /** Tiles per side. */
  size: number;
  biome: GenBiome;
  /** Start positions to pick (one per nation), far apart. */
  starts?: number;
}

export const MAP_SIZES = { small: 256, standard: 512 } as const;
export const BIOMES: Record<GenBiome, { name: string; blurb: string }> = {
  temperate: { name: 'Temperate', blurb: 'Green hills, forests and rivers running to the sea.' },
  arid: { name: 'Great River', blurb: 'Desert cut by one great river with fertile banks.' },
  alpine: { name: 'Alpine', blurb: 'Mountains, lakes and narrow valleys.' },
  archipelago: { name: 'Archipelago', blurb: 'Islands of every size: trade goes by sea.' },
};

interface BiomeParams {
  /** Range noise threshold: lower = more of the map has mountain chains. */
  range: number;
  /** Elevation gained per unit of landness (distance inland). */
  slope: number;
  /** Mountains start where ridge noise exceeds this. */
  mountain: number;
  mountainHeight: number;
  hills: number;
  rockLine: number;
  snowLine: number;
  forest: number;
  /** How far (tiles) fertile land reaches from rivers and lakes. */
  fertile: number;
  /** Width (tiles) of the slope from water up to full height. */
  valley: number;
  /** Fraction of total rain that makes a river. */
  river: number;
  dry: boolean;
}

const PARAMS: Record<GenBiome, BiomeParams> = {
  temperate: { range: 0.44, slope: 3, mountain: 0.64, mountainHeight: 6, hills: 1.2, rockLine: 5.2, snowLine: 99, forest: 0.56, fertile: 3, valley: 10, river: 0.011, dry: false },
  arid: { range: 0.6, slope: 2.5, mountain: 0.7, mountainHeight: 5, hills: 0.8, rockLine: 5, snowLine: 99, forest: 0.68, fertile: 7, valley: 16, river: 0.05, dry: true },
  alpine: { range: 0.3, slope: 4, mountain: 0.56, mountainHeight: 9, hills: 1.4, rockLine: 5.4, snowLine: 8, forest: 0.5, fertile: 2, valley: 8, river: 0.01, dry: false },
  archipelago: { range: 0.48, slope: 3, mountain: 0.66, mountainHeight: 5, hills: 1.0, rockLine: 4.6, snowLine: 99, forest: 0.55, fertile: 3, valley: 8, river: 0.012, dry: false },
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Min-heap of tile indices by priority (ties broken by index: deterministic).

class TileHeap {
  private idx: Int32Array;
  private pri: Float64Array;
  size = 0;
  constructor(cap: number) {
    this.idx = new Int32Array(cap);
    this.pri = new Float64Array(cap);
  }
  private less(a: number, b: number): boolean {
    const pa = this.pri[a]!;
    const pb = this.pri[b]!;
    return pa < pb || (pa === pb && this.idx[a]! < this.idx[b]!);
  }
  private swap(a: number, b: number): void {
    const ti = this.idx[a]!;
    this.idx[a] = this.idx[b]!;
    this.idx[b] = ti;
    const tp = this.pri[a]!;
    this.pri[a] = this.pri[b]!;
    this.pri[b] = tp;
  }
  push(i: number, p: number): void {
    if (this.size === this.idx.length) {
      const ni = new Int32Array(this.size * 2);
      ni.set(this.idx);
      const np = new Float64Array(this.size * 2);
      np.set(this.pri);
      this.idx = ni;
      this.pri = np;
    }
    let k = this.size++;
    this.idx[k] = i;
    this.pri[k] = p;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (!this.less(k, parent)) break;
      this.swap(k, parent);
      k = parent;
    }
  }
  /** Pops the smallest; returns its tile index (priority in `lastPriority`). */
  lastPriority = 0;
  pop(): number {
    const top = this.idx[0]!;
    this.lastPriority = this.pri[0]!;
    const n = --this.size;
    if (n > 0) {
      this.idx[0] = this.idx[n]!;
      this.pri[0] = this.pri[n]!;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < n && this.less(l, m)) m = l;
        if (r < n && this.less(r, m)) m = r;
        if (m === k) break;
        this.swap(k, m);
        k = m;
      }
    }
    return top;
  }
}

const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];

// ---------------------------------------------------------------------------
// 1. Where the land is

/** Positive on land, negative at sea, roughly "distance to the coast" in map units. */
function landness(biome: GenBiome, seed: number, u: number, v: number, s: number): number {
  const coastNoise = (fbm(seed + 7, u * 5 * s, v * 5 * s, 5) - 0.5) * 0.32;
  // Ocean side: one of eight directions, from the seed.
  const a = Math.floor(hash2(seed, 3, 4) * 8) * 0.7853981633974483;
  const d = fcos(a) * (u - 0.5) + fsin(a) * (v - 0.5);
  switch (biome) {
    case 'temperate':
      return 0.24 - d + coastNoise;
    case 'arid':
      return 0.33 - d + coastNoise * 0.6;
    case 'alpine':
      return 0.36 - d + coastNoise * 0.7;
    case 'archipelago': {
      // Islands: noise above a threshold, fading out towards the map edges.
      const edge = Math.min(u, v, 1 - u, 1 - v);
      const n = fbm(seed + 13, u * 3.2 * s, v * 3.2 * s, 5);
      return (n - 0.52) * 1.6 + Math.min(0, edge - 0.08) * 2;
    }
  }
}

export function generateMap(opts: MapGenOptions): GameMap {
  const { seed, biome } = opts;
  const P = PARAMS[biome];
  const w = opts.size;
  const h = opts.size;
  const n = w * h;
  const s = w / 256; // feature frequency scale: features keep their size in tiles

  const L = new Float32Array(n);
  const e0 = new Float32Array(n);
  const rain = new Float32Array(n);
  const mount = new Float32Array(n);
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const u = (tx + 0.5) / w;
      const v = (ty + 0.5) / h;
      const i = ty * w + tx;
      const l = landness(biome, seed, u, v, s);
      L[i] = l;
      const hill = fbm(seed + 1, u * 6 * s, v * 6 * s, 4);
      // Mountains: ridged noise, only inside large-scale "range" areas so they form chains.
      const ridge = 1 - Math.abs(2 * fbm(seed + 2, u * 3.5 * s, v * 3.5 * s, 5) - 1);
      const range = smoothstep(P.range, P.range + 0.12, fbm(seed + 4, u * 1.6 * s, v * 1.6 * s, 3));
      let m = (Math.max(0, ridge - P.mountain) / (1 - P.mountain)) * range;
      m *= smoothstep(0.03, 0.15, l); // no mountains right on the coast
      if (biome === 'arid') m = Math.max(m, smoothstep(0.6, 0.9, l) * 0.55 * ridge); // far highlands: the river's source
      mount[i] = m;
      // Land rises steadily inland (so water finds the sea), plus hills and mountains.
      e0[i] = l < 0 ? l * 12 : l * P.slope + hill * P.hills + m * Math.sqrt(m) * P.mountainHeight;
      rain[i] = P.dry ? 0.02 + m * 3 : 0.5 + hill * 0.4 + m * 1.5;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Priority flood: drain every land tile to the sea (or off the map edge).

  const isSea = (i: number) => L[i]! < 0;
  const filled = new Float32Array(n);
  const down = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  const order = new Int32Array(n);
  let orderLen = 0;
  const heap = new TileHeap(1 << 16);
  for (let i = 0; i < n; i++) {
    const tx = i % w;
    const ty = (i - tx) / w;
    const edge = tx === 0 || ty === 0 || tx === w - 1 || ty === h - 1;
    if (isSea(i)) {
      visited[i] = 1;
      filled[i] = e0[i]!;
      // Only sea tiles touching land seed the flood (cheaper, same result).
      let coastal = false;
      for (let k = 0; k < 4; k++) {
        const x = tx + DX4[k]!;
        const y = ty + DY4[k]!;
        if (x >= 0 && y >= 0 && x < w && y < h && !isSea(y * w + x)) coastal = true;
      }
      if (coastal) heap.push(i, e0[i]!);
    } else if (edge) {
      // Rivers may also leave the map, but the sea is preferred.
      visited[i] = 1;
      filled[i] = e0[i]!;
      heap.push(i, e0[i]! + 0.6);
      order[orderLen++] = i;
    }
  }
  while (heap.size > 0) {
    const i = heap.pop();
    const tx = i % w;
    const ty = (i - tx) / w;
    const base = filled[i]!;
    for (let k = 0; k < 4; k++) {
      const x = tx + DX4[k]!;
      const y = ty + DY4[k]!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (visited[j]) continue;
      visited[j] = 1;
      // On flats the flood creeps by a small, smoothly varying step: rivers meander instead of running straight.
      filled[j] = Math.max(e0[j]!, base + 0.0004 + fbm(seed + 17, x * 0.15, y * 0.15, 2) * 0.004);
      down[j] = i;
      order[orderLen++] = j;
      heap.push(j, filled[j]!);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Flow: rain gathers downstream. Upstream tiles were reached later.

  const acc = new Float32Array(n);
  let totalRain = 0;
  for (let k = 0; k < orderLen; k++) {
    const i = order[k]!;
    acc[i] = rain[i]!;
    totalRain += rain[i]!;
  }
  for (let k = orderLen - 1; k >= 0; k--) {
    const i = order[k]!;
    const d = down[i]!;
    if (d >= 0 && !isSea(d)) acc[d] = acc[d]! + acc[i]!;
  }
  const riverT = totalRain * P.river;

  const water = new Uint8Array(n); // 0 land, 1 sea, 2 river, 3 lake
  const waterDepth = new Float32Array(n);
  for (let i = 0; i < n; i++) if (isSea(i)) water[i] = 1;
  // Lakes: depressions the flood had to fill. Big basins stay land (the river crosses them).
  const lakeCand = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!water[i] && filled[i]! - e0[i]! > 0.3) lakeCand[i] = 1;
  const maxLake = Math.round(n * 0.0022);
  const seen = new Uint8Array(n);
  const comp: number[] = [];
  for (let i0 = 0; i0 < n; i0++) {
    if (!lakeCand[i0] || seen[i0]) continue;
    comp.length = 0;
    comp.push(i0);
    seen[i0] = 1;
    for (let q = 0; q < comp.length; q++) {
      const i = comp[q]!;
      const tx = i % w;
      const ty = (i - tx) / w;
      for (let k = 0; k < 4; k++) {
        const x = tx + DX4[k]!;
        const y = ty + DY4[k]!;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = y * w + x;
        if (lakeCand[j] && !seen[j]) {
          seen[j] = 1;
          comp.push(j);
        }
      }
    }
    if (comp.length < 12 || comp.length > maxLake) continue;
    for (const i of comp) {
      water[i] = 3;
      waterDepth[i] = Math.min(1.6, 0.3 + (filled[i]! - e0[i]!) * 0.8);
    }
  }
  // Rivers: carve a channel whose width grows with the flow.
  for (let i = 0; i < n; i++) {
    if (water[i] === 1 || acc[i]! < riverT) continue;
    const width = Math.min(5.5, 1 + 0.6 * Math.sqrt(acc[i]! / riverT - 1));
    const r = (width - 1) * 0.5;
    const tx = i % w;
    const ty = (i - tx) / w;
    const R = Math.ceil(r);
    for (let oy = -R; oy <= R; oy++) {
      for (let ox = -R; ox <= R; ox++) {
        if (ox * ox + oy * oy > r * r + r + 0.25) continue;
        const x = tx + ox;
        const y = ty + oy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const j = y * w + x;
        if (water[j] === 1 || water[j] === 3) continue;
        const centre = ox === 0 && oy === 0;
        const depth = width >= 3.5 && centre ? 1.2 : 0.4;
        if (water[j] !== 2 || depth > waterDepth[j]!) waterDepth[j] = depth;
        water[j] = 2;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Valleys: land rises with distance from any water.

  const distWater = bfsDistance(w, h, (i) => water[i] !== 0, 64);
  const distSea = bfsDistance(w, h, (i) => water[i] === 1, 64);
  const distFresh = bfsDistance(w, h, (i) => water[i] === 2 || water[i] === 3, 64);

  const elev = new Float32Array(n);
  const terrain = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const tx = i % w;
    const ty = (i - tx) / w;
    if (water[i] === 1) {
      elev[i] = Math.max(-3, L[i]! * 26) - 0.1;
      terrain[i] = L[i]! > -0.03 ? Terrain.Shallow : Terrain.Deep;
      continue;
    }
    if (water[i] === 2 || water[i] === 3) {
      elev[i] = -waterDepth[i]!;
      terrain[i] = waterDepth[i]! > 1 ? Terrain.Deep : Terrain.Shallow;
      continue;
    }
    const k = smoothstep(0, P.valley, distWater[i]!);
    const land = Math.max(0, e0[i]!);
    const e = 0.22 + land * (0.25 + 0.75 * k) + mount[i]! * 1.5 * (1 - k);
    elev[i] = e;
    const u = (tx + 0.5) / w;
    const v = (ty + 0.5) / h;
    let t: TerrainId = P.dry ? Terrain.Sand : Terrain.Grass;
    if (e > P.snowLine) t = Terrain.Snow;
    else if (e > P.rockLine || mount[i]! > 0.5) t = Terrain.Rock;
    else if (distSea[i]! <= 1 + Math.floor(hash2(seed + 21, tx >> 2, ty >> 2) * 2) && e < 0.9) t = Terrain.Beach;
    else if (distFresh[i]! <= P.fertile && e < 1.6) t = Terrain.Fertile;
    else {
      const f = fbm(seed + 3, u * 9 * s, v * 9 * s, 4);
      const nearRiver = !P.dry || distFresh[i]! < 14;
      if (nearRiver && f > P.forest) t = Terrain.Forest;
    }
    terrain[i] = t;
  }

  const velev = cornerElevations(elev, w, h);
  const map: GameMap = {
    name: `${BIOMES[biome].name} ${seed}`,
    seed,
    width: w,
    height: h,
    terrain,
    elev,
    velev,
    vsurf: new Float32Array(velev),
    deck: new Float32Array(n),
    bridges: [],
    starts: [],
    resources: [],
    biome,
    deposit: new Uint8Array(n),
    region: new Uint16Array(n),
    regions: [],
    startRegions: [],
    fresh: new Uint8Array(n),
    nearRegion: new Uint16Array(n),
  };
  for (let i = 0; i < n; i++) if (water[i] === 2 || water[i] === 3) map.fresh[i] = 1;
  placeDeposits(map, mount);
  buildRegions(map);
  map.nearRegion = nearestRegion(map, 12);
  pickStarts(map, opts.starts ?? 4);
  return map;
}

/** Region of every tile; water takes the nearest region's id (BFS from land, up to `cap` tiles). */
function nearestRegion(map: GameMap, cap: number): Uint16Array {
  const { width: w, height: h } = map;
  const n = w * h;
  const out = new Uint16Array(map.region);
  const dist = new Uint8Array(n).fill(255);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (out[i]) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    if (dist[i]! >= cap) continue;
    const tx = i % w;
    const ty = (i - tx) / w;
    for (let k = 0; k < 4; k++) {
      const x = tx + DX4[k]!;
      const y = ty + DY4[k]!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (dist[j] !== 255) continue;
      dist[j] = dist[i]! + 1;
      out[j] = out[i]!;
      queue[tail++] = j;
    }
  }
  return out;
}

/** 4-connected BFS distance (tiles) from every source tile, capped. */
function bfsDistance(w: number, h: number, source: (i: number) => boolean, cap: number): Uint8Array {
  const n = w * h;
  const dist = new Uint8Array(n).fill(cap);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (source(i)) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    const d = dist[i]! + 1;
    if (d >= cap) continue;
    const tx = i % w;
    const ty = (i - tx) / w;
    for (let k = 0; k < 4; k++) {
      const x = tx + DX4[k]!;
      const y = ty + DY4[k]!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (dist[j]! <= d) continue;
      dist[j] = d;
      queue[tail++] = j;
    }
  }
  return dist;
}

const buildable = (t: number) => t === Terrain.Grass || t === Terrain.Sand || t === Terrain.Fertile || t === Terrain.Beach;

// ---------------------------------------------------------------------------
// 5a. Deposits: ore in the hills, stone at the foot of the rock, oil in the plains and offshore.

function placeDeposits(map: GameMap, mount: Float32Array): void {
  const { width: w, height: h, seed } = map;
  const cell = 20;
  const blob = (cx: number, cy: number, r: number, kind: number, ok: (i: number) => boolean) => {
    const R = Math.ceil(r);
    for (let oy = -R; oy <= R; oy++) {
      for (let ox = -R; ox <= R; ox++) {
        const x = cx + ox;
        const y = cy + oy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const jitter = hash2(seed + 61, x, y) * 0.9;
        if (ox * ox + oy * oy > r * r + jitter) continue;
        const i = y * w + x;
        if (map.deposit[i] === 0 && ok(i)) map.deposit[i] = kind;
      }
    }
  };
  const nearRock = (i: number, r: number) => {
    const tx = i % w;
    const ty = (i - tx) / w;
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const x = tx + ox;
        const y = ty + oy;
        if (x >= 0 && y >= 0 && x < w && y < h && map.terrain[y * w + x] === Terrain.Rock) return true;
      }
    }
    return false;
  };
  for (let cy = 0; cy < h; cy += cell) {
    for (let cx = 0; cx < w; cx += cell) {
      const gx = cx / cell;
      const gy = cy / cell;
      const px = Math.min(w - 1, cx + Math.floor(hash2(seed + 51, gx, gy) * cell));
      const py = Math.min(h - 1, cy + Math.floor(hash2(seed + 52, gx, gy) * cell));
      const i = py * w + px;
      const t = map.terrain[i]!;
      const roll = hash2(seed + 53, gx, gy);
      if (buildable(t)) {
        const hilly = mount[i]! > 0.02 || map.elev[i]! > 1.3 || nearRock(i, 4);
        const ok = (j: number) => buildable(map.terrain[j]!);
        if (roll < 0.24 && hilly) blob(px, py, 2.6, Deposit.Ore, ok);
        else if (roll < 0.42 && (hilly || nearRock(i, 7))) blob(px, py, 2.3, Deposit.Stone, ok);
        else if (roll < 0.47) blob(px, py, 2, Deposit.Stone, ok);
        else if (roll < 0.5) blob(px, py, 2, Deposit.Ore, ok);
        else if (t !== Terrain.Fertile && roll > 0.88) blob(px, py, 2.4, Deposit.Oil, ok);
      } else if (t === Terrain.Shallow && roll > 0.8) {
        blob(px, py, 2.4, Deposit.Oil, (j) => map.terrain[j] === Terrain.Shallow || map.terrain[j] === Terrain.Deep);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5b. Regions: seeds spread over the land, grown along the ground. Crossing a
// river or a ridge is expensive, so borders follow them.

const SYL_A = ['Al', 'Bren', 'Cor', 'Dal', 'Ev', 'Fen', 'Gar', 'Hal', 'Is', 'Kor', 'Lan', 'Mor', 'Nor', 'Ost', 'Pel', 'Quen', 'Ros', 'Sil', 'Tor', 'Ul', 'Val', 'Wes', 'Yar', 'Zen', 'Bel', 'Car', 'Dun', 'Ker'];
const SYL_B = ['a', 'e', 'i', 'o', 'au', 'ei', 'en', 'ar', 'is', ''];
const SYL_C = ['dor', 'mark', 'holm', 'ia', 'wald', 'ford', 'vale', 'mere', 'stad', 'heim', 'ton', 'gard', 'more', 'lund', 'burg', 'shire'];

export function regionName(seed: number, k: number): string {
  const a = SYL_A[Math.floor(hash2(seed + 71, k, 1) * SYL_A.length)]!;
  const b = SYL_B[Math.floor(hash2(seed + 72, k, 2) * SYL_B.length)]!;
  const c = SYL_C[Math.floor(hash2(seed + 73, k, 3) * SYL_C.length)]!;
  return a + b + c;
}

function buildRegions(map: GameMap): void {
  const { width: w, height: h, seed, terrain } = map;
  const n = w * h;
  const isLandTile = (i: number) => terrain[i] !== Terrain.Deep && terrain[i] !== Terrain.Shallow;
  let landTiles = 0;
  for (let i = 0; i < n; i++) if (isLandTile(i)) landTiles++;
  const target = Math.max(6, Math.round(landTiles / 4200));
  const cell = Math.max(12, Math.floor(Math.sqrt(landTiles / target)));

  // Seeds: one jittered candidate per grid cell, kept if on buildable land and not too close.
  const seeds: number[] = [];
  const minD2 = cell * cell * 0.45;
  for (let cy = 0; cy < h; cy += cell) {
    for (let cx = 0; cx < w; cx += cell) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const x = Math.min(w - 1, cx + Math.floor(hash2(seed + 81 + attempt, cx, cy) * cell));
        const y = Math.min(h - 1, cy + Math.floor(hash2(seed + 91 + attempt, cx, cy) * cell));
        const i = y * w + x;
        if (!buildable(terrain[i]!)) continue;
        if (seeds.some((sI) => {
          const sx = sI % w;
          const sy = (sI - sx) / w;
          return (sx - x) * (sx - x) + (sy - y) * (sy - y) < minD2;
        })) continue;
        seeds.push(i);
        break;
      }
    }
  }

  // Grow: multi-source Dijkstra.
  const owner = new Uint16Array(n);
  const cost = new Float64Array(n).fill(Infinity);
  const heap = new TileHeap(1 << 14);
  seeds.forEach((i, k) => {
    owner[i] = k + 1;
    cost[i] = 0;
    heap.push(i, 0);
  });
  const stepCost = (from: number, to: number) => {
    const t = terrain[to]!;
    if (t === Terrain.Deep || t === Terrain.Shallow) {
      // Open sea is a cheap-ish way to reach islands; rivers and lakes are hard borders.
      return isSeaTile(map, to) ? 5 : 45;
    }
    const climb = Math.abs(map.elev[to]! - map.elev[from]!);
    return (t === Terrain.Rock || t === Terrain.Snow ? 4 : 1) + climb * 6;
  };
  while (heap.size > 0) {
    const i = heap.pop();
    const c = heap.lastPriority;
    if (c > cost[i]!) continue;
    const tx = i % w;
    const ty = (i - tx) / w;
    for (let k = 0; k < 4; k++) {
      const x = tx + DX4[k]!;
      const y = ty + DY4[k]!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      const nc = c + stepCost(i, j);
      if (nc < cost[j]!) {
        cost[j] = nc;
        owner[j] = owner[i]!;
        heap.push(j, nc);
      }
    }
  }
  for (let i = 0; i < n; i++) if (!isLandTile(i)) owner[i] = 0;

  // Merge regions that came out too small into the neighbour they share most border with.
  const count = seeds.length;
  const minSize = (landTiles / Math.max(1, count)) * 0.3;
  const sizes = new Float64Array(count + 1);
  for (let i = 0; i < n; i++) sizes[owner[i]!]!++;
  for (let r = 1; r <= count; r++) {
    if (sizes[r] === 0 || sizes[r]! >= minSize) continue;
    const border = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      if (owner[i] !== r) continue;
      const tx = i % w;
      const ty = (i - tx) / w;
      for (let k = 0; k < 4; k++) {
        const x = tx + DX4[k]!;
        const y = ty + DY4[k]!;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const o = owner[y * w + x]!;
        if (o && o !== r) border.set(o, (border.get(o) ?? 0) + 1);
      }
    }
    let best = 0;
    let bestN = 0;
    for (const [o, c] of [...border].sort((a, b) => a[0] - b[0])) if (c > bestN) [best, bestN] = [o, c];
    if (!best) continue; // an island on its own: keep it
    for (let i = 0; i < n; i++) if (owner[i] === r) owner[i] = best;
    sizes[best]! += sizes[r]!;
    sizes[r] = 0;
  }

  // Renumber 1..k in order of first appearance, and describe each region.
  const ids = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const o = owner[i]!;
    if (o && !ids.has(o)) ids.set(o, ids.size + 1);
  }
  const regions: RegionInfo[] = [];
  for (const id of ids.values()) {
    regions.push({
      id, name: regionName(seed, id), tiles: 0, cx: 0, cy: 0, siteX: -1, siteY: -1, neighbors: [],
      fertile: 0, forest: 0, ore: 0, stone: 0, oil: 0, coast: 0, river: 0,
    });
  }
  const sumX = new Float64Array(regions.length + 1);
  const sumY = new Float64Array(regions.length + 1);
  const nb = regions.map(() => new Set<number>());
  for (let i = 0; i < n; i++) {
    const o = owner[i] ? ids.get(owner[i]!)! : 0;
    map.region[i] = o;
    if (!o) continue;
    const r = regions[o - 1]!;
    const tx = i % w;
    const ty = (i - tx) / w;
    r.tiles++;
    sumX[o]! += tx + 0.5;
    sumY[o]! += ty + 0.5;
    const t = terrain[i]!;
    if (t === Terrain.Fertile) r.fertile++;
    if (t === Terrain.Forest) r.forest++;
    const d = map.deposit[i]!;
    if (d === Deposit.Ore) r.ore++;
    if (d === Deposit.Stone) r.stone++;
    if (d === Deposit.Oil) r.oil++;
    for (let k = 0; k < 4; k++) {
      const x = tx + DX4[k]!;
      const y = ty + DY4[k]!;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      const tj = terrain[j]!;
      if (tj === Terrain.Deep || tj === Terrain.Shallow) {
        if (isSeaTile(map, j)) r.coast++;
        else r.river++;
      }
    }
  }
  // Neighbours: regions touching, or facing each other across a river.
  for (let i = 0; i < n; i++) {
    const tx = i % w;
    const ty = (i - tx) / w;
    const a = map.region[i]!;
    if (!a) continue;
    for (const [ox, oy] of [[1, 0], [0, 1], [3, 0], [0, 3]] as const) {
      const x = tx + ox;
      const y = ty + oy;
      if (x >= w || y >= h) continue;
      const b = map.region[y * w + x]!;
      if (b && b !== a) {
        nb[a - 1]!.add(b);
        nb[b - 1]!.add(a);
      }
    }
  }
  for (const r of regions) {
    r.cx = sumX[r.id]! / Math.max(1, r.tiles);
    r.cy = sumY[r.id]! / Math.max(1, r.tiles);
    r.neighbors = [...nb[r.id - 1]!].sort((a, b) => a - b);
    const site = findSite(map, r.id, r.cx, r.cy, 6);
    if (site) [r.siteX, r.siteY] = site;
  }
  map.regions = regions;
}

/** Open sea (not a river or a lake). */
function isSeaTile(map: GameMap, i: number): boolean {
  const t = map.terrain[i];
  return (t === Terrain.Deep || t === Terrain.Shallow) && map.fresh[i] === 0;
}

/** A clear size x size spot of buildable land in the region, nearest to (cx, cy). */
export function findSite(map: GameMap, region: number, cx: number, cy: number, size: number, maxR = 60): [number, number] | null {
  const { width: w, height: h } = map;
  const fits = (x0: number, y0: number) => {
    if (x0 < 1 || y0 < 1 || x0 + size >= w || y0 + size >= h) return false;
    for (let y = y0; y < y0 + size; y++) {
      for (let x = x0; x < x0 + size; x++) {
        const i = y * w + x;
        if (map.region[i] !== region || !buildable(map.terrain[i]!) || map.deposit[i] !== 0) return false;
      }
    }
    return true;
  };
  const bx = Math.floor(cx - size / 2);
  const by = Math.floor(cy - size / 2);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (fits(bx + dx, by + dy)) return [bx + dx, by + dy];
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5c. Start positions: good regions (farmland, wood, stone or ore, water), far apart.

function pickStarts(map: GameMap, count: number): void {
  const good = map.regions.filter((r) => r.siteX >= 0 && r.tiles > 1500);
  const score = (r: RegionInfo) =>
    Math.min(r.fertile, 400) / 400 + Math.min(r.forest, 300) / 300 + Math.min(r.stone + r.ore, 60) / 60 + (r.coast + r.river > 0 ? 1 : 0) + Math.min(r.tiles, 5000) / 5000;
  const pool = good.length ? good : map.regions.filter((r) => r.siteX >= 0);
  if (!pool.length) {
    map.starts = [{ x: map.width / 2, y: map.height / 2 }];
    return;
  }
  const chosen: RegionInfo[] = [];
  // First: the best region overall, preferring the inner part of the map.
  const centre = (r: RegionInfo) => {
    const dx = r.cx / map.width - 0.5;
    const dy = r.cy / map.height - 0.5;
    return 1 - Math.sqrt(dx * dx + dy * dy);
  };
  chosen.push([...pool].sort((a, b) => score(b) + centre(b) - (score(a) + centre(a)) || a.id - b.id)[0]!);
  while (chosen.length < count && chosen.length < pool.length) {
    let best: RegionInfo | null = null;
    let bestV = -Infinity;
    for (const r of pool) {
      if (chosen.includes(r)) continue;
      let dmin = Infinity;
      for (const c of chosen) dmin = Math.min(dmin, Math.sqrt((r.cx - c.cx) * (r.cx - c.cx) + (r.cy - c.cy) * (r.cy - c.cy)));
      const v = dmin / map.width + score(r) * 0.05;
      if (v > bestV) [best, bestV] = [r, v];
    }
    if (!best) break;
    chosen.push(best);
  }
  map.starts = chosen.map((r): StartPos => ({ x: r.siteX + 3, y: r.siteY + 3 }));
  map.startRegions = chosen.map((r) => r.id);
}
