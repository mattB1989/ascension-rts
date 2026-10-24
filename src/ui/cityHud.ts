// Interface for the economy game: top bar (money, people, mood, power, date,
// game speed), build palette, an info panel for whatever is selected or being
// placed, and the goods, budget and game panels.

import { buildingDef, type BuildingTypeId } from '../data/buildings.ts';
import { AGES } from '../data/ages.ts';
import { AGE_STEPS, CAPTURE, CITY_PALETTE, HOUSE_LEVELS, houseLevelAge, OVERSEAS, ROAD, UNIT_ECON } from '../data/city.ts';
import { nextAge } from '../sim/city/ages.ts';
import { RAIL } from '../sim/city/rail.ts';
import { canTrade, opinionOf, peaceProblem, TREATIES, treatyProblem, type TreatyKind } from '../sim/city/treaties.ts';
import { VICTORY_NAMES, victoryProgress, type VictoryKind } from '../sim/city/victory.ts';
import type { Sound } from './sound.ts';
import { UNITS, type UnitTypeId } from '../data/units.ts';
import { armyCap, atWar, recruitProblem } from '../sim/city/military.ts';
import { GOOD_IDS, GOODS, sumTiers, TIERS, type GoodId } from '../data/goods.ts';
import type { Game } from '../game.ts';
import { houseCapacity, gameMonth, gameYear } from '../sim/city/economy.ts';
import { stockTotal } from '../sim/city/logistics.ts';
import { automated, get, jobsOf } from '../sim/city/state.ts';
import { buyPrice, sellPrice } from '../sim/city/trade.ts';
import { dependence, DIPLO, marketOf, purchasePrice, stateOffers, stateValue, theyCharge, theyPay } from '../sim/city/diplomacy.ts';
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
  electronics: '💾 Electronics', data: '📡 Data', pharma: '💊 Pharma', university: '🏛 University',
};
const AGE_NAMES = ['Modern Age', 'Digital Age', 'Nano Age', 'Space Age'] as const;

const TOOL_INFO: Record<string, { name: string; text: string }> = {
  road: { name: 'Road', text: `Drag to draw a road (₡${ROAD.cost} a tile, ₡${ROAD.bridgeCost} over shallow water). Every building needs one.` },
  rail: { name: 'Railway', text: `Drag to lay track (₡${RAIL.cost} a tile). It crosses roads, and water on road bridges. Rail Stations on the line send trains.` },
  bulldoze: { name: 'Bulldozer', text: 'Drag over roads and railways to remove them, or click a building to demolish it. No refunds.' },
};

type PanelKind = 'goods' | 'budget' | 'trade' | 'diplomacy' | 'ages' | 'menu' | 'help';

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
  private panelKind: PanelKind | null = null;
  /** City-state whose deals are open in the diplomacy panel (0: none). */
  private dealsWith = 0;
  private lastTop = '';
  private lastInfo = '';
  private lastPanel = '';
  private lastPalette = '';
  private paletteAge = 0;
  private refreshAt = 0;
  /** Sound settings (set by main). */
  sound: Sound | null = null;
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
      this.btn('🔬', 'Ages, research and ways to win', () => this.togglePanel('ages')),
      this.btn('🤝', 'Diplomacy: city-states, deals, unions', () => this.togglePanel('diplomacy')),
      this.btn('🚢', 'Trade with the overseas market', () => this.togglePanel('trade')),
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
    this.panel.addEventListener('input', (e) => {
      const r = e.target as HTMLInputElement;
      if (r.dataset.volume && this.sound) {
        this.sound.settings.volume = Number(r.value) / 100;
        this.sound.apply();
      }
    });
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

  private togglePanel(kind: PanelKind): void {
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
      case 'build': {
        const lock = this.ageLock(arg);
        if (lock) {
          this.toast(`${lock}: see 🔬 Ages`);
          break;
        }
        this.selection.clear();
        this.input.startPlacement(arg as PlaceType);
        this.lastInfo = '';
        break;
      }
      case 'advance':
        this.game.issue({ kind: 'advanceAge', player: this.game.humanPlayer });
        this.lastPanel = '';
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
      case 'trade': {
        const [g, field, delta] = arg.split(':') as [GoodId, 'import' | 'export', string];
        const pc = this.world.city!.players[this.game.humanPlayer]!;
        const rule = pc.trade[g] ?? { import: 0, export: -1 };
        let imp = rule.import;
        let exp = rule.export;
        const steps = [0, 20, 50, 100, 200, 400];
        const move = (v: number, list: number[], d: number) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))) + d))]!;
        if (field === 'import') imp = move(imp, steps, Number(delta));
        else exp = move(exp, [-1, ...steps], Number(delta));
        this.game.issue({ kind: 'tradeRule', player: this.game.humanPlayer, good: g, import: imp, export: exp });
        this.lastPanel = '';
        break;
      }
      case 'deals':
        this.dealsWith = this.dealsWith === Number(arg) ? 0 : Number(arg);
        this.lastPanel = '';
        break;
      case 'deal': {
        const [st, g, field, delta] = arg.split(':') as [string, GoodId, 'import' | 'export', string];
        const state = Number(st);
        const pc = this.world.city!.players[this.game.humanPlayer]!;
        const rule = pc.deals[state]?.[g] ?? { import: 0, export: -1 };
        const steps = [0, 20, 50, 100, 200, 400];
        const move = (v: number, list: number[], d: number) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))) + d))]!;
        const imp = field === 'import' ? move(rule.import, steps, Number(delta)) : rule.import;
        const exp = field === 'export' ? move(rule.export, [-1, ...steps], Number(delta)) : rule.export;
        this.game.issue({ kind: 'deal', player: this.game.humanPlayer, state, good: g, import: imp, export: exp });
        this.lastPanel = '';
        break;
      }
      case 'union':
        this.game.issue({ kind: 'acceptUnion', player: this.game.humanPlayer, state: Number(arg) });
        break;
      case 'recruit': {
        const [bid, unit] = arg.split(':');
        this.game.issue({ kind: 'recruit', player: this.game.humanPlayer, building: Number(bid), unit: unit as UnitTypeId });
        this.lastInfo = '';
        break;
      }
      case 'war':
        this.game.issue({ kind: 'declareWar', player: this.game.humanPlayer, target: Number(arg) });
        this.lastPanel = '';
        break;
      case 'peace':
        this.game.issue({ kind: 'makePeace', player: this.game.humanPlayer, target: Number(arg) });
        this.lastPanel = '';
        break;
      case 'treaty':
      case 'untreaty': {
        const [t, k] = arg.split(':');
        this.game.issue({ kind: a === 'treaty' ? 'proposeTreaty' : 'cancelTreaty', player: this.game.humanPlayer, target: Number(t), treaty: k as TreatyKind });
        this.lastPanel = '';
        break;
      }
      case 'stop':
        this.input.stopSelected();
        break;
      case 'buy':
        this.game.issue({ kind: 'buyState', player: this.game.humanPlayer, state: Number(arg) });
        break;
      case 'tax': {
        const pc = this.world.city!.players[this.game.humanPlayer]!;
        this.game.issue({ kind: 'taxRate', player: this.game.humanPlayer, rate: pc.taxRate + Number(arg) });
        this.lastPanel = '';
        break;
      }
      case 'sound':
        this.sound?.toggle(arg as 'sfx' | 'music');
        this.lastPanel = '';
        break;
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
      if (e.kind === 'defeated' && e.player === me) {
        this.showDefeat(this.world.players[e.by]?.name ?? 'the enemy');
        continue;
      }
      if (e.kind === 'victory') {
        const how = VICTORY_NAMES[e.how as VictoryKind] ?? 'Victory';
        if (e.player === me) this.showEnd('Victory!', 'win', `${how}. Your nation leads the world. You can keep playing.`, 'Keep playing');
        else this.showEnd('Defeat', 'lose', `${this.world.players[e.player]?.name ?? 'A rival'} has won: ${how.toLowerCase()}.`, 'Keep playing');
        continue;
      }
      if (e.kind === 'underAttack' && e.player === me) {
        this.onAlert(e.x, e.y);
        continue;
      }
      if (!('player' in e) || (e.player !== me && e.player !== -1)) continue;
      if (e.kind === 'notify') this.toast(e.text);
      else if (e.kind === 'buildingComplete') {
        const b = this.world.getBuilding(e.building);
        if (b && b.type !== 'house') this.toast(`${b.def.name} complete`);
      }
    }
  }

  // -------------------------------------------------------------------------

  /** Called with the location of an attack (the minimap pings it). */
  onAlert: (x: number, y: number) => void = () => {};

  private showDefeat(by: string): void {
    this.showEnd('Defeat', 'lose', `Your last seat of government has fallen to ${by}.`, 'Keep watching');
  }

  private showEnd(title: string, cls: string, text: string, stay: string): void {
    const o = el('div', 'gameover');
    const card = el('div', 'gameover-card');
    card.append(el('h1', cls, title), el('p', 'muted', text));
    const again = el('button', 'btn primary', 'New game');
    again.addEventListener('click', () => this.onNew());
    const look = el('button', 'btn', stay);
    look.addEventListener('click', () => o.remove());
    const row = el('div', 'gameover-actions');
    row.append(again, look);
    card.append(row);
    o.appendChild(card);
    o.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.getElementById('ui')!.appendChild(o);
  }

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
    const net = src ? src.taxes + src.trade - src.imports - src.upkeep - src.roads - src.military : frac > 0.05 ? (cur.taxes + cur.trade - cur.imports - cur.upkeep - cur.roads - cur.military) / frac : 0;
    const pop = sumTiers(pc.population);
    const happy = Math.round(pc.happiness * 100);
    const date = `${MONTHS[gameMonth(this.world)]} ${gameYear(this.world)}`;
    const powerShort = pc.powerDemand > pc.powerSupply + 0.01;
    const wars = this.world.players.filter((p) => p.id !== this.game.humanPlayer && atWar(this.world, this.game.humanPlayer, p.id)).map((p) => p.name);
    const next = nextAge(this.world, this.game.humanPlayer);
    const s = [wars.join(','), pc.age, next?.ready, Math.floor(pc.credits), Math.round(net), pop, pc.population.join(','), happy, Math.round(pc.powerSupply), Math.round(pc.powerDemand), date, this.game.paused, this.game.timeScale].join('|');
    if (s === this.lastTop) return;
    this.lastTop = s;
    this.topRes.innerHTML = `
      <span class="res" title="Credits (net per year)"><b class="c-credit">₡</b> ${fmt(pc.credits)} <small class="${net >= 0 ? 'pos' : 'neg'}">${sign(net)}/yr</small></span>
      <span class="res" title="Population: ${TIERS.map((t) => `${t.name} ${pc.population[t.id]}`).join(', ')}"><b>👥</b> ${fmt(pop)} <small>${TIERS.filter((t) => t.id <= 1 || pc.population[t.id] > 0 || pc.age >= t.id - 1).map((t) => `${pc.population[t.id]}${t.short}`).join(' · ')}</small></span>
      <span class="res ${happy < 40 ? 'neg' : ''}" title="Happiness"><b>${happy >= 60 ? '😊' : happy >= 40 ? '😐' : '😟'}</b> ${happy}%</span>
      <span class="res ${powerShort ? 'neg' : ''}" title="Power supply / demand (MW)"><b class="c-energy">⚡</b> ${Math.round(pc.powerSupply)}<small>/${Math.round(pc.powerDemand)} MW</small></span>
      <span class="res res-age ${next?.ready ? 'pos' : ''}" title="${esc(AGE_NAMES[pc.age]!)}${next ? `: ${next.ready ? 'the next age is ready (🔬)' : 'see 🔬 for the next age'}` : ''}">🔬 ${esc(AGE_NAMES[pc.age]!.replace(' Age', ''))}${next?.ready ? ' ⬆' : ''}</span>
      <span class="res res-date" title="Date">📅 ${date}</span>${wars.length ? `<span class="res neg" title="At war with ${esc(wars.join(', '))}">⚔ War</span>` : ''}`;
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
      if (id === 'rail') {
        return `<button class="cmd pal-item" data-action="build" data-arg="rail" data-id="rail" title="Trains carry 60 units fast between Rail Stations (Logistics) on the same line"><span class="cmd-name">🚆 Railway</span><span class="cmd-cost">₡${RAIL.cost}/tile</span></button>`;
      }
      const def = buildingDef(id as BuildingTypeId);
      const mats = materialsText(id as BuildingTypeId);
      const lock = this.ageLock(id);
      return `<button class="cmd pal-item ${lock ? 'locked' : ''}" data-action="build" data-arg="${id}" data-id="${id}" title="${esc(def.description)}"><span class="cmd-name">${esc(def.name)}</span><span class="cmd-cost">${lock ? `🔒 ${esc(AGES[def.age].name)}` : `₡${def.econ?.credits ?? 0}${mats ? ` ${mats}` : ''}`}</span></button>`;
    }).join('');
    const html = `<div class="pal-tabs">${tabs}</div><div class="cmd-grid pal-items">${items}</div>`;
    this.paletteAge = this.world.city!.players[this.game.humanPlayer]!.age;
    if (html !== this.lastPalette) {
      this.lastPalette = html;
      this.palette.innerHTML = html;
    }
    this.renderPaletteState();
  }

  /** Why a building is locked for now (a later age), or null. */
  private ageLock(id: string): string | null {
    if (id === 'road' || id === 'rail' || id === 'bulldoze') return null;
    const def = buildingDef(id as BuildingTypeId);
    return AGES[def.age].index > this.world.city!.players[this.game.humanPlayer]!.age ? `Needs the ${AGES[def.age].name}` : null;
  }

  /** Grey out what can't be afforded; highlight the active tool. */
  private renderPaletteState(): void {
    const pcNow = this.world.city!.players[this.game.humanPlayer]!;
    if (pcNow.age !== this.paletteAge) this.renderPalette();
    const credits = pcNow.credits;
    const active = this.input.placing?.type;
    for (const b of this.palette.querySelectorAll<HTMLElement>('.pal-item')) {
      const id = b.dataset.id!;
      const price = id === 'road' ? ROAD.cost : id === 'rail' ? RAIL.cost : id === 'bulldoze' ? 0 : buildingDef(id as BuildingTypeId).econ?.credits ?? 0;
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
    const sel = this.selection.list();
    const unitIds = sel.filter((x) => this.world.getUnit(x));
    if (unitIds.length) return this.unitsHtml(unitIds);
    const id = sel[0] ?? (this.selection.inspect?.kind === 'entity' ? this.selection.inspect.id : 0);
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
      ? type === 'road' || type === 'rail' || type === 'bulldoze' || type === 'house' ? 'Tap the start, then the end, then ✓.' : 'Tap the map to position it, then ✓.'
      : type === 'road' || type === 'rail' || type === 'bulldoze' || type === 'house' ? 'Drag to draw. Right click or Esc to stop.' : 'Click to place (Shift: keep placing). Right click or Esc to cancel.';
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
        const later = HOUSE_LEVELS[c.level + 1];
        const age = this.world.city!.players[b.owner]!.age;
        const next = later && houseLevelAge(c.level + 1) <= age ? later : undefined;
        const needs = (next ?? lvl).needs as readonly string[];
        if (later && !next) rows.push(`<div class="muted">${esc(later.name)}s come with the ${esc(AGE_NAMES[houseLevelAge(c.level + 1)]!)}</div>`);
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
      if (e.jobs) rows.push(`<div>👷 ${c.workers}/${jobsOf(b)} ${TIERS[e.jobs.tier]!.name.toLowerCase()}${automated(b) ? ' · 🤖 automated' : ''}${e.recipe ? ` · ${Math.round(c.efficiency * 100)}% output` : ''}${e.extract ? ` · land ${Math.round(c.yield * 100)}%` : ''}</div>`);
      if (e.recipe) rows.push(`<div class="recipe">${recipeText(b.type)}</div>`);
      if ((e.power ?? 0) < 0) rows.push(`<div>⚡ ${Math.round(c.powerOut)} of ${-e.power!} MW</div>`);
      else if ((e.power ?? 0) > 0) rows.push(`<div>⚡ needs ${e.power} MW: ${c.powered ? 'powered' : '<span class="neg">no power</span>'}</div>`);
      if (e.research) rows.push(`<div>🔬 ${(e.research * c.efficiency).toFixed(1)} research a second (${Math.floor(this.world.city!.players[b.owner]!.research)} so far)</div>`);
      if (e.service) rows.push(`<div>Serves ${Math.floor(c.served)}/${e.service.capacity} residents within ${e.service.radius} road tiles</div>`);
      if (e.waterSupply) rows.push(`<div>💧 water for ${e.waterSupply} residents</div>`);
      if (e.storage) rows.push(`<div>Stored ${Math.floor(stockTotal(c.stock))}/${e.storage}</div>`);
      const held = GOOD_IDS.filter((g) => get(c.stock, g) >= 0.5);
      if (held.length) rows.push(`<div class="stock">${held.map((g) => chip(g, `${Math.floor(get(c.stock, g))}`)).join('')}</div>`);
      if (e.trains) {
        const wanted = GOOD_IDS.filter((g) => get(c.wants ?? {}, g) >= 1).map((g) => GOODS[g].icon).join(' ');
        rows.push(`<div>${(c.rail ?? -1) >= 0 ? `🚆 ${c.trainsOut ?? 0}/${e.trains} train out` : '<span class="neg">🚆 Not on a railway</span>'}${wanted ? ` · needed around here: ${wanted}` : ''}</div>`);
      }
      if (e.trucks || e.crews) rows.push(`<div class="muted">${e.trucks ? `🚚 ${c.trucksOut}/${e.trucks} out` : ''}${e.trucks && e.crews ? ' · ' : ''}${e.crews ? `👷 ${c.crewsOut}/${e.crews} crews out` : ''}</div>`);
      if (b.garrison.length) rows.push(`<div>🛡 ${b.garrison.length} garrisoned</div>`);
      if (c.capture > 0) rows.push(`<div class="info-problem">Being taken by ${esc(this.world.players[c.captureBy]?.name ?? 'the enemy')}: ${Math.round(c.capture * 100)}%</div>`);
      if (own && Object.keys(UNIT_ECON).some((u) => UNITS[u as UnitTypeId].trainedAt === b.type)) rows.push(this.recruitHtml(b));
    }
    if (!own) title = `${this.world.players[b.owner]?.name ?? 'Foreign'} · ${title}`;
    const head = `<div class="card-head"><div class="card-title">${esc(title)}</div><div class="card-status ${status && status !== '' ? 'warn' : ''}">${esc(status || (b.complete ? 'Working' : ''))}</div></div>`;
    const actions = own && b.type !== 'town_hall' ? `<div class="info-actions"><button class="cmd danger" data-action="demolish" data-arg="${b.id}">🗑 Demolish</button></div>` : '';
    return head + rows.join('') + actions;
  }

  private recruitHtml(b: Building): string {
    const me = this.game.humanPlayer;
    const units = (Object.keys(UNIT_ECON) as UnitTypeId[]).filter((u) => UNITS[u].trainedAt === b.type);
    const army = this.world.units.filter((u) => u.owner === me).reduce((s, u) => s + u.def.pop, 0);
    const btns = units.map((u) => {
      const cost = UNIT_ECON[u]!;
      const why = recruitProblem(this.world, me, b, u);
      const goods = Object.entries(cost.goods).map(([g, n]) => `${GOODS[g as GoodId].icon}${n}`).join(' ');
      return `<button class="cmd ${why ? 'disabled' : ''}" data-action="recruit" data-arg="${b.id}:${u}" title="${esc(UNITS[u].description)}${why ? `
${esc(why)}` : ''}"><span class="cmd-name">${esc(UNITS[u].name)}</span><span class="cmd-cost">₡${cost.credits} ${goods}</span>${why ? `<span class="cmd-lock">${esc(why)}</span>` : ''}</button>`;
    }).join('');
    const queue = b.queue.map((q) => (q.kind === 'unit' ? `${UNITS[q.unit].name} ${Math.floor((q.progress / q.total) * 100)}%` : '')).join(', ');
    return `<div class="muted">Army ${army}/${armyCap(this.world, me)} · units cost upkeep${queue ? ` · training: ${esc(queue)}` : ''}</div><div class="cmd-grid recruit">${btns}</div>`;
  }

  private unitsHtml(ids: number[]): string {
    const counts = new Map<string, number>();
    for (const id of ids) {
      const u = this.world.getUnit(id);
      if (u) counts.set(u.def.name, (counts.get(u.def.name) ?? 0) + 1);
    }
    const list = [...counts].map(([n, k]) => `${esc(n)} ×${k}`).join(', ');
    const hint = this.input.touchDevice ? 'Tap the map to move, an enemy to attack, a tower or seat to garrison.' : 'Right click: move, attack an enemy, garrison a tower or seat. F: attack-move.';
    return `<div class="card-head"><div class="card-title">${ids.length} unit${ids.length > 1 ? 's' : ''}</div></div><div>${list}</div><div class="card-hint">${hint}</div>
      <div class="info-actions"><button class="cmd" data-action="stop">■ Stop</button><button class="cmd" data-action="cancel">✕ Deselect</button></div>`;
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
    const ownerName = owner >= 0 ? this.world.players[owner]?.name ?? 'Claimed' : '';
    const lines = [`<div class="card-head"><div class="card-title">${esc(r?.name ?? TERRAIN_NAMES[map.terrain[i] as TerrainId])}</div><div class="card-status">${r ? (owner === this.game.humanPlayer ? 'Your region' : owner >= 0 ? `${this.world.players[owner]?.role === 'cityState' ? 'City-state of' : 'Territory of'} ${esc(ownerName)}` : 'Unclaimed') : ''}</div></div>`];
    lines.push(`<div>${TERRAIN_NAMES[map.terrain[i] as TerrainId]}${dep ? ` · ${DEPOSIT_NAMES[dep as 1]} deposit` : ''}${map.fresh[i] ? ' · fresh water' : ''}</div>`);
    if (r) {
      const offers = [r.fertile ? `🌾 ${r.fertile} fertile` : '', r.forest ? `🌲 ${r.forest} forest` : '', r.ore ? `⛏ ore` : '', r.stone ? `🪨 stone` : '', r.oil ? `🛢 oil` : '', r.rare ? `🧲 rare earths` : '', r.uranium ? `☢ uranium` : '', r.coast ? '🌊 coast' : '', r.river ? '〰 river' : ''].filter(Boolean);
      lines.push(`<div class="muted">${offers.join(' · ')}</div>`);
      if (owner === -1) lines.push(`<div class="muted">Build a Regional Office here (connected by road) to claim it.</div>`);
    }
    return lines.join('');
  }

  // -------------------------------------------------------------------------
  // Panels

  private nationsHtml(): string {
    const me = this.game.humanPlayer;
    const w = this.world;
    const nations = w.players.filter((p) => p.role === 'nation' && !p.defeated);
    if (!nations.length) return '';
    return `<h3>Rival nations</h3>${nations.map((p) => {
      const pc = w.city!.players[p.id]!;
      const war = atWar(w, me, p.id);
      const color = '#' + p.color.toString(16).padStart(6, '0');
      const army = w.units.filter((u) => u.owner === p.id).length;
      const regions = Array.from(w.city!.regionOwner).filter((o) => o === p.id).length;
      const hall = w.buildings.find((b) => b.owner === p.id && b.type === 'town_hall');
      const op = Math.round(opinionOf(w, p.id, me));
      const signed = w.city!.treaties.filter((t) => (t.a === me && t.b === p.id) || (t.b === me && t.a === p.id));
      const treaties = signed.map((t) => `<div class="state-row">📜 ${esc(TREATIES[t.kind].name)} · ${Math.max(0, (t.until - w.time) / 120).toFixed(1)} years left <button class="mini" data-action="untreaty" data-arg="${p.id}:${t.kind}" title="End it early${t.kind === 'peace' ? ': everyone will trust you less' : ''}">End</button></div>`).join('');
      const offers = war ? '' : (Object.keys(TREATIES) as TreatyKind[]).filter((k) => !signed.some((t) => t.kind === k)).map((k) => {
        const why = treatyProblem(w, me, p.id, k);
        return `<button class="mini wide ${why ? 'disabled' : ''}" data-action="treaty" data-arg="${p.id}:${k}" title="${esc(TREATIES[k].text)}${why ? `
${esc(why)}` : ''}">${esc(TREATIES[k].name)}</button>`;
      }).join('');
      const peaceWhy = war ? peaceProblem(w, me, p.id) : null;
      const trade = canTrade(w, me, p.id);
      return `<div class="state"><div class="state-head"><span class="dot" style="background:${color}"></span><b>${esc(p.name)}</b>
        <span class="muted">👥 ${sumTiers(pc.population)} · ⚔ ${army} · ${regions} region${regions === 1 ? '' : 's'} · ${esc(AGE_NAMES[pc.age]!.replace(' Age', ''))}</span></div>
        <div class="state-row">Opinion of you ${bar(op, -100, 100, op >= 20 ? 'good' : op < 0 ? 'bad' : '')} ${op}</div>
        <div class="state-row ${war ? 'neg' : 'pos'}">${war ? '⚔ At war with you' : 'At peace'}</div>${treaties}
        ${offers ? `<div class="state-actions">${offers}</div>` : ''}
        <div class="state-actions">${hall ? `<button class="mini wide" data-action="goto" data-arg="${hall.x},${hall.y}">Show</button>` : ''}
        ${trade ? `<button class="mini wide ${this.dealsWith === p.id ? 'on' : ''}" data-action="deals" data-arg="${p.id}">Deals</button>` : ''}
        ${war ? `<button class="mini wide ${peaceWhy ? 'disabled' : ''}" data-action="peace" data-arg="${p.id}" title="${esc(peaceWhy ?? 'They will accept')}">Offer peace</button>` : `<button class="mini wide danger" data-action="war" data-arg="${p.id}">Declare war</button>`}</div>
        ${this.dealsWith === p.id && trade ? this.dealsHtml(p.id) : ''}</div>`;
    }).join('')}<p class="muted">Nations sign treaties when they like you enough: trade with them, sign pacts, and don't break your word.</p>`;
  }

  /** Per-good deals with a trading partner (city-state, or a nation with a trade agreement). */
  private dealsHtml(state: number): string {
    const w = this.world;
    const pc = w.city!.players[this.game.humanPlayer]!;
    const rows = GOOD_IDS.map((g) => {
      const r = pc.deals[state]?.[g] ?? { import: 0, export: -1 };
      const step = (field: string, d: number, label: string) => `<button class="mini" data-action="deal" data-arg="${state}:${g}:${field}:${d}">${label}</button>`;
      return `<tr><td>${GOODS[g].icon} ${GOODS[g].name}</td><td class="pos">₡${theyPay(w, state, g).toFixed(1)}</td><td class="neg">₡${theyCharge(w, state, g).toFixed(1)}</td><td>${Math.floor(stateOffers(w, state, g))}</td>
        <td class="rule">${step('import', -1, '−')}<span>${r.import > 0 ? `up to ${r.import}` : '—'}</span>${step('import', 1, '+')}</td><td class="rule">${step('export', -1, '−')}<span>${r.export >= 0 ? `above ${r.export}` : '—'}</span>${step('export', 1, '+')}</td></tr>`;
    }).join('');
    return `<table class="goods trade"><tr><th></th><th>They pay</th><th>They charge</th><th>Spare</th><th>Import</th><th>Export</th></tr>${rows}</table>
      <p class="muted">Your trucks carry the goods from your Town Hall, warehouses and ports along the roads to their town hall.</p>`;
  }

  private diplomacyHtml(): string {
    const me = this.game.humanPlayer;
    const w = this.world;
    const states = w.players.filter((p) => p.role === 'cityState' && !p.defeated);
    if (!states.length) return `<p class="muted">No city-states left: every one has joined a nation.</p>${this.nationsHtml()}`;
    const pc = w.city!.players[me]!;
    const mine = w.buildings.filter((b) => b.owner === me && b.complete && b.def.econ?.storage && b.city!.access >= 0);
    return states.map((p) => {
      const rel = w.city!.players[p.id]!.relations!;
      const hall = marketOf(w, p.id);
      const v = stateValue(w, p.id);
      const op = Math.round(rel.opinion[me] ?? 0);
      const dep = dependence(w, p.id, me);
      // Connected if one of our storage buildings shares a road network with their town hall.
      const connected = !!hall?.city && hall.city.access >= 0 && mine.some((b) => b.city!.comp === hall.city!.comp);
      const color = '#' + p.color.toString(16).padStart(6, '0');
      const price = purchasePrice(w, p.id);
      const offer = rel.offer === me;
      const actions = [
        hall ? `<button class="mini wide" data-action="goto" data-arg="${hall.x},${hall.y}">Show</button>` : '',
        `<button class="mini wide ${this.dealsWith === p.id ? 'on' : ''}" data-action="deals" data-arg="${p.id}">Deals</button>`,
        offer ? `<button class="mini wide primary" data-action="union" data-arg="${p.id}">Accept union</button>` : '',
        `<button class="mini wide ${op >= DIPLO.buyOpinion && pc.credits >= price ? '' : 'disabled'}" data-action="buy" data-arg="${p.id}" title="${op >= DIPLO.buyOpinion ? '' : `They sell only to friends (opinion ${DIPLO.buyOpinion}+)`}">Buy ₡${fmt(price)}</button>`,
        atWar(w, me, p.id) ? `<button class="mini wide" data-action="peace" data-arg="${p.id}">Make peace</button>` : `<button class="mini wide danger" data-action="war" data-arg="${p.id}" title="Take their town hall by force: every city-state will like you less">Declare war</button>`,
      ].join('');
      const deals = this.dealsWith === p.id ? this.dealsHtml(p.id) : '';
      return `<div class="state"><div class="state-head"><span class="dot" style="background:${color}"></span><b>${esc(p.name)}</b>
        <span class="muted">👥 ${v.population} · ₡${fmt(w.city!.players[p.id]!.credits)}</span></div>
        <div class="state-row">Opinion ${bar(op, -100, 100, op >= 40 ? 'good' : op < 0 ? 'bad' : '')} ${op} · Dependence ${bar(dep, 0, 1, dep >= DIPLO.unionDependence ? 'good' : '')} ${Math.round(dep * 100)}%</div>
        <div class="state-row ${connected ? 'pos' : 'neg'}">${connected ? 'Connected by road' : 'Not connected: build a road to their town hall to trade'}${offer ? ' · <b>They ask to join you!</b>' : ''}</div>
        <div class="state-actions">${actions}</div>${deals}</div>`;
    }).join('') + this.nationsHtml() + `<p class="muted">Trade raises their opinion of you. When a city-state likes you (${DIPLO.unionOpinion}+) and most of its economy is trade with you (${Math.round(DIPLO.unionDependence * 100)}%+), it asks to join your nation. Friends (${DIPLO.buyOpinion}+) can also be bought.</p>`;
  }

  private agesHtml(): string {
    const me = this.game.humanPlayer;
    const pc = this.world.city!.players[me]!;
    const next = nextAge(this.world, me);
    const labs = this.world.buildings.filter((b) => b.owner === me && b.complete && b.def.econ?.research);
    const rate = labs.reduce((s, b) => s + b.def.econ!.research! * b.city!.efficiency, 0);
    const rows = next
      ? next.checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${bar(Math.min(c.have, c.need), 0, c.need, c.ok ? 'good' : '')}</td><td class="${c.ok ? 'pos' : ''}">${fmt(c.have)} / ${fmt(c.need)}</td></tr>`).join('')
      : '';
    const ladder = AGE_NAMES.map((n, i) => `<span class="age-step ${i < pc.age ? 'done' : i === pc.age ? 'now' : ''}">${esc(n.replace(' Age', ''))}</span>`).join('<span class="age-arrow">›</span>');
    const research = `🔬 ${Math.floor(pc.research)} research · ${labs.length ? `${rate.toFixed(1)}/s from ${labs.length} institute${labs.length > 1 ? 's' : ''}` : 'build a Research Institute (Services) to research'}`;
    const later = AGE_STEPS[pc.age + 1] && !next ? `<p class="muted">The ${esc(AGE_STEPS[pc.age + 1]!.name)} ${esc(AGE_STEPS[pc.age + 1]!.unlocks)}.</p>` : '';
    return `<h3>Ages</h3><div class="age-ladder">${ladder}</div><p>${research}</p>
      ${next ? `<h3>Next: ${esc(next.name)}</h3><table class="age-req">${rows}</table>
      <p class="muted">Unlocks ${esc(next.unlocks)}.</p>
      <button class="btn ${next.ready ? 'primary' : 'disabled'} wide" data-action="advance">${next.ready ? `⬆ Enter the ${esc(next.name)}` : 'Not ready yet'}</button>` : later}
      <p class="muted">Research comes from Research Institutes staffed by technicians (and universities, by engineers). GDP is the value of everything your nation made last year.</p>
      ${this.goalsHtml()}`;
  }

  /** Yearly population and GDP: you and the rival nations. */
  private historyHtml(): string {
    const w = this.world;
    const who = w.players.filter((p) => p.id === this.game.humanPlayer || p.role === 'nation');
    const series = (key: 'population' | 'gdp') =>
      who.map((p) => ({ name: p.name, color: '#' + p.color.toString(16).padStart(6, '0'), values: w.city!.players[p.id]!.history.map((h) => h[key]) }));
    const years = w.city!.players[this.game.humanPlayer]!.history.map((h) => h.year);
    if (years.length < 2) return `<h3>History</h3><p class="muted">Graphs of population and GDP appear after two game years.</p>`;
    const legend = `<div class="chart-legend">${who.map((p) => `<span style="--c:#${p.color.toString(16).padStart(6, '0')}">${esc(p.name)}</span>`).join('')}</div>`;
    return `<h3>History</h3>${legend}<div class="muted">Population</div>${lineChart(series('population'), years)}<div class="muted">GDP per year</div>${lineChart(series('gdp'), years)}`;
  }

  private goalsHtml(): string {
    const v = this.world.city!.victory;
    if (!v.on) return `<h3>Ways to win</h3><p class="muted">Sandbox game: nobody wins, play as long as you like.</p>`;
    const me = this.game.humanPlayer;
    const rows = victoryProgress(this.world, me).map((g) => `<div class="goal"><div class="goal-head"><b>${esc(VICTORY_NAMES[g.kind])}</b>${bar(g.frac, 0, 1, g.frac >= 1 ? 'good' : '')}</div><div class="muted">${esc(g.text)}</div></div>`).join('');
    const won = v.winner >= 0 ? `<p class="${v.winner === me ? 'pos' : 'neg'}">🏆 ${esc(this.world.players[v.winner]?.name ?? '')} won: ${esc(VICTORY_NAMES[v.how as VictoryKind] ?? '')}</p>` : '';
    return `<h3>Ways to win</h3>${won}${rows}`;
  }

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
      case 'trade': {
        const ports = this.world.buildings.filter((b) => b.owner === this.game.humanPlayer && b.type === 'trade_port');
        const rows = GOOD_IDS.map((g) => {
          const r = pc.trade[g] ?? { import: 0, export: -1 };
          const imp = r.import > 0 ? `up to ${r.import}` : '—';
          const exp = r.export >= 0 ? `above ${r.export}` : '—';
          const step = (field: string, d: number, label: string) => `<button class="mini" data-action="trade" data-arg="${g}:${field}:${d}">${label}</button>`;
          return `<tr><td>${GOODS[g].icon} ${GOODS[g].name}</td><td>${Math.floor(get(pc.stockpile, g))}</td><td class="pos">₡${sellPrice(this.world, g).toFixed(1)}</td><td class="neg">₡${buyPrice(this.world, g).toFixed(1)}</td>
            <td class="rule">${step('import', -1, '−')}<span>${imp}</span>${step('import', 1, '+')}</td><td class="rule">${step('export', -1, '−')}<span>${exp}</span>${step('export', 1, '+')}</td></tr>`;
        }).join('');
        const ships = this.world.city!.ships.filter((s) => s.owner === this.game.humanPlayer).length;
        const portLine = ports.length
          ? `${ports.length} trade port${ports.length > 1 ? 's' : ''} · ${ships} ship${ships === 1 ? '' : 's'} at sea${ports.some((p) => p.city!.status) ? ` · ${esc(ports.find((p) => p.city!.status)!.city!.status)}` : ''}`
          : '<span class="neg">Build a Trade Port on the coast (Logistics) to trade.</span>';
        return `${close}<h3>Overseas trade</h3><p class="muted">${portLine}</p>
          <table class="goods trade"><tr><th></th><th>You have</th><th>Sell</th><th>Buy</th><th>Import</th><th>Export</th></tr>${rows}</table>
          <p class="muted">Import tops your stock up to the amount; export ships out everything above it. Ships carry ${OVERSEAS.capacity} each way. World prices drift over time. This year: exports ₡${fmt(pc.year.trade)}, imports ₡${fmt(pc.year.imports)}.</p>`;
      }
      case 'diplomacy':
        return `${close}<h3>City-states</h3>${this.diplomacyHtml()}<p class="muted">War: troops that hold an enemy town hall or regional office for ${CAPTURE.seconds} seconds, with no defenders near, take its region. Garrisoned infantry defend a seat.</p>`;
      case 'ages':
        return close + this.agesHtml();
      case 'budget': {
        const y = pc.year;
        const l = pc.lastYear;
        const row = (name: string, a: number, b: number, neg = false) => `<tr><td>${name}</td><td class="${neg ? 'neg' : 'pos'}">${neg ? '−' : ''}${fmt(a)}</td><td class="${neg ? 'neg' : 'pos'}">${neg ? '−' : ''}${fmt(b)}</td></tr>`;
        const net = (x: typeof y) => x.taxes + x.trade - x.imports - x.upkeep - x.roads - x.construction - x.military;
        return `${close}<h3>Budget</h3><table class="goods"><tr><th></th><th>This year</th><th>Last year</th></tr>
          ${row('Taxes', y.taxes, l.taxes)}${row('Exports', y.trade, l.trade)}${row('Imports', y.imports, l.imports, true)}${row('Building upkeep', y.upkeep, l.upkeep, true)}${row('Road upkeep', y.roads, l.roads, true)}${row('Construction', y.construction, l.construction, true)}${row('Military', y.military, l.military, true)}
          <tr class="total"><td>Net</td><td>${sign(net(y))}</td><td>${sign(net(l))}</td></tr></table>
          <div class="tax-row">Taxes <button class="btn" data-action="tax" data-arg="-0.1">−</button><b>${Math.round(pc.taxRate * 100)}%</b><button class="btn" data-action="tax" data-arg="0.1">+</button>
          <span class="muted">Higher taxes bring money but make people unhappy.</span></div>
          <p class="muted">GDP (goods made, at reference prices): this year ₡${fmt(pc.gdp)}, last year ₡${fmt(pc.lastGdp)}.</p>
          ${this.historyHtml()}`;
      }
      case 'menu':
        return `${close}<h3>Game</h3><div class="menu-col">
          <button class="btn" data-action="save">💾 Save</button>
          <button class="btn ${this.hasSave() ? '' : 'disabled'}" data-action="load">📂 Load last save</button>
          <button class="btn" data-action="new">✨ New game…</button></div>
          <h3>Sound</h3><div class="menu-col">
          <button class="btn ${this.sound?.settings.sfx ? 'active' : ''}" data-action="sound" data-arg="sfx">🔊 Sound effects: ${this.sound?.settings.sfx ? 'on' : 'off'}</button>
          <button class="btn ${this.sound?.settings.music ? 'active' : ''}" data-action="sound" data-arg="music">🎵 Music: ${this.sound?.settings.music ? 'on' : 'off'}</button>
          <div class="vol-row">Volume <input type="range" min="0" max="100" value="${Math.round((this.sound?.settings.volume ?? 0.7) * 100)}" data-volume="1"></div></div>
          <p class="muted">The game also saves itself every game year. Saves stay in this browser.</p>`;
      case 'help':
        return `${close}${CITY_HELP}<button class="btn primary" data-action="close">Got it</button>`;
      default:
        return '';
    }
  }
}

/** A small SVG line chart: one line per series over the years. */
function lineChart(series: Array<{ name: string; color: string; values: number[] }>, years: number[]): string {
  const W = 300;
  const H = 90;
  const L = 34;
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => L + ((W - L - 4) * i) / (n - 1);
  const y = (v: number) => H - 12 - ((H - 18) * v) / max;
  const lines = series
    .filter((s) => s.values.length > 1)
    .map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="1.8" points="${s.values.map((v, i) => `${x(i + n - s.values.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`)
    .join('');
  const grid = [0, 0.5, 1].map((k) => `<line x1="${L}" x2="${W - 4}" y1="${y(max * k)}" y2="${y(max * k)}" stroke="rgba(255,255,255,0.08)"/><text x="${L - 4}" y="${y(max * k) + 3}" text-anchor="end">${fmt(max * k)}</text>`).join('');
  const ticks = `<text x="${L}" y="${H - 1}">${years[0]}</text><text x="${W - 4}" y="${H - 1}" text-anchor="end">${years[years.length - 1]}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}${lines}${ticks}</svg>`;
}

function bar(v: number, min: number, max: number, cls: string): string {
  const k = Math.max(0, Math.min(1, (v - min) / (max - min)));
  return `<span class="bar ${cls}"><span style="width:${Math.round(k * 100)}%"></span></span>`;
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
