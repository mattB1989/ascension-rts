// Energy (DESIGN: realistic trade-offs). Power sources differ:
//  - fossil (oil power plants): on demand, but their smoke harms health nationwide;
//  - nuclear: on demand and clean, but needs uranium, engineers, and a rare
//    accident is a disaster (more likely understaffed or after sabotage);
//  - hydro: steady, with a reservoir that stores surplus; weak in a drought;
//  - wind and solar: free and clean, but only when the wind blows and the sun
//    shines (none at night, little in winter or under cloud, and calm, dark
//    spells of half a minute or more): without storage or firm power behind
//    them, that means blackouts;
//  - batteries (and reservoirs) charge from any surplus and cover shortfalls.
// The weather is shared by everyone and driven by the world's own random numbers.

import { sumTiers, YEAR_SECONDS } from '../../data/goods.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { meltdownFactor } from './policies.ts';

export const ENERGY = {
  /** A sim "day" for solar (seconds): the sun is up half of it. */
  daySeconds: 30,
  /** Chance per second that a calm, overcast spell begins, and how long it lasts. */
  lullChance: 1 / 360,
  lullSeconds: [25, 50] as const,
  /** Chance per second that a drought begins (hydro and water supply weaken). */
  droughtChance: 1 / 2400,
  droughtSeconds: 90,
  /** Smog: fossil megawatts per resident at which the air is "bad" (index 1). */
  smogMWPerResident: 0.06,
  /** Share of residents lost per year at smog index 1 (halved with good health coverage). */
  smogDeaths: 0.012,
  /** Happiness lost at smog index 1. */
  smogUnhappy: 0.1,
  /** Nuclear accident chance per plant per year: base, understaffed, recently sabotaged. */
  meltdown: { base: 0.003, understaffed: 0.03, sabotaged: 0.08, radius: 9 },
} as const;

export interface Weather {
  wind: number;
  cloud: number;
  lullUntil: number;
  droughtUntil: number;
}

export function weather(world: World): Weather {
  return (world.city!.weather ??= { wind: 0.55, cloud: 0.3, lullUntil: 0, droughtUntil: 0 });
}

/** Sun strength 0..1 now: day and night, seasons, cloud. */
export function sunlight(world: World): number {
  const w = weather(world);
  const t = world.time;
  const day = Math.max(0, Math.sin((2 * Math.PI * t) / ENERGY.daySeconds));
  const season = 0.55 + 0.45 * Math.sin((2 * Math.PI * (t % YEAR_SECONDS)) / YEAR_SECONDS - Math.PI / 2 + Math.PI);
  const lull = t < w.lullUntil ? 0.25 : 1;
  return day * season * (1 - 0.7 * w.cloud) * lull;
}

/** Once a second: the weather moves on (deterministic: the world's random numbers). */
export function updateWeather(world: World): void {
  const w = weather(world);
  const r = world.rng;
  w.wind = Math.max(0.03, Math.min(1, w.wind + (r.next() - 0.5) * 0.14 + (0.55 - w.wind) * 0.03));
  w.cloud = Math.max(0, Math.min(1, w.cloud + (r.next() - 0.5) * 0.1 + (0.35 - w.cloud) * 0.02));
  if (world.time >= w.lullUntil && r.next() < ENERGY.lullChance) {
    const [a, b] = ENERGY.lullSeconds;
    w.lullUntil = world.time + a + r.next() * (b - a);
    // Warn those who rely on wind and sun.
    world.city!.players.forEach((pc, id) => {
      if ((pc.variableShare ?? 0) > 0.25) world.emit({ kind: 'notify', player: id, text: `🌫 A calm, overcast spell: wind and solar output collapse for a while${(pc.storeCapacity ?? 0) > 0 ? '; your storage is covering what it can' : ': without storage or firm power, expect blackouts'}` });
    });
  }
  if (world.time < w.lullUntil) {
    w.wind = Math.min(w.wind, 0.06);
    w.cloud = Math.max(w.cloud, 0.85);
  }
  if (world.time >= w.droughtUntil && r.next() < ENERGY.droughtChance) {
    w.droughtUntil = world.time + ENERGY.droughtSeconds;
    world.emit({ kind: 'notify', player: -1, text: '☀ Drought: rivers run low; hydro plants and pumping stations give less until the rains come' });
  }
}

/** How much of its rated output a power source gives right now (0..1). */
export function outputFactor(world: World, b: Building): number {
  const kind = b.def.econ?.powerKind;
  if (kind === 'wind') return weather(world).wind;
  if (kind === 'solar') return sunlight(world);
  if (kind === 'hydro') return world.time < weather(world).droughtUntil ? 0.4 : 1;
  return 1;
}

/** Is a drought on (pumping stations give less water)? */
export function drought(world: World): boolean {
  return world.time < weather(world).droughtUntil;
}

/**
 * Storage on one grid: charge from surplus, discharge into a shortfall.
 * Returns the extra supply it provides this second (negative while charging).
 */
export function balanceStorage(stores: Building[], surplus: number): number {
  if (!stores.length) return 0;
  let delta = 0;
  if (surplus > 0) {
    let left = surplus;
    for (const s of stores) {
      const cap = s.def.econ!.powerStore!;
      const room = cap - (s.city!.stored ?? 0);
      const put = Math.min(room, left);
      if (put > 0) {
        s.city!.stored = (s.city!.stored ?? 0) + put;
        left -= put;
        delta -= put;
      }
    }
  } else if (surplus < 0) {
    let need = -surplus;
    for (const s of stores) {
      const take = Math.min(s.city!.stored ?? 0, need);
      if (take > 0) {
        s.city!.stored = (s.city!.stored ?? 0) - take;
        need -= take;
        delta += take;
      }
    }
  }
  return delta;
}

/** Fossil smoke over the nation (0: clean air, 1: bad, more: worse). */
export function smogIndex(world: World, player: number): number {
  const pc = world.city!.players[player]!;
  const pop = sumTiers(pc.population);
  return (pc.fossilMW ?? 0) / Math.max(40, pop * ENERGY.smogMWPerResident);
}

/** Once a year: smog costs lives (fewer with clinics and hospitals); nuclear plants may fail. */
export function yearlyEnergyRisks(world: World): void {
  const city = world.city!;
  city.players.forEach((pc, id) => {
    if (world.players[id]?.defeated || world.players[id]?.role === 'cityState') return;
    // Smog deaths.
    const smog = Math.min(1.5, smogIndex(world, id));
    const houses = world.buildings.filter((b) => b.owner === id && b.type === 'house' && b.city && b.city.residents > 0);
    if (smog > 0.05 && houses.length) {
      const covered = houses.filter((h) => h.city!.covered.health).length / houses.length;
      const share = ENERGY.smogDeaths * smog * (1 - 0.5 * covered);
      let deaths = 0;
      for (const h of houses) {
        const d = Math.floor(h.city!.residents * share + (world.rng.next() < (h.city!.residents * share) % 1 ? 1 : 0));
        if (d > 0) {
          h.city!.residents = Math.max(0, h.city!.residents - d);
          deaths += d;
        }
      }
      pc.smogDeaths = deaths;
      if (deaths >= 3) world.emit({ kind: 'notify', player: id, text: `🏭 Smog from oil-fired power killed ${deaths} people last year${covered < 0.5 ? ' (clinics and hospitals would halve that)' : ''}: cleaner power — hydro, nuclear, or wind and solar backed by storage — saves lives` });
    } else pc.smogDeaths = 0;
    // Nuclear accidents.
    for (const b of world.buildings) {
      if (b.owner !== id || b.type !== 'nuclear_plant' || !b.complete || !b.city) continue;
      const e = b.def.econ!;
      const staffed = (b.city.workers ?? 0) / (e.jobs?.count ?? 1);
      const recentlySabotaged = (b.city.sabotagedUntil ?? 0) > world.time - YEAR_SECONDS;
      const p = (ENERGY.meltdown.base + (staffed < 0.5 ? ENERGY.meltdown.understaffed : 0) + (recentlySabotaged ? ENERGY.meltdown.sabotaged : 0)) * meltdownFactor(world, id);
      if (world.rng.next() >= p) continue;
      meltdown(world, b);
    }
  });
}

/** A nuclear accident: the plant is wrecked for years, people nearby flee, the nation is shaken. */
export function meltdown(world: World, plant: Building): void {
  const r = ENERGY.meltdown.radius;
  plant.city!.sabotagedUntil = world.time + 10 * YEAR_SECONDS;
  plant.city!.outReason = 'Wrecked by a nuclear accident';
  let fled = 0;
  for (const h of world.buildings) {
    if (h.type !== 'house' || !h.city || (h.x - plant.x) ** 2 + (h.y - plant.y) ** 2 > r * r) continue;
    fled += Math.floor(h.city.residents);
    h.city.residents = 0;
    h.city.level = 0;
    h.city.sabotagedUntil = world.time + 5 * YEAR_SECONDS;
  }
  const pc = world.city!.players[plant.owner]!;
  pc.shakenUntil = world.time + 3 * YEAR_SECONDS;
  world.emit({ kind: 'notify', player: -1, text: `☢ Nuclear accident at ${world.players[plant.owner]!.name}'s plant: ${fled} people evacuated, the area is closed for five years` , x: plant.x, y: plant.y });
}
