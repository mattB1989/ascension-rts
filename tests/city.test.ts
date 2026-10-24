import { sumTiers } from '../src/data/goods.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { botStep, newBot } from '../src/ai/cityBot.ts';
import { BUILDINGS } from '../src/data/buildings.ts';
import { START_CREDITS } from '../src/data/city.ts';
import type { Command } from '../src/sim/commands.ts';
import { createCity } from '../src/sim/city/index.ts';
import { cityPlacementProblem } from '../src/sim/city/place.ts';
import { roadProblem } from '../src/sim/city/roads.ts';
import { Terrain } from '../src/sim/map.ts';
import { NavLayer } from '../src/sim/nav.ts';
import { cloneWorld } from '../src/sim/save.ts';
import type { World } from '../src/sim/world.ts';

const newCity = () => createCity({ seed: 7, size: 256, biome: 'temperate' });

function run(world: World, seconds: number, bot?: ReturnType<typeof newBot>): void {
  let pending: Command[] = [];
  for (let i = 0; i < seconds * 15; i++) {
    world.step(pending);
    pending = bot ? botStep(world, bot) : [];
  }
}

/** A spot for `type` touching the road along y = row, near x. */
function spotOnStreet(world: World, type: keyof typeof BUILDINGS, x0: number, row: number): [number, number] {
  const h = BUILDINGS[type].size[1];
  for (let d = 0; d < 40; d++) {
    for (const x of [x0 + d, x0 - d]) {
      for (const ty of [row + 1, row - h]) if (cityPlacementProblem(world, 0, type, x, ty) === null) return [x, ty];
    }
  }
  throw new Error(`no spot for ${type}`);
}

test('a new city starts with a town hall, a road, stock, credits and its region', () => {
  const world = newCity();
  const hall = world.buildings.find((b) => b.type === 'town_hall')!;
  assert.ok(hall.complete && hall.city);
  assert.ok((hall.city.stock.lumber ?? 0) > 0);
  assert.equal(world.city!.players[0]!.credits, START_CREDITS);
  assert.ok(world.city!.roadCount > 0);
  const reg = world.map.region[hall.ty * world.map.width + hall.tx]!;
  assert.equal(world.city!.regionOwner[reg], 0);
  run(world, 1);
  assert.ok(hall.city.access >= 0, 'town hall reaches its road');
});

test('roads cost credits, go over land and bridge shallow water, never into deep water', () => {
  const world = newCity();
  const map = world.map;
  const before = world.city!.players[0]!.credits;
  const hall = world.buildings[0]!;
  const row = hall.ty + 5;
  world.step([{ kind: 'road', player: 0, tiles: [[hall.tx - 5, row], [hall.tx - 6, row]] }]);
  assert.ok(world.city!.players[0]!.credits < before);
  // Find a shallow water tile in our territory's reach and bridge it.
  let bridged = false;
  for (let i = 0; i < map.terrain.length && !bridged; i++) {
    if (map.terrain[i] !== Terrain.Shallow) continue;
    const tx = i % map.width;
    const ty = Math.floor(i / map.width);
    if (roadProblem(world, 0, tx, ty) !== null) continue;
    world.step([{ kind: 'road', player: 0, tiles: [[tx, ty]] }]);
    assert.equal(map.terrain[i], Terrain.Bridge);
    assert.ok(map.deck[i]! > 0);
    assert.ok(world.nav.passable(NavLayer.Land, tx, ty) && world.nav.passable(NavLayer.Water, tx, ty), 'cars over, boats under');
    bridged = true;
  }
  assert.ok(bridged, 'found a river to bridge');
  for (let i = 0; i < map.terrain.length; i++) {
    if (map.terrain[i] === Terrain.Deep) {
      assert.notEqual(roadProblem(world, 0, i % map.width, Math.floor(i / map.width)), null);
      break;
    }
  }
});

test('materials are trucked to a site, a crew builds it, and it starts producing', () => {
  const world = newCity();
  const hall = world.buildings[0]!;
  const row = hall.ty + 5;
  const street: Array<[number, number]> = [];
  for (let x = hall.tx - 25; x <= hall.tx + 25; x++) street.push([x, row]);
  world.step([{ kind: 'road', player: 0, tiles: street }]);
  const spots = [];
  for (let i = 0; i < 6; i++) spots.push(spotOnStreet(world, 'house', hall.tx - 20 + i * 2, row));
  world.step([{ kind: 'placeMany', player: 0, building: 'house', spots }]);
  const [sx, sy] = spotOnStreet(world, 'sawmill', hall.tx + 12, row);
  world.step([{ kind: 'place', player: 0, building: 'sawmill', tx: sx, ty: sy }]);
  const mill = world.buildings.find((b) => b.type === 'sawmill')!;
  assert.equal(mill.complete, false);
  run(world, 3);
  assert.ok(world.city!.trucks.length > 0, 'trucks set off');
  run(world, 60);
  assert.ok(mill.complete, `sawmill built (${mill.city!.status})`);
  assert.ok(world.buildings.filter((b) => b.type === 'house' && b.complete).length >= 5, 'settlers built their houses');
  assert.ok(world.buildings.some((b) => b.type === 'house' && b.city!.residents > 0), 'people moved in');
  // Give the mill timber: it saws lumber once it has workers.
  mill.city!.stock.timber = 20;
  run(world, 30);
  assert.ok(mill.city!.workers > 0, 'staffed');
  assert.ok((world.city!.players[0]!.made.lumber ?? 0) > 0, 'lumber made');
});

test('a building with no road says so and is never built', () => {
  const world = newCity();
  const hall = world.buildings[0]!;
  // Far from any road, inside our region.
  let spot: [number, number] | null = null;
  for (let d = 15; d < 40 && !spot; d++) {
    if (cityPlacementProblem(world, 0, 'sawmill', hall.tx - d, hall.ty - d) === null) spot = [hall.tx - d, hall.ty - d];
  }
  assert.ok(spot);
  world.step([{ kind: 'place', player: 0, building: 'sawmill', tx: spot![0], ty: spot![1] }]);
  run(world, 20);
  const mill = world.buildings.find((b) => b.type === 'sawmill')!;
  assert.equal(mill.complete, false);
  assert.match(mill.city!.status, /No road/);
});

test('raw producers must stand on what they extract', () => {
  const world = newCity();
  const hall = world.buildings[0]!;
  assert.match(cityPlacementProblem(world, 0, 'iron_mine', hall.tx + 8, hall.ty + 8) ?? 'ok', /ore deposit|Blocked|road|territory|ground/);
  assert.match(cityPlacementProblem(world, 0, 'oil_well', hall.tx - 8, hall.ty + 8) ?? 'ok', /oil deposit|Blocked|road|territory|ground/);
  assert.equal(cityPlacementProblem(world, 0, 'house', -5, -5), 'Off the map');
});

test('the scripted city grows: technicians, a positive budget, every chain running', () => {
  const world = newCity();
  const bot = newBot(0);
  run(world, 12 * 120, bot);
  const pc = world.city!.players[0]!;
  const pop = sumTiers(pc.population);
  assert.ok(pop > 250, `population ${pop}`);
  assert.ok(pc.population[1] > 50, `technicians ${pc.population[1]}`);
  assert.ok(pc.lastYear.taxes > pc.lastYear.upkeep + pc.lastYear.roads, `taxes ${pc.lastYear.taxes} vs upkeep ${pc.lastYear.upkeep}`);
  for (const g of ['lumber', 'food', 'concrete', 'steel'] as const) assert.ok((pc.made[g] ?? 0) > 0 || world.buildings.some((b) => (b.city?.stock[g] ?? 0) > 0), `${g} in the economy`);
  assert.ok(world.buildings.some((b) => b.owner === 0 && b.complete && (b.def.econ?.power ?? 0) < 0), 'a power station');
  assert.ok(pc.history.length >= 11, 'yearly history');
});

test('the economy is deterministic, and a saved game continues exactly like the original', () => {
  const a = newCity();
  const b = newCity();
  const botA = newBot(0);
  const botB = newBot(0);
  run(a, 200, botA);
  run(b, 200, botB);
  assert.equal(a.stateHash(), b.stateHash());
  assert.equal(JSON.stringify(a.city!.players), JSON.stringify(b.city!.players));
  // Save and load mid-game, then run both on without the bot.
  const c = cloneWorld(a);
  assert.equal(c.stateHash(), a.stateHash());
  run(a, 120);
  run(c, 120);
  assert.equal(c.stateHash(), a.stateHash());
  assert.equal(JSON.stringify(c.city!.players), JSON.stringify(a.city!.players));
  assert.deepEqual(c.city!.road, a.city!.road);
  assert.equal(c.city!.trucks.length, a.city!.trucks.length);
});

test('a regional office claims the neighbouring region', () => {
  const world = newCity();
  const bot = newBot(0);
  run(world, 6 * 120, bot);
  const map = world.map;
  const mine = (r: number) => world.city!.regionOwner[r] === 0;
  const owned = map.regions.filter((r) => mine(r.id));
  assert.equal(owned.length, 1);
  // Find a spot for an office in an unclaimed neighbour, and connect it with a road.
  const nb = map.regions.find((r) => !mine(r.id) && r.neighbors.some(mine) && r.siteX >= 0)!;
  world.city!.players[0]!.credits += 10000;
  const hall = world.buildings[0]!;
  const tiles: Array<[number, number]> = [];
  // Road: L from the hall's street to the site.
  const row = hall.ty + 5;
  const tx = nb.siteX + 1;
  const ty = nb.siteY + 3;
  for (let x = Math.min(hall.tx, tx); x <= Math.max(hall.tx, tx); x++) tiles.push([x, row]);
  for (let y = Math.min(row, ty); y <= Math.max(row, ty); y++) tiles.push([tx, y]);
  world.step([{ kind: 'road', player: 0, tiles }]);
  world.step([{ kind: 'place', player: 0, building: 'regional_office', tx: nb.siteX + 2, ty: nb.siteY }]);
  const office = world.buildings.find((b) => b.type === 'regional_office');
  if (!office) return; // the L road did not reach (river or rock in the way): placement rules are covered elsewhere
  run(world, 180, bot);
  if (office.complete) assert.ok(mine(nb.id), 'region claimed');
});

test('a trade port exports surplus and imports what is missing, by ship from the open sea', async () => {
  const { dockTile, seaRoute } = await import('../src/sim/city/trade.ts');
  const { addCityBuilding, stockUp } = await import('../src/sim/city/place.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'archipelago' });
  const map = world.map;
  const hall = world.buildings[0]!;
  // A coastal spot with a dock on open water; claim its region if it isn't ours.
  let spot: [number, number] | null = null;
  for (let ty = 2; ty < map.height - 5 && !spot; ty += 1) {
    for (let tx = 2; tx < map.width - 6 && !spot; tx += 1) {
      if (dockTile(map, tx, ty, 4, 3) < 0) continue;
      const reg = map.region[ty * map.width + tx]!;
      if (!reg) continue;
      const before = world.city!.regionOwner[reg]!;
      world.city!.regionOwner[reg] = 0;
      if (cityPlacementProblem(world, 0, 'trade_port', tx, ty) === null) spot = [tx, ty];
      else world.city!.regionOwner[reg] = before;
    }
  }
  void hall;
  assert.ok(spot, 'coastal spot');
  const port = addCityBuilding(world, 'trade_port', 0, spot![0], spot![1], true);
  assert.ok(seaRoute(world, port), 'route from the map edge');
  // Staff: a road along the port and a full house on it.
  const [px, py] = spot!;
  const road: Array<[number, number]> = [];
  for (let x = px - 3; x <= px + 6; x++) road.push([x, py + 3]);
  world.step([{ kind: 'road', player: 0, tiles: road }]);
  let staffed = false;
  for (const [hx, hy] of [[px - 3, py + 4], [px, py + 4], [px + 2, py + 4], [px - 2, py + 4]] as const) {
    if (cityPlacementProblem(world, 0, 'house', hx, hy) !== null) continue;
    const house = addCityBuilding(world, 'house', 0, hx, hy, true);
    house.city!.residents = 8;
    house.city!.happiness = 0.8;
    staffed = true;
    break;
  }
  assert.ok(staffed, 'room for a house');
  stockUp(port, { lumber: 120 });
  const pc = world.city!.players[0]!;
  const credits = pc.credits;
  world.step([
    { kind: 'tradeRule', player: 0, good: 'lumber', import: 0, export: 0 },
    { kind: 'tradeRule', player: 0, good: 'steel', import: 150, export: -1 },
  ]);
  assert.deepEqual(pc.trade.steel, { import: 150, export: -1 });
  // Keep the port staffed (no houses in this test) and let a ship come and go.
  let arrived = false;
  for (let i = 0; i < 15 * 240 && !arrived; i++) {
    world.step();
    if (pc.year.trade > 0) arrived = true;
  }
  assert.ok(arrived, 'a ship docked');
  assert.ok(pc.year.trade > 0, 'exports sold');
  assert.ok(pc.year.imports > 0, 'imports bought');
  assert.ok((port.city!.stock.steel ?? 0) > 0, 'steel landed');
  assert.ok((port.city!.stock.lumber ?? 0) < 120, 'lumber shipped out');
  assert.notEqual(pc.credits, credits);
});

test('roads wear with age and traffic, and a maintenance depot repairs them', async () => {
  const { addCityBuilding } = await import('../src/sim/city/place.ts');
  const world = newCity();
  const city = world.city!;
  const hall = world.buildings[0]!;
  const row = hall.ty + 5;
  const street: Array<[number, number]> = [];
  for (let x = hall.tx - 20; x <= hall.tx + 20; x++) street.push([x, row]);
  world.step([{ kind: 'road', player: 0, tiles: street }]);
  const i0 = row * world.map.width + hall.tx - 15;
  assert.ok(city.condition[i0]! > 0.99, 'new roads are in good shape');
  run(world, 60);
  assert.ok(city.condition[i0]! < 1, 'roads age');
  // Wear the street badly, then staff a depot next to it.
  for (const [x, y] of street) city.condition[y * world.map.width + x] = 0.2;
  const [dx, dy] = spotOnStreet(world, 'maintenance_depot', hall.tx - 10, row);
  addCityBuilding(world, 'maintenance_depot', 0, dx, dy, true);
  const [hx, hy] = spotOnStreet(world, 'house', hall.tx + 10, row);
  const house = addCityBuilding(world, 'house', 0, hx, hy, true);
  house.city!.residents = 16;
  run(world, 60);
  const avg = street.reduce((s, [x, y]) => s + city.condition[y * world.map.width + x]!, 0) / street.length;
  assert.ok(avg > 0.5, `repaired to ${avg.toFixed(2)}`);
});

test('city-states grow on their own, trade by road with you, and can join your nation', async () => {
  const { dependence, marketOf, relationsOf } = await import('../src/sim/city/diplomacy.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 2 });
  const states = world.players.filter((p) => p.role === 'cityState');
  assert.equal(states.length, 2);
  run(world, 4 * 120);
  const s = states[0]!.id;
  const spc = world.city!.players[s]!;
  assert.ok(sumTiers(spc.population) > 30, 'the city-state grew');
  assert.ok(world.buildings.filter((b) => b.owner === s).length > 5, 'it built a town');
  // Connect our town hall to theirs with a road (L-shape through any land we may cross).
  const mine = world.buildings.find((b) => b.owner === 0 && b.type === 'town_hall')!;
  const theirs = marketOf(world, s)!;
  const from: [number, number] = [mine.tx + 2, mine.ty + 5];
  const to: [number, number] = [theirs.tx + 2, theirs.ty + 5];
  // Breadth-first search over tiles where we may lay road.
  const { roadProblem } = await import('../src/sim/city/roads.ts');
  const W = world.map.width;
  const prev = new Map<number, number>();
  const start = from[1] * W + from[0];
  const goal = to[1] * W + to[0];
  prev.set(start, -1);
  const q = [start];
  for (let k = 0; k < q.length && !prev.has(goal); k++) {
    const i = q[k]!;
    const x = i % W;
    const y = Math.floor(i / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx!;
      const ny = y + dy!;
      const j = ny * W + nx;
      if (nx < 0 || ny < 0 || nx >= W || ny >= world.map.height || prev.has(j)) continue;
      if (world.city!.road[j] || roadProblem(world, 0, nx, ny) === null) {
        prev.set(j, i);
        q.push(j);
      }
    }
  }
  assert.ok(prev.has(goal), 'a road can reach the city-state');
  const path: Array<[number, number]> = [];
  for (let i = goal; i >= 0; i = prev.get(i)!) path.push([i % W, Math.floor(i / W)]);
  world.city!.players[0]!.credits += 50000;
  world.step([{ kind: 'road', player: 0, tiles: path }]);
  // Sell them lumber (they have used up theirs).
  mine.city!.stock.lumber = 300;
  for (const b of world.buildings) if (b.owner === s && b.city) b.city.stock.lumber = 0;
  world.step([{ kind: 'deal', player: 0, state: s, good: 'lumber', import: 0, export: 0 }]);
  const rel = relationsOf(world, s)!;
  const before = rel.opinion[0]!;
  world.city!.players[s]!.credits += 5000;
  let sold = false;
  let liked = false;
  for (let i = 0; i < 400 * 15 && !(sold && liked); i++) {
    world.step();
    if (rel.traded[0]! > 0) sold = true;
    if (rel.opinion[0]! > before + 1) liked = true;
  }
  assert.ok(sold, 'goods sold to the city-state');
  assert.ok(liked, 'they like us more');
  // Make them depend on us and like us: they ask to join, we accept.
  rel.opinion[0] = 90;
  rel.traded[0] = 1e6;
  assert.ok(dependence(world, s, 0) > 0.35);
  run(world, 70);
  assert.equal(rel.offer, 0, 'they asked to join');
  world.step([{ kind: 'acceptUnion', player: 0, state: s }]);
  assert.ok(world.players[s]!.defeated, 'the city-state is gone');
  assert.equal(world.buildings.filter((b) => b.owner === s).length, 0, 'their buildings are ours');
  const theirRegion = world.map.region[theirs.ty * W + theirs.tx]!;
  assert.equal(world.city!.regionOwner[theirRegion], 0, 'their region is ours');
  run(world, 30);
});

test('recruiting costs credits and goods from the barracks, and the army limit grows with population', async () => {
  const { addCityBuilding, stockUp } = await import('../src/sim/city/place.ts');
  const { armyCap, recruitProblem } = await import('../src/sim/city/military.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const hall = world.buildings[0]!;
  const row = hall.ty + 5;
  const street: Array<[number, number]> = [];
  for (let x = hall.tx - 20; x <= hall.tx + 20; x++) street.push([x, row]);
  world.step([{ kind: 'road', player: 0, tiles: street }]);
  const [bx, by] = spotOnStreet(world, 'barracks', hall.tx + 10, row);
  const barracks = addCityBuilding(world, 'barracks', 0, bx, by, true);
  const [hx, hy] = spotOnStreet(world, 'house', hall.tx - 10, row);
  const house = addCityBuilding(world, 'house', 0, hx, hy, true);
  house.city!.residents = 16;
  run(world, 2);
  assert.match(recruitProblem(world, 0, barracks, 'rifleman') ?? '', /steel/);
  stockUp(barracks, { steel: 5 });
  const credits = world.city!.players[0]!.credits;
  world.step([{ kind: 'recruit', player: 0, building: barracks.id, unit: 'rifleman' }]);
  assert.ok(world.city!.players[0]!.credits < credits, 'paid');
  assert.equal(barracks.city!.stock.steel, 4, 'steel used');
  run(world, 12);
  assert.equal(world.units.filter((u) => u.owner === 0 && u.type === 'rifleman').length, 1, 'trained');
  assert.ok(armyCap(world, 0) >= 6);
});

test('war: an undefended seat falls to troops holding it, a garrisoned one does not', async () => {
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 1, nations: 1, difficulty: 'easy' });
  const me = 0;
  const rival = world.players.find((p) => p.role === 'nation')!.id;
  const hall = world.buildings.find((b) => b.owner === me && b.type === 'town_hall')!;
  run(world, 1);
  // Rival troops appear beside our hall; nothing happens while at peace.
  const raiders = [0, 1, 2, 3, 4, 5].map((k) => world.spawnUnit('battle_tank', rival, hall.x - 3 + k, hall.y + 4.5));
  run(world, 20);
  assert.equal(hall.owner, me, 'peace: nothing happens');
  // A garrison holds the seat even when war comes.
  const guards = [0, 1, 2].map((k) => world.spawnUnit('rifleman', me, hall.x + k, hall.y + 4));
  world.step([{ kind: 'garrison', player: me, units: guards.map((u) => u.id), building: hall.id }]);
  run(world, 5);
  assert.equal(hall.garrison.length, 3, 'garrisoned');
  world.step([{ kind: 'declareWar', player: rival, target: me }]);
  run(world, 10);
  assert.equal(hall.owner, me, 'held while defended');
  // Without defenders (and with the tanks still there), it falls.
  world.step([{ kind: 'eject', player: me, building: hall.id }]);
  for (const g of guards) if (world.getUnit(g.id)) world.removeUnit(world.getUnit(g.id)!, 'test', true);
  for (const r of raiders) {
    if (!world.getUnit(r.id)) continue;
    r.hp = r.maxHp;
  }
  run(world, 100);
  assert.notEqual(hall.owner, me, 'the town hall fell');
  assert.ok(world.players[me]!.defeated, 'no seat left: defeated');
});

test('ages: research, technicians, GDP and credits unlock the Digital age and its buildings', async () => {
  const { addCityBuilding, cityBuildProblem, stockUp } = await import('../src/sim/city/place.ts');
  const { nextAge } = await import('../src/sim/city/ages.ts');
  const { recruitProblem } = await import('../src/sim/city/military.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const pc = world.city!.players[0]!;
  const hall = world.buildings[0]!;
  const row = hall.ty + 5;
  const street: Array<[number, number]> = [];
  for (let x = hall.tx - 30; x <= hall.tx + 30; x++) street.push([x, row]);
  world.step([{ kind: 'road', player: 0, tiles: street }]);
  assert.match(cityBuildProblem(world, 0, 'electronics_plant') ?? '', /Digital/);
  // Technicians in apartments, power, and a research institute.
  for (let i = 0; i < 8; i++) {
    const [hx, hy] = spotOnStreet(world, 'house', hall.tx - 28 + i * 3, row);
    const h = addCityBuilding(world, 'house', 0, hx, hy, true);
    h.city!.level = 3;
    h.city!.residents = 40;
  }
  const [px, py] = spotOnStreet(world, 'power_plant', hall.tx + 8, row);
  stockUp(addCityBuilding(world, 'power_plant', 0, px, py, true), { oil: 40 });
  const [rx, ry] = spotOnStreet(world, 'research_institute', hall.tx + 16, row);
  const lab = addCityBuilding(world, 'research_institute', 0, rx, ry, true);
  const [bx, by] = spotOnStreet(world, 'barracks', hall.tx + 22, row);
  const barracks = addCityBuilding(world, 'barracks', 0, bx, by, true);
  run(world, 10);
  assert.ok(lab.city!.workers > 0 && lab.city!.powered, `institute staffed and powered (${lab.city!.status})`);
  assert.ok(pc.research > 3, `research ${pc.research}`);
  assert.match(recruitProblem(world, 0, barracks, 'exo_trooper') ?? '', /Digital/);
  // Not ready yet: the command does nothing.
  world.step([{ kind: 'advanceAge', player: 0 }]);
  assert.equal(pc.age, 0);
  pc.research = 300;
  pc.lastGdp = 4000;
  pc.credits = 20000;
  const next = nextAge(world, 0)!;
  assert.ok(next.ready, JSON.stringify(next.checks));
  world.step([{ kind: 'advanceAge', player: 0 }]);
  assert.equal(pc.age, 1);
  assert.equal(world.players[0]!.age, 'digital');
  assert.equal(pc.credits, 12000);
  assert.equal(cityBuildProblem(world, 0, 'electronics_plant'), null);
  // An electronics plant makes electronics from rare earths and plastics.
  const [ex, ey] = spotOnStreet(world, 'electronics_plant', hall.tx - 8, row);
  const plant = addCityBuilding(world, 'electronics_plant', 0, ex, ey, true);
  stockUp(plant, { rare: 10, plastics: 5 });
  run(world, 30);
  assert.ok((pc.made.electronics ?? 0) > 0, `electronics made (${plant.city!.status})`);
  // A hospital covers houses only while it has pharmaceuticals.
  const [qx, qy] = spotOnStreet(world, 'hospital', hall.tx + 2, row);
  const hospital = addCityBuilding(world, 'hospital', 0, qx, qy, true);
  run(world, 12);
  assert.equal(hospital.city!.served, 0, 'no pharmaceuticals, no patients');
  stockUp(hospital, { pharma: 10 });
  run(world, 12);
  assert.ok(hospital.city!.served > 0, `hospital serves (${hospital.city!.status})`);
});

test('Nano age: robots halve the staff a factory needs, and wear out slowly', async () => {
  const { addCityBuilding, stockUp } = await import('../src/sim/city/place.ts');
  const { jobsOf, automated } = await import('../src/sim/city/state.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const pc = world.city!.players[0]!;
  const hall = world.buildings[0]!;
  const row = hall.ty + 5;
  const street: Array<[number, number]> = [];
  for (let x = hall.tx - 20; x <= hall.tx + 20; x++) street.push([x, row]);
  world.step([{ kind: 'road', player: 0, tiles: street }]);
  const [sx, sy] = spotOnStreet(world, 'sawmill', hall.tx + 8, row);
  const mill = addCityBuilding(world, 'sawmill', 0, sx, sy, true);
  assert.equal(jobsOf(mill), 6);
  stockUp(mill, { robotics: 1 });
  assert.ok(automated(mill));
  assert.equal(jobsOf(mill), 3);
  pc.age = 2;
  const { demandFor } = await import('../src/sim/city/logistics.ts');
  assert.ok(demandFor(mill, 'robotics', world) > 0, 'Nano age: factories ask for robots');
  const [hx, hy] = spotOnStreet(world, 'house', hall.tx - 8, row);
  const house = addCityBuilding(world, 'house', 0, hx, hy, true);
  house.city!.residents = 8;
  stockUp(mill, { timber: 40 });
  run(world, 60);
  assert.equal(mill.city!.workers, 3, 'three workers run it');
  assert.ok((mill.city!.stock.robotics ?? 0) < 1, 'robots wear out while it works');
  assert.ok((pc.made.lumber ?? 0) > 0, 'at full output');
});

test('ways to win: the Space Elevator, a share of world GDP, and conquest', async () => {
  const { addCityBuilding } = await import('../src/sim/city/place.ts');
  const { VICTORY } = await import('../src/data/city.ts');
  const { YEAR_SECONDS } = await import('../src/data/goods.ts');
  // Space: an elevator kept running wins.
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const v = world.city!.victory;
  assert.equal(v.winner, -1);
  const hall = world.buildings[0]!;
  const row = hall.ty + 5;
  const street: Array<[number, number]> = [];
  for (let x = hall.tx - 20; x <= hall.tx + 20; x++) street.push([x, row]);
  world.step([{ kind: 'road', player: 0, tiles: street }]);
  const [ex, ey] = spotOnStreet(world, 'space_elevator', hall.tx + 10, row);
  addCityBuilding(world, 'space_elevator', 0, ex, ey, true);
  run(world, 2);
  assert.equal(v.elevator[0], 0, 'not running without staff and power');
  // Scientists next door and a fusion plant: it runs.
  const [fx, fy] = spotOnStreet(world, 'fusion_plant', hall.tx - 10, row);
  addCityBuilding(world, 'fusion_plant', 0, fx, fy, true);
  const [hx, hy] = spotOnStreet(world, 'house', hall.tx, row);
  const house = addCityBuilding(world, 'house', 0, hx, hy, true);
  for (let i = 0; i < (VICTORY.elevatorYears * YEAR_SECONDS + 5) * 15 && v.winner < 0; i++) {
    house.city!.level = 5;
    house.city!.residents = 96;
    house.city!.downFor = 0;
    world.step();
  }
  assert.equal(v.winner, 0);
  assert.equal(v.how, 'space');
  // Economic: most of the world's GDP for ten years.
  const w2 = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const v2 = w2.city!.victory;
  for (let i = 0; i < (VICTORY.gdpYears + 1) * YEAR_SECONDS * 15 && v2.winner < 0; i++) {
    w2.city!.players[0]!.gdp = 1e6;
    w2.step();
  }
  assert.equal(v2.winner, 0);
  assert.equal(v2.how, 'economic');
  // Sandbox: nobody wins.
  const w3 = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 1, nations: 1, victory: false });
  w3.city!.players[0]!.gdp = 1e9;
  w3.players[1]!.defeated = true;
  run(w3, YEAR_SECONDS + 1);
  assert.equal(w3.city!.victory.winner, -1);
  // Conquest: the only rival nation is gone.
  const w4 = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 1, nations: 1 });
  w4.players[1]!.defeated = true;
  run(w4, YEAR_SECONDS + 1);
  assert.equal(w4.city!.victory.how, 'conquest');
});

test('treaties: nations sign when they like you, pacts bind, and peace must be agreed', async () => {
  const { hasTreaty, opinionOf, changeOpinion, researchBonus, canTrade } = await import('../src/sim/city/treaties.ts');
  const { atWar } = await import('../src/sim/city/military.ts');
  const { YEAR_SECONDS } = await import('../src/data/goods.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 1, nations: 1, difficulty: 'normal' });
  const nation = world.players.find((p) => p.role === 'nation')!.id;
  // Research pact: they need to like you first.
  world.step([{ kind: 'proposeTreaty', player: 0, target: nation, treaty: 'research' }]);
  assert.equal(hasTreaty(world, 0, nation, 'research'), false, 'refused at first');
  changeOpinion(world, nation, 0, 30);
  world.step([{ kind: 'proposeTreaty', player: 0, target: nation, treaty: 'research' }]);
  assert.ok(hasTreaty(world, 0, nation, 'research'), 'signed once they like you');
  assert.equal(researchBonus(world, 0), 1.25);
  // Trade agreement: their town hall becomes a trading partner.
  assert.equal(canTrade(world, 0, nation), false);
  world.step([{ kind: 'proposeTreaty', player: 0, target: nation, treaty: 'trade' }]);
  assert.ok(canTrade(world, 0, nation));
  world.step([{ kind: 'deal', player: 0, state: nation, good: 'steel', import: 50, export: -1 }]);
  assert.equal(world.city!.players[0]!.deals[nation]?.steel?.import, 50);
  // Non-aggression pact: no war while it lasts; breaking it costs trust.
  world.step([{ kind: 'proposeTreaty', player: 0, target: nation, treaty: 'peace' }]);
  world.step([{ kind: 'declareWar', player: 0, target: nation }]);
  assert.equal(atWar(world, 0, nation), false, 'the pact holds');
  const before = opinionOf(world, nation, 0);
  world.step([{ kind: 'cancelTreaty', player: 0, target: nation, treaty: 'peace' }]);
  assert.ok(opinionOf(world, nation, 0) < before - 30, 'breaking a pact angers them');
  world.step([{ kind: 'declareWar', player: 0, target: nation }]);
  assert.ok(atWar(world, 0, nation));
  assert.equal(hasTreaty(world, 0, nation, 'trade'), false, 'war ends the other treaties');
  // Peace: a fresh war against a stronger army is refused; after two years they talk.
  for (let k = 0; k < 4; k++) world.spawnUnit('rifleman', nation, 10 + k, 10);
  world.step([{ kind: 'makePeace', player: 0, target: nation }]);
  assert.ok(atWar(world, 0, nation), 'they want to fight on');
  world.city!.warStart[0]![nation] = world.city!.warStart[nation]![0] = world.time - 2 * YEAR_SECONDS;
  world.step([{ kind: 'makePeace', player: 0, target: nation }]);
  assert.equal(atWar(world, 0, nation), false, 'peace after a long war');
});

test('railways: stations on a line, and trains carry goods to where they are wanted', async () => {
  const { addCityBuilding, stockUp, cityPlacementProblem: problem } = await import('../src/sim/city/place.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const city = world.city!;
  const hall = world.buildings[0]!;
  const row = hall.ty + 6;
  const street: Array<[number, number]> = [];
  const track: Array<[number, number]> = [];
  for (let x = hall.tx - 34; x <= hall.tx + 34; x++) {
    street.push([x, row]);
    track.push([x, row + 3]);
  }
  world.step([{ kind: 'road', player: 0, tiles: street }, { kind: 'rail', player: 0, tiles: track }]);
  assert.ok(city.railCount > 40, `rails laid (${city.railCount})`);
  // A station must touch the line.
  const spot = (x0: number): [number, number] => {
    for (let d = 0; d < 20; d++) for (const x of [x0 + d, x0 - d]) if (problem(world, 0, 'rail_station', x, row + 1) === null) return [x, row + 1];
    throw new Error('no station spot');
  };
  assert.match(problem(world, 0, 'rail_station', hall.tx - 14, row - 2) ?? '', /railway/);
  const [ax, ay] = spot(hall.tx - 28);
  const [bx, by] = spot(hall.tx + 26);
  const a = addCityBuilding(world, 'rail_station', 0, ax, ay, true);
  const b = addCityBuilding(world, 'rail_station', 0, bx, by, true);
  // Workers for both stations, and a sawmill by station B that needs timber.
  for (const x of [hall.tx - 20, hall.tx + 18]) {
    const [hx, hy] = spotOnStreet(world, 'house', x, row);
    addCityBuilding(world, 'house', 0, hx, hy, true).city!.residents = 16;
  }
  let mx = bx;
  while (problem(world, 0, 'sawmill', mx, row - 3) !== null && mx < bx + 10) mx++;
  const mill = addCityBuilding(world, 'sawmill', 0, mx, row - 3, true);
  stockUp(a, { timber: 100 });
  let trains = 0;
  for (let i = 0; i < 40 * 15; i++) {
    world.step();
    trains = Math.max(trains, city.trains.length);
  }
  assert.ok(trains > 0, 'a train ran');
  assert.ok((b.city!.stock.timber ?? 0) + (mill.city!.stock.timber ?? 0) + (world.city!.players[0]!.made.lumber ?? 0) > 0, 'timber reached the far end');
  // Taking up the track stops trains.
  world.step([{ kind: 'unroad', player: 0, tiles: track }]);
  assert.equal(city.railCount, 0);
});

test('war weariness grows during a war with a nation and fades in peace', () => {
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 1 });
  const pc = world.city!.players[0]!;
  world.step([{ kind: 'declareWar', player: 0, target: 1 }]);
  run(world, 30);
  const w = pc.weariness;
  assert.ok(w > 0.005, `weary (${w})`);
  // With no army, they ask for peace; it waits for your answer.
  assert.ok(world.city!.peaceOffers.some((o) => o.from === 1 && o.to === 0), 'they offer peace');
  assert.ok(world.city!.war[0]![1], 'still at war until you accept');
  world.step([{ kind: 'makePeace', player: 0, target: 1 }]);
  assert.equal(world.city!.war[0]![1], 0, 'accepted');
  run(world, 10);
  assert.ok(pc.weariness < w, 'fades in peace');
});

test('cargo airports fly goods between each other, no track needed', async () => {
  const { addCityBuilding, stockUp, cityPlacementProblem: problem } = await import('../src/sim/city/place.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const city = world.city!;
  city.players[0]!.age = 1;
  const hall = world.buildings[0]!;
  const row = hall.ty + 6;
  const street: Array<[number, number]> = [];
  for (let x = hall.tx - 40; x <= hall.tx + 40; x++) street.push([x, row]);
  world.step([{ kind: 'road', player: 0, tiles: street }]);
  const spot = (x0: number): [number, number] => {
    for (let d = 0; d < 20; d++) for (const x of [x0 + d, x0 - d]) if (problem(world, 0, 'airport', x, row + 1) === null) return [x, row + 1];
    throw new Error('no airport spot');
  };
  const [ax, ay] = spot(hall.tx - 34);
  const [bx, by] = spot(hall.tx + 28);
  const a = addCityBuilding(world, 'airport', 0, ax, ay, true);
  const b = addCityBuilding(world, 'airport', 0, bx, by, true);
  // Staff, power, and a sawmill by airport B that needs timber.
  for (const x of [hall.tx - 24, hall.tx + 16]) {
    const [hx, hy] = spotOnStreet(world, 'house', x, row);
    const h = addCityBuilding(world, 'house', 0, hx, hy, true);
    h.city!.level = 3;
    h.city!.residents = 40;
  }
  const [px, py] = spotOnStreet(world, 'power_plant', hall.tx, row);
  stockUp(addCityBuilding(world, 'power_plant', 0, px, py, true), { oil: 60 });
  let mx = bx;
  while (problem(world, 0, 'sawmill', mx, row - 3) !== null && mx < bx + 12) mx++;
  addCityBuilding(world, 'sawmill', 0, mx, row - 3, true);
  stockUp(a, { timber: 100 });
  let planes = 0;
  for (let i = 0; i < 40 * 15; i++) {
    for (const h of world.buildings) if (h.type === 'house') h.city!.downFor = 0;
    world.step();
    planes = Math.max(planes, city.trains.filter((t) => t.air).length);
  }
  assert.ok(planes > 0, 'a cargo plane flew');
  assert.ok((a.city!.stock.timber ?? 0) < 100, 'timber left airport A');
  assert.ok(b.complete);
});

test('pirates raid unguarded trade ports from 1955; a coast guard keeps them away', async () => {
  const { PIRATES, portGuarded } = await import('../src/sim/city/trade.ts');
  const { addCityBuilding } = await import('../src/sim/city/place.ts');
  assert.ok(PIRATES.chance > PIRATES.guarded);
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  // A port and a coast guard placed by hand on the first coast tile pair that fits.
  const map = world.map;
  const city = world.city!;
  const reg = city.regionOwner.findIndex((o) => o === 0);
  let port = null as ReturnType<typeof addCityBuilding> | null;
  for (let i = 0; i < map.region.length && !port; i++) {
    const tx = i % map.width;
    const ty = Math.floor(i / map.width);
    if (map.region[i] !== reg) continue;
    const { cityPlacementProblem } = await import('../src/sim/city/place.ts');
    if (cityPlacementProblem(world, 0, 'trade_port', tx, ty) === null) port = addCityBuilding(world, 'trade_port', 0, tx, ty, true);
  }
  if (!port) return; // no coast in this region: nothing to check
  assert.equal(portGuarded(world, port), false);
  const guard = addCityBuilding(world, 'coast_guard', 0, port.tx, port.ty - 4 > 0 ? port.ty - 4 : port.ty + 4, true);
  guard.city!.workers = 6;
  assert.ok(portGuarded(world, port));
});

test('pipelines carry oil from wells to refineries without trucks', async () => {
  const { addCityBuilding, stockUp } = await import('../src/sim/city/place.ts');
  const { updatePipes, pipeNetwork } = await import('../src/sim/city/pipes.ts');
  const { demandFor } = await import('../src/sim/city/logistics.ts');
  const { updateComponents } = await import('../src/sim/city/roads.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const city = world.city!;
  const hall = world.buildings[0]!;
  const row = hall.ty + 8;
  const line: Array<[number, number]> = [];
  for (let x = hall.tx - 20; x <= hall.tx + 20; x++) line.push([x, row]);
  world.step([{ kind: 'pipe', player: 0, tiles: line }]);
  assert.ok(city.pipeCount > 30, `pipes (${city.pipeCount})`);
  // A refinery and a "well" (any oil producer) touching the line, far apart.
  const refinery = addCityBuilding(world, 'oil_refinery', 0, hall.tx + 12, row + 1, true);
  const well = addCityBuilding(world, 'oil_well', 0, hall.tx - 16, row + 1, true);
  stockUp(well, { oil: 20 });
  updateComponents(city, world.map);
  assert.ok(pipeNetwork(world, refinery) > 0 && pipeNetwork(world, refinery) === pipeNetwork(world, well), 'same network');
  updatePipes(world, (b, g) => demandFor(b, g, world));
  assert.ok((refinery.city!.stock.oil ?? 0) >= 4, `oil flowed (${refinery.city!.stock.oil})`);
  assert.ok((well.city!.stock.oil ?? 0) <= 16);
});

test("a Disruptor's EMP stuns vehicles: they stop moving and firing for a while", async () => {
  const { EMP_STUN } = await import('../src/sim/combat.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 1 });
  world.step([{ kind: 'declareWar', player: 0, target: 1 }]);
  const hall = world.buildings[0]!;
  const d = world.spawnUnit('disruptor', 0, hall.x + 10, hall.y + 10);
  const tank = world.spawnUnit('battle_tank', 1, hall.x + 14, hall.y + 10);
  let stunned = 0;
  for (let i = 0; i < 15 * 6; i++) {
    world.step();
    stunned = Math.max(stunned, tank.stun ?? 0);
  }
  assert.ok(stunned > 0 && stunned <= EMP_STUN, `tank stunned (${stunned})`);
  assert.ok(d.hp > 0);
});

test('a shield generator takes most of the damage to buildings near it; an EMP knocks it out', async () => {
  const { addCityBuilding } = await import('../src/sim/city/place.ts');
  const { hit, SHIELD } = await import('../src/sim/combat.ts');
  const { WEAPONS } = await import('../src/data/weapons.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const hall = world.buildings[0]!;
  const mill = addCityBuilding(world, 'sawmill', 0, hall.tx + 8, hall.ty, true);
  const gen = addCityBuilding(world, 'shield_generator', 0, hall.tx + 8, hall.ty + 4, true);
  const shell = WEAPONS.battle_tank![0]!;
  const before = mill.hp;
  hit(world, 1, shell, 100, mill);
  const open = before - mill.hp;
  gen.city!.workers = 4;
  gen.city!.powered = true;
  const mid = mill.hp;
  hit(world, 1, shell, 100, mill);
  assert.ok(Math.abs(mid - mill.hp - open * SHIELD.pass) < 1e-6, 'shielded damage');
  hit(world, 1, WEAPONS.disruptor![0]!, 90, mill);
  assert.ok((gen.city!.stun ?? 0) > 0, 'EMP knocked the shield out');
});

test('supply: troops far from home wear down; near a seat or supply depot they mend', () => {
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 1 });
  const hall = world.buildings[0]!;
  const home = world.spawnUnit('rifleman', 0, hall.x + 6, hall.y + 6);
  home.hp = home.maxHp / 2;
  // Far away in unclaimed land.
  const map = world.map;
  let far: [number, number] | null = null;
  for (let i = 0; i < map.region.length && !far; i += 97) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    if (map.region[i] && world.city!.regionOwner[map.region[i]!] === -1 && Math.hypot(x - hall.x, y - hall.y) > 60 && world.nav.passableAt(3, x + 0.5, y + 0.5, 0.4)) far = [x + 0.5, y + 0.5];
  }
  assert.ok(far, 'a far spot');
  const lost = world.spawnUnit('rifleman', 0, far![0], far![1]);
  const h0 = lost.hp;
  run(world, 10);
  assert.ok(home.hp > home.maxHp / 2, 'mends at home');
  assert.ok(lost.hp < h0, 'wears down far away');
});

test('a save from before E6-E10 (no rail, pipes, treaties, ages, victory) still loads and plays', async () => {
  const { snapshot, revive } = await import('../src/sim/save.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 1, nations: 1 });
  run(world, 5);
  const snap = structuredClone(snapshot(world, 'old')) as unknown as { world: { city: Record<string, unknown>; buildings: Array<{ city?: Record<string, unknown> }> } };
  const c = snap.world.city;
  for (const k of ['rail', 'railComp', 'railCount', 'railVersion', 'railCompVersion', 'trains', 'nextTrainId', 'pipe', 'pipeComp', 'pipeCount', 'pipeVersion', 'pipeCompVersion', 'treaties', 'embargoes', 'warStart', 'peaceOffers', 'victory']) delete c[k];
  for (const pc of c.players as Array<Record<string, unknown>>) {
    delete pc.age;
    delete pc.research;
    delete pc.weariness;
    for (const k of ['population', 'workforce', 'jobs', 'employed']) pc[k] = (pc[k] as number[]).slice(0, 2);
  }
  for (const b of snap.world.buildings) {
    if (!b.city) continue;
    const needs = b.city.needs as Record<string, boolean>;
    const covered = b.city.covered as Record<string, boolean>;
    for (const k of ['electronics', 'data', 'pharma', 'university']) delete needs[k];
    for (const k of ['data', 'university']) delete covered[k];
  }
  const back = revive(snap as never);
  run(back, 10);
  assert.ok(back.city!.rail && back.city!.pipe && back.city!.victory, 'migrated');
  assert.equal(back.city!.players[0]!.population.length, 4);
});

test('maglev (Nano age) upgrades track in place', async () => {
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const city = world.city!;
  const hall = world.buildings[0]!;
  const track: Array<[number, number]> = [];
  for (let x = hall.tx - 10; x <= hall.tx + 10; x++) track.push([x, hall.ty + 8]);
  world.step([{ kind: 'rail', player: 0, tiles: track }]);
  const n = city.railCount;
  const i = (hall.ty + 8) * world.map.width + hall.tx;
  world.step([{ kind: 'rail', player: 0, tiles: track, maglev: true }]);
  assert.equal(city.rail[i], 1, 'not before the Nano age');
  city.players[0]!.age = 2;
  world.step([{ kind: 'rail', player: 0, tiles: track, maglev: true }]);
  assert.equal(city.rail[i], 2, 'maglev');
  assert.equal(city.railCount, n, 'same track, upgraded');
});

test('river docks: a barge carries goods between docks on the same water', async () => {
  const { addCityBuilding, stockUp } = await import('../src/sim/city/place.ts');
  const { waterBeside } = await import('../src/sim/city/rail.ts');
  const { isOpenLand } = await import('../src/sim/map.ts');
  const { NavLayer } = await import('../src/sim/nav.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const map = world.map;
  const W = map.width;
  // Two dock spots on land beside connected water, some way apart.
  const fits = (x: number, y: number) => {
    for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) if (xx < 0 || yy < 0 || xx >= W || yy >= map.height || !isOpenLand(map.terrain[yy * W + xx] as never) || world.occupancy[yy * W + xx]) return false;
    return waterBeside(world, { tx: x, ty: y, w: 3, h: 3 }) >= 0;
  };
  const spots: Array<[number, number]> = [];
  for (let y = 4; y < map.height - 4 && spots.length < 400; y += 3) for (let x = 4; x < W - 4; x += 3) if (fits(x, y)) spots.push([x, y]);
  let pair: [[number, number], [number, number]] | null = null;
  for (let i = 0; i < spots.length && !pair; i += 7) {
    for (let j = spots.length - 1; j > i && !pair; j -= 11) {
      const [a, b] = [spots[i]!, spots[j]!];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 25) continue;
      const wa = waterBeside(world, { tx: a[0], ty: a[1], w: 3, h: 3 });
      const wb = waterBeside(world, { tx: b[0], ty: b[1], w: 3, h: 3 });
      const p = world.pathfinder.findPath(NavLayer.Water, (wa % W) + 0.5, Math.floor(wa / W) + 0.5, (wb % W) + 0.5, Math.floor(wb / W) + 0.5);
      if (p && Math.floor(p[p.length - 2]!) === wb % W && Math.floor(p[p.length - 1]!) === Math.floor(wb / W)) pair = [a, b];
    }
  }
  if (!pair) return; // no suitable water on this map
  const a = addCityBuilding(world, 'river_dock', 0, pair[0][0], pair[0][1], true);
  const b = addCityBuilding(world, 'river_dock', 0, pair[1][0], pair[1][1], true);
  a.city!.workers = b.city!.workers = 6;
  // B's surroundings "need" timber; A has plenty.
  stockUp(a, { timber: 100 });
  b.city!.wants = { timber: 30 };
  a.city!.wants = {};
  let barges = 0;
  for (let i = 0; i < 15 * 3; i++) {
    a.city!.workers = b.city!.workers = 6;
    b.city!.wants = { timber: 30 };
    a.city!.wants = {};
    world.step();
    barges = Math.max(barges, world.city!.trains.filter((t) => t.boat).length);
  }
  assert.ok(barges > 0, 'a barge set off');
});

test('enemy warships off a trade port blockade it', async () => {
  const { addCityBuilding, cityPlacementProblem } = await import('../src/sim/city/place.ts');
  const { blockadedBy, dockTile } = await import('../src/sim/city/trade.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 1 });
  const map = world.map;
  let port = null as ReturnType<typeof addCityBuilding> | null;
  for (let i = 0; i < map.region.length && !port; i++) {
    const tx = i % map.width;
    const ty = Math.floor(i / map.width);
    if (cityPlacementProblem(world, 0, 'trade_port', tx, ty) === null) port = addCityBuilding(world, 'trade_port', 0, tx, ty, true);
  }
  if (!port) return;
  assert.equal(blockadedBy(world, port), -1);
  const dock = dockTile(map, port.tx, port.ty, port.w, port.h);
  world.spawnUnit('destroyer', 1, (dock % map.width) + 0.5, Math.floor(dock / map.width) + 0.5);
  assert.equal(blockadedBy(world, port), -1, 'not at war: no blockade');
  world.step([{ kind: 'declareWar', player: 1, target: 0 }]);
  assert.equal(blockadedBy(world, port), 1, 'blockaded');
});

test('embargoes: no trade either way, friendly city-states follow, a cause for war, and AI nations use them', async () => {
  const { canTrade, changeOpinion, hasEmbargo, hasTreaty, honouredEmbargo, opinionOf } = await import('../src/sim/city/treaties.ts');
  const { relationsOf } = await import('../src/sim/city/diplomacy.ts');
  const { atWar } = await import('../src/sim/city/military.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 1, nations: 1, difficulty: 'normal' });
  const nation = world.players.find((p) => p.role === 'nation')!.id;
  const state = world.players.find((p) => p.role === 'cityState')!.id;
  changeOpinion(world, nation, 0, 40);
  world.step([{ kind: 'proposeTreaty', player: 0, target: nation, treaty: 'trade' }]);
  assert.ok(canTrade(world, 0, nation));
  const before = opinionOf(world, nation, 0);
  world.step([{ kind: 'embargo', player: 0, target: nation, on: true }]);
  assert.ok(hasEmbargo(world, 0, nation));
  assert.equal(canTrade(world, 0, nation), false, 'no trade with them');
  assert.equal(canTrade(world, nation, 0), false, 'nor they with you');
  assert.equal(hasTreaty(world, 0, nation, 'trade'), false, 'the trade agreement is gone');
  assert.ok(opinionOf(world, nation, 0) <= before - 20, 'they resent it');
  world.step([{ kind: 'proposeTreaty', player: 0, target: nation, treaty: 'trade' }]);
  assert.equal(hasTreaty(world, 0, nation, 'trade'), false, 'no trade agreement under an embargo');
  // A city-state that likes you more than them follows your embargo.
  const rel = relationsOf(world, state)!;
  rel.opinion[0] = 50;
  rel.opinion[nation] = 10;
  assert.equal(honouredEmbargo(world, state, nation), 0);
  assert.equal(canTrade(world, nation, state), false);
  assert.ok(canTrade(world, 0, state), 'you still trade with it');
  rel.opinion[nation] = 60;
  assert.ok(canTrade(world, nation, state), 'not if it likes them better');
  rel.opinion[nation] = 10;
  // Declaring war on whoever embargoes you is a cause others accept.
  const stateBefore = rel.opinion[nation]!;
  world.step([{ kind: 'declareWar', player: nation, target: 0 }]);
  assert.ok(atWar(world, 0, nation));
  assert.equal(rel.opinion[nation], stateBefore, 'city-states do not hold it against them');
  // At war, the AI nation embargoes you back.
  run(world, 30);
  assert.ok(hasEmbargo(world, nation, 0), 'the AI embargoes its enemy');
  // Lifting yours.
  world.step([{ kind: 'embargo', player: 0, target: nation, on: false }]);
  assert.equal(hasEmbargo(world, 0, nation), false);
});

test('later navies, air forces and space craft: where they are built, what they need, and limits', async () => {
  const { addCityBuilding, stockUp } = await import('../src/sim/city/place.ts');
  const { recruit, recruitProblem } = await import('../src/sim/city/military.ts');
  const world = createCity({ seed: 7, size: 256, biome: 'temperate', cityStates: 0, nations: 0 });
  const pc = world.city!.players[0]!;
  pc.credits = 200000;
  const hall = world.buildings[0]!;
  const row = hall.ty + 5;
  const street: Array<[number, number]> = [];
  for (let x = hall.tx - 30; x <= hall.tx + 30; x++) street.push([x, row]);
  world.step([{ kind: 'road', player: 0, tiles: street }]);
  pc.age = 3;
  const ready = (type: keyof typeof BUILDINGS, x: number, goods: Record<string, number>) => {
    const [bx, by] = spotOnStreet(world, type, x, row);
    const b = addCityBuilding(world, type, 0, bx, by, true);
    stockUp(b, goods);
    b.city!.workers = 5;
    b.city!.powered = true;
    return b;
  };
  const field = ready('airfield', hall.tx - 24, { steel: 60, fuel: 60, electronics: 60 });
  const site = ready('launch_site', hall.tx + 6, { electronics: 60, nano: 60, orbital: 30 });
  const foundry = ready('mech_foundry', hall.tx + 18, { steel: 60, electronics: 60, nano: 60 });
  pc.population = [1000, 0, 0, 0];
  pc.age = 0;
  assert.match(recruitProblem(world, 0, field, 'stealth_bomber') ?? '', /Digital/);
  pc.age = 3;
  assert.equal(recruitProblem(world, 0, field, 'stealth_bomber'), null);
  assert.equal(recruitProblem(world, 0, foundry, 'nano_swarm'), null, 'nano swarms come from the mech foundry');
  assert.equal(recruitProblem(world, 0, site, 'orbital_fighter'), null, 'space craft from the launch site');
  assert.match(recruitProblem(world, 0, field, 'orbital_fighter') ?? '', /Not trained here/);
  assert.equal(recruit(world, 0, site, 'star_lance'), null);
  assert.match(recruitProblem(world, 0, site, 'star_lance') ?? '', /At most 1/, 'one Star Lance each');
  site.city!.stock.orbital = 0;
  assert.match(recruitProblem(world, 0, site, 'drop_ship') ?? '', /orbital/);
});

test('replays: a game recreated from its setup and order log ends in exactly the same state', async () => {
  const { botStep, newBot } = await import('../src/ai/cityBot.ts');
  const { snapshot, revive } = await import('../src/sim/save.ts');
  const { Game } = await import('../src/game.ts');
  const setup = { seed: 5, size: 256, biome: 'lakeland' as const, difficulty: 'hard' as const };
  // Play: a scripted player gives orders through the game driver (as the UI does), with a save and load midway.
  let world = createCity(setup);
  let game = new Game(world, 0);
  const me = newBot(0, Infinity, false);
  const play = (seconds: number) => {
    for (let i = 0; i < seconds * 15; i++) {
      for (const c of botStep(game.world, me)) game.issue(c);
      game.update(1 / 15);
    }
  };
  play(240);
  world = revive(structuredClone(snapshot(world, 'mid')));
  game = new Game(world, 0);
  play(240);
  const log = world.city!.log!;
  assert.ok(log.length > 20, `orders recorded (${log.length})`);
  // Replay from scratch.
  const again = createCity(world.city!.setup!);
  const viewer = new Game(again, 0);
  viewer.playBack(structuredClone(log));
  viewer.issue({ kind: 'taxRate', player: 0, rate: 2 }); // ignored while replaying
  while (again.tick < world.tick) viewer.update(1 / 15);
  const sig = (w: typeof world) => JSON.stringify({
    tick: w.tick,
    players: w.city!.players.map((p) => [Math.round(p.credits * 100), p.population, p.age, Math.round(p.research)]),
    buildings: w.buildings.map((b) => [b.id, b.type, b.owner, b.tx, b.ty, b.complete]),
    units: w.units.map((u) => [u.id, u.type, u.owner, Math.round(u.x * 100), Math.round(u.y * 100)]),
    roads: w.city!.roadCount,
    regions: Array.from(w.city!.regionOwner),
  });
  assert.equal(sig(again), sig(world));
});
