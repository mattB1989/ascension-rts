// Kit-built raw producers and industry (see ../kit.ts, common.ts and
// industry-parts.ts). Each model fills its footprint (BUILDINGS[type].size: x
// spans size[0], z spans size[1]), centred at y = 0, with its front (doors,
// docks, signs) toward +z and its tall parts toward the back, so the high 3/4
// camera sees both. The fishing harbour faces the water on +x (the renderer turns
// it). Named parts the renderer animates: 'spin' (turns about its y), 'beam'
// (rocks about z), 'crank' (turns about z), 'flare' (flickers); 'smoke' anchors.

import * as THREE from 'three';
import { Kit, type Vec3 } from '../kit.ts';
import { C, chimney, crates, hedge, lamp, lot, pick, pine, rng, tint, tree, type ModelFn } from './common.ts';
import {
  bar, carAt, conveyor, dock, drums, excavator, fishingBoat, flatRoof, floodlight, forklift, Frame, G, gallery, gambrel, heap, ladder, lattice,
  logPile, lumber, parking, pilasters, pipe, pipeRack, prism, ribbon, robotArm, rollerDoor, sawtooth, sign, sphereTank, strut, tank, tilt, track,
  tractor, truck, wireFence,
} from './industry-parts.ts';

const CAR_COLOURS = [0xc0392b, 0x2e86c1, 0xecf0f1, 0x34495e, 0x27ae60, 0x8e8e8e, 0xd4a017];

/** A rail fence of rough timber (posts and two rails) along x or z. */
function railFence(k: Kit, x: number, z: number, len: number, alongX = true): void {
  const n = Math.max(2, Math.round(len / 0.32));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    k.block(0.03, 0.17, 0.03, C.timberDark, alongX ? x + t : x, G, alongX ? z : z + t, { flat: true });
  }
  for (const y of [0.07, 0.14]) k.box(alongX ? len : 0.018, 0.018, alongX ? 0.018 : len, C.timber, x, G + y, z, { flat: true });
}

/** A field of crop rows along x, filling x0..x1, z0..z1 on a soil bed. */
function field(k: Kit, x0: number, x1: number, z0: number, z1: number, kind: 'wheat' | 'greens' | 'furrows' | 'corn', v: number): void {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const soil = kind === 'furrows' ? 0x6a4a2e : 0x7a5a38;
  k.box(w, 0.03, z1 - z0, soil, cx, G + 0.015, (z0 + z1) / 2, { tex: 'lawn', flat: true });
  const pitch = kind === 'furrows' ? 0.11 : kind === 'greens' ? 0.17 : 0.15;
  const n = Math.floor((z1 - z0) / pitch);
  const r = rng(v * 13 + Math.round(z0 * 100));
  for (let i = 0; i < n; i++) {
    const z = z0 + pitch * (i + 0.5) + ((z1 - z0) - n * pitch) / 2;
    if (kind === 'wheat') {
      k.block(w - 0.06, 0.13, pitch * 0.82, tint(0xd9b850, 0.94 + r() * 0.12), cx, G + 0.02, z, { bevel: 0.03, edge: 1.2, taper: 0.15 });
    } else if (kind === 'corn') {
      k.block(w - 0.06, 0.2, pitch * 0.6, tint(0x5f9a3a, 0.92 + r() * 0.15), cx, G + 0.02, z, { bevel: 0.03, edge: 1.25, taper: 0.3 });
      k.box(w - 0.08, 0.015, pitch * 0.2, 0xb8c060, cx, G + 0.222, z, { flat: true });
    } else if (kind === 'greens') {
      const m = Math.round(w / 0.16);
      for (let j = 0; j < m; j++) {
        const x = x0 + (w * (j + 0.5)) / m;
        k.add(new THREE.IcosahedronGeometry(0.055 + r() * 0.012, 0), tint(0x5a9a3a, 0.9 + r() * 0.2), x, G + 0.07, z, { flat: true, rot: [r(), r(), r()] });
      }
    } else {
      k.block(w - 0.04, 0.05, pitch * 0.55, tint(soil, 1.12), cx, G + 0.02, z, { taper: 0.5, edge: 1.1 });
    }
  }
}

// ---------------------------------------------------------------------------
// Raw producers

/** Farm (4 x 4): three fields (wheat, greens, fresh ploughing), barn, silos, grain bins, farmhouse, tractors. */
function farm(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 4, 4, C.lawn, 'lawn');
  // Fields on the left, hedgerows between them.
  field(k, -1.9, 0.3, -1.9, -0.72, 'wheat', v);
  field(k, -1.9, 0.3, -0.58, 0.56, v % 2 ? 'corn' : 'greens', v);
  field(k, -1.9, 0.3, 0.7, 1.9, 'furrows', v);
  hedge(k, -0.8, -0.65, 2.2, true, 0.14);
  hedge(k, -0.8, 0.63, 2.2, true, 0.14);
  tree(k, 0.25, -0.62, 0.9, v);
  tree(k, -1.7, 0.62, 0.8, v + 1);
  // Round bales left on the stubble, a tractor ploughing the bottom field.
  for (const [x, z] of [[-1.5, -1.2], [-0.9, -1.45], [-0.4, -1.05]] as const) {
    k.cylZ(0.085, 0.13, 10, 0xe0c060, x, G + 0.2, z, { tex: 'planks' });
    k.cylZ(0.07, 0.135, 10, 0xc8a848, x, G + 0.2, z);
  }
  tractor(k, -0.55, 1.3, Math.PI, 0x3f8f3a, false);
  k.box(0.12, 0.03, 0.26, C.metalDark, -0.33, G + 0.05, 1.3, { flat: true });
  // The yard: gravel, a rail fence along the fields.
  k.box(1.6, 0.02, 3.86, 0x9d9482, 1.15, G + 0.01, 0, { tex: 'concrete', flat: true });
  railFence(k, 0.37, 0.1, 3.6, false);
  // Barn: red plank walls, white corner boards, gambrel roof, big braced doors on the gable end.
  const bx = 0.98, bz = -0.86, bw = 0.86, bd = 1.24;
  const red = pick([0xa8442f, 0x9a3a2a, 0x8a4a3a], v, 4);
  k.block(bw + 0.04, 0.05, bd + 0.04, C.concrete, bx, G, bz, { tex: 'concrete' });
  k.block(bw, 0.52, bd, red, bx, G + 0.05, bz, { tex: 'planks' });
  gambrel(k, bw, bd, 0.5, pick([0x5b6168, 0x4a4f55, 0x6a5a4a], v, 5), red, bx, G + 0.57, bz);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(0.035, 0.52, 0.035, C.white, bx + sx * bw / 2, G + 0.05, bz + sz * bd / 2, { flat: true });
  const fz = bz + bd / 2 + 0.012;
  k.box(0.44, 0.4, 0.015, tint(red, 0.85), bx, G + 0.25, fz, { tex: 'planks' });
  for (const s of [-1, 1]) {
    k.box(0.02, 0.4, 0.02, C.white, bx + s * 0.22, G + 0.25, fz + 0.01, { flat: true });
    k.box(0.02, 0.5, 0.02, C.white, bx + s * 0.105, G + 0.25, fz + 0.01, { flat: true, rot: [0, 0, s * 0.58] });
  }
  k.box(0.46, 0.02, 0.02, C.white, bx, G + 0.45, fz + 0.01, { flat: true });
  k.box(0.46, 0.02, 0.02, C.white, bx, G + 0.06, fz + 0.01, { flat: true });
  k.box(0.18, 0.16, 0.015, 0x3a2a1e, bx, G + 0.78, fz, { flat: true });
  k.box(0.22, 0.2, 0.012, C.white, bx, G + 0.78, fz - 0.003, { flat: true });
  k.box(0.06, 0.04, 0.03, 0xffe0a0, bx, G + 0.95, fz + 0.01, { glow: 0.8 });
  k.cyl(0.05, 0.06, 0.08, 6, C.metal, bx, G + 1.12, bz, { surface: 'gloss' });
  // Hay bales by the door.
  for (let i = 0; i < 3; i++) k.block(0.18, 0.1, 0.11, 0xd8b850, bx + 0.5 + (i % 2) * 0.05, G + Math.floor(i / 2) * 0.1, bz + 0.85 + (i % 2) * 0.12, { tex: 'planks', bevel: 0.015 });
  // Two tall silos behind, blue-grey with domes, ladders, a filling pipe to the top.
  for (const [z, h, r] of [[-1.55, 1.75, 0.24], [-0.98, 1.45, 0.2]] as const) {
    k.cyl(r, r, h, 14, 0x9fb0b8, 1.68, G + h / 2, z, { tex: 'concrete', bevel: 0.02 });
    for (let y = 0.3; y < h; y += 0.3) k.cyl(r + 0.006, r + 0.006, 0.02, 14, 0x7a8a92, 1.68, G + y, z, { flat: true });
    k.dome(r, 0xb8c4ca, 1.68, G + h, z, 14, { surface: 'gloss' });
    ladder(k, 1.68 - r - 0.01, G, G + h, z, 'x');
  }
  pipe(k, [[1.5, G + 0.5, -1.25], [1.5, G + 1.85, -1.4], [1.62, G + 1.95, -1.52]], 0.02, C.metal);
  // Grain bins: corrugated drums with conical caps.
  for (const z of [0.15, 0.55]) {
    k.cyl(0.17, 0.17, 0.36, 12, C.metal, 1.65, G + 0.18, z, { surface: 'gloss', tex: 'panels' });
    k.cone(0.19, 0.14, 12, tint(C.metal, 1.1), 1.65, G + 0.43, z, { surface: 'gloss' });
    k.cyl(0.03, 0.03, 0.04, 6, C.metal, 1.65, G + 0.52, z, { surface: 'gloss' });
  }
  // Farmhouse at the front with its own chimney.
  const hx = 1.05, hz = 1.35;
  k.block(0.74, 0.42, 0.5, C.plaster, hx, G, hz, { tex: 'plaster' });
  k.gable(0.74, 0.5, 0.3, C.roofRed, hx, G + 0.42, hz, { over: 0.06 });
  k.box(0.14, 0.24, 0.02, C.door, hx - 0.1, G + 0.12, hz + 0.255, { tex: 'planks' });
  k.windows(2, 0.36, G + 0.24, 'z', hz + 0.255, { frame: C.trim, cx: hx + 0.1, w: 0.1, h: 0.11 });
  k.windows(1, 0, G + 0.26, 'x', hx + 0.375, { frame: C.trim, cx: hz });
  chimney(k, hx + 0.24, hz - 0.12, 0.3, 0.05, C.brick, G + 0.42);
  // A second tractor with a grain trailer in the yard, a water trough, lamps.
  tractor(k, 0.95, 0.35, Math.PI / 2 + 0.2, pick([0x3f8f3a, 0xc0392b, 0x2e6fb0], v, 6), true);
  k.block(0.26, 0.07, 0.1, C.metal, 1.5, G, 0.95, { surface: 'gloss', bevel: 0.01 });
  k.box(0.24, 0.01, 0.08, C.water, 1.5, G + 0.07, 0.95, { surface: 'glass' });
  lamp(k, 0.55, 0.95, 0.55);
  sign(k, 0.62, 1.8, 0.36, team, 0.3);
  return k.build();
}

/**
 * Fishing harbour (3 x 3, on the shore, water on +x): a stone quay along the
 * footprint's water edge, a timber jetty out over the water (beyond the
 * footprint, like the old model) with a trawler and a launch moored at it, a
 * fish market, a smokehouse, net racks, crates and a quay crane. The sea is at
 * world y 0, about 0.25 below the building's base on a coast.
 */
function fishingHarbour(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  const qx = 1.45; // quay edge (the footprint's water side)
  const sea = -0.24; // waterline in model space (typical coast)
  // The quay: paving over the whole lot, a dressed stone face down into the water, coping and bollards.
  lot(k, 3, 3, 0x9a958a);
  k.block(0.12, 0.62, 2.96, 0x8a8478, qx - 0.04, -0.5, 0, { tex: 'brick' });
  k.box(0.012, 0.12, 2.96, 0x3a4a3a, qx + 0.022, sea + 0.04, 0, { flat: true });
  k.block(0.16, 0.05, 2.98, C.concreteLight, qx - 0.06, G, 0, { bevel: 0.015 });
  for (const z of [-1.25, -0.62, 0.62, 1.25]) {
    k.cyl(0.03, 0.036, 0.07, 8, 0x2a2a2a, qx - 0.07, G + 0.085, z, { surface: 'gloss' });
    k.cyl(0.044, 0.044, 0.015, 8, 0x2a2a2a, qx - 0.07, G + 0.125, z, { surface: 'gloss' });
  }
  // Timber jetty out over the water on piles, with lamps.
  const jz = 0.0, jw = 0.36, jx0 = qx, jx1 = qx + 0.95;
  const deck = G + 0.02;
  k.box(jx1 - jx0, 0.04, jw, C.timber, (jx0 + jx1) / 2, deck, jz, { tex: 'planks' });
  for (let i = 0; i < 7; i++) k.box(0.008, 0.041, jw, C.timberDark, jx0 + 0.07 + i * 0.13, deck, jz, { flat: true });
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.cyl(0.028, 0.032, 0.8, 6, C.timberDark, jx0 + 0.25 + i * 0.32, deck - 0.4, jz + s * (jw / 2 - 0.01), { tex: 'planks' });
  for (const s of [-1, 1]) k.box(jx1 - jx0, 0.03, 0.03, C.timberDark, (jx0 + jx1) / 2, deck - 0.04, jz + s * (jw / 2), { flat: true });
  lamp(k, jx1 - 0.06, jz + jw / 2 - 0.04, 0.4);
  lamp(k, jx1 - 0.06, jz - jw / 2 + 0.04, 0.4);
  // Moored boats: a trawler on one side of the jetty, a launch on the other, mooring lines.
  const hull = pick([team, 0x2f5f8f, 0xb03a2e, 0x2f6f4f], v, 2);
  fishingBoat(k, qx + 0.5, 0.47, 0, hull, sea - 0.04, 0.95);
  for (const x of [qx + 0.12, qx + 0.85]) strut(k, [x, sea + 0.1, 0.33], [x, deck + 0.02, jz + jw / 2], 0.005, 0xd8c8a0, 3);
  const lf = new Frame(k, qx + 0.45, -0.38, Math.PI, sea - 0.03);
  lf.box(0.5, 0.11, 0.17, C.white, 0, 0.055, 0, { taper: -0.12, bevel: 0.015, surface: 'gloss' });
  lf.box(0.5, 0.025, 0.18, 0x2f5f8f, 0, 0.015, 0, { flat: true });
  lf.block(0.13, 0.09, 0.12, 0x2f5f8f, 0.05, 0.11, 0, { bevel: 0.015 });
  lf.box(0.01, 0.035, 0.08, C.window, 0.116, 0.17, 0, { glow: 0.5, surface: 'glass' });
  lf.box(0.1, 0.015, 0.14, C.timber, -0.15, 0.11, 0, { flat: true, tex: 'planks' });
  // Fish market at the back: painted planks, red roof, a roller door to the quay, sign.
  const mx = -0.15, mz = -0.85;
  const paint = pick([0x7f9fb0, 0x6f8f7a, 0x9aaab8, 0xb08a6a], v, 3);
  k.block(1.6, 0.06, 0.9, C.concrete, mx, G, mz, { tex: 'concrete' });
  k.block(1.56, 0.52, 0.86, paint, mx, G + 0.06, mz, { tex: 'planks' });
  k.gable(1.56, 0.86, 0.32, C.roofRed, mx, G + 0.58, mz, { over: 0.07 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(0.035, 0.52, 0.035, C.white, mx + sx * 0.78, G + 0.06, mz + sz * 0.43, { flat: true });
  rollerDoor(k, mx + 0.79, G + 0.06, mz, 0.4, 0.34, 'x', 0xd8dce0);
  rollerDoor(k, mx + 0.35, G + 0.06, mz + 0.43, 0.36, 0.32, 'z', 0xd8dce0);
  k.windows(3, 0.7, G + 0.36, 'z', mz + 0.435, { frame: C.trim, cx: mx - 0.35, w: 0.14, h: 0.13 });
  k.block(0.9, 0.12, 0.03, team, mx - 0.2, G + 0.6, mz + 0.45, { bevel: 0.01, surface: 'gloss' });
  k.box(0.7, 0.03, 0.01, C.white, mx - 0.2, G + 0.66, mz + 0.468, { glow: 0.7 });
  k.box(0.5, 0.025, 0.26, C.metal, mx + 0.92, G + 0.48, mz, { bevel: 0.008, surface: 'gloss' });
  // Smokehouse with a smoking chimney.
  const sx = -1.08, sz = 0.42;
  k.block(0.56, 0.42, 0.52, C.brick, sx, G, sz, { tex: 'brick' });
  k.gable(0.56, 0.52, 0.24, C.roofSlate, sx, G + 0.42, sz, { over: 0.05 });
  k.box(0.14, 0.24, 0.02, C.door, sx + 0.12, G + 0.12, sz + 0.265, { tex: 'planks' });
  k.windows(1, 0, G + 0.26, 'x', sx + 0.285, { frame: C.trim, cx: sz, w: 0.1, h: 0.1 });
  chimney(k, sx - 0.15, sz - 0.12, 0.38, 0.05, C.brickDark, G + 0.42);
  // Net racks with nets hung to dry, lobster pots, barrels.
  for (const z of [1.0, 1.35]) {
    for (const x of [-0.75, -0.15]) k.block(0.025, 0.38, 0.025, C.timberDark, x, G, z, { flat: true });
    k.box(0.64, 0.02, 0.02, C.timberDark, -0.45, G + 0.37, z, { flat: true });
    k.box(0.56, 0.28, 0.012, z > 1.1 ? 0x2f5a4a : 0x6a4a3a, -0.45, G + 0.22, z, { flat: true, rot: [0.08, 0, 0] });
  }
  for (let i = 0; i < 5; i++) k.cyl(0.05, 0.055, 0.08, 7, 0x8a6a40, 0.25 + (i % 3) * 0.12, G + 0.04 + Math.floor(i / 3) * 0.08, 1.25 - (i % 2) * 0.02, { tex: 'planks' });
  drums(k, -1.3, 1.0, 3, 0x5a6a7a, 0x2a2a2a, false);
  // On the quay: blue fish boxes stacked, an ice chute, the jib crane over the water.
  for (let i = 0; i < 9; i++) k.block(0.13, 0.07, 0.1, i % 2 ? 0x2f6fb0 : 0x3a8ac8, 0.85 + (i % 3) * 0.14, G + Math.floor(i / 3) * 0.07, 0.25, { bevel: 0.01, surface: 'gloss' });
  forklift(k, 0.7, 0.55, Math.PI / 2 + 0.3, C.hazard);
  // A fish stall under a striped awning, and the van that takes the catch to market.
  const ax = -0.15, az = 0.0;
  for (const [px, pz] of [[-0.25, -0.17], [0.25, -0.17], [-0.25, 0.17], [0.25, 0.17]] as const) k.block(0.02, 0.32, 0.02, C.white, ax + px, G, az + pz, { flat: true });
  for (let i = 0; i < 5; i++) k.box(0.11, 0.02, 0.42, i % 2 ? C.white : team, ax - 0.22 + i * 0.11, G + 0.33, az, { flat: true, rot: [0, 0, 0.12] });
  k.block(0.44, 0.04, 0.24, C.timber, ax, G + 0.14, az, { tex: 'planks', bevel: 0.01 });
  for (let i = 0; i < 3; i++) k.block(0.12, 0.03, 0.09, 0x9ab0c0, ax - 0.13 + i * 0.13, G + 0.18, az, { surface: 'gloss' });
  truck(k, -0.15, 0.62, 0, pick([0xecf0f1, team, 0x2e86c1], v, 6), 'reefer', C.white, 0.8);
  k.cyl(0.035, 0.045, 0.7, 8, C.hazard, qx - 0.2, G + 0.35, -0.3, { surface: 'gloss', bevel: 0.01 });
  bar(k, [qx - 0.2, G + 0.68, -0.3], [qx + 0.32, G + 0.6, -0.3], 0.035, 0.035, C.hazard, { surface: 'gloss' });
  strut(k, [qx + 0.3, G + 0.6, -0.3], [qx + 0.3, G + 0.3, -0.3], 0.003, 0x222222, 3);
  k.block(0.08, 0.05, 0.08, 0x3a8ac8, qx + 0.3, G + 0.24, -0.3, { flat: true });
  lamp(k, 0.6, -0.2, 0.55);
  lamp(k, -0.65, 0.65, 0.55);
  tree(k, -1.25, -1.25, 0.8, v);
  return k.build();
}

/** Logging camp (2 x 2): a log cabin, a log deck with cut ends, a loaded log truck, stumps and pines. */
function loggingCamp(_team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 2, 2, 0x7a6a50, 'lawn');
  for (const [x, z, s] of [[-0.55, 0.55, 1.2], [0.75, -0.55, 1.1]] as const) k.box(0.5 * s, 0.01, 0.4 * s, C.lawn, x, G + 0.005, z, { tex: 'lawn', flat: true });
  // Log cabin: walls of stacked logs, a green gable roof, stone chimney.
  const cx = -0.4, cz = -0.45, cw = 0.78, cd = 0.56, r = 0.034;
  for (let i = 0; i < 7; i++) {
    const y = G + r + i * r * 1.85;
    const bark = tint(0x7a5232, 0.9 + (i % 2) * 0.12);
    for (const s of [-1, 1]) {
      k.cylX(r, cw + 0.08, 6, bark, cx, y, cz + s * cd / 2, { tex: 'planks' });
      k.cylZ(r, cd + 0.08, 6, tint(bark, 0.95), cx + s * cw / 2, y + r * 0.9, cz, { tex: 'planks' });
    }
  }
  k.box(cw - 0.02, 0.42, cd - 0.02, 0x6a4a2e, cx, G + 0.22, cz, { flat: true });
  k.gable(cw + 0.06, cd + 0.06, 0.28, C.roofGreen, cx, G + 0.47, cz, { over: 0.07 });
  k.box(0.13, 0.22, 0.02, C.timberDark, cx + 0.15, G + 0.11, cz + cd / 2 + 0.035, { tex: 'planks' });
  k.windows(1, 0, G + 0.25, 'z', cz + cd / 2 + 0.035, { frame: C.timberDark, cx: cx - 0.17, w: 0.12, h: 0.1 });
  k.block(0.12, 0.62, 0.12, 0x8a8278, cx - cw / 2 + 0.02, G, cz - 0.08, { tex: 'concrete', bevel: 0.015 });
  k.anchor('smoke', cx - cw / 2 + 0.02, G + 0.66, cz - 0.08);
  k.box(0.3, 0.03, 0.14, C.timber, cx + 0.15, G + 0.015, cz + cd / 2 + 0.12, { tex: 'planks', flat: true });
  // Log deck: a pyramid of logs with pale cut ends, skids under it.
  for (const x of [-0.05, 0.75]) k.box(0.06, 0.04, 0.6, C.timberDark, x, G + 0.02, 0.55, { flat: true });
  logPile(k, 0.35, 0.55, 0.95, 3, 0.075, true, v + 3);
  // Loaded log truck heading out.
  truck(k, 0.42, -0.5, 0, pick([0xb03a2e, 0x2f5f8f, 0xd4a017], v, 2), 'logs', C.timber, 0.85);
  // Stumps, a chopping block with an axe, a sawbuck, pines round the edge.
  for (const [x, z] of [[-0.85, 0.15], [-0.15, 0.9], [0.85, 0.05], [-0.75, 0.85]] as const) {
    k.cyl(0.05, 0.06, 0.07, 7, 0x7a5232, x, G + 0.035, z, { tex: 'planks' });
    k.cyl(0.045, 0.045, 0.005, 7, 0xd9b27a, x, G + 0.072, z);
  }
  k.cyl(0.06, 0.065, 0.1, 8, 0x7a5232, -0.05, G + 0.05, 0.05, { tex: 'planks' });
  k.cyl(0.055, 0.055, 0.005, 8, 0xd9b27a, -0.05, G + 0.102, 0.05);
  k.box(0.012, 0.15, 0.012, C.timber, -0.03, G + 0.16, 0.05, { rot: [0, 0, 0.35] });
  k.box(0.05, 0.03, 0.01, C.metal, -0.06, G + 0.23, 0.05, { surface: 'gloss', rot: [0, 0, 0.35] });
  pine(k, -0.74, -0.76, 1.0);
  pine(k, 0.72, -0.72, 1.15);
  pine(k, -0.76, 0.45, 0.9);
  pine(k, 0.7, 0.7, 1.05);
  pine(k, 0.1, -0.78, 0.85);
  return k.build();
}

/** Benches of rock round a pit floor: an L (or U) of stepped blocks rising away from the floor. */
function benches(k: Kit, levels: Array<{ top: number; back: number; left: number; right?: number }>, half: number, hex: number[], seed: number): void {
  const r = rng(seed);
  levels.forEach((l, i) => {
    const col = hex[i % hex.length]!;
    // Back strip: z from -half to back, split in chunks with jitter.
    const n = 3;
    for (let j = 0; j < n; j++) {
      const x0 = -half + ((2 * half) * j) / n;
      const x1 = -half + ((2 * half) * (j + 1)) / n;
      const jz = (r() - 0.5) * 0.08;
      const jh = (r() - 0.5) * 0.04;
      const z1 = l.back + jz;
      k.block(x1 - x0 + 0.01, l.top + jh - G, z1 + half, tint(col, 0.95 + r() * 0.1), (x0 + x1) / 2, G, (-half + z1) / 2, { tex: 'concrete', bevel: 0.035, edge: 1.3 });
    }
    // Left strip: x from -half to left, z from back to +half.
    for (let j = 0; j < 2; j++) {
      const z0 = l.back + ((half - l.back) * j) / 2;
      const z1 = l.back + ((half - l.back) * (j + 1)) / 2;
      const x1 = l.left + (r() - 0.5) * 0.08;
      k.block(x1 + half, l.top - G + (r() - 0.5) * 0.04, z1 - z0 + 0.01, tint(col, 0.95 + r() * 0.1), (-half + x1) / 2, G, (z0 + z1) / 2, { tex: 'concrete', bevel: 0.035, edge: 1.3 });
    }
    if (l.right !== undefined) {
      const z1 = l.back + (half - l.back) * 0.55;
      k.block(half - l.right, l.top - G, z1 - l.back + 0.01, tint(col, 0.97), (half + l.right) / 2, G, (l.back + z1) / 2, { tex: 'concrete', bevel: 0.035, edge: 1.3 });
    }
  });
}

/** Boulders scattered at bench feet. */
function boulders(k: Kit, pts: Array<[number, number, number]>, hex: number, seed: number): void {
  const r = rng(seed);
  for (const [x, y, z] of pts) k.add(new THREE.IcosahedronGeometry(0.05 + r() * 0.05, 0), tint(hex, 0.85 + r() * 0.25), x, y + 0.04, z, { flat: true, rot: [r(), r(), r()] });
}

/** A site cabin (portakabin) facing +z. */
function cabin(k: Kit, x: number, z: number, hex: number, trim: number): void {
  k.block(0.5, 0.24, 0.26, hex, x, G + 0.03, z, { tex: 'panels', bevel: 0.015 });
  k.box(0.52, 0.02, 0.28, trim, x, G + 0.28, z, { flat: true });
  k.windows(2, 0.24, G + 0.17, 'z', z + 0.131, { frame: C.metalDark, cx: x - 0.06, w: 0.1, h: 0.07 });
  k.box(0.08, 0.17, 0.012, C.metalDark, x + 0.17, G + 0.115, z + 0.134, { flat: true });
  for (const sx of [-0.2, 0.2]) k.block(0.04, 0.03, 0.22, C.concrete, x + sx, G, z, { flat: true });
}

/** Quarry (3 x 3): pale stone benches stepping up round a working floor, a derrick, a crusher on a conveyor, a gravel pile, cut blocks, an excavator and a dump truck. */
function quarry(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, 0xb8b0a0);
  const stone = [0xcfc6b4, 0xbdb4a2, 0xd8d0c0];
  benches(k, [
    { top: 0.34, back: -0.55, left: -0.6, right: 1.0 },
    { top: 0.6, back: -0.95, left: -1.0 },
    { top: 0.84, back: -1.25, left: -1.28 },
  ], 1.48, stone, v + 11);
  // Haul ramp from the floor up to the first bench.
  k.add(prism([[-1.42, 0], [-0.55, 0], [-0.55, 0.23]], 0.42, 'x', 0.9), 0xa89e8a, -1.15, G, 0, { tex: 'concrete', flat: true });
  k.box(0.42, 0.01, 0.4, 0xa89e8a, -1.15, 0.34, 0.35, { flat: true, tex: 'concrete' });
  boulders(k, [[-0.5, G, -0.4], [-0.45, G, 0.25], [0.95, G, -0.45], [0.2, 0.34, -0.6], [-0.9, 0.6, -0.9], [0.6, 0.6, -1.0]], 0xc8c0ae, v);
  // Excavator on the first bench, a dump truck under it.
  excavator(k, 0.15, -0.78, 0.2, 0.34, C.hazard, -1.1);
  truck(k, 0.35, -0.05, 0.25, C.hazard, 'tipper', 0xc9a227);
  // A derrick crane on the top bench lifting a block.
  const dx = -1.05, dz = -1.2;
  k.cyl(0.02, 0.025, 1.0, 6, C.hazard, dx, 0.84 + 0.5, dz, { surface: 'gloss' });
  bar(k, [dx, 0.95, dz], [dx + 0.95, 1.25, dz + 0.55], 0.035, 0.035, C.hazard, { surface: 'gloss' });
  strut(k, [dx, 1.34, dz], [dx + 0.95, 1.25, dz + 0.55], 0.004, 0x222222, 3);
  for (const [gx, gz] of [[-1.42, -0.6], [-0.4, -1.42]] as const) strut(k, [dx, 1.34, dz], [gx, 0.6, gz], 0.003, 0x222222, 3);
  strut(k, [dx + 0.95, 1.25, dz + 0.55], [dx + 0.95, 0.62, dz + 0.55], 0.004, 0x222222, 3);
  k.block(0.2, 0.12, 0.14, 0xd8d0c0, dx + 0.95, 0.48, dz + 0.55, { bevel: 0.015, tex: 'concrete' });
  // Cut dimension stone blocks stacked on the floor.
  const r = rng(v + 5);
  for (let i = 0; i < 7; i++) {
    const bx2 = -0.25 + (i % 4) * 0.22;
    const by = G + Math.floor(i / 4) * 0.13;
    k.block(0.2, 0.12, 0.15, tint(0xdcd4c4, 0.92 + r() * 0.12), bx2 + (i >= 4 ? 0.1 : 0), by, 1.25, { bevel: 0.015, tex: 'concrete', edge: 1.2 });
  }
  // Crusher: a jaw crusher on a steel stand under a V hopper fed by a conveyor from the pit; it drops onto a gravel cone.
  const cx = 0.95, cz = 0.75;
  lattice(k, cx, G, cz, 0.34, 0.34, 0.36, C.steelBlue, { bays: 1 });
  k.block(0.4, 0.035, 0.4, C.steelBlue, cx, G + 0.36, cz);
  k.block(0.26, 0.2, 0.24, 0x5a5f66, cx, G + 0.395, cz, { bevel: 0.02 });
  k.block(0.27, 0.05, 0.25, team, cx, G + 0.5, cz, { flat: true });
  k.cylZ(0.07, 0.3, 10, 0x3a3e44, cx + 0.1, G + 0.5, cz);
  k.block(0.3, 0.16, 0.3, C.hazard, cx, G + 0.6, cz, { taper: -0.4, bevel: 0.012 });
  k.box(0.36, 0.012, 0.36, 0x3a3630, cx, G + 0.755, cz, { flat: true });
  for (let i = 0; i < 4; i++) k.add(new THREE.IcosahedronGeometry(0.035, 0), 0xb0a690, cx - 0.08 + i * 0.05, G + 0.77, cz + (i % 2) * 0.05 - 0.02, { flat: true, rot: [i, i * 2, 0] });
  conveyor(k, [cx - 0.12, G + 0.3, cz + 0.12], [0.08, G + 0.62, 0.58], 0.1, { frame: C.hazard });
  heap(k, -0.02, 0.55, 0.38, 0.5, 0x9a907e, v + 2);
  conveyor(k, [cx + 0.05, G + 0.12, cz - 0.75], [cx, G + 0.74, cz - 0.12], 0.1, { frame: C.hazard });
  k.block(0.3, 0.14, 0.24, C.hazard, cx + 0.05, G, cz - 0.82, { taper: -0.3, bevel: 0.01 });
  // A rock drill on the second bench (a tracked carrier with a tall mast), a pool on the pit floor.
  const dr = new Frame(k, 0.55, -1.1, 0.3, 0.6 - G);
  for (const s of [-1, 1]) dr.block(0.24, 0.05, 0.05, 0x2a2a2a, 0, G, s * 0.07, { bevel: 0.015 });
  dr.block(0.2, 0.08, 0.14, 0xc0392b, 0, G + 0.05, 0, { bevel: 0.02, surface: 'gloss' });
  dr.block(0.04, 0.42, 0.04, 0xc0392b, 0.1, G + 0.08, 0, { surface: 'gloss' });
  dr.box(0.012, 0.3, 0.012, C.metal, 0.12, G + 0.3, 0, { surface: 'gloss' });
  k.box(0.38, 0.012, 0.26, 0x4a7a7a, 0.4, G + 0.006, 0.35, { surface: 'glass', flat: true });
  cabin(k, -0.6, 1.2, 0xe8e0c8, team);
  floodlight(k, 1.35, 1.35, 1.0, -0.8);
  return k.build();
}

/** Iron mine (3 x 3): a steel headframe with turning sheave wheels, a brick winding house, an ore bin over a track with ore cars, an ore pile. */
function ironMine(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, 0x7a6858);
  // Headframe over the shaft: lattice tower, raking back legs, a sheave deck.
  const hx = -0.6, hz = -0.55, H = 1.85;
  const steel = pick([0x7a3a2a, 0x3c4146, 0x5d7486], v, 1);
  k.block(0.7, 0.08, 0.7, C.concrete, hx, G, hz, { tex: 'concrete', bevel: 0.02 });
  lattice(k, hx, G + 0.08, hz, 0.46, 0.46, H - 0.08, steel, { bays: 4, taper: 0.15, r: 0.022 });
  for (const s of [-1, 1]) strut(k, [hx + 0.18, G + H, hz + s * 0.17], [hx + 0.95, G, hz + s * 0.26], 0.025, steel, 6, { surface: 'gloss' });
  for (const t of [0.35, 0.65]) bar(k, [hx + 0.18 + 0.77 * t, G + H * (1 - t), hz - 0.17 - 0.09 * t], [hx + 0.18 + 0.77 * t, G + H * (1 - t), hz + 0.17 + 0.09 * t], 0.02, 0.02, steel, { surface: 'gloss' });
  k.block(0.52, 0.04, 0.52, steel, hx, G + H, hz, { surface: 'gloss' });
  k.box(0.52, 0.06, 0.008, C.hazard, hx, G + H + 0.08, hz + 0.26, { flat: true });
  k.box(0.04, 0.03, 0.04, 0xff4a2a, hx - 0.2, G + H + 0.06, hz + 0.2, { glow: 1 });
  // Two sheave wheels (turning about z), built flat about their axle.
  const wheels: Vec3[] = [];
  for (const s of [-1, 1]) {
    const at: Vec3 = [hx + 0.05, G + H + 0.22, hz + s * 0.11];
    wheels.push(at);
    const w = k.part('spin', at);
    w.add(new THREE.TorusGeometry(0.19, 0.022, 4, 16), 0x2a2d30, 0, 0, 0, { rot: [Math.PI / 2, 0, 0], surface: 'gloss', flat: true });
    for (let i = 0; i < 3; i++) w.box(0.36, 0.012, 0.02, C.metal, 0, 0, 0, { rot: [0, (i * Math.PI) / 3, 0], surface: 'gloss', flat: true });
    w.cyl(0.035, 0.035, 0.04, 8, C.metal, 0, 0, 0, { surface: 'gloss', flat: true });
    k.box(0.04, 0.2, 0.02, steel, hx + 0.05, G + H + 0.12, hz + s * 0.11 + s * 0.035, { surface: 'gloss' });
    // Winding ropes down to the winding house.
    strut(k, [hx + 0.2, G + H + 0.28, hz + s * 0.11], [0.45, G + 0.62, hz + s * 0.11], 0.005, 0x1e1e1e, 3);
    strut(k, [hx - 0.13, G + H + 0.2, hz + s * 0.11], [hx - 0.13, G + 0.5, hz + s * 0.11], 0.005, 0x1e1e1e, 3);
  }
  // Pithead shed round the tower's foot.
  k.block(0.36, 0.38, 0.4, C.steelBlue, hx - 0.05, G + 0.08, hz + 0.05, { tex: 'panels', bevel: 0.015 });
  k.gable(0.36, 0.4, 0.12, C.roofSlate, hx - 0.05, G + 0.46, hz + 0.05, { tex: 'panels' });
  rollerDoor(k, hx - 0.05, G + 0.08, hz + 0.26, 0.2, 0.24);
  // Winding house: brick, tall windows, slate roof, an engine-house chimney.
  const wx = 0.85, wz = -0.68;
  k.block(0.98, 0.06, 0.8, C.concrete, wx, G, wz, { tex: 'concrete' });
  k.block(0.94, 0.58, 0.76, pick([C.brick, C.brickDark, 0x9a6a50], v, 2), wx, G + 0.06, wz, { tex: 'brick' });
  k.box(0.98, 0.04, 0.8, C.trim, wx, G + 0.62, wz, { flat: true });
  k.gable(0.94, 0.76, 0.32, C.roofSlate, wx, G + 0.64, wz, { over: 0.06 });
  k.windows(3, 0.56, G + 0.36, 'z', wz + 0.385, { frame: C.trim, cx: wx, w: 0.12, h: 0.28 });
  k.windows(2, 0.4, G + 0.36, 'x', wx + 0.475, { frame: C.trim, cx: wz, w: 0.12, h: 0.28 });
  k.box(0.32, 0.1, 0.02, team, wx, G + 0.84, wz + 0.39, { flat: true, surface: 'gloss' });
  chimney(k, wx + 0.33, wz - 0.25, 1.15, 0.09, C.brickDark, G);
  // Ore bin on legs over a track, a conveyor feeding it from the pithead, ore cars below.
  const ox = -0.55, oz = 0.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.block(0.04, 0.42, 0.04, steel, ox + sx * 0.2, G, oz + sz * 0.17, { surface: 'gloss' });
  k.box(0.5, 0.3, 0.44, C.timber, ox, G + 0.6, oz, { taper: -0.25, tex: 'planks', bevel: 0.015 });
  k.box(0.12, 0.08, 0.12, 0x5a3a2a, ox, G + 0.42, oz, { taper: 0.3 });
  conveyor(k, [hx + 0.05, G + 0.3, hz + 0.32], [ox, G + 0.78, oz - 0.15], 0.1, { frame: C.metal, cover: tint(C.steelBlue, 0.9) });
  track(k, 0.0, oz, 2.9, true);
  for (const x of [-0.55, 0.0]) {
    k.box(0.36, 0.14, 0.2, 0x5a5048, x, G + 0.13, oz, { taper: -0.12, surface: 'gloss', bevel: 0.01 });
    for (const s of [-1, 1]) k.cylZ(0.035, 0.2, 8, 0x2a2a2a, x + s * 0.11, G + 0.06, oz, { surface: 'gloss' });
    if (x < 0) continue;
    for (let i = 0; i < 4; i++) k.add(new THREE.IcosahedronGeometry(0.05, 0), 0x9a4a32, x - 0.1 + i * 0.065, G + 0.22, oz + (i % 2) * 0.04 - 0.02, { flat: true, rot: [i, i * 2, 0] });
  }
  // Ore pile with a stacker conveyor, and a tipper loading from it.
  heap(k, 0.85, 0.65, 0.48, 0.48, 0x9a4a32, v + 4);
  conveyor(k, [0.3, G + 0.18, 0.62], [0.82, G + 0.58, 0.64], 0.09, { frame: C.hazard });
  truck(k, 0.65, 1.22, Math.PI, pick([0xd4a017, team, 0xb03a2e], v, 6), 'tipper', 0x9a8a7a, 0.95);
  floodlight(k, -1.3, 1.3, 1.1, -0.8);
  drums(k, -1.35, -0.05, 3, 0x6a7a5a, undefined, false);
  const g = k.build();
  for (const at of wheels) tilt(g, at, 'z');
  return g;
}

/** Oil well (2 x 2): a pumpjack (rocking beam with horsehead, turning crank with counterweights), wellhead, stock tanks, a guard rail. */
function oilWell(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 2, 2, 0x8a8478);
  k.box(1.5, 0.02, 0.62, 0x6f6a62, -0.1, G + 0.01, 0.05, { tex: 'concrete', flat: true });
  k.add(new THREE.CircleGeometry(0.22, 9).rotateX(-Math.PI / 2), 0x2a2622, 0.7, G + 0.022, 0.25, { flat: true });
  const paint = pick([team, 0xd4a017, 0x3a6a9a, 0xb03a2e], v, 1);
  // Skid base and the Samson post (an A-frame).
  k.block(1.3, 0.06, 0.1, C.metalDark, -0.15, G + 0.02, 0, { surface: 'gloss' });
  for (const s of [-1, 1]) k.block(1.3, 0.04, 0.04, C.metalDark, -0.15, G + 0.02, s * 0.14, { surface: 'gloss' });
  const P: Vec3 = [0, G + 0.86, 0];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) strut(k, [sx * 0.16, G + 0.08, sz * 0.14], [0, P[1] - 0.04, sz * 0.05], 0.022, paint, 5, { surface: 'gloss' });
  k.box(0.08, 0.06, 0.14, C.metalDark, 0, P[1] - 0.04, 0, { surface: 'gloss' });
  // The walking beam ('beam' rocks about z at the bearing), horsehead, bridle and pitman arms.
  const b = k.part('beam', P);
  b.box(1.3, 0.07, 0.07, paint, 0.08, 0.04, 0, { surface: 'gloss', bevel: 0.012 });
  b.box(1.1, 0.016, 0.1, tint(paint, 0.8), 0.08, 0.08, 0, { flat: true });
  b.add(prism([[0.66, 0.08], [0.66, -0.08], [0.72, -0.28], [0.8, -0.22], [0.85, -0.08], [0.8, 0.05]], 0.1, 'z'), paint, 0, 0, 0, { surface: 'gloss', flat: true });
  b.box(0.01, 0.34, 0.1, C.metalDark, 0.83, -0.12, 0, { flat: true, surface: 'gloss', rot: [0, 0, 0.18] });
  for (const s of [-1, 1]) b.box(0.008, 0.36, 0.008, 0x222222, 0.86, -0.27, s * 0.025, { flat: true });
  b.box(0.04, 0.015, 0.08, C.metalDark, 0.86, -0.45, 0, { flat: true });
  b.box(0.2, 0.05, 0.3, C.metalDark, -0.56, 0.0, 0, { surface: 'gloss' });
  for (const s of [-1, 1]) b.box(0.03, 0.42, 0.025, paint, -0.56, -0.23, s * 0.14, { surface: 'gloss' });
  // Crank ('crank' turns about z): arms either side with heavy counterweights.
  const cY = G + 0.42;
  const cr = k.part('crank', [-0.56, cY, 0]);
  for (const s of [-1, 1]) {
    cr.box(0.36, 0.06, 0.03, C.metalDark, 0.05, 0, s * 0.19, { surface: 'gloss' });
    cr.add(prism([[-0.1, -0.06], [0.1, -0.06], [0.12, 0.08], [-0.12, 0.08]], 0.05, 'z'), 0x4a4f55, -0.2, 0, s * 0.19, { flat: true, surface: 'gloss' });
    cr.box(0.24, 0.025, 0.052, paint, -0.2, 0.09, s * 0.19, { flat: true });
  }
  cr.cylZ(0.04, 0.42, 8, C.metal, 0, 0, 0, { surface: 'gloss' });
  // Gear reducer under the crank, the motor and its belt guard.
  k.block(0.22, 0.28, 0.2, 0x4a4f55, -0.56, G + 0.08, 0, { surface: 'gloss', bevel: 0.02 });
  k.block(0.2, 0.14, 0.14, 0x3a6a4a, -0.88, G + 0.08, 0, { surface: 'gloss', bevel: 0.02 });
  k.box(0.32, 0.08, 0.05, C.hazard, -0.74, G + 0.24, 0.11, { rot: [0, 0, 0.35], flat: true });
  // Wellhead under the horsehead: a valve tree with red handwheels, a flowline to the tanks.
  const wx = 0.86;
  k.cyl(0.06, 0.07, 0.04, 8, C.metalDark, wx, G + 0.02, 0, { surface: 'gloss' });
  k.cyl(0.025, 0.025, 0.36, 6, C.metal, wx, G + 0.2, 0, { surface: 'gloss' });
  for (const y of [0.1, 0.22]) {
    k.cyl(0.045, 0.045, 0.035, 8, C.metalDark, wx, G + y, 0, { surface: 'gloss' });
    k.add(new THREE.TorusGeometry(0.035, 0.008, 3, 8), 0xc0392b, wx, G + y, 0.06, { flat: true });
  }
  pipe(k, [[wx, G + 0.16, 0], [wx - 0.02, G + 0.16, -0.45], [0.2, G + 0.16, -0.62]], 0.018, C.metal);
  // Stock tanks with a catwalk, a separator.
  for (const x of [-0.55, -0.08]) tank(k, x, -0.68, 0.2, 0.5, pick([0x6a6a5a, 0x8a8a7a, 0x4a5a4a], v, 3), { band: team, ladder: 'z', roof: 'flat' });
  k.box(0.75, 0.02, 0.1, C.metalDark, -0.32, G + 0.6, -0.42, { flat: true, surface: 'gloss' });
  k.cyl(0.07, 0.07, 0.3, 8, C.metal, 0.45, G + 0.2, -0.75, { surface: 'gloss' });
  k.dome(0.07, C.metal, 0.45, G + 0.35, -0.75, 8, { surface: 'gloss' });
  // Guard rail round the crank, a warning sign, a floodlight.
  for (const [x, z] of [[-1.0, -0.32], [-1.0, 0.32], [-0.18, 0.32], [-0.18, -0.32]] as const) k.block(0.025, 0.2, 0.025, C.hazard, x, G, z, { flat: true });
  for (const z of [-0.32, 0.32]) k.box(0.82, 0.02, 0.02, C.hazard, -0.59, G + 0.18, z, { flat: true });
  k.box(0.02, 0.02, 0.64, C.hazard, -1.0, G + 0.18, 0, { flat: true });
  sign(k, 0.55, 0.85, 0.32, team, 0.3);
  floodlight(k, -0.85, 0.85, 0.9, -0.8);
  return k.build();
}

/** Ring benches round a pit (all four sides; the front lower), base square of `half`. */
function pitRings(k: Kit, cx: number, cz: number, half: number, levels: Array<{ inner: number; top: number }>, hex: number[], seed: number): void {
  const r = rng(seed);
  levels.forEach((l, i) => {
    const col = hex[i % hex.length]!;
    const w = half - l.inner;
    const o = { tex: 'concrete' as const, bevel: 0.03, edge: 1.3 };
    const h = l.top - G;
    const hf = i === 0 ? h : h * 0.45; // front stays low so the camera sees in
    k.block(2 * half, h + (r() - 0.5) * 0.03, w, tint(col, 0.96 + r() * 0.08), cx, G, cz - l.inner - w / 2, o);
    k.block(w, h, 2 * l.inner, tint(col, 0.94 + r() * 0.08), cx - l.inner - w / 2, G, cz, o);
    k.block(w, h * 0.8, 2 * l.inner, tint(col, 0.94 + r() * 0.08), cx + l.inner + w / 2, G, cz, o);
    if (i < 2) k.block(2 * half, hf, w, tint(col, 0.95 + r() * 0.08), cx, G, cz + l.inner + w / 2, o);
  });
}

/** Open-pit mine shared by rare earths and uranium: terraced pit, haul truck, excavator, conveyor. */
function openPit(k: Kit, team: number, v: number, earth: number[], heapHex: number, heapGlow: number): void {
  lot(k, 3, 3, tint(earth[0]!, 0.8));
  const cx = -0.42, cz = -0.42;
  pitRings(k, cx, cz, 1.05, [{ inner: 0.42, top: 0.24 }, { inner: 0.68, top: 0.44 }, { inner: 0.88, top: 0.62 }], earth, v);
  k.box(0.84, 0.01, 0.84, tint(earth[1]!, 0.7), cx, G + 0.005, cz, { flat: true, tex: 'concrete' });
  k.box(0.36, 0.012, 0.28, 0x3f6a6a, cx + 0.15, G + 0.012, cz - 0.15, { surface: 'glass', glow: 0.05 });
  excavator(k, cx - 0.12, cz + 0.05, 0.4, G, C.hazard, 0.9);
  truck(k, cx + 0.15, cz + 0.55, 0, C.hazard, 'tipper', tint(earth[1]!, 1.1), 1.0);
  conveyor(k, [cx + 0.25, G + 0.08, cz - 0.1], [0.95, G + 0.7, -0.15], 0.1, { frame: C.metal, cover: C.white });
  heap(k, 1.05, 1.0, 0.36, 0.42, heapHex, v + 9, { glow: heapGlow });
  floodlight(k, -1.35, 1.35, 1.1, -0.8);
  floodlight(k, 0.65, -1.35, 1.1, 0.8);
  sign(k, -0.85, 1.3, 0.4, team, 0.32);
}

/** Rare-earth mine (3 x 3, Digital): terraced pit, a clean processing plant with separation tanks and green ponds. */
function rareEarthMine(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  openPit(k, team, v, [0x9a6a4a, 0x8a5a40, 0xa87a58], 0x4fb88a, 0.25);
  // Processing plant: white panel hall, a team band, glazed strip.
  const px = 1.0, pz = -0.15;
  k.block(0.82, 0.62, 1.02, C.white, px, G, pz, { tex: 'panels', bevel: 0.03 });
  k.box(0.84, 0.08, 1.04, team, px, G + 0.52, pz, { flat: true, surface: 'gloss' });
  ribbon(k, px + 0.415, G + 0.33, pz, 0.9, 0.1, 'x', 0x8fd0e0);
  flatRoof(k, 0.82, 1.02, C.concreteLight, px, G + 0.62, pz, { units: 3, seed: v });
  // Separation tanks with green liquor, a pond.
  for (const z of [-1.05, -0.62]) {
    const x = 1.15;
    k.cyl(0.2, 0.2, 0.2, 14, C.white, x - 0.0, G + 0.1, z - 0.1, { bevel: 0.015, surface: 'gloss' });
    k.cyl(0.18, 0.18, 0.01, 14, 0x3fd0a0, x, G + 0.205, z - 0.1, { glow: 0.5, surface: 'glass' });
  }
  pipe(k, [[1.15, G + 0.22, -1.15], [0.62, G + 0.3, -1.15], [0.62, G + 0.5, -0.65]], 0.016, C.metal);
  k.box(0.5, 0.03, 0.42, C.concreteLight, 0.15, G + 0.015, 1.15, { flat: true, tex: 'concrete' });
  k.box(0.44, 0.012, 0.36, 0x3fb890, 0.15, G + 0.034, 1.15, { glow: 0.35, surface: 'glass' });
  return k.build();
}

/** Uranium mine (3 x 3, Digital): terraced pit, a mill with a tall stack, yellowcake drums, hazard fencing and warning lamps. */
function uraniumMine(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  openPit(k, team, v, [0x8a8070, 0x7a7262, 0x9a9080], 0xc8e040, 0.45);
  // Mill: concrete hall with hazard stripes, a stack.
  const px = 1.0, pz = -0.3;
  k.block(0.82, 0.55, 0.9, 0xc9c4b4, px, G, pz, { tex: 'concrete', bevel: 0.03 });
  for (let i = 0; i < 6; i++) k.box(0.14, 0.05, 0.012, i % 2 ? 0x2a2a2a : C.hazard, px - 0.35 + i * 0.14, G + 0.5, pz + 0.456, { flat: true });
  ribbon(k, px + 0.415, G + 0.3, pz, 0.8, 0.09, 'x', 0xd8e890, C.metalDark, 0.4);
  flatRoof(k, 0.82, 0.9, C.concreteLight, px, G + 0.55, pz, { units: 2, seed: v + 1 });
  chimney(k, px + 0.2, pz - 0.75, 1.6, 0.08, C.concreteLight, G);
  k.cyl(0.085, 0.085, 0.06, 10, 0xc0392b, px + 0.2, G + 1.4, pz - 0.75, { flat: true });
  k.box(0.03, 0.03, 0.03, 0xff3a2a, px + 0.2, G + 1.68, pz - 0.75, { glow: 1 });
  // Yellowcake drums on pallets behind a hazard fence with warning lamps.
  for (let row = 0; row < 2; row++) drums(k, -0.05 + row * 0.0, 1.0 + row * 0.11, 5, 0xe0c020, 0x2a2a2a);
  wireFence(k, 0.15, 0.82, 1.2, true, 0.2, C.hazard);
  for (const x of [-0.45, 0.75]) k.box(0.035, 0.035, 0.035, 0xffb020, x, G + 0.24, 0.82, { glow: 1 });
  // Radiation sign: a yellow board with a black trefoil.
  const sx = 0.62, sz = 1.32;
  k.block(0.025, 0.3, 0.025, C.metalDark, sx, G, sz, { flat: true });
  k.box(0.22, 0.22, 0.02, C.hazard, sx, G + 0.38, sz + 0.02, { bevel: 0.01 });
  for (let i = 0; i < 3; i++) k.box(0.05, 0.075, 0.01, 0x1e1e1e, sx + Math.sin((i * 2 * Math.PI) / 3) * 0.05, G + 0.38 + Math.cos((i * 2 * Math.PI) / 3) * 0.05, sz + 0.032, { flat: true, rot: [0, 0, (-i * 2 * Math.PI) / 3] });
  k.cylZ(0.018, 0.012, 8, 0x1e1e1e, sx, G + 0.38, sz + 0.034);
  return k.build();
}

// ---------------------------------------------------------------------------
// Industry

/** Food plant (3 x 3): a white processing hall with a dock and a reefer truck, stainless silos on legs with an elevator, a stack. */
function foodPlant(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, C.paving);
  const hx = -0.4, hz = -0.35, hw = 1.9, hd = 1.4, hh = 0.72;
  k.block(hw + 0.04, 0.06, hd + 0.04, C.concrete, hx, G, hz, { tex: 'concrete' });
  k.block(hw, hh, hd, 0xece8de, hx, G + 0.06, hz, { tex: 'panels' });
  k.box(hw + 0.02, 0.1, hd + 0.02, team, hx, G + hh - 0.02, hz, { flat: true, surface: 'gloss' });
  pilasters(k, hx - hw / 2, hx + hw / 2, hz + hd / 2, G + 0.06, hh - 0.12, 6, 0xd8d4ca);
  flatRoof(k, hw, hd, C.concreteLight, hx, G + 0.06 + hh, hz, { units: 6, seed: v + 3 });
  ribbon(k, hx + hw / 2 + 0.01, G + 0.45, hz - 0.1, 1.0, 0.12, 'x');
  // Loading dock with a reefer truck backed in.
  dock(k, hx + 0.35, hz + hd / 2, 1.0, 2, 0.34, team);
  truck(k, hx + 0.1, hz + hd / 2 + 0.75, -Math.PI / 2, pick([0xecf0f1, 0x2e86c1, team], v, 5), 'reefer', C.white, 1.0);
  // Office end with an entrance and a lit sign.
  k.block(0.5, 0.5, 0.06, 0x8fb8d0, hx - 0.65, G + 0.06, hz + hd / 2 + 0.03, { surface: 'glass', tex: 'glass', glow: 0.3 });
  k.box(0.6, 0.03, 0.22, C.white, hx - 0.65, G + 0.58, hz + hd / 2 + 0.11, { bevel: 0.01 });
  k.box(0.56, 0.1, 0.015, team, hx - 0.65, G + 0.66, hz + hd / 2 + 0.02, { flat: true });
  k.box(0.4, 0.035, 0.01, C.white, hx - 0.65, G + 0.66, hz + hd / 2 + 0.03, { glow: 0.8 });
  // Silos on legs with conical hoppers, a bucket elevator and a bridge onto the roof.
  const sx = 1.08;
  for (const z of [-1.05, -0.5, 0.05]) {
    for (const [lx, lz] of [[-0.14, -0.14], [0.14, -0.14], [0.14, 0.14], [-0.14, 0.14]] as const) k.block(0.025, 0.42, 0.025, C.metalDark, sx + lx, G, z + lz, { surface: 'gloss' });
    k.cone(0.22, 0.24, 14, C.metal, sx, G + 0.42, z, { rot: [Math.PI, 0, 0], surface: 'gloss' });
    k.cyl(0.22, 0.22, 1.05, 14, 0xc8cdd2, sx, G + 0.54 + 0.525, z, { surface: 'gloss', tex: 'panels', bevel: 0.015 });
    k.cone(0.23, 0.12, 14, C.metal, sx, G + 1.65, z, { surface: 'gloss' });
  }
  k.block(0.12, 1.95, 0.12, C.hazard, sx + 0.33, G, -0.5, { surface: 'gloss', bevel: 0.01 });
  k.block(0.18, 0.12, 0.16, C.hazard, sx + 0.3, G + 1.95, -0.5, { surface: 'gloss', bevel: 0.01 });
  k.box(0.08, 0.06, 1.3, C.metalDark, sx, G + 1.75, -0.5, { surface: 'gloss' });
  conveyor(k, [sx - 0.1, G + 1.0, -0.5], [hx + hw / 2 - 0.1, G + hh + 0.15, -0.5], 0.1, { frame: C.metal, cover: C.white, legs: 0 });
  // Intake hopper with a tipper unloading crops.
  k.block(0.36, 0.06, 0.3, C.metalDark, sx + 0.05, G, 0.65, { surface: 'gloss' });
  truck(k, sx - 0.05, 1.05, Math.PI + 0.1, pick([0x3f8f3a, 0xd4a017], v, 7), 'tipper', 0xd8b850, 0.85);
  // Process stack (steam), stacked produce crates.
  chimney(k, hx - 0.7, hz - 0.45, 0.95, 0.07, C.metal, G + 0.06 + hh);
  crates(k, -1.3, 0.75, 4, 0xe08a3c);
  crates(k, -1.3, 1.2, 2, 0x6aa040);
  lamp(k, 0.55, 1.35, 0.55);
  return k.build();
}

/** Sawmill (3 x 3): an open-sided saw shed with a spinning blade over a log, a log deck, stickered lumber, a sawdust cyclone over its heap, a boiler stack. */
function sawmill(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, 0x8a7a62);
  // The saw shed: timber posts, a closed back wall, a corrugated gable roof.
  const sx = -0.25, sz = -0.5, sw = 1.9, sd = 0.95, sh = 0.72;
  k.box(sw, 0.04, sd, C.concrete, sx, G + 0.02, sz, { tex: 'concrete', flat: true });
  k.block(sw, sh, 0.06, pick([0x8a5a32, 0x7a4a2a, 0x9a6a3a], v, 1), sx, G, sz - sd / 2 + 0.03, { tex: 'planks' });
  for (let i = 0; i <= 5; i++) {
    const x = sx - sw / 2 + 0.04 + (i * (sw - 0.08)) / 5;
    k.block(0.06, sh, 0.06, C.timberDark, x, G, sz + sd / 2 - 0.03, { tex: 'planks' });
    k.block(0.05, sh, 0.05, C.timberDark, x, G, sz - sd / 2 + 0.06, { tex: 'planks' });
  }
  k.box(sw, 0.06, 0.06, C.timberDark, sx, G + sh - 0.03, sz + sd / 2 - 0.03, { tex: 'planks' });
  for (const s of [-1, 1]) k.block(0.06, sh, sd, C.timber, sx + s * (sw / 2 - 0.03), G, sz, { tex: 'planks' });
  k.gable(sw + 0.04, sd, 0.26, pick([0x5b6168, 0x6a6f74, 0x7a4a3a], v, 2), sx, G + sh, sz, { tex: 'panels', over: 0.09 });
  k.box(0.5, 0.12, 0.012, team, sx, G + sh + 0.12, sz + sd / 2 + 0.07, { flat: true, rot: [-0.3, 0, 0] });
  // Inside: the saw carriage running along rails with a log, the head saw turning.
  k.box(sw - 0.2, 0.025, 0.04, C.metal, sx, G + 0.06, sz + 0.28, { surface: 'gloss' });
  k.box(sw - 0.2, 0.025, 0.04, C.metal, sx, G + 0.06, sz + 0.44, { surface: 'gloss' });
  k.block(0.5, 0.08, 0.26, C.metalDark, sx - 0.35, G + 0.07, sz + 0.36, { surface: 'gloss' });
  k.cylX(0.1, 0.9, 8, 0x7a5232, sx - 0.4, G + 0.25, sz + 0.36, { tex: 'planks' });
  k.cylX(0.088, 0.012, 8, 0xd9b27a, sx + 0.06, G + 0.25, sz + 0.36);
  const bladeAt: Vec3 = [sx + 0.25, G + 0.3, sz + 0.36];
  const blade = k.part('spin', bladeAt);
  blade.cyl(0.24, 0.24, 0.012, 20, 0xc8ccd0, 0, 0, 0, { surface: 'gloss', flat: true });
  for (let i = 0; i < 8; i++) blade.box(0.05, 0.016, 0.03, 0x6a6e72, Math.cos((i * Math.PI) / 4) * 0.24, 0, Math.sin((i * Math.PI) / 4) * 0.24, { rot: [0, -(i * Math.PI) / 4, 0], flat: true });
  blade.cyl(0.04, 0.04, 0.03, 8, C.metalDark, 0, 0, 0, { surface: 'gloss', flat: true });
  k.block(0.14, 0.5, 0.1, C.hazard, sx + 0.25, G, sz + 0.2, { surface: 'gloss', bevel: 0.015 });
  k.box(0.06, 0.04, 0.04, 0xfff0c0, sx + 0.25, G + 0.52, sz + 0.27, { glow: 0.9 });
  // Log deck on the left, rollers into the shed.
  logPile(k, -0.7, 0.55, 1.15, 4, 0.07, true, v + 1);
  for (let i = 0; i < 4; i++) k.cylZ(0.025, 0.3, 6, C.metal, -1.25 + i * 0.12, G + 0.08, sz + 0.36, { surface: 'gloss' });
  // Stickered lumber stacks, a forklift moving a load.
  lumber(k, 0.75, 0.55, 0.85, 0.32, 5, true);
  lumber(k, 0.75, 1.05, 0.85, 0.32, 3, true, 0xc89858);
  forklift(k, 0.15, 1.15, Math.PI * 0.85);
  // Sawdust: a cyclone on a stand over a pale heap, the blower duct from the shed roof.
  const cx = 1.12, cz = -0.75;
  heap(k, cx, cz + 0.05, 0.3, 0.36, 0xe0c88a, v + 6);
  for (const [lx, lz] of [[-0.14, -0.14], [0.14, -0.14], [0.14, 0.14], [-0.14, 0.14]] as const) k.block(0.025, 0.86, 0.025, C.metalDark, cx + lx, G, cz + lz, { surface: 'gloss' });
  k.cone(0.16, 0.34, 12, C.metal, cx, G + 0.95, cz, { rot: [Math.PI, 0, 0], surface: 'gloss' });
  k.cyl(0.16, 0.16, 0.24, 12, 0xb8bec4, cx, G + 1.24, cz, { surface: 'gloss', bevel: 0.01 });
  k.cyl(0.05, 0.05, 0.12, 8, C.metal, cx, G + 1.42, cz, { surface: 'gloss' });
  pipe(k, [[sx + 0.6, G + sh + 0.2, sz], [sx + 0.6, G + 1.3, sz], [cx - 0.16, G + 1.3, cz]], 0.035, C.metal);
  // Boiler house with a brick stack (smoke).
  k.block(0.5, 0.42, 0.42, C.brick, -1.1, G, -1.2, { tex: 'brick' });
  k.gable(0.5, 0.42, 0.18, C.roofSlate, -1.1, G + 0.42, -1.2, { over: 0.05 });
  chimney(k, -1.25, -1.25, 1.35, 0.08, C.brickDark, G);
  lamp(k, 0.15, 0.35, 0.55);
  const g = k.build();
  tilt(g, bladeAt, 'z');
  return g;
}

/** Cement works (3 x 3): a preheater tower of cyclones, a long rotary kiln on tyres and piers, a row of silos, a clinker dome, a banded stack, a mixer truck. */
function cementWorks(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, 0xa8a59c);
  const dust = 0xd4d0c6;
  // Preheater tower: concrete core, steel frame, cyclones on each level, team band at the top.
  const tx = -1.0, tz = -0.9, tH = 2.1;
  k.block(0.42, tH, 0.42, dust, tx, G, tz, { tex: 'concrete', bevel: 0.02 });
  lattice(k, tx, G, tz, 0.62, 0.62, tH, 0x8a9aa8, { bays: 4, r: 0.016 });
  for (let i = 0; i < 4; i++) {
    const y = G + 0.45 + i * 0.45;
    k.block(0.66, 0.025, 0.66, C.steelBlue, tx, y - 0.04, tz, { surface: 'gloss' });
    const cxx = tx + (i % 2 ? -0.22 : 0.22);
    k.cyl(0.1, 0.1, 0.16, 10, 0xb8b4aa, cxx, y + 0.12, tz + 0.24, { surface: 'gloss' });
    k.cone(0.1, 0.16, 10, 0xb8b4aa, cxx, y - 0.04 + 0.04, tz + 0.24, { rot: [Math.PI, 0, 0], surface: 'gloss' });
  }
  k.block(0.5, 0.18, 0.5, team, tx, G + tH, tz, { bevel: 0.02, surface: 'gloss' });
  pipe(k, [[tx + 0.25, G + tH + 0.1, tz - 0.1], [tx + 0.55, G + tH + 0.1, tz - 0.1], [tx + 0.55, G + 0.3, tz - 0.1]], 0.05, 0x8a8a84);
  // Rotary kiln: a long tube sloping down from the tower, tyres on concrete piers, a glowing hood.
  const k0: Vec3 = [tx + 0.25, G + 0.55, tz + 0.55];
  const k1: Vec3 = [1.25, G + 0.32, tz + 0.55];
  strut(k, k0, k1, 0.15, 0x8a7a6a, 14, { surface: 'gloss' });
  for (const t of [0.12, 0.45, 0.8]) {
    const p: Vec3 = [k0[0] + (k1[0] - k0[0]) * t, k0[1] + (k1[1] - k0[1]) * t, k0[2]];
    strut(k, [p[0] - 0.03, p[1], p[2]], [p[0] + 0.03, p[1] - 0.004, p[2]], 0.19, 0x5a5a58, 14, { surface: 'gloss' });
    k.block(0.16, p[1] - 0.12 - G, 0.34, dust, p[0], G, p[2], { tex: 'concrete', bevel: 0.015 });
  }
  k.block(0.22, 0.5, 0.42, 0xb8b4aa, 1.3, G, k1[2], { tex: 'panels', bevel: 0.02 });
  k.box(0.012, 0.14, 0.2, 0xff8a30, 1.415, G + 0.18, k1[2], { glow: 1 });
  k.add(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 12), 0xff9a40, k1[0] - 0.08, k1[1] + 0.005, k1[2], { rot: [0, 0, Math.PI / 2 - 0.1], glow: 1 });
  // Silos along the front with a gallery across their tops and a loading bay underneath.
  const silos = [-1.05, -0.62, -0.19];
  for (const x of silos) {
    k.cyl(0.2, 0.2, 1.5, 14, 0xe0dcd2, x, G + 0.75, 0.55, { tex: 'concrete', bevel: 0.02 });
    k.cyl(0.205, 0.205, 0.05, 14, tint(dust, 0.85), x, G + 0.2, 0.55, { flat: true });
  }
  k.block(1.1, 0.14, 0.24, C.steelBlue, -0.62, G + 1.5, 0.55, { tex: 'panels', surface: 'gloss', bevel: 0.015 });
  k.box(1.1, 0.04, 0.012, team, -0.62, G + 1.58, 0.672, { flat: true });
  conveyor(k, [0.6, G + 0.62, 0.75], [-0.1, G + 1.5, 0.55], 0.1, { frame: C.metal, cover: C.steelBlue, legs: 1 });
  // Clinker storage dome.
  k.cyl(0.46, 0.46, 0.08, 16, dust, 0.85, G + 0.04, 0.75, { tex: 'concrete' });
  k.dome(0.46, 0xc8c4ba, 0.85, G + 0.08, 0.75, 16, { tex: 'concrete' });
  k.box(0.14, 0.18, 0.02, C.metalDark, 0.85, G + 0.17, 1.2, { flat: true });
  // The stack, red-and-white banded at the top, with smoke.
  const cx = 0.75, cz = -1.15;
  k.cyl(0.08, 0.11, 2.5, 10, 0xd8d4ca, cx, G + 1.25, cz, { tex: 'concrete', bevel: 0.01 });
  for (const y of [2.15, 2.35]) k.cyl(0.085, 0.085, 0.1, 10, 0xc0392b, cx, G + y, cz, { flat: true });
  k.anchor('smoke', cx, G + 2.52, cz);
  k.box(0.03, 0.03, 0.03, 0xff3a2a, cx, G + 2.53, cz + 0.06, { glow: 1 });
  // A cement mixer and dust on the yard.
  truck(k, 0.0, 1.22, 0, pick([team, 0xd4a017, 0xecf0f1], v, 4), 'mixer', 0xe8a030, 1.0);
  floodlight(k, 1.35, 0.15, 1.0, -1.2);
  return k.build();
}

/** Steel mill (4 x 4): a blast furnace with bustle pipe and skip incline, three hot-blast stoves, a long rolling-mill hall with a lit monitor roof, two stacks, ore and coke piles, a ladle car. */
function steelMill(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 4, 4, 0x86837c);
  const iron = 0x626a72;
  // Blast furnace: brick hearth, tapering steel stack with bands, throat platform, uptakes and a downcomer to a dust catcher.
  const fx = 0.95, fz = -0.9;
  k.cyl(0.42, 0.46, 0.45, 14, C.brickDark, fx, G + 0.225, fz, { tex: 'brick', bevel: 0.02 });
  k.cyl(0.28, 0.4, 1.55, 14, iron, fx, G + 0.45 + 0.775, fz, { surface: 'gloss', tex: 'panels' });
  for (const y of [0.75, 1.1, 1.45, 1.8]) k.cyl(0.4 - (y - 0.45) * 0.078 + 0.01, 0.4 - (y - 0.45) * 0.078 + 0.01, 0.03, 14, C.metalDark, fx, G + y, fz, { flat: true });
  k.add(new THREE.TorusGeometry(0.5, 0.05, 6, 16), 0x6a6e72, fx, G + 0.62, fz, { rot: [Math.PI / 2, 0, 0], surface: 'gloss', flat: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    strut(k, [fx + Math.cos(a) * 0.5, G + 0.6, fz + Math.sin(a) * 0.5], [fx + Math.cos(a) * 0.43, G + 0.4, fz + Math.sin(a) * 0.43], 0.018, C.metalDark, 4);
  }
  gallery(k, fx, G + 2.0, fz, 0.28, C.metalDark, 12);
  k.cyl(0.18, 0.28, 0.25, 12, iron, fx, G + 2.12, fz, { surface: 'gloss' });
  for (const a of [0.5, 2.0, 3.6, 5.1]) strut(k, [fx + Math.cos(a) * 0.14, G + 2.2, fz + Math.sin(a) * 0.14], [fx + Math.cos(a) * 0.08, G + 2.65, fz + Math.sin(a) * 0.08], 0.04, 0x6a6e72, 6, { surface: 'gloss' });
  k.sphere(0.1, 0x6a6e72, fx, G + 2.68, fz, 8, { surface: 'gloss' });
  pipe(k, [[fx, G + 2.7, fz], [fx + 0.55, G + 2.5, fz - 0.55], [fx + 0.6, G + 1.1, fz - 0.6]], 0.06, 0x6a6e72);
  k.cyl(0.18, 0.18, 0.5, 12, 0x6a6e72, fx + 0.6, G + 0.95, fz - 0.6, { surface: 'gloss', bevel: 0.015 });
  k.cone(0.18, 0.25, 12, 0x6a6e72, fx + 0.6, G + 0.58, fz - 0.6, { rot: [Math.PI, 0, 0], surface: 'gloss' });
  for (const [lx, lz] of [[-0.12, -0.12], [0.12, 0.12], [0.12, -0.12], [-0.12, 0.12]] as const) k.block(0.03, 0.46, 0.03, C.metalDark, fx + 0.6 + lx, G, fz - 0.6 + lz, { surface: 'gloss' });
  // Taphole glowing at the front, a runner of molten iron to a ladle car on its track.
  k.box(0.14, 0.12, 0.04, 0xffa040, fx, G + 0.14, fz + 0.45, { glow: 1 });
  k.box(0.08, 0.03, 0.5, 0xff7a20, fx, G + 0.03, fz + 0.72, { glow: 1 });
  k.box(0.14, 0.06, 0.52, 0x3a3a3a, fx, G + 0.02, fz + 0.72, { flat: true });
  track(k, 0.55, 0.12, 2.6, true);
  const lx = fx, lz = 0.12;
  k.block(0.36, 0.06, 0.2, C.metalDark, lx, G + 0.04, lz, { surface: 'gloss' });
  k.cyl(0.13, 0.1, 0.22, 12, 0x3a3a3a, lx, G + 0.21, lz, { surface: 'gloss', bevel: 0.01 });
  k.cyl(0.11, 0.11, 0.01, 12, 0xffb050, lx, G + 0.32, lz, { glow: 1 });
  // Skip incline up to the furnace top.
  bar(k, [fx - 0.9, G + 0.05, fz + 0.15], [fx - 0.15, G + 2.05, fz], 0.14, 0.06, C.steelBlue, { surface: 'gloss' });
  for (const t of [0.3, 0.6]) {
    const x = fx - 0.9 + 0.75 * t;
    k.block(0.04, 2.0 * t, 0.04, C.steelBlue, x, G, fz + 0.15 - 0.15 * t, { surface: 'gloss' });
  }
  // Three hot-blast stoves behind, domed, with a team band, and the hot-blast main to the bustle pipe.
  for (const x of [-0.75, -0.3, 0.15]) {
    k.cyl(0.21, 0.22, 1.7, 14, 0xa8aaa8, x, G + 0.85, -1.6, { surface: 'gloss', tex: 'panels', bevel: 0.01 });
    k.dome(0.21, 0xb8bab8, x, G + 1.7, -1.6, 14, { surface: 'gloss' });
    k.cyl(0.225, 0.225, 0.1, 14, team, x, G + 1.45, -1.6, { flat: true, surface: 'gloss' });
  }
  pipe(k, [[-0.75, G + 0.45, -1.35], [0.45, G + 0.45, -1.35], [fx - 0.45, G + 0.6, fz - 0.15]], 0.05, 0x6a6e72);
  // Rolling mill: a long corrugated hall with a lit monitor along the ridge and a team stripe.
  const mx = -0.45, mz = 0.95, mw = 2.9, md = 1.1, mh = 0.75;
  const clad = pick([0x9aa8b4, 0xa89c8a, 0x8fa4a0], v, 1);
  k.block(mw, 0.2, md, C.brickDark, mx, G, mz, { tex: 'brick' });
  k.block(mw, mh - 0.2, md, clad, mx, G + 0.2, mz, { tex: 'panels' });
  k.box(mw + 0.02, 0.07, md + 0.02, team, mx, G + mh - 0.08, mz, { flat: true, surface: 'gloss' });
  ribbon(k, mx - 0.2, G + 0.48, mz + md / 2 + 0.01, mw - 0.8, 0.1, 'z', 0xffd890, C.metalDark, 0.5);
  k.gable(mw, md, 0.22, 0x6a7078, mx, G + mh, mz, { tex: 'panels', over: 0.06 });
  k.block(mw - 0.4, 0.2, 0.5, clad, mx, G + mh + 0.1, mz, { tex: 'panels' });
  for (const s of [-1, 1]) k.box(mw - 0.5, 0.1, 0.02, 0xffd890, mx, G + mh + 0.2, mz + s * 0.255, { glow: 0.55, surface: 'glass' });
  k.gable(mw - 0.4, 0.5, 0.1, 0x6a7078, mx, G + mh + 0.3, mz, { tex: 'panels', over: 0.05 });
  pilasters(k, mx - mw / 2, mx + mw / 2, mz + md / 2, G + 0.2, mh - 0.3, 8, tint(clad, 0.8));
  rollerDoor(k, mx + mw / 2 + 0.01, G, mz, 0.42, 0.5, 'x', 0x8a8e92);
  k.box(0.04, 0.3, 0.3, 0xff9a40, mx + mw / 2 + 0.03, G + 0.18, mz, { glow: 0.7 });
  // Rolled slabs stacked by the door.
  for (let i = 0; i < 4; i++) k.block(0.42, 0.05, 0.16, 0x5a5e62, 1.45, G + i * 0.05, 1.3 + (i % 2) * 0.03, { surface: 'gloss', bevel: 0.01 });
  // Stacks at the back with smoke, ore and coke piles.
  chimney(k, -1.55, -1.55, 3.0, 0.15, C.brickDark, G);
  chimney(k, -1.15, -1.6, 2.6, 0.12, C.brickDark, G);
  heap(k, -1.4, -0.55, 0.42, 0.42, 0x9a4a32, v + 1);
  heap(k, -0.6, -0.5, 0.36, 0.36, 0x2a2a2c, v + 2);
  floodlight(k, 1.7, 0.1, 1.2, -1.0);
  floodlight(k, -1.8, 0.2, 1.2, 1.0);
  return k.build();
}

/** Oil refinery (4 x 4): distillation columns in a process frame, a fired heater, a pipe rack, tank farm, LPG spheres, a flare stack, a tanker at the loading rack. */
function oilRefinery(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 4, 4, 0x8c8a84);
  const white = 0xe8e8e2;
  // Distillation columns with platforms (lit at night), ladders and caps.
  const cols: Array<[number, number, number, number]> = [[-1.45, -1.4, 0.17, 2.7], [-1.0, -1.5, 0.13, 2.1], [-0.55, -1.35, 0.2, 3.0]];
  for (const [x, z, r, h] of cols) {
    k.cyl(r + 0.05, r + 0.05, 0.12, 12, C.concrete, x, G + 0.06, z, { tex: 'concrete' });
    k.cyl(r * 0.92, r, h, 10, 0xc8ccd0, x, G + h / 2, z, { surface: 'gloss', bevel: 0.02 });
    k.dome(r * 0.92, 0xd8dcde, x, G + h, z, 10, { surface: 'gloss' });
    for (let y = 0.7; y < h - 0.1; y += 0.75) {
      gallery(k, x, G + y, z, r, C.hazard, 8);
      k.box(0.03, 0.02, 0.03, 0xfff0c0, x + r + 0.06, G + y + 0.05, z + 0.03, { glow: 1 });
    }
    ladder(k, x, G, G + h, z + r + 0.015, 'z', C.hazard);
  }
  // Process frame between the columns with vessels and exchangers on its decks.
  lattice(k, -1.0, G, -0.75, 1.1, 0.5, 1.2, C.steelBlue, { bays: 2, r: 0.016 });
  for (const y of [0.6, 1.2]) k.block(1.14, 0.025, 0.54, C.steelBlue, -1.0, G + y, -0.75, { surface: 'gloss' });
  k.cylX(0.09, 0.7, 10, white, -1.05, G + 0.75, -0.75, { surface: 'gloss' });
  k.cylX(0.07, 0.5, 10, 0xb8bcc0, -0.95, G + 1.32, -0.8, { surface: 'gloss' });
  k.cylX(0.07, 0.5, 10, 0xb8bcc0, -0.95, G + 0.2, -0.65, { surface: 'gloss' });
  // Fired heater: a box with burner glow and a tall stack.
  const hx = 0.2, hz = -1.3;
  k.block(0.62, 0.62, 0.42, 0x8a5a4a, hx, G, hz, { tex: 'panels', bevel: 0.02 });
  k.box(0.5, 0.06, 0.012, 0xff8a30, hx, G + 0.08, hz + 0.215, { glow: 1 });
  k.block(0.3, 0.2, 0.3, 0x7a4a3a, hx, G + 0.62, hz, { taper: 0.3, bevel: 0.02 });
  k.cyl(0.07, 0.08, 1.1, 10, 0x5a5e62, hx, G + 0.82 + 0.55, hz, { surface: 'gloss' });
  k.cyl(0.075, 0.075, 0.08, 10, 0xc0392b, hx, G + 1.8, hz, { flat: true });
  k.anchor('smoke', hx, G + 1.95, hz);
  // The pipe rack across the site.
  pipeRack(k, -1.85, -0.25, 1.4, -0.25, G + 0.42, [0x9aa0a6, C.hazard, white, 0x5a8a5a, 0x9aa0a6], C.steelBlue);
  pipe(k, [[-0.55, G + 0.3, -1.12], [-0.55, G + 0.5, -0.32]], 0.03, 0x9aa0a6);
  pipe(k, [[hx, G + 0.3, hz + 0.2], [hx, G + 0.5, -0.3]], 0.03, C.hazard);
  // Tank farm: floating-roof tanks with a team band and ladders.
  for (const [x, z, r] of [[0.55, 0.6, 0.42], [1.45, 0.62, 0.4], [1.05, 1.48, 0.38]] as const) {
    tank(k, x, z, r, 0.5, white, { band: team, ladder: 'z', roof: 'flat', seg: 16 });
    k.cyl(r - 0.03, r - 0.03, 0.01, 10, 0xa0a4a8, x, G + 0.552, z, { surface: 'gloss' });
  }
  k.box(0.04, 0.02, 1.0, C.metalDark, 1.0, G + 0.62, 0.62, { flat: true });
  // LPG spheres.
  sphereTank(k, -1.35, 0.6, 0.3, white, team);
  sphereTank(k, -0.6, 0.65, 0.28, white, team);
  // Tanker loading rack with a road tanker.
  k.block(0.08, 0.5, 0.08, C.steelBlue, -1.05, G, 1.35, { surface: 'gloss' });
  k.box(0.9, 0.04, 0.3, C.steelBlue, -0.75, G + 0.5, 1.4, { surface: 'gloss' });
  strut(k, [-0.75, G + 0.5, 1.4], [-0.75, G + 0.33, 1.55], 0.015, 0x2a2a2a, 4);
  truck(k, -0.75, 1.55, 0, pick([0xecf0f1, team, 0xd4a017], v, 3), 'tanker', pick([0xe8e8e2, 0xc0392b, 0xd4a017], v, 4), 1.0);
  // Flare stack: a guyed derrick with the flame ('flare' flickers about its base).
  const fx = 1.55, fz = -1.5, fh = 2.7;
  lattice(k, fx, G, fz, 0.22, 0.22, fh - 0.3, 0xc0392b, { bays: 3, taper: 0.4, r: 0.013 });
  k.cyl(0.035, 0.035, fh, 8, 0x8a8e92, fx, G + fh / 2, fz, { surface: 'gloss' });
  k.cyl(0.05, 0.04, 0.08, 8, C.metalDark, fx, G + fh, fz, { surface: 'gloss' });
  for (const [gx, gz] of [[1.9, -0.9], [0.9, -1.9], [1.95, -1.95]] as const) strut(k, [fx, G + fh * 0.8, fz], [gx, G, gz], 0.003, 0x2a2a2a, 3);
  const fl = k.part('flare', [fx, G + fh + 0.04, fz]);
  fl.cone(0.08, 0.36, 7, 0xff9a30, 0, 0.18, 0, { glow: 1 });
  fl.cone(0.045, 0.22, 6, 0xffe080, 0, 0.12, 0.012, { glow: 1 });
  // Control room.
  k.block(0.5, 0.32, 0.36, C.white, 0.75, G, -0.75, { tex: 'panels', bevel: 0.02 });
  ribbon(k, 0.75, G + 0.2, -0.75 + 0.185, 0.42, 0.08, 'z');
  k.box(0.52, 0.04, 0.38, team, 0.75, G + 0.33, -0.75, { flat: true });
  floodlight(k, 1.85, 0.0, 1.2, -1.2);
  return k.build();
}

/** Goods factory (3 x 3): a brick sawtooth hall with glazed north lights, a two-storey office with the company sign, a loading dock with a box truck, a brick stack. */
function goodsFactory(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, C.paving);
  const brick = pick([C.brick, 0x8a5040, 0x9a6a50], v, 1);
  const hx = 0.1, hz = -0.42, hw = 2.5, hd = 1.6, hh = 0.62;
  k.block(hw + 0.04, 0.06, hd + 0.04, C.concrete, hx, G, hz, { tex: 'concrete' });
  k.block(hw, hh, hd, brick, hx, G + 0.06, hz, { tex: 'brick' });
  k.box(hw + 0.03, 0.04, hd + 0.03, C.trim, hx, G + 0.06 + hh, hz, { flat: true });
  pilasters(k, hx - hw / 2, hx + hw / 2, hz + hd / 2, G + 0.06, hh, 7, tint(brick, 0.85));
  sawtooth(k, hw, hd, 4, 0.28, pick([0x5b6168, 0x6a6f74], v, 2), hx, G + 0.1 + hh, hz, 0xb8d4e4, team);
  k.windows(2, 0.5, G + 0.36, 'x', hx + hw / 2 + 0.005, { frame: C.trim, cx: hz - 0.3, w: 0.18, h: 0.2 });
  // Dock with two doors and a box truck backed in.
  dock(k, hx + 0.6, hz + hd / 2, 1.0, 2, 0.34, team);
  truck(k, hx + 0.35, hz + hd / 2 + 0.72, -Math.PI / 2, pick([0x34495e, team, 0xecf0f1], v, 3), 'box', pick([C.white, 0xd8d0c0], v, 4), 1.0);
  // Office: two storeys, stone string course, windows, a flat roof and the sign.
  const ox = -0.75, oz = 0.72, ow = 1.1, od = 0.5;
  k.block(ow, 0.82, od, tint(brick, 1.08), ox, G, oz, { tex: 'brick' });
  k.box(ow + 0.02, 0.03, od + 0.02, C.trim, ox, G + 0.42, oz, { flat: true });
  flatRoof(k, ow, od, C.concreteLight, ox, G + 0.82, oz, { parapet: C.trim });
  k.windows(4, 0.8, G + 0.25, 'z', oz + od / 2, { frame: C.trim, cx: ox, w: 0.13, h: 0.16 });
  k.windows(4, 0.8, G + 0.62, 'z', oz + od / 2, { frame: C.trim, cx: ox, w: 0.13, h: 0.16 });
  k.box(0.6, 0.12, 0.02, team, ox, G + 0.98, oz + od / 2 - 0.02, { bevel: 0.01, surface: 'gloss' });
  k.box(0.46, 0.04, 0.012, C.white, ox, G + 0.98, oz + od / 2 - 0.005, { glow: 0.8 });
  k.box(0.2, 0.03, 0.12, C.trim, ox + 0.42, G + 0.38, oz + od / 2 + 0.06, { bevel: 0.01 });
  // Brick stack (smoke), pallets of goods, a forklift.
  chimney(k, -1.2, -1.15, 2.0, 0.12, C.brickDark, G);
  crates(k, 1.1, 0.95, 4, pick([0xd070b0, 0x58a8ff, 0xe08a3c], v, 5));
  forklift(k, 0.85, 1.3, Math.PI);
  lamp(k, 0.05, 1.35, 0.55);
  return k.build();
}

/** Electronics plant (4 x 3, Digital): a long white fab with blue glass bands, a glass entrance atrium, rooftop air handlers and solar rows, nitrogen tanks, a car park. */
function electronicsPlant(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 4, 3, C.pavingLight);
  const fx = -0.25, fz = -0.55, fw = 3.1, fd = 1.3, fh = 0.72;
  k.block(fw, fh, fd, 0xf2f2ee, fx, G, fz, { tex: 'panels', bevel: 0.03, edge: 1.1 });
  for (const y of [0.22, 0.5]) ribbon(k, fx, G + y, fz + fd / 2 + 0.01, fw - 0.1, 0.13, 'z', 0x4a8ac8, 0xdfe4e8, 0.4);
  ribbon(k, fx + fw / 2 + 0.01, G + 0.5, fz, fd - 0.1, 0.13, 'x', 0x4a8ac8, 0xdfe4e8, 0.4);
  k.box(fw + 0.02, 0.04, fd + 0.02, team, fx, G + fh - 0.06, fz, { flat: true, surface: 'gloss' });
  flatRoof(k, fw, fd, 0xd8dcdc, fx, G + fh, fz, { parapet: 0xe8eae8 });
  // Rooftop: clean-room air handlers in a row, solar panels.
  for (let i = 0; i < 4; i++) {
    const x = fx - 1.1 + i * 0.5;
    k.block(0.36, 0.16, 0.3, 0xc8ccd0, x, G + fh + 0.03, fz - 0.3, { bevel: 0.02, surface: 'gloss', tex: 'panels' });
    k.cyl(0.08, 0.08, 0.02, 10, 0x2a2e32, x - 0.07, G + fh + 0.2, fz - 0.3, { surface: 'gloss' });
    k.cyl(0.08, 0.08, 0.02, 10, 0x2a2e32, x + 0.08, G + fh + 0.2, fz - 0.3, { surface: 'gloss' });
  }
  for (let i = 0; i < 5; i++) k.box(0.4, 0.015, 0.22, 0x26407a, fx - 1.0 + i * 0.5, G + fh + 0.1, fz + 0.3, { rot: [0.35, 0, 0], surface: 'glass', tex: 'glass' });
  // Glass entrance atrium with a team canopy and a lit logo.
  const ax = fx - 0.7, az = fz + fd / 2 + 0.2;
  k.block(0.7, 0.62, 0.4, 0x8fc8e8, ax, G, az, { surface: 'glass', tex: 'glass', glow: 0.35, bevel: 0.02 });
  k.block(0.82, 0.04, 0.55, team, ax, G + 0.62, az + 0.05, { bevel: 0.015, surface: 'gloss' });
  k.box(0.4, 0.06, 0.012, 0x7fe0ff, ax, G + 0.7, az + 0.33, { glow: 1 });
  // Utility yard: nitrogen tanks, a chiller with fans, a glowing cable trunk.
  for (const z of [-1.05, -0.5]) tank(k, 1.68, z, 0.16, 0.8, 0xf2f2ee, { roof: 'dome', ladder: 'x', surface: 'gloss' });
  k.block(0.42, 0.22, 0.6, 0xdfe2e4, 1.62, G, 0.2, { bevel: 0.02, tex: 'panels', surface: 'gloss' });
  for (const z of [0.05, 0.35]) k.cyl(0.1, 0.1, 0.02, 12, 0x2a2e32, 1.62, G + 0.23, z, { surface: 'gloss' });
  k.box(0.04, 0.03, 0.6, 0x7fe0ff, 1.39, G + 0.12, 0.2, { glow: 0.8 });
  // Car park with trees.
  parking(k, 0.55, 0.9, 7, 0.4, 0.24);
  const r = rng(v + 11);
  for (let i = 0; i < 7; i++) if (r() < 0.75) carAt(k, 0.55 - 0.72 + i * 0.24, 0.9, Math.PI / 2, pick(CAR_COLOURS, v + i, 2));
  for (const x of [-1.75, -1.15]) tree(k, x, 1.0, 0.8, v + 1);
  for (const x of [-0.4, 1.5]) lamp(k, x, 1.3, 0.55);
  sign(k, -1.5, 0.45, 0.45, team, 0.35);
  return k.build();
}

/** Pharmaceutical plant (3 x 3, Digital): a white lab block with a glass front and a lit green cross, an open reactor frame with stainless vessels, a small tank farm. */
function pharmaPlant(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, C.pavingLight);
  const bx = -0.45, bz = -0.4, bw = 1.75, bd = 1.3, bh = 0.88;
  k.block(bw, bh, bd, 0xf4f4f0, bx, G, bz, { tex: 'panels', bevel: 0.03, edge: 1.1 });
  k.block(bw * 0.62, bh - 0.12, 0.04, 0x8fc8d8, bx - 0.25, G + 0.06, bz + bd / 2 + 0.02, { surface: 'glass', tex: 'glass', glow: 0.35 });
  for (let i = 0; i <= 5; i++) k.box(0.02, bh - 0.12, 0.05, 0xdfe4e8, bx - 0.25 - bw * 0.31 + (i * bw * 0.62) / 5, G + 0.06 + (bh - 0.12) / 2, bz + bd / 2 + 0.025, { flat: true });
  k.box(bw * 0.62, 0.02, 0.05, 0xdfe4e8, bx - 0.25, G + 0.47, bz + bd / 2 + 0.025, { flat: true });
  k.box(bw + 0.02, 0.05, bd + 0.02, team, bx, G + bh - 0.05, bz, { flat: true, surface: 'gloss' });
  flatRoof(k, bw, bd, 0xd8dcdc, bx, G + bh, bz, { parapet: 0xe8eae8, units: 4, seed: v + 2 });
  ribbon(k, bx + bw / 2 + 0.01, G + 0.55, bz, bd - 0.2, 0.12, 'x', 0x8fc8d8, 0xdfe4e8);
  // The green cross on the corner, lit.
  const cx = bx + 0.55, cy = G + bh + 0.4, cz = bz + bd / 2 - 0.08;
  k.block(0.035, 0.22, 0.035, C.metalDark, cx, G + bh, cz, { flat: true });
  k.box(0.42, 0.42, 0.03, C.white, cx, cy, cz - 0.02, { bevel: 0.02 });
  k.box(0.36, 0.12, 0.05, 0x30c060, cx, cy, cz, { glow: 0.9, bevel: 0.012 });
  k.box(0.12, 0.36, 0.05, 0x30c060, cx, cy, cz, { glow: 0.9, bevel: 0.012 });
  // Reactor frame: steel decks with stainless vessels and pipework.
  const rx = 0.95, rz = -0.45;
  lattice(k, rx, G, rz, 0.7, 1.35, 1.1, 0x9aa8b4, { bays: 2, r: 0.014, noBrace: ['z', '-x'] });
  k.block(0.74, 0.025, 1.39, 0x9aa8b4, rx, G + 0.55, rz, { surface: 'gloss' });
  for (const [z, y, r, h] of [[-0.85, 0.55, 0.16, 0.42], [-0.4, 0.55, 0.14, 0.38], [0.05, 0.55, 0.16, 0.42], [-0.62, G, 0.13, 0.36], [-0.15, G, 0.13, 0.36]] as const) {
    const y0 = y === G ? G : G + y;
    k.cyl(r, r, h, 14, 0xd8dcde, rx, y0 + 0.04 + h / 2, rz + z + 0.45, { surface: 'gloss', bevel: 0.015 });
    k.dome(r, 0xe4e8ea, rx, y0 + 0.04 + h, rz + z + 0.45, 12, { surface: 'gloss' });
    k.cyl(0.02, 0.02, 0.08, 6, C.metal, rx, y0 + 0.04 + h + r, rz + z + 0.45, { surface: 'gloss' });
  }
  pipe(k, [[rx - 0.2, G + 1.15, -0.95], [rx - 0.2, G + 1.15, 0.05], [bx + bw / 2, G + 0.75, 0.05]], 0.022, C.metal);
  // Tank farm, trees and a car park in front.
  for (const x of [0.75, 1.15]) tank(k, x, 0.8, 0.13, 0.42, 0xf2f2ee, { roof: 'dome', band: team });
  parking(k, -0.65, 0.95, 5, 0.38, 0.24);
  for (let i = 0; i < 5; i++) if ((v + i) % 3 !== 0) carAt(k, -0.65 - 0.48 + i * 0.24, 0.95, Math.PI / 2, pick(CAR_COLOURS, v + i, 3));
  tree(k, 0.25, 1.25, 0.75, v);
  tree(k, -1.22, 1.3, 0.7, v + 1);
  lamp(k, 0.3, 0.6, 0.55);
  return k.build();
}

/** Nano fab (4 x 4, Nano): sealed white clean-room halls with violet light seams, a glowing core ('flare') in a ring of fins, corner pylons, a landing pad. */
function nanoFab(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 4, 4, 0xd8dce0);
  const violet = 0x9a6cff;
  // Main hall: a long low white block with rounded corners (bevel), a dark glass band, a violet seam.
  const hx = 0, hz = -0.55, hw = 3.3, hd = 2.0, hh = 0.7;
  k.block(hw, hh, hd, 0xf4f5f7, hx, G, hz, { bevel: 0.12, edge: 1.1, tex: 'panels' });
  k.box(hw + 0.01, 0.14, hd + 0.01, 0x2a3048, hx, G + 0.42, hz, { surface: 'glass', tex: 'glass', glow: 0.15 });
  k.box(hw + 0.02, 0.025, hd + 0.02, violet, hx, G + 0.32, hz, { glow: 1 });
  // A raised clean-room block with the core on top.
  const cx = 0.55, cz = -0.75;
  k.block(1.5, 0.4, 1.2, 0xeceef2, cx, G + hh, cz, { bevel: 0.08, edge: 1.15, tex: 'panels' });
  k.box(1.51, 0.02, 1.21, violet, cx, G + hh + 0.2, cz, { glow: 1 });
  k.cyl(0.42, 0.5, 0.2, 18, 0xdfe2e8, cx, G + hh + 0.5, cz, { bevel: 0.03, surface: 'gloss' });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(0.04, 0.55, 0.16, C.white, cx + Math.cos(a) * 0.42, G + hh + 0.85, cz + Math.sin(a) * 0.42, { rot: [0, -a, 0], bevel: 0.015, surface: 'gloss' });
  }
  k.add(new THREE.TorusGeometry(0.42, 0.025, 4, 24), violet, cx, G + hh + 1.12, cz, { rot: [Math.PI / 2, 0, 0], glow: 1, flat: true });
  const core = k.part('flare', [cx, G + hh + 0.62, cz]);
  core.sphere(0.24, 0xc8a0ff, 0, 0.24, 0, 14, { glow: 1, surface: 'glass' });
  core.sphere(0.13, 0xf0e0ff, 0, 0.24, 0, 10, { glow: 1 });
  // Cooling fin banks on the roof's left.
  for (let i = 0; i < 7; i++) k.block(0.04, 0.22, 0.7, 0xd0d4da, -1.4 + i * 0.13, G + hh, -0.85, { surface: 'gloss', bevel: 0.01 });
  k.box(0.95, 0.02, 0.74, violet, -1.01, G + hh + 0.005, -0.85, { glow: 0.5 });
  // Corner pylons with glowing tips.
  for (const [x, z] of [[-1.55, 0.35], [1.55, 0.35], [-1.55, -1.45], [1.55, -1.45]] as const) {
    k.cyl(0.04, 0.07, 1.25, 8, C.white, x, G + 0.62, z, { surface: 'gloss' });
    k.sphere(0.05, violet, x, G + 1.28, z, 8, { glow: 1 });
  }
  // Entrance: glass canopy with violet light, team-coloured fascia.
  k.block(0.9, 0.45, 0.06, 0x9ab8e8, -0.6, G, hz + hd / 2 + 0.03, { surface: 'glass', tex: 'glass', glow: 0.4 });
  k.block(1.1, 0.04, 0.4, team, -0.6, G + 0.48, hz + hd / 2 + 0.2, { bevel: 0.015, surface: 'gloss' });
  k.box(1.0, 0.015, 0.02, violet, -0.6, G + 0.47, hz + hd / 2 + 0.39, { glow: 1 });
  // Landing pad with a lit ring and a cargo pod.
  const px = 1.15, pz = 1.15;
  k.cyl(0.62, 0.66, 0.06, 20, 0xc8ccd2, px, G + 0.03, pz, { bevel: 0.02 });
  k.add(new THREE.TorusGeometry(0.5, 0.02, 3, 24), violet, px, G + 0.065, pz, { rot: [Math.PI / 2, 0, 0], glow: 1, flat: true });
  const pod = new Frame(k, px, pz, 0.6);
  pod.box(0.5, 0.14, 0.26, C.white, 0, G + 0.17, 0, { bevel: 0.06, surface: 'gloss' });
  pod.box(0.2, 0.06, 0.2, 0x2a3048, 0.12, G + 0.26, 0, { bevel: 0.03, surface: 'glass' });
  pod.box(0.04, 0.03, 0.22, violet, -0.26, G + 0.17, 0, { glow: 1 });
  for (const s of [-1, 1]) pod.box(0.3, 0.02, 0.04, team, -0.02, G + 0.17, s * 0.135, { flat: true });
  // Path lights and a few clipped trees.
  for (let i = 0; i < 5; i++) k.cyl(0.015, 0.015, 0.1, 6, violet, -1.6 + i * 0.35, G + 0.05, 1.3, { glow: 0.9 });
  for (const x of [-1.45, -0.35]) tree(k, x, 1.65, 0.75, v + Math.round(x * 10));
  return k.build();
}

/** A humanoid service robot standing on y (facing +z), with glowing eyes and chest light. */
function robot(k: Kit, x: number, z: number, hex: number, trim: number): void {
  for (const s of [-1, 1]) k.block(0.04, 0.2, 0.05, 0x3a3e44, x + s * 0.035, G, z, { bevel: 0.01, surface: 'gloss' });
  k.block(0.16, 0.18, 0.1, hex, x, G + 0.2, z, { bevel: 0.03, surface: 'gloss', taper: -0.1 });
  for (const s of [-1, 1]) k.box(0.035, 0.17, 0.045, 0x3a3e44, x + s * 0.1, G + 0.29, z, { bevel: 0.01, surface: 'gloss' });
  k.block(0.1, 0.08, 0.09, hex, x, G + 0.39, z, { bevel: 0.025, surface: 'gloss' });
  k.box(0.07, 0.018, 0.01, 0x7fe0ff, x, G + 0.43, z + 0.046, { glow: 1 });
  k.box(0.05, 0.03, 0.01, trim, x, G + 0.32, z + 0.052, { glow: 0.6 });
}

/** Robotics plant (4 x 3, Nano): a white sawtooth assembly hall with a glazed front, a robot arm ('spin') in the yard, finished robots on charging pads, AGV carts. */
function roboticsPlant(team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  lot(k, 4, 3, 0xc8ccd0);
  const hx = -0.3, hz = -0.5, hw = 3.2, hd = 1.4, hh = 0.68;
  k.block(hw, hh, hd, 0xe8ecf0, hx, G, hz, { tex: 'panels', bevel: 0.03 });
  sawtooth(k, hw, hd, 4, 0.24, 0xc8ccd2, hx, G + hh, hz, 0xc8f0ff, team);
  // Glazed front: lit assembly floor behind tall glass, a team fascia band.
  k.box(hw * 0.7, hh - 0.16, 0.03, 0x9fd8f0, hx - 0.35, G + 0.06 + (hh - 0.16) / 2, hz + hd / 2 + 0.01, { surface: 'glass', tex: 'glass', glow: 0.5 });
  for (let i = 0; i <= 8; i++) k.box(0.02, hh - 0.14, 0.04, 0x9aa0a8, hx - 0.35 - hw * 0.35 + (i * hw * 0.7) / 8, G + 0.06 + (hh - 0.16) / 2, hz + hd / 2 + 0.02, { flat: true, surface: 'gloss' });
  k.box(hw + 0.02, 0.07, hd + 0.02, team, hx, G + hh - 0.035, hz, { flat: true, surface: 'gloss' });
  rollerDoor(k, hx + hw / 2 - 0.4, G, hz + hd / 2, 0.45, 0.42, 'z', 0xd8dce0);
  k.box(0.04, 0.03, 0.02, 0x7fe0ff, hx + hw / 2 - 0.12, G + 0.48, hz + hd / 2 + 0.02, { glow: 1 });
  // The yard: a robot arm on a plinth working on a chassis.
  const ax = 1.35, az = 0.75;
  k.block(0.36, 0.08, 0.36, 0x5a5e66, ax, G, az, { bevel: 0.02, surface: 'gloss' });
  for (let i = 0; i < 4; i++) k.box(0.1, 0.01, 0.025, i % 2 ? 0x2a2a2a : C.hazard, ax - 0.15 + i * 0.1, G + 0.085, az + 0.17, { flat: true });
  robotArm(k, ax, G + 0.08, az, pick([0xf0a020, 0xe8ecf0, team], v, 2), 1.2);
  k.block(0.36, 0.12, 0.22, 0x8a929a, ax - 0.48, G, az + 0.08, { bevel: 0.03, surface: 'gloss' });
  // Finished robots on lit charging pads.
  for (let i = 0; i < 4; i++) {
    const x = -1.65 + i * 0.36;
    k.cyl(0.13, 0.13, 0.02, 12, 0x3a3e44, x, G + 0.01, 0.75, { surface: 'gloss' });
    k.add(new THREE.TorusGeometry(0.12, 0.01, 3, 16), 0x7fe0ff, x, G + 0.022, 0.75, { rot: [Math.PI / 2, 0, 0], glow: 1, flat: true });
    robot(k, x, 0.75, i % 2 ? C.white : pick([team, 0xf0a020, 0xe8ecf0], v, 3), team);
  }
  // AGV carts on a lit guide line.
  k.box(2.6, 0.006, 0.02, 0x7fe0ff, -0.3, G + 0.005, 1.2, { glow: 0.7 });
  for (const x of [-0.9, 0.35]) {
    k.block(0.3, 0.06, 0.2, 0xe8ecf0, x, G + 0.01, 1.2, { bevel: 0.02, surface: 'gloss' });
    k.box(0.3, 0.012, 0.012, 0x7fe0ff, x, G + 0.045, 1.302, { glow: 1 });
    k.block(0.2, 0.1, 0.14, 0x8a929a, x, G + 0.07, 1.2, { bevel: 0.015, surface: 'gloss' });
  }
  // Side yard: battery store cabinets with lit status strips, a coolant tank; a sign.
  for (let i = 0; i < 3; i++) {
    k.block(0.2, 0.36, 0.26, 0xe8ecf0, 1.62, G, -1.2 + i * 0.32, { bevel: 0.02, tex: 'panels', surface: 'gloss' });
    k.box(0.012, 0.22, 0.03, 0x7fe0ff, 1.515, G + 0.2, -1.2 + i * 0.32, { glow: 1 });
  }
  tank(k, 1.62, -0.05, 0.16, 0.6, 0xf2f2ee, { roof: 'dome', band: 0x7fe0ff, ladder: 'x' });
  sign(k, 0.25, 0.65, 0.42, team, 0.35);
  return k.build();
}

export const INDUSTRY_MODELS: Record<string, ModelFn> = {
  farm,
  fishing_harbour: fishingHarbour,
  logging_camp: loggingCamp,
  quarry,
  iron_mine: ironMine,
  oil_well: oilWell,
  rare_earth_mine: rareEarthMine,
  uranium_mine: uraniumMine,
  food_plant: foodPlant,
  sawmill,
  cement_works: cementWorks,
  steel_mill: steelMill,
  oil_refinery: oilRefinery,
  goods_factory: goodsFactory,
  electronics_plant: electronicsPlant,
  pharma_plant: pharmaPlant,
  nano_fab: nanoFab,
  robotics_plant: roboticsPlant,
};

