// Shared pieces for the kit-built city models (see ../kit.ts): palettes and small
// assemblies every category uses (lots, trees, fences, lamps, vehicles, crates…).
// Each category file (housing.ts, industry.ts, infra.ts) exports a record of
// model builders; cityModels.ts looks there first.

import * as THREE from 'three';
import type { Kit } from '../kit.ts';

/** (team colour, level, variant) → model centred on its footprint at y = 0. */
export type ModelFn = (team: number, level: number, variant: number) => THREE.Group;

export const C = {
  lawn: 0x6f9a45,
  lawnDark: 0x5c8638,
  hedge: 0x3f6e32,
  leaf: 0x4f8a3a,
  leafDark: 0x3b7030,
  bark: 0x6a4a32,
  paving: 0x8f8c85,
  pavingLight: 0xa9a59c,
  asphalt: 0x3d4043,
  concrete: 0x9d9a92,
  concreteLight: 0xb9b5ab,
  plaster: 0xe6dfcf,
  white: 0xf0eee8,
  trim: 0xe9e4d8,
  brick: 0xa65a3e,
  brickDark: 0x7d4433,
  timber: 0x8a5a32,
  timberDark: 0x5e3d24,
  roofRed: 0xa8442f,
  roofSlate: 0x5b6168,
  roofGreen: 0x4f6b4a,
  metal: 0x8c939a,
  metalDark: 0x3c4146,
  steelBlue: 0x5d7486,
  glass: 0x7fb6d6,
  glassDark: 0x3e5d74,
  window: 0xffd890,
  door: 0x5a3a28,
  hazard: 0xe0b23a,
  rust: 0x9a5a3a,
  water: 0x3fa0c0,
};

// Houses vary (walls, roofs, bricks, doors) so streets don't look stamped out.
export const ROOFS = [0xa8442f, 0x7d4433, 0x5b6168, 0x4f6b4a, 0x8a6a4a, 0x6a4a5a, 0x9a5a3a];
export const WALLS = [0xe6dfcf, 0xd8c8a8, 0xc9d0d6, 0xe8d8c4, 0xcdbfa6, 0xdcd4e0, 0xe4cfb8];
export const BRICKS = [0xa65a3e, 0x8a5040, 0xb87850, 0x7d4433, 0x9a6a50];
export const DOORS = [0x5a3a28, 0x2f4f6f, 0x6a2a2a, 0x2f5a3a, 0x3a3a3a];

/** Deterministic pick from a list by variant and a salt. */
export function pick<T>(list: readonly T[], v: number, salt: number): T {
  return list[Math.abs((v * 2654435761 + salt * 40503) >>> 7) % list.length]!;
}

/** A small deterministic random number generator for per-variant jitter. */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Darken / lighten a colour. */
export function tint(hex: number, k: number): number {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return c.getHex();
}

/** The ground of a lot: a slab of w x d (tiles) with a slightly raised kerb. */
export function lot(k: Kit, w: number, d: number, hex = C.paving, tex: 'concrete' | 'lawn' = 'concrete'): void {
  k.box(w - 0.04, 0.08, d - 0.04, tint(hex, 0.92), 0, 0.04, 0, { tex, flat: true });
  k.box(w - 0.14, 0.03, d - 0.14, hex, 0, 0.095, 0, { tex, flat: true });
}

/** A broadleaf tree (trunk and a clump of three low-poly crowns). */
export function tree(k: Kit, x: number, z: number, s = 1, v = 0): void {
  const r = rng(v * 31 + Math.round(x * 100) + Math.round(z * 1000));
  k.cyl(0.035 * s, 0.05 * s, 0.4 * s, 5, C.bark, x, 0.3 * s, z, { tex: 'planks' });
  const leaf = r() < 0.5 ? C.leaf : C.leafDark;
  k.add(new THREE.IcosahedronGeometry(0.26 * s, 0), leaf, x, 0.68 * s, z, { flat: true, rot: [r(), r(), r()] });
  k.add(new THREE.IcosahedronGeometry(0.18 * s, 0), tint(leaf, 1.12), x + 0.12 * s, 0.82 * s, z - 0.06 * s, { flat: true, rot: [r(), r(), r()] });
  k.add(new THREE.IcosahedronGeometry(0.16 * s, 0), tint(leaf, 0.9), x - 0.1 * s, 0.6 * s, z + 0.1 * s, { flat: true, rot: [r(), r(), r()] });
}

/** A conifer (two stacked cones). */
export function pine(k: Kit, x: number, z: number, s = 1): void {
  k.cyl(0.03 * s, 0.04 * s, 0.25 * s, 5, C.bark, x, 0.13 * s, z);
  k.cone(0.24 * s, 0.5 * s, 7, C.leafDark, x, 0.45 * s, z, { flat: true });
  k.cone(0.17 * s, 0.4 * s, 7, tint(C.leafDark, 1.1), x, 0.72 * s, z, { flat: true });
}

/** A clipped hedge along x (len) or z. */
export function hedge(k: Kit, x: number, z: number, len: number, alongX = true, h = 0.16): void {
  k.box(alongX ? len : 0.14, h, alongX ? 0.14 : len, C.hedge, x, h / 2 + 0.1, z, { bevel: 0.04, edge: 1.15 });
}

/** A picket / panel fence along x or z. */
export function fence(k: Kit, x: number, z: number, len: number, alongX = true, hex = C.white): void {
  const n = Math.max(2, Math.round(len / 0.18));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    k.box(0.03, 0.16, 0.03, hex, alongX ? x + t : x, 0.18, alongX ? z : z + t, { flat: true });
  }
  k.box(alongX ? len : 0.02, 0.025, alongX ? 0.02 : len, hex, x, 0.22, z, { flat: true });
}

/** A street lamp (glows at night). */
export function lamp(k: Kit, x: number, z: number, h = 0.7): void {
  k.cyl(0.015, 0.022, h, 5, C.metalDark, x, h / 2 + 0.1, z, { surface: 'metal' });
  k.box(0.1, 0.03, 0.06, C.metalDark, x, h + 0.11, z, { surface: 'metal' });
  k.box(0.07, 0.015, 0.045, 0xfff0c0, x, h + 0.09, z, { glow: 1 });
}

/** A parked car (colour by variant). */
export function car(k: Kit, x: number, z: number, hex: number, alongX = true): void {
  const [w, d] = alongX ? [0.34, 0.17] : [0.17, 0.34];
  k.box(w, 0.08, d, hex, x, 0.16, z, { bevel: 0.02, surface: 'gloss' });
  k.box(alongX ? 0.18 : 0.15, 0.07, alongX ? 0.15 : 0.18, C.glassDark, x, 0.235, z, { surface: 'glass', bevel: 0.02 });
}

/** A stack of crates or pallets. */
export function crates(k: Kit, x: number, z: number, n: number, hex = 0x9a7a4a): void {
  for (let i = 0; i < n; i++) k.box(0.22, 0.18, 0.22, tint(hex, 0.9 + (i % 3) * 0.08), x + (i % 2) * 0.24, 0.19 + Math.floor(i / 4) * 0.18, z + (Math.floor(i / 2) % 2) * 0.24, { tex: 'planks', bevel: 0.015 });
}

/** A brick or steel chimney with a smoke anchor at its top. */
export function chimney(k: Kit, x: number, z: number, h: number, r = 0.14, hex = C.brick, base = 0): void {
  k.cyl(r * 0.8, r, h, 10, hex, x, base + h / 2, z, { tex: hex === C.brick || hex === C.brickDark ? 'brick' : 'concrete', bevel: 0.02 });
  k.cyl(r * 0.9, r * 0.9, 0.06, 10, C.metalDark, x, base + h + 0.03, z, { surface: 'metal' });
  k.anchor('smoke', x, base + h + 0.06, z);
}
