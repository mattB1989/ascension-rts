// Ground overlays for the economy game: what reaches where. Each returns one
// RGBA texel per tile (alpha 0 = leave the ground alone).

import type { BuildingTypeId } from '../data/buildings.ts';
import type { ServiceKind } from '../data/types.ts';
import { searchRoads } from '../sim/city/roads.ts';
import { Terrain } from '../sim/map.ts';
import type { World } from '../sim/world.ts';

export type OverlayKind = 'land' | 'roads' | 'water' | 'power' | 'market' | 'police' | 'health' | 'school' | 'happiness' | 'pollution';

export const OVERLAYS: Array<{ id: OverlayKind; icon: string; name: string; legend: string }> = [
  { id: 'land', icon: '🌾', name: 'Land', legend: 'Green: fertile farmland. Brown: ore, grey: stone, black: oil deposits.' },
  { id: 'roads', icon: '🛣', name: 'Roads', legend: 'Road condition: green good, red worn (slow trucks). Maintenance depots repair within 30 tiles.' },
  { id: 'water', icon: '💧', name: 'Water', legend: 'Blue: reached by a water tower. Houses: blue with water, red without.' },
  { id: 'power', icon: '⚡', name: 'Power', legend: 'Yellow: powered. Red: needs power and has none.' },
  { id: 'market', icon: '🛒', name: 'Market', legend: 'Orange: within a market\'s reach. Houses: green fed, red not.' },
  { id: 'police', icon: '🚓', name: 'Police', legend: 'Blue: patrolled by a police station.' },
  { id: 'health', icon: '🏥', name: 'Health', legend: 'Pink: within a clinic\'s reach.' },
  { id: 'school', icon: '🎓', name: 'School', legend: 'Purple: within a school\'s reach.' },
  { id: 'happiness', icon: '😊', name: 'Happiness', legend: 'Houses from red (unhappy) to green (happy).' },
  { id: 'pollution', icon: '🏭', name: 'Pollution', legend: 'Red haze around heavy industry: houses nearby are less happy.' },
];

/** Overlay to show automatically while placing a building. */
export function overlayFor(type: BuildingTypeId | string): OverlayKind | null {
  switch (type) {
    case 'farm':
    case 'quarry':
    case 'iron_mine':
    case 'oil_well':
    case 'logging_camp':
      return 'land';
    case 'water_tower':
    case 'pumping_station':
      return 'water';
    case 'power_plant':
      return 'power';
    case 'market':
      return 'market';
    case 'police_station':
      return 'police';
    case 'clinic':
      return 'health';
    case 'school':
      return 'school';
    case 'house':
      return 'happiness';
    case 'steel_mill':
    case 'oil_refinery':
    case 'cement_works':
      return 'pollution';
    case 'maintenance_depot':
      return 'roads';
    default:
      return null;
  }
}

const SERVICE_COLOR: Record<ServiceKind, [number, number, number]> = {
  water: [60, 150, 255],
  market: [255, 160, 50],
  police: [70, 110, 255],
  health: [255, 110, 180],
  school: [170, 110, 255],
};

/** A building to tint in the overlay. */
export interface OverlayMark {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

export interface OverlayResult {
  tiles: Uint8Array;
  marks: OverlayMark[];
}

const hex = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

export function computeOverlay(world: World, kind: OverlayKind, viewer: number): OverlayResult {
  const map = world.map;
  const n = map.width * map.height;
  const out = new Uint8Array(n * 4);
  const marks: OverlayMark[] = [];
  const put = (i: number, r: number, g: number, b: number, a: number) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  };
  const paintBuilding = (bx: number, by: number, w: number, h: number, r: number, g: number, b: number, a = 220) => {
    for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) put(y * map.width + x, r, g, b, a);
    marks.push({ x: bx, y: by, w, h, color: hex(r, g, b) });
  };
  /** Colour the ground beside a road tile too, so reach shows as a band. */
  const band = (tile: number, r: number, g: number, b: number, a: number) => {
    const tx = tile % map.width;
    const ty = (tile - tx) / map.width;
    for (let y = ty - 2; y <= ty + 2; y++) {
      for (let x = tx - 2; x <= tx + 2; x++) {
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const i = y * map.width + x;
        if (out[i * 4 + 3]! < a) put(i, r, g, b, a);
      }
    }
  };
  const mine = world.buildings.filter((b) => b.owner === viewer && b.city);

  if (kind === 'land') {
    for (let i = 0; i < n; i++) {
      const t = map.terrain[i];
      const d = map.deposit[i];
      if (d === 1) put(i, 190, 80, 40, 230);
      else if (d === 2) put(i, 20, 20, 20, 230);
      else if (d === 3) put(i, 225, 225, 220, 230);
      else if (t === Terrain.Fertile) put(i, 90, 220, 60, 200);
      else if (t === Terrain.Grass) put(i, 160, 200, 80, 90);
      else if (t === Terrain.Forest) put(i, 30, 110, 40, 160);
    }
    return { tiles: out, marks };
  }

  if (kind === 'roads') {
    const city = world.city!;
    for (let i = 0; i < n; i++) {
      if (!city.road[i]) continue;
      const c = city.condition[i]!;
      const tx = i % map.width;
      const ty = (i - tx) / map.width;
      for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
        const j = y * map.width + x;
        if (out[j * 4 + 3]! === 0 || city.road[j]) put(j, Math.round(255 * (1 - c)), Math.round(210 * c), 50, city.road[j] ? 230 : 120);
      }
    }
    for (const d of mine) if (d.type === 'maintenance_depot') paintBuilding(d.tx, d.ty, d.w, d.h, 80, 160, 255);
    return { tiles: out, marks };
  }

  if (kind === 'happiness') {
    for (const b of mine) {
      if (b.type !== 'house' || !b.complete) continue;
      const h = b.city!.happiness;
      paintBuilding(b.tx, b.ty, b.w, b.h, Math.round(255 * (1 - h)), Math.round(220 * h), 60);
    }
    return { tiles: out, marks };
  }

  if (kind === 'pollution') {
    for (const s of world.buildings) {
      const p = s.def.econ?.pollution ?? 0;
      if (!p || !s.complete) continue;
      const R = 10;
      for (let y = Math.floor(s.y - R); y <= s.y + R; y++) {
        for (let x = Math.floor(s.x - R); x <= s.x + R; x++) {
          if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
          const d = Math.sqrt((x + 0.5 - s.x) ** 2 + (y + 0.5 - s.y) ** 2);
          if (d >= R) continue;
          const i = y * map.width + x;
          const a = Math.min(220, out[i * 4 + 3]! + Math.round(p * (1 - d / R) * 260));
          put(i, 220, 60, 40, a);
        }
      }
    }
    return { tiles: out, marks };
  }

  if (kind === 'power') {
    for (const b of mine) {
      if (!b.complete) continue;
      const needs = (b.def.econ?.power ?? 0) > 0 || (b.type === 'house' && b.city!.level >= 1);
      const makes = (b.def.econ?.power ?? 0) < 0;
      if (makes) paintBuilding(b.tx, b.ty, b.w, b.h, 255, 230, 60);
      else if (needs) b.city!.powered ? paintBuilding(b.tx, b.ty, b.w, b.h, 255, 220, 80, 170) : paintBuilding(b.tx, b.ty, b.w, b.h, 240, 60, 50);
    }
    // Road networks that carry power.
    const powered = new Set<number>();
    for (const b of mine) if ((b.def.econ?.power ?? 0) < 0 && b.city!.powerOut > 0 && b.city!.comp) powered.add(b.city!.comp);
    const city = world.city!;
    for (let i = 0; i < n; i++) if (city.road[i] && powered.has(city.comp[i]!)) band(i, 255, 220, 60, 110);
    return { tiles: out, marks };
  }

  // Service coverage: road tiles within reach, houses served or not.
  const svc = kind as ServiceKind;
  const [r, g, b] = SERVICE_COLOR[svc];
  for (const s of mine) {
    const sv = s.def.econ?.service;
    if (!sv || sv.kind !== svc || !s.complete || s.city!.access < 0) continue;
    searchRoads(world, s.city!.access, sv.radius, (tile, d) => {
      band(tile, r, g, b, Math.round(170 - (d / sv.radius) * 100));
      return false;
    });
    paintBuilding(s.tx, s.ty, s.w, s.h, r, g, b, 240);
  }
  for (const h of mine) {
    if (h.type !== 'house' || !h.complete) continue;
    const c = h.city!;
    const ok = svc === 'market' ? c.needs.food : c.covered[svc];
    if (ok) paintBuilding(h.tx, h.ty, h.w, h.h, r, g, b, 200);
    else paintBuilding(h.tx, h.ty, h.w, h.h, 230, 60, 50, 200);
  }
  return { tiles: out, marks };
}
