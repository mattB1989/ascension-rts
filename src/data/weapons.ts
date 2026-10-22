// Weapons and the damage-vs-armor table (TECH_TREE.md §6). Starting values for
// the balance harness (M4) to tune.

import type { ArmorClass } from './types.ts';

export type DamageType = 'bullet' | 'ap' | 'explosive' | 'aa' | 'torpedo' | 'laser' | 'emp';

/** What a weapon can shoot at. 'sub' = submerged submarines (Digital Age). */
export type TargetKind = 'land' | 'sea' | 'sub' | 'air' | 'building';

export interface WeaponDef {
  name: string;
  type: DamageType;
  damage: number;
  /** Tiles. */
  range: number;
  /** Cannot fire at anything closer (artillery). */
  minRange?: number;
  /** Seconds between shots. */
  cooldown: number;
  targets: readonly TargetKind[];
  /** instant: hits at once (tracer). shell: lobbed at a spot. missile/torpedo: homes in. */
  projectile: 'instant' | 'shell' | 'missile' | 'torpedo';
  /** Projectile speed, tiles per second. */
  speed?: number;
  /** Area damage radius (full damage at the centre, half at the edge). */
  splash?: number;
}

/** Damage multiplier by damage type and armor class. 0 = no effect. */
export const DAMAGE: Record<DamageType, Record<ArmorClass, number>> = {
  bullet: { inf: 1.0, lt: 0.6, hv: 0.2, mech: 0.15, ship: 0.2, sub: 0, air: 0.3, orb: 0, str: 0.15 },
  ap: { inf: 0.4, lt: 1.2, hv: 1.0, mech: 0.8, ship: 0.8, sub: 0, air: 0, orb: 0, str: 0.6 },
  explosive: { inf: 1.2, lt: 0.9, hv: 0.7, mech: 0.6, ship: 0.7, sub: 0, air: 0, orb: 0, str: 1.5 },
  aa: { inf: 0, lt: 0, hv: 0, mech: 0, ship: 0, sub: 0, air: 1.5, orb: 0.8, str: 0 },
  torpedo: { inf: 0, lt: 0, hv: 0, mech: 0.8, ship: 1.5, sub: 1.5, air: 0, orb: 0, str: 0.5 },
  laser: { inf: 0.8, lt: 1.0, hv: 1.3, mech: 1.5, ship: 1.0, sub: 0, air: 1.0, orb: 1.0, str: 0.8 },
  emp: { inf: 0, lt: 0.2, hv: 0.2, mech: 0.4, ship: 0.2, sub: 0, air: 0, orb: 0, str: 0.1 },
};

export const DAMAGE_TYPE_NAMES: Record<DamageType, string> = {
  bullet: 'Bullet', ap: 'Armor-piercing', explosive: 'Explosive', aa: 'Anti-air missile', torpedo: 'Torpedo / depth charge', laser: 'Laser', emp: 'EMP',
};

/** Extra range for infantry firing from inside a garrisoned building. */
export const GARRISON_RANGE_BONUS = 2;

const LAND_SEA: readonly TargetKind[] = ['land', 'sea', 'building'];
const GROUND: readonly TargetKind[] = ['land', 'building'];
const AIR: readonly TargetKind[] = ['air'];

/** Weapons by unit or building id. Units without an entry are unarmed. */
export const WEAPONS: Record<string, readonly WeaponDef[]> = {
  // --- Infantry ---------------------------------------------------------------
  rifleman: [{ name: 'Assault rifle', type: 'bullet', damage: 9, range: 5, cooldown: 1.0, targets: ['land', 'building', 'air'], projectile: 'instant' }],
  rocket_trooper: [{ name: 'Rocket launcher', type: 'ap', damage: 45, range: 6, cooldown: 2.5, targets: LAND_SEA, projectile: 'missile', speed: 14 }],
  skyguard: [{ name: 'Stinger missiles', type: 'aa', damage: 40, range: 7, cooldown: 2.2, targets: AIR, projectile: 'missile', speed: 20 }],
  exo_trooper: [{ name: 'Heavy rifle', type: 'bullet', damage: 18, range: 6, cooldown: 0.9, targets: ['land', 'building', 'air'], projectile: 'instant' }],
  // --- Vehicles ---------------------------------------------------------------
  scout_buggy: [{ name: 'Machine gun', type: 'bullet', damage: 12, range: 5.5, cooldown: 0.6, targets: GROUND, projectile: 'instant' }],
  battle_tank: [{ name: '120 mm cannon', type: 'ap', damage: 60, range: 7, cooldown: 2.5, targets: LAND_SEA, projectile: 'shell', speed: 30 }],
  flak_track: [{ name: 'Twin flak', type: 'aa', damage: 22, range: 8, cooldown: 0.6, targets: AIR, projectile: 'instant', splash: 1 }],
  howitzer: [{ name: '155 mm howitzer', type: 'explosive', damage: 90, range: 14, minRange: 4, cooldown: 5, targets: LAND_SEA, projectile: 'shell', speed: 12, splash: 1.5 }],
  rocket_artillery: [{ name: 'Rocket salvo', type: 'explosive', damage: 70, range: 18, minRange: 5, cooldown: 6, targets: LAND_SEA, projectile: 'shell', speed: 14, splash: 2.2 }],
  // --- Ships ------------------------------------------------------------------
  patrol_boat: [
    { name: 'Deck gun', type: 'bullet', damage: 14, range: 6, cooldown: 0.7, targets: LAND_SEA, projectile: 'instant' },
    { name: 'Depth charges', type: 'torpedo', damage: 40, range: 3, cooldown: 3, targets: ['sub'], projectile: 'shell', speed: 6, splash: 1.5 },
  ],
  destroyer: [
    { name: '127 mm gun', type: 'ap', damage: 70, range: 9, cooldown: 2.5, targets: LAND_SEA, projectile: 'shell', speed: 28 },
    { name: 'Depth charges', type: 'torpedo', damage: 60, range: 4, cooldown: 3, targets: ['sub'], projectile: 'shell', speed: 6, splash: 1.5 },
  ],
  frigate: [
    { name: 'SAM launcher', type: 'aa', damage: 45, range: 10, cooldown: 1.5, targets: AIR, projectile: 'missile', speed: 22 },
    { name: 'Autocannon', type: 'bullet', damage: 12, range: 6, cooldown: 0.8, targets: LAND_SEA, projectile: 'instant' },
  ],
  // --- Aircraft ---------------------------------------------------------------
  fighter_jet: [{ name: 'Air-to-air missiles', type: 'aa', damage: 50, range: 7, cooldown: 1.8, targets: AIR, projectile: 'missile', speed: 26 }],
  attack_helicopter: [{ name: 'Hellfire missiles', type: 'ap', damage: 40, range: 7, cooldown: 1.6, targets: LAND_SEA, projectile: 'missile', speed: 18 }],
  // --- Defenses ---------------------------------------------------------------
  watchtower: [{ name: 'Machine gun', type: 'bullet', damage: 10, range: 8, cooldown: 0.8, targets: ['land', 'air'], projectile: 'instant' }],
  bunker: [{ name: 'Heavy machine gun', type: 'bullet', damage: 14, range: 6, cooldown: 0.8, targets: ['land'], projectile: 'instant' }],
  gun_turret: [{ name: 'Autocannon', type: 'ap', damage: 25, range: 8, cooldown: 0.8, targets: ['land', 'sea'], projectile: 'instant' }],
  sam_site: [{ name: 'SAM battery', type: 'aa', damage: 60, range: 11, cooldown: 2, targets: AIR, projectile: 'missile', speed: 24 }],
  coastal_battery: [{ name: 'Coastal gun', type: 'ap', damage: 110, range: 13, cooldown: 4, targets: ['sea', 'building'], projectile: 'shell', speed: 26, splash: 1 }],
};

export function weaponsOf(id: string): readonly WeaponDef[] {
  return WEAPONS[id] ?? [];
}

/** Longest range among a list of weapons. */
export function maxRange(ws: readonly WeaponDef[]): number {
  let r = 0;
  for (const w of ws) r = Math.max(r, w.range);
  return r;
}
