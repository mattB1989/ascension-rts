// Events and crises: the world doesn't stand still. Once a game year, a few
// things may happen — to everyone (oil shocks, recessions) or to one nation
// (epidemics, floods, strikes, good fortune). How hard they hit depends on what
// you built: hospitals blunt an epidemic, a dam tames floods, happy people don't
// strike, cleaner power shrugs off an oil shock. Deterministic: the world's random numbers.

import { sumTiers, YEAR_SECONDS } from '../../data/goods.ts';
import type { Building } from '../types.ts';
import type { World } from '../world.ts';
import { add } from './state.ts';

export const EVENTS = {
  oilShock: { chance: 0.05, from: 8, years: 2, price: 2.3 },
  recession: { chance: 0.05, from: 6, years: 1, taxes: 0.8, exports: 0.85 },
  epidemic: { chance: 0.04, poorHealth: 0.08, uncovered: 0.08, covered: 0.02 },
  flood: { chance: 0.04, seconds: 40 },
  strike: { chance: 0.35, happiness: 0.42, share: 0.25, seconds: 45 },
  breakthrough: { chance: 0.05, research: 120 },
  harvest: { chance: 0.05, food: 80 },
  tourism: { chance: 0.06, pop: 800, happiness: 0.62, perResident: 4 },
} as const;

const OIL_GOODS = new Set(['oil', 'fuel', 'plastics']);

/** World price multiplier from crises (oil shock, recession). */
export function priceShock(world: World, good: string, selling: boolean): number {
  const city = world.city!;
  let f = 1;
  if (OIL_GOODS.has(good) && world.time < (city.oilShockUntil ?? 0)) f *= EVENTS.oilShock.price;
  if (selling && world.time < (city.recessionUntil ?? 0)) f *= EVENTS.recession.exports;
  return f;
}

/** Tax multiplier during a recession. */
export function recessionFactor(world: World): number {
  return world.time < (world.city!.recessionUntil ?? 0) ? EVENTS.recession.taxes : 1;
}

const nations = (world: World) => world.players.filter((p) => !p.defeated && (p.role === 'nation' || p.role === 'human')).map((p) => p.id);

/** Once a game year: roll for events. */
export function updateEvents(world: World, sec: number): void {
  if (sec <= 0 || sec % YEAR_SECONDS !== YEAR_SECONDS / 2) return; // mid-year, apart from the budget rollover
  const city = world.city!;
  const year = Math.floor(world.time / YEAR_SECONDS);
  const r = () => world.rng.next();

  // Global.
  if (year >= EVENTS.oilShock.from && world.time >= (city.oilShockUntil ?? 0) && r() < EVENTS.oilShock.chance) {
    city.oilShockUntil = world.time + EVENTS.oilShock.years * YEAR_SECONDS;
    world.emit({ kind: 'notify', player: -1, text: `🛢 Oil shock: world oil, fuel and plastics prices more than double for two years. Nations that burn imported oil for power pay dearly; hydro, nuclear and wind don't care` });
  }
  if (year >= EVENTS.recession.from && world.time >= (city.recessionUntil ?? 0) && r() < EVENTS.recession.chance) {
    city.recessionUntil = world.time + EVENTS.recession.years * YEAR_SECONDS;
    world.emit({ kind: 'notify', player: -1, text: `📉 World recession: taxes bring in 20% less and exports fetch 15% less for a year` });
  }

  // Per nation.
  for (const id of nations(world)) {
    const pc = city.players[id]!;
    const houses = world.buildings.filter((b) => b.owner === id && b.type === 'house' && b.complete && b.city && b.city.residents > 0);
    if (!houses.length) continue;
    const covered = houses.filter((h) => h.city!.covered.health).length / houses.length;

    // Epidemic: worse where clinics and hospitals don't reach.
    if (r() < EVENTS.epidemic.chance + (covered < 0.4 ? EVENTS.epidemic.poorHealth : 0)) {
      let lost = 0;
      for (const h of houses) {
        const share = h.city!.covered.health ? EVENTS.epidemic.covered : EVENTS.epidemic.uncovered;
        const d = Math.floor(h.city!.residents * share);
        h.city!.residents -= d;
        lost += d;
      }
      world.emit({ kind: 'notify', player: id, text: `🦠 Epidemic: ${lost} people died${covered < 0.6 ? '. Clinics and hospitals cut deaths fourfold where they reach' : ', fewer than it might have been thanks to your clinics and hospitals'}` });
    }

    // Flood: buildings by rivers and lakes are out for a while; a dam halves the risk.
    const dam = world.buildings.some((b) => b.owner === id && b.type === 'hydro_plant' && b.complete);
    if (r() < EVENTS.flood.chance * (dam ? 0.5 : 1)) {
      const wet = world.buildings.filter((b) => b.owner === id && b.complete && b.city && nearFresh(world, b));
      if (wet.length) {
        for (const b of wet) {
          b.city!.sabotagedUntil = Math.max(b.city!.sabotagedUntil ?? 0, world.time + EVENTS.flood.seconds);
          b.city!.outReason = 'Flooded: drying out';
        }
        world.emit({ kind: 'notify', player: id, text: `🌊 Floods: ${wet.length} buildings by rivers and lakes are under water for a while${dam ? '' : '. A dam upstream (hydro plant) halves the risk'}`, x: wet[0]!.x, y: wet[0]!.y });
      }
    }

    // Strike: unhappy workers walk out of a quarter of the factories.
    if (pc.happiness < EVENTS.strike.happiness && r() < EVENTS.strike.chance) {
      const factories = world.buildings.filter((b) => b.owner === id && b.complete && b.city && b.def.econ?.recipe && b.def.econ.jobs && b.type !== 'house');
      const hit = factories.filter(() => r() < EVENTS.strike.share);
      for (const b of hit) {
        b.city!.sabotagedUntil = Math.max(b.city!.sabotagedUntil ?? 0, world.time + EVENTS.strike.seconds);
        b.city!.outReason = 'On strike';
      }
      if (hit.length) world.emit({ kind: 'notify', player: id, text: `✊ Strike: ${hit.length} workplaces stopped. People are unhappy (${Math.round(pc.happiness * 100)}%): lower taxes, better services, more goods` });
    }

    // Good fortune.
    if (world.buildings.some((b) => b.owner === id && b.type === 'research_institute' && b.complete) && r() < EVENTS.breakthrough.chance) {
      pc.research += EVENTS.breakthrough.research;
      world.emit({ kind: 'notify', player: id, text: `💡 Breakthrough: your researchers gain ${EVENTS.breakthrough.research} research points` });
    }
    if (r() < EVENTS.harvest.chance) {
      const hall = world.buildings.find((b) => b.owner === id && b.type === 'town_hall' && b.city);
      if (hall) {
        add(hall.city!.stock, 'food', EVENTS.harvest.food);
        world.emit({ kind: 'notify', player: id, text: `🌾 Bumper harvest: ${EVENTS.harvest.food} extra food in the Town Hall` });
      }
    }
    if (sumTiers(pc.population) >= EVENTS.tourism.pop && pc.happiness >= EVENTS.tourism.happiness && r() < EVENTS.tourism.chance) {
      const gain = Math.round(sumTiers(pc.population) * EVENTS.tourism.perResident);
      pc.credits += gain;
      pc.year.trade += gain;
      world.emit({ kind: 'notify', player: id, text: `🧳 Tourism boom: visitors spend ₡${gain.toLocaleString('en')} in your happy cities` });
    }
  }
}

function nearFresh(world: World, b: Building): boolean {
  const map = world.map;
  for (let y = b.ty - 1; y <= b.ty + b.h; y++) {
    for (let x = b.tx - 1; x <= b.tx + b.w; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if (map.fresh[y * map.width + x] === 1) return true;
    }
  }
  return false;
}
