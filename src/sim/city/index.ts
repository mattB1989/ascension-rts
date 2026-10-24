// Economy game: commands and the starting setup.

import { BUILDINGS, type BuildingTypeId } from '../../data/buildings.ts';
import { START_CREDITS, START_STOCK } from '../../data/city.ts';
import { updateFog } from '../fog.ts';
import { generateMap, type GenBiome } from '../mapgen.ts';
import type { GameMap } from '../map.ts';
import { World, type PlayerInfo } from '../world.ts';
import { exploreRegion } from './economy.ts';
import { addCityBuilding, demolish, placeCityBuilding, stockUp } from './place.ts';
import { placeRoads, removeRoads, setRoad } from './roads.ts';
import { createCityState } from './state.ts';

export type CityCommand =
  /** Lay roads along these tiles (as far as credits allow). */
  | { kind: 'road'; player: number; tiles: Array<[number, number]> }
  /** Remove roads from these tiles. */
  | { kind: 'unroad'; player: number; tiles: Array<[number, number]> }
  /** Place a building (economy game). */
  | { kind: 'place'; player: number; building: BuildingTypeId; tx: number; ty: number }
  /** Place a row of buildings (houses along a street). */
  | { kind: 'placeMany'; player: number; building: BuildingTypeId; spots: Array<[number, number]> }
  | { kind: 'demolish'; player: number; building: number }
  | { kind: 'taxRate'; player: number; rate: number };

export function applyCityCommand(world: World, c: CityCommand): void {
  if (!world.city) return;
  const say = (text: string | null) => {
    if (text) world.emit({ kind: 'notify', player: c.player, text });
  };
  switch (c.kind) {
    case 'road': {
      const r = placeRoads(world, c.player, c.tiles.slice(0, 2000));
      if (r.problem && r.built < c.tiles.length) say(r.built ? `Road stopped: ${r.problem.toLowerCase()}` : `Can't build a road: ${r.problem.toLowerCase()}`);
      break;
    }
    case 'unroad':
      removeRoads(world, c.player, c.tiles.slice(0, 2000));
      break;
    case 'place': {
      const r = placeCityBuilding(world, c.player, c.building, c.tx, c.ty);
      if (typeof r === 'string') say(`Can't build: ${r.toLowerCase()}`);
      break;
    }
    case 'placeMany': {
      let placed = 0;
      let last = '';
      for (const [tx, ty] of c.spots.slice(0, 200)) {
        const r = placeCityBuilding(world, c.player, c.building, tx, ty);
        if (typeof r === 'string') last = r;
        else placed++;
      }
      if (!placed && last) say(`Can't build: ${last.toLowerCase()}`);
      break;
    }
    case 'demolish': {
      const b = world.getBuilding(c.building);
      if (b && b.owner === c.player && b.city && b.type !== 'town_hall') demolish(world, b);
      break;
    }
    case 'taxRate': {
      const pc = world.city.players[c.player];
      if (pc) pc.taxRate = Math.max(0.5, Math.min(1.5, Math.round(c.rate * 20) / 20));
      break;
    }
  }
}

export const CITY_PLAYERS: PlayerInfo[] = [{ id: 0, name: 'You', color: 0x3a7bd5, isHuman: true }];

export interface CityOptions {
  seed: number;
  size: number;
  biome: GenBiome;
}

/** A new economy game: generated map, a Town Hall in the best region, a little stock. */
export function createCity(opts: CityOptions): World {
  const map = generateMap({ seed: opts.seed, size: opts.size, biome: opts.biome, starts: 4 });
  return startCity(map, opts.seed);
}

export function startCity(map: GameMap, seed: number): World {
  const world = new World(map, CITY_PLAYERS, seed, 'city');
  world.city = createCityState(map.width, map.height, map.regions.length, CITY_PLAYERS.length, START_CREDITS);
  const reg = map.startRegions[0] ?? 0;
  const info = map.regions[reg - 1];
  if (reg) world.city.regionOwner[reg] = 0;
  exploreRegion(world, 0, reg);
  // Town hall on the region's site, with a short road in front.
  const tx = info ? info.siteX : Math.floor(map.width / 2) - 3;
  const ty = info ? info.siteY : Math.floor(map.height / 2) - 3;
  const hall = addCityBuilding(world, 'town_hall', 0, tx, ty, true);
  stockUp(hall, START_STOCK);
  const [hw, hh] = BUILDINGS.town_hall.size;
  for (let x = tx - 1; x <= tx + hw; x++) {
    const y = ty + hh;
    if (y < map.height && x >= 0 && x < map.width && !world.occupancy[y * map.width + x]) setRoad(world, x, y, true);
  }
  hall.city!.access = -1;
  updateFog(world);
  return world;
}
