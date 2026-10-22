// Navigation layers: which tiles each kind of unit can enter.
//   Land  vehicles and mechs: open ground, beaches, bridges. Forest blocks them.
//   Foot  infantry and engineers: as Land, plus forest (slower going).
//   Water ships: open water, and under bridges.
//   Air   aircraft: anywhere.

import type { UnitDef } from '../data/types.ts';
import { Terrain, type GameMap, type TerrainId } from './map.ts';

export const NavLayer = {
  Land: 0,
  Water: 1,
  Air: 2,
  Foot: 3,
} as const;
export type NavLayerId = (typeof NavLayer)[keyof typeof NavLayer];

export const ALL_LAYERS = [NavLayer.Land, NavLayer.Water, NavLayer.Air, NavLayer.Foot] as const;

/** Ground layers share space: their units bump into each other and are blocked by buildings. */
export function isGroundLayer(layer: NavLayerId): boolean {
  return layer === NavLayer.Land || layer === NavLayer.Foot;
}

export function layerFor(def: Pick<UnitDef, 'domain' | 'move'>): NavLayerId {
  if (def.domain === 'sea') return NavLayer.Water;
  if (def.domain === 'air') return NavLayer.Air;
  return def.move === 'infantry' ? NavLayer.Foot : NavLayer.Land;
}

/** Movement cost per tile: 0 = blocked, 1 = normal, 2 = slow (forest on foot). */
export function terrainCost(layer: NavLayerId, t: TerrainId): number {
  switch (layer) {
    case NavLayer.Land:
      return t === Terrain.Grass || t === Terrain.Beach || t === Terrain.Bridge ? 1 : 0;
    case NavLayer.Foot:
      if (t === Terrain.Forest) return 2;
      return t === Terrain.Grass || t === Terrain.Beach || t === Terrain.Bridge ? 1 : 0;
    case NavLayer.Water:
      // Ships pass under bridges.
      return t === Terrain.Shallow || t === Terrain.Deep || t === Terrain.Bridge ? 1 : 0;
    case NavLayer.Air:
      return 1;
  }
}

export function terrainPassable(layer: NavLayerId, t: TerrainId): boolean {
  return terrainCost(layer, t) > 0;
}

/** Speed multiplier on a terrain (infantry push through forest more slowly). */
export const FOREST_SPEED = 0.65;

/** Precomputed cost grids, one byte per tile per layer. */
export class NavGrid {
  readonly width: number;
  readonly height: number;
  private readonly grids: Uint8Array[];
  /** Gate owner + 1 per tile (0: no gate). Gates are open for their owner only. */
  private readonly gates: Uint8Array;

  constructor(map: GameMap) {
    this.width = map.width;
    this.height = map.height;
    this.gates = new Uint8Array(map.width * map.height);
    this.grids = [];
    for (const layer of ALL_LAYERS) {
      const g = new Uint8Array(map.width * map.height);
      for (let i = 0; i < g.length; i++) g[i] = terrainCost(layer, map.terrain[i] as TerrainId);
      this.grids[layer] = g;
    }
  }

  /** Can `player`'s units of this layer enter the tile? (player -1: gates count as closed.) */
  passable(layer: NavLayerId, tx: number, ty: number, player = -1): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
    const i = ty * this.width + tx;
    if (this.grids[layer]![i] === 0) return false;
    const g = this.gates[i]!;
    return g === 0 || g === player + 1 || layer === NavLayer.Air;
  }

  setGate(tx: number, ty: number, owner: number | null): void {
    this.gates[ty * this.width + tx] = owner === null ? 0 : owner + 1;
  }

  /** Gate owner on a tile, or -1. */
  gateAt(tx: number, ty: number): number {
    return (this.gates[ty * this.width + tx] ?? 0) - 1;
  }

  /** Movement cost of a tile (0 = blocked). */
  cost(layer: NavLayerId, tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return 0;
    return this.grids[layer]![ty * this.width + tx]!;
  }

  /** Passability at a world position. */
  passableAt(layer: NavLayerId, x: number, y: number, player = -1): boolean {
    return this.passable(layer, Math.floor(x), Math.floor(y), player);
  }

  /** Block or unblock a tile on the ground and water layers (buildings, ore). */
  setBlocked(tx: number, ty: number, blocked: boolean, baseMap: GameMap): void {
    const i = ty * this.width + tx;
    for (const layer of [NavLayer.Land, NavLayer.Foot, NavLayer.Water] as const) {
      this.grids[layer]![i] = blocked ? 0 : terrainCost(layer, baseMap.terrain[i] as TerrainId);
    }
  }
}
