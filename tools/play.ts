// Play Ascension from the command line, one step at a time: made for AI agents
// (or anyone with a terminal). The game lives in a save file between commands, so
// an agent can look, think, act and advance time at its own pace; rival nations and
// city-states are played by the built-in AI. You are player 0.
//
//   node --experimental-strip-types --no-warnings tools/play.ts <command> [args] [--file game.bin]
//
// Commands:
//   new [seed] [size] [biome] [difficulty] [rivals] [scenario]   start a game (size 256 or 512)
//   rules                       how the game works, in brief
//   state                       the nation at a glance (money, people, problems, goals, neighbours)
//   buildings [type]            every building you own: id, place, staff, status
//   info <id>                   one building in detail
//   map [x y] [radius]          ASCII map around a point (default: your town hall)
//   catalog                     what you can build now: cost, size, staff, what it makes
//   spots <type> [n]            good places for a building (valid, near your roads)
//   build <type> <x> <y>        place a building (x, y = top-left tile)
//   road <x1> <y1> <x2> <y2>    lay a road: along x first, then y (an L)
//   demolish <id>               remove a building
//   tax <rate>                  tax rate, e.g. 1.2 for 120%
//   advance-age                 reach the next age when ready
//   diplomacy                   neighbours: city-states and nations
//   do '<json>'                 any game command, e.g. '{"kind":"deal","state":5,"good":"steel","import":50,"export":-1}'
//                               overseas trade (needs a Trade Port): '{"kind":"tradeRule","good":"food","import":100,"export":-1}'
//                               (import up to N, 0 = off; export above N, -1 = off); recruit: '{"kind":"recruit","building":ID,"unit":"rifleman"}'
//   advance <seconds>           let time run (120 s = one year; at most 1200 per call)
//
// Every command prints what happened, including the game's own messages.

import { readFileSync, writeFileSync } from 'node:fs';
import { deserialize, serialize } from 'node:v8';
import { BUILDINGS, type BuildingTypeId } from '../src/data/buildings.ts';
import { CITY_PALETTE, HOUSE_LEVELS } from '../src/data/city.ts';
import { GOODS, sumTiers, TIERS, type GoodId } from '../src/data/goods.ts';
import { AGES } from '../src/data/ages.ts';
import { createCity } from '../src/sim/city/index.ts';
import { cityBuildProblem, cityPlacementProblem, landYield } from '../src/sim/city/place.ts';
import { nextAge } from '../src/sim/city/ages.ts';
import { victoryProgress, VICTORY_NAMES } from '../src/sim/city/victory.ts';
import { dependence, marketOf, purchasePrice } from '../src/sim/city/diplomacy.ts';
import { opinionOf, hasTreaty } from '../src/sim/city/treaties.ts';
import { atWar } from '../src/sim/city/military.ts';
import { gameYear } from '../src/sim/city/economy.ts';
import { scenarioById } from '../src/sim/city/scenarios.ts';
import { revive, snapshot, type SaveFile } from '../src/sim/save.ts';
import { isWater, Terrain, type TerrainId } from '../src/sim/map.ts';
import type { GenBiome } from '../src/sim/mapgen.ts';
import type { Command } from '../src/sim/commands.ts';
import type { World } from '../src/sim/world.ts';
import type { Building } from '../src/sim/types.ts';
import type { BuildingDef } from '../src/data/types.ts';

const ME = 0;
const args = process.argv.slice(2);
const fileAt = args.indexOf('--file');
const FILE = fileAt >= 0 ? args.splice(fileAt, 2)[1]! : 'ascension-game.bin';
const [cmd, ...rest] = args;

interface Saved {
  save: SaveFile;
  /** Recent messages for you. */
  news: string[];
}

function load(): { world: World; news: string[] } {
  const s = deserialize(readFileSync(FILE)) as Saved;
  return { world: revive(s.save), news: s.news };
}

function store(world: World, news: string[]): void {
  writeFileSync(FILE, serialize({ save: snapshot(world, 'cli'), news: news.slice(-40) } satisfies Saved));
}

const fmt = (n: number) => Math.round(n).toLocaleString('en');
const date = (w: World) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Math.floor(((w.time % 120) / 120) * 12)]} ${gameYear(w)}`;
};
const hall = (w: World) => w.buildings.find((b) => b.owner === ME && b.type === 'town_hall') ?? w.buildings.find((b) => b.owner === ME && b.type === 'regional_office');
const mine = (w: World) => w.buildings.filter((b) => b.owner === ME);

/** Run one tick with these commands; return the messages for you. */
function step(world: World, cmds: Command[] = []): string[] {
  const out: string[] = [];
  world.step(cmds);
  for (const c of cmds) world.city!.log?.push({ tick: world.tick - 1, cmd: c });
  for (const e of world.events) {
    if (e.kind === 'notify' && (e.player === ME || e.player === -1)) out.push(`[${date(world)}] ${e.text}`);
    if (e.kind === 'victory') out.push(`[${date(world)}] 🏆 ${e.how === 'scenario' ? (e.player === ME ? 'Scenario complete!' : 'Scenario failed.') : `${world.players[e.player]?.name} won (${e.how})`}`);
    if (e.kind === 'defeated' && e.player === ME) out.push(`[${date(world)}] ☠ You have been defeated.`);
  }
  return out;
}

function act(c: Record<string, unknown>): void {
  const { world, news } = load();
  const command = { ...c, player: ME } as unknown as Command;
  const msgs = step(world, [command]);
  // Give construction a moment to register before reporting.
  console.log(msgs.length ? msgs.join('\n') : 'OK');
  store(world, [...news, ...msgs]);
}

const RULES = `ASCENSION — economy-first nation builder, 1950 onwards. You are player 0.
Time: 120 game seconds = 1 year. Nothing happens until you "advance".
Core loop: houses supply workers; workers staff farms, mines and factories; trucks carry goods along
roads; markets feed households; taxes (per resident) pay for upkeep and construction.
- Roads first: every building must touch a road on its edge, connected to the Town Hall's network.
- Construction: you pay credits at once; trucks then deliver materials (lumber, concrete, steel) from
  stock, and a crew from the Town Hall builds it. Keep lumber/concrete in stock.
- Houses: place on a street; settlers move in while people are happy. A house grows a level when its
  needs are met: Cottage → House (food, water) → Terrace (+power, police; Technicians) → Apartment
  (+goods, health, school) → Tower (Digital age) → Spire (Nano age).
- Food: Farm (needs fertile land) → crops → Food Plant → food → Market near the houses. Or a Fishing Harbour.
- Water: Pumping Station touching a river/lake + Water Towers near houses (same road network).
- Wood: Logging Camp near forest → timber → Sawmill → lumber.
- Stone/steel/oil: Quarry → Cement Works (concrete); Iron Mine → Steel Mill (steel); Oil Well → Power Plant
  (power) or Refinery (fuel, plastics) → Goods Factory (goods). Heavy industry needs Technicians.
- Power reaches buildings along roads. Services (police, clinic, school) cover houses within some road tiles.
- Expand: a Regional Office in an unclaimed neighbouring region claims it. A Trade Port trades overseas
  (set import/export rules with the "tradeRule" command).
- Neighbours: city-states trade with you by road (set "deal"s); they may ask to join you, or you can buy
  them. Rival nations (AI) trade, sign treaties, embargo and may declare war; units are recruited at
  Barracks/Vehicle Factory etc. ("recruit" command), paid in credits and goods.
- Ages: Research Institutes + enough Technicians + yearly GDP + a price → Digital, then Nano, then Space.
- Win: economic (50% of world GDP for 10 years), federation (half the regions, mostly peacefully),
  space (run a Space Elevator 5 years) or conquest.
Tips: check "state" often; its Problems list says what each building lacks. Don't overbuild: upkeep
is charged every year whether a building works or not.`;

function stateText(w: World): string {
  const city = w.city!;
  const pc = city.players[ME]!;
  const lines: string[] = [];
  const ly = pc.lastYear;
  const net = ly.taxes + ly.trade - ly.imports - ly.upkeep - ly.roads - ly.construction - ly.military;
  lines.push(`${date(w)} · ${AGES[(['modern', 'digital', 'nano', 'space'] as const)[pc.age]!].name} · ₡${fmt(pc.credits)} (last year net ${net >= 0 ? '+' : ''}${fmt(net)}) · tax ${Math.round(pc.taxRate * 100)}%`);
  lines.push(`Last year: taxes +${fmt(ly.taxes)}, exports +${fmt(ly.trade)}, imports −${fmt(ly.imports)}, upkeep −${fmt(ly.upkeep)}, roads −${fmt(ly.roads)}, construction −${fmt(ly.construction)}, military −${fmt(ly.military)} · GDP ₡${fmt(pc.lastGdp)}`);
  lines.push(`People ${fmt(sumTiers(pc.population))}: ` + TIERS.map((t, i) => `${t.name} ${pc.population[i]} (jobs ${pc.jobs[i]}, employed ${pc.employed[i]})`).filter((_, i) => pc.population[i] || pc.jobs[i]).join(', ') + ` · happiness ${Math.round(pc.happiness * 100)}%`);
  lines.push(`Power ${Math.round(pc.powerSupply)} MW supply / ${Math.round(pc.powerDemand)} MW demand${pc.powerDemand > pc.powerSupply + 0.5 ? ' ⚠ SHORTAGE: unpowered houses lose a level' : ''} · research ${Math.round(pc.research)} · army ${w.units.filter((u) => u.owner === ME).length}`);
  const stock = (Object.keys(GOODS) as GoodId[]).filter((g) => (pc.stockpile[g] ?? 0) >= 1).map((g) => `${g} ${Math.floor(pc.stockpile[g]!)}`);
  lines.push(`Goods in stock: ${stock.join(', ') || 'none'}`);
  // Buildings.
  const own = mine(w);
  const houses = own.filter((b) => b.type === 'house');
  const levels = HOUSE_LEVELS.map((l, i) => [l.name, houses.filter((h) => h.city?.level === i).length] as const).filter(([, n]) => n);
  const missing: Record<string, number> = {};
  for (const h of houses) for (const [k, v] of Object.entries(h.city?.needs ?? {})) if (!v && (HOUSE_LEVELS[Math.min(5, (h.city?.level ?? 0) + 1)]?.needs as readonly string[] | undefined)?.includes(k)) missing[k] = (missing[k] ?? 0) + 1;
  lines.push(`Houses ${houses.length}: ${levels.map(([n, c]) => `${c} ${n}`).join(', ') || '—'}${Object.keys(missing).length ? ` · lacking for the next level: ${Object.entries(missing).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}`);
  const counts: Record<string, number> = {};
  for (const b of own) if (b.type !== 'house') counts[b.type + (b.complete ? '' : ' (building)')] = (counts[b.type + (b.complete ? '' : ' (building)')] ?? 0) + 1;
  lines.push(`Other buildings: ${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ')}`);
  const problems = own.filter((b) => b.type !== 'house' && b.city?.status && !/^(Working|OK|Idle — storage|Storing|All roads in reach)/i.test(b.city.status));
  if (problems.length) {
    lines.push('Problems:');
    for (const b of problems.slice(0, 25)) lines.push(`  #${b.id} ${b.type} at ${b.tx},${b.ty}: ${b.city!.status}`);
    if (problems.length > 25) lines.push(`  … and ${problems.length - 25} more (see "buildings")`);
  }
  const next = nextAge(w, ME);
  if (next) lines.push(`Next age (${next.name}): ` + next.checks.map((c) => `${c.label} ${fmt(c.have)}/${fmt(c.need)} ${c.ok ? '✓' : '✗'}`).join(' · ') + (next.ready ? ' → READY: use "advance-age"' : ''));
  const sc = scenarioById(city.victory.scenario);
  if (sc) lines.push(`Scenario ${sc.name}: ${sc.goal} — ${sc.progress(w).text}${city.victory.scenarioDone ? ` (${city.victory.scenarioDone})` : ''}`);
  if (city.victory.on) lines.push('Ways to win:\n' + victoryProgress(w, ME).map((g) => `  ${VICTORY_NAMES[g.kind]} ${Math.round(g.frac * 100)}%: ${g.text}`).join('\n'));
  if (city.victory.winner >= 0) lines.push(`🏆 ${w.players[city.victory.winner]!.name} has won (${city.victory.how}).`);
  const wars = w.players.filter((p) => p.id !== ME && atWar(w, ME, p.id)).map((p) => p.name);
  if (wars.length) lines.push(`⚔ AT WAR with ${wars.join(', ')}`);
  return lines.join('\n');
}

function buildingLine(b: Building): string {
  const c = b.city;
  const e = b.def.econ;
  const staff = e?.jobs ? ` staff ${c?.workers ?? 0}/${e.jobs.count} ${TIERS[e.jobs.tier]!.short}` : '';
  const lvl = b.type === 'house' && c ? ` ${HOUSE_LEVELS[c.level]!.name} ${Math.floor(c.residents)} people` : '';
  return `#${b.id} ${b.type} at ${b.tx},${b.ty} (${b.w}x${b.h})${b.complete ? '' : ' UNDER CONSTRUCTION'}${staff}${lvl}${c?.status ? ` — ${c.status}` : ''}`;
}

const TERRAIN_CHAR: Record<number, string> = {
  [Terrain.Deep]: '~', [Terrain.Shallow]: '-', [Terrain.Beach]: ':', [Terrain.Grass]: '.', [Terrain.Forest]: 'T',
  [Terrain.Rock]: '^', [Terrain.Bridge]: '=', [Terrain.Sand]: ':', [Terrain.Fertile]: ',', [Terrain.Snow]: '*',
};

function mapText(w: World, cx: number, cy: number, r: number): string {
  const map = w.map;
  const city = w.city!;
  const x0 = Math.max(0, cx - r);
  const y0 = Math.max(0, cy - Math.round(r * 0.6));
  const x1 = Math.min(map.width - 1, cx + r);
  const y1 = Math.min(map.height - 1, cy + Math.round(r * 0.6));
  const grid: string[][] = [];
  for (let y = y0; y <= y1; y++) {
    const row: string[] = [];
    for (let x = x0; x <= x1; x++) {
      const i = y * map.width + x;
      let ch = TERRAIN_CHAR[map.terrain[i] as TerrainId] ?? '?';
      const d = map.deposit[i];
      if (d && !isWater(map.terrain[i] as TerrainId)) ch = ['', 'o', 'x', 's', 'r', 'u'][d] ?? ch;
      if (city.rail?.[i]) ch = '|';
      if (city.pipe?.[i]) ch = 'p';
      if (city.road[i]) ch = map.terrain[i] === Terrain.Bridge ? '=' : '#';
      row.push(ch);
    }
    grid.push(row);
  }
  // Buildings: a letter per type (yours upper case, others lower case), legend below.
  const letters = new Map<string, string>();
  const pool = 'ABCDEFGIJKLMNOPQRSUVWXYZ';
  for (const b of w.buildings) {
    if (b.tx + b.w < x0 || b.tx > x1 || b.ty + b.h < y0 || b.ty > y1) continue;
    if (!letters.has(b.type)) letters.set(b.type, b.type === 'house' ? 'H' : b.type === 'town_hall' ? '@' : pool[letters.size % pool.length]!);
    const l = letters.get(b.type)!;
    for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) if (y >= y0 && y <= y1 && x >= x0 && x <= x1) grid[y - y0]![x - x0] = b.owner === ME ? l : l.toLowerCase();
  }
  const head = '      ' + Array.from({ length: x1 - x0 + 1 }, (_, k) => ((x0 + k) % 10 === 0 ? String(((x0 + k) / 10) % 10) : ' ')).join('');
  const out = [`x ${x0}..${x1}, y ${y0}..${y1} (tens digit of x shown above)`, head];
  grid.forEach((row, k) => out.push(`${String(y0 + k).padStart(4)}  ${row.join('')}`));
  out.push('Legend: ~ deep water, - shallow, : sand/beach, . grass, , fertile, T forest, ^ rock, * snow, = bridge, # road, | rail, p pipe; deposits o ore, s stone, x oil, r rare earth, u uranium.');
  out.push('Buildings (yours upper case, others lower): ' + [...letters].map(([t, l]) => `${l}=${t}`).join(', '));
  // Regions: who owns what is around.
  return out.join('\n');
}

function catalogText(w: World): string {
  const out: string[] = [];
  for (const tab of CITY_PALETTE) {
    out.push(`${tab.tab}:`);
    for (const t of tab.items) {
      const def: BuildingDef = BUILDINGS[t as BuildingTypeId];
      if (!def?.econ) continue;
      const e = def.econ;
      const why = cityBuildProblem(w, ME, t as BuildingTypeId);
      const mats = Object.entries(e.materials).map(([g, n]) => `${n} ${g}`).join(' ');
      const outs = e.recipe ? Object.entries(e.recipe.out).map(([g, n]) => `${n} ${g}`).join('+') : '';
      const ins = e.recipe ? Object.entries(e.recipe.in).map(([g, n]) => `${n} ${g}`).join('+') : '';
      const recipe = e.recipe ? ` · ${outs ? `makes ${outs}` : 'burns'}${ins ? `${outs ? ' from' : ''} ${ins}` : ''} per ${e.recipe.seconds}s` : '';
      const extra = [e.jobs ? `staff ${e.jobs.count} ${TIERS[e.jobs.tier]!.name}` : '', e.power ? (e.power < 0 ? `makes ${-e.power} MW` : `uses ${e.power} MW`) : '', e.service ? `${e.service.kind} for ${e.service.capacity} within ${e.service.radius}` : '', e.storage ? `stores ${e.storage}` : '', def.placement && def.placement !== 'land' ? `placement: ${def.placement}` : ''].filter(Boolean).join(', ');
      out.push(`  ${t} ${def.size[0]}x${def.size[1]} ₡${e.credits}${mats ? ` + ${mats}` : ''}, upkeep ₡${e.upkeep}/yr${recipe}${extra ? ` · ${extra}` : ''}${why ? `  [${why}]` : ''}`);
    }
  }
  return out.join('\n');
}

/** Valid spots for a building near your seat, touching a road. */
function spots(w: World, type: BuildingTypeId, n: number): Array<[number, number, number]> {
  const h = hall(w);
  if (!h) return [];
  const map = w.map;
  const def = BUILDINGS[type];
  const [bw, bh] = def.size;
  const out: Array<[number, number, number]> = [];
  const touchesRoad = (tx: number, ty: number) => {
    for (let x = tx - 1; x <= tx + bw; x++) for (const y of [ty - 1, ty + bh]) if (x >= 0 && y >= 0 && x < map.width && y < map.height && w.city!.road[y * map.width + x]) return true;
    for (let y = ty; y < ty + bh; y++) for (const x of [tx - 1, tx + bw]) if (x >= 0 && x < map.width && w.city!.road[y * map.width + x]) return true;
    return false;
  };
  const cx = Math.floor(h.x);
  const cy = Math.floor(h.y);
  for (let r = 0; r < 70 && out.length < n; r++) {
    for (let dy = -r; dy <= r && out.length < n; dy++) {
      for (let dx = -r; dx <= r && out.length < n; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (cityPlacementProblem(w, ME, type, tx, ty) !== null) continue;
        if (type !== 'regional_office' && !touchesRoad(tx, ty)) continue;
        out.push([tx, ty, r]);
        if (out.length >= n * 4) break;
      }
    }
  }
  return out;
}

function diplomacyText(w: World): string {
  const out: string[] = [];
  for (const p of w.players) {
    if (p.id === ME || p.defeated) continue;
    const m = marketOf(w, p.id);
    if (p.role === 'cityState') {
      const rel = w.city!.players[p.id]!.relations!;
      out.push(`City-state #${p.id} ${p.name}: town hall at ${m ? `${m.tx},${m.ty}` : '?'}, people ${sumTiers(w.city!.players[p.id]!.population)}, opinion of you ${Math.round(rel.opinion[ME] ?? 0)}, dependence ${Math.round(dependence(w, p.id, ME) * 100)}%, price to buy ₡${fmt(purchasePrice(w, p.id))}${rel.offer === ME ? ' — ASKS TO JOIN YOU ({"kind":"acceptUnion","state":' + p.id + '})' : ''}${atWar(w, ME, p.id) ? ' — AT WAR' : ''}`);
    } else {
      const bot = w.city!.bots.find((b) => b.player === p.id);
      const treaties = (['peace', 'research', 'trade'] as const).filter((k) => hasTreaty(w, ME, p.id, k));
      out.push(`Nation #${p.id} ${p.name} (${bot?.personality ?? '?'}): people ${sumTiers(w.city!.players[p.id]!.population)}, army ${w.units.filter((u) => u.owner === p.id).length}, opinion of you ${Math.round(opinionOf(w, p.id, ME))}${atWar(w, ME, p.id) ? ', AT WAR' : ''}${treaties.length ? `, treaties: ${treaties.join(', ')}` : ''}${m ? `, capital at ${m.tx},${m.ty}` : ''}`);
    }
  }
  out.push('Commands: {"kind":"deal","state":ID,"good":G,"import":N,"export":-1|N}, {"kind":"buyState","state":ID}, {"kind":"proposeTreaty","target":ID,"treaty":"peace|research|trade"}, {"kind":"declareWar","target":ID}, {"kind":"makePeace","target":ID}, {"kind":"embargo","target":ID,"on":true}');
  return out.join('\n');
}

function main(): void {
  switch (cmd) {
    case 'new': {
      const [seed, size, biome, difficulty, rivals, scenario] = rest;
      const sc = scenarioById(scenario);
      const world = sc
        ? createCity({ ...sc.setup, scenario: sc.id })
        : createCity({ seed: Number(seed ?? 7), size: Number(size ?? 256), biome: (biome ?? 'temperate') as GenBiome, difficulty: (difficulty ?? 'normal') as 'normal', nations: rivals !== undefined ? Number(rivals) : undefined });
      const news = step(world);
      store(world, news);
      console.log(`New game on ${world.map.name} (${world.map.width}x${world.map.height}). You are ${world.players[ME]!.name}.\n`);
      console.log(stateText(world));
      const h = hall(world)!;
      console.log(`\nYour town hall is at ${h.tx},${h.ty}. Try: map, catalog, spots house 10.`);
      return;
    }
    case 'rules':
      console.log(RULES);
      return;
    case 'state': {
      const { world, news } = load();
      console.log(stateText(world));
      if (news.length) console.log('\nRecent messages:\n' + news.slice(-12).join('\n'));
      return;
    }
    case 'buildings': {
      const { world } = load();
      for (const b of mine(world).filter((b) => !rest[0] || b.type === rest[0])) console.log(buildingLine(b));
      return;
    }
    case 'info': {
      const { world } = load();
      const b = world.getBuilding(Number(rest[0]));
      if (!b) return console.log('No such building');
      if (b.owner !== ME) console.log(`(owned by ${world.players[b.owner]?.name})`);
      console.log(buildingLine(b));
      const h = hall(world);
      if (b.city && h?.city) console.log(`connected to your town hall's road network: ${b.city.access >= 0 && b.city.comp === h.city.comp ? 'yes' : 'NO — trucks and crews cannot reach it'}`);
      const c = b.city;
      if (c) {
        const stock = Object.entries(c.stock).filter(([, v]) => (v ?? 0) >= 0.5).map(([g, v]) => `${g} ${Math.floor(v!)}`);
        console.log(`stock: ${stock.join(', ') || 'empty'} · powered ${c.powered} · road access ${c.access >= 0} · efficiency ${Math.round((c.efficiency ?? 0) * 100)}%${b.type === 'house' ? ` · needs met: ${Object.entries(c.needs).filter(([, v]) => v).map(([k]) => k).join(', ')}` : ''}`);
      }
      console.log(b.def.description ?? '');
      return;
    }
    case 'map': {
      const { world } = load();
      const h = hall(world)!;
      const x = rest[0] !== undefined ? Number(rest[0]) : Math.floor(h.x);
      const y = rest[1] !== undefined ? Number(rest[1]) : Math.floor(h.y);
      console.log(mapText(world, x, y, Number(rest[2] ?? 30)));
      return;
    }
    case 'catalog': {
      const { world } = load();
      console.log(catalogText(world));
      return;
    }
    case 'spots': {
      const { world } = load();
      const type = rest[0] as BuildingTypeId;
      if (!BUILDINGS[type]) return console.log('Unknown building type (see catalog)');
      const why = cityBuildProblem(world, ME, type);
      if (why) console.log(`Note: ${why}`);
      const n = Number(rest[1] ?? 8);
      const def: BuildingDef = BUILDINGS[type];
      const graded = def.econ?.extract || ['fertile', 'forest', 'coast', 'stone', 'ore', 'oil', 'rare', 'uranium'].includes(def.placement ?? '');
      const found = spots(world, type, graded ? n * 4 : n).map(([x, y, r]) => ({ x, y, r, q: graded ? landYield(world.map, def, x, y).yield : 1 }));
      if (graded) found.sort((a, b) => b.q - a.q || a.r - b.r);
      console.log(found.length ? found.slice(0, n).map((f) => `${f.x},${f.y} (${f.r} from the town hall${graded ? `, land ${Math.round(f.q * 100)}%` : ''})`).join('\n') : 'No valid spot next to your roads near the town hall: build roads towards suitable land (see map).');
      return;
    }
    case 'build': {
      const [type, x, y] = rest;
      const { world } = load();
      const why = cityBuildProblem(world, ME, type as BuildingTypeId) ?? cityPlacementProblem(world, ME, type as BuildingTypeId, Number(x), Number(y));
      if (why) return console.log(`Can't build ${type} at ${x},${y}: ${why}`);
      return act({ kind: 'place', building: type, tx: Number(x), ty: Number(y) });
    }
    case 'road': {
      const [x1, y1, x2, y2] = rest.map(Number) as [number, number, number, number];
      const tiles: Array<[number, number]> = [];
      for (let x = x1; x !== x2 + Math.sign(x2 - x1 || 1); x += Math.sign(x2 - x1 || 1)) tiles.push([x, y1]);
      for (let y = y1 + Math.sign(y2 - y1); y2 !== y1 && y !== y2 + Math.sign(y2 - y1); y += Math.sign(y2 - y1)) tiles.push([x2, y]);
      const { world } = load();
      const w0 = world.map.width;
      const was = tiles.filter(([x, y]) => world.city!.road[y * w0 + x]).length;
      const credits = world.city!.players[ME]!.credits;
      act({ kind: 'road', tiles });
      const after = load().world;
      const now = tiles.filter(([x, y]) => after.city!.road[y * w0 + x]).length;
      console.log(`${now - was} new road tiles (${now} of ${tiles.length} on the line are road), cost ₡${fmt(credits - after.city!.players[ME]!.credits)}`);
      return;
    }
    case 'demolish':
      return act({ kind: 'demolish', building: Number(rest[0]) });
    case 'tax':
      return act({ kind: 'taxRate', rate: Number(rest[0]) });
    case 'advance-age':
      return act({ kind: 'advanceAge' });
    case 'diplomacy': {
      const { world } = load();
      console.log(diplomacyText(world));
      return;
    }
    case 'do':
      return act(JSON.parse(rest.join(' ')) as Record<string, unknown>);
    case 'advance': {
      const secs = Math.max(1, Math.min(1200, Number(rest[0] ?? 30)));
      const { world, news } = load();
      const msgs: string[] = [];
      for (let i = 0; i < secs * 15; i++) msgs.push(...step(world));
      store(world, [...news, ...msgs]);
      if (msgs.length) console.log(msgs.slice(-25).join('\n') + '\n');
      console.log(stateText(world));
      return;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  }
}

main();
