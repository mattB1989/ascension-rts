// Economy game: commands and the starting setup.

import { BUILDINGS, type BuildingTypeId } from '../../data/buildings.ts';
import { START_CREDITS, START_STOCK } from '../../data/city.ts';
import { GOODS, type GoodId } from '../../data/goods.ts';
import { updateFog } from '../fog.ts';
import { generateMap, type GenBiome } from '../mapgen.ts';
import type { GameMap } from '../map.ts';
import { World, type PlayerInfo } from '../world.ts';
import { exploreRegion } from './economy.ts';
import { addCityBuilding, demolish, placeCityBuilding, stockUp } from './place.ts';
import { placeRoads, removeRoads, setRoad } from './roads.ts';
import { createCityState } from './state.ts';
import { annex, DIPLO, isCityState, newRelations, purchasePrice, relationsOf } from './diplomacy.ts';
import { newBot } from '../../ai/cityBot.ts';

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
  | { kind: 'taxRate'; player: number; rate: number }
  /** Trade port rule for one good: import up to `import` (0 off), export above `export` (-1 off). */
  | { kind: 'tradeRule'; player: number; good: GoodId; import: number; export: number }
  /** Deal with a city-state for one good: import up to / export above (same meaning as trade rules). */
  | { kind: 'deal'; player: number; state: number; good: GoodId; import: number; export: number }
  /** Accept a city-state's request to join. */
  | { kind: 'acceptUnion'; player: number; state: number }
  /** Buy a city-state outright (it must like you enough). */
  | { kind: 'buyState'; player: number; state: number };

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
    case 'tradeRule': {
      const pc = world.city.players[c.player];
      if (!pc || !(c.good in GOODS)) break;
      const imp = Math.max(0, Math.min(2000, Math.floor(c.import)));
      const exp = c.export < 0 ? -1 : Math.min(5000, Math.floor(c.export));
      if (imp === 0 && exp < 0) delete pc.trade[c.good];
      else pc.trade[c.good] = { import: imp, export: exp };
      break;
    }
    case 'deal': {
      const pc = world.city.players[c.player];
      if (!pc || !(c.good in GOODS) || !isCityState(world, c.state)) break;
      const imp = Math.max(0, Math.min(2000, Math.floor(c.import)));
      const exp = c.export < 0 ? -1 : Math.min(5000, Math.floor(c.export));
      const book = (pc.deals[c.state] ??= {});
      if (imp === 0 && exp < 0) delete book[c.good];
      else book[c.good] = { import: imp, export: exp };
      if (!Object.keys(book).length) delete pc.deals[c.state];
      break;
    }
    case 'acceptUnion': {
      const rel = relationsOf(world, c.state);
      if (rel && rel.offer === c.player && isCityState(world, c.state)) annex(world, c.state, c.player);
      break;
    }
    case 'buyState': {
      const rel = relationsOf(world, c.state);
      const pc = world.city.players[c.player];
      if (!rel || !pc || !isCityState(world, c.state)) break;
      if ((rel.opinion[c.player] ?? 0) < DIPLO.buyOpinion) {
        say(`${world.players[c.state]!.name} won't sell: they need to like you more`);
        break;
      }
      const price = purchasePrice(world, c.state);
      if (pc.credits < price) {
        say(`Buying ${world.players[c.state]!.name} costs ₡${price}`);
        break;
      }
      pc.credits -= price;
      pc.year.construction += price;
      annex(world, c.state, c.player);
      break;
    }
    case 'taxRate': {
      const pc = world.city.players[c.player];
      if (pc) pc.taxRate = Math.max(0.5, Math.min(1.5, Math.round(c.rate * 20) / 20));
      break;
    }
  }
}

export const CITY_PLAYERS: PlayerInfo[] = [{ id: 0, name: 'You', color: 0x3a7bd5, isHuman: true, role: 'human' }];

/** Colours for city-states (and later nations). */
const STATE_COLORS = [0xd9a441, 0x5fae6e, 0xb06ac9, 0x4fb6b0, 0xd0705a, 0x8a9a5b, 0xc9688a];

export interface CityOptions {
  seed: number;
  size: number;
  biome: GenBiome;
  /** Neutral city-states (default: 3 on small maps, 5 on standard). */
  cityStates?: number;
}

/** A new economy game: generated map, a Town Hall in the best region, a little stock. */
export function createCity(opts: CityOptions): World {
  const states = opts.cityStates ?? (opts.size >= 512 ? 5 : 3);
  const map = generateMap({ seed: opts.seed, size: opts.size, biome: opts.biome, starts: 1 + states });
  return startCity(map, opts.seed, states);
}

export function startCity(map: GameMap, seed: number, cityStates = 0): World {
  // Players: you, then one per city-state, each in a start region the generator picked far apart.
  const players: PlayerInfo[] = [...CITY_PLAYERS];
  const stateRegions = map.startRegions.slice(1, 1 + cityStates);
  stateRegions.forEach((reg, k) => {
    players.push({ id: players.length, name: map.regions[reg - 1]?.name ?? `City ${k + 1}`, color: STATE_COLORS[k % STATE_COLORS.length]!, isHuman: false, role: 'cityState' });
  });
  const world = new World(map, players, seed, 'city');
  world.city = createCityState(map.width, map.height, map.regions.length, players.length, START_CREDITS);
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
  stateRegions.forEach((reg, k) => {
    const id = k + 1;
    const info = map.regions[reg - 1]!;
    world.city!.regionOwner[reg] = id;
    world.city!.players[id]!.credits = START_CREDITS * 0.6;
    world.city!.players[id]!.relations = newRelations(players.length);
    const th = addCityBuilding(world, 'town_hall', id, info.siteX, info.siteY, true);
    stockUp(th, START_STOCK);
    const [w, h] = BUILDINGS.town_hall.size;
    for (let x = info.siteX - 1; x <= info.siteX + w; x++) {
      const y = info.siteY + h;
      if (y < map.height && x >= 0 && x < map.width && !world.occupancy[y * map.width + x]) setRoad(world, x, y, true);
    }
    // City-states grow to a size that fits their land.
    world.city!.bots.push(newBot(id, Math.min(600, Math.max(150, Math.floor(info.tiles / 14)))));
    // You know where your neighbours are.
    for (let i = 0; i < map.region.length; i++) if (map.nearRegion[i] === reg) world.players[0]!.explored[i] = 1;
  });
  updateFog(world);
  return world;
}
