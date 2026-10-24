// Shared assemblies for the kit-built infrastructure models (infra.ts): lattice
// towers and trusses, pylons, tanks, cooling towers, containers, vehicles,
// fences, lights and the high-tech palette of the late ages.

import * as THREE from 'three';
import type { BlockOpts, Kit, PartOpts, Vec3 } from '../kit.ts';
import { C, tint } from './common.ts';

/** The team colour and two shades of it. */
export interface Team {
  main: number;
  dark: number;
  light: number;
}

export function teamOf(hex: number): Team {
  return { main: hex, dark: tint(hex, 0.62), light: mixHex(hex, 0xffffff, 0.45) };
}

/** Blend two colours (t = 0: a, 1: b). */
export function mixHex(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

/** Late-age palette: white composite panels, dark trim, glass and light. */
export const HT = {
  panel: 0xe8ecef,
  panelShade: 0xc8d0d8,
  trim: 0x2c333b,
  steel: 0xa9b3bc,
  glass: 0x5f8fb0,
  cyan: 0x7ff4ff,
  amber: 0xffb347,
  red: 0xff3b2e,
};

export const AMBER = 0xffb347;
export const RED_LIGHT = 0xff3b2e;
export const OLIVE = 0x5d6a3c;
export const SAND = 0xc8b07a;

/** A small glowing light (lamp, beacon, signal). */
export function light(k: Kit, x: number, y: number, z: number, s = 0.04, hex = AMBER): void {
  k.box(s, s * 0.8, s, hex, x, y, z, { glow: 1 });
}

const UP = new THREE.Vector3(0, 1, 0);

/** Euler rotation that turns +y onto the direction a → b. */
function aim(a: Vec3, b: Vec3): { len: number; rot: Vec3; mid: Vec3 } {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  return { len, rot: [e.x, e.y, e.z], mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] };
}

/** A round strut from a to b. */
export function strut(k: Kit, a: Vec3, b: Vec3, r: number, hex: number, seg = 5, o: PartOpts = {}): void {
  const { len, rot, mid } = aim(a, b);
  if (len < 1e-4) return;
  k.add(new THREE.CylinderGeometry(r, r, len, seg, 1, true), hex, mid[0], mid[1], mid[2], { flat: true, ...o, rot });
}

/** A square-section beam from a to b (girders, lattice members). */
export function beam(k: Kit, a: Vec3, b: Vec3, w: number, hex: number, o: PartOpts = {}): void {
  const { len, rot, mid } = aim(a, b);
  if (len < 1e-4) return;
  k.add(new THREE.BoxGeometry(w, len, w), hex, mid[0], mid[1], mid[2], { flat: true, ...o, rot });
}

/**
 * A four-legged lattice tower standing on y0 at (x, z): base width w, top width t,
 * height h, `bays` cross-braced panels.
 */
export function lattice(k: Kit, x: number, z: number, w: number, t: number, h: number, hex: number, o: { y0?: number; bays?: number; m?: number; d?: number; td?: number } = {}): void {
  const y0 = o.y0 ?? 0;
  const bays = o.bays ?? Math.max(2, Math.round(h / (w * 1.1)));
  const m = o.m ?? 0.025;
  const wd = o.d ?? w;
  const td = o.td ?? t;
  const at = (f: number, sx: number, sz: number): Vec3 => [x + sx * ((w + (t - w) * f) / 2), y0 + f * h, z + sz * ((wd + (td - wd) * f) / 2)];
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) beam(k, at(0, sx, sz), at(1, sx, sz), m * 1.4, hex, { surface: 'metal' });
  for (let i = 0; i < bays; i++) {
    const f0 = i / bays;
    const f1 = (i + 1) / bays;
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c]!;
      const [bx, bz] = corners[(c + 1) % 4]!;
      beam(k, at(f0, ax, az), at(f1, bx, bz), m, hex, { surface: 'metal' });
      beam(k, at(f0, bx, bz), at(f1, ax, az), m, hex, { surface: 'metal' });
      beam(k, at(f1, ax, az), at(f1, bx, bz), m, hex, { surface: 'metal' });
    }
  }
}

/** A horizontal box truss along x from x0 to x1: depth d (z), height h, at (y, z) its centre line. */
export function trussX(k: Kit, x0: number, x1: number, y: number, z: number, d: number, h: number, hex: number, bays = 6, m = 0.022): void {
  const yb = y - h / 2;
  const yt = y + h / 2;
  for (const sz of [-1, 1]) {
    const zz = z + (sz * d) / 2;
    beam(k, [x0, yb, zz], [x1, yb, zz], m * 1.4, hex, { surface: 'metal' });
    beam(k, [x0, yt, zz], [x1, yt, zz], m * 1.4, hex, { surface: 'metal' });
    for (let i = 0; i < bays; i++) {
      const xa = x0 + ((x1 - x0) * i) / bays;
      const xb = x0 + ((x1 - x0) * (i + 1)) / bays;
      beam(k, [xa, i % 2 ? yt : yb, zz], [xb, i % 2 ? yb : yt, zz], m, hex, { surface: 'metal' });
      beam(k, [xa, yb, zz], [xa, yt, zz], m, hex, { surface: 'metal' });
    }
  }
  for (let i = 0; i <= bays; i += 2) {
    const xa = x0 + ((x1 - x0) * i) / bays;
    beam(k, [xa, yt, z - d / 2], [xa, yt, z + d / 2], m, hex, { surface: 'metal' });
  }
}

/** A ladder up a wall or a leg: two rails and rungs, on a plane facing +z (or +x with `alongX` false). */
export function ladder(k: Kit, x: number, y0: number, y1: number, z: number, hex = C.metalDark, faceX = false): void {
  const w = 0.07;
  for (const s of [-1, 1]) k.box(faceX ? 0.012 : 0.012, y1 - y0, 0.012, hex, faceX ? x : x + (s * w) / 2, (y0 + y1) / 2, faceX ? z + (s * w) / 2 : z, { flat: true, surface: 'metal' });
  const n = Math.max(2, Math.round((y1 - y0) / 0.08));
  for (let i = 1; i < n; i++) k.box(faceX ? 0.01 : w, 0.01, faceX ? w : 0.01, hex, x, y0 + ((y1 - y0) * i) / n, z, { flat: true });
}

/** A railing along x (or z) at height y: posts and a top rail. */
export function railing(k: Kit, x: number, y: number, z: number, len: number, alongX = true, hex = C.hazard, h = 0.08): void {
  const n = Math.max(1, Math.round(len / 0.2));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    k.box(0.012, h, 0.012, hex, alongX ? x + t : x, y + h / 2, alongX ? z : z + t, { flat: true });
  }
  k.box(alongX ? len : 0.014, 0.014, alongX ? 0.014 : len, hex, x, y + h, z, { flat: true });
}

/** A circular railing (catwalk round a tank). */
export function ringRail(k: Kit, x: number, y: number, z: number, r: number, hex = C.metalDark, n = 12, h = 0.07): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    k.box(0.012, h, 0.012, hex, x + Math.cos(a) * r, y + h / 2, z + Math.sin(a) * r, { flat: true });
  }
  k.add(new THREE.TorusGeometry(r, 0.008, 3, n * 2), hex, x, y + h, z, { rot: [Math.PI / 2, 0, 0], flat: true });
}

/** A ring (torus) lying flat. */
export function ring(k: Kit, x: number, y: number, z: number, r: number, tube: number, hex: number, seg = 24, o: PartOpts = {}): void {
  k.add(new THREE.TorusGeometry(r, tube, 4, seg), hex, x, y, z, { flat: true, ...o, rot: o.rot ?? [Math.PI / 2, 0, 0] });
}

/** A vertical storage tank standing on y0: shell, dome roof, a coloured band, a ladder and a railing. */
export function tank(k: Kit, x: number, z: number, r: number, h: number, hex: number, band: number, y0 = 0.11, seg = 14): void {
  k.cyl(r * 1.04, r * 1.08, 0.05, seg, C.concrete, x, y0 + 0.025, z, { tex: 'concrete' });
  k.cyl(r, r, h, seg, hex, x, y0 + 0.05 + h / 2, z, { tex: 'panels', surface: 'metal', bevel: 0.015 });
  k.cyl(r * 1.01, r * 1.01, h * 0.12, seg, band, x, y0 + 0.05 + h * 0.72, z, { flat: true });
  k.add(new THREE.SphereGeometry(r, seg, 3, 0, Math.PI * 2, 0, 0.55), tint(hex, 1.05), x, y0 + 0.05 + h - r * Math.cos(0.55), z, { flat: true, surface: 'metal' });
  ladder(k, x, y0 + 0.08, y0 + 0.05 + h, z + r + 0.015);
  ringRail(k, x, y0 + 0.05 + h + r * 0.15, z, r * 0.6, C.metalDark, 10);
}

/** A spherical tank (LNG, cryogenics) on legs. */
export function sphereTank(k: Kit, x: number, z: number, r: number, hex: number, y0 = 0.11, legHex = C.metalDark): void {
  const cy = y0 + r * 1.25;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.cyl(0.02, 0.025, r * 1.25, 5, legHex, x + Math.cos(a) * r * 0.8, y0 + r * 0.62, z + Math.sin(a) * r * 0.8, { surface: 'metal' });
  }
  k.sphere(r, hex, x, cy, z, 14, { surface: 'gloss', flat: false });
  k.add(new THREE.TorusGeometry(r * 1.0, 0.012, 3, 20), tint(hex, 0.8), x, cy, z, { rot: [Math.PI / 2, 0, 0], flat: true });
  strut(k, [x + r * 0.9, y0, z], [x + r * 0.2, cy + r * 0.98, z], 0.008, legHex, 4);
}

/** The radius profile of a hyperboloid cooling tower (t = 0 base .. 1 rim). */
function coolProfile(r: number, t: number): number {
  const throat = 0.72;
  const k = t < throat ? (throat - t) / throat : (t - throat) / (1 - throat);
  return r * (0.62 + (t < throat ? 0.38 : 0.16) * k * k);
}

/** A hyperboloid cooling tower standing on y0, with legs, a rim, an inside, and a 'smoke' anchor. */
export function coolingTower(k: Kit, x: number, z: number, r: number, h: number, y0 = 0.11, hex = 0xd9d5cb, seg = 20): void {
  const pts: THREE.Vector2[] = [];
  const n = 9;
  const lift = h * 0.06;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector2(coolProfile(r, t), lift + t * (h - lift)));
  }
  // Outside (faces out), inside (mirrored, faces in, darker).
  const out = new THREE.LatheGeometry(pts, seg);
  k.add(out, hex, x, y0, z, { tex: 'concrete', flat: true });
  const inner = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x * 0.97, p.y)), seg);
  inner.scale(-1, 1, 1);
  k.add(inner, tint(hex, 0.55), x, y0, z, { flat: true });
  // Weather staining bands and the rim.
  k.add(new THREE.TorusGeometry(coolProfile(r, 1) * 0.985, 0.03, 3, seg), tint(hex, 0.8), x, y0 + h, z, { rot: [Math.PI / 2, 0, 0], flat: true });
  k.add(new THREE.CylinderGeometry(coolProfile(r, 0.9) * 1.005, coolProfile(r, 0.82) * 1.005, h * 0.08, seg, 1, true), tint(hex, 0.86), x, y0 + lift + 0.86 * (h - lift), z, { flat: true });
  // The open base: a ring of raking legs on a footing, the dark gap under the shell.
  k.cyl(r * 1.04, r * 1.07, 0.04, seg, C.concrete, x, y0 + 0.02, z, { tex: 'concrete' });
  k.cyl(r * 0.95, r * 0.95, lift, seg, 0x23262a, x, y0 + lift / 2, z, { flat: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = a + Math.PI / 16;
    strut(k, [x + Math.cos(a) * r, y0, z + Math.sin(a) * r], [x + Math.cos(b) * r * 0.99, y0 + lift + 0.01, z + Math.sin(b) * r * 0.99], 0.018, tint(hex, 0.9), 4);
  }
  k.anchor('smoke', x, y0 + h + 0.05, z);
}

/** An electricity pylon: a tapered lattice with cross-arms and hanging insulators. */
export function pylon(k: Kit, x: number, z: number, h: number, rotY = 0, hex = 0x7d858c, y0 = 0.11): void {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  lattice(k, x, z, 0.22, 0.06, h, hex, { y0, bays: 4, m: 0.014 });
  for (const [f, span] of [[0.78, 0.5], [0.95, 0.34]] as const) {
    const y = y0 + h * f;
    k.box(span * Math.abs(c) + 0.03 * Math.abs(s), 0.025, span * Math.abs(s) + 0.03 * Math.abs(c), hex, x, y, z, { flat: true, surface: 'metal' });
    for (const sg of [-1, 1]) {
      const ix = x + c * sg * span * 0.45;
      const iz = z + s * sg * span * 0.45;
      k.cyl(0.012, 0.012, 0.07, 5, 0x6a8a6a, ix, y - 0.045, iz, { surface: 'glass' });
    }
  }
  k.cyl(0.004, 0.004, 0.1, 3, hex, x, y0 + h + 0.05, z);
}

/** A ground-mounted transformer: tank, radiator fins, bushings. */
export function transformer(k: Kit, x: number, z: number, hex = 0x6f7b72, y0 = 0.11): void {
  k.block(0.32, 0.04, 0.26, C.concrete, x, y0, z, { tex: 'concrete', bevel: 0.01 });
  k.block(0.2, 0.22, 0.16, hex, x, y0 + 0.04, z, { bevel: 0.015, surface: 'metal' });
  for (let i = 0; i < 4; i++) k.box(0.012, 0.16, 0.06, tint(hex, 0.85), x - 0.08 + i * 0.053, y0 + 0.14, z + 0.11, { flat: true });
  for (let i = 0; i < 3; i++) {
    k.cyl(0.012, 0.016, 0.1, 6, 0x9a6a4a, x - 0.06 + i * 0.06, y0 + 0.31, z, { surface: 'gloss' });
    k.cyl(0.02, 0.02, 0.01, 6, 0x9a6a4a, x - 0.06 + i * 0.06, y0 + 0.29, z);
  }
}

/** A chain-link security fence along x or z: posts, rails and a dark mesh. */
export function securityFence(k: Kit, x: number, z: number, len: number, alongX = true, h = 0.2, y0 = 0.11): void {
  const n = Math.max(1, Math.round(len / 0.32));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    k.box(0.018, h + 0.03, 0.018, 0x8c939a, alongX ? x + t : x, y0 + (h + 0.03) / 2, alongX ? z : z + t, { flat: true, surface: 'metal' });
  }
  k.box(alongX ? len : 0.006, h * 0.85, alongX ? 0.006 : len, 0x4a5258, x, y0 + h * 0.48, z, { flat: true });
  k.box(alongX ? len : 0.012, 0.012, alongX ? 0.012 : len, 0x9aa1a8, x, y0 + h, z, { flat: true, surface: 'metal' });
}

/** A shipping container, ribbed, with darker end doors. */
export function container(k: Kit, x: number, y: number, z: number, hex: number, alongX = true, len = 0.5): void {
  const [w, d] = alongX ? [len, 0.2] : [0.2, len];
  k.block(w, 0.2, d, hex, x, y, z, { bevel: 0.008, edge: 1.2, tex: 'panels' });
  const ribs = 2;
  for (let i = 0; i < ribs; i++) {
    const t = -len / 2 + (len * (i + 0.5)) / ribs;
    if (alongX) k.box(0.012, 0.17, d + 0.008, tint(hex, 0.86), x + t, y + 0.1, z, { flat: true });
    else k.box(w + 0.008, 0.17, 0.012, tint(hex, 0.86), x, y + 0.1, z + t, { flat: true });
  }
  if (alongX) k.box(0.008, 0.18, d - 0.02, tint(hex, 0.7), x + len / 2 + 0.002, y + 0.1, z, { flat: true });
  else k.box(w - 0.02, 0.18, 0.008, tint(hex, 0.7), x, y + 0.1, z + len / 2 + 0.002, { flat: true });
}

export const CONTAINER_COLOURS = [0xc0402a, 0x2f6fb5, 0xd9a52b, 0x3f8a4a, 0x8a3f6a, 0x5f7f90, 0xd8d4c8, 0xc96a2a, 0x2a5a5a];

/** A lorry: cab and a box / flatbed / tank body, along x (cab at +x) or z (cab at +z). */
export function truck(k: Kit, x: number, z: number, cab: number, body: number, alongX = true, kind: 'box' | 'flat' | 'tank' | 'tipper' = 'box', y0 = 0.11): void {
  const L = 0.56;
  const W = 0.17;
  const P = (along: number, across: number): [number, number] => (alongX ? [x + along, z + across] : [x + across, z + along]);
  const dims = (a: number, b: number): [number, number] => (alongX ? [a, b] : [b, a]);
  // Chassis, wheels.
  const [cw, cd] = dims(L, W * 0.8);
  k.block(cw, 0.03, cd, 0x26292c, x, y0 + 0.04, z);
  for (const a of [-0.19, -0.08, 0.2]) for (const s of [-1, 1]) {
    const [wx, wz] = P(a, s * W * 0.45);
    if (alongX) k.cylZ(0.045, 0.035, 8, 0x1c1e21, wx, y0 + 0.045, wz);
    else k.cylX(0.045, 0.035, 8, 0x1c1e21, wx, y0 + 0.045, wz);
  }
  // Cab with windscreen.
  const [cx, cz] = P(0.2, 0);
  const [bw, bd] = dims(0.14, W);
  k.block(bw, 0.15, bd, cab, cx, y0 + 0.06, cz, { bevel: 0.02, surface: 'gloss' });
  const [gx, gz] = P(0.272, 0);
  k.box(alongX ? 0.01 : W * 0.85, 0.06, alongX ? W * 0.85 : 0.01, C.glassDark, gx, y0 + 0.17, gz, { surface: 'glass' });
  const [lx, lz] = P(0.275, 0);
  for (const s of [-1, 1]) light(k, alongX ? lx : lx + s * W * 0.36, y0 + 0.09, alongX ? lz + s * W * 0.36 : lz, 0.02, 0xfff0c0);
  // Body.
  const [ox, oz] = P(-0.08, 0);
  const [ow, od] = dims(0.38, W);
  if (kind === 'box') k.block(ow, 0.2, od, body, ox, y0 + 0.07, oz, { bevel: 0.012, tex: 'panels' });
  else if (kind === 'flat') {
    k.block(ow, 0.025, od, tint(body, 0.7), ox, y0 + 0.07, oz, { tex: 'planks' });
    k.block(ow * (alongX ? 0.8 : 1), 0.1, od * (alongX ? 1 : 0.8), body, ox, y0 + 0.095, oz, { bevel: 0.01, tex: 'planks' });
  } else if (kind === 'tank') {
    if (alongX) k.cylX(0.085, 0.38, 10, body, ox, y0 + 0.17, oz, { surface: 'metal' });
    else k.cylZ(0.085, 0.38, 10, body, ox, y0 + 0.17, oz, { surface: 'metal' });
  } else {
    k.block(ow, 0.13, od, body, ox, y0 + 0.08, oz, { bevel: 0.015, taper: 0.06, surface: 'metal' });
    k.box(alongX ? ow * 0.85 : od * 0.75, 0.04, alongX ? od * 0.75 : ow * 0.85, 0x8a7a62, ox, y0 + 0.21, oz, { tex: 'concrete', flat: true });
  }
}

/** Traffic cones in a row. */
export function cones(k: Kit, x: number, z: number, n: number, alongX = true, gap = 0.1): void {
  for (let i = 0; i < n; i++) {
    const cx = alongX ? x + i * gap : x;
    const cz = alongX ? z : z + i * gap;
    k.box(0.05, 0.01, 0.05, 0x2a2a2a, cx, 0.115, cz, { flat: true });
    k.cone(0.02, 0.07, 6, 0xf0702a, cx, 0.155, cz, { flat: true });
    k.cyl(0.013, 0.016, 0.012, 6, C.white, cx, 0.155, cz, { flat: true });
  }
}

/** A tall floodlight mast with a lamp head. */
export function floodMast(k: Kit, x: number, z: number, h: number, y0 = 0.11, face = 0): void {
  k.cyl(0.018, 0.03, h, 6, 0x8c939a, x, y0 + h / 2, z, { surface: 'metal' });
  k.box(0.18, 0.02, 0.04, C.metalDark, x, y0 + h, z, { flat: true, rot: [0, face, 0] });
  for (const s of [-1, 1]) k.box(0.05, 0.04, 0.03, 0xfff3d0, x + Math.cos(face) * s * 0.06, y0 + h - 0.02, z - Math.sin(face) * s * 0.06, { glow: 1 });
}

/** A rooftop air-handling unit with a fan. */
export function hvac(k: Kit, x: number, y: number, z: number, w = 0.24, d = 0.16, hex = 0xb8bcc0): void {
  k.block(w, 0.09, d, hex, x, y, z, { bevel: 0.012, tex: 'panels' });
  k.cyl(Math.min(w, d) * 0.32, Math.min(w, d) * 0.32, 0.012, 8, 0x3a3f44, x + w * 0.2, y + 0.095, z, { flat: true });
  k.box(w * 0.3, 0.05, d * 0.9, tint(hex, 0.85), x - w * 0.25, y + 0.11, z, { flat: true });
}

/** Water: a glossy slab (rivers, basins, the sea at a quay). */
export function water(k: Kit, w: number, d: number, x: number, y: number, z: number, hex = C.water): void {
  k.box(w, 0.03, d, hex, x, y - 0.015, z, { flat: true, glow: 0.06 });
}

/** A flag on a pole (team colour). */
export function flag(k: Kit, x: number, z: number, h: number, hex: number, y0 = 0.11): void {
  k.cyl(0.008, 0.012, h, 5, 0xd8dce0, x, y0 + h / 2, z, { surface: 'metal' });
  k.sphere(0.014, C.hazard, x, y0 + h + 0.01, z, 5, { surface: 'metal' });
  k.box(0.2, 0.12, 0.006, hex, x + 0.1, y0 + h - 0.07, z, { flat: true, rot: [0, 0, -0.04] });
  k.box(0.07, 0.12, 0.007, tint(hex, 0.7), x + 0.17, y0 + h - 0.075, z, { flat: true, rot: [0, 0, -0.04] });
}

/** A barrel vault (arched roof) along x: length len, span (z), rise; springing at y. */
export function vault(k: Kit, len: number, span: number, rise: number, hex: number, x: number, y: number, z: number, o: PartOpts & { seg?: number } = {}): void {
  const g = new THREE.CylinderGeometry(1, 1, len, o.seg ?? 12, 1, false, -Math.PI / 2, Math.PI);
  g.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
  g.scale(1, rise, span / 2);
  k.add(g, hex, x, y, z, { flat: true, tex: 'panels', ...o });
}

/** A prism with a cross-section in the x-y plane, extruded `depth` along z (dams, ramps, sheds). */
export function prism(k: Kit, pts: Array<[number, number]>, depth: number, hex: number, x: number, y: number, z: number, o: PartOpts = {}): void {
  const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  k.add(g, hex, x, y, z, o);
}

/** A wall sign / panel in team colour with a light strip, on a wall facing +z or +x. */
export function sign(k: Kit, x: number, y: number, z: number, w: number, h: number, hex: number, faceX = false): void {
  k.box(faceX ? 0.02 : w, h, faceX ? w : 0.02, hex, x, y, z, { flat: true, bevel: 0 });
  k.box(faceX ? 0.022 : w * 0.8, h * 0.18, faceX ? w * 0.8 : 0.022, 0xf4f4ee, x + (faceX ? 0.003 : 0), y, z + (faceX ? 0 : 0.003), { glow: 0.5, flat: true });
}

/** A ribbon of glazing on a wall facing +z / +x / -z / -x (late-age offices, control rooms). */
export function ribbon(k: Kit, x: number, y: number, z: number, len: number, h: number, face: 'x' | 'z' | '-x' | '-z', glow = 0.35, hex: number = HT.glass, mullions = 0): void {
  const ax = face.endsWith('x');
  k.box(ax ? 0.02 : len, h, ax ? len : 0.02, hex, x, y, z, { surface: 'glass', glow, flat: true });
  for (let i = 1; i < mullions; i++) {
    const t = -len / 2 + (len * i) / mullions;
    const s = face.startsWith('-') ? -1 : 1;
    k.box(ax ? 0.024 : 0.012, h, ax ? 0.012 : 0.024, HT.trim, ax ? x + s * 0.002 : x + t, y, ax ? z + t : z + s * 0.002, { flat: true });
  }
}

/** A row of solar / rectenna panels tilted toward the sky. */
export function panelRow(k: Kit, x: number, z: number, n: number, gap: number, w: number, d: number, hex = 0x223a68, tilt = -0.45, y = 0.3): void {
  for (let i = 0; i < n; i++) {
    const px = x + i * gap;
    k.cyl(0.012, 0.012, y - 0.11, 4, C.metalDark, px, (y + 0.11) / 2, z);
    k.box(w, 0.018, d, hex, px, y, z, { rot: [tilt, 0, 0], surface: 'glass', glow: 0.06 });
    k.box(w + 0.02, 0.012, d + 0.02, 0xc8ccd0, px, y - 0.012, z, { rot: [tilt, 0, 0], flat: true, surface: 'metal' });
  }
}

/** Stacked sandbags along x or z (a low curved wall). */
export function sandbags(k: Kit, x: number, z: number, len: number, alongX = true, rows = 2): void {
  const n = Math.max(2, Math.round(len / 0.1));
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n - (r % 2); i++) {
      const t = -len / 2 + (len * (i + 0.5 + (r % 2) * 0.5)) / n;
      k.box(alongX ? 0.095 : 0.07, 0.045, alongX ? 0.07 : 0.095, tint(SAND, 0.92 + ((i + r) % 3) * 0.05), alongX ? x + t : x, 0.135 + r * 0.045, alongX ? z : z + t, { bevel: 0.012, edge: 1.1 });
    }
  }
}

/** Box opts with a bevel, the usual for building blocks. */
export const B = (bevel: number, o: BlockOpts = {}): BlockOpts => ({ bevel, ...o });
