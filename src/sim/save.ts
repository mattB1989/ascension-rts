// Saving and loading a whole game. The world is plain data (typed arrays,
// arrays, records, Maps) so a structured clone captures it; on load the class
// prototypes and catalog references are put back and the pathfinder (only
// scratch memory) is rebuilt. Works in the browser (IndexedDB stores the clone)
// and in Node (tests use structuredClone directly). Browser storage: src/ui/saves.ts.

import { BUILDINGS } from '../data/buildings.ts';
import { UNITS } from '../data/units.ts';
import { NavGrid } from './nav.ts';
import { Pathfinder } from './pathfinding.ts';
import { Rng } from './rng.ts';
import { World } from './world.ts';

// Available in browsers and Node 17+; the sim's type config has no DOM library.
declare function structuredClone<T>(value: T): T;

export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  savedAt: number;
  name: string;
  /** The world without its pathfinder. */
  world: Record<string, unknown>;
}

/** A cloneable snapshot of the world. */
export function snapshot(world: World, name: string): SaveFile {
  const copy: Record<string, unknown> = { ...world };
  delete copy.pathfinder;
  return { version: SAVE_VERSION, savedAt: Date.now(), name, world: copy };
}

/** Turn a (structured-cloned) snapshot back into a live world. */
export function revive(file: SaveFile): World {
  if (file.version !== SAVE_VERSION) throw new Error(`Save version ${file.version} is not supported`);
  const w = file.world as unknown as World & { pathfinder: Pathfinder };
  Object.setPrototypeOf(w, World.prototype);
  Object.setPrototypeOf(w.nav, NavGrid.prototype);
  Object.setPrototypeOf(w.rng, Rng.prototype);
  (w as { pathfinder: Pathfinder }).pathfinder = new Pathfinder(w.nav);
  for (const u of w.units) u.def = UNITS[u.type];
  for (const b of w.buildings) b.def = BUILDINGS[b.type];
  return w;
}

/** Same as saving and loading, in memory (tests, "restart from here"). */
export function cloneWorld(world: World): World {
  return revive(structuredClone(snapshot(world, '')));
}
