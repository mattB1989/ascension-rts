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
export function securityFence(k: Kit, x: number, z: number, len: number, alongX = true, h = 0.2, y0 = 0.11, gap = 0.32): void {
  const n = Math.max(1, Math.round(len / gap));
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

/** A gravel track on the ground through the points (x, z), with rounded joints. */
export function trackPath(k: Kit, pts: Array<[number, number]>, w: number, hex = 0xb3a88f, y = 0.113): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    k.box(len, 0.012, w, hex, (ax + bx) / 2, y, (az + bz) / 2, { rot: [0, -Math.atan2(bz - az, bx - ax), 0], flat: true, tex: 'concrete' });
  }
  for (let i = 1; i + 1 < pts.length; i++) k.cyl(w / 2, w / 2, 0.012, 8, hex, pts[i]![0], y, pts[i]![1], { flat: true, tex: 'concrete' });
}

const BLADE = 0xfafbf8;

/** An open cylinder (a band round a tower or tank: no caps). */
export function hoop(k: Kit, r: number, h: number, seg: number, hex: number, x: number, y: number, z: number, o: PartOpts = {}): void {
  k.add(new THREE.CylinderGeometry(r, r, h, seg, 1, true), hex, x, y, z, { flat: true, ...o });
}

/** One rotor blade lying in the x-z plane along angle a: tapered, flattened, pitched, with a red tip. */
function blade(k: Kit, a: number, r0: number, r1: number): void {
  const piece = (from: number, to: number, w0: number, w1: number, hex: number) => {
    const g = new THREE.CylinderGeometry(w1, w0, to - from, 4);
    g.translate(0, (from + to) / 2, 0);
    g.scale(1, 1, 0.26);
    g.rotateY(0.32);
    g.rotateX(Math.PI / 2);
    g.rotateY(a);
    k.add(g, hex, 0, 0, 0, { flat: true, surface: 'gloss' });
  };
  const len = r1 - r0;
  const w = (f: number) => 0.07 - 0.052 * f;
  piece(r0, r0 + len * 0.86, w(0), w(0.86), BLADE);
  piece(r0 + len * 0.86, r1, w(0.86), w(1), 0xd8442e);
}

/**
 * A modern three-bladed wind turbine standing on y0 at (x, z): a footing, a
 * tapered white tower with a team band and a door, a nacelle facing `yaw` (0:
 * +z), a red 'flare' beacon and a 'spin' rotor built flat. Returns the rotor's
 * pivot: after build, `aimRotor` turns it to face `yaw` on a horizontal axis.
 */
export function windTurbine(k: Kit, x: number, z: number, hub: number, r: number, yaw: number, band: number, y0 = 0.11): Vec3 {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // Footing, tower, flanges, a team band and a door at the base.
  k.cyl(0.15, 0.17, 0.05, 10, C.concrete, x, y0 + 0.025, z, { tex: 'concrete', bevel: 0.012 });
  const th = hub - y0 - 0.12;
  k.add(new THREE.CylinderGeometry(0.042, 0.075, th, 10, 1, true), BLADE, x, y0 + 0.05 + th / 2, z);
  hoop(k, 0.0755, 0.05, 10, band, x, y0 + 0.1, z);
  hoop(k, 0.0735, 0.03, 10, tint(band, 1.3), x, y0 + 0.155, z);
  hoop(k, 0.056, 0.012, 10, 0xc8ccd0, x, y0 + 0.05 + th * 0.55, z);
  k.box(0.035, 0.07, 0.02, 0x4a5056, x + 0.045, y0 + 0.1, z + 0.058, { flat: true, rot: [0, 0.65, 0] });
  k.box(0.06, 0.012, 0.05, C.metalDark, x + 0.06, y0 + 0.055, z + 0.075, { flat: true, rot: [0, 0.65, 0] });
  // Nacelle: a rounded box along the wind, a cooler and wind vane at the back, a yaw bearing.
  const ny = hub - y0 - 0.12 + y0 + 0.05;
  k.cyl(0.05, 0.048, 0.04, 10, 0xd0d4d8, x, ny + 0.02, z, { surface: 'metal' });
  k.box(0.13, 0.12, 0.4, BLADE, x - fx * 0.05, hub, z - fz * 0.05, { rot: [0, yaw, 0], bevel: 0.035, edge: 1.08, surface: 'gloss' });
  k.box(0.1, 0.012, 0.36, band, x - fx * 0.05, hub - 0.03, z - fz * 0.05, { rot: [0, yaw, 0], flat: true });
  k.box(0.08, 0.03, 0.08, 0xd0d4d8, x - fx * 0.2, hub + 0.07, z - fz * 0.2, { rot: [0, yaw, 0], bevel: 0.01 });
  k.box(0.006, 0.07, 0.006, C.metalDark, x - fx * 0.14, hub + 0.09, z - fz * 0.14, { flat: true });
  k.box(0.03, 0.006, 0.006, C.metalDark, x - fx * 0.14, hub + 0.125, z - fz * 0.14, { flat: true, rot: [0, yaw, 0] });
  const f = k.part('flare', [x - fx * 0.2, hub + 0.1, z - fz * 0.2]);
  light(f, 0, 0, 0, 0.04, RED_LIGHT);
  // Rotor: hub, spinner and three blades about its own y.
  const at: Vec3 = [x + fx * 0.16, hub, z + fz * 0.16];
  const s = k.part('spin', at);
  s.cyl(0.055, 0.062, 0.07, 10, BLADE, 0, 0, 0, { surface: 'gloss', flat: true });
  s.add(new THREE.ConeGeometry(0.06, 0.1, 10), BLADE, 0, 0.085, 0, { surface: 'gloss', flat: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    s.add(new THREE.CylinderGeometry(0.028, 0.032, 0.05, 6).translate(0, 0.07, 0).rotateX(Math.PI / 2).rotateY(a), 0xdfe2e4, 0, 0, 0, { flat: true, surface: 'gloss' });
    blade(s, a, 0.05, r);
  }
  return at;
}

/**
 * Stand a 'spin' part built flat (axis y, pivot at `at`) up on a horizontal axis
 * facing `yaw` (0: +z), started at `phase`: it goes into a yawed pivot so the
 * renderer, which turns 'spin' parts about their own y, turns it like a rotor.
 */
export function aimRotor(g: THREE.Object3D, at: Vec3, yaw: number, phase = 0): void {
  const hits: THREE.Object3D[] = [];
  const p = new THREE.Vector3(...at);
  g.traverse((o) => {
    if (o.name === 'spin' && o.position.distanceTo(p) < 1e-4) hits.push(o);
  });
  for (const o of hits) {
    const pivot = new THREE.Group();
    pivot.position.copy(o.position);
    pivot.rotation.y = yaw;
    o.parent!.add(pivot);
    pivot.add(o);
    o.position.set(0, 0, 0);
    o.rotation.set(Math.PI / 2, phase, 0);
  }
}

/** A sheep grazing (wind farms keep their grass short). */
export function sheep(k: Kit, x: number, z: number, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  k.box(0.09, 0.06, 0.055, 0xece8dc, x, 0.15, z, { rot: [0, -a, 0], bevel: 0.02, edge: 1.05 });
  k.box(0.035, 0.035, 0.032, 0x2a2622, x + c * 0.055, 0.165, z + s * 0.055, { rot: [0, -a, 0], flat: true });
}

/**
 * A row of photovoltaic tables along x from x0 to x1 at z: racked modules tilted
 * up toward +z (dark-blue cells in silver frames) on front and back posts.
 */
export function solarTable(k: Kit, x0: number, x1: number, z: number, depth: number, tiltA: number, y0 = 0.11, low = 0.08): void {
  const len = x1 - x0;
  const cx = (x0 + x1) / 2;
  const rise = depth * Math.sin(tiltA);
  const run = depth * Math.cos(tiltA);
  const cy = y0 + low + rise / 2;
  // Posts (front short, back tall) and a rail under each edge.
  const posts = Math.max(2, Math.round(len / 0.6) + 1);
  for (let i = 0; i < posts; i++) {
    const px = x0 + 0.06 + ((len - 0.12) * i) / (posts - 1);
    k.block(0.018, low + 0.01, 0.018, 0x9aa2a8, px, y0, z + run * 0.36, { flat: true, surface: 'metal' });
    k.block(0.018, low + rise * 0.86, 0.018, 0x9aa2a8, px, y0, z - run * 0.36, { flat: true, surface: 'metal' });
  }
  // The frame (silver), then modules in pairs up the slope with a hairline between them.
  // A point on the table: u along x, v down the slope (+: toward the low front edge), w off its face.
  const P = (v: number, w: number): [number, number] => [cy - v * Math.sin(tiltA) + w * Math.cos(tiltA), z + v * Math.cos(tiltA) + w * Math.sin(tiltA)];
  const [fy, fz] = P(0, -0.006);
  k.box(len, 0.012, depth, 0xc4cad0, cx, fy, fz, { rot: [tiltA, 0, 0], flat: true, surface: 'metal' });
  const n = Math.max(1, Math.round(len / 0.34));
  const mw = len / n - 0.014;
  const [my, mz] = P(0, 0.003);
  for (let i = 0; i < n; i++) {
    const mx = x0 + (len * (i + 0.5)) / n;
    k.box(mw, 0.008, depth - 0.024, 0x1d3360, mx, my, mz, { rot: [tiltA, 0, 0], flat: true, surface: 'glass', tex: 'glass', glow: 0.04 });
  }
  const [ly, lz] = P(0, 0.008);
  k.box(len - 0.01, 0.004, 0.008, 0xc4cad0, cx, ly, lz, { rot: [tiltA, 0, 0], flat: true, surface: 'metal' });
}

/**
 * A grid-battery enclosure along x standing on y0 at (x, z): a white cabinet on a
 * plinth, door seams and handles on its +z face, louvred ends, roof fans and a
 * lit band. Returns where its status lights go (on the +z face).
 */
export function batteryModule(k: Kit, x: number, z: number, len: number, accent: number, y0 = 0.11, ends: number[] = [-1, 1]): Vec3 {
  const h = 0.3;
  const d = 0.26;
  const yb = y0 + 0.04;
  k.block(len + 0.05, 0.04, d + 0.06, 0x9aa0a6, x, y0, z, { tex: 'concrete' });
  k.block(len, h, d, HT.panel, x, yb, z, { tex: 'panels', bevel: 0.022, edge: 1.1 });
  k.box(len + 0.006, 0.03, d + 0.006, HT.trim, x, yb + 0.015, z, { flat: true, surface: 'metal' });
  // Doors: seams and handles on the front; a dark panel for the status lights.
  const doors = Math.max(2, Math.round(len / 0.17));
  for (let i = 1; i < doors; i++) k.box(0.006, h - 0.07, 0.006, 0xa4adb6, x - len / 2 + (len * i) / doors, yb + 0.03 + (h - 0.07) / 2 + 0.01, z + d / 2 + 0.002, { flat: true });
  const lx = x + len / 2 - len / doors / 2;
  k.box(0.045, 0.08, 0.008, 0x1f252b, lx, yb + h * 0.62, z + d / 2 + 0.003, { flat: true, surface: 'gloss' });
  // Louvred ends (the given sides: -1 west, 1 east).
  for (const s of ends) {
    const ex = x + s * (len / 2 + 0.003);
    k.box(0.006, h * 0.62, d * 0.72, 0x3a4048, ex, yb + h * 0.48, z, { flat: true });
    for (let i = 0; i < 2; i++) k.box(0.01, 0.01, d * 0.72, 0xb8c0c8, ex + s * 0.003, yb + h * 0.3 + i * h * 0.2, z, { flat: true });
  }
  // Roof: two fan units with dark grilles and a lit band along the front edge.
  for (const s of [-1, 1]) {
    const fx = x + s * len * 0.24;
    k.block(len * 0.36, 0.035, d * 0.7, 0xd6dce1, fx, yb + h, z - 0.01, { bevel: 0.008, tex: 'panels' });
    k.add(new THREE.CircleGeometry(0.05, 10).rotateX(-Math.PI / 2), 0x2a3036, fx, yb + h + 0.037, z - 0.01, { flat: true });
  }
  k.box(len * 0.92, 0.02, 0.008, accent, x, yb + h - 0.05, z + d / 2 + 0.004, { glow: 0.95, flat: true });
  return [lx, yb + h * 0.62, z + d / 2 + 0.008];
}

/** A line gantry: an H-frame of two posts and a crossbar with hanging insulators, its bar along x (or z). */
export function gantry(k: Kit, x: number, z: number, w: number, h: number, alongX = true, y0 = 0.11, hex = 0x8c939a): void {
  for (const s of [-1, 1]) k.block(0.035, h, 0.035, hex, alongX ? x + (s * w) / 2 : x, y0, alongX ? z : z + (s * w) / 2, { surface: 'metal', bevel: 0.006 });
  k.box(alongX ? w + 0.06 : 0.035, 0.035, alongX ? 0.035 : w + 0.06, hex, x, y0 + h, z, { surface: 'metal' });
  for (const f of [-0.3, 0, 0.3]) k.cyl(0.01, 0.01, 0.07, 5, 0x6a8a6a, alongX ? x + f * w : x, y0 + h - 0.05, alongX ? z : z + f * w, { surface: 'glass' });
}

/** Box opts with a bevel, the usual for building blocks. */
export const B = (bevel: number, o: BlockOpts = {}): BlockOpts => ({ bevel, ...o });
