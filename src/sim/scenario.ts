// Match setup: map, players and starting forces.
// M1 is a movement sandbox, so each side starts with a mixed army. From M2 players
// start with an HQ and engineers and build up from there.

import type { UnitTypeId } from '../data/units.ts';
import { generateTwinShores } from './map.ts';
import { NavLayer } from './nav.ts';
import { World, type PlayerInfo } from './world.ts';

export interface MatchOptions {
  seed: number;
}

export const DEFAULT_PLAYERS: PlayerInfo[] = [
  { id: 0, name: 'Blue', color: 0x3a7bd5, isHuman: true },
  { id: 1, name: 'Red', color: 0xd64541, isHuman: false },
];

const LAND_ARMY: Array<[UnitTypeId, number]> = [
  ['battle_tank', 4],
  ['scout_buggy', 2],
  ['flak_track', 1],
  ['rifleman', 6],
  ['rocket_trooper', 3],
  ['engineer', 2],
];
const NAVY: Array<[UnitTypeId, number]> = [
  ['destroyer', 2],
  ['patrol_boat', 2],
];
const AIR: Array<[UnitTypeId, number]> = [
  ['fighter_jet', 2],
  ['attack_helicopter', 2],
];

export function createMatch(opts: MatchOptions): World {
  const map = generateTwinShores(opts.seed);
  const world = new World(map, DEFAULT_PLAYERS, opts.seed);
  const w = map.width;

  for (const player of DEFAULT_PLAYERS) {
    const mirror = player.id === 1;
    const start = map.starts[player.id]!;
    // Direction from this base towards the enemy (+x +y for player 0).
    const sgn = mirror ? -1 : 1;
    const facing = mirror ? -2.356 : 0.785;

    // Land army in a block in front of the HQ.
    let i = 0;
    for (const [type, count] of LAND_ARMY) {
      for (let k = 0; k < count; k++, i++) {
        const row = Math.floor(i / 6);
        const col = i % 6;
        const fx = 7 + row * 1.6;
        const side = (col - 2.5) * 1.6;
        // Forward along the diagonal, sideways across it.
        const x = start.x + sgn * (fx * 0.7071 - side * 0.7071);
        const y = start.y + sgn * (fx * 0.7071 + side * 0.7071);
        world.spawnUnit(type, player.id, x, y, facing);
      }
    }

    // Navy off the home coast.
    const coastX = mirror ? w - 0.41 * w : 0.41 * w;
    const coastY = coastX;
    const water = world.pathfinder.nearestPassable(NavLayer.Water, Math.floor(coastX), Math.floor(coastY), 30);
    if (water) {
      let j = 0;
      for (const [type, count] of NAVY) {
        for (let k = 0; k < count; k++, j++) {
          const off = (j - 1.5) * 3;
          let x = water[0] + 0.5 + sgn * off * 0.7071;
          let y = water[1] + 0.5 - sgn * off * 0.7071;
          if (!world.nav.passableAt(NavLayer.Water, x, y)) {
            const near = world.pathfinder.nearestPassable(NavLayer.Water, Math.floor(x), Math.floor(y), 10);
            if (near) [x, y] = [near[0] + 0.5, near[1] + 0.5];
          }
          world.spawnUnit(type, player.id, x, y, facing);
        }
      }
    }

    // Air units above the base.
    let a = 0;
    for (const [type, count] of AIR) {
      for (let k = 0; k < count; k++, a++) {
        const x = start.x + sgn * (-3 + a * 2);
        const y = start.y + sgn * (3 - a * 2) * 0.5;
        const u = world.spawnUnit(type, player.id, x, y, facing);
        u.goalX = x;
        u.goalY = y;
      }
    }
  }
  return world;
}
