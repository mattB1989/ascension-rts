import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Deposit, isOpenLand, Terrain } from '../src/sim/map.ts';
import { generateMap, type GenBiome } from '../src/sim/mapgen.ts';
import { NavGrid, NavLayer } from '../src/sim/nav.ts';
import { Pathfinder } from '../src/sim/pathfinding.ts';

const BIOMES: GenBiome[] = ['temperate', 'arid', 'alpine', 'archipelago'];
const maps = BIOMES.map((biome) => generateMap({ seed: 7, size: 256, biome }));

test('generation is deterministic', () => {
  const again = generateMap({ seed: 7, size: 256, biome: 'temperate' });
  assert.deepEqual(again.terrain, maps[0]!.terrain);
  assert.deepEqual(again.region, maps[0]!.region);
  assert.deepEqual(again.deposit, maps[0]!.deposit);
  assert.notDeepEqual(generateMap({ seed: 8, size: 256, biome: 'temperate' }).terrain, maps[0]!.terrain);
});

test('every biome has land, sea, fresh water and every deposit', () => {
  for (const m of maps) {
    let land = 0;
    let sea = 0;
    let fresh = 0;
    const dep = [0, 0, 0, 0];
    for (let i = 0; i < m.terrain.length; i++) {
      const t = m.terrain[i]!;
      if (isOpenLand(t as never)) land++;
      if ((t === Terrain.Deep || t === Terrain.Shallow) && !m.fresh[i]) sea++;
      fresh += m.fresh[i]!;
      dep[m.deposit[i]!]!++;
    }
    const n = m.terrain.length;
    assert.ok(land / n > 0.25, `${m.biome}: buildable land ${land / n}`);
    assert.ok(sea / n > 0.08, `${m.biome}: sea ${sea / n}`);
    assert.ok(fresh > 200, `${m.biome}: fresh water ${fresh}`);
    for (const d of [Deposit.Ore, Deposit.Oil, Deposit.Stone]) assert.ok(dep[d]! > 20, `${m.biome}: deposit ${d} = ${dep[d]}`);
  }
});

test('regions cover the land, have names, sites and neighbours', () => {
  for (const m of maps) {
    assert.ok(m.regions.length >= 6, `${m.biome}: ${m.regions.length} regions`);
    for (let i = 0; i < m.terrain.length; i++) {
      const water = m.terrain[i] === Terrain.Deep || m.terrain[i] === Terrain.Shallow;
      assert.equal(m.region[i] === 0, water, `${m.biome}: tile ${i}`);
    }
    for (const r of m.regions) {
      assert.ok(r.name.length >= 3);
      if (r.tiles > 1500) assert.ok(r.siteX >= 0, `${m.biome}: ${r.name} has no site`);
    }
    // Neighbourhood is symmetric.
    for (const r of m.regions) for (const o of r.neighbors) assert.ok(m.regions[o - 1]!.neighbors.includes(r.id));
    assert.equal(new Set(m.regions.map((r) => r.name)).size > m.regions.length * 0.8, true, 'names mostly unique');
  }
});

test('starts are on clear buildable land in different regions, far apart', () => {
  for (const m of maps) {
    assert.ok(m.starts.length >= 2, `${m.biome}: ${m.starts.length} starts`);
    assert.equal(new Set(m.startRegions).size, m.startRegions.length);
    for (const s of m.starts) {
      for (let dy = -3; dy < 3; dy++) {
        for (let dx = -3; dx < 3; dx++) assert.ok(isOpenLand(m.terrain[(Math.floor(s.y) + dy) * m.width + Math.floor(s.x) + dx] as never), `${m.biome} start`);
      }
    }
    const [a, b] = m.starts;
    assert.ok(Math.hypot(a!.x - b!.x, a!.y - b!.y) > m.width * 0.2, `${m.biome}: starts too close`);
  }
});

test('rivers reach the sea or the map edge, so ships can sail up them', () => {
  const m = maps[0]!;
  const pf = new Pathfinder(new NavGrid(m));
  // Some river tile far from the coast must be connected by water to the open sea.
  let riverTile = -1;
  let seaTile = -1;
  for (let i = 0; i < m.terrain.length; i++) {
    if (m.fresh[i] && riverTile < 0 && m.terrain[i] === Terrain.Shallow) riverTile = i;
    if (!m.fresh[i] && m.terrain[i] === Terrain.Deep) seaTile = i;
  }
  assert.ok(riverTile >= 0 && seaTile >= 0);
  const w = m.width;
  const path = pf.findPath(NavLayer.Water, (riverTile % w) + 0.5, Math.floor(riverTile / w) + 0.5, (seaTile % w) + 0.5, Math.floor(seaTile / w) + 0.5);
  assert.ok(path && path.length > 0);
});
