// Match setup: map, players, starting base and forces.

import type { UnitTypeId } from '../data/units.ts';
import { updateFog } from './fog.ts';
import { generateTwinShores } from './map.ts';
import { NavLayer } from './nav.ts';
import { World, type PlayerInfo } from './world.ts';

export type MatchMode = 'standard' | 'sandbox';

export interface MatchOptions {
  seed: number;
  /** standard: HQ + engineers. sandbox: also a mixed army, navy and air force (M1 test bed). */
  mode?: MatchMode;
}

export const DEFAULT_PLAYERS: PlayerInfo[] = [
  { id: 0, name: 'Blue', color: 0x3a7bd5, isHuman: true },
  { id: 1, name: 'Red', color: 0xd64541, isHuman: false },
];

export const START_RESOURCES = { ore: 400, energy: 200 };
export const START_ENGINEERS = 5;

const LAND_ARMY: Array<[UnitTypeId, number]> = [
  ['battle_tank', 4],
  ['scout_buggy', 2],
  ['flak_track', 1],
  ['rifleman', 6],
  ['rocket_trooper', 3],
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
    const p = world.players[player.id]!;
    p.res.ore = START_RESOURCES.ore;
    p.res.energy = START_RESOURCES.energy;
    // Direction from this base towards the enemy (+x +y for player 0).
    const sgn = mirror ? -1 : 1;
    const facing = mirror ? -2.356 : 0.785;
    const along = (fx: number, side: number): [number, number] => [
      start.x + sgn * (fx * 0.7071 - side * 0.7071),
      start.y + sgn * (fx * 0.7071 + side * 0.7071),
    ];

    world.addBuilding('command_center', player.id, Math.floor(start.x) - 2, Math.floor(start.y) - 2, true);

    for (let i = 0; i < START_ENGINEERS; i++) {
      const [x, y] = along(4.2, (i - (START_ENGINEERS - 1) / 2) * 1.1);
      world.spawnUnit('engineer', player.id, x, y, facing);
    }

    if (opts.mode !== 'sandbox') continue;

    let i = 0;
    for (const [type, count] of LAND_ARMY) {
      for (let k = 0; k < count; k++, i++) {
        const [x, y] = along(8 + Math.floor(i / 6) * 1.6, ((i % 6) - 2.5) * 1.6);
        world.spawnUnit(type, player.id, x, y, facing);
      }
    }
    const coast = mirror ? w - 0.41 * w : 0.41 * w;
    const water = world.pathfinder.nearestPassable(NavLayer.Water, Math.floor(coast), Math.floor(coast), 30);
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
    let a = 0;
    for (const [type, count] of AIR) {
      for (let k = 0; k < count; k++, a++) {
        const [x, y] = along(-4, -3 + a * 2);
        world.spawnUnit(type, player.id, x, y, facing);
      }
    }
  }
  updateFog(world);
  return world;
}
