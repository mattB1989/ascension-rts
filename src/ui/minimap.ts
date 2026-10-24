// Diamond-shaped minimap (rotated 45 degrees so "up" points from your base
// towards the enemy, matching the default camera). Tap/click to jump the
// camera; right-click to send the selection there.

import type { GameRenderer } from '../render/renderer.ts';
import { Deposit, Terrain, type TerrainId } from '../sim/map.ts';
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
  [Terrain.Sand]: '#cfb37a',
  [Terrain.Fertile]: '#7ea83c',
  [Terrain.Snow]: '#eef2f4',
};

const DEPOSIT_COLORS: Record<number, [number, number, number]> = { 1: [196, 84, 52], 2: [24, 22, 20], 3: [222, 220, 214] };

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
  private readonly fogCanvas: HTMLCanvasElement;
  private readonly fogCtx: CanvasRenderingContext2D;
  private readonly fogOn: boolean;

  constructor(world: World, renderer: GameRenderer, input: InputController, selection: Selection) {
    this.world = world;
    this.renderer = renderer;
    this.input = input;
    this.selection = selection;
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    this.ctx = this.el.getContext('2d')!;
    this.terrainImg = this.bakeTerrain();
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = world.map.width;
    this.fogCanvas.height = world.map.height;
    this.fogCtx = this.fogCanvas.getContext('2d', { willReadFrequently: true })!;
    this.fogCtx.fillStyle = '#05080c';
    this.fogCtx.fillRect(0, 0, world.map.width, world.map.height);
    this.fogOn = new URLSearchParams(location.search).get('fog') !== '0';

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
    const img = ctx.createImageData(m.width, m.height);
    const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const pal = new Map<number, [number, number, number]>();
    for (const [k, v] of Object.entries(COLORS)) pal.set(Number(k), rgb(v));
    for (let i = 0; i < m.width * m.height; i++) {
      const d = m.deposit[i]!;
      let [r, g, b] = d !== Deposit.None ? DEPOSIT_COLORS[d]! : pal.get(m.terrain[i]!)!;
      // Region borders: a light line where the region changes.
      const x = i % m.width;
      const reg = m.region[i]!;
      if (reg && ((x + 1 < m.width && m.region[i + 1] && m.region[i + 1] !== reg) || (i + m.width < m.region.length && m.region[i + m.width] && m.region[i + m.width] !== reg))) {
        r = r * 0.5 + 120;
        g = g * 0.5 + 115;
        b = b * 0.5 + 90;
      }
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
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

  private pings: Array<{ x: number; y: number; t: number }> = [];

  /** Flash a spot (attack alerts). */
  ping(x: number, y: number): void {
    this.pings.push({ x, y, t: performance.now() });
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

    // Fog of war: black where unexplored, dimmed where not currently visible.
    const viewer = this.renderer.viewer;
    const pl = this.world.players[viewer];
    if (pl && this.fogOn) {
      const n = m.width * m.height;
      const img = this.fogCtx.getImageData(0, 0, m.width, m.height);
      for (let i = 0; i < n; i++) img.data[i * 4 + 3] = pl.visible[i] ? 0 : pl.explored[i] ? 110 : 255;
      this.fogCtx.putImageData(img, 0, 0);
      ctx.save();
      ctx.translate(this.size / 2, this.size / 2);
      ctx.transform((-1 / Math.SQRT2) * k, (-1 / Math.SQRT2) * k, (1 / Math.SQRT2) * k, (-1 / Math.SQRT2) * k, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fogCanvas, -m.width / 2, -m.height / 2);
      ctx.restore();
    }

    // Buildings (enemy ones once explored).
    for (const b of this.world.buildings) {
      if (b.owner !== viewer && pl && !pl.explored[Math.floor(b.y) * m.width + Math.floor(b.x)]) continue;
      const color = '#' + (this.world.players[b.owner]?.color ?? 0xffffff).toString(16).padStart(6, '0');
      ctx.fillStyle = this.selection.ids.has(b.id) ? '#ffffff' : color;
      const corners = [[b.tx, b.ty], [b.tx + b.w, b.ty], [b.tx + b.w, b.ty + b.h], [b.tx, b.ty + b.h]].map(([x, y]) => this.project(x!, y!));
      ctx.beginPath();
      corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
    }

    // Resources the player has discovered: ore as cyan diamonds, oil as dark drops with an orange ring.
    const icon = Math.max(2.5, this.size / 48);
    for (const r of this.world.resources) {
      if (r.amount <= 0) continue;
      if (pl && this.fogOn && !pl.explored[r.ty * m.width + r.tx]) continue;
      const [px, py] = this.project(r.x, r.y);
      if (r.kind === 'ore') {
        ctx.beginPath();
        ctx.moveTo(px, py - icon);
        ctx.lineTo(px + icon * 0.75, py);
        ctx.lineTo(px, py + icon);
        ctx.lineTo(px - icon * 0.75, py);
        ctx.closePath();
        ctx.fillStyle = '#5ff0e0';
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = '#0b2a2a';
        ctx.stroke();
      } else if (r.claimedBy === 0) {
        ctx.beginPath();
        ctx.arc(px, py, icon * 0.95, 0, Math.PI * 2);
        ctx.fillStyle = '#141414';
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = '#ff9a3c';
        ctx.stroke();
      }
    }

    // Units (enemy ones only where visible).
    for (const u of this.world.units) {
      if (u.owner !== viewer && pl && this.fogOn && !pl.visible[Math.floor(u.y) * m.width + Math.floor(u.x)]) continue;
      const [px, py] = this.project(u.x, u.y);
      const color = '#' + (this.world.players[u.owner]?.color ?? 0xffffff).toString(16).padStart(6, '0');
      const sel = this.selection.ids.has(u.id);
      ctx.fillStyle = sel ? '#ffffff' : color;
      const s = u.def.domain === 'air' ? 2 : u.def.armor === 'inf' ? 2 : 3;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }

    // Alert pings: expanding red rings for a few seconds.
    this.pings = this.pings.filter((p) => now - p.t < 3000);
    for (const pg of this.pings) {
      const k = ((now - pg.t) % 1000) / 1000;
      const [px, py] = this.project(pg.x, pg.y);
      ctx.beginPath();
      ctx.arc(px, py, 3 + k * 12, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 80, 60, ${1 - k})`;
      ctx.lineWidth = 2;
      ctx.stroke();
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
