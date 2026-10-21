import type { AgeDef, AgeId } from './types.ts';

export const AGES: Record<AgeId, AgeDef> = {
  modern: {
    id: 'modern', name: 'Modern Age', index: 0,
    theme: 'Start. Tanks, destroyers, jets, concrete walls',
    cost: { ore: 0, energy: 0 }, time: 0, requiresAll: [], requiresAny: [], anyCount: 0,
  },
  digital: {
    id: 'digital', name: 'Digital Age', index: 1,
    theme: 'Nuclear subs, carriers, stealth, first mech',
    cost: { ore: 1200, energy: 800 }, time: 60,
    requiresAll: [], requiresAny: ['barracks', 'vehicle_factory', 'shipyard', 'airfield'], anyCount: 2,
  },
  nano: {
    id: 'nano', name: 'Nano Age', index: 2,
    theme: 'Heavy mechs, lasers, shields, EMP, nukes',
    cost: { ore: 2500, energy: 2000 }, time: 90,
    requiresAll: ['research_lab', 'mech_foundry'], requiresAny: [], anyCount: 0,
  },
  space: {
    id: 'space', name: 'Space Age', index: 3,
    theme: 'Orbital units, orbital strikes, Space Elevator wonder',
    cost: { ore: 4000, energy: 3500 }, time: 120,
    requiresAll: [], requiresAny: ['missile_silo', 'shield_generator'], anyCount: 1,
  },
};

export const AGE_ORDER: AgeId[] = ['modern', 'digital', 'nano', 'space'];
