// What is under a screen point: a unit, a building, a resource spot or bare ground.
// Used for clicks, taps, hover labels and cursors. Respects fog of war.

import * as THREE from 'three';
import type { GameRenderer } from '../render/renderer.ts';
import { TERRAIN_NAMES, type TerrainId } from '../sim/map.ts';
import type { Building, ResourceState, Unit, World } from '../sim/world.ts';

export type Hit =
  | { kind: 'unit'; unit: Unit; own: boolean }
  | { kind: 'building'; building: Building; own: boolean }
  | { kind: 'resource'; res: ResourceState }
  | { kind: 'ground'; x: number; y: number; h: number; terrain: TerrainId; explored: boolean }
  | { kind: 'none' };

export class Picker {
  /** Interpolation factor of the last rendered frame. */
  alpha = 1;
  private readonly renderer: GameRenderer;
  private readonly world: World;
  private readonly viewer: number;
  private readonly canvas: HTMLCanvasElement;
  readonly touch: boolean;

  constructor(canvas: HTMLCanvasElement, renderer: GameRenderer, world: World, viewer: number, touch: boolean) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.world = world;
    this.viewer = viewer;
    this.touch = touch;
  }

  /** Screen position of a unit (canvas-relative CSS px) and how many px one world unit spans there. */
  unitScreen(u: Unit): { x: number; y: number; visible: boolean; pxPerUnit: number } {
    const v = this.renderer.units.renderPosition(u, this.alpha);
    v.y += u.def.domain === 'air' ? 0 : u.def.armor === 'inf' ? 0.4 : 0.35;
    const cam = this.renderer.rig.camera;
    const dist = cam.position.distanceTo(v);
    const pxPerUnit = this.renderer.viewportHeight / (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    return { ...this.renderer.toScreen(v), pxPerUnit };
  }

  /** Nearest unit under a canvas-relative point. `ownOnly` restricts to the viewer's units. */
  unitAt(sx: number, sy: number, ownOnly: boolean): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    const minR = this.touch ? 26 : 14;
    for (const u of this.world.units) {
      const own = u.owner === this.viewer;
      if (ownOnly && !own) continue;
      if (!own && !this.renderer.units.isShown(u, this.viewer)) continue;
      if (!this.renderer.units.isPickable(u)) continue;
      const s = this.unitScreen(u);
      if (!s.visible) continue;
      const d = Math.hypot(s.x - sx, s.y - sy);
      const r = Math.max(minR, u.def.radius * s.pxPerUnit * 1.4);
      // Prefer own units when overlapping an enemy.
      const score = d - (own ? 4 : 0);
      if (d < r && score < bestD) {
        bestD = score;
        best = u;
      }
    }
    return best;
  }

  ground(sx: number, sy: number): { x: number; y: number; h: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    return this.renderer.pickGround(sx + rect.left, sy + rect.top);
  }

  /** Everything under a canvas-relative point, most specific first. */
  at(sx: number, sy: number): Hit {
    const u = this.unitAt(sx, sy, false);
    if (u) return { kind: 'unit', unit: u, own: u.owner === this.viewer };
    const g = this.ground(sx, sy);
    if (!g) return { kind: 'none' };
    const w = this.world;
    const tx = Math.floor(g.x);
    const ty = Math.floor(g.y);
    const i = ty * w.map.width + tx;
    const p = w.players[this.viewer];
    const explored = !p || p.explored[i] === 1;
    const b = w.getBuilding(w.occupancy[i] ?? 0);
    if (b && (b.owner === this.viewer || explored)) return { kind: 'building', building: b, own: b.owner === this.viewer };
    if (explored) {
      const res = this.resourceNear(g.x, g.y);
      if (res) return { kind: 'resource', res };
    }
    return { kind: 'ground', x: g.x, y: g.y, h: g.h, terrain: w.map.terrain[i] as TerrainId, explored };
  }

  private resourceNear(x: number, y: number): ResourceState | null {
    let best: ResourceState | null = null;
    let bestD = Infinity;
    for (const r of this.world.resources) {
      if (r.amount <= 0 || r.claimedBy !== 0) continue;
      const reach = r.kind === 'ore' ? 1.3 : r.offshore ? 1.7 : 1.1;
      const d = (r.x - x) * (r.x - x) + (r.y - y) * (r.y - y);
      if (d < reach * reach && d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }
}

/** Short name for anything that can be hovered or inspected. */
export function hitName(world: World, hit: Hit, viewer: number): { title: string; sub: string } | null {
  switch (hit.kind) {
    case 'unit': {
      const u = hit.unit;
      const who = hit.own ? '' : `${world.players[u.owner]?.name ?? 'Enemy'} `;
      return { title: `${who}${u.def.name}`, sub: `${Math.ceil(u.hp)}/${u.def.hp} HP` };
    }
    case 'building': {
      const b = hit.building;
      const who = hit.own ? '' : `${world.players[b.owner]?.name ?? 'Enemy'} `;
      return { title: `${who}${b.def.name}`, sub: b.complete ? `${Math.ceil(b.hp)}/${b.maxHp} HP` : `Under construction · ${Math.floor(b.progress * 100)}%` };
    }
    case 'resource': {
      const r = hit.res;
      if (r.kind === 'ore') return { title: 'Ore deposit', sub: `◆ ${Math.floor(r.amount)} left` };
      return { title: r.offshore ? 'Offshore oil' : 'Oil spot', sub: `${Math.floor(r.amount)} oil · ${r.offshore ? 'Offshore Rig' : 'Oil Derrick'} goes here` };
    }
    case 'ground': {
      if (!hit.explored) return { title: 'Unexplored', sub: '' };
      const sub: Record<number, string> = {
        0: 'Ships only', 1: 'Ships only', 2: '', 3: '', 4: 'Infantry only, slow going', 5: 'Impassable', 6: 'Land units cross, ships pass under',
      };
      void viewer;
      return { title: TERRAIN_NAMES[hit.terrain], sub: sub[hit.terrain] ?? '' };
    }
    case 'none':
      return null;
  }
}
