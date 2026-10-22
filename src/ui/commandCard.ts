// Contextual commands for the current selection: the build menu for engineers,
// production and research for a building, its queue, and placement controls.
// Rebuilt only when something structural changes (so clicks are never lost);
// progress bars update in place every frame.

import { BUILDINGS, BUILDING_TYPES, type BuildingTypeId } from '../data/buildings.ts';
import { TECH_IDS, TECHS, techImplemented, type TechId } from '../data/techs.ts';
import { cargoSize, type BuildingDef, type Cost, type UnitDef } from '../data/types.ts';
import { UNIT_TYPES, UNITS, type UnitTypeId } from '../data/units.ts';
import type { Game } from '../game.ts';
import { buildTimeLeft, researchLockReason, trainLockReason } from '../sim/economy.ts';
import { airfieldLoad } from '../sim/transport.ts';
import { TERRAIN_NAMES, type TerrainId } from '../sim/map.ts';
import { ageIndex, buildLockReason, canAfford } from '../sim/placement.ts';
import type { Building, Unit } from '../sim/world.ts';
import type { InputController } from './input.ts';
import type { Inspect, Selection } from './selection.ts';

interface Btn {
  key: string;
  label: string;
  cost?: Cost;
  disabled: boolean;
  reason: string | null;
  title: string;
  onClick: () => void;
  cls?: string;
}

interface CardModel {
  title: string;
  status: () => string;
  progress: (() => number) | null;
  hint: string;
  buttons: Btn[];
  queue: Array<{ key: string; label: string; progress: () => number; onClick: () => void }>;
}

// Build menu order (defense structures arrive with combat in M3).
const BUILD_ORDER: BuildingTypeId[] = [
  'habitat_block', 'ore_refinery', 'oil_derrick', 'barracks', 'vehicle_factory', 'shipyard',
  'airfield', 'radar_station', 'research_lab', 'command_center',
];

function costHtml(c: Cost, ok: { ore: boolean; energy: boolean }): string {
  const parts: string[] = [];
  if (c.ore) parts.push(`<span class="c-ore${ok.ore ? '' : ' short'}">◆${c.ore}</span>`);
  if (c.energy) parts.push(`<span class="c-energy${ok.energy ? '' : ' short'}">⚡${c.energy}</span>`);
  return parts.join(' ');
}

export class CommandCard {
  readonly el: HTMLDivElement;
  private sig = '';
  private bars: Array<{ el: HTMLElement; get: () => number }> = [];
  private statusEl: HTMLElement | null = null;
  private lastStatus = '';
  private readonly game: Game;
  private readonly selection: Selection;
  private readonly input: InputController;

  constructor(game: Game, selection: Selection, input: InputController) {
    this.game = game;
    this.selection = selection;
    this.input = input;
    this.el = document.createElement('div');
    this.el.className = 'cmdcard';
  }

  private get player(): number {
    return this.game.humanPlayer;
  }

  private model(): CardModel | null {
    const world = this.game.world;
    const p = world.players[this.player]!;
    const ok = (c: Cost) => ({ ore: p.res.ore >= c.ore, energy: p.res.energy >= c.energy });

    if (this.input.targeting) {
      return {
        title: 'Choose the drop zone',
        status: () => '',
        progress: null,
        hint: this.input.touchDevice ? 'Tap the map where the paratroopers should land.' : 'Click the map where the paratroopers should land. Right click or Esc to cancel.',
        buttons: [{ key: 'cancelTarget', label: '✕ Cancel', disabled: false, reason: null, title: 'Cancel', onClick: () => this.input.cancelTargeting() }],
        queue: [],
      };
    }

    // Placement in progress.
    const placing = this.input.placing;
    if (placing) {
      const def = BUILDINGS[placing.type];
      const touch = this.input.touchDevice;
      const buttons: Btn[] = [];
      if (touch) {
        buttons.push({
          key: 'confirm', label: '✓ Build here', disabled: !placing.valid, reason: placing.problem, title: placing.problem ?? 'Place the building',
          onClick: () => this.input.confirmPlacement(), cls: 'primary',
        });
      }
      buttons.push({ key: 'cancel', label: '✕ Cancel', disabled: false, reason: null, title: 'Cancel (Esc / right click)', onClick: () => this.input.cancelPlacement() });
      return {
        title: `Place ${def.name}`,
        status: () => (placing.problem ? `⚠ ${placing.problem}` : costHtml(def.cost, ok(def.cost))),
        progress: null,
        hint: touch ? 'Tap the map to position it, then confirm.' : 'Click to place, Shift+click to place several, right click to cancel.',
        buttons,
        queue: [],
      };
    }

    const ids = this.selection.list();
    const units: Unit[] = [];
    const buildings: Building[] = [];
    for (const id of ids) {
      const e = world.getEntity(id);
      if (!e || e.owner !== this.player) continue;
      if (e.kind === 'unit') units.push(e);
      else buildings.push(e);
    }

    // Builders: the build menu.
    const builders = units.filter((u) => u.def.builder);
    if (builders.length > 0) {
      const kinds = new Set(builders.map((u) => u.def.builder));
      const buttons: Btn[] = [];
      for (const type of [...BUILD_ORDER, ...BUILDING_TYPES.filter((t) => !BUILD_ORDER.includes(t))]) {
        const def: BuildingDef = BUILDINGS[type];
        if (!kinds.has(def.builtBy)) continue;
        if (def.category === 'defense' || ageIndex(def.age) > ageIndex(p.age)) continue;
        const lock = buildLockReason(world, this.player, type);
        const afford = canAfford(p, def.cost);
        buttons.push({
          key: `b:${type}`,
          label: def.name,
          cost: def.cost,
          disabled: !!lock || !afford,
          reason: lock ?? (afford ? null : 'Not enough resources'),
          title: `${def.name}: ${def.description}${lock ? `\n${lock}` : ''}`,
          onClick: () => this.input.startPlacement(type),
        });
      }
      buttons.unshift({ key: 'explore', label: '🧭 Explore', disabled: false, reason: null, title: 'Wander off and uncover unexplored ground until the map is explored', onClick: () => this.input.exploreSelected(), cls: 'explore' });
      return {
        title: builders.length === 1 ? builders[0]!.def.name : `${builders.length} builders`,
        status: () => {
          const c = builders.reduce((sum, u) => sum + u.carry, 0);
          return c > 0 ? `Carrying ◆${Math.floor(c)}` : '';
        },
        progress: null,
        hint: this.input.touchDevice ? 'Tap ore to mine, a foundation to help build.' : 'Right click ore to mine, a foundation to help build.',
        buttons,
        queue: [],
      };
    }

    // Buildings (all of one type): production, research, queue.
    if (buildings.length > 0 && units.length === 0) {
      const type = buildings[0]!.type;
      const same = buildings.filter((b) => b.type === type);
      const b = same[0]!;
      const def = b.def;
      if (!b.complete) {
        return {
          title: def.name,
          status: () => {
            const n = b.activeBuilders;
            const left = buildTimeLeft(this.game.world, b);
            const who = n === 0 ? '⚠ nobody building' : `${n} builder${n > 1 ? 's' : ''} · ${Math.ceil(left)} s left`;
            return `${Math.floor(b.progress * 100)}% · ${who}`;
          },
          progress: () => b.progress,
          hint: `Each extra engineer adds 60% speed (1 → 100%, 3 → 220%, 5 → 340%). ${this.input.touchDevice ? 'Select engineers and tap' : 'Select engineers and right click'} the foundation to help.`,
          buttons: [{
            key: 'cancelBuild', label: '✕ Cancel building', disabled: false, reason: null, title: 'Refunds the unbuilt part',
            onClick: () => this.game.issue({ kind: 'cancelBuild', player: this.player, building: b.id }),
          }],
          queue: [],
        };
      }
      const buttons: Btn[] = [];
      for (const ut of UNIT_TYPES.filter((u) => UNITS[u].trainedAt === type)) {
        const ud = UNITS[ut];
        if (ageIndex(ud.age) > ageIndex(p.age)) continue;
        const lock = trainLockReason(world, this.player, b, ut);
        const afford = canAfford(p, ud.cost);
        buttons.push({
          key: `t:${ut}`, label: ud.name, cost: ud.cost,
          disabled: !!lock || !afford, reason: lock ?? (afford ? null : 'Not enough resources'),
          title: `${ud.name}: ${ud.description}\nStrong vs ${ud.strongVs}. Weak vs ${ud.weakVs}.\n${ud.pop} pop · ${ud.trainTime}s${lock ? `\n${lock}` : ''}`,
          onClick: () => this.train(same, ut),
        });
      }
      for (const tid of TECH_IDS.filter((t) => TECHS[t].at === type)) {
        const t = TECHS[tid];
        if (ageIndex(t.age) > ageIndex(p.age)) continue;
        if (p.researched.has(tid)) continue;
        const lock = researchLockReason(world, this.player, b, tid);
        const afford = canAfford(p, t.cost);
        buttons.push({
          key: `r:${tid}`, label: `⚗ ${t.name}`, cost: techImplemented(tid) ? t.cost : undefined,
          disabled: !!lock || !afford, reason: lock ?? (afford ? null : 'Not enough resources'),
          title: `${t.name}: ${t.summary}${lock ? `\n${lock}` : ''}`,
          onClick: () => this.research(b, tid),
          cls: 'tech',
        });
      }
      const status = () => {
        const parts: string[] = [];
        if (same.length > 1) parts.push(`${same.length} selected`);
        if (def.produces) {
          const res = b.resource >= 0 ? world.resources[b.resource] : undefined;
          const rate = def.produces.perSecond * p.mult.produce[def.produces.resource] * 60;
          const shown = def.tank ? def.tank.pipeline * p.mult.produce[def.produces.resource] * 60 : rate;
          parts.push(res && res.amount <= 0 ? 'Oil exhausted' : `+${Math.round(shown)} energy/min${def.tank ? ' by pipeline' : ''}${res ? ` · ${Math.floor(res.amount)} oil left` : ''}`);
        }
        if (def.pop) parts.push(`Housing +${def.pop}`);
        if (def.dock) parts.push(`Parking ${airfieldLoad(world, b)}/${def.dock}`);
        if (def.tank) {
          const haulers = world.units.filter((x) => x.owner === b.owner && x.task?.kind === 'haul' && x.task.rig === b.id).length;
          parts.push(`Tank ${Math.floor(b.stored)}/${def.tank.capacity} · ${haulers} hauler${haulers === 1 ? '' : 's'}`);
        }
        if (b.waitingForPop) parts.push('⚠ Need more housing');
        return parts.join(' · ');
      };
      const canTrain = buttons.some((x) => x.key.startsWith('t:'));
      return {
        title: def.name,
        status,
        progress: null,
        hint: def.tank
          ? `Pumps ${def.produces?.perSecond ?? 0}/s into its tank; ${def.tank.pipeline}/s flows ashore by pipeline. Select Sea Engineers and ${this.input.touchDevice ? 'tap' : 'right click'} the rig to haul the rest to a Shipyard.`
          : canTrain ? (this.input.touchDevice ? 'Tap the map to set the rally point.' : 'Right click the map to set the rally point.') : '',
        buttons,
        queue: b.queue.map((q, i) => ({
          key: `q:${i}:${q.kind === 'unit' ? q.unit : q.tech}`,
          label: q.kind === 'unit' ? UNITS[q.unit].name : TECHS[q.tech].name,
          progress: () => (b.queue[i] ? b.queue[i]!.progress / b.queue[i]!.total : 0),
          onClick: () => this.game.issue({ kind: 'cancel', player: this.player, building: b.id, index: i }),
        })),
      };
    }
    // Units of one type: stats, plus transport and aircraft orders.
    if (units.length > 0 && buildings.length === 0) {
      const types = new Set(units.map((u) => u.type));
      if (types.size !== 1) return null;
      const u = units[0]!;
      const d = u.def;
      const ids = units.map((x) => x.id);
      const me = this.player;
      const buttons: Btn[] = [];
      const loaded = units.some((x) => x.cargo.length > 0);
      if (d.cargo && d.domain === 'air') {
        buttons.push({
          key: 'paradrop', label: '🪂 Paradrop', disabled: !loaded, reason: loaded ? null : 'Load infantry first', title: 'Pick a spot on the map: the plane flies over and drops everyone',
          onClick: () => this.input.startTargeting('paradrop', ids.filter((id) => (world.getUnit(id)?.cargo.length ?? 0) > 0)), cls: 'primary',
        });
      }
      if (d.cargo && loaded && (d.domain === 'sea' || units.some((x) => x.parked))) {
        buttons.push({
          key: 'unload', label: '⬆ Unload here', disabled: false, reason: null, title: d.domain === 'sea' ? 'Put everyone ashore at the nearest coast' : 'Get everyone out at the airfield',
          onClick: () => this.game.issue({ kind: 'unload', player: me, units: ids, x: u.x, y: u.y }),
        });
      }
      if (d.fuel) {
        const flying = units.some((x) => !x.parked);
        buttons.push({
          key: 'return', label: '🛬 Return to base', disabled: !flying, reason: flying ? null : 'Already parked', title: 'Fly back to an airfield, land and refuel',
          onClick: () => this.game.issue({ kind: 'returnBase', player: me, units: ids }),
        });
      }
      if (!d.cargo || d.domain !== 'air') {
        buttons.push({ key: 'explore', label: '🧭 Explore', disabled: false, reason: null, title: 'Wander off and uncover unexplored ground until the map is explored', onClick: () => this.input.exploreSelected(), cls: 'explore' });
      }
      const status = () => {
        const parts: string[] = [units.length > 1 ? `${units.length} selected` : `${Math.ceil(u.hp)}/${d.hp} HP`];
        if (u.task?.kind === 'explore') parts.push('exploring');
        if (d.fuel) {
          const f = Math.round((Math.min(...units.map((x) => x.fuel)) / d.fuel) * 100);
          parts.push(u.parked ? `Parked · fuel ${f}%` : `Fuel ${f}%${f < 25 ? ' ⚠' : ''}`);
        }
        if (d.cargo) {
          let used = 0;
          for (const id of u.cargo) {
            const c = world.getUnit(id);
            if (c) used += cargoSize(c.def);
          }
          parts.push(`Cargo ${used}/${d.cargo.slots}`);
        }
        return parts.join(' · ');
      };
      let hint = this.unitHint(d);
      const touch = this.input.touchDevice;
      if (d.cargo && d.domain === 'sea') hint = `Select land units and ${touch ? 'tap' : 'right click'} this ship to board at the nearest shore. ${touch ? 'Tap' : 'Right click'} land to sail there and unload. Infantry take 1 slot, vehicles 3.`;
      else if (d.cargo && d.domain === 'air') hint = `Select infantry and ${touch ? 'tap' : 'right click'} this plane while it is parked: they walk to the Airfield and board. Then Paradrop anywhere.`;
      else if (d.fuel) hint = `Planes burn fuel in the air (${d.fuel} s) and fly home to refuel automatically. ${touch ? 'Tap' : 'Right click'} an Airfield to land there.`;
      return { title: units.length > 1 ? `${d.name} ×${units.length}` : d.name, status, progress: null, hint, buttons, queue: [] };
    }

    // Something we clicked but don't control.
    const ins = this.selection.inspect;
    if (ins) return this.inspectCard(ins);
    return null;
  }

  private unitHint(d: UnitDef): string {
    const moves = d.domain === 'sea' ? 'Ships only sail on water.' : d.domain === 'air' ? 'Flies anywhere.' : d.move === 'infantry' ? 'On foot: can cross forest.' : 'Vehicle: forests block it.';
    return `Strong vs ${d.strongVs}. Weak vs ${d.weakVs}. ${moves}`;
  }

  private infoCard(title: string, status: () => string, hint: string, buttons: Btn[]): CardModel {
    return { title, status, progress: null, hint, buttons, queue: [] };
  }

  private inspectCard(ins: Inspect): CardModel | null {
    const world = this.game.world;
    const touch = this.input.touchDevice;
    if (ins.kind === 'resource') {
      const r = world.resources[ins.index];
      if (!r) return null;
      if (r.kind === 'ore') {
        return this.infoCard('Ore deposit', () => `◆ ${Math.floor(r.amount)} / ${r.max} left`, `Engineers mine ore and carry it to a Command Center or Ore Refinery. ${touch ? 'Select engineers and tap it' : 'Select engineers and right click it'} to mine.`, []);
      }
      return this.infoCard(r.offshore ? 'Offshore oil' : 'Oil spot', () => `${Math.floor(r.amount)} oil`, r.offshore ? 'A Sea Engineer (from the Shipyard) can build an Offshore Rig here: it produces Energy by itself.' : 'Engineers can build an Oil Derrick here: it produces Energy by itself.', []);
    }
    if (ins.kind === 'ground') {
      const t = world.map.terrain[Math.floor(ins.y) * world.map.width + Math.floor(ins.x)] as TerrainId;
      const hints: Record<number, string> = {
        0: 'Deep water: ships and submarines only.',
        1: 'Shallow water: ships only.',
        2: 'Beach: open ground, good for coastal buildings.',
        3: 'Open ground: anything can move and build here.',
        4: 'Forest: infantry and engineers only, and they move slower. Vehicles must go around.',
        5: 'Rock: impassable, nothing can be built.',
        6: 'Bridge: land units drive across, ships sail underneath.',
      };
      return this.infoCard(TERRAIN_NAMES[t], () => '', hints[t] ?? '', []);
    }
    const e = world.getEntity(ins.id);
    if (!e) return null;
    const owner = world.players[e.owner]?.name ?? 'Enemy';
    if (e.kind === 'unit') return this.infoCard(`${owner} ${e.def.name}`, () => `${Math.ceil(e.hp)}/${e.def.hp} HP`, this.unitHint(e.def), []);
    return this.infoCard(
      `${owner} ${e.def.name}`,
      () => (e.complete ? `${Math.ceil(e.hp)}/${e.maxHp} HP` : `Under construction · ${Math.floor(e.progress * 100)}%`),
      e.def.description,
      [],
    );
  }

  /** Queue at the selected building with the shortest queue. */
  private train(buildings: Building[], unit: UnitTypeId): void {
    const b = [...buildings].sort((a, c) => a.queue.length - c.queue.length)[0]!;
    this.game.issue({ kind: 'train', player: this.player, building: b.id, unit });
  }

  private research(b: Building, tech: TechId): void {
    this.game.issue({ kind: 'research', player: this.player, building: b.id, tech });
  }

  update(): void {
    const m = this.model();
    const sig = m
      ? JSON.stringify([m.title, m.hint, m.buttons.map((b) => [b.key, b.disabled, b.reason]), m.queue.map((q) => q.key)])
      : '';
    if (sig !== this.sig) {
      this.sig = sig;
      this.rebuild(m);
    }
    if (m && this.statusEl) {
      const text = m.status();
      if (text !== this.lastStatus) {
        this.statusEl.innerHTML = text;
        this.lastStatus = text;
      }
    }
    for (const bar of this.bars) bar.el.style.width = `${Math.round(Math.max(0, Math.min(1, bar.get())) * 100)}%`;
  }

  private rebuild(m: CardModel | null): void {
    this.el.replaceChildren();
    this.bars = [];
    this.el.classList.toggle('empty', !m);
    this.statusEl = null;
    if (!m) return;
    const head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = '<span class="card-title"></span><span class="card-status"></span>';
    head.querySelector('.card-title')!.textContent = m.title;
    this.statusEl = head.querySelector('.card-status');
    this.lastStatus = '';
    this.el.appendChild(head);
    if (m.progress) this.el.appendChild(this.bar(m.progress, 'card-progress'));
    if (m.queue.length) {
      const q = document.createElement('div');
      q.className = 'queue';
      for (const item of m.queue) {
        const b = document.createElement('button');
        b.className = 'q-item';
        b.title = 'Click to cancel (refunded)';
        b.textContent = item.label;
        b.appendChild(this.bar(item.progress, 'q-bar'));
        b.addEventListener('click', item.onClick);
        q.appendChild(b);
      }
      this.el.appendChild(q);
    }
    if (m.buttons.length) {
      const grid = document.createElement('div');
      grid.className = 'cmd-grid';
      for (const btn of m.buttons) {
        const b = document.createElement('button');
        b.className = `cmd${btn.cls ? ` ${btn.cls}` : ''}${btn.disabled ? ' disabled' : ''}`;
        b.title = btn.title;
        const p = this.game.world.players[this.player]!;
        b.innerHTML = `<span class="cmd-name"></span>${btn.cost ? `<span class="cmd-cost">${costHtml(btn.cost, { ore: p.res.ore >= btn.cost.ore, energy: p.res.energy >= btn.cost.energy })}</span>` : ''}${btn.reason && btn.reason !== 'Not enough resources' ? '<span class="cmd-lock"></span>' : ''}`;
        b.querySelector('.cmd-name')!.textContent = btn.label;
        const lock = b.querySelector('.cmd-lock');
        if (lock) lock.textContent = btn.reason;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btn.disabled) {
            if (btn.reason) this.input.toast(btn.reason);
            return;
          }
          btn.onClick();
        });
        grid.appendChild(b);
      }
      this.el.appendChild(grid);
    }
    if (m.hint) {
      const h = document.createElement('div');
      h.className = 'card-hint';
      h.textContent = m.hint;
      this.el.appendChild(h);
    }
  }

  private bar(get: () => number, cls: string): HTMLElement {
    const outer = document.createElement('div');
    outer.className = cls;
    const inner = document.createElement('div');
    outer.appendChild(inner);
    this.bars.push({ el: inner, get });
    return outer;
  }
}
