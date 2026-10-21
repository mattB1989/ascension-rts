import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateTwinShores, isWater, Terrain, terrainAt, type TerrainId } from '../src/sim/map.ts';
import { NavGrid, NavLayer } from '../src/sim/nav.ts';
import { Pathfinder } from '../src/sim/pathfinding.ts';

const map = generateTwinShores(1337);

test('map is rotationally symmetric', () => {
  const { width: w, height: h } = map;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      assert.equal(terrainAt(map, x, y), terrainAt(map, w - 1 - x, h - 1 - y), `tile ${x},${y}`);
    }
  }
});

test('map generation is deterministic', () => {
  const again = generateTwinShores(1337);
  assert.deepEqual(again.terrain, map.terrain);
  assert.deepEqual(again.velev, map.velev);
  assert.deepEqual(again.resources, map.resources);
});

test('map has a real mix of land and sea', () => {
  const counts = new Map<TerrainId, number>();
  for (const t of map.terrain) counts.set(t as TerrainId, (counts.get(t as TerrainId) ?? 0) + 1);
  const total = map.width * map.height;
  const water = (counts.get(Terrain.Deep) ?? 0) + (counts.get(Terrain.Shallow) ?? 0);
  assert.ok(water / total > 0.15 && water / total < 0.45, `water share ${water / total}`);
  assert.ok((counts.get(Terrain.Deep) ?? 0) > 1000, 'needs deep water for submarines later');
});

test('bases are on clear land', () => {
  for (const s of map.starts) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        assert.equal(terrainAt(map, Math.floor(s.x) + dx, Math.floor(s.y) + dy), Terrain.Grass);
      }
    }
  }
});

test('the two bases are connected by land (bridges)', () => {
  const pf = new Pathfinder(new NavGrid(map));
  const [a, b] = map.starts;
  const path = pf.findPath(NavLayer.Land, a!.x, a!.y, b!.x, b!.y)!;
  assert.ok(path.length >= 2);
  assert.equal(path[path.length - 2], b!.x);
  assert.equal(path[path.length - 1], b!.y);
});

test('both home coasts are connected by sea', () => {
  const nav = new NavGrid(map);
  const pf = new Pathfinder(nav);
  const w = map.width;
  const a = pf.nearestPassable(NavLayer.Water, Math.floor(0.41 * w), Math.floor(0.41 * w), 30)!;
  const b = pf.nearestPassable(NavLayer.Water, Math.floor(0.59 * w), Math.floor(0.59 * w), 30)!;
  const path = pf.findPath(NavLayer.Water, a[0] + 0.5, a[1] + 0.5, b[0] + 0.5, b[1] + 0.5)!;
  const ex = path[path.length - 2]!;
  const ey = path[path.length - 1]!;
  assert.equal(Math.floor(ex), b[0]);
  assert.equal(Math.floor(ey), b[1]);
});

test('resources: symmetric, on the right terrain, offshore oil exists', () => {
  assert.ok(map.resources.length >= 20);
  for (const r of map.resources) {
    const t = terrainAt(map, Math.floor(r.x), Math.floor(r.y));
    assert.equal(isWater(t), r.offshore, `${r.kind} at ${r.x},${r.y}`);
    if (r.kind === 'ore') assert.ok(!r.offshore, 'ore is always on land');
    const mirror = map.resources.find((o) => o.x === map.width - r.x && o.y === map.height - r.y && o.kind === r.kind);
    assert.ok(mirror, `mirror of ${r.kind} at ${r.x},${r.y}`);
  }
  assert.ok(map.resources.some((r) => r.kind === 'oil' && r.offshore));
});
