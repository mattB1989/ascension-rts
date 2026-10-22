import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { UnitTypeId } from '../src/data/units.ts';
import { DAMAGE } from '../src/data/weapons.ts';
import { Terrain } from '../src/sim/map.ts';
import { NavLayer } from '../src/sim/nav.ts';
import { lineTiles } from '../src/sim/placement.ts';
import { createMatch } from '../src/sim/scenario.ts';
import { TICK_RATE } from '../src/sim/time.ts';
import type { Unit, World } from '../src/sim/world.ts';

const run = (world: World, seconds: number) => {
  for (let t = 0; t < seconds * TICK_RATE; t++) world.step();
};

/** A match with every unit removed, and an open rectangle of grass to fight on. */
function arena(seed = 1337): { world: World; x: number; y: number } {
  const world = createMatch({ seed });
  for (const u of [...world.units]) world.removeUnit(u, 'test', true);
  const m = world.map;
  for (let y = 20; y < m.height / 2; y++) {
    for (let x = 20; x < m.width / 2; x++) {
      let ok = true;
      for (let dy = 0; dy < 10 && ok; dy++) {
        for (let dx = 0; dx < 24 && ok; dx++) {
          const t = m.terrain[(y + dy) * m.width + x + dx];
          if (t !== Terrain.Grass || world.occupancy[(y + dy) * m.width + x + dx]) ok = false;
        }
      }
      if (ok) return { world, x, y };
    }
  }
  throw new Error('no arena');
}

function squad(world: World, owner: number, type: UnitTypeId, n: number, x: number, y: number): Unit[] {
  const out: Unit[] = [];
  for (let i = 0; i < n; i++) out.push(world.spawnUnit(type, owner, x + (i % 3) * 0.9, y + Math.floor(i / 3) * 0.9, owner === 0 ? 0 : Math.PI));
  return out;
}

const alive = (world: World, units: Unit[]) => units.filter((u) => world.getUnit(u.id)).length;

test('damage table: the counters from the tech tree', () => {
  assert.ok(DAMAGE.ap.hv > DAMAGE.bullet.hv * 4, 'anti-tank beats bullets against tanks');
  assert.ok(DAMAGE.bullet.inf > DAMAGE.ap.inf, 'bullets beat rockets against infantry');
  assert.equal(DAMAGE.aa.inf, 0, 'AA missiles cannot hurt ground units');
  assert.ok(DAMAGE.explosive.str > 1, 'artillery is good against buildings');
  assert.ok(DAMAGE.bullet.str < 0.2, 'rifles are poor against buildings');
});

test('idle units fight back: 3 Rocket Troopers beat a Battle Tank', () => {
  const { world, x, y } = arena();
  const rockets = squad(world, 0, 'rocket_trooper', 3, x + 2, y + 4);
  const tank = squad(world, 1, 'battle_tank', 1, x + 9, y + 4)[0]!;
  run(world, 40);
  assert.ok(!world.getUnit(tank.id), 'tank destroyed');
  assert.ok(alive(world, rockets) >= 1, 'at least one trooper survives');
});

test('a Battle Tank beats 4 Riflemen', () => {
  const { world, x, y } = arena();
  const rifles = squad(world, 0, 'rifleman', 4, x + 2, y + 4);
  const tank = squad(world, 1, 'battle_tank', 1, x + 8, y + 4)[0]!;
  run(world, 60);
  assert.equal(alive(world, rifles), 0, 'riflemen wiped out');
  assert.ok(world.getUnit(tank.id), 'tank survives');
});

test('anti-air only shoots aircraft; Flak Track brings down a helicopter', () => {
  const { world, x, y } = arena();
  const sky = squad(world, 0, 'skyguard', 2, x + 2, y + 4);
  const rifle = squad(world, 1, 'rifleman', 1, x + 6, y + 4)[0]!;
  run(world, 10);
  assert.equal(world.getUnit(rifle.id)!.hp, world.getUnit(rifle.id)!.maxHp, 'Skyguard cannot hurt infantry');
  void sky;
  const flak = squad(world, 0, 'flak_track', 1, x + 12, y + 4)[0]!;
  const heli = squad(world, 1, 'attack_helicopter', 1, x + 18, y + 4)[0]!;
  run(world, 30);
  assert.ok(!world.getUnit(heli.id), 'helicopter shot down');
  void flak;
});

test('attack order: a unit chases its target down', () => {
  const { world, x, y } = arena();
  const buggy = squad(world, 0, 'scout_buggy', 1, x + 1, y + 1)[0]!;
  const engineer = squad(world, 1, 'engineer', 1, x + 7, y + 3)[0]!;
  run(world, 0.5); // let the fog of war catch up with the new units
  world.step([{ kind: 'move', player: 1, units: [engineer.id], x: x + 22, y: y + 8 }]);
  world.step([{ kind: 'attack', player: 0, units: [buggy.id], target: engineer.id }]);
  run(world, 30);
  assert.ok(!world.getUnit(engineer.id), 'target killed');
});

test('plain move keeps moving; attack-move stops to fight', () => {
  const { world, x, y } = arena();
  const a = squad(world, 0, 'rifleman', 1, x + 1, y + 2)[0]!;
  const b = squad(world, 0, 'rifleman', 1, x + 1, y + 6)[0]!;
  const blocker = world.spawnUnit('battle_tank', 1, x + 12, y + 4);
  blocker.hp = blocker.maxHp = 100000; // a punching bag
  world.step([
    { kind: 'move', player: 0, units: [a.id], x: x + 22, y: y + 2 },
    { kind: 'attackMove', player: 0, units: [b.id], x: x + 22, y: y + 6 },
  ]);
  run(world, 20);
  assert.ok(a.x > x + 18, `moved past: ${a.x - x}`);
  assert.ok(b.x < x + 14, `stopped to fight: ${b.x - x}`);
  assert.ok(blocker.hp < blocker.maxHp, 'took damage');
});

test('artillery cannot fire at point-blank range', () => {
  const { world, x, y } = arena();
  const how = squad(world, 0, 'howitzer', 1, x + 4, y + 4)[0]!;
  const rifle = squad(world, 1, 'rifleman', 1, x + 6, y + 4)[0]!;
  rifle.hp = rifle.maxHp = 100000;
  world.step([{ kind: 'stop', player: 1, units: [rifle.id] }]);
  run(world, 8);
  assert.equal(rifle.hp, rifle.maxHp);
  void how;
});

test('garrisoned watchtower with 4 riflemen holds off 8 riflemen', () => {
  const { world, x, y } = arena();
  const tower = world.addBuilding('watchtower', 0, x + 4, y + 4, true);
  const guards = squad(world, 0, 'rifleman', 4, x + 2, y + 6);
  world.step([{ kind: 'garrison', player: 0, units: guards.map((u) => u.id), building: tower.id }]);
  run(world, 8);
  assert.equal(tower.garrison.length, 4, 'all inside');
  const raiders = squad(world, 1, 'rifleman', 8, x + 18, y + 4);
  world.step([{ kind: 'attackMove', player: 1, units: raiders.map((u) => u.id), x: x + 4, y: y + 4 }]);
  run(world, 90);
  assert.ok(world.getBuilding(tower.id), 'tower stands');
  assert.equal(alive(world, raiders), 0, 'raiders wiped out');
  // Eject puts them back on the ground.
  world.step([{ kind: 'eject', player: 0, building: tower.id }]);
  assert.equal(tower.garrison.length, 0);
  assert.ok(guards.every((g) => g.carrier === 0 && world.nav.passableAt(g.layer, g.x, g.y, 0)));
});

test('walls block enemies; gates let only their owner through', () => {
  const { world, x, y } = arena();
  // A wall across the whole map width would be long; instead wall in a pocket: a ring around a point.
  const cx = x + 10;
  const cy = y + 5;
  const ring: Array<[number, number]> = [];
  for (const [ax, ay, bx, by] of [[cx - 3, cy - 3, cx + 3, cy - 3], [cx + 3, cy - 3, cx + 3, cy + 3], [cx + 3, cy + 3, cx - 3, cy + 3], [cx - 3, cy + 3, cx - 3, cy - 3]] as const) {
    for (const t of lineTiles(ax, ay, bx, by)) if (!ring.some(([px, py]) => px === t[0] && py === t[1])) ring.push(t);
  }
  for (const [tx, ty] of ring) world.addBuilding('wall', 0, tx, ty, true);
  // Replace one segment with a gate.
  world.removeBuilding(world.getBuilding(world.occupancy[(cy - 3) * world.map.width + cx]!)!);
  world.addBuilding('gate', 0, cx, cy - 3, true);
  const inside = { x: cx + 0.5, y: cy + 0.5 };
  const pf = world.pathfinder;
  const end = (owner: number) => {
    const p = pf.findPath(NavLayer.Land, x + 0.5, y + 0.5, inside.x, inside.y, owner)!;
    return Math.hypot(p.at(-2)! - inside.x, p.at(-1)! - inside.y);
  };
  assert.ok(end(0) < 0.5, 'owner walks in through the gate');
  assert.ok(end(1) > 2, 'enemy cannot get in');
  assert.ok(world.nav.passable(NavLayer.Land, cx, cy - 3, 0) && !world.nav.passable(NavLayer.Land, cx, cy - 3, 1));
});

test('lineTiles is 4-connected', () => {
  const t = lineTiles(0, 0, 7, 3);
  assert.deepEqual(t[0], [0, 0]);
  assert.deepEqual(t.at(-1), [7, 3]);
  for (let i = 1; i < t.length; i++) {
    const d = Math.abs(t[i]![0] - t[i - 1]![0]) + Math.abs(t[i]![1] - t[i - 1]![1]);
    assert.equal(d, 1, 'neighbours share an edge');
  }
});

test('engineers repair a damaged building for a fraction of its cost', () => {
  const { world, x, y } = arena();
  const b = world.addBuilding('barracks', 0, x + 4, y + 2, true);
  b.hp = b.maxHp * 0.5;
  const eng = squad(world, 0, 'engineer', 2, x + 2, y + 6);
  const ore = world.players[0]!.res.ore;
  world.step([{ kind: 'assist', player: 0, units: eng.map((u) => u.id), target: b.id }]);
  run(world, 40);
  assert.ok(Math.abs(b.hp - b.maxHp) < 1, `repaired to ${b.hp}/${b.maxHp}`);
  const spent = ore - world.players[0]!.res.ore;
  assert.ok(spent > 0 && spent < b.def.cost.ore * 0.3, `repair cost ${spent.toFixed(0)}`);
});

test('Body Armor raises HP of infantry already in the field', () => {
  const { world, x, y } = arena();
  const r = squad(world, 0, 'rifleman', 1, x + 2, y + 2)[0]!;
  const bar = world.addBuilding('barracks', 0, x + 10, y + 2, true);
  world.players[0]!.res.ore = 1000;
  world.players[0]!.res.energy = 1000;
  world.step([{ kind: 'research', player: 0, building: bar.id, tech: 'body_armor' }]);
  run(world, 40);
  assert.ok(world.players[0]!.researched.has('body_armor'));
  assert.equal(r.maxHp, r.def.hp * 1.2);
  assert.equal(world.spawnUnit('rifleman', 0, x + 3, y + 3).maxHp, r.def.hp * 1.2);
});

test('destroying the enemy Command Center wins the game', () => {
  const world = createMatch({ seed: 1337 });
  const hq = world.buildings.find((b) => b.owner === 1 && b.type === 'command_center')!;
  const army: Unit[] = [];
  for (let i = 0; i < 6; i++) army.push(world.spawnUnit('howitzer', 0, hq.x - 10 - (i % 3) * 1.6, hq.y - 6 - Math.floor(i / 3) * 1.6));
  army.push(world.spawnUnit('scout_buggy', 0, hq.x - 7, hq.y - 3)); // spotter
  run(world, 0.5);
  world.step([{ kind: 'attack', player: 0, units: army.map((u) => u.id), target: hq.id }]);
  run(world, 120);
  assert.ok(!world.getBuilding(hq.id), 'HQ destroyed');
  assert.equal(world.winner, 0);
  assert.ok(world.players[1]!.defeated);
});

test('battles are deterministic', () => {
  const battle = () => {
    const world = createMatch({ seed: 21, mode: 'sandbox' });
    const mine = world.units.filter((u) => u.owner === 0 && u.def.domain === 'land' && u.type !== 'engineer').map((u) => u.id);
    const s = world.map.starts[1]!;
    world.step([{ kind: 'attackMove', player: 0, units: mine, x: s.x, y: s.y }]);
    run(world, 120);
    return world.stateHash();
  };
  assert.equal(battle(), battle());
});
