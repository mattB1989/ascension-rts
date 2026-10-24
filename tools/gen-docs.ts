// Regenerates the tables in docs/TECH_TREE.md from src/data, between markers:
//   <!-- gen:NAME --> ... <!-- /gen:NAME -->
// Usage: npm run docs          (rewrite the file)
//        npm run docs -- --check (exit 1 if the file is out of date)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AGE_ORDER, AGES } from '../src/data/ages.ts';
import { BUILDINGS, BUILDING_TYPES } from '../src/data/buildings.ts';
import { TECH_IDS, TECHS, techImplemented } from '../src/data/techs.ts';
import type { AgeId, BuildingDef, Cost } from '../src/data/types.ts';
import { UNIT_TYPES, UNITS } from '../src/data/units.ts';
import { DAMAGE, DAMAGE_TYPE_NAMES, weaponsOf, type DamageType } from '../src/data/weapons.ts';
import { CONSUMPTION, HOUSE_LEVELS, TAX_PER_RESIDENT } from '../src/data/city.ts';
import { GOOD_IDS, GOODS, TIERS, type GoodId } from '../src/data/goods.ts';

const ARMOR: Record<string, string> = { inf: 'Inf', lt: 'Lt', hv: 'Hv', mech: 'Mech', ship: 'Ship', sub: 'Sub', air: 'Air', orb: 'Orb', str: 'Str' };
const CATEGORY: Record<string, string> = {
  core: 'Core', housing: 'Housing', resource: 'Resource', military: 'Military', tech: 'Tech',
  support: 'Support', defense: 'Defense', special: 'Special', wonder: 'Wonder',
  industry: 'Industry', logistics: 'Logistics', utility: 'Utility', service: 'Service',
};

/** Skirmish (RTS) catalog: everything not made for the economy game. */
const RTS_TYPES = BUILDING_TYPES.filter((id) => (BUILDINGS[id] as BuildingDef).mode !== 'city');
const CITY_TYPES = BUILDING_TYPES.filter((id) => (BUILDINGS[id] as BuildingDef).mode === 'city');
const goodsText = (s: Readonly<Partial<Record<GoodId, number>>>) => Object.entries(s).map(([g, n]) => `${n} ${GOODS[g as GoodId].name.toLowerCase()}`).join(' + ');

const cost = (c: Cost) => `${c.ore} / ${c.energy}`;
const bname = (id: string) => (BUILDINGS as Record<string, BuildingDef>)[id]?.name ?? id;
const ageName = (a: AgeId) => AGES[a].name.replace(' Age', '');

const SHORT: Record<DamageType, string> = { bullet: 'bullet', ap: 'AP', explosive: 'explosive', aa: 'AA', torpedo: 'torpedo', laser: 'laser', emp: 'EMP' };

function weaponsText(id: string): string {
  const ws = weaponsOf(id);
  if (!ws.length) return '—';
  return ws
    .map((w) => `${w.name}: ${w.damage} ${SHORT[w.type]} / ${w.cooldown}s, range ${w.range}${w.minRange ? ` (min ${w.minRange})` : ''}${w.splash ? `, splash ${w.splash}` : ''}`)
    .join('<br>');
}

function table(head: string[], rows: string[][]): string {
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

export function renderTables(): Record<string, string> {
  const out: Record<string, string> = {};

  out.ages = table(
    ['Age', 'Theme', 'Advance cost', 'Time', 'Requirements (at the HQ)'],
    AGE_ORDER.map((id) => {
      const a = AGES[id];
      const req: string[] = [];
      if (a.requiresAll.length) req.push(a.requiresAll.map(bname).join(' + '));
      if (a.requiresAny.length) req.push(`${a.anyCount} of: ${a.requiresAny.map(bname).join(', ')}`);
      return [`**${ageName(id)}**`, a.theme, a.index === 0 ? '—' : cost(a.cost), a.index === 0 ? '—' : String(a.time), req.join('; ') || '—'];
    }),
  );

  const lines = ['```mermaid', 'flowchart LR'];
  for (const age of AGE_ORDER) {
    lines.push(`  subgraph ${ageName(age)}`);
    for (const id of RTS_TYPES.filter((b) => BUILDINGS[b].age === age)) lines.push(`    ${id}[${BUILDINGS[id].name}]`);
    lines.push('  end');
  }
  for (const id of RTS_TYPES) for (const r of BUILDINGS[id].requires) lines.push(`  ${r} --> ${id}`);
  lines.push('```');
  out.prereq_diagram = lines.join('\n');

  const nonDefense = RTS_TYPES.filter((id) => BUILDINGS[id].category !== 'defense');
  out.buildings = table(
    ['Building', 'Category', 'Age', 'Requires', 'Cost', 'Build time', 'Size', 'Pop', 'Function'],
    nonDefense.map((id) => {
      const b: BuildingDef = BUILDINGS[id];
      const fn = [b.description];
      if (b.produces) fn.push(`Produces ${b.produces.perSecond} ${b.produces.resource}/s.`);
      if (b.limit) fn.push(`Max ${b.limit}.`);
      return [
        `**${b.name}**`, CATEGORY[b.category]!, ageName(b.age), b.requires.map(bname).join(' + ') || '—',
        cost(b.cost), String(b.buildTime), `${b.size[0]}×${b.size[1]}`, b.pop ? `+${b.pop}` : '—', fn.join(' '),
      ];
    }),
  );

  const defense = RTS_TYPES.filter((id) => BUILDINGS[id].category === 'defense');
  out.defense = table(
    ['Structure', 'Age', 'Requires', 'Cost', 'Build time', 'HP', 'Garrison', 'Weapons', 'Notes'],
    defense.map((id) => {
      const b: BuildingDef = BUILDINGS[id];
      return [`**${b.name}**`, ageName(b.age), b.requires.map(bname).join(' + '), cost(b.cost), String(b.buildTime), String(b.hp), b.garrison ? `${b.garrison} infantry` : '—', weaponsText(id), b.description];
    }),
  );

  const armors = ['inf', 'lt', 'hv', 'mech', 'ship', 'sub', 'air', 'orb', 'str'] as const;
  out.damage = table(
    ['', 'Inf', 'Lt', 'Hv', 'Mech', 'Ship', 'Sub', 'Air', 'Orb', 'Str'],
    (Object.keys(DAMAGE) as DamageType[]).map((t) => [DAMAGE_TYPE_NAMES[t], ...armors.map((a) => (DAMAGE[t][a] ? String(DAMAGE[t][a]) : '—'))]),
  );

  for (const age of AGE_ORDER) {
    const units = UNIT_TYPES.filter((id) => UNITS[id].age === age);
    out[`units_${age}`] = table(
      ['Unit', 'From', 'Class', 'Cost', 'Pop', 'HP', 'Speed', 'Weapons', 'Strong vs', 'Weak vs'],
      units.map((id) => {
        const u = UNITS[id];
        const name = 'limit' in u && u.limit ? `**${u.name}** (max ${u.limit})` : `**${u.name}**`;
        return [name, bname(u.trainedAt), ARMOR[u.armor]!, cost(u.cost), String(u.pop), String(u.hp), String(u.speed), weaponsText(id), u.strongVs, u.weakVs];
      }),
    );
  }

  out.city_buildings = table(
    ['Building', 'Category', 'Size', 'Price', 'Materials', 'Upkeep /yr', 'Staff', 'Makes', 'Notes'],
    CITY_TYPES.map((id) => {
      const b: BuildingDef = BUILDINGS[id];
      const e = b.econ!;
      const makes: string[] = [];
      if (e.recipe) makes.push(`${goodsText(e.recipe.in) ? `${goodsText(e.recipe.in)} → ` : ''}${goodsText(e.recipe.out) || 'power'} every ${e.recipe.seconds}s`);
      if ((e.power ?? 0) < 0) makes.push(`${-e.power!} MW`);
      if (e.service) makes.push(`${e.service.kind}: ${e.service.capacity} residents within ${e.service.radius} road tiles`);
      if (e.waterSupply) makes.push(`water for ${e.waterSupply}`);
      if (e.storage) makes.push(`stores ${e.storage}`);
      if (e.housing) makes.push(`${e.housing.join(' / ')} residents by level`);
      const extras = [(e.power ?? 0) > 0 ? `needs ${e.power} MW` : '', e.trucks ? `${e.trucks} truck${e.trucks > 1 ? 's' : ''}` : '', e.crews ? `${e.crews} crews` : '', b.limit ? `max ${b.limit}` : ''].filter(Boolean);
      return [
        `**${b.name}**`, CATEGORY[b.category]!, `${b.size[0]}×${b.size[1]}`, `₡${e.credits}`, goodsText(e.materials) || '—', String(e.upkeep),
        e.jobs ? `${e.jobs.count} ${TIERS[e.jobs.tier]!.name.toLowerCase()}` : '—', makes.join('; ') || '—', [b.description, ...extras].join(' '),
      ];
    }),
  );

  out.goods = table(
    ['Good', 'Reference price', 'Made by', 'Used by'],
    GOOD_IDS.map((g) => {
      const by = (side: 'in' | 'out') => CITY_TYPES.filter((id) => (BUILDINGS[id] as BuildingDef).econ?.recipe?.[side][g]).map((id) => BUILDINGS[id].name);
      const used = [...by('in'), ...(g in CONSUMPTION ? ['households (markets)'] : []), ...CITY_TYPES.filter((id) => (BUILDINGS[id] as BuildingDef).econ?.materials[g]).map((id) => `${BUILDINGS[id].name} (construction)`)];
      return [`${GOODS[g].icon} **${GOODS[g].name}**`, `₡${GOODS[g].price}`, by('out').join(', ') || '—', used.join(', ') || '—'];
    }),
  );

  out.house_levels = table(
    ['Level', 'Residents', 'Tier', 'Taxes per resident /yr', 'Needs'],
    HOUSE_LEVELS.map((l, i) => [`**${l.name}**`, String((BUILDINGS.house as BuildingDef).econ!.housing![i]), TIERS[l.tier].name, `₡${TAX_PER_RESIDENT[l.tier]}`, l.needs.join(', ') || 'a road']),
  );

  const atBuildings = [...new Set(TECH_IDS.map((id) => TECHS[id].at as string))];
  out.research_grid = table(
    ['Building', ...AGE_ORDER.map(ageName)],
    atBuildings.map((b) => [
      `**${bname(b)}**`,
      ...AGE_ORDER.map((age) => TECH_IDS.filter((id) => TECHS[id].at === b && TECHS[id].age === age).map((id) => TECHS[id].name).join('; ') || '—'),
    ]),
  );

  out.research = table(
    ['Research', 'At', 'Age', 'Cost', 'Time', 'Effect', 'In game'],
    TECH_IDS.map((id) => {
      const t = TECHS[id];
      const pending = t.effects.find((e) => e.kind === 'pending');
      return [`**${t.name}**`, bname(t.at), ageName(t.age), cost(t.cost), String(t.time), t.summary, techImplemented(id) ? 'yes' : `from ${pending && 'milestone' in pending ? pending.milestone : '?'}`];
    }),
  );

  return out;
}

export function applyTables(md: string, tables: Record<string, string>): string {
  return md.replace(/<!-- gen:(\w+) -->[\s\S]*?<!-- \/gen:\1 -->/g, (whole, name: string) => {
    const t = tables[name];
    if (t === undefined) return whole;
    return `<!-- gen:${name} -->\n${t}\n<!-- /gen:${name} -->`;
  });
}

export const DOC_PATH = fileURLToPath(new URL('../docs/TECH_TREE.md', import.meta.url));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const md = readFileSync(DOC_PATH, 'utf8');
  const next = applyTables(md, renderTables());
  if (process.argv.includes('--check')) {
    if (next !== md) {
      console.error('docs/TECH_TREE.md is out of date: run `npm run docs`.');
      process.exit(1);
    }
    console.log('docs/TECH_TREE.md is up to date.');
  } else {
    writeFileSync(DOC_PATH, next);
    console.log('docs/TECH_TREE.md regenerated.');
  }
}
