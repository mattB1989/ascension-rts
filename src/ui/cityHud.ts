// Interface for the economy game: top bar (money, people, mood, power, date,
// game speed), build palette, an info panel for whatever is selected or being
// placed, and the goods, budget and game panels.

import { buildingDef, type BuildingTypeId } from '../data/buildings.ts';
import { CITY_PALETTE, HOUSE_LEVELS, ROAD } from '../data/city.ts';
import { GOOD_IDS, GOODS, TIERS, type GoodId } from '../data/goods.ts';
import type { Game } from '../game.ts';
import { houseCapacity, gameMonth, gameYear } from '../sim/city/economy.ts';
import { stockTotal } from '../sim/city/logistics.ts';
import { get } from '../sim/city/state.ts';
import { DEPOSIT_NAMES, TERRAIN_NAMES, type TerrainId } from '../sim/map.ts';
import type { Building, GameEvent, World } from '../sim/world.ts';
import { materialsText, type PlaceType } from './cityTools.ts';
import type { InputController } from './input.ts';
import type { Minimap } from './minimap.ts';
import type { Selection } from './selection.ts';
import { setOverlay } from '../render/fog.ts';
import { computeOverlay, OVERLAYS, overlayFor, type OverlayKind, type OverlayMark } from './overlays.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SPEEDS = [1, 2, 4, 8];
const NEED_LABEL: Record<string, string> = {
  food: '🍞 Food', water: '💧 Water', goods: '📦 Goods', power: '⚡ Power', police: '🚓 Police', health: '🏥 Health', school: '🎓 School',
};

const TOOL_INFO: Record<string, { name: string; text: string }> = {
  road: { name: 'Road', text: `Drag to draw a road (₡${ROAD.cost} a tile, ₡${ROAD.bridgeCost} over shallow water). Every building needs one.` },
  bulldoze: { name: 'Bulldozer', text: 'Drag over roads to remove them, or click a building to demolish it. No refunds.' },
};

const fmt = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
const sign = (n: number) => (n >= 0 ? `+${fmt(n)}` : `−${fmt(-n)}`);

export class CityHud {
  private readonly world: World;
  private readonly game: Game;
  private readonly selection: Selection;
  private readonly input: InputController;
  private readonly topRes: HTMLDivElement;
  private readonly speedBtns: HTMLButtonElement[] = [];
  private readonly info: HTMLDivElement;
  private readonly palette: HTMLDivElement;
  private readonly toastsEl: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private tab = 0;
  /** Overlay picked by the player (null: automatic while placing). */
  private overlay: OverlayKind | null = null;
  private shownOverlay: OverlayKind | null = null;
  private overlayAt = 0;
  private readonly overlayBar: HTMLDivElement;
  private panelKind: 'goods' | 'budget' | 'menu' | 'help' | null = null;
  private lastTop = '';
  private lastInfo = '';
  private lastPanel = '';
  private lastPalette = '';
  private refreshAt = 0;
  /** Save / load / new game, provided by main. */
  onSave: () => void = () => {};
  onLoad: () => void = () => {};
  onNew: () => void = () => {};
  hasSave: () => boolean = () => false;
  /** Tint buildings for the current overlay (set by main: renderer.marks.set). */
  onMarks: (marks: OverlayMark[]) => void = () => {};

  constructor(root: HTMLElement, game: Game, selection: Selection, input: InputController, minimap: Minimap) {
    this.world = game.world;
    this.game = game;
    this.selection = selection;
    this.input = input;

    const top = el('div', 'topbar');
    this.topRes = el('div', 'resbar city-res');
    const speed = el('div', 'speedbar');
    const pause = this.btn('❚❚', 'Pause (Space)', () => this.setSpeed(0), 'btn speed');
    this.speedBtns.push(pause);
    speed.append(pause);
    for (const s of SPEEDS) {
      const b = this.btn(`${s}×`, `Game speed ${s}× (${SPEEDS.indexOf(s) + 1})`, () => this.setSpeed(s), 'btn speed');
      this.speedBtns.push(b);
      speed.append(b);
    }
    const right = el('div', 'top-actions');
    right.append(
      this.btn('🗺', 'Overlays: land, water, power, services, happiness, pollution', () => this.overlayBar.classList.toggle('hidden')),
      this.btn('📦', 'Goods: stock, made and used', () => this.togglePanel('goods')),
      this.btn('₡', 'Budget and taxes', () => this.togglePanel('budget')),
      this.btn('☰', 'Save, load, new game', () => this.togglePanel('menu')),
      this.btn('?', 'How to play', () => this.togglePanel('help')),
    );
    top.append(this.topRes, speed, right);

    this.toastsEl = el('div', 'toasts');

    const bottom = el('div', 'bottombar city-bottom');
    const mm = el('div', 'minimap-wrap');
    mm.appendChild(minimap.el);
    this.info = el('div', 'selpanel city-info');
    this.palette = el('div', 'palette');
    bottom.append(mm, this.info, this.palette);

    this.panel = el('div', 'city-panel hidden');
    this.overlayBar = el('div', 'overlay-bar hidden');

    root.append(top, this.overlayBar, this.toastsEl, bottom, this.panel);
    this.renderOverlayBar();

    // Clicks inside re-rendered areas use data-action attributes.
    for (const area of [this.info, this.palette, this.panel, this.overlayBar]) {
      area.addEventListener('pointerdown', (e) => e.stopPropagation());
      area.addEventListener('click', (e) => {
        const t = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
        if (t) {
          e.stopPropagation();
          this.action(t.dataset.action!, t.dataset.arg ?? '');
        }
      });
    }
    input.toast = (t) => this.toast(t);
    input.cityKeys = (e) => this.onKey(e);
    selection.onChange(() => (this.lastInfo = ''));
    this.renderPalette();

    try {
      if (!localStorage.getItem('ascension.helpSeen.e3')) {
        this.togglePanel('help');
        localStorage.setItem('ascension.helpSeen.e3', '1');
      }
    } catch {
      // No storage: don't auto-show.
    }
  }

  private btn(label: string, title: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
    const b = el('button', cls, label);
    b.title = title;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    return b;
  }

  private setSpeed(s: number): void {
    if (s === 0) this.game.paused = !this.game.paused;
    else {
      this.game.paused = false;
      this.game.timeScale = s;
    }
    this.lastTop = '';
  }

  private onKey(e: KeyboardEvent): boolean {
    if (e.code === 'Space') {
      e.preventDefault();
      this.setSpeed(0);
      return true;
    }
    const d = /^Digit([1-4])$/.exec(e.code);
    if (d) {
      this.setSpeed(SPEEDS[Number(d[1]) - 1]!);
      return true;
    }
    return false;
  }

  private togglePanel(kind: 'goods' | 'budget' | 'menu' | 'help'): void {
    this.panelKind = this.panelKind === kind ? null : kind;
    this.panel.classList.toggle('hidden', this.panelKind === null);
    this.lastPanel = '';
    this.renderPanel();
  }

  private action(a: string, arg: string): void {
    switch (a) {
      case 'tab':
        this.tab = Number(arg);
        this.renderPalette();
        break;
      case 'overlay':
        this.overlay = this.overlay === arg ? null : (arg as OverlayKind);
        this.overlayAt = 0;
        this.renderOverlayBar();
        break;
      case 'build':
        this.selection.clear();
        this.input.startPlacement(arg as PlaceType);
        this.lastInfo = '';
        break;
      case 'confirm':
        this.input.confirmPlacement();
        break;
      case 'cancel':
        if (this.input.placing) this.input.cancelPlacement();
        else this.selection.clear();
        this.lastInfo = '';
        break;
      case 'demolish': {
        const b = this.world.getBuilding(Number(arg));
        if (b) this.game.issue({ kind: 'demolish', player: this.game.humanPlayer, building: b.id });
        this.selection.clear();
        break;
      }
      case 'tax': {
        const pc = this.world.city!.players[this.game.humanPlayer]!;
        this.game.issue({ kind: 'taxRate', player: this.game.humanPlayer, rate: pc.taxRate + Number(arg) });
        this.lastPanel = '';
        break;
      }
      case 'close':
        this.panelKind = null;
        this.panel.classList.add('hidden');
        break;
      case 'save':
        this.onSave();
        this.lastPanel = '';
        break;
      case 'load':
        this.onLoad();
        break;
      case 'new':
        this.onNew();
        break;
      case 'goto': {
        const [x, y] = arg.split(',').map(Number);
        this.input.lookAt(x!, y!);
        break;
      }
    }
  }

  toast(text: string): void {
    const last = this.toastsEl.lastElementChild as HTMLElement | null;
    if (last && last.dataset.text === text) {
      last.classList.remove('fade');
      void last.offsetWidth;
      last.classList.add('fade');
      return;
    }
    const t = el('div', 'toast fade', text);
    t.dataset.text = text;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstElementChild?.remove();
    setTimeout(() => t.remove(), 3200);
  }

  handleEvents(events: readonly GameEvent[]): void {
    const me = this.game.humanPlayer;
    for (const e of events) {
      if (!('player' in e) || (e.player !== me && e.player !== -1)) continue;
      if (e.kind === 'notify') this.toast(e.text);
      else if (e.kind === 'buildingComplete') {
        const b = this.world.getBuilding(e.building);
        if (b && b.type !== 'house') this.toast(`${b.def.name} complete`);
      }
    }
  }

  // -------------------------------------------------------------------------

  private renderOverlayBar(): void {
    const active = this.overlay;
    const info = OVERLAYS.find((o) => o.id === (active ?? this.shownOverlay));
    this.overlayBar.innerHTML = `<div class="ov-btns">${OVERLAYS.map((o) => `<button class="ov ${o.id === active ? 'on' : ''}" data-action="overlay" data-arg="${o.id}" title="${o.name}">${o.icon}<span>${o.name}</span></button>`).join('')}</div>${info ? `<div class="ov-legend">${info.legend}</div>` : ''}`;
  }

  /** Show the chosen overlay, or the one that fits what is being placed; refresh once a second. */
  private updateOverlay(now: number): void {
    const placing = this.input.placing?.type;
    const want = this.overlay ?? (placing ? overlayFor(placing) : null);
    if (want !== this.shownOverlay) {
      this.shownOverlay = want;
      this.overlayAt = 0;
      if (!want) {
        setOverlay(null);
        this.onMarks([]);
      }
      this.renderOverlayBar();
    }
    if (want && now - this.overlayAt > 1000) {
      this.overlayAt = now;
      const r = computeOverlay(this.world, want, this.game.humanPlayer);
      setOverlay(r.tiles);
      this.onMarks(r.marks);
    }
  }

  update(): void {
    const now = performance.now();
    this.updateOverlay(now);
    if (now - this.refreshAt < 250) return;
    this.refreshAt = now;
    this.renderTop();
    this.renderInfo();
    this.renderPanel();
    this.renderPaletteState();
  }

  private renderTop(): void {
    const pc = this.world.city!.players[this.game.humanPlayer]!;
    const y = pc.lastYear;
    const cur = pc.year;
    // Net per year: last full year, or this year so far scaled up.
    const frac = (this.world.time % 120) / 120;
    const src = y.taxes + y.upkeep > 0 ? y : null;
    const net = src ? src.taxes + src.trade - src.upkeep - src.roads : frac > 0.05 ? (cur.taxes + cur.trade - cur.upkeep - cur.roads) / frac : 0;
    const pop = pc.population[0] + pc.population[1];
    const happy = Math.round(pc.happiness * 100);
    const date = `${MONTHS[gameMonth(this.world)]} ${gameYear(this.world)}`;
    const powerShort = pc.powerDemand > pc.powerSupply + 0.01;
    const s = [Math.floor(pc.credits), Math.round(net), pop, pc.population.join(','), happy, Math.round(pc.powerSupply), Math.round(pc.powerDemand), date, this.game.paused, this.game.timeScale].join('|');
    if (s === this.lastTop) return;
    this.lastTop = s;
    this.topRes.innerHTML = `
      <span class="res" title="Credits (net per year)"><b class="c-credit">₡</b> ${fmt(pc.credits)} <small class="${net >= 0 ? 'pos' : 'neg'}">${sign(net)}/yr</small></span>
      <span class="res" title="Population: ${TIERS.map((t) => `${t.name} ${pc.population[t.id]}`).join(', ')}"><b>👥</b> ${fmt(pop)} <small>${pc.population[0]}W · ${pc.population[1]}T</small></span>
      <span class="res ${happy < 40 ? 'neg' : ''}" title="Happiness"><b>${happy >= 60 ? '😊' : happy >= 40 ? '😐' : '😟'}</b> ${happy}%</span>
      <span class="res ${powerShort ? 'neg' : ''}" title="Power supply / demand (MW)"><b class="c-energy">⚡</b> ${Math.round(pc.powerSupply)}<small>/${Math.round(pc.powerDemand)} MW</small></span>
      <span class="res res-date" title="Date">📅 ${date}</span>`;
    this.speedBtns.forEach((b, i) => b.classList.toggle('active', i === 0 ? this.game.paused : !this.game.paused && this.game.timeScale === SPEEDS[i - 1]));
  }

  // -------------------------------------------------------------------------
  // Build palette

  private renderPalette(): void {
    const tabs = CITY_PALETTE.map((t, i) => `<button class="pal-tab ${i === this.tab ? 'on' : ''}" data-action="tab" data-arg="${i}" title="${t.tab}">${t.icon}<span>${t.tab}</span></button>`).join('');
    const tab = CITY_PALETTE[this.tab]!;
    const items = tab.items.map((id) => {
      if (id === 'road') {
        return `<button class="cmd pal-item" data-action="build" data-arg="road" data-id="road"><span class="cmd-name">🛣 Road</span><span class="cmd-cost">₡${ROAD.cost}/tile · R</span></button>`
          + `<button class="cmd pal-item" data-action="build" data-arg="bulldoze" data-id="bulldoze"><span class="cmd-name">🚜 Bulldozer</span><span class="cmd-cost">B</span></button>`;
      }
      const def = buildingDef(id as BuildingTypeId);
      const mats = materialsText(id as BuildingTypeId);
      return `<button class="cmd pal-item" data-action="build" data-arg="${id}" data-id="${id}" title="${esc(def.description)}"><span class="cmd-name">${esc(def.name)}</span><span class="cmd-cost">₡${def.econ?.credits ?? 0}${mats ? ` ${mats}` : ''}</span></button>`;
    }).join('');
    const html = `<div class="pal-tabs">${tabs}</div><div class="cmd-grid pal-items">${items}</div>`;
    if (html !== this.lastPalette) {
      this.lastPalette = html;
      this.palette.innerHTML = html;
    }
    this.renderPaletteState();
  }

  /** Grey out what can't be afforded; highlight the active tool. */
  private renderPaletteState(): void {
    const credits = this.world.city!.players[this.game.humanPlayer]!.credits;
    const active = this.input.placing?.type;
    for (const b of this.palette.querySelectorAll<HTMLElement>('.pal-item')) {
      const id = b.dataset.id!;
      const price = id === 'road' ? ROAD.cost : id === 'bulldoze' ? 0 : buildingDef(id as BuildingTypeId).econ?.credits ?? 0;
      b.classList.toggle('disabled', price > credits);
      b.classList.toggle('on', id === active);
    }
  }

  // -------------------------------------------------------------------------
  // Info panel

  private renderInfo(): void {
    const html = this.infoHtml();
    if (html === this.lastInfo) return;
    this.lastInfo = html;
    this.info.innerHTML = html;
  }

  private infoHtml(): string {
    const pl = this.input.placing;
    if (pl) return this.placingHtml(pl.type, pl.problem, this.input.lineInfo);
    const id = this.selection.list()[0] ?? (this.selection.inspect?.kind === 'entity' ? this.selection.inspect.id : 0);
    const b = id ? this.world.getBuilding(id) : undefined;
    if (b?.city) return this.buildingHtml(b);
    const ins = this.selection.inspect;
    if (ins?.kind === 'ground') return this.groundHtml(ins.x, ins.y);
    return `<div class="muted">${this.input.touchDevice ? 'Tap a building to see how it is doing.' : 'Click a building to see how it is doing.'} Start with roads (<b>R</b>), then houses and a Logging Camp + Sawmill.</div>`;
  }

  private placingHtml(type: PlaceType, problem: string | null, info: string): string {
    const tool = TOOL_INFO[type];
    const def = tool ? null : buildingDef(type as BuildingTypeId);
    const name = tool?.name ?? def!.name;
    const text = tool?.text ?? def!.description;
    const touch = this.input.touchDevice;
    const extra = def?.econ ? econSummary(type as BuildingTypeId) : '';
    const hint = touch
      ? type === 'road' || type === 'bulldoze' || type === 'house' ? 'Tap the start, then the end, then ✓.' : 'Tap the map to position it, then ✓.'
      : type === 'road' || type === 'bulldoze' || type === 'house' ? 'Drag to draw. Right click or Esc to stop.' : 'Click to place (Shift: keep placing). Right click or Esc to cancel.';
    const btns = `${touch ? `<button class="cmd primary ${problem ? 'disabled' : ''}" data-action="confirm">✓ Build</button>` : ''}<button class="cmd" data-action="cancel">✕ ${touch ? 'Cancel' : 'Stop'}</button>`;
    return `<div class="card-head"><div class="card-title">${esc(name)}</div><div class="card-status">${esc(info)}</div></div>
      <div class="info-text">${esc(text)}</div>${extra}
      ${problem ? `<div class="info-problem">${esc(problem)}</div>` : ''}
      <div class="card-hint">${hint}</div><div class="info-actions">${btns}</div>`;
  }

  private buildingHtml(b: Building): string {
    const c = b.city!;
    const e = b.def.econ!;
    const own = b.owner === this.game.humanPlayer;
    const rows: string[] = [];
    let title = b.def.name;
    if (b.type === 'house') {
      const lvl = HOUSE_LEVELS[c.level]!;
      title = `${lvl.name}`;
      if (b.complete) {
        rows.push(`<div>👥 ${Math.floor(c.residents)}/${houseCapacity(b)} ${TIERS[lvl.tier]!.name.toLowerCase()} · ${Math.round(c.happiness * 100)}% happy${c.pollution > 0.15 ? ` · 🏭 pollution ${Math.round(c.pollution * 100)}%` : ''}</div>`);
        const next = HOUSE_LEVELS[c.level + 1];
        const needs = (next ?? lvl).needs as readonly string[];
        if (needs.length) {
          rows.push(`<div class="needs">${next ? `To become ${next.name.toLowerCase()}: ` : 'Keeps: '}${needs.map((n) => `<span class="need ${c.needs[n as keyof typeof c.needs] ? 'ok' : 'no'}">${NEED_LABEL[n]}</span>`).join('')}</div>`);
        }
        if (c.downFor > 5) rows.push(`<div class="info-problem">Missing what a ${lvl.name.toLowerCase()} needs: it will shrink</div>`);
      }
    }
    const status = c.status;
    if (!b.complete) {
      rows.push(`<div class="progress"><div style="width:${Math.round(b.progress * 100)}%"></div></div>`);
      const mats = Object.entries(e.materials) as Array<[GoodId, number]>;
      if (mats.length) rows.push(`<div class="stock">${mats.map(([g, n]) => chip(g, `${Math.floor(get(c.delivered, g))}/${n}`)).join('')}</div>`);
    } else {
      if (e.jobs) rows.push(`<div>👷 ${c.workers}/${e.jobs.count} ${TIERS[e.jobs.tier]!.name.toLowerCase()}${e.recipe ? ` · ${Math.round(c.efficiency * 100)}% output` : ''}${e.extract ? ` · land ${Math.round(c.yield * 100)}%` : ''}</div>`);
      if (e.recipe) rows.push(`<div class="recipe">${recipeText(b.type)}</div>`);
      if ((e.power ?? 0) < 0) rows.push(`<div>⚡ ${Math.round(c.powerOut)} of ${-e.power!} MW</div>`);
      else if ((e.power ?? 0) > 0) rows.push(`<div>⚡ needs ${e.power} MW: ${c.powered ? 'powered' : '<span class="neg">no power</span>'}</div>`);
      if (e.service) rows.push(`<div>Serves ${Math.floor(c.served)}/${e.service.capacity} residents within ${e.service.radius} road tiles</div>`);
      if (e.waterSupply) rows.push(`<div>💧 water for ${e.waterSupply} residents</div>`);
      if (e.storage) rows.push(`<div>Stored ${Math.floor(stockTotal(c.stock))}/${e.storage}</div>`);
      const held = GOOD_IDS.filter((g) => get(c.stock, g) >= 0.5);
      if (held.length) rows.push(`<div class="stock">${held.map((g) => chip(g, `${Math.floor(get(c.stock, g))}`)).join('')}</div>`);
      if (e.trucks || e.crews) rows.push(`<div class="muted">${e.trucks ? `🚚 ${c.trucksOut}/${e.trucks} out` : ''}${e.trucks && e.crews ? ' · ' : ''}${e.crews ? `👷 ${c.crewsOut}/${e.crews} crews out` : ''}</div>`);
    }
    const head = `<div class="card-head"><div class="card-title">${esc(title)}</div><div class="card-status ${status && status !== '' ? 'warn' : ''}">${esc(status || (b.complete ? 'Working' : ''))}</div></div>`;
    const actions = own && b.type !== 'town_hall' ? `<div class="info-actions"><button class="cmd danger" data-action="demolish" data-arg="${b.id}">🗑 Demolish</button></div>` : '';
    return head + rows.join('') + actions;
  }

  private groundHtml(x: number, y: number): string {
    const map = this.world.map;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return '';
    const i = ty * map.width + tx;
    const reg = map.region[i]!;
    const r = reg ? map.regions[reg - 1] : undefined;
    const owner = reg ? this.world.city!.regionOwner[reg]! : -1;
    const dep = map.deposit[i]!;
    const lines = [`<div class="card-head"><div class="card-title">${esc(r?.name ?? TERRAIN_NAMES[map.terrain[i] as TerrainId])}</div><div class="card-status">${r ? (owner === this.game.humanPlayer ? 'Your region' : owner >= 0 ? 'Claimed' : 'Unclaimed') : ''}</div></div>`];
    lines.push(`<div>${TERRAIN_NAMES[map.terrain[i] as TerrainId]}${dep ? ` · ${DEPOSIT_NAMES[dep as 1]} deposit` : ''}${map.fresh[i] ? ' · fresh water' : ''}</div>`);
    if (r) {
      const offers = [r.fertile ? `🌾 ${r.fertile} fertile` : '', r.forest ? `🌲 ${r.forest} forest` : '', r.ore ? `⛏ ore` : '', r.stone ? `🪨 stone` : '', r.oil ? `🛢 oil` : '', r.coast ? '🌊 coast' : '', r.river ? '〰 river' : ''].filter(Boolean);
      lines.push(`<div class="muted">${offers.join(' · ')}</div>`);
      if (owner === -1) lines.push(`<div class="muted">Build a Regional Office here (connected by road) to claim it.</div>`);
    }
    return lines.join('');
  }

  // -------------------------------------------------------------------------
  // Panels

  private renderPanel(): void {
    if (!this.panelKind) return;
    const html = this.panelHtml();
    if (html === this.lastPanel) return;
    this.lastPanel = html;
    this.panel.innerHTML = html;
  }

  private panelHtml(): string {
    const close = `<button class="btn panel-close" data-action="close">✕</button>`;
    const pc = this.world.city!.players[this.game.humanPlayer]!;
    switch (this.panelKind) {
      case 'goods': {
        const stored: Record<string, number> = {};
        for (const b of this.world.buildings) {
          if (b.owner !== this.game.humanPlayer || !b.city) continue;
          for (const g of GOOD_IDS) stored[g] = (stored[g] ?? 0) + get(b.city.stock, g);
        }
        const rows = GOOD_IDS.map((g) => {
          const made = get(pc.made, g);
          const used = get(pc.used, g);
          const bal = made - used;
          return `<tr><td>${GOODS[g].icon} ${GOODS[g].name}</td><td>${Math.floor(stored[g] ?? 0)}</td><td>${made ? made.toFixed(0) : '–'}</td><td>${used ? used.toFixed(0) : '–'}</td><td class="${bal < -0.5 ? 'neg' : bal > 0.5 ? 'pos' : ''}">${made || used ? sign(bal) : ''}</td></tr>`;
        }).join('');
        return `${close}<h3>Goods</h3><table class="goods"><tr><th></th><th>Stored</th><th>Made/min</th><th>Used/min</th><th></th></tr>${rows}</table>
          <p class="muted">Made and used over the last game minute. Trucks carry goods from producers to whoever needs them, or into the Town Hall and warehouses.</p>`;
      }
      case 'budget': {
        const y = pc.year;
        const l = pc.lastYear;
        const row = (name: string, a: number, b: number, neg = false) => `<tr><td>${name}</td><td class="${neg ? 'neg' : 'pos'}">${neg ? '−' : ''}${fmt(a)}</td><td class="${neg ? 'neg' : 'pos'}">${neg ? '−' : ''}${fmt(b)}</td></tr>`;
        const net = (x: typeof y) => x.taxes + x.trade - x.upkeep - x.roads - x.construction;
        return `${close}<h3>Budget</h3><table class="goods"><tr><th></th><th>This year</th><th>Last year</th></tr>
          ${row('Taxes', y.taxes, l.taxes)}${row('Trade', y.trade, l.trade)}${row('Building upkeep', y.upkeep, l.upkeep, true)}${row('Road upkeep', y.roads, l.roads, true)}${row('Construction', y.construction, l.construction, true)}
          <tr class="total"><td>Net</td><td>${sign(net(y))}</td><td>${sign(net(l))}</td></tr></table>
          <div class="tax-row">Taxes <button class="btn" data-action="tax" data-arg="-0.1">−</button><b>${Math.round(pc.taxRate * 100)}%</b><button class="btn" data-action="tax" data-arg="0.1">+</button>
          <span class="muted">Higher taxes bring money but make people unhappy.</span></div>
          <p class="muted">GDP (goods made, at reference prices): this year ₡${fmt(pc.gdp)}, last year ₡${fmt(pc.lastGdp)}.</p>`;
      }
      case 'menu':
        return `${close}<h3>Game</h3><div class="menu-col">
          <button class="btn" data-action="save">💾 Save</button>
          <button class="btn ${this.hasSave() ? '' : 'disabled'}" data-action="load">📂 Load last save</button>
          <button class="btn" data-action="new">✨ New game…</button></div>
          <p class="muted">The game also saves itself every game year. Saves stay in this browser.</p>`;
      case 'help':
        return `${close}${CITY_HELP}<button class="btn primary" data-action="close">Got it</button>`;
      default:
        return '';
    }
  }
}

function chip(g: GoodId, text: string): string {
  return `<span class="gchip" style="--gc:${GOODS[g].color}" title="${GOODS[g].name}">${GOODS[g].icon} ${text}</span>`;
}

function recipeText(type: BuildingTypeId): string {
  const r = buildingDef(type).econ?.recipe;
  if (!r) return '';
  const side = (s: Readonly<Partial<Record<GoodId, number>>>) => Object.entries(s).map(([g, n]) => `${n} ${GOODS[g as GoodId].icon}`).join(' + ');
  const ins = side(r.in);
  const outs = side(r.out) || '⚡';
  return `${ins ? `${ins} → ` : ''}${outs} every ${r.seconds}s at full staff`;
}

function econSummary(type: BuildingTypeId): string {
  const e = buildingDef(type).econ!;
  const parts: string[] = [];
  if (e.jobs) parts.push(`👷 ${e.jobs.count} ${TIERS[e.jobs.tier]!.name.toLowerCase()}`);
  if (e.recipe) parts.push(recipeText(type));
  if ((e.power ?? 0) > 0) parts.push(`⚡ ${e.power} MW`);
  if ((e.power ?? 0) < 0) parts.push(`⚡ +${-e.power!} MW`);
  if (e.upkeep) parts.push(`₡${e.upkeep}/yr upkeep`);
  return parts.length ? `<div class="muted">${parts.join(' · ')}</div>` : '';
}

const CITY_HELP = `
  <h2>How to play</h2>
  <p>Grow a town into a nation. Everything is connected: houses supply workers, workers run farms and
  industry, trucks carry goods along roads, markets feed households, taxes pay for it all.</p>
  <ol class="howto">
    <li><b>Roads first</b> (🛣, <b>R</b>): every building needs one along its edge. Trucks and crews use them.</li>
    <li><b>Houses</b>: settlers move in on their own while people are happy. Each house supplies workers.</li>
    <li><b>Wood</b>: a Logging Camp near forest and a Sawmill make lumber, the basic building material.
      Construction needs materials delivered by truck, then a crew from the Town Hall.</li>
    <li><b>Food</b>: a Farm (fertile river banks are best) and a Food Plant, or a Fishing Harbour; then a
      <b>Market</b> near the houses. Houses with food and water become bigger houses.</li>
    <li><b>Water</b>: a Pumping Station on a river or lake, and Water Towers near houses, on the same roads.</li>
    <li><b>Stone, steel, oil</b>: Quarry → Cement Works (concrete); Iron Mine → Steel Mill; Oil Well → Power Plant
      (power) or Refinery → fuel and plastics → Goods Factory. Technicians (from terraces) run the heavy industry.</li>
    <li><b>Grow</b>: a Regional Office in a neighbouring region claims it.</li>
  </ol>
  <p class="muted">Click a building to see what it needs. 📦 shows goods made and used, ₡ the budget and taxes.
  <b>Space</b> pauses, <b>1–4</b> set the speed, <b>B</b> bulldozes. Power and water reach buildings along the roads.</p>
`;
