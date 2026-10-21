// Mouse, keyboard and touch input. Turns gestures into camera moves, selections
// and commands.
//
// Desktop: left click/drag select, right click move, right drag pan, middle drag
//          rotate, wheel zoom, WASD/arrows pan, Q/E rotate, edge scrolling.
// Touch:   tap select / tap ground to move, one-finger drag pans (or box-selects
//          in Select mode), two fingers pan + pinch zoom + twist rotate.

import * as THREE from 'three';
import type { Game } from '../game.ts';
import type { GameRenderer } from '../render/renderer.ts';
import type { Unit } from '../sim/world.ts';
import type { Selection } from './selection.ts';

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

export class InputController {
  dragMode: DragMode = 'pan';
  /** Interpolation factor of the last rendered frame, so picking matches what is on screen. */
  alpha = 1;
  private readonly pointers = new Map<number, PointerInfo>();
  private gesture: { cx: number; cy: number; dist: number; angle: number } | null = null;
  private readonly keys = new Set<string>();
  private readonly mouse = { x: 0, y: 0, inside: false };
  private lastClick = { time: 0, unitId: -1 };
  private lastGroupKey = { n: -1, time: 0 };
  private readonly boxEl: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: GameRenderer;
  private readonly game: Game;
  private readonly selection: Selection;
  readonly touchDevice: boolean;
  onDragModeChange: (mode: DragMode) => void = () => {};

  constructor(canvas: HTMLCanvasElement, renderer: GameRenderer, game: Game, selection: Selection, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.game = game;
    this.selection = selection;
    this.touchDevice = matchMedia('(pointer: coarse)').matches;
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'select-box';
    uiRoot.appendChild(this.boxEl);

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
    const rig = this.renderer.rig;
    const speed = rig.distance * 1.1 * frameDt;
    let r = 0;
    let f = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += speed;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= speed;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += speed;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= speed;
    if (this.keys.has('KeyQ')) rig.rotate(-1.6 * frameDt);
    if (this.keys.has('KeyE')) rig.rotate(1.6 * frameDt);
    if (this.keys.has('Equal') || this.keys.has('NumpadAdd')) rig.zoom(Math.exp(-1.5 * frameDt));
    if (this.keys.has('Minus') || this.keys.has('NumpadSubtract')) rig.zoom(Math.exp(1.5 * frameDt));

    // Edge scrolling, only with a mouse that is over the game and not dragging.
    if (this.mouse.inside && !this.touchDevice && this.pointers.size === 0 && document.hasFocus()) {
      const m = 12;
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (this.mouse.x < m) r -= speed;
      if (this.mouse.x > w - m) r += speed;
      if (this.mouse.y < m) f += speed;
      if (this.mouse.y > h - m) f -= speed;
    }
    if (r !== 0 || f !== 0) rig.pan(r, f);
  }

  // -------------------------------------------------------------------------
  // Pointers

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
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
    if (pi.drag === 'pan') rig.panPixels(dx, dy, this.renderer.viewportHeight);
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
    if (pi.drag === 'box') {
      this.hideBox();
      this.boxSelect(pi.startX, pi.startY, pi.x, pi.y, additive);
      return;
    }
    if (pi.moved) return;

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
    this.renderer.rig.zoom(Math.exp(e.deltaY * scale * 0.0012));
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
        this.selection.clear();
        break;
      case 'KeyX':
        this.stopSelected();
        break;
      case 'KeyH':
        this.goHome();
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

  private commandAt(sx: number, sy: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const g = this.renderer.pickGround(sx + rect.left, sy + rect.top);
    if (g) this.moveSelectedTo(g.x, g.y, g.h);
  }

  // -------------------------------------------------------------------------
  // Selection

  private screenPos(u: Unit): { x: number; y: number; visible: boolean; pxPerUnit: number } {
    const v = this.renderer.units.renderPosition(u, this.alpha);
    v.y += u.def.domain === 'air' ? 0 : u.def.armor === 'inf' ? 0.4 : 0.35;
    const cam = this.renderer.rig.camera;
    const dist = cam.position.distanceTo(v);
    const pxPerUnit = this.renderer.viewportHeight / (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    return { ...this.renderer.toScreen(v), pxPerUnit };
  }

  private pickOwnUnit(sx: number, sy: number): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    const minR = this.touchDevice ? 26 : 14;
    for (const u of this.ownUnits()) {
      const s = this.screenPos(u);
      if (!s.visible) continue;
      const d = Math.hypot(s.x - sx, s.y - sy);
      const r = Math.max(minR, u.def.radius * s.pxPerUnit * 1.4);
      if (d < r && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private selectTypeOnScreen(type: string): void {
    const ids = this.ownUnits()
      .filter((u) => u.type === type && this.screenPos(u).visible)
      .map((u) => u.id);
    this.selection.set(ids);
  }

  private clickSelect(sx: number, sy: number, additive: boolean): void {
    const u = this.pickOwnUnit(sx, sy);
    const now = performance.now();
    if (!u) {
      if (!additive) this.selection.clear();
      return;
    }
    const dbl = this.lastClick.unitId === u.id && now - this.lastClick.time < 350;
    this.lastClick = { time: now, unitId: u.id };
    if (dbl) this.selectTypeOnScreen(u.type);
    else if (additive) this.selection.toggle(u.id);
    else this.selection.set([u.id]);
  }

  private tap(sx: number, sy: number): void {
    const u = this.pickOwnUnit(sx, sy);
    const now = performance.now();
    if (u) {
      const dbl = this.lastClick.unitId === u.id && now - this.lastClick.time < 400;
      this.lastClick = { time: now, unitId: u.id };
      if (dbl) this.selectTypeOnScreen(u.type);
      else this.selection.set([u.id]);
      return;
    }
    if (this.selection.ids.size > 0) this.commandAt(sx, sy);
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
