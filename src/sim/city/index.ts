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
import { atWar, recruit, setWar } from './military.ts';
import { advanceAge } from './ages.ts';
import { placeRails, removeRails } from './rail.ts';
import { placePipes, removePipes } from './pipes.ts';
import { canTrade, cancelTreaty, changeOpinion, hasTreaty, offerPeace, proposeTreaty, type TreatyKind } from './treaties.ts';
import type { UnitTypeId } from '../../data/units.ts';
import { newBot, type Difficulty } from '../../ai/cityBot.ts';

export type CityCommand =
  /** Lay roads along these tiles (as far as credits allow). */
  | { kind: 'road'; player: number; tiles: Array<[number, number]> }
  /** Lay a pipeline along these tiles. */
  | { kind: 'pipe'; player: number; tiles: Array<[number, number]> }
  /** Lay railway along these tiles. */
  | { kind: 'rail'; player: number; tiles: Array<[number, number]> }
  /** Remove roads (and railways) from these tiles. */
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
  | { kind: 'buyState'; player: number; state: number }
  /** Train a unit at a barracks or vehicle factory (economy game costs). */
  | { kind: 'recruit'; player: number; building: number; unit: UnitTypeId }
  | { kind: 'declareWar'; player: number; target: number }
  | { kind: 'makePeace'; player: number; target: number }
  /** Propose a treaty to a nation (they accept or refuse at once), or end one. */
  | { kind: 'proposeTreaty'; player: number; target: number; treaty: TreatyKind }
  | { kind: 'cancelTreaty'; player: number; target: number; treaty: TreatyKind }
  /** Reach the next age (all requirements met). */
  | { kind: 'advanceAge'; player: number };

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
      removeRails(world, c.player, c.tiles.slice(0, 2000));
      removePipes(world, c.player, c.tiles.slice(0, 2000));
      break;
    case 'pipe': {
      const r = placePipes(world, c.player, c.tiles.slice(0, 2000));
      if (r.problem && r.built < c.tiles.length) say(r.built ? `Pipeline stopped: ${r.problem.toLowerCase()}` : `Can't lay a pipeline: ${r.problem.toLowerCase()}`);
      break;
    }
    case 'rail': {
      const r = placeRails(world, c.player, c.tiles.slice(0, 2000));
      if (r.problem && r.built < c.tiles.length) say(r.built ? `Railway stopped: ${r.problem.toLowerCase()}` : `Can't lay a railway: ${r.problem.toLowerCase()}`);
      break;
    }
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
      if (!pc || !(c.good in GOODS) || !canTrade(world, c.player, c.state)) break;
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
    case 'recruit': {
      const b = world.getBuilding(c.building);
      if (b) say(recruit(world, c.player, b, c.unit));
      break;
    }
    case 'declareWar': {
      const t = world.players[c.target];
      if (!t || t.defeated || c.target === c.player || atWar(world, c.player, c.target)) break;
      if (hasTreaty(world, c.player, c.target, 'peace')) {
        say(`You have a non-aggression pact with ${t.name}: end it first`);
        break;
      }
      setWar(world, c.player, c.target, true);
      changeOpinion(world, c.target, c.player, -60);
      // A war ends trade and research pacts.
      world.city.treaties = world.city.treaties.filter((x) => !((x.a === c.player && x.b === c.target) || (x.a === c.target && x.b === c.player)));
      world.emit({ kind: 'notify', player: -1, text: `⚔ ${world.players[c.player]!.name} declared war on ${t.name}` });
      // Attacking a city-state angers all of them; declaring war on anyone makes city-states wary.
      for (const p of world.players) {
        const rel = world.city.players[p.id]?.relations;
        if (rel && p.id !== c.player) rel.opinion[c.player] = Math.max(-100, (rel.opinion[c.player] ?? 0) - (t.role === 'cityState' ? 25 : 5));
      }
      if (t.role === 'cityState') relationsOf(world, c.target)!.offer = -1;
      break;
    }
    case 'makePeace': {
      if (!atWar(world, c.player, c.target)) break;
      const offers = (world.city.peaceOffers ??= []);
      // You must persuade a nation (unless they asked first); an AI's offer to you waits for your answer.
      if (world.players[c.player]?.role === 'human') {
        const asked = offers.some((o) => o.from === c.target && o.to === c.player);
        if (!asked) {
          say(offerPeace(world, c.player, c.target));
          break;
        }
      } else if (world.players[c.target]?.role === 'human') {
        if (!offers.some((o) => o.from === c.player && o.to === c.target)) {
          offers.push({ from: c.player, to: c.target });
          world.emit({ kind: 'notify', player: c.target, text: `🕊 ${world.players[c.player]!.name} offers peace (see 🤝 Diplomacy)` });
        }
        break;
      }
      setWar(world, c.player, c.target, false);
      world.emit({ kind: 'notify', player: -1, text: `🕊 ${world.players[c.player]!.name} and ${world.players[c.target]!.name} made peace` });
      break;
    }
    case 'proposeTreaty':
      say(proposeTreaty(world, c.player, c.target, c.treaty));
      break;
    case 'cancelTreaty':
      cancelTreaty(world, c.player, c.target, c.treaty);
      break;
    case 'advanceAge':
      say(advanceAge(world, c.player));
      break;
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
  /** Rival AI nations (default: 1 on small maps, 2 on standard). */
  nations?: number;
  difficulty?: Difficulty;
  /** Ways to win on (default) or off (sandbox: endless play). */
  victory?: boolean;
}

const NATION_COLORS = [0xd64541, 0x8e44ad, 0x16a085];
const NATION_NAMES = ['Red Union', 'Violet Republic', 'Teal Federation'];

/** A new economy game: generated map, a Town Hall in the best region, a little stock. */
export function createCity(opts: CityOptions): World {
  const states = opts.cityStates ?? (opts.size >= 512 ? 5 : 3);
  const nations = opts.nations ?? (opts.size >= 512 ? 2 : 1);
  const map = generateMap({ seed: opts.seed, size: opts.size, biome: opts.biome, starts: 1 + nations + states });
  const world = startCity(map, opts.seed, states, nations, opts.difficulty ?? 'normal');
  world.city!.victory.on = opts.victory ?? true;
  return world;
}

export function startCity(map: GameMap, seed: number, cityStates = 0, nations = 0, difficulty: Difficulty = 'normal'): World {
  // Players: you, rival nations (the starts farthest from you), then city-states.
  const players: PlayerInfo[] = [...CITY_PLAYERS];
  const nationRegions = map.startRegions.slice(1, 1 + nations);
  nationRegions.forEach((_, k) => {
    players.push({ id: players.length, name: NATION_NAMES[k % NATION_NAMES.length]!, color: NATION_COLORS[k % NATION_COLORS.length]!, isHuman: false, role: 'nation' });
  });
  const stateRegions = map.startRegions.slice(1 + nations, 1 + nations + cityStates);
  stateRegions.forEach((reg, k) => {
    players.push({ id: players.length, name: map.regions[reg - 1]?.name ?? `City ${k + 1}`, color: STATE_COLORS[k % STATE_COLORS.length]!, isHuman: false, role: 'cityState' });
  });
  const firstState = 1 + nationRegions.length;
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
  // Rival nations start like you, and are played by the city builder with expansion and war.
  nationRegions.forEach((reg, k) => {
    const id = k + 1;
    const info = map.regions[reg - 1]!;
    world.city!.regionOwner[reg] = id;
    world.city!.players[id]!.credits = START_CREDITS * (difficulty === 'hard' ? 1.3 : difficulty === 'easy' ? 0.8 : 1);
    const th = addCityBuilding(world, 'town_hall', id, info.siteX, info.siteY, true);
    stockUp(th, START_STOCK);
    const [w, h] = BUILDINGS.town_hall.size;
    for (let x = info.siteX - 1; x <= info.siteX + w; x++) {
      const y = info.siteY + h;
      if (y < map.height && x >= 0 && x < map.width && !world.occupancy[y * map.width + x]) setRoad(world, x, y, true);
    }
    const bot = newBot(id, Infinity, true, difficulty);
    bot.personality = (['trader', 'expansionist', 'warlike', 'builder'] as const)[(seed + k * 3) % 4];
    world.city!.bots.push(bot);
    world.city!.players[id]!.relations = newRelations(players.length);
    for (let i = 0; i < map.region.length; i++) if (map.nearRegion[i] === reg) world.players[0]!.explored[i] = 1;
  });
  stateRegions.forEach((reg, k) => {
    const id = firstState + k;
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
