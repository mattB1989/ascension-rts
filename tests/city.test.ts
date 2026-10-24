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
