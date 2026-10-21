import type { TechDef } from './types.ts';

// Research, by building and age (TECH_TREE.md §4 and §7). Techs whose effect is
// still `pending` are listed in the tech tree but cannot be researched yet.
const M3 = { kind: 'pending', milestone: 'M3' } as const;
const M5 = { kind: 'pending', milestone: 'M5' } as const;
const M6 = { kind: 'pending', milestone: 'M6' } as const;

export const TECHS = {
  // Command Center
  fortified_masonry: { id: 'fortified_masonry', name: 'Fortified Masonry', at: 'command_center', age: 'modern', cost: { ore: 150, energy: 0 }, time: 30, summary: 'Walls and gates +30% HP', effects: [M3] },
  efficient_logistics: { id: 'efficient_logistics', name: 'Efficient Logistics', at: 'command_center', age: 'modern', cost: { ore: 200, energy: 50 }, time: 40, summary: 'Build speed +20%', effects: [{ kind: 'buildSpeed', mult: 1.2 }] },
  command_network: { id: 'command_network', name: 'Command Network', at: 'command_center', age: 'digital', cost: { ore: 400, energy: 300 }, time: 50, summary: '+5 garrison slots in the HQ', effects: [M5] },
  planetary_defense_grid: { id: 'planetary_defense_grid', name: 'Planetary Defense Grid', at: 'command_center', age: 'space', cost: { ore: 1000, energy: 1000 }, time: 80, summary: 'HQ gains a Point Defense Array', effects: [M6] },
  // Ore Refinery
  deep_drilling: { id: 'deep_drilling', name: 'Deep Drilling', at: 'ore_refinery', age: 'modern', cost: { ore: 150, energy: 50 }, time: 35, summary: '+15% Ore gathering', effects: [{ kind: 'gatherRate', resource: 'ore', mult: 1.15 }] },
  automated_mining: { id: 'automated_mining', name: 'Automated Mining', at: 'ore_refinery', age: 'digital', cost: { ore: 300, energy: 150 }, time: 45, summary: '+20% Ore gathering', effects: [{ kind: 'gatherRate', resource: 'ore', mult: 1.2 }] },
  nano_extraction: { id: 'nano_extraction', name: 'Nano Extraction', at: 'ore_refinery', age: 'nano', cost: { ore: 600, energy: 400 }, time: 60, summary: '+25% Ore gathering', effects: [{ kind: 'gatherRate', resource: 'ore', mult: 1.25 }] },
  asteroid_capture: { id: 'asteroid_capture', name: 'Asteroid Capture', at: 'ore_refinery', age: 'space', cost: { ore: 1000, energy: 1000 }, time: 80, summary: 'Passive Ore trickle', effects: [M6] },
  // Barracks
  body_armor: { id: 'body_armor', name: 'Body Armor', at: 'barracks', age: 'modern', cost: { ore: 150, energy: 50 }, time: 35, summary: 'Infantry +20% HP', effects: [M3] },
  murder_holes: { id: 'murder_holes', name: 'Murder Holes', at: 'barracks', age: 'modern', cost: { ore: 100, energy: 50 }, time: 30, summary: 'Garrisoned infantry +1 more range', effects: [M3] },
  hardened_garrison: { id: 'hardened_garrison', name: 'Hardened Garrison', at: 'barracks', age: 'digital', cost: { ore: 300, energy: 200 }, time: 45, summary: 'Garrison damage reduction 50% → 70%', effects: [M5] },
  exoskeletons: { id: 'exoskeletons', name: 'Exoskeletons', at: 'barracks', age: 'digital', cost: { ore: 250, energy: 150 }, time: 40, summary: 'Infantry speed +20%', effects: [M5] },
  nano_weave: { id: 'nano_weave', name: 'Nano Weave', at: 'barracks', age: 'nano', cost: { ore: 400, energy: 300 }, time: 50, summary: 'Infantry regenerate HP', effects: [M5] },
  // Vehicle Factory
  composite_armor: { id: 'composite_armor', name: 'Composite Armor', at: 'vehicle_factory', age: 'modern', cost: { ore: 250, energy: 100 }, time: 45, summary: 'Vehicles +15% HP', effects: [M3] },
  reactive_armor: { id: 'reactive_armor', name: 'Reactive Armor', at: 'vehicle_factory', age: 'digital', cost: { ore: 400, energy: 250 }, time: 55, summary: 'Vehicles take -20% missile damage', effects: [M5] },
  railguns: { id: 'railguns', name: 'Railguns', at: 'vehicle_factory', age: 'digital', cost: { ore: 450, energy: 300 }, time: 55, summary: 'Tanks +range', effects: [M5] },
  hover_drives: { id: 'hover_drives', name: 'Hover Drives', at: 'vehicle_factory', age: 'nano', cost: { ore: 600, energy: 500 }, time: 60, summary: 'Vehicles cross shallow water', effects: [M5] },
  // Shipyard
  sonar: { id: 'sonar', name: 'Sonar', at: 'shipyard', age: 'modern', cost: { ore: 150, energy: 100 }, time: 35, summary: '+Submarine detection range', effects: [M3] },
  cruise_missiles: { id: 'cruise_missiles', name: 'Cruise Missiles', at: 'shipyard', age: 'digital', cost: { ore: 500, energy: 400 }, time: 55, summary: 'Submarines can strike land targets', effects: [M5] },
  nuclear_propulsion: { id: 'nuclear_propulsion', name: 'Nuclear Propulsion', at: 'shipyard', age: 'digital', cost: { ore: 400, energy: 300 }, time: 50, summary: 'Ships +15% speed', effects: [M5] },
  supercavitation: { id: 'supercavitation', name: 'Supercavitation', at: 'shipyard', age: 'nano', cost: { ore: 500, energy: 500 }, time: 55, summary: 'Faster torpedoes', effects: [M5] },
  // Airfield
  afterburners: { id: 'afterburners', name: 'Afterburners', at: 'airfield', age: 'modern', cost: { ore: 200, energy: 150 }, time: 40, summary: 'Aircraft +15% speed', effects: [M3] },
  stealth_coating: { id: 'stealth_coating', name: 'Stealth Coating', at: 'airfield', age: 'digital', cost: { ore: 500, energy: 400 }, time: 55, summary: 'Aircraft harder to detect', effects: [M5] },
  precision_munitions: { id: 'precision_munitions', name: 'Precision Munitions', at: 'airfield', age: 'digital', cost: { ore: 400, energy: 300 }, time: 50, summary: 'Aircraft +15% damage', effects: [M5] },
  drone_wingmen: { id: 'drone_wingmen', name: 'Drone Wingmen', at: 'airfield', age: 'nano', cost: { ore: 600, energy: 600 }, time: 60, summary: 'Fighters launch escort drones', effects: [M5] },
  // Radar Station
  targeting_radar: { id: 'targeting_radar', name: 'Targeting Radar', at: 'radar_station', age: 'modern', cost: { ore: 200, energy: 100 }, time: 40, summary: 'Towers and turrets +15% range', effects: [M3] },
  electronic_warfare: { id: 'electronic_warfare', name: 'Electronic Warfare', at: 'radar_station', age: 'digital', cost: { ore: 400, energy: 400 }, time: 50, summary: 'Scrambles enemy minimap blips near you', effects: [M5] },
  satellite_network: { id: 'satellite_network', name: 'Satellite Network', at: 'radar_station', age: 'space', cost: { ore: 800, energy: 800 }, time: 70, summary: 'Permanent reveal of the enemy HQ', effects: [M6] },
  // Research Lab
  advanced_ballistics: { id: 'advanced_ballistics', name: 'Advanced Ballistics', at: 'research_lab', age: 'modern', cost: { ore: 300, energy: 200 }, time: 45, summary: 'All units +10% accuracy', effects: [M3] },
  automated_repair: { id: 'automated_repair', name: 'Automated Repair', at: 'research_lab', age: 'digital', cost: { ore: 400, energy: 300 }, time: 50, summary: 'Defenses self-repair out of combat', effects: [M5] },
  shield_tech: { id: 'shield_tech', name: 'Shield Tech', at: 'research_lab', age: 'nano', cost: { ore: 600, energy: 600 }, time: 60, summary: 'Unlocks Shield Generator', effects: [M5] },
  overcharged_lasers: { id: 'overcharged_lasers', name: 'Overcharged Lasers', at: 'research_lab', age: 'nano', cost: { ore: 600, energy: 500 }, time: 55, summary: 'Laser Tower ramps up twice as fast', effects: [M5] },
  layered_shields: { id: 'layered_shields', name: 'Layered Shields', at: 'research_lab', age: 'space', cost: { ore: 800, energy: 800 }, time: 70, summary: 'Shield Generator capacity +50%', effects: [M6] },
  fusion_engines: { id: 'fusion_engines', name: 'Fusion Engines', at: 'research_lab', age: 'space', cost: { ore: 800, energy: 800 }, time: 70, summary: 'Orbital units +20% speed', effects: [M6] },
  // Mech Foundry
  reinforced_frames: { id: 'reinforced_frames', name: 'Reinforced Frames', at: 'mech_foundry', age: 'digital', cost: { ore: 500, energy: 300 }, time: 50, summary: 'Mechs +15% HP', effects: [M5] },
  overclocked_reactors: { id: 'overclocked_reactors', name: 'Overclocked Reactors', at: 'mech_foundry', age: 'nano', cost: { ore: 600, energy: 500 }, time: 55, summary: 'Mechs +20% speed', effects: [M5] },
  ablative_plating: { id: 'ablative_plating', name: 'Ablative Plating', at: 'mech_foundry', age: 'nano', cost: { ore: 700, energy: 600 }, time: 60, summary: 'Mechs take -20% laser damage', effects: [M5] },
  jump_jets: { id: 'jump_jets', name: 'Jump Jets', at: 'mech_foundry', age: 'space', cost: { ore: 900, energy: 900 }, time: 70, summary: 'Mechs leap cliffs and walls', effects: [M6] },
  // Spaceport
  orbital_mechanics: { id: 'orbital_mechanics', name: 'Orbital Mechanics', at: 'spaceport', age: 'space', cost: { ore: 800, energy: 800 }, time: 60, summary: 'Orbital units +speed', effects: [M6] },
  kinetic_rods: { id: 'kinetic_rods', name: 'Kinetic Rods', at: 'spaceport', age: 'space', cost: { ore: 1200, energy: 1200 }, time: 80, summary: 'Star Lance bombardment', effects: [M6] },
} as const satisfies Record<string, TechDef>;

export type TechId = keyof typeof TECHS;
export const TECH_IDS = Object.keys(TECHS) as TechId[];

export function techDef(id: TechId): TechDef {
  return TECHS[id];
}

/** A tech can be researched only once all its effects exist in the game. */
export function techImplemented(id: TechId): boolean {
  return TECHS[id].effects.every((e) => e.kind !== 'pending');
}
