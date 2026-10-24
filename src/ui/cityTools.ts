// Economy game tools for the input controller: roads (drawn as an L from the
// start tile to the pointer), bulldozer, rows of houses, and building placement
// with the land-quality note for raw producers.

import { buildingDef, type BuildingTypeId } from '../data/buildings.ts';
import { GOODS, type GoodId } from '../data/goods.ts';
import type { Game } from '../game.ts';
import { cityBuildProblem, cityPlacementProblem, landYield } from '../sim/city/place.ts';
import { roadProblem, roadTileCost } from '../sim/city/roads.ts';
import { RAIL, railProblem } from '../sim/city/rail.ts';
import { PIPE, pipeProblem } from '../sim/city/pipes.ts';
import type { World } from '../sim/world.ts';

export type CityTool = 'road' | 'rail' | 'maglev' | 'pipe' | 'bulldoze';
export type PlaceType = BuildingTypeId | CityTool;

/** Tools that are dragged as a line in the economy game. */
export function isCityLine(type: PlaceType): boolean {
  return type === 'road' || type === 'rail' || type === 'maglev' || type === 'pipe' || type === 'bulldoze' || type === 'house';
}

/** Tiles from start to end: along the longer axis first, then the other (an L), like city builders. */
export function roadPath(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  const xFirst = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  let x = x0;
  let y = y0;
  out.push([x, y]);
  if (xFirst) {
    while (x !== x1) out.push([(x += sx), y]);
    while (y !== y1) out.push([x, (y += sy)]);
  } else {
    while (y !== y1) out.push([x, (y += sy)]);
    while (x !== x1) out.push([(x += sx), y]);
  }
  return out.slice(0, 600);
}

/** House spots along a line: one 2x2 lot every 2 tiles, on the side of the line away from the road. */
export function houseSpots(tiles: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < tiles.length; i += 2) out.push([tiles[i]![0], tiles[i]![1]]);
  return out;
}

export interface CityPreview {
  /** Tiles to colour (and whether each is fine). */
  tiles: Array<[number, number]>;
  ok: (tx: number, ty: number) => boolean;
  valid: boolean;
  problem: string | null;
  /** One line for the placement card: cost, land quality. */
  info: string;
}

function credits(world: World, player: number): number {
  return world.city?.players[player]?.credits ?? 0;
}

export function materialsText(type: BuildingTypeId): string {
  const mats = buildingDef(type).econ?.materials ?? {};
  return Object.entries(mats).map(([g, n]) => `${GOODS[g as GoodId].icon}${n}`).join(' ');
}

export function previewLine(world: World, player: number, type: PlaceType, tiles: Array<[number, number]>): CityPreview {
  if (type === 'road') {
    const ok = (tx: number, ty: number) => roadProblem(world, player, tx, ty) === null;
    let cost = 0;
    let n = 0;
    let firstProblem: string | null = null;
    for (const [tx, ty] of tiles) {
      const why = roadProblem(world, player, tx, ty);
      if (why === null) {
        cost += roadTileCost(world.map, ty * world.map.width + tx);
        n++;
      } else if (why !== 'Already a road') firstProblem ??= why;
    }
    const problem = n === 0 ? firstProblem ?? 'Already a road' : cost > credits(world, player) ? 'Not enough credits' : null;
    return { tiles, ok, valid: problem === null, problem, info: `${n} tile${n === 1 ? '' : 's'} · ₡${cost}` };
  }
  if (type === 'rail' || type === 'maglev') {
    const mag = type === 'maglev';
    const ok = (tx: number, ty: number) => railProblem(world, player, tx, ty, mag) === null;
    let n = 0;
    let firstProblem: string | null = null;
    for (const [tx, ty] of tiles) {
      const why = railProblem(world, player, tx, ty, mag);
      if (why === null) n++;
      else if (why !== 'Already a railway') firstProblem ??= why;
    }
    const cost = n * (mag ? RAIL.maglevCost : RAIL.cost);
    const problem = n === 0 ? firstProblem ?? 'Already a railway' : cost > credits(world, player) ? 'Not enough credits' : null;
    return { tiles, ok, valid: problem === null, problem, info: `${n} tile${n === 1 ? '' : 's'} of ${mag ? 'maglev' : 'track'} · ₡${cost}` };
  }
  if (type === 'pipe') {
    const ok = (tx: number, ty: number) => pipeProblem(world, player, tx, ty) === null;
    let n = 0;
    let firstProblem: string | null = null;
    for (const [tx, ty] of tiles) {
      const why = pipeProblem(world, player, tx, ty);
      if (why === null) n++;
      else if (why !== 'Already a pipeline') firstProblem ??= why;
    }
    const cost = n * PIPE.cost;
    const problem = n === 0 ? firstProblem ?? 'Already a pipeline' : cost > credits(world, player) ? 'Not enough credits' : null;
    return { tiles, ok, valid: problem === null, problem, info: `${n} tile${n === 1 ? '' : 's'} of pipeline · ₡${cost}` };
  }
  if (type === 'bulldoze') {
    const city = world.city!;
    const w = world.map.width;
    const ok = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < w && ty < world.map.height && (city.road[ty * w + tx]! > 0 || city.rail[ty * w + tx]! > 0 || city.pipe[ty * w + tx]! > 0 || world.occupancy[ty * w + tx]! > 0);
    const roads = tiles.filter(([tx, ty]) => ok(tx, ty) && (city.road[ty * w + tx] || city.rail[ty * w + tx] || city.pipe[ty * w + tx])).length;
    const b = tiles.length === 1 ? world.getBuilding(world.occupancy[tiles[0]![1] * w + tiles[0]![0]] ?? 0) : undefined;
    const info = b ? `Demolish ${b.def.name}` : `Remove ${roads} road or rail tile${roads === 1 ? '' : 's'}`;
    const valid = !!b ? b.owner === player && b.type !== 'town_hall' : roads > 0;
    return { tiles, ok: (tx, ty) => !ok(tx, ty), valid, problem: valid ? null : b?.type === 'town_hall' ? "The Town Hall can't be demolished" : 'Nothing to remove', info };
  }
  // Houses along a line.
  const spots = houseSpots(tiles);
  const fine = spots.filter(([tx, ty]) => cityPlacementProblem(world, player, type, tx, ty) === null);
  const cost = (buildingDef(type).econ?.credits ?? 0) * fine.length;
  const lock = cityBuildProblem(world, player, type);
  const problem = lock ?? (fine.length === 0 ? 'No room along this line' : cost > credits(world, player) ? 'Not enough credits' : null);
  const fineSet = new Set(fine.map(([x, y]) => `${x},${y}`));
  const shown: Array<[number, number]> = [];
  for (const [tx, ty] of spots) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) shown.push([tx + dx, ty + dy]);
  const okTile = (tx: number, ty: number) => fineSet.has(`${tx},${ty}`) || fineSet.has(`${tx - 1},${ty}`) || fineSet.has(`${tx},${ty - 1}`) || fineSet.has(`${tx - 1},${ty - 1}`);
  return { tiles: shown, ok: okTile, valid: problem === null, problem, info: `${fine.length} house${fine.length === 1 ? '' : 's'} · ₡${cost}` };
}

export function previewBuilding(world: World, player: number, type: BuildingTypeId, tx: number, ty: number): { problem: string | null; info: string } {
  const def = buildingDef(type);
  const problem = cityBuildProblem(world, player, type) ?? cityPlacementProblem(world, player, type, tx, ty);
  const { note } = landYield(world.map, def, tx, ty);
  const mats = materialsText(type);
  const road = problem === null && !touchesRoad(world, tx, ty, def.size[0], def.size[1]) ? '⚠ not on a road yet' : '';
  const info = [`₡${def.econ?.credits ?? 0}${mats ? ` + ${mats}` : ''}`, note, road].filter(Boolean).join(' · ');
  return { problem, info };
}

function touchesRoad(world: World, tx: number, ty: number, w: number, h: number): boolean {
  const road = world.city?.road;
  if (!road) return true;
  const W = world.map.width;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < world.map.height && road[y * W + x]! > 0;
  for (let x = tx; x < tx + w; x++) if (at(x, ty - 1) || at(x, ty + h)) return true;
  for (let y = ty; y < ty + h; y++) if (at(tx - 1, y) || at(tx + w, y)) return true;
  return false;
}

/** Issue the command for a confirmed line tool. */
export function confirmLine(game: Game, type: PlaceType, tiles: Array<[number, number]>): void {
  const player = game.humanPlayer;
  const world = game.world;
  if (type === 'road') {
    game.issue({ kind: 'road', player, tiles });
  } else if (type === 'rail' || type === 'maglev') {
    game.issue({ kind: 'rail', player, tiles, maglev: type === 'maglev' });
  } else if (type === 'pipe') {
    game.issue({ kind: 'pipe', player, tiles });
  } else if (type === 'bulldoze') {
    const w = world.map.width;
    if (tiles.length === 1) {
      const [tx, ty] = tiles[0]!;
      const b = world.getBuilding(world.occupancy[ty * w + tx] ?? 0);
      if (b) {
        game.issue({ kind: 'demolish', player, building: b.id });
        return;
      }
    }
    game.issue({ kind: 'unroad', player, tiles });
  } else {
    game.issue({ kind: 'placeMany', player, building: type, spots: houseSpots(tiles) });
  }
}
