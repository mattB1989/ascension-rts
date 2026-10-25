// Gradual unlocks (a player option, on for new games): buildings open up as the
// town grows, so a new player starts with a handful of choices — huts, a farm,
// a logging camp, a well — and each step opens the next: a sawmill once there is
// a logging camp, a market once there are people, iron mines once there is power
// ("better mines need the grid"), and so on. Later ages are still gated by age.

import { sumTiers } from '../../data/goods.ts';
import type { World } from '../world.ts';

export type Need = { pop: number } | { built: string[] } | { technicians: number };

/** What each Modern-age building (and tool) needs before it can be built. Missing: available from the start. */
export const UNLOCKS: Record<string, Need[]> = {
  // Village
  sawmill: [{ built: ['logging_camp'] }],
  food_plant: [{ built: ['farm'] }],
  market: [{ pop: 24 }],
  pumping_station: [{ pop: 30 }],
  water_tower: [{ built: ['pumping_station', 'water_well'] }],
  warehouse: [{ built: ['market'] }],
  construction_office: [{ pop: 60 }],
  // Town
  quarry: [{ built: ['sawmill'] }, { pop: 50 }],
  cement_works: [{ built: ['quarry'] }],
  police_station: [{ built: ['market'] }, { pop: 70 }],
  clinic: [{ pop: 120 }],
  school: [{ pop: 120 }],
  oil_well: [{ built: ['cement_works'] }],
  hydro_plant: [{ built: ['cement_works'] }],
  power_plant: [{ built: ['oil_well'] }],
  wind_farm: [{ built: ['cement_works'] }, { pop: 150 }],
  regional_office: [{ pop: 150 }],
  maintenance_depot: [{ pop: 150 }],
  barracks: [{ pop: 60 }],
  // Industry: the grid comes first
  iron_mine: [{ built: ['power_plant', 'hydro_plant'] }],
  steel_mill: [{ built: ['iron_mine'] }],
  oil_refinery: [{ built: ['power_plant', 'hydro_plant'] }, { built: ['oil_well'] }, { technicians: 20 }],
  goods_factory: [{ built: ['oil_refinery'] }],
  pipe: [{ built: ['oil_refinery'] }],
  trade_port: [{ built: ['warehouse'] }, { pop: 150 }],
  coast_guard: [{ built: ['trade_port'] }],
  river_dock: [{ built: ['warehouse'] }, { pop: 200 }],
  rail: [{ built: ['steel_mill'] }],
  rail_station: [{ built: ['steel_mill'] }],
  research_institute: [{ technicians: 50 }],
  // Military
  watchtower: [{ built: ['barracks'] }],
  bunker: [{ built: ['barracks'] }, { built: ['cement_works'] }],
  supply_depot: [{ built: ['barracks'] }],
  gun_turret: [{ built: ['barracks'] }, { built: ['steel_mill'] }],
  vehicle_factory: [{ built: ['steel_mill'] }],
  shipyard: [{ built: ['steel_mill'] }, { built: ['trade_port'] }],
  airfield: [{ built: ['oil_refinery'] }],
};

export function needText(n: Need): string {
  if ('pop' in n) return `${n.pop} people`;
  if ('technicians' in n) return `${n.technicians} technicians`;
  return `a ${n.built.map((t) => t.replace(/_/g, ' ')).join(' or ')}`;
}

function met(world: World, player: number, n: Need): boolean {
  const pc = world.city!.players[player]!;
  if ('pop' in n) return sumTiers(pc.population) >= n.pop;
  if ('technicians' in n) return pc.population[1] >= n.technicians;
  return world.buildings.some((b) => b.owner === player && b.complete && n.built.includes(b.type));
}

/** Why `type` is still locked for this player (null: unlocked, or gradual unlocks are off). */
export function unlockProblem(world: World, player: number, type: string): string | null {
  const pc = world.city!.players[player]!;
  if (!pc.gradual || pc.unlocked?.includes(type)) return null;
  const needs = UNLOCKS[type];
  if (!needs) return null;
  const missing = needs.filter((n) => !met(world, player, n));
  return missing.length ? `Unlocks with ${missing.map(needText).join(' and ')}` : null;
}

/** Once a second: announce what has just opened up (and remember it, so it stays open). */
export function updateUnlocks(world: World): void {
  const city = world.city!;
  city.players.forEach((pc, id) => {
    if (!pc.gradual) return;
    pc.unlocked ??= [];
    for (const type of Object.keys(UNLOCKS)) {
      if (pc.unlocked.includes(type)) continue;
      if (UNLOCKS[type]!.every((n) => met(world, id, n))) {
        pc.unlocked.push(type);
        world.emit({ kind: 'notify', player: id, text: `🔓 New: ${type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} — ${UNLOCK_BLURB[type] ?? 'see the build bar'}` });
      }
    }
  });
}

const UNLOCK_BLURB: Record<string, string> = {
  sawmill: 'turns timber into lumber, the basic building material',
  food_plant: 'turns crops into food for markets',
  market: 'houses near one get food and grow into proper houses',
  pumping_station: 'water from a river or lake for water towers',
  water_tower: 'brings water to the houses near it',
  warehouse: 'stores goods and sends out more trucks',
  construction_office: 'more building crews',
  quarry: 'stone from deposits, for concrete',
  cement_works: 'concrete for bigger buildings',
  police_station: 'houses with police can become terraces',
  clinic: 'health for apartments',
  school: 'education for apartments',
  oil_well: 'crude oil for power and fuel',
  hydro_plant: 'clean power from a river',
  power_plant: 'power: the grid opens up mines and industry',
  wind_farm: 'clean power when the wind blows: back it with a dam or firm power',
  regional_office: 'claim a neighbouring region',
  maintenance_depot: 'keeps roads in repair',
  barracks: 'train infantry',
  iron_mine: 'iron ore, now that there is power',
  steel_mill: 'steel for buildings, vehicles and ships',
  oil_refinery: 'fuel and plastics',
  goods_factory: 'goods for apartments',
  pipe: 'pipelines carry oil and fuel without trucks',
  trade_port: 'trade overseas',
  coast_guard: 'keeps pirates off your trade',
  river_dock: 'barges along rivers and lakes',
  rail: 'railways for long hauls',
  rail_station: 'trains between distant towns',
  research_institute: 'research towards the Digital age',
  watchtower: 'sees far',
  bunker: 'a strongpoint for infantry',
  supply_depot: 'keeps troops in the field supplied',
  gun_turret: 'defence against vehicles',
  vehicle_factory: 'tanks and trucks for the army',
  shipyard: 'a navy',
  airfield: 'an air force',
};
