// Shared assemblies for the kit-built industry models (industry.ts): struts and
// lattices, conveyors, tanks, pipe racks, factory walls and roofs, loading bays,
// vehicles, stockpiles, signs and floodlights. All work in tiles, y up, on a Kit
// (../kit.ts); `Frame` places a sub-assembly at any position and heading.

import * as THREE from 'three';
import type { BlockOpts, Kit, PartOpts, Vec3 } from '../kit.ts';
import { C, rng, tint } from './common.ts';

/** Top of a `lot()` slab: where things stand. */
export const G = 0.11;

const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

/** The rotation that turns +y onto the direction a→b. */
function along(a: Vec3, b: Vec3): { len: number; rot: Vec3; mid: Vec3 } {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  tmpQ.setFromUnitVectors(UP, d.normalize());
  tmpE.setFromQuaternion(tmpQ, 'XYZ');
  return { len, rot: [tmpE.x, tmpE.y, tmpE.z], mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] };
}

/** A round strut from a to b (legs, pipes, cables, braces). */
export function strut(k: Kit, a: Vec3, b: Vec3, r: number, hex: number, seg = 5, o: PartOpts = {}): void {
  const { len, rot, mid } = along(a, b);
  k.add(new THREE.CylinderGeometry(r, r, len, seg, 1, seg <= 4), hex, mid[0], mid[1], mid[2], { flat: true, ...o, rot });
}

/** A square-section beam from a to b that keeps its faces level (girders, belts, ramps). */
export function bar(k: Kit, a: Vec3, b: Vec3, w: number, h: number, hex: number, o: BlockOpts = {}): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const horiz = Math.hypot(dx, dz);
  const len = Math.hypot(horiz, dy);
  const yaw = Math.atan2(-dz, dx);
  const pitch = Math.atan2(dy, horiz);
  k.box(len, h, w, hex, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { flat: true, ...o, rot: [0, yaw, pitch] });
}

/** Compose a heading (about y) with a local rotation. */
function yawed(yaw: number, rot?: Vec3): Vec3 {
  if (!yaw) return rot ?? [0, 0, 0];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  if (rot) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
  tmpE.setFromQuaternion(q, 'XYZ');
  return [tmpE.x, tmpE.y, tmpE.z];
}

/** A local frame (origin and heading) to build vehicles and sub-assemblies in. */
export class Frame {
  private readonly c: number;
  private readonly s: number;
  readonly k: Kit;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly y: number;
  constructor(k: Kit, x: number, z: number, yaw = 0, y = 0) {
    this.k = k;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.y = y;
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
  }
  /** World position of local (lx, y, lz). */
  at(lx: number, y: number, lz: number): Vec3 {
    return [this.x + lx * this.c + lz * this.s, this.y + y, this.z - lx * this.s + lz * this.c];
  }
  box(w: number, h: number, d: number, hex: number, lx: number, y: number, lz: number, o: BlockOpts = {}): this {
    const p = this.at(lx, y, lz);
    this.k.box(w, h, d, hex, p[0], p[1], p[2], { ...o, rot: yawed(this.yaw, o.rot) });
    return this;
  }
  block(w: number, h: number, d: number, hex: number, lx: number, y: number, lz: number, o: BlockOpts = {}): this {
    return this.box(w, h, d, hex, lx, y + h / 2, lz, o);
  }
  cyl(rTop: number, rBot: number, h: number, seg: number, hex: number, lx: number, y: number, lz: number, o: BlockOpts = {}): this {
    const p = this.at(lx, y, lz);
    if (o.bevel) this.k.cyl(rTop, rBot, h, seg, hex, p[0], p[1], p[2], o);
    else this.k.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), hex, p[0], p[1], p[2], { ...o, rot: yawed(this.yaw, o.rot) });
    return this;
  }
  /** A horizontal cylinder along local x or z. */
  tube(r: number, len: number, seg: number, hex: number, lx: number, y: number, lz: number, axis: 'x' | 'z', o: PartOpts = {}): this {
    const p = this.at(lx, y, lz);
    const rot: Vec3 = axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
    this.k.add(new THREE.CylinderGeometry(r, r, len, seg), hex, p[0], p[1], p[2], { flat: true, ...o, rot: yawed(this.yaw, rot) });
    return this;
  }
  /** A wheel (axle along local z): tyre and a lighter hub. */
  wheel(r: number, w: number, lx: number, lz: number, y = G): this {
    this.tube(r, w, 8, 0x26282b, lx, y + r, lz, 'z');
    this.tube(r * 0.5, w + 0.008, 6, C.metal, lx, y + r, lz, 'z', { surface: 'metal' });
    return this;
  }
  add(geo: THREE.BufferGeometry, hex: number, lx: number, y: number, lz: number, o: PartOpts = {}): this {
    const p = this.at(lx, y, lz);
    this.k.add(geo, hex, p[0], p[1], p[2], { ...o, rot: yawed(this.yaw, o.rot) });
    return this;
  }
}

/**
 * A convex profile (points [u, y] counter-clockwise, u across) extruded `len`
 * along x ('x': u maps to -z) or z ('z': u maps to x), centred. Ends shade darker.
 */
export function prism(profile: Array<[number, number]>, len: number, axis: 'x' | 'z' = 'x', endShade = 0.9): THREE.BufferGeometry {
  const pos: number[] = [];
  const sh: number[] = [];
  const n = profile.length;
  const P = (u: number, y: number, t: number): Vec3 => (axis === 'x' ? [t, y, -u] : [u, y, t]);
  const h = len / 2;
  const tri = (a: Vec3, b: Vec3, c: Vec3, s: number) => {
    pos.push(...a, ...b, ...c);
    sh.push(s, s, s);
  };
  for (let i = 0; i < n; i++) {
    const [u0, y0] = profile[i]!;
    const [u1, y1] = profile[(i + 1) % n]!;
    const a = P(u0, y0, -h), b = P(u1, y1, -h), c = P(u1, y1, h), d = P(u0, y0, h);
    tri(a, b, c, 1);
    tri(a, c, d, 1);
  }
  for (let i = 1; i + 1 < n; i++) {
    const a = profile[0]!, b = profile[i]!, c = profile[i + 1]!;
    tri(P(a[0], a[1], h), P(b[0], b[1], h), P(c[0], c[1], h), endShade);
    tri(P(a[0], a[1], -h), P(c[0], c[1], -h), P(b[0], b[1], -h), endShade);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(sh, 1));
  return g;
}

/** A barn's gambrel roof (two pitches each side) with walled gable ends, ridge along z; eaves at y. */
export function gambrel(k: Kit, w: number, d: number, rise: number, roof: number, wall: number, x: number, y: number, z: number): void {
  const hw = w / 2;
  const pts: Array<[number, number]> = [[-hw, 0], [hw, 0], [hw * 0.6, rise * 0.66], [0, rise], [-hw * 0.6, rise * 0.66]];
  k.add(prism(pts, d, 'z', 0.95), wall, x, y, z, { tex: 'planks', flat: true });
  const ov = 0.07;
  const prof: Array<[number, number]> = [[-hw - ov, -ov * 0.9], [-hw * 0.6, rise * 0.66], [0, rise], [hw * 0.6, rise * 0.66], [hw + ov, -ov * 0.9]];
  for (let i = 0; i + 1 < prof.length; i++) {
    const [u0, y0] = prof[i]!;
    const [u1, y1] = prof[i + 1]!;
    bar(k, [x + u0, y + y0 + 0.025, z], [x + u1, y + y1 + 0.025, z], d + 0.12, 0.04, tint(roof, i === 1 || i === 2 ? 1 : 0.92), { tex: 'tiles' });
  }
}

/**
 * Sawtooth roof over a w x d hall (top at y): `n` teeth along z, each with a
 * glazed upright face toward +z (to the camera) and a sloping panel roof.
 */
export function sawtooth(k: Kit, w: number, d: number, n: number, rise: number, roofHex: number, x: number, y: number, z: number, glass = 0xa9cde0, trim?: number): void {
  const step = d / n;
  for (let i = 0; i < n; i++) {
    const z0 = z - d / 2 + i * step;
    // Sloping roof from the back (low) up to the glazed front (high).
    k.add(prism([[0, 0], [-step, rise], [-step, 0]], w, 'x', 0.8), roofHex, x, y, z0, { tex: 'panels', flat: true });
    k.box(w - 0.06, rise * 0.78, 0.02, glass, x, y + rise * 0.47, z0 + step - 0.012, { glow: 0.45, surface: 'glass', tex: 'glass' });
    const m = Math.round(w / 0.42);
    for (let j = 1; j < m; j++) k.box(0.02, rise * 0.8, 0.03, 0x7a8088, x - w / 2 + j * (w / m), y + rise * 0.47, z0 + step - 0.01, { flat: true });
    if (trim !== undefined) k.box(w + 0.04, 0.035, 0.05, trim, x, y + rise + 0.02, z0 + step, { flat: true });
  }
}

/** A flat roof with a parapet and roof clutter (vents, HVAC boxes), top of walls at y. */
export function flatRoof(k: Kit, w: number, d: number, hex: number, x: number, y: number, z: number, o: { parapet?: number; units?: number; seed?: number; unitHex?: number } = {}): void {
  const p = o.parapet ?? C.concreteLight;
  k.box(w, 0.03, d, hex, x, y + 0.015, z, { tex: 'concrete', flat: true });
  k.box(w + 0.03, 0.07, 0.04, p, x, y + 0.05, z + d / 2, { bevel: 0.01 });
  k.box(w + 0.03, 0.07, 0.04, p, x, y + 0.05, z - d / 2, { bevel: 0.01 });
  k.box(0.04, 0.07, d, p, x + w / 2, y + 0.05, z, { bevel: 0.01 });
  k.box(0.04, 0.07, d, p, x - w / 2, y + 0.05, z, { bevel: 0.01 });
  const r = rng(o.seed ?? 7);
  for (let i = 0; i < (o.units ?? 0); i++) {
    const ux = x + (r() - 0.5) * (w - 0.5);
    const uz = z + (r() - 0.5) * (d - 0.5);
    if (r() < 0.5) {
      k.block(0.26, 0.14, 0.18, o.unitHex ?? C.metal, ux, y + 0.03, uz, { bevel: 0.02, surface: 'metal', tex: 'panels' });
      k.cyl(0.055, 0.055, 0.02, 8, C.metalDark, ux + 0.05, y + 0.18, uz, { surface: 'metal' });
    } else {
      k.cyl(0.04, 0.05, 0.1, 6, C.metal, ux, y + 0.08, uz, { surface: 'metal' });
      k.cone(0.07, 0.05, 6, C.metalDark, ux, y + 0.15, uz, { surface: 'metal' });
    }
  }
}

/** A roller-shutter door on a wall facing +z (or +x with face 'x'), sill at y. */
export function rollerDoor(k: Kit, x: number, y: number, z: number, w: number, h: number, face: 'x' | 'z' = 'z', hex = 0xa8adb2, frame = C.metalDark): void {
  const fx = face === 'x';
  const W = (a: number) => (fx ? 0.025 : a);
  const D = (a: number) => (fx ? a : 0.025);
  k.box(W(w + 0.06), h + 0.04, D(w + 0.06), frame, x, y + h / 2 + 0.01, z, { flat: true });
  k.box(W(w), h, D(w), hex, fx ? x + 0.008 : x, y + h / 2, fx ? z : z + 0.008, { tex: 'panels', surface: 'metal' });
  for (let i = 1; i < 4; i++) k.box(W(w), 0.008, D(w), tint(hex, 0.8), fx ? x + 0.012 : x, y + (h * i) / 4, fx ? z : z + 0.012, { flat: true });
  k.box(W(w + 0.1), 0.06, D(w + 0.1), frame, fx ? x + 0.02 : x, y + h + 0.05, fx ? z : z + 0.02, { flat: true });
}

/** A loading dock on a wall facing +z at z: raised apron, n doors, bumpers, a canopy. */
export function dock(k: Kit, x: number, z: number, w: number, n: number, doorH = 0.34, canopy = C.metal, doorHex = 0xa8adb2): void {
  k.block(w, 0.12, 0.26, C.concrete, x, G, z + 0.13, { tex: 'concrete', bevel: 0.015 });
  const dw = Math.min(0.32, (w / n) * 0.72);
  for (let i = 0; i < n; i++) {
    const dx = x - w / 2 + (w * (i + 0.5)) / n;
    rollerDoor(k, dx, G + 0.12, z, dw, doorH, 'z', doorHex);
    for (const s of [-1, 1]) k.box(0.035, 0.07, 0.03, 0x1e1e1e, dx + s * (dw / 2 + 0.03), G + 0.1, z + 0.27, { flat: true });
    k.box(0.04, 0.03, 0.02, C.hazard, dx + dw / 2 + 0.06, G + doorH + 0.08, z + 0.02, { glow: 0.8 });
  }
  k.box(w + 0.06, 0.03, 0.34, canopy, x, G + doorH + 0.22, z + 0.17, { bevel: 0.01, surface: 'metal' });
  for (const s of [-1, 1]) strut(k, [x + s * (w / 2 - 0.02), G + doorH + 0.2, z + 0.32], [x + s * (w / 2 - 0.02), G + doorH + 0.02, z + 0.02], 0.008, C.metalDark, 4);
}

/** Wall pilasters (thin piers) along a wall facing +z, from x0 to x1. */
export function pilasters(k: Kit, x0: number, x1: number, z: number, y: number, h: number, n: number, hex: number, face: 'z' | 'x' = 'z'): void {
  for (let i = 0; i <= n; i++) {
    const t = x0 + ((x1 - x0) * i) / n;
    if (face === 'z') k.block(0.05, h, 0.04, hex, t, y, z + 0.01, { bevel: 0.01 });
    else k.block(0.04, h, 0.05, hex, z + 0.01, y, t, { bevel: 0.01 });
  }
}

/** A strip of lit windows across a wall facing +z (or +x), with a frame band (for clean modern halls). */
export function ribbon(k: Kit, x: number, y: number, z: number, len: number, h: number, face: 'x' | 'z', hex = C.glass, mullion = C.metalDark, glow = 0.35): void {
  const fx = face === 'x';
  k.box(fx ? 0.02 : len, h, fx ? len : 0.02, hex, x, y, z, { glow, surface: 'glass', tex: 'glass' });
  const n = Math.max(2, Math.round(len / 0.22));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    k.box(fx ? 0.03 : 0.018, h + 0.02, fx ? 0.018 : 0.03, mullion, fx ? x : x + t, y, fx ? z + t : z, { flat: true, surface: 'metal' });
  }
}

/** A conveyor from a to b (belt on a truss frame), with legs down to the ground; `cover` boxes it in. */
export function conveyor(k: Kit, a: Vec3, b: Vec3, w: number, o: { frame?: number; belt?: number; cover?: number; legs?: number; ground?: number } = {}): void {
  const frame = o.frame ?? C.hazard;
  bar(k, a, b, w, 0.05, frame, { surface: 'metal' });
  bar(k, [a[0], a[1] + 0.03, a[2]], [b[0], b[1] + 0.03, b[2]], w * 0.8, 0.02, o.belt ?? 0x2a2a2a);
  if (o.cover !== undefined) bar(k, [a[0], a[1] + 0.09, a[2]], [b[0], b[1] + 0.09, b[2]], w + 0.04, 0.13, o.cover, { tex: 'panels', surface: 'metal', bevel: 0.015 });
  const legs = o.legs ?? Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.6));
  const g = o.ground ?? G;
  for (let i = 1; i <= legs; i++) {
    const t = i / (legs + 1);
    const p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    if (p[1] - g < 0.08) continue;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const L = Math.hypot(dx, dz) || 1;
    const nx = (-dz / L) * (w / 2), nz = (dx / L) * (w / 2);
    for (const s of [-1, 1]) strut(k, [p[0] + s * nx, g, p[2] + s * nz], [p[0] + s * nx, p[1] - 0.02, p[2] + s * nz], 0.012, C.metalDark, 4);
    bar(k, [p[0] - nx, (g + p[1]) / 2, p[2] - nz], [p[0] + nx, (g + p[1]) / 2, p[2] + nz], 0.02, 0.02, C.metalDark);
  }
}

/** A steel lattice tower: four (tapering) legs, rings and X-bracing, base at y0. */
export function lattice(k: Kit, x: number, y0: number, z: number, w: number, d: number, h: number, hex: number, o: { bays?: number; taper?: number; r?: number; noBrace?: Array<'x' | '-x' | 'z' | '-z'> } = {}): void {
  const bays = o.bays ?? Math.max(1, Math.round(h / 0.45));
  const taper = o.taper ?? 0;
  const r = o.r ?? 0.018;
  const corner = (sx: number, sz: number, t: number): Vec3 => [x + sx * (w / 2) * (1 - taper * t), y0 + h * t, z + sz * (d / 2) * (1 - taper * t)];
  const cs: Array<[number, number]> = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [sx, sz] of cs) strut(k, corner(sx, sz, 0), corner(sx, sz, 1), r, hex, 5, { surface: 'metal' });
  const faces: Array<{ f: 'x' | '-x' | 'z' | '-z'; a: [number, number]; b: [number, number] }> = [
    { f: 'z', a: [-1, 1], b: [1, 1] }, { f: 'x', a: [1, 1], b: [1, -1] }, { f: '-z', a: [1, -1], b: [-1, -1] }, { f: '-x', a: [-1, -1], b: [-1, 1] },
  ];
  for (let i = 1; i <= bays; i++) {
    const t0 = (i - 1) / bays;
    const t1 = i / bays;
    for (const fc of faces) {
      bar(k, corner(fc.a[0], fc.a[1], t1), corner(fc.b[0], fc.b[1], t1), r * 1.3, r * 1.3, hex, { surface: 'metal' });
      if (o.noBrace?.includes(fc.f)) continue;
      strut(k, corner(fc.a[0], fc.a[1], t0), corner(fc.b[0], fc.b[1], t1), r * 0.6, hex, 3, { surface: 'metal' });
      strut(k, corner(fc.b[0], fc.b[1], t0), corner(fc.a[0], fc.a[1], t1), r * 0.6, hex, 3, { surface: 'metal' });
    }
  }
}

/** A ladder up a wall facing +z or +x (two rails and rungs). */
export function ladder(k: Kit, x: number, y0: number, y1: number, z: number, face: 'x' | 'z' = 'z', hex = C.metalDark): void {
  const fx = face === 'x';
  for (const s of [-1, 1]) k.box(0.012, y1 - y0, 0.012, hex, fx ? x : x + s * 0.04, (y0 + y1) / 2, fx ? z + s * 0.04 : z, { flat: true });
  for (let y = y0 + 0.07; y < y1; y += 0.18) k.box(fx ? 0.01 : 0.08, 0.01, fx ? 0.08 : 0.01, hex, x, y, z, { flat: true });
}

/** A ring walkway with railing round a vertical cylinder at height y. */
export function gallery(k: Kit, x: number, y: number, z: number, r: number, hex = C.metalDark, seg = 12): void {
  k.cyl(r + 0.07, r + 0.07, 0.02, seg, hex, x, y, z, { surface: 'metal' });
  k.add(new THREE.TorusGeometry(r + 0.07, 0.006, 2, seg), hex, x, y + 0.07, z, { rot: [Math.PI / 2, 0, 0], flat: true, surface: 'metal' });
  for (let i = 1; i < seg; i += 4) {
    const a = (i / seg) * Math.PI * 2;
    k.box(0.008, 0.07, 0.008, hex, x + Math.cos(a) * (r + 0.07), y + 0.035, z + Math.sin(a) * (r + 0.07), { flat: true });
  }
}

/** A painted band round a vertical cylinder (open-ended: no hidden caps). */
export function band(k: Kit, x: number, y: number, z: number, r: number, h: number, seg: number, hex: number, o: PartOpts = {}): void {
  k.add(new THREE.CylinderGeometry(r, r, h, seg, 1, true), hex, x, y, z, { flat: true, surface: 'gloss', ...o });
}

/** A vertical storage tank standing on y0: shell, team band, roof, ladder and top railing. */
export function tank(k: Kit, x: number, z: number, r: number, h: number, hex: number, o: { y0?: number; roof?: 'cone' | 'dome' | 'flat'; band?: number; seg?: number; ladder?: 'x' | 'z'; surface?: 'metal' | 'matte' | 'gloss' } = {}): void {
  const y0 = o.y0 ?? G;
  const seg = o.seg ?? 16;
  k.add(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.05, seg, 1, true), C.concrete, x, y0 + 0.025, z, { tex: 'concrete', flat: true });
  k.cyl(r, r, h, seg, hex, x, y0 + 0.05 + h / 2, z, { surface: o.surface ?? 'gloss', tex: 'panels', bevel: 0.015, edge: 1.15 });
  if (o.band !== undefined) band(k, x, y0 + 0.05 + h * 0.8, z, r + 0.006, Math.min(0.12, h * 0.15), seg, o.band);
  const top = y0 + 0.05 + h;
  if (o.roof === 'dome') k.add(new THREE.SphereGeometry(r, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2.6), tint(hex, 1.05), x, top - r * Math.cos(Math.PI / 2.6), z, { flat: true, surface: o.surface ?? 'gloss' });
  else if (o.roof === 'cone') k.cone(r + 0.01, r * 0.35, seg, tint(hex, 1.05), x, top + r * 0.175, z, { surface: o.surface ?? 'gloss' });
  if (o.ladder) {
    const fx = o.ladder === 'x';
    ladder(k, fx ? x + r + 0.012 : x, y0 + 0.05, top + 0.04, fx ? z : z + r + 0.012, o.ladder);
  }
}

/** A spherical (LPG) tank on legs. */
export function sphereTank(k: Kit, x: number, z: number, r: number, hex = C.white, stripe?: number): void {
  const cy = G + r + 0.16;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    k.add(new THREE.CylinderGeometry(0.016, 0.02, cy - G, 4, 1, true), C.metalDark, x + Math.cos(a) * r * 0.86, G + (cy - G) / 2, z + Math.sin(a) * r * 0.86, { surface: 'metal' });
  }
  k.sphere(r, hex, x, cy, z, 12, { surface: 'gloss' });
  if (stripe !== undefined) band(k, x, cy, z, r + 0.005, 0.05, 12, stripe);
  k.cyl(r * 0.3, r * 0.3, 0.02, 8, C.metalDark, x, cy + r - 0.005, z, { surface: 'metal' });
}

/** A pipe rack: T-frames every ~0.45 and parallel pipes on top, from (x0, z0) to (x1, z1) (axis-aligned). */
export function pipeRack(k: Kit, x0: number, z0: number, x1: number, z1: number, y: number, pipes: number[], frame = C.steelBlue): void {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(2, Math.round(len / 0.6) + 1);
  const wid = 0.08 + pipes.length * 0.055;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const px = x0 + (x1 - x0) * t;
    const pz = z0 + (z1 - z0) * t;
    for (const s of [-1, 1]) k.block(0.03, y - G, 0.03, frame, alongX ? px : px + s * wid / 2, G, alongX ? pz + s * wid / 2 : pz, { flat: true, surface: 'metal' });
    k.box(alongX ? 0.035 : wid + 0.04, 0.035, alongX ? wid + 0.04 : 0.035, frame, px, y, pz, { flat: true, surface: 'metal' });
  }
  pipes.forEach((hex, i) => {
    const off = -wid / 2 + 0.06 + i * 0.055;
    const r = 0.018 + (i % 2) * 0.006;
    if (alongX) k.cylX(r, len, 6, hex, (x0 + x1) / 2, y + 0.018 + r, z0 + off, { surface: 'metal' });
    else k.cylZ(r, len, 6, hex, x0 + off, y + 0.018 + r, (z0 + z1) / 2, { surface: 'metal' });
  });
}

/** A pipe run through points (elbows at each), on the given radius. */
export function pipe(k: Kit, pts: Vec3[], r: number, hex: number): void {
  for (let i = 0; i + 1 < pts.length; i++) strut(k, pts[i]!, pts[i + 1]!, r, hex, 6, { surface: 'metal' });
  for (let i = 1; i + 1 < pts.length; i++) k.sphere(r * 1.15, hex, pts[i]![0], pts[i]![1], pts[i]![2], 6, { surface: 'metal' });
}

/** A heap of loose material (ore, gravel, sawdust, coal): a faceted cone plus lumps. */
export function heap(k: Kit, x: number, z: number, r: number, h: number, hex: number, seed = 1, o: PartOpts = {}): void {
  const g = new THREE.ConeGeometry(r, h, 9, 2);
  const p = g.getAttribute('position');
  const rr = rng(seed);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > -h / 2 + 1e-3 && y < h / 2 - 1e-3) {
      const f = 1 + 0.12 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 3 + seed);
      p.setX(i, p.getX(i) * f);
      p.setZ(i, p.getZ(i) * f);
    }
  }
  k.add(g, hex, x, G + h / 2, z, { flat: true, ...o });
  for (let i = 0; i < 5; i++) {
    const a = rr() * Math.PI * 2;
    const d = r * (0.75 + rr() * 0.3);
    k.add(new THREE.IcosahedronGeometry(0.035 + rr() * 0.03, 0), tint(hex, 0.85 + rr() * 0.3), x + Math.cos(a) * d, G + 0.03, z + Math.sin(a) * d, { flat: true, rot: [rr(), rr(), rr()], ...o });
  }
}

/** A run of rail track along x (or z): sleepers and two rails. */
export function track(k: Kit, x: number, z: number, len: number, alongX = true, y = G): void {
  const n = Math.max(2, Math.round(len / 0.12));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (len * (i + 0.5)) / n;
    k.box(alongX ? 0.05 : 0.22, 0.02, alongX ? 0.22 : 0.05, C.timberDark, alongX ? x + t : x, y + 0.01, alongX ? z : z + t, { flat: true, tex: 'planks' });
  }
  for (const s of [-1, 1]) k.box(alongX ? len : 0.018, 0.022, alongX ? 0.018 : len, C.metal, alongX ? x : x + s * 0.075, y + 0.03, alongX ? z + s * 0.075 : z, { flat: true, surface: 'metal' });
}

/** A floodlight mast: pole, head with lit lamps (bright at night). */
export function floodlight(k: Kit, x: number, z: number, h = 1.3, yaw = 0): void {
  k.cyl(0.014, 0.022, h, 5, C.metalDark, x, G + h / 2, z, { surface: 'metal' });
  const f = new Frame(k, x, z, yaw);
  f.box(0.16, 0.025, 0.03, C.metalDark, 0, G + h, 0, { surface: 'metal' });
  for (const s of [-1, 1]) f.box(0.05, 0.04, 0.03, 0xfff1c8, s * 0.05, G + h + 0.03, 0.015, { glow: 1 });
}

/** A sign board on two posts (face +z), with a team-colour panel and a lit strip. */
export function sign(k: Kit, x: number, z: number, w: number, hex: number, h = 0.45, yaw = 0): void {
  const f = new Frame(k, x, z, yaw);
  for (const s of [-1, 1]) f.block(0.025, h, 0.025, C.metalDark, s * (w / 2 - 0.03), G, 0, { surface: 'metal' });
  f.block(w, 0.16, 0.03, hex, 0, G + h - 0.04, 0, { bevel: 0.01, surface: 'gloss' });
  f.box(w * 0.7, 0.03, 0.01, C.white, 0, G + h + 0.04, 0.018, { glow: 0.6 });
}

/** A chain-link fence along x or z (posts and two wires). */
export function wireFence(k: Kit, x: number, z: number, len: number, alongX = true, h = 0.2, hex = C.metal): void {
  const n = Math.max(2, Math.round(len / 0.3));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    k.block(0.018, h, 0.018, hex, alongX ? x + t : x, G, alongX ? z : z + t, { flat: true, surface: 'metal' });
  }
  for (const y of [h * 0.45, h * 0.95]) k.box(alongX ? len : 0.008, 0.008, alongX ? 0.008 : len, hex, x, G + y, z, { flat: true });
}

/** A pallet stack of sawn lumber with sticker spacers. */
export function lumber(k: Kit, x: number, z: number, w: number, d: number, layers: number, alongX = true, hex = 0xd4a868): void {
  for (let i = 0; i < layers; i++) {
    const y = G + 0.03 + i * 0.065;
    k.box(alongX ? w : d, 0.05, alongX ? d : w, tint(hex, 0.92 + (i % 2) * 0.1), x, y + 0.025, z, { tex: 'planks', bevel: 0.006, edge: 1.15 });
    for (const t of [-0.4, 0, 0.4]) k.box(alongX ? 0.03 : d + 0.02, 0.015, alongX ? d + 0.02 : 0.03, C.timberDark, alongX ? x + t * w : x, y + 0.057, alongX ? z : z + t * w, { flat: true });
  }
  k.box(alongX ? w * 0.9 : d, 0.03, alongX ? d : w * 0.9, C.timberDark, x, G + 0.015, z, { flat: true });
}

/** A pyramid pile of logs along x (or z) with pale cut ends. */
export function logPile(k: Kit, x: number, z: number, len: number, rows: number, r = 0.075, alongX = true, seed = 3): void {
  const rr = rng(seed);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < rows - i; j++) {
      const off = (j - (rows - i - 1) / 2) * r * 2.05;
      const y = G + r + i * r * 1.75;
      const l = len * (0.9 + rr() * 0.15);
      const bark = tint(0x7a5232, 0.85 + rr() * 0.3);
      if (alongX) {
        k.cylX(r, l, 7, bark, x + (rr() - 0.5) * 0.06, y, z + off, { tex: 'planks' });
        for (const s of [-1, 1]) k.cylX(r * 0.86, 0.012, 7, 0xd9b27a, x + s * l / 2, y, z + off);
      } else {
        k.cylZ(r, l, 7, bark, x + off, y, z + (rr() - 0.5) * 0.06, { tex: 'planks' });
        for (const s of [-1, 1]) k.cylZ(r * 0.86, 0.012, 7, 0xd9b27a, x + off, y, z + s * l / 2);
      }
    }
  }
}

/** A row of steel drums (hazard bands optional). */
export function drums(k: Kit, x: number, z: number, n: number, hex: number, band?: number, alongX = true): void {
  for (let i = 0; i < n; i++) {
    const dx = alongX ? x + i * 0.1 : x;
    const dz = alongX ? z : z + i * 0.1;
    k.cyl(0.042, 0.042, 0.12, 8, hex, dx, G + 0.06, dz, { surface: 'gloss', bevel: 0.008 });
    if (band !== undefined) k.cyl(0.044, 0.044, 0.025, 8, band, dx, G + 0.075, dz, { flat: true });
  }
}

// ---------------------------------------------------------------------------
// Vehicles: built along local +x (the nose), centred on their footprint.

export type TruckKind = 'box' | 'tipper' | 'tanker' | 'flatbed' | 'mixer' | 'reefer' | 'logs';

/** A lorry: cab with windscreen and lights, chassis, wheels and a body. */
export function truck(k: Kit, x: number, z: number, yaw: number, cab: number, kind: TruckKind = 'box', body = C.white, s = 1): void {
  const f = new Frame(k, x, z, yaw);
  const L = 0.72 * s;
  const W = 0.2 * s;
  // Chassis and wheels.
  f.box(L, 0.04 * s, W * 0.8, 0x2a2c2f, 0, G + 0.07 * s, 0);
  for (const lx of [L / 2 - 0.1 * s, -L / 2 + 0.12 * s, -L / 2 + 0.22 * s]) for (const sz of [-1, 1]) f.wheel(0.05 * s, 0.035 * s, lx, sz * (W / 2 - 0.015 * s));
  // Cab.
  const cx = L / 2 - 0.09 * s;
  f.block(0.16 * s, 0.17 * s, W, cab, cx, G + 0.08 * s, 0, { bevel: 0.025 * s, surface: 'gloss' });
  f.box(0.012, 0.07 * s, W * 0.82, C.glassDark, cx + 0.081 * s, G + 0.2 * s, 0, { surface: 'glass' });
  for (const sz of [-1, 1]) f.box(0.01, 0.025 * s, 0.03 * s, 0xfff4d0, cx + 0.081 * s, G + 0.11 * s, sz * W * 0.36, { glow: 0.9 });
  f.box(0.1 * s, 0.03 * s, W * 0.7, tint(cab, 0.8), cx - 0.02 * s, G + 0.265 * s, 0, { bevel: 0.01 });
  // Body.
  const bl = L - 0.2 * s;
  const bx = -L / 2 + bl / 2;
  if (kind === 'box' || kind === 'reefer') {
    f.block(bl, 0.24 * s, W + 0.01, body, bx, G + 0.09 * s, 0, { bevel: 0.015 * s, tex: 'panels' });
    f.box(bl * 0.8, 0.07 * s, 0.006, cab, bx, G + 0.24 * s, W / 2 + 0.006, { flat: true });
    if (kind === 'reefer') f.block(0.04 * s, 0.12 * s, W * 0.8, C.metal, bx + bl / 2 + 0.02 * s, G + 0.2 * s, 0, { surface: 'metal' });
  } else if (kind === 'tipper') {
    f.block(bl, 0.03 * s, W, tint(body, 0.7), bx, G + 0.09 * s, 0);
    f.box(bl, 0.12 * s, W, body, bx, G + 0.18 * s, 0, { taper: -0.08, bevel: 0.01 });
    f.box(bl * 0.9, 0.02, W * 0.8, 0x6a6058, bx, G + 0.235 * s, 0, { flat: true });
  } else if (kind === 'tanker') {
    f.tube(0.1 * s, bl, 12, body, bx, G + 0.2 * s, 0, 'x', { surface: 'gloss' });
    f.tube(0.103 * s, 0.03, 12, cab, bx, G + 0.2 * s, 0, 'x');
    f.box(bl * 0.8, 0.012, 0.04, C.metalDark, bx, G + 0.305 * s, 0, { flat: true });
  } else if (kind === 'mixer') {
    f.add(new THREE.CylinderGeometry(0.06 * s, 0.11 * s, bl * 0.9, 10), body, bx + 0.02 * s, G + 0.22 * s, 0, { rot: [0, 0, Math.PI / 2 + 0.25], flat: true, surface: 'gloss' });
    f.add(new THREE.CylinderGeometry(0.111 * s, 0.111 * s, 0.03, 10), cab, bx - 0.04 * s, G + 0.205 * s, 0, { rot: [0, 0, Math.PI / 2 + 0.25], flat: true });
  } else if (kind === 'flatbed' || kind === 'logs') {
    f.block(bl, 0.03 * s, W + 0.02, C.timber, bx, G + 0.09 * s, 0, { tex: 'planks' });
    if (kind === 'logs') {
      for (const lz of [-0.055, 0, 0.055]) f.tube(0.035 * s, bl * 0.95, 6, 0x7a5232, bx, G + 0.155 * s, lz * s, 'x', { tex: 'planks' });
      for (const lz of [-0.028, 0.028]) f.tube(0.035 * s, bl * 0.9, 6, 0x6a4a2a, bx, G + 0.215 * s, lz * s, 'x', { tex: 'planks' });
      for (const lx of [-bl / 3, bl / 3]) for (const sz of [-1, 1]) f.box(0.015, 0.13 * s, 0.015, C.metalDark, bx + lx, G + 0.18 * s, sz * W * 0.55);
    } else {
      f.block(bl * 0.4, 0.1 * s, W * 0.8, 0x9a7a4a, bx - bl * 0.22, G + 0.12 * s, 0, { tex: 'planks', bevel: 0.01 });
      f.block(bl * 0.4, 0.1 * s, W * 0.8, 0x9a7a4a, bx + bl * 0.24, G + 0.12 * s, 0, { tex: 'planks', bevel: 0.01 });
    }
  }
}

/** A farm tractor (big rear wheels, cab, exhaust stack), optionally towing a trailer. */
export function tractor(k: Kit, x: number, z: number, yaw: number, hex = 0x3f8f3a, trailer = false): void {
  const f = new Frame(k, x, z, yaw);
  f.block(0.22, 0.08, 0.1, hex, 0.06, G + 0.07, 0, { bevel: 0.02, surface: 'gloss' });
  f.block(0.1, 0.05, 0.11, tint(hex, 0.85), 0.12, G + 0.15, 0, { bevel: 0.015 });
  for (const sz of [-1, 1]) {
    f.wheel(0.08, 0.05, -0.06, sz * 0.085);
    f.wheel(0.045, 0.035, 0.14, sz * 0.07);
  }
  // Cab: four posts, glazing, a roof.
  for (const lx of [-0.1, -0.0]) for (const sz of [-1, 1]) f.box(0.012, 0.14, 0.012, C.metalDark, lx, G + 0.22, sz * 0.055);
  f.box(0.1, 0.11, 0.1, 0xb8d8e8, -0.05, G + 0.21, 0, { surface: 'glass', glow: 0.1 });
  f.block(0.14, 0.02, 0.14, hex, -0.05, G + 0.29, 0, { bevel: 0.008, surface: 'gloss' });
  f.cyl(0.008, 0.008, 0.1, 4, C.metalDark, 0.12, G + 0.24, 0.03);
  f.box(0.01, 0.02, 0.06, 0xfff4d0, 0.172, G + 0.12, 0, { glow: 0.8 });
  if (trailer) {
    f.box(0.1, 0.01, 0.01, C.metalDark, -0.2, G + 0.08, 0);
    f.block(0.34, 0.03, 0.2, 0xa04030, -0.42, G + 0.08, 0, { tex: 'planks' });
    for (const sz of [-1, 1]) {
      f.block(0.34, 0.08, 0.015, 0xa04030, -0.42, G + 0.11, sz * 0.1, { tex: 'planks' });
      f.wheel(0.05, 0.03, -0.42, sz * 0.115);
    }
    f.box(0.32, 0.05, 0.18, 0xd8b850, -0.42, G + 0.15, 0, { taper: 0.2, bevel: 0.02 });
  }
}

/** A forklift (with a pallet on its forks). */
export function forklift(k: Kit, x: number, z: number, yaw: number, hex = C.hazard): void {
  const f = new Frame(k, x, z, yaw);
  f.block(0.16, 0.08, 0.11, hex, 0, G + 0.04, 0, { bevel: 0.015, surface: 'gloss' });
  for (const lx of [-0.05, 0.05]) for (const sz of [-1, 1]) f.wheel(0.03, 0.025, lx, sz * 0.055);
  for (const sz of [-1, 1]) f.box(0.01, 0.16, 0.01, C.metalDark, -0.06 + 0.12, G + 0.2, sz * 0.045);
  f.box(0.08, 0.008, 0.1, C.metalDark, -0.02, G + 0.27, 0);
  for (const lx of [-0.06, 0.02]) for (const sz of [-1, 1]) f.box(0.008, 0.15, 0.008, C.metalDark, lx, G + 0.195, sz * 0.045);
  f.box(0.02, 0.2, 0.1, C.metalDark, 0.085, G + 0.14, 0, { surface: 'metal' });
  f.box(0.12, 0.012, 0.09, C.metalDark, 0.15, G + 0.04, 0);
  f.block(0.12, 0.08, 0.12, 0x9a7a4a, 0.155, G + 0.046, 0, { tex: 'planks', bevel: 0.01 });
}

/** A tracked excavator: tracks, cab body (turned by `swing`), boom, arm and bucket. */
export function excavator(k: Kit, x: number, z: number, yaw: number, y = G, hex = C.hazard, swing = 0.6): void {
  const f = new Frame(k, x, z, yaw, y - G);
  for (const sz of [-1, 1]) f.block(0.34, 0.07, 0.08, 0x2a2a2a, 0, G, sz * 0.1, { bevel: 0.025, edge: 1.6 });
  const o = f.at(0, 0, 0);
  const u = new Frame(k, o[0], o[2], yaw + swing, y - G);
  u.block(0.26, 0.1, 0.22, hex, -0.03, G + 0.08, 0, { bevel: 0.025, surface: 'gloss' });
  u.block(0.1, 0.12, 0.1, hex, 0.05, G + 0.18, 0.055, { bevel: 0.02, surface: 'gloss' });
  u.box(0.012, 0.07, 0.08, C.glassDark, 0.101, G + 0.25, 0.055, { surface: 'glass' });
  u.block(0.08, 0.06, 0.2, 0x3a3a3a, -0.13, G + 0.15, 0, { bevel: 0.015 });
  // Boom up and out, the arm down to the bucket.
  const a = u.at(0.06, G + 0.16, -0.04);
  const b = u.at(0.32, G + 0.42, -0.04);
  const c = u.at(0.46, G + 0.12, -0.04);
  bar(k, a, b, 0.05, 0.05, hex, { surface: 'gloss' });
  bar(k, b, c, 0.035, 0.035, hex, { surface: 'gloss' });
  const bk = u.at(0.47, G + 0.06, -0.04);
  k.box(0.08, 0.07, 0.09, 0x3a3a3a, bk[0], bk[1], bk[2], { rot: [0, yaw + swing, -0.5], bevel: 0.01 });
}

/** A fishing boat (hull along local x, bow at +x), with wheelhouse, mast and nets. */
export function fishingBoat(k: Kit, x: number, z: number, yaw: number, hull: number, y = 0.02, len = 0.95): void {
  const f = new Frame(k, x, z, yaw, y);
  const L = len;
  const B = len * 0.32;
  // Hull: flared sides, a pointed bow (wedge), a dark boot-topping band.
  f.box(L * 0.78, 0.13, B, hull, -L * 0.11, 0.065, 0, { taper: -0.1, bevel: 0.015, surface: 'gloss' });
  f.add(bow(L * 0.24, B * 1.1, 0.13), hull, L * 0.28, 0, 0, { surface: 'gloss' });
  f.box(L * 0.78, 0.025, B * 1.02, 0x2a2a30, -L * 0.11, 0.012, 0, { flat: true });
  f.box(L * 0.95, 0.015, B * 1.06, C.white, 0.0, 0.135, 0, { flat: true });
  // Deck, wheelhouse with windows, mast, boom, nets.
  f.box(L * 0.75, 0.01, B * 0.9, C.timber, -L * 0.1, 0.13, 0, { tex: 'planks', flat: true });
  f.block(0.2, 0.13, B * 0.68, C.white, 0.08, 0.14, 0, { bevel: 0.015 });
  f.block(0.23, 0.025, B * 0.76, tint(hull, 0.8), 0.08, 0.27, 0, { bevel: 0.01 });
  f.box(0.01, 0.04, B * 0.5, C.window, 0.181, 0.23, 0, { glow: 0.6, surface: 'glass' });
  for (const sz of [-1, 1]) f.box(0.12, 0.035, 0.01, C.window, 0.08, 0.23, sz * B * 0.34, { glow: 0.5, surface: 'glass' });
  const mast = f.at(-0.06, 0, 0);
  k.cyl(0.01, 0.012, 0.6, 5, C.metalDark, mast[0], y + 0.14 + 0.3, mast[2], { surface: 'metal' });
  strut(k, f.at(-0.06, 0.62, 0), f.at(-0.4, 0.2, 0), 0.007, C.metalDark, 4);
  strut(k, f.at(-0.06, 0.66, 0), f.at(0.4, 0.15, 0), 0.003, 0x222222, 3);
  strut(k, f.at(-0.06, 0.66, 0), f.at(-0.42, 0.15, 0), 0.003, 0x222222, 3);
  f.box(0.02, 0.02, 0.02, 0xff5a3a, -0.06, 0.75, 0, { glow: 1 });
  f.block(0.18, 0.05, B * 0.6, 0x3f6f5a, -0.3, 0.14, 0, { bevel: 0.025 });
  f.block(0.05, 0.04, 0.05, 0xe06a30, -0.18, 0.14, B * 0.3, { bevel: 0.01 });
  f.block(0.05, 0.04, 0.05, 0xe06a30, -0.12, 0.14, -B * 0.3, { bevel: 0.01 });
}

/** A boat's bow wedge (pointing +x), height h, beam b, length l, base at y = 0. */
function bow(l: number, b: number, h: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const hb = b / 2;
  const P: Record<string, Vec3> = {
    bl: [0, 0, hb * 0.9], br: [0, 0, -hb * 0.9], tl: [0, h, hb], tr: [0, h, -hb],
    tip: [l, h + 0.03, 0], keel: [l * 0.75, 0, 0],
  };
  const tri = (a: string, b2: string, c: string) => pos.push(...P[a]!, ...P[b2]!, ...P[c]!);
  tri('bl', 'keel', 'tip'); tri('bl', 'tip', 'tl');
  tri('br', 'tip', 'keel'); tri('br', 'tr', 'tip');
  tri('tl', 'tip', 'tr');
  tri('bl', 'br', 'keel');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** A parked car seen from above (yaw any). */
export function carAt(k: Kit, x: number, z: number, yaw: number, hex: number): void {
  const f = new Frame(k, x, z, yaw);
  f.block(0.32, 0.07, 0.16, hex, 0, G + 0.03, 0, { bevel: 0.02, surface: 'gloss' });
  f.block(0.17, 0.06, 0.14, C.glassDark, -0.02, G + 0.1, 0, { bevel: 0.02, surface: 'glass' });
  for (const lx of [-0.1, 0.1]) for (const sz of [-1, 1]) f.tube(0.03, 0.02, 6, 0x222222, lx, G + 0.03, sz * 0.075, 'z');
}

/** Car park markings: white bays in a row along x. */
export function parking(k: Kit, x: number, z: number, n: number, depth = 0.38, gap = 0.22): void {
  k.box(n * gap + 0.04, 0.012, depth, C.asphalt, x, G + 0.006, z, { tex: 'concrete', flat: true });
  for (let i = 0; i <= n; i++) k.box(0.012, 0.014, depth * 0.8, C.white, x - (n * gap) / 2 + i * gap, G + 0.008, z, { flat: true });
}

/** A modern robot arm (base, two links, a tool head) rotating as a 'spin' part. */
export function robotArm(k: Kit, x: number, y: number, z: number, hex = 0xf0a020, s = 1): void {
  const a = k.part('spin', [x, y, z]);
  a.cyl(0.09 * s, 0.11 * s, 0.07 * s, 10, C.metalDark, 0, 0.035 * s, 0, { surface: 'metal', bevel: 0.01 });
  a.cyl(0.07 * s, 0.08 * s, 0.08 * s, 10, hex, 0, 0.11 * s, 0, { surface: 'gloss', bevel: 0.01 });
  bar(a, [0, 0.14 * s, 0], [0.12 * s, 0.42 * s, 0], 0.07 * s, 0.07 * s, hex, { surface: 'gloss', bevel: 0.015 });
  a.sphere(0.045 * s, C.metalDark, 0.12 * s, 0.42 * s, 0, 8, { surface: 'metal' });
  bar(a, [0.12 * s, 0.42 * s, 0], [0.36 * s, 0.34 * s, 0], 0.05 * s, 0.05 * s, hex, { surface: 'gloss', bevel: 0.012 });
  a.box(0.06 * s, 0.05 * s, 0.05 * s, C.metalDark, 0.39 * s, 0.31 * s, 0, { surface: 'metal' });
  a.box(0.02 * s, 0.02 * s, 0.02 * s, 0x7fe0ff, 0.41 * s, 0.28 * s, 0, { glow: 1 });
}

/**
 * Turn a spinning part (built lying flat, axis y, pivot at `at`) so it spins
 * about a horizontal world axis: the renderer turns 'spin' parts about their y.
 */
export function tilt(g: THREE.Object3D, at: Vec3, axis: 'x' | 'z'): void {
  g.traverse((o) => {
    if (o.name !== 'spin' || o.position.distanceTo(new THREE.Vector3(...at)) > 1e-4) return;
    if (axis === 'z') o.rotation.x = Math.PI / 2;
    else {
      o.rotation.order = 'ZYX';
      o.rotation.z = Math.PI / 2;
    }
  });
}

