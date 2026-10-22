import type { UnitDef } from './types.ts';

// Starting values; the balance harness (M4) will tune them. See TECH_TREE.md §5.
// Combat stats (weapons, damage) arrive with combat in M3.
export const UNITS = {
  // --- Builders -------------------------------------------------------------
  engineer: {
    id: 'engineer', name: 'Engineer', domain: 'land', armor: 'inf', age: 'modern',
    cost: { ore: 50, energy: 0 }, pop: 1, hp: 60, speed: 1.7, turnRate: 12, radius: 0.3, vision: 5, move: 'infantry',
    trainedAt: 'command_center', trainTime: 12, builder: 'engineer', gatherRate: 0.9,
    strongVs: '—', weakVs: 'everything',
    description: 'Gathers Ore, builds and repairs. Can garrison.',
  },
  sea_engineer: {
    id: 'sea_engineer', name: 'Sea Engineer', domain: 'sea', armor: 'ship', age: 'modern',
    cost: { ore: 120, energy: 0 }, pop: 1, hp: 200, speed: 3.2, turnRate: 2.2, radius: 0.7, vision: 6, move: 'ship',
    trainedAt: 'shipyard', trainTime: 18, builder: 'sea_engineer', haul: { rate: 10, capacity: 40 },
    strongVs: '—', weakVs: 'everything',
    description: 'Work boat. Builds Offshore Rigs and Sonar Nets, and hauls oil from rigs to a Shipyard.',
  },
  // --- Modern: infantry -----------------------------------------------------
  rifleman: {
    id: 'rifleman', name: 'Rifleman', domain: 'land', armor: 'inf', age: 'modern',
    cost: { ore: 50, energy: 0 }, pop: 1, hp: 80, speed: 1.6, turnRate: 12, radius: 0.3, vision: 6, move: 'infantry',
    trainedAt: 'barracks', trainTime: 10,
    strongVs: 'infantry', weakVs: 'light vehicles, artillery',
    description: 'Cheap all-round infantry.',
  },
  rocket_trooper: {
    id: 'rocket_trooper', name: 'Rocket Trooper', domain: 'land', armor: 'inf', age: 'modern',
    cost: { ore: 80, energy: 20 }, pop: 1, hp: 80, speed: 1.5, turnRate: 12, radius: 0.3, vision: 6, move: 'infantry',
    trainedAt: 'barracks', trainTime: 13,
    strongVs: 'light and heavy vehicles', weakVs: 'infantry',
    description: 'Anti-vehicle infantry.',
  },
  skyguard: {
    id: 'skyguard', name: 'Skyguard', domain: 'land', armor: 'inf', age: 'modern',
    cost: { ore: 80, energy: 30 }, pop: 1, hp: 80, speed: 1.5, turnRate: 12, radius: 0.3, vision: 7, move: 'infantry',
    trainedAt: 'barracks', trainTime: 13,
    strongVs: 'helicopters', weakVs: 'infantry, light vehicles',
    description: 'Shoulder-launched anti-air infantry.',
  },
  // --- Modern: vehicles -----------------------------------------------------
  scout_buggy: {
    id: 'scout_buggy', name: 'Scout Buggy', domain: 'land', armor: 'lt', age: 'modern',
    cost: { ore: 80, energy: 20 }, pop: 1, hp: 160, speed: 4.2, turnRate: 4.5, radius: 0.5, vision: 9, move: 'vehicle',
    trainedAt: 'vehicle_factory', trainTime: 12,
    strongVs: 'infantry, scouting', weakVs: 'heavy vehicles, turrets',
    description: 'Fast scout.',
  },
  battle_tank: {
    id: 'battle_tank', name: 'Battle Tank', domain: 'land', armor: 'hv', age: 'modern',
    cost: { ore: 250, energy: 75 }, pop: 3, hp: 600, speed: 2.4, turnRate: 2.2, radius: 0.7, vision: 7, move: 'vehicle',
    trainedAt: 'vehicle_factory', trainTime: 25,
    strongVs: 'light and heavy vehicles', weakVs: 'Rocket Troopers, helicopters',
    description: 'Main battle tank.',
  },
  flak_track: {
    id: 'flak_track', name: 'Flak Track', domain: 'land', armor: 'lt', age: 'modern',
    cost: { ore: 150, energy: 50 }, pop: 2, hp: 320, speed: 2.7, turnRate: 3.0, radius: 0.6, vision: 8, move: 'vehicle',
    trainedAt: 'vehicle_factory', trainTime: 18,
    strongVs: 'aircraft', weakVs: 'heavy vehicles',
    description: 'Mobile anti-aircraft.',
  },
  howitzer: {
    id: 'howitzer', name: 'Howitzer', domain: 'land', armor: 'hv', age: 'modern',
    cost: { ore: 300, energy: 100 }, pop: 3, hp: 380, speed: 1.8, turnRate: 1.8, radius: 0.75, vision: 7, move: 'vehicle',
    trainedAt: 'vehicle_factory', trainTime: 28,
    strongVs: 'structures, infantry (long range)', weakVs: 'anything up close',
    description: 'Self-propelled artillery with a minimum range.',
  },
  // --- Modern: navy ---------------------------------------------------------
  patrol_boat: {
    id: 'patrol_boat', name: 'Patrol Boat', domain: 'sea', armor: 'ship', age: 'modern',
    cost: { ore: 120, energy: 30 }, pop: 2, hp: 300, speed: 3.8, turnRate: 1.8, radius: 0.8, vision: 8, move: 'ship',
    trainedAt: 'shipyard', trainTime: 16,
    strongVs: 'infantry on shore, submarines', weakVs: 'Destroyer',
    description: 'Fast boat with depth charges.',
  },
  destroyer: {
    id: 'destroyer', name: 'Destroyer', domain: 'sea', armor: 'ship', age: 'modern',
    cost: { ore: 400, energy: 150 }, pop: 4, hp: 1200, speed: 2.6, turnRate: 0.9, radius: 1.3, vision: 9, move: 'ship',
    trainedAt: 'shipyard', trainTime: 35,
    strongVs: 'ships, submarines', weakVs: 'aircraft',
    description: 'Backbone of the navy.',
  },
  frigate: {
    id: 'frigate', name: 'Frigate', domain: 'sea', armor: 'ship', age: 'modern',
    cost: { ore: 300, energy: 150 }, pop: 3, hp: 900, speed: 2.9, turnRate: 1.1, radius: 1.1, vision: 10, move: 'ship',
    trainedAt: 'shipyard', trainTime: 30,
    strongVs: 'aircraft', weakVs: 'ships',
    description: 'Anti-air escort ship.',
  },
  transport_ship: {
    id: 'transport_ship', name: 'Transport Ship', domain: 'sea', armor: 'ship', age: 'modern',
    cost: { ore: 200, energy: 50 }, pop: 2, hp: 700, speed: 3.0, turnRate: 1.2, radius: 1.2, vision: 6, move: 'ship',
    trainedAt: 'shipyard', trainTime: 22, cargo: { slots: 10, carries: 'land' },
    strongVs: '—', weakVs: 'everything',
    description: 'Carries 10 slots of land units (infantry 1, vehicles 3) across the sea. Load at any shore, unload on another.',
  },
  // --- Modern: air ----------------------------------------------------------
  fighter_jet: {
    id: 'fighter_jet', name: 'Fighter Jet', domain: 'air', armor: 'air', age: 'modern',
    cost: { ore: 250, energy: 150 }, pop: 2, hp: 300, speed: 8, turnRate: 1.6, radius: 0.8, vision: 10, move: 'jet', flyHeight: 7,
    trainedAt: 'airfield', trainTime: 25, fuel: 60,
    strongVs: 'aircraft', weakVs: 'SAM, Flak',
    description: 'Air superiority fighter. 60 s of fuel: lands at an Airfield to refuel.',
  },
  cargo_plane: {
    id: 'cargo_plane', name: 'Cargo Plane', domain: 'air', armor: 'air', age: 'modern',
    cost: { ore: 250, energy: 150 }, pop: 2, hp: 500, speed: 6, turnRate: 1.2, radius: 1.2, vision: 8, move: 'jet', flyHeight: 6,
    trainedAt: 'airfield', trainTime: 30, fuel: 90, cargo: { slots: 8, carries: 'infantry' },
    strongVs: 'drops 8 paratroopers anywhere', weakVs: 'fighters, anti-air',
    description: 'Infantry board it at the Airfield; it paradrops them anywhere on the map, then flies home.',
  },
  attack_helicopter: {
    id: 'attack_helicopter', name: 'Attack Helicopter', domain: 'air', armor: 'air', age: 'modern',
    cost: { ore: 300, energy: 150 }, pop: 3, hp: 450, speed: 4.2, turnRate: 3.0, radius: 0.8, vision: 8, move: 'heli', flyHeight: 3.5,
    trainedAt: 'airfield', trainTime: 28,
    strongVs: 'light and heavy vehicles', weakVs: 'Fighter, Skyguard',
    description: 'Hovering gunship.',
  },
  // --- Digital --------------------------------------------------------------
  exo_trooper: {
    id: 'exo_trooper', name: 'Exo-Trooper', domain: 'land', armor: 'inf', age: 'digital',
    cost: { ore: 150, energy: 75 }, pop: 2, hp: 220, speed: 1.9, turnRate: 10, radius: 0.35, vision: 7, move: 'infantry',
    trainedAt: 'barracks', trainTime: 18,
    strongVs: 'infantry, light vehicles', weakVs: 'heavy vehicles',
    description: 'Powered-armor infantry. Can garrison.',
  },
  rocket_artillery: {
    id: 'rocket_artillery', name: 'Rocket Artillery', domain: 'land', armor: 'hv', age: 'digital',
    cost: { ore: 450, energy: 250 }, pop: 4, hp: 450, speed: 2.0, turnRate: 1.8, radius: 0.8, vision: 7, move: 'vehicle',
    trainedAt: 'vehicle_factory', trainTime: 35,
    strongVs: 'structures, groups (area damage, huge range)', weakVs: 'fast units, aircraft',
    description: 'Long-range rocket launcher.',
  },
  nuclear_submarine: {
    id: 'nuclear_submarine', name: 'Nuclear Submarine', domain: 'sea', armor: 'sub', age: 'digital',
    cost: { ore: 700, energy: 400 }, pop: 5, hp: 1100, speed: 2.8, turnRate: 1.0, radius: 1.1, vision: 8, move: 'ship',
    trainedAt: 'shipyard', trainTime: 45,
    strongVs: 'ships (torpedoes); land targets with Cruise Missiles', weakVs: 'Destroyer, Patrol Boat, Sonar Net',
    description: 'Invisible while submerged unless in sonar or destroyer range.',
  },
  aircraft_carrier: {
    id: 'aircraft_carrier', name: 'Aircraft Carrier', domain: 'sea', armor: 'ship', age: 'digital',
    cost: { ore: 1200, energy: 700 }, pop: 8, hp: 3000, speed: 2.0, turnRate: 0.6, radius: 2.2, vision: 10, move: 'ship',
    trainedAt: 'shipyard', trainTime: 70, limit: 2,
    strongVs: 'projects air power to any coast (carries 6 Fighter Jets)', weakVs: 'submarines; nearly defenceless alone',
    description: 'Launches, recovers, rearms and repairs fighters at sea.',
  },
  aegis_cruiser: {
    id: 'aegis_cruiser', name: 'Aegis Cruiser', domain: 'sea', armor: 'ship', age: 'digital',
    cost: { ore: 650, energy: 400 }, pop: 5, hp: 1600, speed: 2.5, turnRate: 0.9, radius: 1.4, vision: 11, move: 'ship',
    trainedAt: 'shipyard', trainTime: 40,
    strongVs: 'aircraft, missiles', weakVs: 'submarines',
    description: 'Carrier escort with area air defence.',
  },
  stealth_bomber: {
    id: 'stealth_bomber', name: 'Stealth Bomber', domain: 'air', armor: 'air', age: 'digital',
    cost: { ore: 600, energy: 400 }, pop: 4, hp: 500, speed: 6, turnRate: 1.0, radius: 1.2, vision: 8, move: 'jet', flyHeight: 9,
    trainedAt: 'airfield', trainTime: 40, fuel: 90,
    strongVs: 'structures, heavy vehicles', weakVs: 'fighters once detected',
    description: 'Invisible unless near a Radar, SAM or Aegis Cruiser.',
  },
  warden: {
    id: 'warden', name: 'Warden', domain: 'land', armor: 'mech', age: 'digital',
    cost: { ore: 900, energy: 500 }, pop: 6, hp: 2200, speed: 1.9, turnRate: 1.6, radius: 1.1, vision: 9, move: 'vehicle',
    trainedAt: 'mech_foundry', trainTime: 50,
    strongVs: 'infantry, light vehicles', weakVs: 'massed Rocket Troopers, Laser Tower',
    description: 'Light mech. Steps over rubble and shallow water.',
  },
  // --- Nano -----------------------------------------------------------------
  disruptor: {
    id: 'disruptor', name: 'Disruptor', domain: 'land', armor: 'lt', age: 'nano',
    cost: { ore: 400, energy: 300 }, pop: 3, hp: 400, speed: 2.6, turnRate: 2.5, radius: 0.7, vision: 8, move: 'vehicle',
    trainedAt: 'vehicle_factory', trainTime: 30,
    strongVs: 'mechs and vehicles (EMP stun), shields', weakVs: 'infantry',
    description: 'EMP pulse stuns mechs and vehicles and drains shields.',
  },
  juggernaut: {
    id: 'juggernaut', name: 'Juggernaut', domain: 'land', armor: 'mech', age: 'nano',
    cost: { ore: 1800, energy: 1200 }, pop: 10, hp: 5000, speed: 1.5, turnRate: 1.2, radius: 1.6, vision: 10, move: 'vehicle',
    trainedAt: 'mech_foundry', trainTime: 75,
    strongVs: 'structures, heavy vehicles; smashes walls', weakVs: 'Disruptor, Arclight, Laser Tower',
    description: 'Heavy assault mech with arm cannons.',
  },
  arclight: {
    id: 'arclight', name: 'Arclight', domain: 'land', armor: 'mech', age: 'nano',
    cost: { ore: 1500, energy: 1300 }, pop: 8, hp: 3500, speed: 1.8, turnRate: 1.4, radius: 1.4, vision: 11, move: 'vehicle',
    trainedAt: 'mech_foundry', trainTime: 65,
    strongVs: 'mechs, heavy vehicles (eye laser)', weakVs: 'infantry swarms, aircraft',
    description: 'Laser mech built to kill other mechs.',
  },
  leviathan: {
    id: 'leviathan', name: 'Leviathan', domain: 'land', armor: 'mech', age: 'nano',
    cost: { ore: 2000, energy: 1500 }, pop: 10, hp: 5000, speed: 1.6, turnRate: 1.1, radius: 1.6, vision: 10, move: 'vehicle',
    trainedAt: 'mech_foundry', trainTime: 80,
    strongVs: 'ships and coasts (walks the seabed, hidden while submerged)', weakVs: 'submarines, Disruptor',
    description: 'Amphibious mech that walks across the seabed.',
  },
  nano_swarm: {
    id: 'nano_swarm', name: 'Nano Swarm', domain: 'air', armor: 'air', age: 'nano',
    cost: { ore: 200, energy: 200 }, pop: 2, hp: 150, speed: 3.5, turnRate: 4, radius: 0.6, vision: 6, move: 'heli', flyHeight: 2.5,
    trainedAt: 'research_lab', trainTime: 20,
    strongVs: 'repairs friendly units in an area', weakVs: 'everything (fragile)',
    description: 'Cloud of repair nanites.',
  },
  // --- Space ----------------------------------------------------------------
  orbital_fighter: {
    id: 'orbital_fighter', name: 'Orbital Fighter', domain: 'air', armor: 'orb', age: 'space',
    cost: { ore: 600, energy: 600 }, pop: 3, hp: 600, speed: 10, turnRate: 2.0, radius: 0.9, vision: 11, move: 'jet', flyHeight: 11,
    trainedAt: 'spaceport', trainTime: 35,
    strongVs: 'aircraft, orbital units', weakVs: 'Point Defense, SAM (reduced)',
    description: 'Fast space superiority craft.',
  },
  drop_ship: {
    id: 'drop_ship', name: 'Drop Ship', domain: 'air', armor: 'orb', age: 'space',
    cost: { ore: 800, energy: 800 }, pop: 4, hp: 1200, speed: 5, turnRate: 1.5, radius: 1.6, vision: 8, move: 'heli', flyHeight: 10,
    trainedAt: 'spaceport', trainTime: 45,
    strongVs: 'carries 1 mech or 10 infantry anywhere, lands behind walls', weakVs: 'anti-air',
    description: 'Orbital transport.',
  },
  star_lance: {
    id: 'star_lance', name: 'Star Lance', domain: 'air', armor: 'orb', age: 'space',
    cost: { ore: 3000, energy: 3000 }, pop: 15, hp: 12000, speed: 1.4, turnRate: 0.5, radius: 3.5, vision: 14, move: 'heli', flyHeight: 14,
    trainedAt: 'spaceport', trainTime: 150, limit: 1,
    strongVs: 'everything below it', weakVs: 'Orbital Fighters in numbers, orbital laser',
    description: 'Capital ship. Max 1 per player.',
  },
} as const satisfies Record<string, UnitDef>;

export type UnitTypeId = keyof typeof UNITS;

export const UNIT_TYPES = Object.keys(UNITS) as UnitTypeId[];

export function unitDef(id: UnitTypeId): UnitDef {
  return UNITS[id];
}
