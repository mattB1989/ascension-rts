// On-screen interface: top bar, selection panel, action buttons, help.

import { AGES } from '../data/ages.ts';
import { TECHS } from '../data/techs.ts';
import type { Game } from '../game.ts';
import type { World } from '../sim/world.ts';
import { CommandCard } from './commandCard.ts';
import type { InputController } from './input.ts';
import type { Minimap } from './minimap.ts';
import type { Selection } from './selection.ts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, title: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', cls, label);
  b.title = title;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  // Keep taps on buttons from reaching the canvas underneath.
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  return b;
}

const HELP_HTML = `
  <h2>How to play</h2>
  <p>Build an economy, then an army. Engineers mine <b class="c-ore">◆ Ore</b> and carry it to your
  Command Center or an Ore Refinery. Oil Derricks (on dark oil spots) and Offshore Rigs produce
  <b class="c-energy">⚡ Energy</b> on their own. Habitat Blocks raise your population cap.</p>
  <div class="help-cols">
    <section>
      <h3>Mouse &amp; keyboard</h3>
      <ul>
        <li><b>Left click</b> select your units/buildings, or see what anything else is (ore, oil, terrain, enemies); <b>drag</b> box-select, <b>Shift</b> add</li>
        <li><b>Hover</b> shows names; the cursor shows what a right click will do (move, mine, help build, rally)</li>
        <li><b>Double click</b> select all of that type on screen</li>
        <li><b>Right click</b>: move · on ore: mine · on a foundation: help build · with a building selected: rally point</li>
        <li><b>Right drag</b> pan (flick to glide), <b>wheel</b> zoom towards the cursor, <b>middle drag</b> or <b>Q / E</b> rotate</li>
        <li><b>WASD / arrows</b> or screen edge: pan (speeds up while held, <b>Shift</b> for double)</li>
        <li><b>Minimap</b>: click or drag to jump anywhere</li>
        <li><b>Ctrl+1..9</b> assign group, <b>1..9</b> recall (twice: jump)</li>
        <li><b>.</b> next idle engineer, <b>Ctrl+A</b> army, <b>X</b> stop, <b>Esc</b> cancel/deselect, <b>H</b> home</li>
      </ul>
    </section>
    <section>
      <h3>Touch</h3>
      <ul>
        <li><b>Tap</b> a unit or building to select, <b>double tap</b> for all of a type; tap anything else to see what it is</li>
        <li><b>Tap</b> the ground to move, ore to mine, a foundation to help build</li>
        <li>To build: select engineers, pick a building, <b>tap</b> to position it, then <b>✓</b></li>
        <li><b>One finger drag</b> pans, <b>flick</b> to glide (or box-selects in <b>Select</b> mode)</li>
        <li><b>Minimap</b>: tap or drag to jump anywhere</li>
        <li><b>Two fingers</b> pan, pinch zoom, twist rotate</li>
      </ul>
    </section>
  </div>
  <p>Forests block vehicles; infantry and engineers can walk through them, slowly. More engineers on one foundation build faster.</p>
  <p class="muted">Milestone 2: economy and base building. Combat, walls and towers arrive in M3, the AI opponent in M4.</p>
`;

export class Hud {
  private readonly fpsEl: HTMLSpanElement;
  private readonly chipsEl: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly modeBtn: HTMLButtonElement;
  private readonly oreEl: HTMLSpanElement;
  private readonly energyEl: HTMLSpanElement;
  private readonly popEl: HTMLSpanElement;
  private readonly ageEl: HTMLSpanElement;
  private readonly idleBtn: HTMLButtonElement;
  private readonly toastsEl: HTMLDivElement;
  private readonly card: CommandCard;
  private readonly world: World;
  private readonly game: Game;
  private readonly selection: Selection;
  private readonly input: InputController;
  private frames = 0;
  private fpsTime = 0;
  /** Gathered totals sampled once per game second, for income rates over the last game minute. */
  private readonly samples: Array<{ t: number; ore: number; energy: number }> = [];
  private lastText = '';

  constructor(root: HTMLElement, game: Game, selection: Selection, input: InputController, minimap: Minimap) {
    this.world = game.world;
    this.game = game;
    this.selection = selection;
    this.input = input;

    // Top bar: resources, population, age, idle engineers.
    const top = el('div', 'topbar');
    const res = el('div', 'resbar');
    this.oreEl = el('span', 'res res-ore');
    this.energyEl = el('span', 'res res-energy');
    this.popEl = el('span', 'res res-pop');
    this.ageEl = el('span', 'res res-age');
    res.append(this.oreEl, this.energyEl, this.popEl, this.ageEl);
    this.idleBtn = button('', 'Next idle engineer (.)', () => this.input.selectNextIdle(), 'btn idle');
    this.fpsEl = el('span', 'fps', '');
    const right = el('div', 'top-actions');
    right.append(
      button('?', 'How to play', () => this.toggleHelp()),
      button('⛶', 'Fullscreen', () => this.toggleFullscreen()),
    );
    top.append(res, this.idleBtn, this.fpsEl, right);

    this.toastsEl = el('div', 'toasts');

    // Bottom: minimap + selection/commands + actions
    const bottom = el('div', 'bottombar');
    const mm = el('div', 'minimap-wrap');
    mm.appendChild(minimap.el);
    const panel = el('div', 'selpanel');
    this.chipsEl = el('div', 'chips-wrap');
    this.card = new CommandCard(game, selection, input);
    panel.append(this.chipsEl, this.card.el);
    const actions = el('div', 'actions');
    this.modeBtn = button('✥ Pan', 'One-finger drag: pan or box-select', () =>
      this.input.setDragMode(this.input.dragMode === 'pan' ? 'select' : 'pan'),
    );
    this.modeBtn.classList.add('mode');
    if (!input.touchDevice) this.modeBtn.classList.add('touch-only');
    actions.append(
      this.modeBtn,
      button('⚔ Army', 'Select all military units (Ctrl+A)', () => this.input.selectArmy()),
      button('■ Stop', 'Stop (X)', () => this.input.stopSelected()),
      button('✕', 'Deselect (Esc)', () => (this.input.placing ? this.input.cancelPlacement() : this.selection.clear())),
      button('⌂', 'Back to base (H)', () => this.input.goHome()),
    );
    bottom.append(mm, panel, actions);

    this.help = el('div', 'help hidden');
    const card = el('div', 'help-card');
    card.innerHTML = HELP_HTML;
    if (input.touchDevice) {
      const cols = card.querySelector('.help-cols');
      const sections = cols?.querySelectorAll('section');
      if (cols && sections && sections.length === 2) cols.prepend(sections[1]!);
    }
    card.appendChild(button('Got it', 'Close', () => this.toggleHelp(false), 'btn primary'));
    this.help.appendChild(card);
    this.help.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === this.help) this.toggleHelp(false);
    });

    root.append(top, this.toastsEl, bottom, this.help);

    input.onDragModeChange = (mode) => {
      this.modeBtn.textContent = mode === 'pan' ? '✥ Pan' : '⬚ Select';
      this.modeBtn.classList.toggle('active', mode === 'select');
    };
    input.toast = (t) => this.toast(t);
    selection.onChange(() => this.renderChips());
    this.renderChips();

    try {
      if (!localStorage.getItem('ascension.helpSeen.m2')) {
        this.toggleHelp(true);
        localStorage.setItem('ascension.helpSeen.m2', '1');
      }
    } catch {
      // Storage unavailable (private mode): just don't auto-show.
    }
  }

  toggleHelp(show?: boolean): void {
    this.help.classList.toggle('hidden', show === undefined ? undefined : !show);
  }

  private toggleFullscreen(): void {
    const doc = document;
    if (doc.fullscreenElement) void doc.exitFullscreen();
    else void doc.documentElement.requestFullscreen?.().catch(() => {});
  }

  toast(text: string): void {
    // Collapse repeats of the same message.
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

  private renderChips(): void {
    const counts = new Map<string, { name: string; n: number; cls: string; ids: number[] }>();
    for (const id of this.selection.ids) {
      const e = this.world.getEntity(id);
      if (!e) continue;
      const key = e.type;
      const entry = counts.get(key) ?? { name: e.def.name, n: 0, cls: e.kind === 'unit' ? `domain-${e.def.domain}` : 'domain-building', ids: [] };
      entry.n++;
      entry.ids.push(id);
      counts.set(key, entry);
    }
    this.chipsEl.replaceChildren();
    if (counts.size === 0) {
      if (!this.selection.inspect) this.chipsEl.appendChild(el('div', 'muted', this.input.touchDevice ? 'Tap anything to see what it is' : 'Click anything to see what it is · drag to select units'));
      return;
    }
    if (counts.size === 1) return; // the command card already names it
    const chips = el('div', 'chips');
    for (const [, c] of counts) {
      chips.appendChild(button(`${c.name} ×${c.n}`, 'Select only these', () => this.selection.set(c.ids), `chip ${c.cls}`));
    }
    this.chipsEl.appendChild(chips);
  }

  private handleEvents(): void {
    const me = this.game.humanPlayer;
    for (const e of this.game.drainEvents()) {
      if (e.player !== me) continue;
      if (e.kind === 'notify') this.toast(e.text);
      else if (e.kind === 'buildingComplete') {
        const b = this.world.getBuilding(e.building);
        if (b) this.toast(`${b.def.name} complete`);
      } else if (e.kind === 'researchComplete') this.toast(`Research complete: ${TECHS[e.tech].name}`);
    }
  }

  update(frameDt: number, realDt = frameDt): void {
    this.handleEvents();
    this.card.update();
    const p = this.world.players[this.game.humanPlayer]!;

    const now = this.world.time;
    const lastSample = this.samples[this.samples.length - 1];
    if (!lastSample || now - lastSample.t >= 1) {
      this.samples.push({ t: now, ore: p.gathered.ore, energy: p.gathered.energy });
      while (this.samples.length > 2 && now - this.samples[0]!.t > 60) this.samples.shift();
    }
    const first = this.samples[0]!;
    const span = Math.max(10, now - first.t) / 60;
    const oreRate = Math.round((p.gathered.ore - first.ore) / span);
    const energyRate = Math.round((p.gathered.energy - first.energy) / span);
    const idle = this.input.idleEngineers().length;
    const text = [Math.floor(p.res.ore), oreRate, Math.floor(p.res.energy), energyRate, p.popUsed, p.popCap, p.age, idle].join('|');
    if (text !== this.lastText) {
      this.lastText = text;
      this.oreEl.innerHTML = `<b class="c-ore">◆</b> ${Math.floor(p.res.ore)} <small>+${oreRate}/min</small>`;
      this.energyEl.innerHTML = `<b class="c-energy">⚡</b> ${Math.floor(p.res.energy)} <small>+${energyRate}/min</small>`;
      this.popEl.innerHTML = `<b>👤</b> ${p.popUsed}/${p.popCap}`;
      this.popEl.classList.toggle('full', p.popUsed >= p.popCap);
      this.ageEl.textContent = AGES[p.age].name;
      this.idleBtn.textContent = `⛏ ${idle} idle`;
      this.idleBtn.classList.toggle('none', idle === 0);
    }

    this.frames++;
    this.fpsTime += realDt;
    if (this.fpsTime >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.fpsTime)} fps`;
      this.frames = 0;
      this.fpsTime = 0;
    }
  }
}

