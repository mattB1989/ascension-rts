import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BuildingTypeId } from '../src/data/buildings.ts';
import { BUILDINGS } from '../src/data/buildings.ts';
import { UNITS } from '../src/data/units.ts';
import type { Command } from '../src/sim/commands.ts';
import { findPlacement, placementProblem } from '../src/sim/placement.ts';
import { createMatch, START_RESOURCES } from '../src/sim/scenario.ts';
import { TICK_RATE } from '../src/sim/time.ts';
import type { Building, World } from '../src/sim/world.ts';

const P = 0;

function engineers(world: World, player = P): number[] {
  return world.units.filter((u) => u.owner === player && u.type === 'engineer').map((u) => u.id);
}

function run(world: World, seconds: number, cmds: Command[] = []): void {
  world.step(cmds);
  for (let t = 1; t < seconds * TICK_RATE; t++) world.step();
}

function hq(world: World, player = P): Building {
  return world.buildings.find((b) => b.owner === player && b.type === 'command_center')!;
}

function nearestOre(world: World): number {
  const h = hq(world);
  let best = -1;
  let bestD = Infinity;
  for (const r of world.resources) {
    if (r.kind !== 'ore') continue;
    const d = Math.hypot(r.x - h.x, r.y - h.y);
    if (d < bestD) {
      bestD = d;
      best = r.index;
    }
  }
  return best;
}

/** Give a player a completed building near its HQ (for tests that need prerequisites). */
function grant(world: World, type: BuildingTypeId, player = P): Building {
  const h = hq(world, player);
  const spot = findPlacement(world, player, type, h.x + 8, h.y - 8)!;
  assert.ok(spot, `room for ${type}`);
  return world.addBuilding(type, player, spot[0], spot[1], true);
}

test('match starts with an HQ, engineers, resources and housing', () => {
  const world = createMatch({ seed: 1337 });
  const p = world.players[P]!;
  assert.equal(world.buildingsOf(P).length, 1);
  assert.equal(engineers(world).length, 5);
  assert.deepEqual(p.res, START_RESOURCES);
  assert.equal(p.popCap, 10);
  assert.equal(p.popUsed, 5);
});

test('engineers mine ore and carry it to the HQ', () => {
  const world = createMatch({ seed: 1337 });
  const before = world.players[P]!.res.ore;
  run(world, 60, [{ kind: 'gather', player: P, units: engineers(world), resource: nearestOre(world) }]);
  const gained = world.players[P]!.res.ore - before;
  assert.ok(gained >= 100, `gained only ${gained} ore in a minute`);
  assert.equal(world.players[P]!.gathered.ore, gained);
});

test('a crowded ore field does not jam: 12 engineers mine as fast each as 1', () => {
  const perEngineer = (n: number) => {
    const world = createMatch({ seed: 1337 });
    const h = hq(world);
    for (let i = 0; i < n - 5; i++) world.spawnUnit('engineer', P, h.x + 3 + (i % 4) * 0.7, h.y + 3 + Math.floor(i / 4) * 0.7);
    const ids = engineers(world).slice(0, n);
    run(world, 120, [{ kind: 'gather', player: P, units: ids, resource: nearestOre(world) }]);
    return world.players[P]!.gathered.ore / n;
  };
  const solo = perEngineer(1);
  const crowd = perEngineer(12);
  assert.ok(crowd > solo * 0.9, `crowd ${crowd.toFixed(0)} vs solo ${solo.toFixed(0)} ore per engineer`);
});

test('engineers build a Habitat Block, which raises the population cap', () => {
  const world = createMatch({ seed: 1337 });
  const h = hq(world);
  const [tx, ty] = findPlacement(world, P, 'habitat_block', h.x - 6, h.y)!;
  const ore = world.players[P]!.res.ore;
  run(world, 1, [{ kind: 'build', player: P, units: engineers(world).slice(0, 2), building: 'habitat_block', tx, ty }]);
  assert.equal(world.players[P]!.res.ore, ore - BUILDINGS.habitat_block.cost.ore);
  const b = world.buildings.find((x) => x.type === 'habitat_block')!;
  assert.ok(b && !b.complete);
  run(world, 25);
  assert.ok(b.complete, `progress ${b.progress}`);
  assert.equal(world.players[P]!.popCap, 20);
});

test('more builders build faster', () => {
  const timeWith = (n: number) => {
    const world = createMatch({ seed: 1337 });
    const h = hq(world);
    const [tx, ty] = findPlacement(world, P, 'barracks', h.x - 7, h.y + 2)!;
    world.step([{ kind: 'build', player: P, units: engineers(world).slice(0, n), building: 'barracks', tx, ty }]);
    const b = world.buildings.find((x) => x.type === 'barracks')!;
    let t = 0;
    while (!b.complete && t < 15 * 120) {
      world.step();
      t++;
    }
    return t / TICK_RATE;
  };
  const one = timeWith(1);
  const three = timeWith(3);
  const five = timeWith(5);
  assert.ok(one > BUILDINGS.barracks.buildTime, `1 builder: ${one}s`);
  assert.ok(three < one * 0.65, `3 builders ${three}s vs 1 builder ${one}s`);
  assert.ok(five < three, `5 builders ${five}s vs 3 builders ${three}s`);
});

test('placement rules: water, overlap, unexplored, coast, oil', () => {
  const world = createMatch({ seed: 1337 });
  const h = hq(world);
  // On top of the HQ.
  assert.equal(placementProblem(world, P, 'barracks', h.tx, h.ty), 'Blocked');
  // Deep in the unexplored enemy half.
  assert.equal(placementProblem(world, P, 'barracks', 110, 110), 'Unexplored');
  // Reveal the whole map for the remaining checks.
  world.players[P]!.explored.fill(1);
  // In the sea.
  assert.equal(placementProblem(world, P, 'barracks', 69, 89), 'Must be on open ground');
  // A shipyard far inland must touch the water.
  assert.equal(placementProblem(world, P, 'shipyard', h.tx - 10, h.ty - 10), 'Must touch the water');
  // A derrick only goes on oil; and a barracks may not cover oil.
  const oil = world.resources.find((r) => r.kind === 'oil' && !r.offshore)!;
  assert.equal(placementProblem(world, P, 'oil_derrick', h.tx - 10, h.ty - 10), 'Must be placed on an oil spot');
  assert.equal(placementProblem(world, P, 'oil_derrick', oil.tx, oil.ty), null);
  assert.equal(placementProblem(world, P, 'barracks', oil.tx - 1, oil.ty - 1), 'Oil spots are for derricks and rigs');
  // A shipyard can be found somewhere on the home coast.
  assert.ok(findPlacement(world, P, 'shipyard', 0.4 * world.map.width, 0.4 * world.map.height, 20));
});

test('prerequisites and cost are enforced by the sim', () => {
  const world = createMatch({ seed: 1337 });
  const h = hq(world);
  const [tx, ty] = findPlacement(world, P, 'vehicle_factory', h.x + 6, h.y - 6)!;
  run(world, 0.2, [{ kind: 'build', player: P, units: engineers(world), building: 'vehicle_factory', tx, ty }]);
  assert.ok(!world.buildings.some((b) => b.type === 'vehicle_factory'), 'factory needs a barracks');
  assert.ok(world.events.length >= 0);
  world.players[P]!.res.ore = 10;
  const [bx, by] = findPlacement(world, P, 'barracks', h.x + 6, h.y - 6)!;
  run(world, 0.2, [{ kind: 'build', player: P, units: engineers(world), building: 'barracks', tx: bx, ty: by }]);
  assert.ok(!world.buildings.some((b) => b.type === 'barracks'), 'not enough ore');
});

test('a player cannot order the other player\'s units or buildings', () => {
  const world = createMatch({ seed: 1337 });
  const enemyHq = hq(world, 1);
  const before = world.players[1]!.res.ore;
  run(world, 1, [
    { kind: 'train', player: P, building: enemyHq.id, unit: 'engineer' },
    { kind: 'gather', player: P, units: engineers(world, 1), resource: nearestOre(world) },
  ]);
  assert.equal(enemyHq.queue.length, 0);
  assert.equal(world.players[1]!.res.ore, before);
  assert.ok(engineers(world, 1).every((id) => world.getUnit(id)!.task === null));
});

test('an oil derrick produces energy and drains its spot', () => {
  const world = createMatch({ seed: 1337 });
  const h = hq(world);
  const oil = world.resources
    .filter((r) => r.kind === 'oil' && !r.offshore)
    .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]!;
  const [tx, ty] = findPlacement(world, P, 'oil_derrick', oil.x, oil.y, 3)!;
  run(world, 1, [{ kind: 'build', player: P, units: engineers(world).slice(0, 3), building: 'oil_derrick', tx, ty }]);
  run(world, 40);
  const d = world.buildings.find((b) => b.type === 'oil_derrick')!;
  assert.ok(d.complete);
  assert.equal(d.resource, oil.index);
  const e0 = world.players[P]!.res.energy;
  run(world, 10);
  const gained = world.players[P]!.res.energy - e0;
  assert.ok(Math.abs(gained - 15) < 0.5, `10 s of a derrick gave ${gained}`);
  assert.ok(oil.amount < oil.max);
});

test('training: costs, queue, spawn, and housing limits', () => {
  const world = createMatch({ seed: 1337 });
  const p = world.players[P]!;
  const h = hq(world);
  p.res.ore = 1000;
  run(world, 0.1, [
    { kind: 'train', player: P, building: h.id, unit: 'engineer' },
    { kind: 'train', player: P, building: h.id, unit: 'engineer' },
  ]);
  assert.equal(p.res.ore, 900);
  assert.equal(h.queue.length, 2);
  run(world, UNITS.engineer.trainTime * 2 + 1);
  assert.equal(engineers(world).length, 7);
  // Fill the population to the cap: training then waits for housing.
  run(world, 0.1, [1, 2, 3, 4].map(() => ({ kind: 'train' as const, player: P, building: h.id, unit: 'engineer' as const })));
  run(world, UNITS.engineer.trainTime * 4 + 2);
  assert.equal(p.popUsed, 10);
  assert.ok(h.waitingForPop, 'waits for housing');
  assert.equal(h.queue.length, 1);
});

test('cancelling refunds the queue and unfinished buildings', () => {
  const world = createMatch({ seed: 1337 });
  const p = world.players[P]!;
  const h = hq(world);
  const ore = p.res.ore;
  run(world, 2, [{ kind: 'train', player: P, building: h.id, unit: 'engineer' }]);
  run(world, 0.1, [{ kind: 'cancel', player: P, building: h.id, index: 0 }]);
  assert.equal(p.res.ore, ore);
  const [tx, ty] = findPlacement(world, P, 'barracks', h.x - 7, h.y + 2)!;
  run(world, 0.1, [{ kind: 'build', player: P, units: engineers(world).slice(0, 1), building: 'barracks', tx, ty }]);
  const b = world.buildings.find((x) => x.type === 'barracks')!;
  run(world, 0.1, [{ kind: 'cancelBuild', player: P, building: b.id }]);
  assert.equal(p.res.ore, ore);
  assert.ok(!world.getBuilding(b.id));
  assert.equal(placementProblem(world, P, 'barracks', tx, ty), null, 'footprint is free again');
});

test('research: Deep Drilling speeds up mining; unfinished techs are refused', () => {
  const world = createMatch({ seed: 1337 });
  const p = world.players[P]!;
  p.res.ore = 2000;
  p.res.energy = 2000;
  const refinery = grant(world, 'ore_refinery');
  const barracks = grant(world, 'barracks');
  run(world, 0.1, [
    { kind: 'research', player: P, building: refinery.id, tech: 'deep_drilling' },
    { kind: 'research', player: P, building: barracks.id, tech: 'body_armor' },
  ]);
  assert.equal(refinery.queue.length, 1);
  assert.equal(barracks.queue.length, 0, 'Body Armor needs combat (M3)');
  run(world, 36);
  assert.ok(p.researched.has('deep_drilling'));
  assert.ok(Math.abs(p.mult.gather.ore - 1.15) < 1e-9);
});

test('rally points: new units walk to the rally, engineers on ore start mining', () => {
  const world = createMatch({ seed: 1337 });
  const h = hq(world);
  const ore = world.resources[nearestOre(world)]!;
  run(world, 0.1, [
    { kind: 'rally', player: P, building: h.id, x: ore.x, y: ore.y },
    { kind: 'train', player: P, building: h.id, unit: 'engineer' },
  ]);
  run(world, UNITS.engineer.trainTime + 1);
  const newest = world.units.filter((u) => u.owner === P && u.type === 'engineer').at(-1)!;
  assert.equal(newest.task?.kind, 'gather');
});

test('fog of war: own base explored, enemy base not', () => {
  const world = createMatch({ seed: 1337 });
  const p = world.players[P]!;
  const w = world.map.width;
  const mine = world.map.starts[P]!;
  const theirs = world.map.starts[1]!;
  assert.equal(p.visible[Math.floor(mine.y) * w + Math.floor(mine.x)], 1);
  assert.equal(p.explored[Math.floor(theirs.y) * w + Math.floor(theirs.x)], 0);
});

test('economy is deterministic', () => {
  const play = () => {
    const world = createMatch({ seed: 99 });
    const h = hq(world);
    const [tx, ty] = findPlacement(world, P, 'barracks', h.x - 7, h.y + 2)!;
    run(world, 1, [{ kind: 'gather', player: P, units: engineers(world).slice(0, 3), resource: nearestOre(world) }]);
    run(world, 1, [{ kind: 'build', player: P, units: engineers(world).slice(3), building: 'barracks', tx, ty }]);
    run(world, 1, [{ kind: 'train', player: P, building: h.id, unit: 'engineer' }]);
    run(world, 90);
    return world.stateHash();
  };
  assert.equal(play(), play());
});
