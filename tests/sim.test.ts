import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Command } from '../src/sim/commands.ts';
import { fatan2, fcos, fsin } from '../src/sim/fmath.ts';
import { Terrain, terrainAt } from '../src/sim/map.ts';
import { NavLayer } from '../src/sim/nav.ts';
import { Rng } from '../src/sim/rng.ts';
import { createMatch } from '../src/sim/scenario.ts';
import type { World } from '../src/sim/world.ts';

test('rng is deterministic and in range', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  for (let i = 0; i < 1000; i++) {
    const x = a.next();
    assert.equal(x, b.next());
    assert.ok(x >= 0 && x < 1);
  }
});

test('deterministic trig is accurate', () => {
  for (let i = -100; i <= 100; i++) {
    const a = i * 0.137;
    assert.ok(Math.abs(fsin(a) - Math.sin(a)) < 1e-6, `sin ${a}`);
    assert.ok(Math.abs(fcos(a) - Math.cos(a)) < 1e-6, `cos ${a}`);
  }
  for (let i = 0; i < 400; i++) {
    const y = Math.sin(i * 1.7) * (i % 7);
    const x = Math.cos(i * 0.9) * (i % 5);
    assert.ok(Math.abs(fatan2(y, x) - Math.atan2(y, x)) < 1e-4, `atan2 ${y},${x}`);
  }
});

function playerUnits(world: World, owner: number, domain?: string): number[] {
  return world.units.filter((u) => u.owner === owner && (!domain || u.def.domain === domain)).map((u) => u.id);
}

function runScript(seed: number): number[] {
  const world = createMatch({ seed });
  const hashes: number[] = [];
  const s = world.map.starts[0]!;
  const script = new Map<number, Command[]>([
    [5, [{ kind: 'move', player: 0, units: playerUnits(world, 0, 'land'), x: s.x + 15, y: s.y + 4 }]],
    [10, [{ kind: 'move', player: 0, units: playerUnits(world, 0, 'air'), x: 80, y: 80 }]],
    [30, [{ kind: 'move', player: 1, units: playerUnits(world, 1), x: 100, y: 100 }]],
  ]);
  for (let t = 0; t < 300; t++) {
    world.step(script.get(t) ?? []);
    if (t % 50 === 0) hashes.push(world.stateHash());
  }
  hashes.push(world.stateHash());
  return hashes;
}

test('simulation is deterministic: same commands, same state', () => {
  assert.deepEqual(runScript(7), runScript(7));
});

test('land units reach their destination and stay on land', () => {
  const world = createMatch({ seed: 1337 });
  const s = world.map.starts[0]!;
  const ids = playerUnits(world, 0, 'land');
  const gx = s.x + 18;
  const gy = s.y - 6;
  world.step([{ kind: 'move', player: 0, units: ids, x: gx, y: gy }]);
  for (let t = 0; t < 15 * 40; t++) {
    world.step();
    for (const id of ids) {
      const u = world.getUnit(id)!;
      assert.ok(world.nav.passableAt(NavLayer.Land, u.x, u.y), `unit ${id} left the land at ${u.x},${u.y}`);
    }
  }
  for (const id of ids) {
    const u = world.getUnit(id)!;
    const d = Math.hypot(u.x - gx, u.y - gy);
    assert.ok(d < 10, `${u.type} ${id} ended ${d.toFixed(1)} tiles from the target`);
    assert.equal(u.state, 'idle');
  }
});

test('ships stay in water and can cross to the enemy coast', () => {
  const world = createMatch({ seed: 1337 });
  const ids = playerUnits(world, 0, 'sea');
  assert.ok(ids.length > 0);
  const w = world.map.width;
  const target = world.pathfinder.nearestPassable(NavLayer.Water, Math.floor(0.6 * w), Math.floor(0.6 * w), 30)!;
  world.step([{ kind: 'move', player: 0, units: ids, x: target[0] + 0.5, y: target[1] + 0.5 }]);
  for (let t = 0; t < 15 * 60; t++) {
    world.step();
    for (const id of ids) {
      const u = world.getUnit(id)!;
      const ter = terrainAt(world.map, Math.floor(u.x), Math.floor(u.y));
      assert.ok(ter === Terrain.Deep || ter === Terrain.Shallow, `ship ${id} on land at ${u.x},${u.y}`);
    }
  }
  for (const id of ids) {
    const u = world.getUnit(id)!;
    assert.ok(Math.hypot(u.x - target[0], u.y - target[1]) < 12, `ship ${id} did not arrive`);
  }
});

test('ordering a tank onto an island takes it to the nearest reachable shore', () => {
  const world = createMatch({ seed: 1337 });
  const tank = world.units.find((u) => u.owner === 0 && u.type === 'battle_tank')!;
  const c = world.map.width / 2;
  world.step([{ kind: 'move', player: 0, units: [tank.id], x: c, y: c }]);
  for (let t = 0; t < 15 * 60; t++) world.step();
  assert.ok(world.nav.passableAt(NavLayer.Land, tank.x, tank.y));
  assert.ok(Math.hypot(tank.x - c, tank.y - c) < 40, 'tank should have moved towards the island');
  assert.equal(tank.state, 'idle');
});

test('players cannot command enemy units', () => {
  const world = createMatch({ seed: 1337 });
  const enemy = world.units.find((u) => u.owner === 1 && u.def.domain === 'land')!;
  const x = enemy.x;
  world.step([{ kind: 'move', player: 0, units: [enemy.id], x: 10, y: 10 }]);
  for (let t = 0; t < 30; t++) world.step();
  assert.equal(enemy.state, 'idle');
  assert.ok(Math.abs(enemy.x - x) < 1);
});

test('jets keep flying and circle their goal', () => {
  const world = createMatch({ seed: 1337 });
  const jet = world.units.find((u) => u.owner === 0 && u.type === 'fighter_jet')!;
  world.step([{ kind: 'move', player: 0, units: [jet.id], x: 60, y: 60 }]);
  for (let t = 0; t < 15 * 30; t++) world.step();
  const d = Math.hypot(jet.x - jet.goalX, jet.y - jet.goalY);
  assert.ok(d < 9, `jet orbit distance ${d}`);
  assert.ok(jet.speed > 1, 'jets never stop');
});
