import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AGE_ORDER, AGES } from '../src/data/ages.ts';
import { BUILDINGS, BUILDING_TYPES } from '../src/data/buildings.ts';
import { TECH_IDS, TECHS } from '../src/data/techs.ts';
import { UNIT_TYPES, UNITS } from '../src/data/units.ts';
import { WEAPONS, weaponsOf } from '../src/data/weapons.ts';
import { applyTables, DOC_PATH, renderTables } from '../tools/gen-docs.ts';

const isBuilding = (id: string) => (BUILDING_TYPES as string[]).includes(id);
const ageIndex = (a: string) => AGE_ORDER.indexOf(a as never);

test('every id in the catalog matches its key', () => {
  for (const [k, v] of Object.entries(UNITS)) assert.equal(v.id, k);
  for (const [k, v] of Object.entries(BUILDINGS)) assert.equal(v.id, k);
  for (const [k, v] of Object.entries(TECHS)) assert.equal(v.id, k);
});

test('all references point at real buildings, available no later than they are needed', () => {
  for (const id of BUILDING_TYPES) {
    const b = BUILDINGS[id];
    for (const r of b.requires) {
      assert.ok(isBuilding(r), `${id} requires unknown ${r}`);
      assert.ok(ageIndex(BUILDINGS[r as keyof typeof BUILDINGS].age) <= ageIndex(b.age), `${id} requires later-age ${r}`);
    }
  }
  for (const id of UNIT_TYPES) {
    const u = UNITS[id];
    assert.ok(isBuilding(u.trainedAt), `${id} trained at unknown ${u.trainedAt}`);
  }
  for (const id of TECH_IDS) assert.ok(isBuilding(TECHS[id].at), `${id} at unknown building`);
  for (const age of AGE_ORDER) {
    for (const r of [...AGES[age].requiresAll, ...AGES[age].requiresAny]) assert.ok(isBuilding(r), `${age} requires unknown ${r}`);
  }
});

test('the tech tree has no cycles', () => {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string) => {
    if (done.has(id)) return;
    assert.ok(!visiting.has(id), `cycle through ${id}`);
    visiting.add(id);
    for (const r of BUILDINGS[id as keyof typeof BUILDINGS].requires) visit(r);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of BUILDING_TYPES) visit(id);
});

test('numbers are sane', () => {
  for (const id of UNIT_TYPES) {
    const u = UNITS[id];
    assert.ok(u.hp > 0 && u.speed > 0 && u.radius > 0 && u.vision > 0 && u.trainTime > 0 && u.pop > 0, id);
    assert.ok(u.cost.ore >= 0 && u.cost.energy >= 0, id);
  }
  for (const id of BUILDING_TYPES) {
    const b = BUILDINGS[id];
    assert.ok(b.hp > 0 && b.buildTime > 0 && b.size[0] > 0 && b.size[1] > 0, id);
  }
});

test('docs/TECH_TREE.md tables are generated from the current data', () => {
  const md = readFileSync(DOC_PATH, 'utf8');
  assert.equal(applyTables(md, renderTables()), md, 'run `npm run docs`');
});

test('every Modern-age combat unit and defense tower has weapons', () => {
  const unarmed = new Set(['engineer', 'sea_engineer', 'transport_ship', 'cargo_plane']);
  for (const id of UNIT_TYPES) {
    if (UNITS[id].age !== 'modern' || unarmed.has(id)) continue;
    assert.ok(weaponsOf(id).length > 0, `${id} has no weapons`);
  }
  for (const id of ['watchtower', 'bunker', 'gun_turret', 'sam_site', 'coastal_battery']) assert.ok(weaponsOf(id).length > 0, id);
  for (const ws of Object.values(WEAPONS)) for (const w of ws) assert.ok(w.damage > 0 && w.range > 0 && w.cooldown > 0 && w.targets.length > 0, w.name);
});
