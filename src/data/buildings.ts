import { CITY_BUILDINGS, MILITARY_ECON } from './city.ts';
import type { BuildingDef } from './types.ts';

// Starting values; the balance harness (M4) will tune them. See TECH_TREE.md §3 and §4.
const RTS_BUILDINGS = {
  // --- Core / housing -------------------------------------------------------
  command_center: {
    id: 'command_center', name: 'Command Center', category: 'core', age: 'modern', requires: [],
    cost: { ore: 1000, energy: 0 }, buildTime: 120, hp: 4000, size: [4, 4], placement: 'land', pop: 10, vision: 11,
    builtBy: 'engineer', dropOff: ['ore'], garrison: 10,
    mode: 'skirmish',
    description: 'Trains Engineers, accepts Ore, advances the age. Can garrison 10 infantry.',
  },
  habitat_block: {
    id: 'habitat_block', name: 'Habitat Block', category: 'housing', age: 'modern', requires: ['command_center'],
    cost: { ore: 100, energy: 0 }, buildTime: 20, hp: 600, size: [2, 2], placement: 'land', pop: 10, vision: 4,
    builtBy: 'engineer',
    mode: 'skirmish',
    description: 'Housing: +10 population.',
  },
  arcology: {
    id: 'arcology', name: 'Arcology', category: 'housing', age: 'nano', requires: ['habitat_block'],
    cost: { ore: 300, energy: 150 }, buildTime: 45, hp: 1500, size: [3, 3], placement: 'land', pop: 30, vision: 5,
    builtBy: 'engineer',
    mode: 'skirmish',
    description: 'Large housing: +30 population. Slowly heals nearby infantry.',
  },
  // --- Resource -------------------------------------------------------------
  ore_refinery: {
    id: 'ore_refinery', name: 'Ore Refinery', category: 'resource', age: 'modern', requires: ['command_center'],
    cost: { ore: 150, energy: 0 }, buildTime: 30, hp: 1200, size: [3, 3], placement: 'land', pop: 0, vision: 5,
    builtBy: 'engineer', dropOff: ['ore'],
    mode: 'skirmish',
    description: 'Ore drop-off. Build it next to ore fields to shorten trips. Mining research.',
  },
  oil_derrick: {
    id: 'oil_derrick', name: 'Oil Derrick', category: 'resource', age: 'modern', requires: ['command_center'],
    cost: { ore: 100, energy: 0 }, buildTime: 25, hp: 700, size: [2, 2], placement: 'landOil', pop: 0, vision: 4,
    builtBy: 'engineer', produces: { resource: 'energy', perSecond: 1.5 },
    mode: 'skirmish',
    description: 'Built on land oil. Produces Energy on its own.',
  },
  offshore_rig: {
    id: 'offshore_rig', name: 'Offshore Rig', category: 'resource', age: 'modern', requires: ['shipyard'],
    cost: { ore: 200, energy: 0 }, buildTime: 40, hp: 1000, size: [3, 3], placement: 'seaOil', pop: 0, vision: 6,
    builtBy: 'sea_engineer', produces: { resource: 'energy', perSecond: 2.5 }, tank: { capacity: 150, pipeline: 1 },
    mode: 'skirmish',
    description: 'Built on sea oil by a Sea Engineer. Pumps 2.5 oil/s into its tank; 1/s flows ashore by pipeline, Sea Engineers haul the rest to a Shipyard.',
  },
  fusion_plant: {
    id: 'fusion_plant', name: 'Fusion Plant', category: 'resource', age: 'nano', requires: ['research_lab'],
    cost: { ore: 600, energy: 0 }, buildTime: 60, hp: 1500, size: [3, 3], placement: 'land', pop: 0, vision: 4,
    builtBy: 'engineer', produces: { resource: 'energy', perSecond: 4 },
    mode: 'skirmish',
    description: 'Produces Energy anywhere. Explodes when destroyed.',
  },
  // --- Military production --------------------------------------------------
  barracks: {
    id: 'barracks', name: 'Barracks', category: 'military', age: 'modern', requires: ['command_center'],
    cost: { ore: 200, energy: 0 }, buildTime: 35, hp: 1500, size: [3, 3], placement: 'land', pop: 0, vision: 5,
    builtBy: 'engineer',
    description: 'Trains infantry.',
  },
  vehicle_factory: {
    id: 'vehicle_factory', name: 'Vehicle Factory', category: 'military', age: 'modern', requires: ['barracks'],
    cost: { ore: 300, energy: 100 }, buildTime: 45, hp: 2000, size: [4, 4], placement: 'land', pop: 0, vision: 5,
    builtBy: 'engineer',
    description: 'Builds land vehicles.',
  },
  shipyard: {
    id: 'shipyard', name: 'Shipyard', category: 'military', age: 'modern', requires: ['barracks'],
    cost: { ore: 300, energy: 100 }, buildTime: 45, hp: 2000, size: [4, 4], placement: 'coast', pop: 0, vision: 7,
    builtBy: 'engineer', dropOff: ['energy'],
    description: 'Builds ships and submarines. Must touch the water. Sea Engineers unload oil here.',
  },
  airfield: {
    id: 'airfield', name: 'Airfield', category: 'military', age: 'modern', requires: ['radar_station', 'vehicle_factory'],
    cost: { ore: 350, energy: 200 }, buildTime: 55, hp: 2000, size: [6, 5], placement: 'land', pop: 0, vision: 6,
    builtBy: 'engineer', dock: 4,
    description: 'Builds aircraft. 4 parking spots where planes land to refuel and repair.',
  },
  mech_foundry: {
    id: 'mech_foundry', name: 'Mech Foundry', category: 'military', age: 'digital', requires: ['research_lab', 'vehicle_factory'],
    cost: { ore: 600, energy: 400 }, buildTime: 70, hp: 3000, size: [5, 5], placement: 'land', pop: 0, vision: 6,
    builtBy: 'engineer',
    description: 'Builds giant mechs.',
  },
  spaceport: {
    id: 'spaceport', name: 'Spaceport', category: 'military', age: 'space', requires: ['airfield'],
    cost: { ore: 800, energy: 800 }, buildTime: 80, hp: 3000, size: [5, 5], placement: 'land', pop: 0, vision: 8,
    builtBy: 'engineer',
    description: 'Builds orbital units.',
  },
  // --- Tech / support / special ---------------------------------------------
  radar_station: {
    id: 'radar_station', name: 'Radar Station', category: 'tech', age: 'modern', requires: ['barracks'],
    cost: { ore: 200, energy: 50 }, buildTime: 30, hp: 900, size: [2, 2], placement: 'land', pop: 0, vision: 16,
    builtBy: 'engineer',
    description: 'Large vision radius, enemy blips on the minimap, detects stealth aircraft.',
  },
  research_lab: {
    id: 'research_lab', name: 'Research Lab', category: 'tech', age: 'modern', requires: ['vehicle_factory'],
    cost: { ore: 300, energy: 200 }, buildTime: 50, hp: 1500, size: [3, 3], placement: 'land', pop: 0, vision: 5,
    builtBy: 'engineer',
    description: 'Global research. Needed on the path to the Nano Age.',
  },
  repair_depot: {
    id: 'repair_depot', name: 'Repair Depot', category: 'support', age: 'digital', requires: ['vehicle_factory'],
    cost: { ore: 250, energy: 100 }, buildTime: 35, hp: 1200, size: [3, 3], placement: 'land', pop: 0, vision: 5,
    builtBy: 'engineer',
    description: 'Repairs vehicles and mechs nearby.',
  },
  missile_silo: {
    id: 'missile_silo', name: 'Missile Silo', category: 'special', age: 'nano', requires: ['research_lab'],
    cost: { ore: 1500, energy: 1500 }, buildTime: 120, hp: 3000, size: [3, 3], placement: 'land', pop: 0, vision: 4,
    builtBy: 'engineer', limit: 1,
    description: 'Nuclear strike every 5 minutes. The enemy is warned 15 s before impact.',
  },
  orbital_uplink: {
    id: 'orbital_uplink', name: 'Orbital Uplink', category: 'special', age: 'space', requires: ['radar_station'],
    cost: { ore: 1000, energy: 1200 }, buildTime: 90, hp: 2500, size: [3, 3], placement: 'land', pop: 0, vision: 8,
    builtBy: 'engineer', limit: 1,
    description: 'Orbital laser strike and satellite scan powers.',
  },
  space_elevator: {
    id: 'space_elevator', name: 'Space Elevator', category: 'wonder', age: 'space', requires: ['spaceport'],
    cost: { ore: 5000, energy: 5000 }, buildTime: 300, hp: 10000, size: [6, 6], placement: 'land', pop: 0, vision: 10,
    builtBy: 'engineer', limit: 1,
    description: 'Build it and hold it for 5 minutes to win. Revealed to all players.',
  },
  // --- Defense (M3) ---------------------------------------------------------
  wall: {
    id: 'wall', name: 'Wall segment', category: 'defense', age: 'modern', requires: ['command_center'],
    cost: { ore: 10, energy: 0 }, buildTime: 4, hp: 800, size: [1, 1], placement: 'land', pop: 0, vision: 2,
    builtBy: 'engineer',
    description: 'Drag to draw a line. Concrete → Composite → Nanocrete (self-repairing) → Hardlight (blocks shots).',
  },
  gate: {
    id: 'gate', name: 'Gate', category: 'defense', age: 'modern', requires: ['wall'],
    cost: { ore: 50, energy: 0 }, buildTime: 12, hp: 1200, size: [2, 1], placement: 'land', pop: 0, vision: 3,
    builtBy: 'engineer',
    description: 'Opens for your units only; lockable.',
  },
  watchtower: {
    id: 'watchtower', name: 'Watchtower', category: 'defense', age: 'modern', requires: ['barracks'],
    cost: { ore: 125, energy: 0 }, buildTime: 20, hp: 900, size: [1, 1], placement: 'land', pop: 0, vision: 9,
    builtBy: 'engineer', garrison: 4,
    description: 'Garrison 4 infantry who fire with +2 range. Tall: extra vision and range.',
  },
  bunker: {
    id: 'bunker', name: 'Bunker', category: 'defense', age: 'modern', requires: ['barracks'],
    cost: { ore: 200, energy: 0 }, buildTime: 25, hp: 1800, size: [2, 2], placement: 'land', pop: 0, vision: 6,
    builtBy: 'engineer', garrison: 6,
    description: 'Garrison 6 infantry. Very high armor, weak to artillery.',
  },
  gun_turret: {
    id: 'gun_turret', name: 'Gun Turret', category: 'defense', age: 'modern', requires: ['barracks'],
    cost: { ore: 150, energy: 25 }, buildTime: 20, hp: 900, size: [1, 1], placement: 'land', pop: 0, vision: 8,
    builtBy: 'engineer',
    description: 'Auto-cannon. Good against light vehicles.',
  },
  sam_site: {
    id: 'sam_site', name: 'SAM Site', category: 'defense', age: 'modern', requires: ['radar_station'],
    cost: { ore: 200, energy: 100 }, buildTime: 25, hp: 800, size: [2, 2], placement: 'land', pop: 0, vision: 10,
    builtBy: 'engineer',
    description: 'Long-range anti-air.',
  },
  coastal_battery: {
    id: 'coastal_battery', name: 'Coastal Battery', category: 'defense', age: 'modern', requires: ['shipyard'],
    cost: { ore: 300, energy: 100 }, buildTime: 35, hp: 1500, size: [2, 2], placement: 'coast', pop: 0, vision: 10,
    builtBy: 'engineer',
    description: 'Long-range heavy guns against ships.',
  },
  sonar_net: {
    id: 'sonar_net', name: 'Sonar Net', category: 'defense', age: 'modern', requires: ['shipyard'],
    cost: { ore: 100, energy: 50 }, buildTime: 15, hp: 300, size: [1, 1], placement: 'water', pop: 0, vision: 6,
    builtBy: 'sea_engineer',
    description: 'Placed on water. Reveals submerged submarines nearby.',
  },
  missile_tower: {
    id: 'missile_tower', name: 'Missile Tower', category: 'defense', age: 'digital', requires: ['radar_station'],
    cost: { ore: 350, energy: 200 }, buildTime: 35, hp: 1400, size: [1, 1], placement: 'land', pop: 0, vision: 10,
    builtBy: 'engineer', garrison: 4,
    description: 'Garrisonable; hits ground and air. Can upgrade a Watchtower in place.',
  },
  laser_tower: {
    id: 'laser_tower', name: 'Laser Tower', category: 'defense', age: 'nano', requires: ['gun_turret'],
    cost: { ore: 400, energy: 300 }, buildTime: 35, hp: 1400, size: [1, 1], placement: 'land', pop: 0, vision: 9,
    builtBy: 'engineer',
    description: 'Beam ramps up on the same target: shreds mechs and heavy armor.',
  },
  shield_generator: {
    id: 'shield_generator', name: 'Shield Generator', category: 'defense', age: 'nano', requires: ['research_lab'],
    cost: { ore: 800, energy: 600 }, buildTime: 60, hp: 1500, size: [2, 2], placement: 'land', pop: 0, vision: 6,
    builtBy: 'engineer',
    description: 'Nano age. Buildings within 12 tiles take only a quarter of the damage while it is staffed and powered. An EMP knocks it out for a few seconds.',
  },
  point_defense_array: {
    id: 'point_defense_array', name: 'Point Defense Array', category: 'defense', age: 'space', requires: ['sam_site'],
    cost: { ore: 700, energy: 700 }, buildTime: 45, hp: 1500, size: [2, 2], placement: 'land', pop: 0, vision: 10,
    builtBy: 'engineer',
    description: 'Shoots down missiles, shells, bombs and incoming nukes in its radius.',
  },
} as const satisfies Record<string, BuildingDef>;

/** Skirmish military buildings get economy-game costs too (they exist in both games). */
const withEcon = <T extends Record<string, BuildingDef>>(defs: T): T => {
  const out = { ...defs } as Record<string, BuildingDef>;
  for (const [id, econ] of Object.entries(MILITARY_ECON)) if (out[id]) out[id] = { ...out[id]!, econ };
  return out as T;
};

export const BUILDINGS = { ...withEcon(RTS_BUILDINGS), ...CITY_BUILDINGS } as const;

export type BuildingTypeId = keyof typeof BUILDINGS;
export const BUILDING_TYPES = Object.keys(BUILDINGS) as BuildingTypeId[];

export function buildingDef(id: BuildingTypeId): BuildingDef {
  return BUILDINGS[id];
}
