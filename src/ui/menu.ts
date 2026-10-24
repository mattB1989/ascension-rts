// Start screen: continue, a new nation (map size, landscape, seed), or the
// skirmish modes. Choosing reloads the page with the settings in the URL, so
// every game starts from a clean slate (and the URL can be shared).

import { BIOMES, type GenBiome } from '../sim/mapgen.ts';
import { saveInfo } from './saves.ts';
import { SCENARIOS } from '../sim/city/scenarios.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function go(params: Record<string, string | number>): void {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  location.search = q.toString();
}

export function showMenu(root: HTMLElement): void {
  const wrap = el('div', 'menu');
  const card = el('div', 'menu-card');
  wrap.appendChild(card);
  card.appendChild(el('h1', 'menu-title', 'ASCENSION'));
  card.appendChild(el('p', 'muted menu-sub', 'Build a nation from 1950 to the stars. Trade, grow, and fight when you must.'));

  const saves = ['manual', 'auto'].map((slot) => ({ slot, info: saveInfo(slot) })).filter((s) => s.info).sort((a, b) => b.info!.savedAt - a.info!.savedAt);
  if (saves.length) {
    const row = el('div', 'menu-row');
    for (const s of saves) {
      const when = new Date(s.info!.savedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
      const b = el('button', 'btn primary menu-btn', `▶ Continue <small>${s.slot === 'auto' ? 'autosave' : 'save'} · ${s.info!.name} · ${when}</small>`);
      b.addEventListener('click', () => go({ load: s.slot }));
      row.appendChild(b);
    }
    card.appendChild(row);
  }
  const rec = saveInfo('replay');
  if (rec) {
    const b = el('button', 'btn menu-btn', `🎬 Watch the replay <small>${rec.name}</small>`);
    b.addEventListener('click', () => go({ replay: 'replay' }));
    card.appendChild(b);
  }

  card.appendChild(el('h2', '', 'New nation'));
  let size = 512;
  let biome: GenBiome = 'temperate';
  const sizes = el('div', 'seg');
  for (const [label, v, hint] of [['Small', 256, '256 × 256'], ['Standard', 512, '512 × 512']] as const) {
    const b = el('button', `btn ${v === size ? 'active' : ''}`, `${label} <small>${hint}</small>`);
    b.addEventListener('click', () => {
      size = v;
      for (const c of sizes.children) c.classList.remove('active');
      b.classList.add('active');
    });
    sizes.appendChild(b);
  }
  card.append(el('div', 'menu-label', 'Map size'), sizes);

  const biomes = el('div', 'biomes');
  for (const [id, info] of Object.entries(BIOMES) as Array<[GenBiome, { name: string; blurb: string }]>) {
    const b = el('button', `biome ${id === biome ? 'active' : ''}`, `<b>${info.name}</b><span>${info.blurb}</span>`);
    b.addEventListener('click', () => {
      biome = id;
      for (const c of biomes.children) c.classList.remove('active');
      b.classList.add('active');
    });
    biomes.appendChild(b);
  }
  card.append(el('div', 'menu-label', 'Landscape'), biomes);

  let difficulty = 'normal';
  const diff = el('div', 'seg');
  for (const [label, v, hint] of [['Easy', 'easy', 'rivals never attack'], ['Normal', 'normal', 'war when they are strong'], ['Hard', 'hard', 'early, aggressive rivals']] as const) {
    const b = el('button', `btn ${v === difficulty ? 'active' : ''}`, `${label} <small>${hint}</small>`);
    b.addEventListener('click', () => {
      difficulty = v;
      for (const c of diff.children) c.classList.remove('active');
      b.classList.add('active');
    });
    diff.appendChild(b);
  }
  let rivals = -1;
  const riv = el('div', 'seg');
  for (const [label, v] of [['Auto', -1], ['None', 0], ['1', 1], ['2', 2], ['3', 3]] as const) {
    const b = el('button', `btn ${v === rivals ? 'active' : ''}`, label);
    b.addEventListener('click', () => {
      rivals = v;
      for (const c of riv.children) c.classList.remove('active');
      b.classList.add('active');
    });
    riv.appendChild(b);
  }
  card.append(el('div', 'menu-label', 'Rival nations'), diff, riv);

  let victory = true;
  const vic = el('div', 'seg');
  for (const [label, v, hint] of [['Ways to win', true, 'economy, federation, space, conquest'], ['Sandbox', false, 'endless, nobody wins']] as const) {
    const b = el('button', `btn ${v === victory ? 'active' : ''}`, `${label} <small>${hint}</small>`);
    b.addEventListener('click', () => {
      victory = v;
      for (const c of vic.children) c.classList.remove('active');
      b.classList.add('active');
    });
    vic.appendChild(b);
  }
  card.append(el('div', 'menu-label', 'Game'), vic);

  const seedRow = el('div', 'menu-row');
  const seed = el('input', 'seed') as HTMLInputElement;
  seed.type = 'number';
  seed.value = String(1 + Math.floor(Math.random() * 99999));
  seed.title = 'Map seed: the same seed gives the same map';
  const start = el('button', 'btn primary', 'Found the nation →');
  start.addEventListener('click', () => go({ mode: 'city', size, biome, seed: Number(seed.value) || 1, difficulty, ...(rivals >= 0 ? { rivals } : {}), ...(victory ? {} : { victory: 0 }) }));
  seedRow.append(el('span', 'menu-label', 'Seed'), seed, start);
  card.appendChild(seedRow);

  card.appendChild(el('h2', '', 'Scenarios'));
  const scen = el('div', 'biomes scenarios');
  for (const sc of SCENARIOS) {
    const b = el('button', 'biome', `<b>${sc.name}</b><span>${sc.blurb}</span><span class="goal-line">🎯 ${sc.goal}</span>`);
    b.addEventListener('click', () => go({ mode: 'city', scenario: sc.id }));
    scen.appendChild(b);
  }
  card.appendChild(scen);

  card.appendChild(el('h2', '', 'Other games'));
  const sk = el('div', 'menu-row');
  const twin = el('button', 'btn', 'Twin Shores <small>the original RTS map</small>');
  twin.addEventListener('click', () => go({ mode: 'skirmish' }));
  const sand = el('button', 'btn', 'Battle sandbox <small>two armies, navies and air forces</small>');
  sand.addEventListener('click', () => go({ mode: 'sandbox' }));
  const watch = el('button', 'btn', 'Watch the AI <small>AI nations play every seat</small>');
  watch.addEventListener('click', () => go({ mode: 'city', size: 256, biome, seed: Number(seed.value) || 1, difficulty, spectate: 1, fog: 0 }));
  sk.append(twin, sand, watch);
  card.appendChild(sk);
  card.appendChild(el('p', 'muted menu-foot', 'Works offline. Desktop and touch. City-states are neutral neighbours you can trade with, buy, or unite with; rival nations grow, expand and, above Easy, go to war.'));

  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.appendChild(wrap);
}
