// Saving and loading a whole game. The world is plain data (typed arrays,
// arrays, records, Maps) so a structured clone captures it; on load the class
// prototypes and catalog references are put back and the pathfinder (only
// scratch memory) is rebuilt. Works in the browser (IndexedDB stores the clone)
// and in Node (tests use structuredClone directly). Browser storage: src/ui/saves.ts.

import { newVictoryState } from './city/victory.ts';
import { newRelations } from './city/diplomacy.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { GOOD_IDS, type GoodId } from '../data/goods.ts';
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
  migrate(w);
  return w;
}

/** Fill in state added after a save was made (saves from earlier builds keep loading). */
function migrate(w: World): void {
  const city = w.city as (NonNullable<World['city']> & Record<string, unknown>) | null;
  if (!city) return;
  const n = w.map.width * w.map.height;
  if (!city.condition) {
    city.condition = new Float32Array(n);
    for (let i = 0; i < n; i++) if (city.road[i]) city.condition[i] = 1;
  }
  city.ships ??= [];
  city.nextShipId ??= 1;
  city.prices ??= Object.fromEntries(GOOD_IDS.map((g) => [g, 1])) as Record<GoodId, number>;
  city.bots ??= [];
  city.war ??= w.players.map(() => w.players.map(() => 0));
  for (const b of w.buildings) if (b.city) {
    b.city.capture ??= 0;
    b.city.captureBy ??= -1;
    b.city.needs.electronics ??= false;
    b.city.needs.data ??= false;
    b.city.covered.data ??= false;
    b.city.needs.pharma ??= false;
    b.city.needs.university ??= false;
    b.city.covered.university ??= false;
  }
  city.aiQueue ??= [];
  city.victory ??= newVictoryState(w.players.length);
  city.warStart ??= w.players.map(() => w.players.map(() => 0));
  city.treaties ??= [];
  if (!city.rail) {
    city.rail = new Uint8Array(n);
    city.railComp = new Int32Array(n);
    city.railCount = 0;
    city.railVersion = 1;
    city.railCompVersion = 0;
    city.trains = [];
    city.nextTrainId = 1;
  }
  w.players.forEach((p, i) => {
    if (p.role === 'nation') city.players[i]!.relations ??= newRelations(w.players.length);
  });
  for (const t of city.trucks) t.buy ??= null;
  for (const pc of city.players) {
    for (const k of ['population', 'workforce', 'jobs', 'employed'] as const) while (pc[k].length < 4) (pc[k] as number[]).push(0);
    pc.age ??= 0;
    pc.research ??= 0;
    pc.deals ??= {};
    pc.relations ??= null;
    pc.trade ??= {};
    pc.stockpile ??= {};
    pc.year.imports ??= 0;
    pc.lastYear.imports ??= 0;
    pc.year.military ??= 0;
    pc.lastYear.military ??= 0;
  }
  if (!w.map.nearRegion) (w.map as { nearRegion: Uint16Array }).nearRegion = new Uint16Array(w.map.region);
  for (const r of w.map.regions) {
    const x = r as { ocean?: boolean; rare?: number; uranium?: number };
    x.ocean ??= false;
    x.rare ??= 0;
    x.uranium ??= 0;
  }
}

/** Same as saving and loading, in memory (tests, "restart from here"). */
export function cloneWorld(world: World): World {
  return revive(structuredClone(snapshot(world, '')));
}
