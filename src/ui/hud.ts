// On-screen interface: top bar, selection panel, action buttons, help.

import { UNITS, type UnitTypeId } from '../data/units.ts';
import type { World } from '../sim/world.ts';
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
  <h2>Controls</h2>
  <div class="help-cols">
    <section>
      <h3>Mouse &amp; keyboard</h3>
      <ul>
        <li><b>Left click</b> select, <b>drag</b> box-select, <b>Shift</b> add</li>
        <li><b>Double click</b> select all of that type on screen</li>
        <li><b>Right click</b> move, <b>right drag</b> pan</li>
        <li><b>Middle drag</b> or <b>Q / E</b> rotate</li>
        <li><b>Wheel</b> or <b>+ / -</b> zoom</li>
        <li><b>WASD / arrows</b> or screen edge: pan</li>
        <li><b>Ctrl+1..9</b> assign group, <b>1..9</b> recall (twice: jump)</li>
        <li><b>Ctrl+A</b> select army, <b>X</b> stop, <b>Esc</b> deselect</li>
        <li><b>Space</b> centre on selection, <b>H</b> home</li>
      </ul>
    </section>
    <section>
      <h3>Touch</h3>
      <ul>
        <li><b>Tap</b> a unit to select, <b>double tap</b> for all of its type</li>
        <li><b>Tap ground</b> to move the selection</li>
        <li><b>One finger drag</b> pans (or box-selects in <b>Select</b> mode)</li>
        <li><b>Two fingers</b> pan, pinch zoom, twist rotate</li>
        <li><b>Minimap</b> tap to jump</li>
      </ul>
    </section>
  </div>
  <p class="muted">Milestone 1: movement sandbox. Land units stay on land, ships on water, aircraft fly anywhere.
  Economy, building and combat arrive in the next milestones.</p>
`;

export class Hud {
  private readonly fpsEl: HTMLSpanElement;
  private readonly selPanel: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly modeBtn: HTMLButtonElement;
  private readonly world: World;
  private readonly selection: Selection;
  private readonly input: InputController;
  private frames = 0;
  private fpsTime = 0;

  constructor(root: HTMLElement, world: World, selection: Selection, input: InputController, minimap: Minimap) {
    this.world = world;
    this.selection = selection;
    this.input = input;

    // Top bar
    const top = el('div', 'topbar');
    const title = el('div', 'brand');
    title.append(el('span', 'brand-name', 'ASCENSION'), el('span', 'brand-tag', 'M1 · Modern Age'));
    this.fpsEl = el('span', 'fps', '');
    const right = el('div', 'top-actions');
    right.append(
      button('?', 'Controls', () => this.toggleHelp()),
      button('⛶', 'Fullscreen', () => this.toggleFullscreen()),
    );
    top.append(title, this.fpsEl, right);

    // Bottom: minimap + selection + actions
    const bottom = el('div', 'bottombar');
    const mm = el('div', 'minimap-wrap');
    mm.appendChild(minimap.el);
    this.selPanel = el('div', 'selpanel');
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
      button('✕', 'Deselect (Esc)', () => this.selection.clear()),
      button('⌂', 'Back to base (H)', () => this.input.goHome()),
    );
    bottom.append(mm, this.selPanel, actions);

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

    root.append(top, bottom, this.help);

    input.onDragModeChange = (mode) => {
      this.modeBtn.textContent = mode === 'pan' ? '✥ Pan' : '⬚ Select';
      this.modeBtn.classList.toggle('active', mode === 'select');
    };
    selection.onChange(() => this.renderSelection());
    this.renderSelection();

    try {
      if (!localStorage.getItem('ascension.helpSeen')) {
        this.toggleHelp(true);
        localStorage.setItem('ascension.helpSeen', '1');
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

  private renderSelection(): void {
    const counts = new Map<UnitTypeId, number>();
    for (const id of this.selection.ids) {
      const u = this.world.getUnit(id);
      if (u) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
    }
    this.selPanel.replaceChildren();
    if (counts.size === 0) {
      this.selPanel.appendChild(el('div', 'muted', this.input.touchDevice ? 'Tap a unit to select it' : 'Click or drag to select units'));
      return;
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const head = el('div', 'sel-head', `${total} selected`);
    const chips = el('div', 'chips');
    for (const [type, n] of counts) {
      const def = UNITS[type];
      const chip = button(`${def.name} ×${n}`, def.description, () => {
        const ids = this.selection.list().filter((id) => this.world.getUnit(id)?.type === type);
        this.selection.set(ids);
      }, `chip domain-${def.domain}`);
      chips.appendChild(chip);
    }
    this.selPanel.append(head, chips);
  }

  update(frameDt: number): void {
    this.frames++;
    this.fpsTime += frameDt;
    if (this.fpsTime >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.fpsTime)} fps`;
      this.frames = 0;
      this.fpsTime = 0;
    }
  }
}
