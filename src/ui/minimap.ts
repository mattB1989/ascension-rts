// Diamond-shaped minimap (rotated 45 degrees so "up" points from your base
// towards the enemy, matching the default camera). Tap/click to jump the
// camera; right-click to send the selection there.

import type { GameRenderer } from '../render/renderer.ts';
import { Terrain, type TerrainId } from '../sim/map.ts';
import type { World } from '../sim/world.ts';
import type { InputController } from './input.ts';
import type { Selection } from './selection.ts';

const COLORS: Record<TerrainId, string> = {
  [Terrain.Deep]: '#173a55',
  [Terrain.Shallow]: '#2f7f86',
  [Terrain.Beach]: '#cbb987',
  [Terrain.Grass]: '#5f8a3e',
  [Terrain.Forest]: '#3c6630',
  [Terrain.Rock]: '#7d776e',
  [Terrain.Bridge]: '#9a9a96',
};

export class Minimap {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrainImg: HTMLCanvasElement;
  private size = 0;
  private dragging = false;
  private readonly world: World;
  private readonly renderer: GameRenderer;
  private readonly input: InputController;
  private readonly selection: Selection;
  private lastDraw = 0;

  constructor(world: World, renderer: GameRenderer, input: InputController, selection: Selection) {
    this.world = world;
    this.renderer = renderer;
    this.input = input;
    this.selection = selection;
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    this.ctx = this.el.getContext('2d')!;
    this.terrainImg = this.bakeTerrain();

    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.button === 2) {
        const p = this.toWorld(e);
        if (p) this.input.moveSelectedTo(p.x, p.y, 0);
        return;
      }
      this.dragging = true;
      this.el.setPointerCapture(e.pointerId);
      this.jump(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (this.dragging) this.jump(e);
    });
    this.el.addEventListener('pointerup', () => (this.dragging = false));
    this.el.addEventListener('pointercancel', () => (this.dragging = false));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private bakeTerrain(): HTMLCanvasElement {
    const m = this.world.map;
    const c = document.createElement('canvas');
    c.width = m.width;
    c.height = m.height;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        ctx.fillStyle = COLORS[m.terrain[y * m.width + x] as TerrainId];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (const r of m.resources) {
      ctx.fillStyle = r.kind === 'ore' ? '#5ff0e0' : '#111';
      ctx.fillRect(Math.floor(r.x) - 1, Math.floor(r.y) - 1, 2, 2);
    }
    return c;
  }

  /** world (x, y) -> minimap pixel. */
  private project(x: number, y: number): [number, number] {
    const m = this.world.map;
    const k = this.size / (m.width * Math.SQRT2);
    const dx = x - m.width / 2;
    const dy = y - m.height / 2;
    return [this.size / 2 + ((-dx + dy) / Math.SQRT2) * k, this.size / 2 - ((dx + dy) / Math.SQRT2) * k];
  }

  private toWorld(e: PointerEvent): { x: number; y: number } | null {
    const rect = this.el.getBoundingClientRect();
    const m = this.world.map;
    const k = this.size / (m.width * Math.SQRT2);
    const sx = (e.clientX - rect.left - this.size / 2) / k;
    const sy = (e.clientY - rect.top - this.size / 2) / k;
    const x = -(sx + sy) / Math.SQRT2 + m.width / 2;
    const y = (sx - sy) / Math.SQRT2 + m.height / 2;
    if (x < 0 || y < 0 || x > m.width || y > m.height) return null;
    return { x, y };
  }

  private jump(e: PointerEvent): void {
    const p = this.toWorld(e);
    if (p) this.renderer.rig.lookAt(p.x, p.y);
  }

  draw(now: number): void {
    if (now - this.lastDraw < 100) return; // 10 fps is plenty
    this.lastDraw = now;
    const css = this.el.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio);
    if (css !== this.size || this.el.width !== Math.round(css * dpr)) {
      this.size = css;
      this.el.width = Math.round(css * dpr);
      this.el.height = Math.round(css * dpr);
    }
    const ctx = this.ctx;
    const m = this.world.map;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);

    // Terrain, drawn through the same rotation as project().
    const k = this.size / (m.width * Math.SQRT2);
    ctx.save();
    ctx.translate(this.size / 2, this.size / 2);
    ctx.transform((-1 / Math.SQRT2) * k, (-1 / Math.SQRT2) * k, (1 / Math.SQRT2) * k, (-1 / Math.SQRT2) * k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrainImg, -m.width / 2, -m.height / 2);
    ctx.restore();

    // Units.
    for (const u of this.world.units) {
      const [px, py] = this.project(u.x, u.y);
      const color = '#' + (this.world.players[u.owner]?.color ?? 0xffffff).toString(16).padStart(6, '0');
      const sel = this.selection.ids.has(u.id);
      ctx.fillStyle = sel ? '#ffffff' : color;
      const s = u.def.domain === 'air' ? 2 : u.def.armor === 'inf' ? 2 : 3;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }

    // Camera view.
    const fp = this.renderer.viewFootprint();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    fp.forEach((p, i) => {
      const [x, y] = this.project(p.x, p.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
}
