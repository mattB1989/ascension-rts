// Navigation layers: which tiles each kind of unit can enter.

import type { Domain } from '../data/types.ts';
import { Terrain, type GameMap, type TerrainId } from './map.ts';

export const NavLayer = {
  Land: 0,
  Water: 1,
  Air: 2,
} as const;
export type NavLayerId = (typeof NavLayer)[keyof typeof NavLayer];

export function layerForDomain(domain: Domain): NavLayerId {
  if (domain === 'land') return NavLayer.Land;
  if (domain === 'sea') return NavLayer.Water;
  return NavLayer.Air;
}

export function terrainPassable(layer: NavLayerId, t: TerrainId): boolean {
  switch (layer) {
    case NavLayer.Land:
      return t === Terrain.Grass || t === Terrain.Beach || t === Terrain.Forest;
    case NavLayer.Water:
      return t === Terrain.Shallow || t === Terrain.Deep;
    case NavLayer.Air:
      return true;
  }
}

/** Precomputed passability grids, one byte per tile per layer. */
export class NavGrid {
  readonly width: number;
  readonly height: number;
  private readonly grids: Uint8Array[];

  constructor(map: GameMap) {
    this.width = map.width;
    this.height = map.height;
    this.grids = [NavLayer.Land, NavLayer.Water, NavLayer.Air].map((layer) => {
      const g = new Uint8Array(map.width * map.height);
      for (let i = 0; i < g.length; i++) g[i] = terrainPassable(layer, map.terrain[i] as TerrainId) ? 1 : 0;
      return g;
    });
  }

  passable(layer: NavLayerId, tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return false;
    return this.grids[layer]![ty * this.width + tx] === 1;
  }

  /** Passability at a world position. */
  passableAt(layer: NavLayerId, x: number, y: number): boolean {
    return this.passable(layer, Math.floor(x), Math.floor(y));
  }

  /** Block or unblock a tile on the ground layers (buildings, from M2). */
  setBlocked(tx: number, ty: number, blocked: boolean, baseMap: GameMap): void {
    const i = ty * this.width + tx;
    for (const layer of [NavLayer.Land, NavLayer.Water] as const) {
      this.grids[layer]![i] = blocked ? 0 : terrainPassable(layer, baseMap.terrain[i] as TerrainId) ? 1 : 0;
    }
  }
}
