// The advisor: looks at your nation and says what matters most right now, in
// plain words, with one button to act on it. A handful of rules, ranked by how
// urgent they are; the HUD shows the top three.

import { HOUSE_LEVELS } from '../data/city.ts';
import { GOODS, sumTiers, type GoodId } from '../data/goods.ts';
import { nextAge } from '../sim/city/ages.ts';
import { latestReport } from '../sim/city/intel.ts';
import { atWar } from '../sim/city/military.ts';
import { opinionOf } from '../sim/city/treaties.ts';
import { get } from '../sim/city/state.ts';
import type { World } from '../sim/world.ts';

export type AdviceAction = { kind: 'build'; type: string } | { kind: 'panel'; panel: string } | { kind: 'goto'; x: number; y: number };

export interface Advice {
  /** 3 urgent, 2 important, 1 a good idea. */
  severity: 1 | 2 | 3;
  icon: string;
  text: string;
  why: string;
  action?: AdviceAction;
  label?: string;
}

/** What builds each material. */
const MAKER: Partial<Record<GoodId, string>> = { lumber: 'sawmill', concrete: 'cement_works', steel: 'steel_mill', food: 'food_plant', goods: 'goods_factory', fuel: 'oil_refinery', electronics: 'electronics_plant' };

export function advise(world: World, me: number): Advice[] {
  const city = world.city!;
  const pc = city.players[me]!;
  const out: Advice[] = [];
  const mine = world.buildings.filter((b) => b.owner === me);
  const has = (t: string) => mine.some((b) => b.type === t);
  const houses = mine.filter((b) => b.type === 'house' && b.complete && b.city);
  const pop = sumTiers(pc.population);
  const army = world.units.filter((u) => u.owner === me && !u.def.builder).length;

  // War and threats.
  const nations = world.players.filter((p) => p.id !== me && !p.defeated && (p.role === 'nation' || p.role === 'human'));
  for (const n of nations) {
    const theirs = world.units.filter((u) => u.owner === n.id && !u.def.builder).length;
    const war = atWar(world, me, n.id);
    if (war && army < theirs * 0.8) {
      const barracks = mine.find((b) => b.type === 'barracks' && b.complete);
      out.push({
        severity: 3, icon: '⚔', text: `${n.name} is at war with you: ${theirs} units against your ${army}`,
        why: barracks ? 'Train troops at your Barracks (click it), and garrison infantry in your Town Hall.' : 'Build a Barracks (Military) and train riflemen; garrisoned infantry defend a seat.',
        action: barracks ? { kind: 'goto', x: barracks.x, y: barracks.y } : { kind: 'build', type: 'barracks' }, label: barracks ? 'Show Barracks' : 'Build Barracks',
      });
    } else if (!war && theirs >= Math.max(6, army * 2) && opinionOf(world, n.id, me) < 0) {
      out.push({ severity: 2, icon: '🛡', text: `${n.name} dislikes you and has ${theirs} units to your ${army}`, why: 'Some defence makes an attack less tempting: a Barracks, a few riflemen, a bunker by the Town Hall.', action: { kind: 'build', type: has('barracks') ? 'bunker' : 'barracks' }, label: has('barracks') ? 'Build Bunker' : 'Build Barracks' });
    }
    if ((war || opinionOf(world, n.id, me) < -20) && !latestReport(world, me, n.id)) {
      out.push({ severity: war ? 2 : 1, icon: '🕵', text: `Find ${n.name}'s weak points`, why: 'A spy report shows what to bomb or sabotage: their key power plant, their only steel mill, undefended seats.', action: { kind: 'panel', panel: 'intel' }, label: 'Intelligence' });
    }
  }

  // Power.
  if (pc.powerDemand > pc.powerSupply + 0.5) {
    out.push({ severity: 3, icon: '⚡', text: `Power shortage: ${Math.round(pc.powerDemand)} MW needed, ${Math.round(pc.powerSupply)} MW made`, why: 'Houses without power lose a level and their technicians. Build a power plant (it burns oil) or a hydro plant on a river.', action: { kind: 'build', type: 'power_plant' }, label: 'Build Power Plant' });
  } else if (pc.powerSupply > 0 && pc.powerDemand > pc.powerSupply * 0.85) {
    out.push({ severity: 1, icon: '⚡', text: `Power nearly maxed out (${Math.round(pc.powerDemand)} of ${Math.round(pc.powerSupply)} MW)`, why: 'Add power before the next houses grow.', action: { kind: 'build', type: 'power_plant' }, label: 'Build Power Plant' });
  }

  // Money.
  const ly = pc.lastYear;
  const net = ly.taxes + ly.trade - ly.imports - ly.upkeep - ly.roads - ly.construction - ly.military;
  if (pc.credits < 1500 && net < 0) {
    out.push({ severity: 3, icon: '₡', text: `Nearly broke: ₡${Math.round(pc.credits)} and losing money`, why: 'Raise taxes a little, export a surplus at the Trade Port, or demolish idle buildings (they cost upkeep).', action: { kind: 'panel', panel: 'budget' }, label: 'Budget' });
  }

  // Needs of houses: what most stop them growing (or keep them at their level).
  if (houses.length >= 4) {
    const lacking: Record<string, number> = {};
    for (const h of houses) {
      const c = h.city!;
      const next = HOUSE_LEVELS[Math.min(HOUSE_LEVELS.length - 1, c.level + 1)]!;
      const cur = HOUSE_LEVELS[c.level]!;
      for (const n of new Set([...cur.needs, ...next.needs])) if (!c.needs[n as keyof typeof c.needs]) lacking[n] = (lacking[n] ?? 0) + 1;
    }
    const share = (n: string) => (lacking[n] ?? 0) / houses.length;
    const food = get(pc.stockpile, 'food');
    if (share('food') > 0.25) {
      if (food < 30) out.push({ severity: share('food') > 0.5 ? 3 : 2, icon: '🍞', text: `Food is running out (${Math.floor(food)} in stock)`, why: 'Farms grow crops on fertile land, a Food Plant turns them into food; a Fishing Harbour makes food on its own.', action: { kind: 'build', type: has('farm') && !has('food_plant') ? 'food_plant' : 'farm' }, label: has('farm') && !has('food_plant') ? 'Build Food Plant' : 'Build Farm' });
      else out.push({ severity: 2, icon: '🧺', text: `${lacking.food} houses can't reach a stocked market`, why: 'Markets serve houses within a few road tiles: build one among those houses.', action: { kind: 'build', type: 'market' }, label: 'Build Market' });
    }
    if (share('water') > 0.25) out.push({ severity: share('water') > 0.5 ? 3 : 2, icon: '💧', text: `${lacking.water} houses have no water`, why: has('pumping_station') || has('water_well') ? 'Water Towers spread water to the houses near them; check that pumps share their roads.' : 'A Pumping Station on a river or lake (or a Well), then Water Towers near the houses.', action: { kind: 'build', type: has('pumping_station') || has('water_well') ? 'water_tower' : 'pumping_station' }, label: has('pumping_station') || has('water_well') ? 'Build Water Tower' : 'Build Pumping Station' });
    const service: Array<[string, string, string]> = [['police', 'police_station', 'Police Station'], ['health', 'clinic', 'Clinic'], ['school', 'school', 'School'], ['goods', 'goods_factory', 'Goods Factory']];
    for (const [need, type, label] of service) {
      if (share(need) > 0.3) out.push({ severity: 1, icon: '🏘', text: `${lacking[need]} houses need ${need === 'goods' ? 'goods' : `a ${label.toLowerCase()}`} to grow`, why: need === 'goods' ? 'Goods come from a Goods Factory (plastics from a Refinery) through markets.' : `A ${label} covers the houses within its reach along the roads.`, action: { kind: 'build', type }, label: `Build ${label}` });
    }
  }

  // Jobs and workers.
  const unemployed = sumTiers(pc.population) - sumTiers(pc.employed);
  const vacancies = sumTiers(pc.jobs) - sumTiers(pc.employed);
  const techIdle = pc.population[1] - pc.employed[1];
  if (pop > 60 && unemployed > pop * 0.25) {
    if (techIdle > unemployed / 2) out.push({ severity: 2, icon: '🏭', text: `${unemployed} people are out of work, mostly technicians`, why: 'Technicians want skilled jobs: steel mills, refineries, power plants, research institutes, schools and clinics.', action: { kind: 'build', type: has('steel_mill') ? 'research_institute' : 'steel_mill' }, label: has('steel_mill') ? 'Build Institute' : 'Build Steel Mill' });
    else out.push({ severity: 2, icon: '🏭', text: `${unemployed} people are out of work`, why: 'Jobless people are unhappy and pay less: build industry (a sawmill, a quarry, a food plant) near the houses.', action: { kind: 'build', type: has('sawmill') ? 'quarry' : 'sawmill' }, label: has('sawmill') ? 'Build Quarry' : 'Build Sawmill' });
  }
  else if (vacancies > Math.max(12, sumTiers(pc.jobs) * 0.25)) out.push({ severity: 2, icon: '🏠', text: `${vacancies} jobs unfilled`, why: 'Farms and factories run short-handed: line more streets with houses.', action: { kind: 'build', type: 'house' }, label: 'Build Houses' });

  // Construction waiting for a material nobody makes enough of.
  const waiting: Record<string, number> = {};
  for (const b of mine) {
    if (b.complete || !b.city || b.type === 'house') continue;
    for (const [g, n] of Object.entries(b.def.econ?.materials ?? {}) as Array<[GoodId, number]>) if (get(b.city.delivered, g) < n && get(pc.stockpile, g) < n) waiting[g] = (waiting[g] ?? 0) + 1;
  }
  for (const [g, n] of Object.entries(waiting) as Array<[GoodId, number]>) {
    const maker = MAKER[g];
    out.push({ severity: n >= 3 ? 2 : 1, icon: '🚧', text: `${n} building site${n > 1 ? 's' : ''} short of ${GOODS[g].name.toLowerCase()}`, why: maker ? `More ${GOODS[g].name.toLowerCase()}: another ${maker.replace('_', ' ')} (and what feeds it), or import it at the Trade Port.` : 'Import it at the Trade Port.', action: maker ? { kind: 'build', type: maker } : { kind: 'panel', panel: 'trade' }, label: maker ? `Build ${maker.replace('_', ' ')}` : 'Trade' });
  }
  if (mine.some((b) => !b.complete && b.city?.status.startsWith('Cut off'))) out.push({ severity: 2, icon: '🛣', text: 'A building site is cut off from your roads', why: 'Connect its road to the Town Hall (or a warehouse) so trucks and crews can reach it.' });

  // The next age.
  const next = nextAge(world, me);
  if (next?.ready) out.push({ severity: 2, icon: '🔬', text: `Ready for the ${next.name}`, why: 'Everything it needs is in place: advance to unlock new buildings, people and units.', action: { kind: 'panel', panel: 'ages' }, label: 'Ages' });
  else if (next && pc.population[1] >= 100 && !has('research_institute')) out.push({ severity: 1, icon: '🔬', text: 'Start research towards the next age', why: 'A Research Institute, staffed by technicians, earns the research points the next age needs.', action: { kind: 'build', type: 'research_institute' }, label: 'Build Institute' });

  // Room to grow.
  const regions = Array.from(city.regionOwner).filter((o) => o === me).length;
  if (pc.credits > 15000 && net > 0 && regions < 4) out.push({ severity: 1, icon: '🗺', text: 'Claim more land', why: 'A Regional Office in a free neighbouring region claims it: more land, deposits and room for towns.', action: { kind: 'build', type: 'regional_office' }, label: 'Build Regional Office' });
  if (!latestReport(world, me, me) && pop > 400) out.push({ severity: 1, icon: '🕵', text: 'Know your own weak points', why: 'A report on yourself (half price) lists what an enemy would hit first.', action: { kind: 'panel', panel: 'intel' }, label: 'Intelligence' });

  if (!out.length) out.push({ severity: 1, icon: '👍', text: 'All is well', why: 'Grow: more houses on serviced streets, then save up for the next age (🔬).' });
  return out.sort((a, b) => b.severity - a.severity);
}
