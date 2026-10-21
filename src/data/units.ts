import type { UnitDef } from './types.ts';

// Starting values; the balance harness (M4) will tune them.
// Only movement-related fields are used so far (M1). Combat stats arrive in M3.
export const UNITS = {
  engineer: {
    id: 'engineer', name: 'Engineer', domain: 'land', armor: 'inf', age: 'modern',
    cost: { ore: 50, energy: 0 }, pop: 1, hp: 60,
    speed: 1.6, turnRate: 12, radius: 0.3, move: 'infantry',
    description: 'Gathers Ore, builds and repairs. Can garrison.',
  },
  rifleman: {
    id: 'rifleman', name: 'Rifleman', domain: 'land', armor: 'inf', age: 'modern',
    cost: { ore: 50, energy: 0 }, pop: 1, hp: 80,
    speed: 1.6, turnRate: 12, radius: 0.3, move: 'infantry',
    description: 'Cheap all-round infantry. Strong against infantry.',
  },
  rocket_trooper: {
    id: 'rocket_trooper', name: 'Rocket Trooper', domain: 'land', armor: 'inf', age: 'modern',
    cost: { ore: 80, energy: 20 }, pop: 1, hp: 80,
    speed: 1.5, turnRate: 12, radius: 0.3, move: 'infantry',
    description: 'Anti-vehicle infantry.',
  },
  scout_buggy: {
    id: 'scout_buggy', name: 'Scout Buggy', domain: 'land', armor: 'lt', age: 'modern',
    cost: { ore: 80, energy: 20 }, pop: 1, hp: 160,
    speed: 4.2, turnRate: 4.5, radius: 0.5, move: 'vehicle',
    description: 'Fast scout. Good against infantry.',
  },
  battle_tank: {
    id: 'battle_tank', name: 'Battle Tank', domain: 'land', armor: 'hv', age: 'modern',
    cost: { ore: 250, energy: 75 }, pop: 3, hp: 600,
    speed: 2.4, turnRate: 2.2, radius: 0.7, move: 'vehicle',
    description: 'Main battle tank. Strong against vehicles.',
  },
  flak_track: {
    id: 'flak_track', name: 'Flak Track', domain: 'land', armor: 'lt', age: 'modern',
    cost: { ore: 150, energy: 50 }, pop: 2, hp: 320,
    speed: 2.7, turnRate: 3.0, radius: 0.6, move: 'vehicle',
    description: 'Mobile anti-aircraft.',
  },
  patrol_boat: {
    id: 'patrol_boat', name: 'Patrol Boat', domain: 'sea', armor: 'ship', age: 'modern',
    cost: { ore: 120, energy: 30 }, pop: 2, hp: 300,
    speed: 3.8, turnRate: 1.8, radius: 0.8, move: 'ship',
    description: 'Fast boat. Hits shore infantry and drops depth charges on subs.',
  },
  destroyer: {
    id: 'destroyer', name: 'Destroyer', domain: 'sea', armor: 'ship', age: 'modern',
    cost: { ore: 400, energy: 150 }, pop: 4, hp: 1200,
    speed: 2.6, turnRate: 0.9, radius: 1.3, move: 'ship',
    description: 'Backbone of the navy. Strong against ships and submarines.',
  },
  fighter_jet: {
    id: 'fighter_jet', name: 'Fighter Jet', domain: 'air', armor: 'air', age: 'modern',
    cost: { ore: 250, energy: 150 }, pop: 2, hp: 300,
    speed: 8, turnRate: 1.6, radius: 0.8, move: 'jet', flyHeight: 7,
    description: 'Air superiority fighter.',
  },
  attack_helicopter: {
    id: 'attack_helicopter', name: 'Attack Helicopter', domain: 'air', armor: 'air', age: 'modern',
    cost: { ore: 300, energy: 150 }, pop: 3, hp: 450,
    speed: 4.2, turnRate: 3.0, radius: 0.8, move: 'heli', flyHeight: 3.5,
    description: 'Hovering gunship. Strong against vehicles.',
  },
} as const satisfies Record<string, UnitDef>;

export type UnitTypeId = keyof typeof UNITS;

export const UNIT_TYPES = Object.keys(UNITS) as UnitTypeId[];

export function unitDef(id: UnitTypeId): UnitDef {
  return UNITS[id];
}
