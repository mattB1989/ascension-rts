import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NavLayer } from '../src/sim/nav.ts';
import { createMatch } from '../src/sim/scenario.ts';
import { TICK_RATE } from '../src/sim/time.ts';
import type { Unit, World } from '../src/sim/world.ts';

const P = 0;
const run = (world: World, seconds: number) => {
  for (let t = 0; t < seconds * TICK_RATE; t++) world.step();
};
const unit = (world: World, type: string, owner = P) => world.units.find((u) => u.owner === owner && u.type === type)!;
const all = (world: World, type: string, owner = P) => world.units.filter((u) => u.owner === owner && u.type === type);

test('transport ship: engineers board on the home coast and land on the island', () => {
  const world = createMatch({ seed: 1337, mode: 'sandbox' });
  const ship = unit(world, 'transport_ship');
  const engs = all(world, 'engineer').slice(0, 3);
  const c = world.map.width / 2;
  // The centre island cannot be reached on foot.
  const islandTile = world.pathfinder.nearestPassable(NavLayer.Foot, Math.floor(c), Math.floor(c), 6)!;
  const walk = world.pathfinder.findPath(NavLayer.Foot, engs[0]!.x, engs[0]!.y, islandTile[0] + 0.5, islandTile[1] + 0.5)!;
  assert.ok(Math.hypot(walk.at(-2)! - islandTile[0] - 0.5, walk.at(-1)! - islandTile[1] - 0.5) > 5, 'island unreachable on foot');

  world.step([{ kind: 'board', player: P, units: engs.map((u) => u.id), carrier: ship.id }]);
  run(world, 90);
  assert.equal(ship.cargo.length, 3, `aboard: ${ship.cargo.length}`);
  assert.ok(engs.every((u) => u.carrier === ship.id));
  assert.ok(world.players[P]!.popUsed >= 3, 'passengers still count towards population');

  world.step([{ kind: 'unload', player: P, units: [ship.id], x: islandTile[0] + 0.5, y: islandTile[1] + 0.5 }]);
  run(world, 90);
  assert.equal(ship.cargo.length, 0);
  for (const u of engs) {
    assert.equal(u.carrier, 0);
    assert.ok(world.nav.passableAt(u.layer, u.x, u.y), 'landed on solid ground');
    assert.ok(Math.hypot(u.x - c, u.y - c) < 14, `on the island: ${u.x.toFixed(1)},${u.y.toFixed(1)}`);
  }
});

test('transport ship refuses what it cannot carry and stops when full', () => {
  const world = createMatch({ seed: 1337, mode: 'sandbox' });
  const ship = unit(world, 'transport_ship');
  const tanks = all(world, 'battle_tank'); // 3 slots each, 10 slots: 3 tanks fit
  const riders = [...tanks, ...all(world, 'rifleman')];
  world.step([{ kind: 'board', player: P, units: riders.map((u) => u.id), carrier: ship.id }]);
  run(world, 120);
  let used = 0;
  for (const id of ship.cargo) used += world.getUnit(id)!.def.armor === 'inf' ? 1 : 3;
  assert.ok(used <= 10, `slots used ${used}`);
  assert.ok(ship.cargo.length >= 4, 'loaded a mix');
});

test('cargo plane: infantry board at the airfield and are paradropped far away', () => {
  const world = createMatch({ seed: 1337, mode: 'sandbox' });
  const plane = unit(world, 'cargo_plane');
  assert.ok(plane.parked);
  const squad = all(world, 'rifleman').slice(0, 4);
  world.step([{ kind: 'board', player: P, units: squad.map((u) => u.id), carrier: plane.id }]);
  run(world, 60);
  assert.equal(plane.cargo.length, 4, 'all four aboard');
  // A tank cannot board a cargo plane.
  world.step([{ kind: 'board', player: P, units: [unit(world, 'battle_tank').id], carrier: plane.id }]);
  assert.ok(world.events.some((e) => e.kind === 'notify' && e.text === 'Infantry only'));

  const target = { x: 110, y: 100 };
  world.step([{ kind: 'paradrop', player: P, units: [plane.id], x: target.x, y: target.y }]);
  run(world, 40);
  assert.equal(plane.cargo.length, 0, 'dropped');
  for (const u of squad) {
    assert.equal(u.carrier, 0);
    assert.equal(u.chute, 0, 'landed');
    assert.ok(Math.hypot(u.x - target.x, u.y - target.y) < 8, `landed near the target: ${u.x.toFixed(1)},${u.y.toFixed(1)}`);
    assert.ok(world.nav.passableAt(u.layer, u.x, u.y));
  }
  run(world, 40);
  assert.ok(plane.parked, 'plane flew home');
});

test('a jet with nowhere to land crashes when out of fuel', () => {
  const world = createMatch({ seed: 1337, mode: 'sandbox' });
  const jet = unit(world, 'fighter_jet');
  const field = world.getBuilding(jet.home)!;
  world.step([{ kind: 'move', player: P, units: [jet.id], x: 120, y: 120 }]);
  world.removeBuilding(field);
  run(world, 70);
  assert.ok(!world.getUnit(jet.id), 'crashed');
  assert.ok(world.players[P]!.popUsed > 0);
});

test('airfield parking limits how many planes it can build', () => {
  const world = createMatch({ seed: 1337, mode: 'sandbox' });
  const field = world.buildings.find((b) => b.owner === P && b.type === 'airfield')!;
  world.players[P]!.res.ore = 5000;
  world.players[P]!.res.energy = 5000;
  world.step([{ kind: 'train', player: P, building: field.id, unit: 'fighter_jet' }]);
  world.step([{ kind: 'train', player: P, building: field.id, unit: 'fighter_jet' }]);
  assert.equal(field.queue.length, 1, '3 parked + 1 queued = 4 spots');
  assert.ok(world.events.some((e) => e.kind === 'notify' && e.text.startsWith('Airfield full')));
});

test('transport logistics are deterministic', () => {
  const play = () => {
    const world = createMatch({ seed: 5, mode: 'sandbox' });
    const plane = unit(world, 'cargo_plane');
    const ship = unit(world, 'transport_ship');
    world.step([
      { kind: 'board', player: P, units: all(world, 'rifleman').slice(0, 3).map((u: Unit) => u.id), carrier: plane.id },
      { kind: 'board', player: P, units: all(world, 'engineer').map((u: Unit) => u.id), carrier: ship.id },
    ]);
    run(world, 50);
    world.step([{ kind: 'paradrop', player: P, units: [plane.id], x: 100, y: 110 }]);
    run(world, 60);
    return world.stateHash();
  };
  assert.equal(play(), play());
});

