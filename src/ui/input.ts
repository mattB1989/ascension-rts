// Mouse, keyboard and touch input. Turns gestures into camera moves, selections
// and commands.
//
// Desktop: left click/drag select, right click move, right drag pan, middle drag
//          rotate, wheel zoom, WASD/arrows pan, Q/E rotate, edge scrolling.
// Touch:   tap select / tap ground to move, one-finger drag pans (or box-selects
//          in Select mode), two fingers pan + pinch zoom + twist rotate.
//
// Right click (or tap, on touch) is context-sensitive: ore -> mine, own
// foundation -> help build, anything else -> move; with buildings selected it
// sets their rally point.

import { BUILDINGS, type BuildingTypeId } from '../data/buildings.ts';
import type { Game } from '../game.ts';
import type { GameRenderer } from '../render/renderer.ts';
import { Terrain } from '../sim/map.ts';
import { NavLayer } from '../sim/nav.ts';
import type { Building, Unit } from '../sim/world.ts';
import { cursorCss, type CursorKind } from './cursors.ts';
import { hitName, Picker, type Hit } from './pick.ts';
import { placementCheck, snapFootprint } from './placementCheck.ts';
import type { Selection } from './selection.ts';

export interface PlacingState {
  type: BuildingTypeId;
  tx: number;
  ty: number;
  valid: boolean;
  problem: string | null;
  /** Touch: the ghost has been positioned at least once. */
  positioned: boolean;
}

type DragKind = 'none' | 'box' | 'pan' | 'rotate' | 'gesture';

interface PointerInfo {
  id: number;
  type: string;
  button: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  drag: DragKind;
}

export type DragMode = 'pan' | 'select';

const EDGE = 16; // px: edge-scroll margin

export class InputController {
  dragMode: DragMode = 'pan';
  /** Interpolation factor of the last rendered frame, so picking matches what is on screen. */
  alpha = 1;
  private readonly pointers = new Map<number, PointerInfo>();
  private gesture: { cx: number; cy: number; dist: number; angle: number } | null = null;
  private readonly keys = new Set<string>();
  private panHeld = 0;
  /** Recent pan-drag samples, for fling velocity. */
  private panSamples: Array<{ t: number; x: number; y: number }> = [];
  private readonly mouse = { x: 0, y: 0, inside: false };
  private lastClick = { time: 0, unitId: -1 };
  private lastGroupKey = { n: -1, time: 0 };
  private readonly boxEl: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  readonly picker: Picker;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: GameRenderer;
  private readonly game: Game;
  private readonly selection: Selection;
  readonly touchDevice: boolean;
  placing: PlacingState | null = null;
  onDragModeChange: (mode: DragMode) => void = () => {};
  /** Show a short message to the player (set by the HUD). */
  toast: (text: string) => void = () => {};

  constructor(canvas: HTMLCanvasElement, renderer: GameRenderer, game: Game, selection: Selection, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.game = game;
    this.selection = selection;
    this.touchDevice = matchMedia('(pointer: coarse)').matches;
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'select-box';
    uiRoot.appendChild(this.boxEl);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'hover-tip';
    uiRoot.appendChild(this.tooltip);
    this.picker = new Picker(canvas, renderer, game.world, game.humanPlayer, this.touchDevice);

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onCancel(e));
    canvas.addEventListener('pointerleave', () => (this.mouse.inside = false));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.inside = false;
    });
  }

  setDragMode(mode: DragMode): void {
    this.dragMode = mode;
    this.onDragModeChange(mode);
  }

  // -------------------------------------------------------------------------
  // Per-frame: keyboard panning and edge scrolling

  update(frameDt: number): void {
    if (this.placing) this.updateGhost();
    this.updateHover();
    const rig = this.renderer.rig;
    rig.tick(frameDt);
    // Pan speed scales with zoom, ramps up while held, Shift doubles it.
    const panning = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((k) => this.keys.has(k));
    const atEdge = this.mouse.inside && !this.touchDevice && this.pointers.size === 0 && document.hasFocus() && this.mouseAtEdge();
    this.panHeld = panning || atEdge ? this.panHeld + frameDt : 0;
    const ramp = 1 + Math.min(1.5, this.panHeld * 1.5);
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 2 : 1;
    const speed = rig.distance * 1.9 * ramp * boost * frameDt;
    let r = 0;
    let f = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += speed;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= speed;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += speed;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= speed;
    if (this.keys.has('KeyQ')) rig.rotate(-1.6 * frameDt);
    if (this.keys.has('KeyE')) rig.rotate(1.6 * frameDt);
    if (this.keys.has('Equal') || this.keys.has('NumpadAdd') || this.keys.has('PageUp')) rig.zoom(Math.exp(-2.2 * frameDt));
    if (this.keys.has('Minus') || this.keys.has('NumpadSubtract') || this.keys.has('PageDown')) rig.zoom(Math.exp(2.2 * frameDt));

    // Edge scrolling, only with a mouse that is over the game and not dragging.
    if (atEdge) {
      const m = EDGE;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (this.mouse.x < m) r -= speed;
      if (this.mouse.x > w - m) r += speed;
      if (this.mouse.y < m) f += speed;
      if (this.mouse.y > h - m) f -= speed;
    }
    if (r !== 0 || f !== 0) rig.pan(r, f);
  }

  private mouseAtEdge(): boolean {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return this.mouse.x < EDGE || this.mouse.x > w - EDGE || this.mouse.y < EDGE || this.mouse.y > h - EDGE;
  }

  // -------------------------------------------------------------------------
  // Pointers

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    this.renderer.rig.stopFling();
    this.panSamples = [];
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, {
      id: e.pointerId, type: e.pointerType, button: e.button,
      startX: p.x, startY: p.y, x: p.x, y: p.y, moved: false, drag: 'none',
    });
    if (this.pointers.size === 2) {
      for (const pi of this.pointers.values()) {
        pi.drag = 'gesture';
        pi.moved = true;
      }
      this.hideBox();
      this.gesture = this.gestureState();
    }
  }

  private gestureState(): { cx: number; cy: number; dist: number; angle: number } | null {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return null;
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  private onMove(e: PointerEvent): void {
    const p = this.local(e);
    if (e.pointerType === 'mouse') {
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.inside = true;
    }
    const pi = this.pointers.get(e.pointerId);
    if (this.placing && e.pointerType === 'mouse' && (!pi || !pi.moved)) this.moveGhost(e.clientX, e.clientY);
    if (!pi) return;
    const dx = p.x - pi.x;
    const dy = p.y - pi.y;
    pi.x = p.x;
    pi.y = p.y;
    const rig = this.renderer.rig;

    if (pi.drag === 'gesture') {
      const g = this.gestureState();
      if (g && this.gesture) {
        rig.panPixels(g.cx - this.gesture.cx, g.cy - this.gesture.cy, this.renderer.viewportHeight);
        if (g.dist > 10 && this.gesture.dist > 10) rig.zoom(this.gesture.dist / g.dist);
        let da = g.angle - this.gesture.angle;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        rig.rotate(da);
        this.gesture = g;
      }
      return;
    }

    if (!pi.moved) {
      const threshold = pi.type === 'mouse' ? 5 : 10;
      if (Math.hypot(p.x - pi.startX, p.y - pi.startY) < threshold) return;
      pi.moved = true;
      if (pi.type === 'mouse') {
        pi.drag = pi.button === 0 ? 'box' : pi.button === 1 ? 'rotate' : 'pan';
      } else {
        pi.drag = this.dragMode === 'select' ? 'box' : 'pan';
      }
    }
    if (pi.drag === 'pan') {
      rig.panPixels(dx, dy, this.renderer.viewportHeight);
      const now = performance.now();
      this.panSamples.push({ t: now, x: p.x, y: p.y });
      while (this.panSamples.length > 2 && now - this.panSamples[0]!.t > 100) this.panSamples.shift();
    }
    else if (pi.drag === 'rotate') rig.rotate(dx * 0.006);
    else if (pi.drag === 'box') this.showBox(pi.startX, pi.startY, p.x, p.y);
  }

  private onUp(e: PointerEvent): void {
    const pi = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!pi) return;
    if (pi.drag === 'gesture') {
      this.gesture = null;
      // The remaining finger must not turn into a tap or a fresh drag.
      for (const other of this.pointers.values()) {
        other.drag = 'gesture';
        other.moved = true;
      }
      return;
    }
    const additive = e.shiftKey || e.ctrlKey;
    if (pi.drag === 'pan') {
      // Fling: keep gliding in the direction of a quick swipe.
      const s0 = this.panSamples[0];
      const s1 = this.panSamples[this.panSamples.length - 1];
      const now = performance.now();
      if (s0 && s1 && s1 !== s0 && now - s1.t < 60) {
        const dt = Math.max(0.016, (s1.t - s0.t) / 1000);
        const [r, f] = this.renderer.rig.pixelsToWorld((s1.x - s0.x) / dt, (s1.y - s0.y) / dt, this.renderer.viewportHeight);
        if (Math.hypot(s1.x - s0.x, s1.y - s0.y) / dt > 250) this.renderer.rig.fling(r, f);
      }
      this.panSamples = [];
      return;
    }
    if (pi.drag === 'box') {
      this.hideBox();
      this.boxSelect(pi.startX, pi.startY, pi.x, pi.y, additive);
      return;
    }
    if (pi.moved) return;

    if (this.targeting) {
      if (pi.type === 'mouse' && pi.button === 2) this.cancelTargeting();
      else this.completeTargeting(pi.x, pi.y);
      return;
    }
    if (this.placing) {
      const rect = this.canvas.getBoundingClientRect();
      if (pi.type === 'mouse') {
        if (pi.button === 2) this.cancelPlacement();
        else if (pi.button === 0) {
          this.moveGhost(pi.x + rect.left, pi.y + rect.top);
          this.confirmPlacement(e.shiftKey);
        }
      } else {
        // Touch: a tap positions the ghost; the card's button confirms.
        this.moveGhost(pi.x + rect.left, pi.y + rect.top);
      }
      return;
    }
    if (pi.type === 'mouse') {
      if (pi.button === 0) this.clickSelect(pi.x, pi.y, additive);
      else if (pi.button === 2) this.commandAt(pi.x, pi.y);
    } else {
      this.tap(pi.x, pi.y);
    }
  }

  private onCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    this.gesture = null;
    this.hideBox();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 40 : 1;
    const factor = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * scale * 0.0018)));
    const g = this.renderer.pickGround(e.clientX, e.clientY);
    if (g) this.renderer.rig.zoomAt(factor, g.x, g.y);
    else this.renderer.rig.zoom(factor);
  }

  // -------------------------------------------------------------------------
  // Keyboard

  private onKeyDown(e: KeyboardEvent): void {
    this.keys.add(e.code);
    const digit = /^Digit([0-9])$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]);
      if (e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        this.selection.assignGroup(n);
      } else {
        const now = performance.now();
        const again = this.lastGroupKey.n === n && now - this.lastGroupKey.time < 400;
        this.lastGroupKey = { n, time: now };
        if (this.selection.recallGroup(n) && again) this.centerOnSelection();
      }
      return;
    }
    switch (e.code) {
      case 'Escape':
        if (this.targeting) this.cancelTargeting();
        else if (this.placing) this.cancelPlacement();
        else this.selection.clear();
        break;
      case 'KeyX':
        this.stopSelected();
        break;
      case 'KeyH':
        this.goHome();
        break;
      case 'Period':
        this.selectNextIdle();
        break;
      case 'Space':
        e.preventDefault();
        this.centerOnSelection();
        break;
      case 'KeyA':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.selectArmy();
        }
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Actions (also used by HUD buttons)

  ownUnits(): Unit[] {
    return this.game.world.units.filter((u) => u.owner === this.game.humanPlayer);
  }

  selectArmy(): void {
    this.selection.set(this.ownUnits().filter((u) => u.type !== 'engineer').map((u) => u.id));
  }

  exploreSelected(): void {
    const ids = this.ownSelected().units.map((u) => u.id);
    if (ids.length) this.game.issue({ kind: 'explore', player: this.game.humanPlayer, units: ids });
  }

  stopSelected(): void {
    const ids = this.selection.list();
    if (ids.length) this.game.issue({ kind: 'stop', player: this.game.humanPlayer, units: ids });
  }

  goHome(): void {
    const s = this.game.world.map.starts[this.game.humanPlayer];
    if (s) this.renderer.rig.lookAt(s.x, s.y);
  }

  centerOnSelection(): void {
    const ids = this.selection.list();
    if (ids.length === 0) return;
    let x = 0;
    let y = 0;
    let n = 0;
    for (const id of ids) {
      const u = this.game.world.getUnit(id);
      if (!u) continue;
      x += u.x;
      y += u.y;
      n++;
    }
    if (n) this.renderer.rig.lookAt(x / n, y / n);
  }

  /** Issue a move for the current selection to a world position. */
  moveSelectedTo(x: number, y: number, markerHeight: number): void {
    const ids = this.selection.list();
    if (ids.length === 0) return;
    this.game.issue({ kind: 'move', player: this.game.humanPlayer, units: ids, x, y });
    this.renderer.effects.moveMarker(x, Math.max(0, markerHeight), y);
  }

  /** Context command at a screen point for the current selection. */
  private commandAt(sx: number, sy: number): void {
    this.picker.alpha = this.alpha;
    const hit = this.picker.at(sx, sy);
    const world = this.game.world;
    const player = this.game.humanPlayer;
    const sel = this.ownSelected();
    // Board: land units onto one of our transports.
    if (hit.kind === 'unit' && hit.own && hit.unit.def.cargo) {
      const riders = sel.units.filter((u) => u !== hit.unit && u.def.domain === 'land');
      if (riders.length) {
        this.game.issue({ kind: 'board', player, units: riders.map((u) => u.id), carrier: hit.unit.id });
        this.renderer.effects.moveMarker(hit.unit.x, 0.1, hit.unit.y);
        return;
      }
    }
    // Haul: Sea Engineers onto one of our rigs.
    if (hit.kind === 'building' && hit.own && hit.building.def.tank && hit.building.complete && sel.units.some((u) => u.def.haul)) {
      this.game.issue({ kind: 'haul', player, units: sel.units.filter((u) => u.def.haul).map((u) => u.id), building: hit.building.id });
      this.renderer.effects.moveMarker(hit.building.x, 0.1, hit.building.y);
      return;
    }
    // Land: aircraft onto one of our airfields.
    if (hit.kind === 'building' && hit.own && hit.building.def.dock && sel.units.some((u) => u.def.fuel)) {
      this.game.issue({ kind: 'returnBase', player, units: sel.units.filter((u) => u.def.fuel).map((u) => u.id) });
      return;
    }
    const g = hit.kind === 'ground' ? hit : this.picker.ground(sx, sy);
    if (!g) return;
    // Unload: loaded transport ships told to go to land.
    const ships = sel.units.filter((u) => u.def.cargo && u.def.domain === 'sea' && u.cargo.length > 0);
    if (ships.length && world.nav.passableAt(NavLayer.Foot, g.x, g.y)) {
      this.game.issue({ kind: 'unload', player, units: ships.map((u) => u.id), x: g.x, y: g.y });
      const others = sel.units.filter((u) => !ships.includes(u)).map((u) => u.id);
      if (others.length) this.game.issue({ kind: 'move', player, units: others, x: g.x, y: g.y });
      this.renderer.effects.moveMarker(g.x, Math.max(0, g.h), g.y);
      return;
    }
    this.commandAtWorld(g.x, g.y, g.h);
  }

  ownSelected(): { units: Unit[]; buildings: Building[] } {
    const world = this.game.world;
    const units: Unit[] = [];
    const buildings: Building[] = [];
    for (const id of this.selection.ids) {
      const e = world.getEntity(id);
      if (!e || e.owner !== this.game.humanPlayer) continue;
      if (e.kind === 'unit') units.push(e);
      else buildings.push(e);
    }
    return { units, buildings };
  }

  // -------------------------------------------------------------------------
  // Targeted orders (paradrop): the next click / tap on the map picks the spot.

  targeting: { kind: 'paradrop'; units: number[] } | null = null;

  startTargeting(kind: 'paradrop', units: number[]): void {
    this.cancelPlacement();
    this.targeting = { kind, units };
    this.toast(this.touchDevice ? 'Tap where to drop the paratroopers' : 'Click where to drop the paratroopers (right click to cancel)');
  }

  cancelTargeting(): void {
    this.targeting = null;
  }

  private completeTargeting(sx: number, sy: number): void {
    const t = this.targeting;
    if (!t) return;
    const g = this.picker.ground(sx, sy);
    if (!g) return;
    this.game.issue({ kind: 'paradrop', player: this.game.humanPlayer, units: t.units, x: g.x, y: g.y });
    this.renderer.effects.moveMarker(g.x, Math.max(0, g.h), g.y);
    this.targeting = null;
  }

  commandAtWorld(x: number, y: number, h: number): void {
    const world = this.game.world;
    const player = this.game.humanPlayer;
    const ids = this.selection.list();
    const units: Unit[] = [];
    const buildings: Building[] = [];
    for (const id of ids) {
      const e = world.getEntity(id);
      if (!e || e.owner !== player) continue;
      if (e.kind === 'unit') units.push(e);
      else buildings.push(e);
    }
    if (units.length === 0) {
      // Buildings only: set the rally point.
      for (const b of buildings) this.game.issue({ kind: 'rally', player, building: b.id, x, y });
      if (buildings.length) this.renderer.effects.moveMarker(x, Math.max(0, h), y);
      return;
    }
    const gatherers = units.filter((u) => u.def.gatherRate);
    const ore = gatherers.length ? world.oreNear(x, y, 1.3) : -1;
    const tile = Math.floor(y) * world.map.width + Math.floor(x);
    const target = world.getBuilding(world.occupancy[tile] ?? 0);
    const builders = target && target.owner === player && !target.complete ? units.filter((u) => u.def.builder === target.def.builtBy) : [];
    const used = new Set<number>();
    if (ore >= 0) {
      this.game.issue({ kind: 'gather', player, units: gatherers.map((u) => u.id), resource: ore });
      gatherers.forEach((u) => used.add(u.id));
    } else if (target && builders.length) {
      this.game.issue({ kind: 'assist', player, units: builders.map((u) => u.id), target: target.id });
      builders.forEach((u) => used.add(u.id));
    }
    const rest = units.filter((u) => !used.has(u.id)).map((u) => u.id);
    if (rest.length) this.game.issue({ kind: 'move', player, units: rest, x, y });
    this.renderer.effects.moveMarker(x, Math.max(0, h), y);
  }

  // -------------------------------------------------------------------------
  // Building placement

  startPlacement(type: BuildingTypeId): void {
    const s = this.renderer.rig.target;
    const [tx, ty] = snapFootprint(this.game.world, type, s.x, s.y);
    this.placing = { type, tx, ty, valid: false, problem: null, positioned: false };
    this.updateGhost();
  }

  cancelPlacement(): void {
    this.placing = null;
    this.renderer.ghost.hide();
  }

  private moveGhost(clientX: number, clientY: number): void {
    if (!this.placing) return;
    const g = this.renderer.pickGround(clientX, clientY);
    if (!g) return;
    const [tx, ty] = snapFootprint(this.game.world, this.placing.type, g.x, g.y);
    this.placing.tx = tx;
    this.placing.ty = ty;
    this.placing.positioned = true;
    this.updateGhost();
  }

  /** Re-check validity (resources change, units move) and redraw the ghost. */
  updateGhost(): void {
    const pl = this.placing;
    if (!pl) return;
    pl.problem = placementCheck(this.game.world, this.game.humanPlayer, pl.type, pl.tx, pl.ty);
    if (!pl.problem && this.touchDevice && !pl.positioned) pl.problem = 'Tap the map to choose a spot';
    pl.valid = pl.problem === null;
    this.renderer.ghost.show(pl.type, pl.tx, pl.ty, pl.valid);
  }

  confirmPlacement(keepPlacing = false): void {
    const pl = this.placing;
    if (!pl) return;
    this.updateGhost();
    if (!pl.valid) {
      if (pl.problem) this.toast(pl.problem);
      return;
    }
    const world = this.game.world;
    const def = BUILDINGS[pl.type];
    const builders = this.selection
      .list()
      .map((id) => world.getUnit(id))
      .filter((u): u is Unit => !!u && u.owner === this.game.humanPlayer && u.def.builder === def.builtBy);
    if (!builders.length) {
      this.toast(def.builtBy === 'sea_engineer' ? 'Select a Sea Engineer' : 'Select an Engineer');
      return;
    }
    this.game.issue({ kind: 'build', player: this.game.humanPlayer, units: builders.map((u) => u.id), building: pl.type, tx: pl.tx, ty: pl.ty });
    if (keepPlacing) {
      pl.positioned = false;
    } else {
      this.cancelPlacement();
    }
  }

  /** Select idle engineers one at a time, centring the camera on each. */
  private idleCursor = 0;
  selectNextIdle(): void {
    const idle = this.idleEngineers();
    if (!idle.length) {
      this.toast('No idle engineers');
      return;
    }
    const u = idle[this.idleCursor++ % idle.length]!;
    this.selection.set([u.id]);
    this.renderer.rig.lookAt(u.x, u.y);
  }

  idleEngineers(): Unit[] {
    return this.ownUnits().filter((u) => u.def.builder && !u.task && u.state === 'idle');
  }

  // -------------------------------------------------------------------------
  // Selection

  private screenPos(u: Unit): { x: number; y: number; visible: boolean; pxPerUnit: number } {
    this.picker.alpha = this.alpha;
    return this.picker.unitScreen(u);
  }

  private selectTypeOnScreen(type: string): void {
    const ids = this.ownUnits()
      .filter((u) => u.type === type && this.screenPos(u).visible && this.renderer.units.isPickable(u))
      .map((u) => u.id);
    this.selection.set(ids);
  }

  /** Show what was clicked, if it is something we don't control. */
  private inspect(hit: Hit): void {
    switch (hit.kind) {
      case 'unit':
      case 'building':
        this.selection.setInspect({ kind: 'entity', id: hit.kind === 'unit' ? hit.unit.id : hit.building.id });
        break;
      case 'resource':
        this.selection.setInspect({ kind: 'resource', index: hit.res.index });
        break;
      case 'ground':
        if (hit.explored) this.selection.setInspect({ kind: 'ground', x: hit.x, y: hit.y });
        else this.selection.clear();
        break;
      case 'none':
        this.selection.clear();
    }
  }

  private clickSelect(sx: number, sy: number, additive: boolean): void {
    this.picker.alpha = this.alpha;
    const hit = this.picker.at(sx, sy);
    const now = performance.now();
    if (hit.kind === 'unit' && hit.own) {
      const u = hit.unit;
      const dbl = this.lastClick.unitId === u.id && now - this.lastClick.time < 350;
      this.lastClick = { time: now, unitId: u.id };
      if (dbl) this.selectTypeOnScreen(u.type);
      else if (additive) this.selection.toggle(u.id);
      else this.selection.set([u.id]);
      return;
    }
    if (hit.kind === 'building' && hit.own) {
      this.selection.set([hit.building.id]);
      return;
    }
    if (!additive) this.inspect(hit);
  }

  private tap(sx: number, sy: number): void {
    this.picker.alpha = this.alpha;
    const hit = this.picker.at(sx, sy);
    const now = performance.now();
    if (hit.kind === 'unit' && hit.own && this.verbFor(hit) === null) {
      const u = hit.unit;
      const dbl = this.lastClick.unitId === u.id && now - this.lastClick.time < 400;
      this.lastClick = { time: now, unitId: u.id };
      if (dbl) this.selectTypeOnScreen(u.type);
      else this.selection.set([u.id]);
      return;
    }
    const verb = this.verbFor(hit);
    // Tapping a building selects it, unless the selection has a job to do there (help build).
    if (hit.kind === 'building' && hit.own && verb !== 'build' && verb !== 'board' && verb !== 'mine') {
      this.selection.set([hit.building.id]);
      return;
    }
    // Enemies are inspected for now (attacking arrives with combat in M3).
    if ((hit.kind === 'unit' || hit.kind === 'building') && !hit.own) {
      this.inspect(hit);
      return;
    }
    if (verb) {
      this.commandAt(sx, sy);
      return;
    }
    this.inspect(hit);
  }

  /** What a right click / tap on this hit would do with the current selection (null: nothing). */
  verbFor(hit: Hit): CursorKind | null {
    const world = this.game.world;
    const me = this.game.humanPlayer;
    let units = 0;
    let gatherers = 0;
    let buildings = 0;
    const builderKinds = new Set<string>();
    for (const id of this.selection.ids) {
      const e = world.getEntity(id);
      if (!e || e.owner !== me) continue;
      if (e.kind === 'building') {
        buildings++;
        continue;
      }
      units++;
      if (e.def.gatherRate) gatherers++;
      if (e.def.builder) builderKinds.add(e.def.builder);
    }
    if (units === 0) return buildings > 0 && hit.kind !== 'none' ? 'rally' : null;
    const sel = this.ownSelected();
    if (hit.kind === 'unit' && hit.own && hit.unit.def.cargo && sel.units.some((u) => u !== hit.unit && u.def.domain === 'land')) return 'board';
    if (hit.kind === 'building' && hit.own && hit.building.def.dock && sel.units.some((u) => u.def.fuel)) return 'board';
    if (hit.kind === 'building' && hit.own && hit.building.def.tank && hit.building.complete && sel.units.some((u) => u.def.haul)) return 'mine';
    if (hit.kind === 'ground' && sel.units.some((u) => u.def.cargo && u.def.domain === 'sea' && u.cargo.length > 0) && world.nav.passableAt(NavLayer.Foot, hit.x, hit.y)) return 'unload';
    if (hit.kind === 'resource' && hit.res.kind === 'ore' && gatherers > 0) return 'mine';
    if (hit.kind === 'building' && hit.own && !hit.building.complete && builderKinds.has(hit.building.def.builtBy)) return 'build';
    if (hit.kind === 'none') return null;
    return 'move';
  }

  // -------------------------------------------------------------------------
  // Hover (desktop): label under the cursor and a context cursor

  private hoverAt = 0;
  private lastCursor = '';

  private updateHover(): void {
    const now = performance.now();
    if (now - this.hoverAt < 70) return;
    this.hoverAt = now;
    const busy = this.pointers.size > 0;
    if (this.touchDevice || !this.mouse.inside || busy) {
      this.tooltip.style.display = 'none';
      if (busy) return;
    }
    let cursor: CursorKind = 'default';
    let label: { title: string; sub: string } | null = null;
    if (this.targeting) {
      cursor = 'paradrop';
    } else if (this.placing) {
      cursor = this.placing.valid ? 'place' : 'nope';
    } else if (this.mouse.inside && !this.touchDevice) {
      this.picker.alpha = this.alpha;
      const hit = this.picker.at(this.mouse.x, this.mouse.y);
      const verb = this.verbFor(hit);
      const selectable = (hit.kind === 'unit' || hit.kind === 'building') && hit.own;
      // Own units/buildings are selected by left click; the cursor shows the right-click verb otherwise.
      cursor = verb && !(selectable && verb === 'move') ? verb : selectable ? 'select' : 'default';
      if (hit.kind !== 'ground') label = hitName(this.game.world, hit, this.game.humanPlayer);
      else if (hit.explored && hit.terrain !== Terrain.Grass && hit.terrain !== Terrain.Beach) label = hitName(this.game.world, hit, this.game.humanPlayer);
    }
    const css = cursorCss(cursor);
    if (css !== this.lastCursor) {
      this.canvas.style.cursor = css;
      this.lastCursor = css;
    }
    if (label && this.mouse.inside && !this.touchDevice) {
      this.tooltip.innerHTML = `<b></b>${label.sub ? '<span></span>' : ''}`;
      this.tooltip.querySelector('b')!.textContent = label.title;
      const sub = this.tooltip.querySelector('span');
      if (sub) sub.textContent = label.sub;
      this.tooltip.style.display = 'block';
      const w = this.canvas.clientWidth;
      const left = Math.min(this.mouse.x + 18, w - 220);
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${this.mouse.y + 20}px`;
    } else {
      this.tooltip.style.display = 'none';
    }
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const ids: number[] = [];
    for (const u of this.ownUnits()) {
      const s = this.screenPos(u);
      if (s.visible && s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY) ids.push(u.id);
    }
    // A box around an army should not grab the engineers too.
    const army = ids.filter((id) => this.game.world.getUnit(id)?.type !== 'engineer');
    this.selection.set(army.length > 0 ? army : ids, additive);
  }

  private showBox(x0: number, y0: number, x1: number, y1: number): void {
    const s = this.boxEl.style;
    s.display = 'block';
    s.left = `${Math.min(x0, x1)}px`;
    s.top = `${Math.min(y0, y1)}px`;
    s.width = `${Math.abs(x1 - x0)}px`;
    s.height = `${Math.abs(y1 - y0)}px`;
  }

  private hideBox(): void {
    this.boxEl.style.display = 'none';
  }
}
