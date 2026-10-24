// Small assemblies for the housing and civic models (housing.ts): facade work
// (windows with frames and sills, doors, signs, clocks, columns), rooftop kit
// (parapets, plant, tanks, dishes, solar), street furniture (benches, planters,
// bollards, flags, people) and a few shapes the kit lacks (prisms, rings).
//
// Faces: 'z' is a wall facing +z whose plane is at z = off; '-z' faces -z at
// z = -off; 'x' / '-x' likewise. Along a wall, `t` is the x (for ±z faces) or
// the z (for ±x faces) of a feature's centre.

import * as THREE from 'three';
import type { BlockOpts, Kit, PartOpts } from '../kit.ts';
import { C, rng, tint } from './common.ts';

export type Face = 'x' | '-x' | 'z' | '-z';

export const WARM = 0xffd890;
export const DARK_GLASS = 0x2f4256;
export const STONE = 0xd9cfb8;
export const STONE_DARK = 0xb3a78c;
export const SLATE = 0x4f565e;
export const COPPER = 0x6e9e8c;
export const GOLD = 0xd8b04a;
export const POLICE = 0x2a4a8a;
export const RED_CROSS = 0xd8352c;

const sgn = (f: Face) => (f[0] === '-' ? -1 : 1);
const runsX = (f: Face) => f.endsWith('z');

/** Evenly spaced positions: n across `span`, centred on c. */
export function spread(n: number, span: number, c = 0): number[] {
  if (n <= 1) return [c];
  return Array.from({ length: n }, (_, i) => c - span / 2 + (span * i) / (n - 1));
}

/** A slab flat against a wall: w along the wall, h tall (centred at y), `depth` out from the plane (plus `out`). */
export function fbox(k: Kit, f: Face, off: number, t: number, y: number, w: number, h: number, depth: number, hex: number, o: BlockOpts = {}, out = 0): void {
  const c = sgn(f) * (off + out + depth / 2);
  if (runsX(f)) k.box(w, h, depth, hex, t, y, c, o);
  else k.box(depth, h, w, hex, c, y, t, o);
}

export interface WinOpts {
  w?: number;
  h?: number;
  /** Frame colour (a slightly larger slab behind the pane). */
  frame?: number;
  /** Sill colour (a ledge under the pane). */
  sill?: number;
  /** Lintel colour (a ledge over the pane). */
  lintel?: number;
  /** Fraction of panes lit (default 0.8); the rest are dark glass. */
  lit?: number;
  seed?: number;
  /** Lit colour and glow. */
  color?: number;
  glow?: number;
  /** Unlit pane colour. */
  dark?: number;
  /** Shutter colour (a pair of narrow slabs beside the pane). */
  shutters?: number;
  /** Mullion colour: a cross of glazing bars over the pane. */
  bars?: number;
}

/** A grid of windows on a wall: columns at ts, rows at ys (pane centres). */
export function windowGrid(k: Kit, f: Face, off: number, ts: number[], ys: number[], o: WinOpts = {}): void {
  const w = o.w ?? 0.14;
  const h = o.h ?? 0.18;
  const r = rng(o.seed ?? 1);
  const litFrac = o.lit ?? 0.8;
  for (const y of ys) {
    for (const t of ts) {
      const lit = r() < litFrac;
      if (o.frame !== undefined) fbox(k, f, off, t, y, w + 0.035, h + 0.035, 0.012, o.frame, { flat: true });
      fbox(k, f, off, t, y, w, h, 0.012, lit ? (o.color ?? WARM) : (o.dark ?? DARK_GLASS), { glow: lit ? (o.glow ?? 0.6) : 0, surface: 'glass', flat: true }, o.frame !== undefined ? 0.004 : 0.002);
      if (o.bars !== undefined) {
        fbox(k, f, off, t, y, 0.012, h, 0.008, o.bars, { flat: true }, 0.012);
        fbox(k, f, off, t, y, w, 0.012, 0.008, o.bars, { flat: true }, 0.012);
      }
      if (o.sill !== undefined) fbox(k, f, off, t, y - h / 2 - 0.012, w + 0.05, 0.022, 0.035, o.sill, { flat: true });
      if (o.lintel !== undefined) fbox(k, f, off, t, y + h / 2 + 0.014, w + 0.04, 0.028, 0.02, o.lintel, { flat: true });
      if (o.shutters !== undefined) for (const s of [-1, 1]) fbox(k, f, off, t + s * (w / 2 + 0.035), y, 0.05, h + 0.01, 0.012, o.shutters, { tex: 'planks', flat: true });
    }
  }
}

/** A door on a wall with a surround, a lit fanlight and a step; double doors for w ≥ 0.24. */
export function door(k: Kit, f: Face, off: number, t: number, y0: number, w: number, h: number, hex: number, o: { surround?: number; fanlight?: boolean; step?: number; glass?: boolean } = {}): void {
  if (o.surround !== undefined) fbox(k, f, off, t, y0 + (h + 0.05) / 2, w + 0.07, h + 0.05, 0.014, o.surround, { flat: true });
  fbox(k, f, off, t, y0 + h / 2, w, h, 0.016, o.glass ? 0x6f8fa6 : hex, o.glass ? { surface: 'glass', glow: 0.25, flat: true } : { tex: 'planks', flat: true }, 0.004);
  if (w >= 0.24) fbox(k, f, off, t, y0 + h / 2, 0.014, h, 0.02, tint(hex, 0.7), { flat: true }, 0.006);
  if (o.fanlight) fbox(k, f, off, t, y0 + h + 0.045, w * 0.9, 0.05, 0.014, WARM, { glow: 0.7, surface: 'glass', flat: true }, 0.004);
  if (o.step !== undefined) fbox(k, f, off, t, y0 - 0.02, w + 0.12, 0.04, 0.1, o.step, { tex: 'concrete', bevel: 0.01 });
}

/** A sloping awning (or canopy) out from a wall: w along it, reaching `depth` out, top edge at y. Stripes alternate with white. */
export function awning(k: Kit, f: Face, off: number, t: number, y: number, w: number, depth: number, hex: number, o: { stripes?: number; slope?: number; valance?: boolean } = {}): void {
  const slope = o.slope ?? 0.35;
  const n = o.stripes ?? 1;
  const s = sgn(f);
  const len = depth / Math.cos(slope);
  const cy = y - (Math.sin(slope) * len) / 2;
  const cOut = s * (off + depth / 2);
  for (let i = 0; i < n; i++) {
    const sw = w / n;
    const tt = t - w / 2 + sw * (i + 0.5);
    const col = i % 2 && n > 1 ? C.white : hex;
    if (runsX(f)) k.box(sw, 0.02, len, col, tt, cy, cOut, { rot: [s * slope, 0, 0], flat: true });
    else k.box(len, 0.02, sw, col, cOut, cy, tt, { rot: [0, 0, -s * slope], flat: true });
    if (o.valance !== false) fbox(k, f, off + depth - 0.01, tt, y - Math.sin(slope) * len - 0.035, sw, 0.07, 0.012, col, { flat: true });
  }
}

/** A flat canopy slab over an entrance with two slim posts at its outer corners (or none). */
export function canopy(k: Kit, f: Face, off: number, t: number, y: number, w: number, depth: number, hex: number, posts = true, fascia?: number): void {
  fbox(k, f, off, t, y, w, 0.04, depth, hex, { bevel: 0.012 });
  if (fascia !== undefined) fbox(k, f, off + depth, t, y, w, 0.05, 0.012, fascia, { flat: true });
  fbox(k, f, off, t, y - 0.03, w * 0.8, 0.012, depth * 0.8, 0xfff2cc, { glow: 0.5, flat: true });
  if (!posts) return;
  const s = sgn(f);
  for (const e of [-1, 1]) {
    const tt = t + e * (w / 2 - 0.03);
    const n = s * (off + depth - 0.03);
    const [x, z] = runsX(f) ? [tt, n] : [n, tt];
    k.cyl(0.012, 0.012, y - 0.1, 5, C.metalDark, x, 0.1 + (y - 0.1) / 2, z, { surface: 'metal', flat: true });
  }
}

/** A low wall round the edge of a flat roof whose surface is at y (coping highlighted). */
export function parapet(k: Kit, w: number, d: number, y: number, hex: number, x = 0, z = 0, h = 0.07, t = 0.04): void {
  const o: BlockOpts = { bevel: 0.012, edge: 1.3, tex: 'concrete' };
  k.block(w, h, t, hex, x, y, z + d / 2 - t / 2, o);
  k.block(w, h, t, hex, x, y, z - d / 2 + t / 2, o);
  k.block(t, h, d - 2 * t, hex, x + w / 2 - t / 2, y, z, o);
  k.block(t, h, d - 2 * t, hex, x - w / 2 + t / 2, y, z, o);
}

/** A flat roof: a darker membrane inside a parapet, at y. */
export function flatRoof(k: Kit, w: number, d: number, y: number, wall: number, x = 0, z = 0, membrane = 0x6c6a66): void {
  k.box(w - 0.06, 0.012, d - 0.06, membrane, x, y + 0.006, z, { tex: 'concrete', flat: true });
  parapet(k, w, d, y, wall, x, z);
}

/** A rooftop air-handling unit with two fans. */
export function hvac(k: Kit, x: number, y: number, z: number, s = 1, alongX = true): void {
  const [w, d] = alongX ? [0.3 * s, 0.17 * s] : [0.17 * s, 0.3 * s];
  k.block(w, 0.12 * s, d, 0xa9b0b5, x, y, z, { bevel: 0.012, surface: 'metal', tex: 'panels' });
  for (const e of [-1, 1]) {
    const [fx, fz] = alongX ? [x + e * 0.075 * s, z] : [x, z + e * 0.075 * s];
    k.cyl(0.055 * s, 0.055 * s, 0.012, 8, C.metalDark, fx, y + 0.126 * s, fz, { surface: 'metal' });
  }
}

/** A timber water tank on legs with a conical lid (old apartment roofs). */
export function waterTank(k: Kit, x: number, y: number, z: number, s = 1): void {
  k.box(0.2 * s, 0.03 * s, 0.2 * s, C.metalDark, x, y + 0.13 * s, z, { flat: true });
  for (const d of [-1, 1]) k.box(0.02 * s, 0.12 * s, 0.2 * s, C.metalDark, x + d * 0.09 * s, y + 0.06 * s, z, { flat: true });
  k.cyl(0.13 * s, 0.13 * s, 0.24 * s, 8, 0x8a6a48, x, y + 0.26 * s, z, { tex: 'planks' });
  k.add(new THREE.CylinderGeometry(0.134 * s, 0.134 * s, 0.015 * s, 8, 1, true), C.metalDark, x, y + 0.24 * s, z, { surface: 'metal' });
  k.cone(0.15 * s, 0.1 * s, 8, 0x5a4a3a, x, y + 0.43 * s, z, { flat: true });
}

/** A small rooftop housing (lift motor room / stair head) with a door. */
export function roofHut(k: Kit, x: number, y: number, z: number, w: number, d: number, h: number, hex: number): void {
  k.block(w, h, d, hex, x, y, z, { bevel: 0.015, tex: 'concrete' });
  k.box(w + 0.03, 0.025, d + 0.03, tint(hex, 0.8), x, y + h, z, { flat: true });
  fbox(k, 'z', z + d / 2, x, y + 0.09, 0.08, 0.17, 0.01, C.metalDark, { surface: 'metal', flat: true });
}

/** A small satellite dish on a stub, facing `yaw`. */
export function satDish(k: Kit, x: number, y: number, z: number, r = 0.06, yaw = 0.6, hex = C.white): void {
  k.cyl(0.008, 0.008, r * 1.2, 4, C.metalDark, x, y + r * 0.6, z, { surface: 'metal' });
  dish(k, r, hex, x, y + r * 1.3, z, yaw, 0.6);
}

/** A dish (a shallow cone, its face toward `yaw`, tilted up by `tilt`) centred at (x, y, z). */
export function dish(k: Kit, r: number, hex: number, x: number, y: number, z: number, yaw: number, tilt: number, seg = 10): void {
  const g = new THREE.ConeGeometry(r, r * 0.35, seg, 1);
  // Apex toward -z (the back), face toward +z, then tilt up and turn.
  g.rotateX(-Math.PI / 2);
  g.rotateX(-tilt);
  g.rotateY(yaw);
  k.add(g, hex, x, y, z, { flat: true });
  const f = new THREE.CircleGeometry(r * 0.25, 6);
  f.rotateX(-tilt);
  f.rotateY(yaw);
  k.add(f, C.metalDark, x + Math.sin(yaw) * Math.cos(tilt) * r * 0.5, y + Math.sin(tilt) * r * 0.5, z + Math.cos(yaw) * Math.cos(tilt) * r * 0.5, { flat: true, surface: 'metal' });
}

/** A solar array: rows of tilted panels on a roof at y. */
export function solar(k: Kit, x: number, y: number, z: number, w: number, rows: number, pitch = 0.22): void {
  for (let i = 0; i < rows; i++) {
    const zz = z - ((rows - 1) * pitch) / 2 + i * pitch;
    k.box(w, 0.015, 0.17, 0x2a3f66, x, y + 0.07, zz, { rot: [-0.45, 0, 0], surface: 'glass', tex: 'panels', flat: true });
    k.box(w * 0.98, 0.05, 0.015, C.metal, x, y + 0.03, zz + 0.06, { surface: 'metal', flat: true });
  }
}

/** A flagpole with the team's flag (a white hoist band, the team field) and a gilded finial. */
export function flagpole(k: Kit, x: number, z: number, h: number, team: number, y0 = 0.1, alongX = true, s = 1): void {
  k.cyl(0.012 * s, 0.018 * s, h, 5, 0xe8e8e2, x, y0 + h / 2, z, { surface: 'metal' });
  k.sphere(0.022 * s, GOLD, x, y0 + h + 0.02, z, 4, { surface: 'metal' });
  const fw = 0.3 * s;
  const fh = 0.18 * s;
  const fy = y0 + h - fh / 2 - 0.03;
  if (alongX) {
    k.box(fw, fh, 0.01, team, x + fw / 2 + 0.015, fy, z, { flat: true });
    k.box(0.05 * s, fh, 0.012, C.white, x + 0.04 * s, fy, z, { flat: true });
  } else {
    k.box(0.01, fh, fw, team, x, fy, z + fw / 2 + 0.015, { flat: true });
    k.box(0.012, fh, 0.05 * s, C.white, x, fy, z + 0.04 * s, { flat: true });
  }
}

/** A hanging banner on a wall (team colour with a gold stripe). */
export function banner(k: Kit, f: Face, off: number, t: number, y: number, w: number, h: number, team: number): void {
  fbox(k, f, off, t, y, w, h, 0.012, team, { flat: true }, 0.01);
  fbox(k, f, off, t, y + h / 2 - 0.03, w + 0.03, 0.02, 0.02, C.metalDark, { flat: true }, 0.008);
  fbox(k, f, off, t, y - h * 0.22, w, 0.025, 0.006, GOLD, { flat: true }, 0.022);
}

/** A park bench along x (or z). */
export function bench(k: Kit, x: number, z: number, alongX = true, y0 = 0.1): void {
  const [w, d] = alongX ? [0.26, 0.07] : [0.07, 0.26];
  k.box(w, 0.018, d, C.timber, x, y0 + 0.07, z, { tex: 'planks', flat: true });
  k.box(alongX ? w : 0.014, 0.05, alongX ? 0.014 : d, C.timber, alongX ? x : x - 0.035, y0 + 0.11, alongX ? z - 0.035 : z, { tex: 'planks', flat: true });
  for (const e of [-1, 1]) k.box(alongX ? 0.015 : d, 0.07, alongX ? d : 0.015, C.metalDark, alongX ? x + e * w * 0.4 : x, y0 + 0.035, alongX ? z : z + e * w * 0.4, { flat: true });
}

/** A raised concrete planter with a clipped shrub (or flowers). */
export function planter(k: Kit, x: number, z: number, w: number, d: number, y0 = 0.1, plant = C.hedge): void {
  k.block(w, 0.08, d, C.concreteLight, x, y0, z, { bevel: 0.012, tex: 'concrete' });
  k.block(w - 0.05, 0.08, d - 0.05, plant, x, y0 + 0.05, z, { bevel: 0.03, edge: 1.15 });
}

/** Bollards in a row. */
export function bollards(k: Kit, xs: number[], zs: number[], hex = C.metalDark, y0 = 0.1): void {
  for (let i = 0; i < Math.max(xs.length, zs.length); i++) k.cyl(0.018, 0.022, 0.09, 6, hex, xs[i] ?? xs[0]!, y0 + 0.045, zs[i] ?? zs[0]!, { bevel: 0.006 });
}

const CLOTHES = [0xc0392b, 0x2e86c1, 0xe0b23a, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x34495e, 0xd35400];

/** A tiny person (for plazas and quads). */
export function person(k: Kit, x: number, z: number, seed: number, y0 = 0.1): void {
  const r = rng(seed);
  const shirt = CLOTHES[Math.floor(r() * CLOTHES.length)]!;
  k.cyl(0.022, 0.026, 0.06, 4, 0x3a3f4a, x, y0 + 0.03, z, { flat: true });
  k.cyl(0.024, 0.022, 0.05, 4, shirt, x, y0 + 0.085, z, { flat: true });
  k.box(0.03, 0.032, 0.03, r() < 0.5 ? 0xe0b090 : 0x9a6a4a, x, y0 + 0.127, z, { flat: true });
}

/** A clock face on a wall: white dial, dark rim, two hands. */
export function clock(k: Kit, f: Face, off: number, t: number, y: number, r: number): void {
  const s = sgn(f);
  const rot: [number, number, number] = runsX(f) ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2];
  const n = s * (off + 0.012);
  const [x, z] = runsX(f) ? [t, n] : [n, t];
  k.cyl(r * 1.15, r * 1.15, 0.016, 8, GOLD, x, y, z, { rot, surface: 'metal' });
  const dial = new THREE.CircleGeometry(r, 10);
  if (runsX(f)) dial.rotateY(s > 0 ? 0 : Math.PI);
  else dial.rotateY(s * Math.PI / 2);
  k.add(dial, 0xf6f1e0, runsX(f) ? x : x + s * 0.01, y, runsX(f) ? z + s * 0.01 : z, { glow: 0.35, flat: true });
  fbox(k, f, off, t, y + r * 0.3, 0.018, r * 0.6, 0.01, 0x222222, { flat: true }, 0.026);
  fbox(k, f, off, t + r * 0.22, y, r * 0.45, 0.018, 0.01, 0x222222, { flat: true }, 0.026);
}

/** A classical column: square base, round shaft, square capital. Stands on y0. */
export function column(k: Kit, x: number, z: number, y0: number, h: number, r: number, hex: number): void {
  k.block(r * 2.6, r * 0.6, r * 2.6, hex, x, y0, z);
  k.add(new THREE.CylinderGeometry(r * 0.88, r, h - r * 1.2, 8, 1, true), hex, x, y0 + r * 0.6 + (h - r * 1.2) / 2, z, { tex: 'plaster' });
  k.block(r * 2.5, r * 0.6, r * 2.5, tint(hex, 1.06), x, y0 + h - r * 0.6, z);
}

/** A triangular pediment facing ±z: `width` across x, `depth` deep along z, `rise` high, base at y. */
export function pediment(k: Kit, width: number, depth: number, rise: number, hex: number, x: number, y: number, z: number, roof?: number): void {
  k.gable(depth, width, rise, roof ?? hex, x, y, z, { rot: [0, Math.PI / 2, 0], over: 0.04, tex: roof ? 'tiles' : 'plaster' });
}

/** A prism: the profile [z, y] pairs (counter-clockwise seen from +x) extruded `w` along x, centred at (x, y, z). */
export function prism(k: Kit, profile: Array<[number, number]>, w: number, hex: number, x: number, y: number, z: number, o: PartOpts = {}): void {
  const shape = new THREE.Shape(profile.map(([pz, py]) => new THREE.Vector2(pz, py)));
  const ex = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  const g = ex.index ? ex.toNonIndexed() : ex;
  // Swap the shape's x (our z) with the extrusion axis (our x): a mirror, so flip the winding back.
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -w / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  const p = g.getAttribute('position').array as Float32Array;
  for (let i = 0; i < p.length; i += 9) for (let c = 0; c < 3; c++) [p[i + 3 + c], p[i + 6 + c]] = [p[i + 6 + c]!, p[i + 3 + c]!];
  k.add(g, hex, x, y, z, o);
}

/** A flat ring (washer) in the xz plane at y: helipad edges, plaza circles. */
export function ring(k: Kit, rIn: number, rOut: number, seg: number, hex: number, x: number, y: number, z: number, o: PartOpts = {}): void {
  const g = new THREE.RingGeometry(rIn, rOut, seg, 1);
  g.rotateX(-Math.PI / 2);
  k.add(g, hex, x, y, z, { flat: true, ...o });
}

/** A low-poly bush. */
export function bush(k: Kit, x: number, z: number, s = 1, hex = C.hedge, y0 = 0.1): void {
  k.add(new THREE.IcosahedronGeometry(0.08 * s, 0), hex, x, y0 + 0.05 * s, z, { flat: true, rot: [x * 3, z * 5, 0.4] });
}

/** A street lamp with a lantern head (glows at night): a period cast-iron post. */
export function lantern(k: Kit, x: number, z: number, h = 0.5, y0 = 0.1): void {
  k.cyl(0.012, 0.022, h, 5, 0x2a2d30, x, y0 + h / 2, z, { surface: 'metal' });
  k.box(0.045, 0.06, 0.045, 0xffe7b0, x, y0 + h + 0.03, z, { glow: 1 });
  k.cone(0.045, 0.04, 4, 0x2a2d30, x, y0 + h + 0.08, z, { surface: 'metal', rot: [0, Math.PI / 4, 0] });
}

/** A small car with a lit roof bar (police) or a box body (ambulance). */
export function vehicle(k: Kit, x: number, z: number, kind: 'police' | 'ambulance' | 'van', alongX = true, hex = C.white): void {
  const L = kind === 'police' ? 0.36 : 0.42;
  const W = 0.18;
  const [w, d] = alongX ? [L, W] : [W, L];
  const body = kind === 'ambulance' ? 0xf4f2ea : hex;
  k.box(w, 0.09, d, body, x, 0.165, z, { bevel: 0.02, surface: 'gloss' });
  for (const e of [-1, 1]) for (const s of [-1, 1]) {
    const [wx, wz] = alongX ? [x + e * L * 0.32, z + s * W * 0.48] : [x + s * W * 0.48, z + e * L * 0.32];
    k.cyl(0.04, 0.04, 0.03, 6, 0x1c1e21, wx, 0.14, wz, { rot: alongX ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2], flat: true });
  }
  if (kind === 'police') {
    k.box(alongX ? 0.19 : 0.16, 0.07, alongX ? 0.16 : 0.19, C.glassDark, x, 0.24, z, { surface: 'glass', bevel: 0.02 });
    k.box(alongX ? L + 0.004 : W + 0.004, 0.03, alongX ? W + 0.004 : L + 0.004, POLICE, x, 0.17, z, { flat: true });
    k.box(alongX ? 0.04 : 0.1, 0.025, alongX ? 0.1 : 0.04, 0x3a6aff, x, 0.285, z, { glow: 1 });
    k.box(alongX ? 0.035 : 0.04, 0.026, alongX ? 0.04 : 0.035, 0xff3a3a, alongX ? x : x, 0.286, z, { glow: 1 });
  } else {
    const off = L * 0.12;
    k.block(alongX ? L * 0.68 : W, 0.14, alongX ? W : L * 0.68, body, alongX ? x - off : x, 0.2, alongX ? z : z - off, { bevel: 0.015, surface: 'gloss' });
    k.box(alongX ? 0.08 : W * 0.9, 0.05, alongX ? W * 0.9 : 0.08, C.glassDark, alongX ? x + L * 0.31 : x, 0.24, alongX ? z : z + L * 0.31, { surface: 'glass', flat: true });
    if (kind === 'ambulance') {
      k.box(alongX ? L * 0.68 : W + 0.005, 0.025, alongX ? W + 0.005 : L * 0.68, RED_CROSS, alongX ? x - off : x, 0.26, alongX ? z : z - off, { flat: true });
      k.box(0.05, 0.022, 0.05, 0x4a7aff, alongX ? x + L * 0.18 : x, 0.355, alongX ? z : z + L * 0.18, { glow: 1 });
    }
  }
}

/** A red cross sign (lit). Faces +z / -z (plane xy) or ±x. */
export function redCross(k: Kit, f: Face, off: number, t: number, y: number, s: number): void {
  fbox(k, f, off, t, y, s * 1.15, s * 1.15, 0.02, C.white, { flat: true, glow: 0.3 });
  fbox(k, f, off, t, y, s * 0.95, s * 0.3, 0.012, RED_CROSS, { glow: 0.8, flat: true }, 0.02);
  fbox(k, f, off, t, y, s * 0.3, s * 0.95, 0.012, RED_CROSS, { glow: 0.8, flat: true }, 0.02);
}

/** An open-ended vertical tube (rings, bands, lit floors): no caps, half the triangles of a cylinder. */
export function tube(k: Kit, rTop: number, rBot: number, h: number, seg: number, hex: number, x: number, y: number, z: number, o: PartOpts = {}): void {
  k.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true), hex, x, y, z, o);
}

/** A round strut from a to b (lattice legs, ribs, braces). */
export function strut(k: Kit, a: [number, number, number], b: [number, number, number], r: number, hex: number, seg = 5, o: PartOpts = {}): void {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  k.add(g, hex, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { flat: true, ...o });
}

/** Paint on the ground: a thin flat strip (court lines, parking bays, crossings). */
export function paint(k: Kit, w: number, d: number, x: number, z: number, hex = 0xf2f0e6, y = 0.112): void {
  k.box(w, 0.006, d, hex, x, y, z, { flat: true });
}
