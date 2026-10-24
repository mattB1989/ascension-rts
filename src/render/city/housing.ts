// Kit-built housing and civic buildings (see ../kit.ts and common.ts).

import * as THREE from 'three';
import { Kit } from '../kit.ts';
import { BRICKS, C, car, crates, DOORS, fence, hedge, lamp, lot, pick, rng, ROOFS, tint, tree, WALLS, type ModelFn } from './common.ts';
import {
  awning, banner, bench, bollards, bush, canopy, clock, column, COPPER, dish, dish as dishFace, door, fbox, flagpole, flatRoof, GOLD, hvac, lantern, parapet, paint, pediment, person,
  planter, POLICE, RED_CROSS, redCross, ring, roofHut, satDish, SLATE, solar, spread, STONE, STONE_DARK, strut, tube, vehicle, WARM, waterTank, windowGrid,
} from './housing-parts.ts';

/** Mirror a finished group left-right (variants). */
function mirrored(g: THREE.Group, v: number): THREE.Group {
  if (v % 2) g.scale.x = -1;
  return g;
}

/** Level 0: a small cottage on a garden plot. */
function cottage(_team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  const wall = pick(WALLS, v, 2);
  const roof = pick(ROOFS, v, 1);
  lot(k, 2, 2, C.lawn, 'lawn');
  // Garden path from the gate to the door, a low hedge, a fence along the street.
  k.box(0.18, 0.02, 0.62, C.pavingLight, -0.2, 0.12, 0.62, { tex: 'concrete', flat: true });
  fence(k, 0, 0.93, 1.9, true);
  hedge(k, -0.88, 0.1, 1.5, false);
  // The cottage: stone plinth, rendered walls, steep tiled roof.
  k.block(1.12, 0.08, 0.86, C.concrete, -0.2, 0.1, -0.2, { tex: 'concrete', bevel: 0.02 });
  k.block(1.04, 0.52, 0.78, wall, -0.2, 0.18, -0.2, { tex: 'plaster' });
  k.gable(1.04, 0.78, 0.42, roof, -0.2, 0.7, -0.2, { over: 0.08 });
  // Door with a frame and a step; windows with frames and sills.
  k.box(0.2, 0.32, 0.02, pick(DOORS, v, 3), -0.2, 0.34, 0.2, { tex: 'planks' });
  k.box(0.26, 0.36, 0.015, C.trim, -0.2, 0.36, 0.196, { flat: true });
  k.box(0.3, 0.04, 0.12, C.concrete, -0.2, 0.2, 0.25, { flat: true });
  k.windows(2, 0.6, 0.46, 'z', 0.2, { frame: C.trim, w: 0.14, h: 0.15 });
  for (const x of [-0.5, 0.1]) k.box(0.19, 0.02, 0.05, C.trim, x, 0.375, 0.22, { flat: true });
  k.windows(1, 0, 0.46, 'x', 0.32, { frame: C.trim, cx: -0.2 });
  // Chimney with smoke.
  k.block(0.14, 0.42, 0.14, C.brick, 0.1, 0.78, -0.42, { tex: 'brick', bevel: 0.015 });
  k.box(0.17, 0.04, 0.17, C.concrete, 0.1, 1.22, -0.42, { flat: true });
  k.anchor('smoke', 0.1, 1.24, -0.42);
  // Garden: a tree, a vegetable patch, a water butt.
  tree(k, 0.6, 0.5, 0.9, v);
  k.box(0.5, 0.05, 0.3, 0x6a4a2a, 0.55, 0.12, -0.55, { tex: 'lawn', flat: true });
  for (let i = 0; i < 4; i++) k.box(0.08, 0.06, 0.24, C.leaf, 0.37 + i * 0.12, 0.17, -0.55, { flat: true });
  k.cyl(0.06, 0.06, 0.14, 8, C.steelBlue, 0.4, 0.17, -0.12);
  return mirrored(k.build(), v);
}

/** Level 1: a two-storey family house with a porch and a garden. */
function house(_team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  const wall = pick(WALLS, v, 2);
  const roof = pick(ROOFS, v, 1);
  const brickBody = v % 3 === 1;
  const body = brickBody ? pick(BRICKS, v, 3) : wall;
  lot(k, 2, 2, C.lawn, 'lawn');
  k.box(0.22, 0.02, 0.5, C.pavingLight, 0.15, 0.12, 0.7, { tex: 'concrete', flat: true });
  k.box(0.36, 0.02, 0.62, C.paving, -0.62, 0.12, 0.62, { tex: 'concrete', flat: true }); // driveway
  // Main block: plinth, two floors, a string course between them, and a hipped or gabled roof.
  k.block(1.36, 0.08, 1.06, C.concrete, 0, 0.1, -0.2, { tex: 'concrete', bevel: 0.02 });
  k.block(1.3, 0.92, 1.0, body, 0, 0.18, -0.2, { tex: brickBody ? 'brick' : 'plaster' });
  k.box(1.34, 0.04, 1.04, C.trim, 0, 0.62, -0.2, { flat: true });
  if (v % 4 === 3) k.hip(1.3, 1.0, 0.5, roof, 0, 1.1, -0.2, { over: 0.09 });
  else k.gable(1.3, 1.0, 0.5, roof, 0, 1.1, -0.2, { over: 0.09 });
  // Front: door under a porch roof on two posts, windows with frames and sills on both floors.
  k.box(0.2, 0.34, 0.02, pick(DOORS, v, 3), 0.15, 0.35, 0.31, { tex: 'planks' });
  k.box(0.26, 0.38, 0.015, C.trim, 0.15, 0.37, 0.305, { flat: true });
  k.box(0.46, 0.04, 0.3, C.trim, 0.15, 0.6, 0.44, { bevel: 0.01 });
  for (const x of [-0.05, 0.35]) k.cyl(0.018, 0.018, 0.42, 6, C.white, x, 0.39, 0.56, { flat: true });
  k.box(0.46, 0.05, 0.3, C.concrete, 0.15, 0.2, 0.44, { tex: 'concrete', flat: true });
  k.windows(1, 0, 0.42, 'z', 0.3, { frame: C.trim, cx: -0.35, w: 0.22, h: 0.18 });
  k.windows(3, 0.8, 0.84, 'z', 0.3, { frame: C.trim, w: 0.16, h: 0.18 });
  for (const x of [-0.4, 0, 0.4]) k.box(0.2, 0.02, 0.05, C.trim, x, 0.74, 0.32, { flat: true });
  k.windows(2, 0.5, 0.84, 'x', 0.65, { frame: C.trim, cx: -0.2 });
  k.windows(1, 0, 0.42, 'x', 0.65, { frame: C.trim, cx: -0.35 });
  k.windows(2, 0.5, 0.84, '-x', 0.65, { frame: C.trim, cx: -0.2 });
  // Chimney with smoke, gutters, a satellite of the times (a TV aerial).
  k.block(0.16, 0.5, 0.16, C.brick, 0.45, 1.15, -0.45, { tex: 'brick', bevel: 0.015 });
  k.box(0.2, 0.04, 0.2, C.concrete, 0.45, 1.67, -0.45, { flat: true });
  k.anchor('smoke', 0.45, 1.7, -0.45);
  k.cyl(0.008, 0.008, 0.3, 4, C.metalDark, -0.4, 1.7, -0.2, { surface: 'metal' });
  k.box(0.22, 0.008, 0.008, C.metalDark, -0.4, 1.8, -0.2, { surface: 'metal' });
  // Garden: hedge, a tree, a parked car on the driveway, a lamp at the gate.
  hedge(k, 0.55, 0.9, 0.7, true);
  hedge(k, -0.25, 0.9, 0.3, true);
  tree(k, 0.65, -0.75, 0.95, v);
  k.box(0.34, 0.08, 0.17, pick([0xc0392b, 0x2e86c1, 0xecf0f1, 0x34495e, 0x27ae60], v, 9), -0.62, 0.17, 0.62, { bevel: 0.02, surface: 'gloss', rot: [0, Math.PI / 2, 0] });
  k.box(0.15, 0.07, 0.18, C.glassDark, -0.62, 0.245, 0.6, { surface: 'glass', bevel: 0.02 });
  lamp(k, 0.4, 0.92, 0.5);
  return mirrored(k.build(), v);
}

/** Level 2: a row of terraced townhouses — bay windows, steps, dormers, chimney stacks on the party walls. */
function terrace(_team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  const r = rng(v * 13 + 5);
  const n = pick([2, 3, 3, 2, 3], v, 4);
  const roof = pick([SLATE, 0x5b6168, 0x6a5048, 0x4a4f55, C.roofRed], v, 1);
  const stucco = v % 4 === 2;
  const W = 1.84;
  const D = 0.9;
  const zc = -0.16;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  const uw = W / n;
  const top = 1.46;
  lot(k, 2, 2, C.paving);
  // Front gardens behind a low wall with railings; rear yards with dividing walls.
  k.box(W + 0.04, 0.02, 0.56, C.lawn, 0, 0.11, 0.6, { tex: 'lawn', flat: true });
  k.block(W + 0.04, 0.07, 0.06, C.brickDark, 0, 0.1, 0.9, { tex: 'brick', bevel: 0.012 });
  k.box(W + 0.02, 0.1, 0.012, 0x22252a, 0, 0.22, 0.9, { surface: 'metal', flat: true });
  k.block(W + 0.04, 0.17, 0.04, C.brickDark, 0, 0.1, -0.94, { tex: 'brick', bevel: 0.01 });
  k.block(W + 0.06, 0.06, D + 0.06, C.concrete, 0, 0.1, zc, { tex: 'concrete', bevel: 0.015 });
  // The terrace: each house its own brick (or stucco), one long roof, a string course and a cornice.
  for (let i = 0; i < n; i++) {
    const ux = -W / 2 + uw * (i + 0.5);
    const side = (i + v) % 2 ? 1 : -1;
    const body = stucco ? pick(WALLS, v + i * 3, 2) : pick(BRICKS, v * 3 + i, 3);
    const doorCol = pick(DOORS, v * 5 + i, 3);
    k.block(uw - 0.004, top - 0.16, D, body, ux, 0.16, zc, { tex: stucco ? 'plaster' : 'brick' });
    if (!stucco && r() < 0.5) k.block(uw - 0.004, 0.46, D + 0.008, C.plaster, ux, 0.16, zc, { tex: 'plaster' }); // painted ground floor
    // Door to one side under a lit fanlight, up two steps; a bay window beside it.
    const dx = ux + side * uw * 0.26;
    door(k, 'z', zf, dx, 0.17, 0.15, 0.3, doorCol, { surround: C.trim, fanlight: true });
    k.block(0.22, 0.035, 0.1, C.concreteLight, dx, 0.1, zf + 0.05, { tex: 'concrete' });
    k.box(0.12, 0.02, 0.4, C.pavingLight, dx, 0.12, 0.6, { tex: 'concrete', flat: true });
    const bw = Math.min(0.34, uw * 0.48);
    const bx = ux - side * uw * 0.17;
    k.block(bw, 0.44, 0.12, stucco ? C.trim : body, bx, 0.16, zf + 0.06, { tex: stucco ? 'plaster' : 'brick', bevel: 0.01 });
    windowGrid(k, 'z', zf + 0.12, spread(2, bw * 0.5, bx), [0.4], { w: bw * 0.36, h: 0.24, frame: C.white, seed: v * 7 + i, lit: 0.85 });
    k.block(bw + 0.04, 0.04, 0.16, SLATE, bx, 0.6, zf + 0.07, { bevel: 0.015 });
    // Upper floors: sash windows with stone sills and lintels.
    const ts = spread(n === 2 ? 3 : 2, uw * (n === 2 ? 0.62 : 0.5), ux);
    windowGrid(k, 'z', zf, ts, [0.85], { w: 0.12, h: 0.24, frame: C.white, sill: C.trim, lintel: stucco ? undefined : C.trim, seed: v * 11 + i, lit: 0.7 });
    windowGrid(k, 'z', zf, ts, [1.24], { w: 0.12, h: 0.18, sill: C.trim, seed: v * 17 + i, lit: 0.6 });
    // The back: plain windows, a kitchen outshot with a lean-to roof, a yard wall.
    windowGrid(k, '-z', zb, spread(n === 2 ? 2 : 1, uw * 0.45, ux), [0.85, 1.24], { w: 0.12, h: 0.18, seed: v * 19 + i, lit: 0.6 });
    const ox = ux + side * uw * 0.2;
    k.block(uw * 0.42, 0.4, 0.24, body, ox, 0.1, -zb - 0.12, { tex: stucco ? 'plaster' : 'brick' });
    k.box(uw * 0.42 + 0.05, 0.025, 0.3, SLATE, ox, 0.53, -zb - 0.13, { rot: [-0.3, 0, 0], flat: true });
    windowGrid(k, '-z', zb, [ux - side * uw * 0.2], [0.38], { w: 0.12, h: 0.2, seed: v * 3 + i, lit: 0.9 });
    if (i > 0) k.block(0.035, 0.16, 0.34, C.brickDark, -W / 2 + uw * i, 0.1, -0.78, { tex: 'brick', bevel: 0.008 });
    // Garden: a bush or the bins.
    if (r() < 0.5) bush(k, ux - side * uw * 0.2, 0.74, 1.3, C.hedge, 0.11);
    else for (const e of [0, 1]) k.block(0.07, 0.11, 0.07, e ? 0x2f5a3a : 0x2a2d30, bx + e * 0.09, 0.12, 0.8);
    // A dormer in the roof.
    if (n === 2) {
      const dz = zc + 0.25;
      k.block(0.24, 0.24, 0.22, stucco ? C.trim : C.white, ux, 1.55, dz, { tex: 'plaster' });
      k.gable(0.24, 0.28, 0.11, roof, ux, 1.79, dz, { rot: [0, Math.PI / 2, 0], over: 0.02 });
      windowGrid(k, 'z', dz + 0.11, [ux], [1.67], { w: 0.12, h: 0.13, frame: C.white, seed: v * 23 + i, lit: 0.6 });
    }
  }
  // Quoins at the party walls and ends, string course, cornice, the long slate roof.
  k.box(W + 0.02, 0.03, D + 0.02, C.trim, 0, 0.635, zc, { flat: true });
  k.block(W + 0.05, 0.05, D + 0.05, C.trim, 0, top - 0.02, zc, { bevel: 0.015 });
  k.gable(W, D, 0.4, roof, 0, top + 0.03, zc, { over: 0.05 });
  // End walls: a window per floor; chimney stacks on the party walls, with pots.
  for (const f of ['x', '-x'] as const) windowGrid(k, f, W / 2, [zc], [0.85, 1.24], { w: 0.12, h: 0.18, seed: v * 29 + (f === 'x' ? 1 : 2), lit: 0.5 });
  for (let i = 0; i <= n; i++) {
    if ((i === 0 || i === n) && r() < 0.5) continue;
    const x = Math.max(-W / 2 + 0.08, Math.min(W / 2 - 0.08, -W / 2 + uw * i));
    k.block(0.12, 0.32, 0.26, C.brickDark, x, 1.72, zc, { tex: 'brick', bevel: 0.012 });
    k.box(0.15, 0.03, 0.29, C.concrete, x, 2.05, zc, { flat: true });
    k.box(0.05, 0.07, 0.16, 0xb0603a, x, 2.1, zc);
    if (i % 2 === 0) k.anchor('smoke', x, 2.15, zc + 0.06);
  }
  return mirrored(k.build(), v);
}

/** Level 3: a five-storey apartment block — balconies at the front, access galleries behind, plant on the roof. */
function apartment(_team: number, _level: number, v: number): THREE.Group {
  const k = new Kit();
  const r = rng(v * 7 + 3);
  const wall = pick([0xe6dfcf, 0xd9cbb0, 0xc9d0d6, 0xe8d8c4, 0xd6c4b4, 0xcfd8cc, 0xe2d2c2], v, 2);
  const base = pick([C.brick, 0x8a5040, 0x6b6f73, 0x9a8a78, 0x7d4433], v, 5);
  const accent = pick([0xc0603a, 0x3a6a8a, 0x5a8a4a, 0xd0a040, 0x8a4a6a, 0x9ec8dc], v, 6);
  const glassRail = accent === 0x9ec8dc;
  const W = 1.5;
  const D = 1.2;
  const zc = -0.14;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  const fh = 0.5;
  const floors = 4;
  const top = 0.62 + floors * fh;
  lot(k, 2, 2, C.paving);
  // Ground floor: brick base with the entrance, a canopy and a shop window or two.
  k.block(W + 0.04, 0.52, D + 0.04, base, 0, 0.1, zc, { tex: base === 0x6b6f73 || base === 0x9a8a78 ? 'concrete' : 'brick' });
  k.box(W + 0.07, 0.04, D + 0.07, C.concreteLight, 0, 0.62, zc, { bevel: 0.012 });
  door(k, 'z', zf + 0.02, 0, 0.12, 0.28, 0.32, 0x3a3f44, { glass: true });
  canopy(k, 'z', zf + 0.02, 0, 0.5, 0.5, 0.22, C.concreteLight, false, accent);
  windowGrid(k, 'z', zf + 0.02, [-0.5, 0.5], [0.33], { w: 0.34, h: 0.26, frame: 0x3a3f44, seed: v, lit: 1, glow: 0.5, color: 0xffe8b8 });
  windowGrid(k, '-z', zb + 0.02, spread(4, 1.1), [0.38], { w: 0.16, h: 0.2, seed: v + 1, lit: 0.6 });
  // Upper floors: rendered, a floor line at each slab.
  k.block(W, floors * fh, D, wall, 0, 0.62, zc, { tex: 'plaster' });
  for (let i = 1; i < floors; i++) k.box(W + 0.016, 0.022, D + 0.016, tint(wall, 0.86), 0, 0.62 + i * fh, zc, { flat: true });
  // Stair core down the middle of the front: a recessed strip with a lit landing window per floor.
  fbox(k, 'z', zf, 0, 0.62 + (floors * fh) / 2, 0.24, floors * fh, 0.03, tint(wall, 0.78), { tex: 'plaster', flat: true });
  for (let i = 0; i < floors; i++) fbox(k, 'z', zf + 0.03, 0, 0.62 + i * fh + 0.3, 0.1, 0.22, 0.01, 0xfff0c8, { glow: 0.55, surface: 'glass', flat: true });
  // Balconies either side, each with a door and a window behind.
  for (let i = 0; i < floors; i++) {
    const y = 0.62 + i * fh;
    for (const s of [-1, 1]) {
      const x = s * 0.45;
      fbox(k, 'z', zf, x, y + 0.02, 0.5, 0.035, 0.2, C.concreteLight, { tex: 'concrete', flat: true });
      fbox(k, 'z', zf + 0.185, x, y + 0.11, 0.5, 0.15, 0.012, accent, glassRail ? { surface: 'glass', flat: true } : { flat: true });
    }
    windowGrid(k, 'z', zf, [-0.45, 0.45], [y + 0.21], { w: 0.36, h: 0.3, frame: C.white, seed: v * 31 + i, lit: 0.65 });
  }
  // Sides: three windows a floor.
  const ys = Array.from({ length: floors }, (_, i) => 0.62 + i * fh + 0.25);
  for (const f of ['x', '-x'] as const) windowGrid(k, f, W / 2, spread(2, 0.6, zc), ys, { w: 0.16, h: 0.22, seed: v * 41 + (f === 'x' ? 0 : 9), lit: 0.6 });
  // Back: an access gallery along each floor, front doors and kitchen windows.
  for (let i = 0; i < floors; i++) {
    const y = 0.62 + i * fh;
    fbox(k, '-z', zb, 0, y + 0.02, W + 0.04, 0.035, 0.16, C.concreteLight, { tex: 'concrete', flat: true });
    fbox(k, '-z', zb + 0.15, 0, y + 0.12, W + 0.04, 0.012, 0.012, C.metalDark, { surface: 'metal', flat: true });
  }
  windowGrid(k, '-z', zb, [-0.5, 0, 0.5], ys, { w: 0.16, h: 0.22, seed: v * 43, lit: 0.6 });
  // Roof: cornice, parapet, lift room, then a water tank or plant, dishes, maybe a roof garden.
  k.block(W + 0.06, 0.06, D + 0.06, C.trim, 0, top, zc, { bevel: 0.02 });
  flatRoof(k, W, D, top + 0.06, C.trim, 0, zc);
  const ry = top + 0.06;
  roofHut(k, -0.38, ry, zc - 0.18, 0.4, 0.34, 0.26, C.concreteLight);
  if (v % 3 === 0) waterTank(k, 0.42, ry, zc - 0.2, 1);
  else {
    hvac(k, 0.38, ry, zc - 0.25);
    hvac(k, 0.38, ry, zc + 0.05);
  }
  if (v % 3 === 2) {
    k.box(0.6, 0.04, 0.3, C.lawn, 0.25, ry + 0.02, zc + 0.36, { tex: 'lawn', flat: true });
    bush(k, 0.05, zc + 0.36, 1, C.leaf, ry);
    bush(k, 0.45, zc + 0.38, 1.2, C.leafDark, ry);
  } else satDish(k, -0.1, ry, zc + 0.4, 0.07, 0.4 + r());
  // The lot: a tree, a bike rack, bins, a parked car.
  tree(k, -0.74, 0.72, 0.8, v);
  for (let i = 0; i < 3; i++) k.box(0.012, 0.07, 0.1, C.metalDark, 0.45 + i * 0.08, 0.15, 0.78, { flat: true, surface: 'metal' });
  k.block(0.2, 0.12, 0.08, 0x2f5a3a, -0.8, 0.1, -0.88);
  car(k, 0.78, -0.88, pick([0xc0392b, 0x2e86c1, 0xecf0f1, 0x34495e, 0x27ae60, 0x7a7a7a], v, 9), true);
  return mirrored(k.build(), v);
}

const TOWER_GLASS = [0x86b8dc, 0x76b6b0, 0xb0a07c, 0x96aac4, 0x729cc0];

/** Level 4 (Digital age): a glass office/residential tower on a stone podium with a roof garden and a lit crown. */
function tower(_team: number, _level: number, v: number): THREE.Group {
  const k = new Kit({ grade: 0.12 });
  const r = rng(v * 17 + 1);
  const glass = pick(TOWER_GLASS, v, 2);
  const span = pick([0xe8eaec, 0xb8c0c8, 0x3a3f44, 0xd8cfc0], v, 3);
  const stone = pick([0xbab4a8, 0xcfc8b8, 0x8f8c88], v, 4);
  const W = 1.22;
  const D = 1.1;
  const y0 = 0.62;
  const fh = 0.4;
  const floors = 12;
  const top = y0 + floors * fh;
  lot(k, 2, 2, C.pavingLight);
  // Podium: stone piers round a lit, glazed lobby; a canopy over the doors; a roof garden on top.
  k.block(1.8, 0.5, 1.7, stone, 0, 0.1, 0, { tex: 'concrete', bevel: 0.02 });
  for (const f of ['z', '-z'] as const) {
    fbox(k, f, 0.85, 0, 0.32, 1.4, 0.32, 0.01, 0xfff0c8, { glow: 0.5, surface: 'glass', flat: true });
    for (const t of spread(4, 1.4)) fbox(k, f, 0.85, t, 0.32, 0.06, 0.34, 0.02, tint(stone, 0.9), { flat: true });
  }
  for (const f of ['x', '-x'] as const) {
    fbox(k, f, 0.9, 0, 0.32, 1.3, 0.32, 0.01, 0xfff0c8, { glow: 0.5, surface: 'glass', flat: true });
    for (const t of spread(4, 1.3)) fbox(k, f, 0.9, t, 0.32, 0.06, 0.34, 0.02, tint(stone, 0.9), { flat: true });
  }
  canopy(k, 'z', 0.85, 0, 0.5, 0.7, 0.12, C.metalDark, false);
  k.box(1.84, 0.04, 1.74, tint(stone, 1.08), 0, 0.62, 0, { bevel: 0.015 });
  k.box(1.7, 0.03, 1.6, C.lawn, 0, 0.65, 0, { tex: 'lawn', flat: true });
  for (const [x, z] of [[-0.78, -0.72], [0.78, 0.7], [0.78, -0.72], [-0.78, 0.7]] as const) bush(k, x, z, 1.1, r() < 0.5 ? C.leaf : C.hedge, 0.66);
  // The shaft: glass behind floor spandrels and vertical fins, with lit offices here and there.
  k.block(W, floors * fh, D, glass, 0, y0, 0, { surface: 'gloss', tex: 'glass' });
  for (let i = 0; i <= floors; i++) k.box(W + 0.03, 0.05, D + 0.03, span, 0, y0 + i * fh, 0, { flat: true, surface: 'metal' });
  for (const f of ['z', '-z'] as const) for (const t of spread(4, W)) fbox(k, f, D / 2, t, y0 + (floors * fh) / 2, 0.035, floors * fh, 0.035, span, { flat: true, surface: 'metal' });
  for (const f of ['x', '-x'] as const) for (const t of spread(3, D)) fbox(k, f, W / 2, t, y0 + (floors * fh) / 2, 0.035, floors * fh, 0.035, span, { flat: true, surface: 'metal' });
  // Lit floors: whole floors glow at night (offices working late), a few part-lit.
  for (let i = 0; i < floors; i++) {
    for (const f of ['z', '-z', 'x', '-x'] as const) {
      const roll = r();
      if (roll > 0.42) continue;
      const full = (f.endsWith('z') ? W : D) - 0.08;
      const len = roll < 0.26 ? full : full * (0.35 + r() * 0.3);
      const t = roll < 0.26 ? 0 : (r() < 0.5 ? -1 : 1) * (full - len) / 2;
      fbox(k, f, f.endsWith('z') ? D / 2 : W / 2, t, y0 + i * fh + fh / 2 + 0.012, len, fh - 0.12, 0.006, 0xf4dcae, { glow: 0.55, surface: 'glass', flat: true });
    }
  }
  // A stone service core up one side, a little taller than the glass, with slot windows.
  k.block(0.32, floors * fh + 0.5, 0.62, stone, W / 2 + 0.12, y0, -0.12, { tex: 'concrete', bevel: 0.02 });
  windowGrid(k, 'x', W / 2 + 0.28, [-0.12], spread(6, floors * fh - 0.6, y0 + (floors * fh) / 2), { w: 0.05, h: 0.26, seed: v, lit: 0.8, color: 0xfff0c8 });
  // Crown: a set-back glass top with a lit band, a plant screen, a mast with a beacon.
  if (v % 2 === 0) {
    k.block(W + 0.06, 0.06, D + 0.06, span, 0, top, 0, { bevel: 0.02, surface: 'metal' });
    k.block(W - 0.3, 0.42, D - 0.3, glass, 0, top + 0.06, 0, { surface: 'glass', tex: 'glass' });
    k.box(W - 0.28, 0.06, D - 0.28, 0xfff2d0, 0, top + 0.3, 0, { glow: 0.9 });
    k.block(W - 0.24, 0.05, D - 0.24, span, 0, top + 0.48, 0, { bevel: 0.015, surface: 'metal' });
    hvac(k, -0.25, top + 0.06, 0.4, 0.8);
  } else {
    // A stepped crown: two lit set-backs and a mast.
    k.block(W + 0.06, 0.06, D + 0.06, span, 0, top, 0, { bevel: 0.02, surface: 'metal' });
    k.block(W - 0.2, 0.36, D - 0.2, glass, 0, top + 0.06, 0, { surface: 'gloss', tex: 'glass' });
    k.box(W - 0.18, 0.05, D - 0.18, 0xfff2d0, 0, top + 0.3, 0, { glow: 0.9 });
    k.block(W - 0.16, 0.04, D - 0.16, span, 0, top + 0.42, 0, { bevel: 0.012, surface: 'metal' });
    k.block(W - 0.5, 0.3, D - 0.5, glass, 0, top + 0.46, 0, { surface: 'gloss', tex: 'glass' });
    k.box(W - 0.48, 0.04, D - 0.48, 0xfff2d0, 0, top + 0.68, 0, { glow: 0.9 });
    k.block(W - 0.46, 0.04, D - 0.46, span, 0, top + 0.76, 0, { bevel: 0.012, surface: 'metal' });
  }
  const mx = v % 2 === 0 ? 0.25 : 0;
  const my = v % 2 === 0 ? top + 0.53 : top + 0.8;
  k.cyl(0.018, 0.03, 1.0, 5, C.metalDark, mx, my + 0.5, -0.2, { surface: 'metal' });
  k.cyl(0.03, 0.03, 0.04, 6, C.metalDark, mx, my + 0.55, -0.2, { surface: 'metal' });
  k.part('flare', [mx, my + 1.04, -0.2]).sphere(0.05, 0xff4040, 0, 0, 0, 6, { glow: 1 });
  // The plaza: planters, bollards, a tree each side.
  for (const x of [-0.75, 0.75]) planter(k, x, 0.92, 0.36, 0.1, 0.1, C.hedge);
  bollards(k, spread(4, 0.5), [0.95]);
  return mirrored(k.build(), v);
}

const SPIRE_GLASS = [0x8fd0e4, 0x9fb4ea, 0x8fdcc4, 0xa8c4dc];

/** Level 5 (Nano age): a tapering white-and-glass spire — twisting tiers, sky gardens on every set-back, a white exoskeleton and a needle. */
function spire(_team: number, _level: number, v: number): THREE.Group {
  const k = new Kit({ grade: 0.12 });
  const glass = pick(SPIRE_GLASS, v, 2);
  const led = pick([0x7ff0ff, 0xc8a0ff, 0x9affc8], v, 3);
  const white = 0xf2f4f5;
  const twist = v % 3 === 0 ? 0 : Math.PI / 8;
  const radii = [0.72, 0.63, 0.54, 0.45, 0.36];
  const hs = [1.3, 1.25, 1.2, 1.1, 1.0];
  lot(k, 2, 2, 0xdfe3e6);
  // Plaza: a reflecting pool and a rounded white podium with a lit glass band.
  k.box(1.2, 0.02, 0.22, C.water, 0, 0.115, 0.82, { surface: 'glass', glow: 0.15, flat: true });
  k.cyl(0.88, 0.92, 0.12, 12, white, 0, 0.16, 0, { bevel: 0.03 });
  tube(k, 0.84, 0.84, 0.18, 12, glass, 0, 0.31, 0, { surface: 'gloss', glow: 0.35 });
  k.cyl(0.86, 0.84, 0.06, 12, white, 0, 0.43, 0, { bevel: 0.02 });
  let y = 0.46;
  const ribTop: number[] = [];
  radii.forEach((rad, i) => {
    const h = hs[i]!;
    const rot: [number, number, number] = [0, twist * i, 0];
    k.cyl(rad * 0.97, rad, h, 8, glass, 0, y + h / 2, 0, { surface: 'gloss', tex: 'glass', rot });
    // Floor rings, and a lit floor or two.
    for (let f = 1; f < 4; f++) tube(k, rad + 0.012, rad + 0.012, 0.03, 8, white, 0, y + (h * f) / 4, 0, { rot, flat: true });
    const lf = 1 + ((v + i) % 3);
    tube(k, rad * 0.985 + 0.004, rad * 0.985 + 0.004, h / 4 - 0.05, 8, 0xfff2d6, 0, y + (h * (lf + 0.5)) / 4, 0, { rot, glow: 0.4, surface: 'glass' });
    y += h;
    // The set-back deck: a white slab with an LED edge, a lawn on top, little trees.
    const next = radii[i + 1];
    const deck = rad + 0.05;
    k.cyl(deck, deck - 0.02, 0.07, 8, white, 0, y + 0.035, 0, { bevel: 0.02, rot });
    tube(k, deck + 0.004, deck + 0.004, 0.018, 8, led, 0, y + 0.012, 0, { glow: 0.9, rot });
    if (next) {
      k.cyl(rad - 0.02, rad - 0.02, 0.03, 8, C.lawn, 0, y + 0.08, 0, { tex: 'lawn', rot });
      for (let t = 0; t < 2; t++) {
        const a = t * Math.PI + i * 0.7 + v;
        const rr = (rad + next) / 2;
        k.add(new THREE.IcosahedronGeometry(0.055 + (t % 2) * 0.02, 0), t % 2 ? C.leaf : C.leafDark, Math.sin(a) * rr, y + 0.14, Math.cos(a) * rr, { flat: true, rot: [a, a * 2, 0] });
      }
    }
    ribTop.push(y);
    y += 0.07;
  });
  // The exoskeleton: white ribs from the podium to the crown, leaning in.
  const nRib = v % 2 ? 3 : 4;
  for (let i = 0; i < nRib; i++) {
    const a = (i / nRib) * Math.PI * 2 + Math.PI / 4;
    const pts: Array<[number, number, number]> = [[Math.sin(a) * 0.86, 0.46, Math.cos(a) * 0.86]];
    radii.forEach((rad, j) => pts.push([Math.sin(a + 0.15 * (j + 1)) * (rad + 0.08), ribTop[j]! + 0.04, Math.cos(a + 0.15 * (j + 1)) * (rad + 0.08)]));
    for (let j = 0; j + 1 < pts.length; j += 1) strut(k, pts[j]!, pts[j + 1]!, 0.04, white, 6);
  }
  // Crown: a white cap, a needle, a beacon.
  k.cyl(0.2, 0.36, 0.25, 8, white, 0, y + 0.12, 0, { bevel: 0.02 });
  k.cone(0.12, 1.1, 8, white, 0, y + 0.8, 0, { surface: 'gloss' });
  k.cyl(0.012, 0.012, 0.5, 4, C.metal, 0, y + 1.5, 0, { surface: 'metal' });
  k.part('flare', [0, y + 1.78, 0]).sphere(0.06, 0xc8a0ff, 0, 0, 0, 6, { glow: 1 });
  // Plaza planting.
  for (const [x, z] of [[-0.8, 0.8], [0.8, 0.8], [-0.8, -0.8], [0.8, -0.8]] as const) bush(k, x, z, 1.4, C.leaf);
  return mirrored(k.build(), v);
}

// ---------------------------------------------------------------------------
// Civic and core buildings. The team colour marks them: flags, domes, banners, trims.

/** Town hall (5x5): a classical hall on a podium — portico and pediment, clock tower and team dome, wings, a plaza with a fountain. */
function townHall(team: number): THREE.Group {
  const k = new Kit();
  const roofCol = COPPER;
  lot(k, 5, 5, C.pavingLight);
  // Plaza paving bands, lawns at the back.
  for (const x of [-1.2, 1.2]) k.box(0.08, 0.008, 2.0, C.paving, x, 0.128, 1.45, { flat: true });
  k.box(4.7, 0.008, 0.08, C.paving, 0, 0.128, 0.95, { flat: true });
  k.box(4.6, 0.025, 0.55, C.lawn, 0, 0.135, -2.1, { tex: 'lawn', flat: true });
  // The main hall: podium, rusticated ground floor, piano nobile, cornice, balustrade, copper hip roof.
  const zc = -0.75;
  const W = 3.1;
  const D = 1.9;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  k.block(W + 0.3, 0.22, D + 0.3, STONE_DARK, 0, 0.1, zc, { tex: 'concrete', bevel: 0.03 });
  k.block(W, 0.6, D, STONE_DARK, 0, 0.32, zc, { tex: 'concrete' });
  k.box(W + 0.03, 0.04, D + 0.03, C.trim, 0, 0.92, zc, { flat: true });
  k.block(W - 0.04, 0.82, D - 0.04, STONE, 0, 0.94, zc, { tex: 'plaster' });
  k.block(W + 0.12, 0.09, D + 0.12, C.trim, 0, 1.76, zc, { bevel: 0.03 });
  parapet(k, W + 0.06, D + 0.06, 1.85, C.trim, 0, zc, 0.1, 0.05);
  k.hip(W - 0.2, D - 0.2, 0.42, roofCol, 0, 1.86, zc, { over: 0 });
  // Windows all round: square below, tall above with frames, sills and cornices.
  const front = [-1.35, -1.05, 1.05, 1.35];
  windowGrid(k, 'z', zf, front, [0.6], { w: 0.15, h: 0.2, frame: C.trim, seed: 1, lit: 0.8 });
  windowGrid(k, 'z', zf - 0.02, front, [1.3], { w: 0.15, h: 0.36, frame: C.trim, sill: C.trim, lintel: C.trim, bars: C.trim, seed: 2, lit: 0.8 });
  const back = spread(7, W - 0.5);
  windowGrid(k, '-z', zb, back, [0.6], { w: 0.15, h: 0.2, seed: 3, lit: 0.7 });
  windowGrid(k, '-z', zb - 0.02, back, [1.3], { w: 0.15, h: 0.36, frame: C.trim, sill: C.trim, seed: 4, lit: 0.8 });
  for (const f of ['x', '-x'] as const) {
    windowGrid(k, f, W / 2, spread(4, D - 0.6, zc), [0.6], { w: 0.15, h: 0.2, seed: 5, lit: 0.7 });
    windowGrid(k, f, W / 2 - 0.02, spread(4, D - 0.6, zc), [1.3], { w: 0.15, h: 0.36, frame: C.trim, sill: C.trim, seed: 6, lit: 0.8 });
  }
  // Pilasters between the tall windows on the front.
  for (const x of [-1.5, -1.2, -0.9, 0.9, 1.2, 1.5]) fbox(k, 'z', zf - 0.02, x, 1.34, 0.06, 0.8, 0.025, C.trim, { flat: true });
  // Portico: a raised deck with steps, six columns, an entablature and a pediment with a team tympanum and a gilt roundel.
  const pz = zf + 0.36;
  k.block(2.3, 0.22, 0.78, STONE_DARK, 0, 0.1, zf + 0.37, { tex: 'concrete', bevel: 0.02 });
  for (let i = 0; i < 3; i++) k.block(2.0 - i * 0.04, 0.075, 0.16, C.concreteLight, 0, 0.1 + i * 0.075, zf + 0.92 - i * 0.12, { tex: 'concrete', bevel: 0.01 });
  for (const x of spread(6, 1.9)) column(k, x, pz + 0.1, 0.32, 1.3, 0.07, C.white);
  k.block(2.2, 0.15, 0.7, C.trim, 0, 1.62, zf + 0.33, { bevel: 0.02 });
  k.box(2.22, 0.035, 0.02, team, 0, 1.68, zf + 0.69, { flat: true });
  pediment(k, 2.2, 0.7, 0.42, C.trim, 0, 1.77, zf + 0.33, roofCol);
  pediment(k, 1.6, 0.01, 0.27, team, 0, 1.81, zf + 0.69);
  k.cyl(0.085, 0.085, 0.02, 10, GOLD, 0, 1.9, zf + 0.705, { rot: [Math.PI / 2, 0, 0], surface: 'metal', glow: 0.2 });
  door(k, 'z', zf, 0, 0.32, 0.36, 0.52, 0x5a3a28, { surround: C.trim, fanlight: true });
  windowGrid(k, 'z', zf, [-0.55, 0.55], [0.58], { w: 0.16, h: 0.32, frame: C.trim, seed: 7, lit: 1 });
  windowGrid(k, 'z', zf, [-0.55, 0, 0.55], [1.32], { w: 0.16, h: 0.3, frame: C.trim, seed: 8, lit: 1 });
  // Clock tower: stone stage with four clocks, an open lit belfry, a drum and the team dome, lantern and finial.
  const tz = zc - 0.05;
  k.block(0.84, 0.9, 0.84, STONE, 0, 1.86, tz, { tex: 'plaster', bevel: 0.02 });
  k.block(0.92, 0.07, 0.92, C.trim, 0, 2.74, tz, { bevel: 0.02 });
  for (const f of ['z', '-z'] as const) clock(k, f, f === 'z' ? 0.42 + tz : 0.42 - tz, 0, 2.42, 0.2);
  for (const f of ['x', '-x'] as const) clock(k, f, 0.42, tz, 2.42, 0.2);
  k.block(0.5, 0.36, 0.5, 0xffe2a0, 0, 2.81, tz, { glow: 0.45 });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.block(0.12, 0.38, 0.12, C.trim, dx * 0.3, 2.81, tz + dz * 0.3, { bevel: 0.015 });
  k.block(0.8, 0.07, 0.8, C.trim, 0, 3.19, tz, { bevel: 0.02 });
  k.cyl(0.32, 0.34, 0.14, 16, STONE, 0, 3.33, tz, { bevel: 0.015 });
  k.dome(0.34, team, 0, 3.4, tz, 16, { surface: 'gloss' });
  k.cyl(0.06, 0.07, 0.14, 8, C.trim, 0, 3.8, tz);
  k.cone(0.06, 0.1, 8, roofCol, 0, 3.92, tz);
  k.cyl(0.008, 0.008, 0.24, 4, GOLD, 0, 4.06, tz, { surface: 'metal' });
  k.sphere(0.025, GOLD, 0, 3.99, tz, 6, { surface: 'metal' });
  // Wings: lower blocks either side with slate hip roofs, team banners on their fronts.
  for (const s of [-1, 1]) {
    const wx = s * 1.98;
    k.block(0.82, 0.18, 1.5, STONE_DARK, wx, 0.1, zc - 0.1, { tex: 'concrete', bevel: 0.02 });
    k.block(0.72, 0.95, 1.4, STONE, wx, 0.28, zc - 0.1, { tex: 'plaster' });
    k.block(0.8, 0.06, 1.48, C.trim, wx, 1.22, zc - 0.1, { bevel: 0.02 });
    k.hip(0.7, 1.38, 0.32, SLATE, wx, 1.28, zc - 0.1, { over: 0.03 });
    const wf = zc - 0.1 + 0.7;
    windowGrid(k, 'z', wf, [wx - s * 0.15], [0.52, 0.95], { w: 0.14, h: 0.24, frame: C.trim, sill: C.trim, seed: 9 + s, lit: 0.8 });
    banner(k, 'z', wf, wx + s * 0.17, 0.82, 0.18, 0.62, team);
    windowGrid(k, s > 0 ? 'x' : '-x', 2.34, spread(3, 0.9, zc - 0.1), [0.52, 0.95], { w: 0.13, h: 0.22, sill: C.trim, seed: 11 + s, lit: 0.7 });
    windowGrid(k, '-z', -(zc - 0.1 - 0.7), spread(2, 0.4, wx), [0.52, 0.95], { w: 0.13, h: 0.22, sill: C.trim, seed: 13 + s, lit: 0.7 });
    k.block(0.1, 0.3, 0.1, STONE_DARK, wx, 1.4, zc - 0.5, { tex: 'concrete', bevel: 0.01 });
  }
  // The fountain: a stone basin, lit water, a pedestal with an upper bowl and a jet.
  const fz = 1.72;
  k.cyl(0.52, 0.56, 0.16, 16, STONE, 0, 0.18, fz, { bevel: 0.03 });
  k.cyl(0.46, 0.46, 0.02, 16, C.water, 0, 0.255, fz, { surface: 'glass', glow: 0.25 });
  k.cyl(0.05, 0.08, 0.3, 8, STONE, 0, 0.38, fz);
  k.cyl(0.2, 0.08, 0.07, 12, STONE, 0, 0.55, fz, { bevel: 0.01 });
  k.cyl(0.17, 0.17, 0.015, 12, C.water, 0, 0.585, fz, { surface: 'glass', glow: 0.3 });
  k.cone(0.06, 0.24, 6, 0xd8f4ff, 0, 0.7, fz, { glow: 0.5, surface: 'glass' });
  // Flags flank the steps; benches round the fountain; lanterns, planters and trees frame the plaza.
  for (const s of [-1, 1]) {
    flagpole(k, s * 1.45, 0.92, 1.35, team, 0.1, true, 1.2);
    bench(k, s * 0.85, fz, false);
    lantern(k, s * 1.25, 2.3, 0.55);
    lantern(k, s * 0.7, 0.98, 0.55);
    tree(k, s * 2.05, 1.95, 1.1, s + 2);
    tree(k, s * 2.05, 1.0, 0.95, s + 5);
    tree(k, s * 1.7, -2.1, 1.0, s + 8);
    planter(k, s * 1.85, 0.42, 0.26, 0.5, 0.1, 0x5a8a3a);
    for (const fl of [-0.1, 0.1]) k.box(0.1, 0.04, 0.1, s > 0 ? 0xd85a8a : 0xe0c040, s * 1.85 + fl, 0.27, 0.42 + fl * 1.5, { flat: true });
  }
  bench(k, 0, fz + 0.75, true);
  hedge(k, 0, -2.42, 3.6, true);
  for (let i = 0; i < 7; i++) person(k, Math.sin(i * 2.4) * (1.0 + (i % 3) * 0.35), fz + Math.cos(i * 2.4) * 0.75 - 0.1, i * 7 + 1);
  return k.build();
}

/** Regional office (3x3): a two-storey civic building — columned porch and pediment, cupola, a team flag on the lawn. */
function regionalOffice(team: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, C.lawn, 'lawn');
  const W = 2.1;
  const D = 1.3;
  const zc = -0.4;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  // Forecourt and path.
  k.box(2.7, 0.02, 0.42, C.pavingLight, 0, 0.12, -1.25, { tex: 'concrete', flat: true });
  k.box(0.46, 0.02, 1.0, C.pavingLight, 0, 0.12, 0.92, { tex: 'concrete', flat: true });
  // Body: stone plinth, red-brick walls with stone quoins and a string course, a cornice and a slate hip roof.
  k.block(W + 0.12, 0.1, D + 0.12, STONE_DARK, 0, 0.1, zc, { tex: 'concrete', bevel: 0.02 });
  k.block(W, 1.0, D, C.brick, 0, 0.2, zc, { tex: 'brick' });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.block(0.08, 1.0, 0.08, STONE, x * (W / 2 - 0.03), 0.2, zc + z * (D / 2 - 0.03), { flat: true });
  k.box(W + 0.03, 0.035, D + 0.03, STONE, 0, 0.68, zc, { flat: true });
  k.block(W + 0.12, 0.07, D + 0.12, C.trim, 0, 1.2, zc, { bevel: 0.025 });
  k.hip(W, D, 0.48, SLATE, 0, 1.27, zc, { over: 0.06 });
  // Windows: framed sashes with stone sills and lintels on every side.
  const wo = { w: 0.14, h: 0.24, frame: C.white, sill: STONE, lintel: STONE };
  windowGrid(k, 'z', zf, [-0.85, -0.6, 0.6, 0.85], [0.45, 0.94], { ...wo, seed: 1, lit: 0.8 });
  windowGrid(k, '-z', zb, spread(5, 1.6), [0.45, 0.94], { ...wo, seed: 2, lit: 0.7 });
  for (const f of ['x', '-x'] as const) windowGrid(k, f, W / 2, spread(3, 0.8, zc), [0.45, 0.94], { ...wo, seed: 3, lit: 0.7 });
  // Porch: four columns, entablature with a team frieze, a pediment, steps, a double door.
  k.block(1.2, 0.1, 0.5, STONE_DARK, 0, 0.1, zf + 0.25, { tex: 'concrete', bevel: 0.015 });
  k.block(0.9, 0.05, 0.14, C.concreteLight, 0, 0.1, zf + 0.56, { tex: 'concrete', bevel: 0.01 });
  for (const x of spread(4, 0.95)) column(k, x, zf + 0.38, 0.2, 0.92, 0.05, C.white);
  k.block(1.18, 0.1, 0.52, C.trim, 0, 1.12, zf + 0.24, { bevel: 0.015 });
  k.box(1.2, 0.03, 0.02, team, 0, 1.17, zf + 0.5, { flat: true });
  pediment(k, 1.18, 0.52, 0.3, C.trim, 0, 1.22, zf + 0.24, SLATE);
  pediment(k, 0.86, 0.01, 0.19, team, 0, 1.25, zf + 0.505);
  door(k, 'z', zf, 0, 0.2, 0.26, 0.4, 0x2f4f3f, { surround: C.trim, fanlight: true });
  windowGrid(k, 'z', zf, [0], [0.94], { w: 0.18, h: 0.26, frame: C.white, seed: 4, lit: 1 });
  // Cupola: a white lantern with a lit belfry and a team dome.
  k.block(0.34, 0.22, 0.34, C.white, 0, 1.62, zc, { bevel: 0.015 });
  k.block(0.22, 0.14, 0.22, 0xffe2a0, 0, 1.84, zc, { glow: 0.5 });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.box(0.05, 0.15, 0.05, C.white, dx * 0.13, 1.915, zc + dz * 0.13, { flat: true });
  k.block(0.36, 0.04, 0.36, C.white, 0, 1.99, zc, { bevel: 0.01 });
  k.dome(0.16, team, 0, 2.03, zc, 10, { surface: 'gloss' });
  k.cyl(0.006, 0.006, 0.2, 4, GOLD, 0, 2.27, zc, { surface: 'metal' });
  // Chimneys.
  for (const s of [-1, 1]) {
    k.block(0.12, 0.42, 0.18, C.brickDark, s * 0.72, 1.28, zc - 0.25, { tex: 'brick', bevel: 0.012 });
    k.box(0.15, 0.03, 0.21, STONE, s * 0.72, 1.71, zc - 0.25, { flat: true });
  }
  // The lawn: the flag, a notice board in team colour, hedges, lanterns, trees, a parked car.
  flagpole(k, 1.1, 0.95, 1.7, team, 0.1, true, 1.1);
  k.block(0.38, 0.22, 0.04, team, -0.8, 0.26, 1.15, { bevel: 0.01 });
  k.box(0.3, 0.14, 0.01, C.white, -0.8, 0.37, 1.175, { flat: true });
  for (const x of [-0.94, -0.66]) k.box(0.025, 0.2, 0.025, C.metalDark, x, 0.2, 1.15, { flat: true });
  for (const s of [-1, 1]) {
    hedge(k, s * 0.75, 0.48, 0.9, true);
    lantern(k, s * 0.33, 1.3, 0.5);
    tree(k, s * 1.22, -1.22, 0.95, s + 3);
  }
  car(k, -1.0, -1.25, 0x34495e, true);
  car(k, 0.55, -1.25, 0xecf0f1, true);
  return k.build();
}

const AWNINGS = [0xd64541, 0x2f7fd0, 0x3f9a4a, 0xe0b23a, 0xd070b0, 0xe08a3c];
const PRODUCE = [0xd8402a, 0xf0a020, 0x6aaa3a, 0xe8d040, 0x8a3a6a, 0xc06a2a];

/** One market stall facing +z (s = 1) or -z: counter, produce, posts, striped awning. */
function stall(k: Kit, x: number, z: number, s: number, hex: number, seed: number): void {
  const r = rng(seed);
  k.block(0.62, 0.2, 0.26, C.timber, x, 0.1, z, { tex: 'planks', bevel: 0.01 });
  for (let i = 0; i < 4; i++) {
    const c = PRODUCE[Math.floor(r() * PRODUCE.length)]!;
    k.block(0.13, 0.04, 0.16, 0x8a6a40, x - 0.21 + i * 0.14, 0.3, z, { tex: 'planks', flat: true });
    k.block(0.11, 0.035, 0.14, c, x - 0.21 + i * 0.14, 0.34, z, { bevel: 0.015, edge: 1.15 });
  }
  for (const e of [-1, 1]) for (const d of [-1, 1]) k.box(0.02, 0.62, 0.02, C.timberDark, x + e * 0.29, 0.41, z + d * 0.14, { flat: true });
  const f = s > 0 ? 'z' : '-z';
  awning(k, f, s > 0 ? z - 0.15 : -(z + 0.15), x, 0.72, 0.68, 0.42, hex, { stripes: 5, slope: 0.32 });
  if (r() < 0.6) k.block(0.18, 0.14, 0.14, 0x9a7a4a, x + 0.18, 0.1, z - s * 0.24, { tex: 'planks', bevel: 0.01 });
}

/** Market (3x3): an iron market hall with a glazed clerestory at the back, striped stalls in front, carts and shoppers. */
function market(team: number): THREE.Group {
  const k = new Kit();
  const iron = 0x2f4a3a;
  lot(k, 3, 3, C.pavingLight);
  k.box(2.8, 0.008, 0.06, C.paving, 0, 0.128, 0.7, { flat: true });
  // The hall: brick ends, iron columns, a slate roof with a raised glazed lantern and a team ridge.
  const zc = -0.85;
  k.block(2.7, 0.06, 1.1, C.paving, 0, 0.1, zc, { tex: 'concrete', bevel: 0.01 });
  for (const s of [-1, 1]) {
    k.block(0.12, 0.9, 1.1, C.brick, s * 1.3, 0.1, zc, { tex: 'brick', bevel: 0.01 });
    fbox(k, s > 0 ? 'x' : '-x', 1.36, zc, 0.55, 0.42, 0.5, 0.012, WARM, { glow: 0.5, surface: 'glass', flat: true });
    for (const t of spread(3, 0.3, zc)) fbox(k, s > 0 ? 'x' : '-x', 1.36, t, 0.55, 0.02, 0.5, 0.02, iron, { flat: true }, 0.004);
  }
  for (const x of spread(5, 2.4)) for (const z of [zc + 0.5, zc - 0.5]) {
    k.cyl(0.025, 0.03, 0.82, 6, iron, x, 0.53, z, { surface: 'metal' });
    k.box(0.07, 0.04, 0.07, iron, x, 0.92, z, { flat: true });
  }
  k.box(2.62, 0.06, 0.04, iron, 0, 0.95, zc + 0.5, { flat: true });
  k.box(2.62, 0.06, 0.04, iron, 0, 0.95, zc - 0.5, { flat: true });
  k.gable(2.7, 1.1, 0.4, SLATE, 0, 0.98, zc, { over: 0.06 });
  k.block(2.2, 0.16, 0.36, 0xfff0c8, 0, 1.25, zc, { glow: 0.35, surface: 'glass', tex: 'glass' });
  for (const x of spread(9, 2.16)) k.box(0.02, 0.16, 0.37, iron, x, 1.33, zc, { flat: true });
  k.gable(2.24, 0.4, 0.14, SLATE, 0, 1.41, zc, { over: 0.03 });
  k.box(2.3, 0.035, 0.04, team, 0, 1.56, zc, { flat: true });
  // Inside the hall: counters with produce, hanging lamps; a team banner over the opening.
  for (const x of [-0.8, 0, 0.8]) {
    k.block(0.5, 0.18, 0.24, C.timber, x, 0.16, zc - 0.05, { tex: 'planks', bevel: 0.01 });
    k.block(0.44, 0.04, 0.18, PRODUCE[(Math.round(x * 5) + 9) % PRODUCE.length]!, x, 0.34, zc - 0.05, { bevel: 0.015 });
    k.sphere(0.035, 0xffe7b0, x, 0.8, zc, 6, { glow: 1 });
  }
  banner(k, 'z', zc + 0.5, 0, 0.82, 0.9, 0.12, team);
  // Stalls in two rows across an aisle.
  let i = 0;
  for (const x of [-0.92, 0, 0.92]) {
    stall(k, x, 0.15, 1, AWNINGS[i % AWNINGS.length]!, i * 13 + 1);
    i++;
    stall(k, x, 1.18, -1, AWNINGS[(i + 2) % AWNINGS.length]!, i * 17 + 2);
    i++;
  }
  // A handcart, barrels and crates, a team parasol, lanterns, shoppers.
  k.block(0.34, 0.08, 0.2, C.timber, -1.25, 0.2, 0.7, { tex: 'planks', bevel: 0.01 });
  k.cylZ(0.07, 0.03, 8, C.timberDark, -1.2, 0.17, 0.82);
  k.cylZ(0.07, 0.03, 8, C.timberDark, -1.2, 0.17, 0.58);
  for (let j = 0; j < 3; j++) k.box(0.08, 0.06, 0.08, PRODUCE[j]!, -1.32 + j * 0.08, 0.31, 0.7, { bevel: 0.02 });
  for (const [x, z] of [[1.3, 0.55], [1.3, 0.75], [1.18, 0.65]] as const) k.cyl(0.06, 0.06, 0.16, 8, 0x7a5232, x, 0.18, z, { tex: 'planks', bevel: 0.01 });
  k.cyl(0.008, 0.008, 0.55, 4, C.metalDark, 1.2, 0.37, -0.15, { surface: 'metal' });
  k.cone(0.24, 0.12, 8, team, 1.2, 0.66, -0.15, { flat: true });
  k.box(0.2, 0.15, 0.2, C.white, 1.2, 0.18, -0.15, { flat: true, bevel: 0.01 });
  crates(k, -1.35, -0.2, 3, 0xe08a3c);
  for (const s of [-1, 1]) lantern(k, s * 1.38, 1.38, 0.5);
  for (let j = 0; j < 7; j++) person(k, -1.0 + j * 0.33, 0.68 + Math.sin(j * 1.7) * 0.08, j * 5 + 3);
  return k.build();
}

/** Police station (2x2): a two-storey station with a chequered band, a blue lamp, a patrol car and a roof beacon. */
function policeStation(team: number): THREE.Group {
  const k = new Kit();
  const wall = 0xdcd8ce;
  lot(k, 2, 2, C.paving);
  const W = 1.5;
  const D = 0.95;
  const zc = -0.38;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  k.block(W + 0.06, 0.06, D + 0.06, C.concrete, 0, 0.1, zc, { tex: 'concrete', bevel: 0.015 });
  k.block(W, 0.48, D, 0x8a8f96, 0, 0.16, zc, { tex: 'concrete' });
  k.block(W, 0.5, D, wall, 0, 0.64, zc, { tex: 'plaster' });
  // The chequered band round the top.
  k.block(W + 0.02, 0.1, D + 0.02, POLICE, 0, 1.0, zc, { flat: true });
  for (const x of spread(12, W - 0.06)) for (const [f, row] of [['z', 0], ['-z', 1]] as const) {
    const i = Math.round((x + W / 2) * 8);
    if ((i + row) % 2) fbox(k, f, f === 'z' ? zf + 0.01 : zb + 0.01, x, 1.025 + ((i % 2) ? 0 : 0.05) - 0.025, W / 12, 0.05, 0.006, C.white, { flat: true });
  }
  k.block(W + 0.06, 0.05, D + 0.06, C.trim, 0, 1.1, zc, { bevel: 0.015 });
  flatRoof(k, W, D, 1.15, C.trim, 0, zc);
  // Entrance: glass doors under a canopy with a team fascia; the blue lamp over it.
  door(k, 'z', zf, -0.35, 0.16, 0.3, 0.34, 0x3a3f44, { glass: true });
  canopy(k, 'z', zf, -0.35, 0.56, 0.5, 0.24, C.white, true, team);
  k.box(0.012, 0.012, 0.1, C.metalDark, -0.35, 0.68, zf + 0.05, { flat: true });
  k.box(0.07, 0.1, 0.07, 0x4a7aff, -0.35, 0.68, zf + 0.12, { glow: 1, surface: 'glass' });
  k.box(0.09, 0.02, 0.09, 0x1a1c1f, -0.35, 0.74, zf + 0.12, { flat: true });
  fbox(k, 'z', zf, 0.3, 0.86, 0.5, 0.11, 0.015, POLICE, { flat: true });
  fbox(k, 'z', zf + 0.015, 0.3, 0.86, 0.42, 0.04, 0.005, C.white, { glow: 0.4, flat: true });
  // Windows: dark-framed, a row per floor.
  const wo = { w: 0.16, h: 0.18, frame: 0x2a2d30, seed: 3, lit: 0.75 };
  windowGrid(k, 'z', zf, [0.15, 0.45], [0.38], wo);
  windowGrid(k, 'z', zf, [-0.55, -0.25, 0.05], [0.84], { ...wo, seed: 4 });
  windowGrid(k, 'z', zf, [0.55], [0.84], { ...wo, seed: 5 });
  windowGrid(k, '-z', zb, spread(4, 1.1), [0.38, 0.84], { ...wo, seed: 6 });
  windowGrid(k, '-x', W / 2, spread(2, 0.5, zc), [0.38, 0.84], { ...wo, seed: 7 });
  windowGrid(k, 'x', W / 2, [zc - 0.2], [0.84], { ...wo, seed: 8 });
  // Garage door on the side, with a ramp.
  fbox(k, 'x', W / 2, zc + 0.12, 0.33, 0.42, 0.34, 0.012, 0x6a7078, { surface: 'metal', tex: 'panels', flat: true });
  k.box(0.2, 0.02, 0.44, C.asphalt, W / 2 + 0.1, 0.11, zc + 0.12, { flat: true, tex: 'concrete' });
  // Roof: radio mast with whips, an air unit, and the flashing beacon.
  k.cyl(0.015, 0.025, 0.9, 5, C.metalDark, -0.55, 1.6, zc - 0.25, { surface: 'metal' });
  for (const h of [1.75, 1.95]) k.box(0.25, 0.012, 0.012, C.metalDark, -0.55, h, zc - 0.25, { flat: true });
  k.sphere(0.03, 0xff4040, -0.55, 2.07, zc - 0.25, 5, { glow: 1 });
  hvac(k, 0.1, 1.15, zc - 0.2, 0.9);
  k.block(0.12, 0.06, 0.12, C.metalDark, 0.5, 1.15, -0.5, { bevel: 0.01 });
  k.part('flare', [0.5, 1.26, -0.5]).sphere(0.07, 0x4a7aff, 0, 0, 0, 8, { glow: 1 });
  // Forecourt: patrol cars in painted bays, bollards, the team flag.
  for (const x of [0.32, 0.72]) {
    paint(k, 0.02, 0.5, x - 0.2, 0.62);
    paint(k, 0.02, 0.5, x + 0.2, 0.62);
  }
  vehicle(k, 0.32, 0.6, 'police', false);
  vehicle(k, 0.72, 0.62, 'police', false, 0xe8e8e8);
  bollards(k, spread(4, 0.6, -0.4), [0.82]);
  flagpole(k, -0.85, 0.78, 1.2, team);
  return k.build();
}

/** Clinic (3x2): a white low-rise with a teal trim, ribbon windows, an entrance canopy, a lit red cross and an ambulance bay. */
function clinic(team: number): THREE.Group {
  const k = new Kit();
  const teal = 0x3aa39a;
  lot(k, 3, 2, C.paving);
  const W = 2.4;
  const D = 1.0;
  const zc = -0.4;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  k.block(W + 0.06, 0.06, D + 0.06, C.concrete, 0, 0.1, zc, { tex: 'concrete', bevel: 0.015 });
  k.block(W, 0.62, D, C.white, 0, 0.16, zc, { tex: 'plaster' });
  k.box(W + 0.02, 0.05, D + 0.02, teal, 0, 0.73, zc, { flat: true });
  flatRoof(k, W, D, 0.78, C.white, 0, zc);
  // Upper storey over the middle, set back.
  const ux = -0.15;
  k.block(1.2, 0.5, 0.8, C.white, ux, 0.78, zc - 0.05, { tex: 'plaster' });
  k.box(1.22, 0.04, 0.82, teal, ux, 1.25, zc - 0.05, { flat: true });
  flatRoof(k, 1.2, 0.8, 1.28, C.white, ux, zc - 0.05);
  // Ribbon windows: a glazed strip with mullions, on every face.
  const ribbon = (f: 'z' | '-z' | 'x' | '-x', off: number, t: number, y: number, len: number, n: number, glow: number) => {
    fbox(k, f, off, t, y, len, 0.2, 0.01, 0xfff0d0, { glow, surface: 'glass', flat: true });
    for (const m of spread(n, len, t)) fbox(k, f, off, m, y, 0.025, 0.22, 0.02, C.metalDark, { flat: true, surface: 'metal' });
  };
  ribbon('z', zf, -0.75, 0.46, 0.8, 5, 0.5);
  ribbon('z', zf, 0.95, 0.46, 0.35, 3, 0.5);
  ribbon('-z', zb, 0, 0.46, 2.1, 9, 0.45);
  ribbon('x', W / 2, zc, 0.46, 0.7, 4, 0.45);
  ribbon('-x', W / 2, zc, 0.46, 0.7, 4, 0.45);
  ribbon('z', zf - 0.15, ux, 1.0, 1.0, 6, 0.5);
  ribbon('-z', zb - 0.05, ux, 1.0, 1.0, 6, 0.45);
  // Entrance: sliding glass doors, a canopy on posts with a team fascia, a lit red cross on the upper wall.
  door(k, 'z', zf, 0.4, 0.16, 0.4, 0.36, 0x3a3f44, { glass: true });
  canopy(k, 'z', zf, 0.4, 0.6, 0.85, 0.42, C.white, true, team);
  redCross(k, 'z', zf - 0.15, ux + 0.3, 1.0, 0.26);
  // A sign on a post by the road, red cross on it.
  k.box(0.03, 0.5, 0.03, C.metalDark, 1.2, 0.35, 0.82, { flat: true });
  redCross(k, 'z', 0.835, 1.2, 0.6, 0.2);
  // Ambulance bay: hatched paint, an ambulance; benches, planters, small trees.
  for (let i = 0; i < 4; i++) paint(k, 0.04, 0.4, -1.15 + i * 0.12, 0.62, 0xe0b23a);
  vehicle(k, -0.6, 0.62, 'ambulance', true);
  bench(k, 0.0, 0.42, true);
  planter(k, 0.9, 0.35, 0.3, 0.14, 0.1, 0x5a8a3a);
  tree(k, 1.25, 0.25, 0.75, 4);
  tree(k, -1.24, -0.76, 0.8, 7);
  hvac(k, 0.75, 0.79, zc - 0.15, 0.9);
  hvac(k, -0.3, 1.29, zc - 0.15, 0.8, false);
  for (let i = 0; i < 3; i++) person(k, 0.2 + i * 0.18, 0.62 + (i % 2) * 0.08, i * 3 + 11);
  return k.build();
}

/** School (3x3): a Victorian brick schoolhouse with a bell cupola and tall windows, a painted playground, a climbing frame and the team flag. */
function school(team: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, C.lawn, 'lawn');
  const W = 2.5;
  const D = 0.85;
  const zc = -0.9;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  // Main range: stone plinth, brick walls, tall barred windows, a slate roof, chimneys.
  k.block(W + 0.08, 0.06, D + 0.08, STONE_DARK, 0, 0.1, zc, { tex: 'concrete', bevel: 0.015 });
  k.block(W, 0.84, D, C.brick, 0, 0.16, zc, { tex: 'brick' });
  k.box(W + 0.02, 0.03, D + 0.02, STONE, 0, 0.55, zc, { flat: true });
  k.block(W + 0.05, 0.05, D + 0.05, STONE, 0, 0.98, zc, { bevel: 0.012 });
  k.gable(W, D, 0.46, SLATE, 0, 1.03, zc, { over: 0.07 });
  const wo = { w: 0.16, h: 0.34, frame: C.white, sill: STONE, lintel: STONE, bars: C.white, lit: 0.85 };
  windowGrid(k, 'z', zf, [0.0, 0.35, 0.7, 1.05], [0.6], { ...wo, seed: 1 });
  windowGrid(k, '-z', zb, spread(6, 2.1), [0.6], { ...wo, seed: 2 });
  windowGrid(k, 'x', W / 2, [zc], [0.6], { ...wo, seed: 3 });
  for (const s of [-1, 1]) {
    k.block(0.14, 0.4, 0.2, C.brickDark, s * 0.75, 1.15, zc - 0.15, { tex: 'brick', bevel: 0.012 });
    k.box(0.17, 0.03, 0.23, STONE, s * 0.75, 1.56, zc - 0.15, { flat: true });
  }
  // The entrance gable: a forward wing with the door, a date stone and a big window.
  const ex = -0.72;
  k.block(0.62, 0.84, 0.5, C.brick, ex, 0.16, zf + 0.2, { tex: 'brick' });
  k.block(0.66, 0.04, 0.54, STONE, ex, 0.98, zf + 0.2, { bevel: 0.01 });
  k.gable(0.5, 0.62, 0.38, SLATE, ex, 1.02, zf + 0.2, { rot: [0, Math.PI / 2, 0], over: 0.05 });
  door(k, 'z', zf + 0.45, ex, 0.16, 0.24, 0.34, 0x2f5a3a, { surround: STONE, fanlight: true });
  windowGrid(k, 'z', zf + 0.45, [ex], [0.78], { w: 0.22, h: 0.2, frame: C.white, bars: C.white, seed: 4, lit: 1 });
  fbox(k, 'z', zf + 0.45, ex, 1.1, 0.12, 0.08, 0.01, STONE, { flat: true });
  // Bell cupola on the ridge: white posts round a lit bell, a team spirelet.
  const cx = 0.45;
  k.block(0.26, 0.12, 0.26, C.white, cx, 1.36, zc, { bevel: 0.01 });
  k.block(0.14, 0.14, 0.14, GOLD, cx, 1.48, zc, { glow: 0.3, surface: 'metal' });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.box(0.035, 0.18, 0.035, C.white, cx + dx * 0.1, 1.57, zc + dz * 0.1, { flat: true });
  k.block(0.28, 0.03, 0.28, C.white, cx, 1.66, zc, { flat: true });
  k.cone(0.17, 0.3, 4, team, cx, 1.84, zc, { rot: [0, Math.PI / 4, 0] });
  k.sphere(0.02, GOLD, cx, 2.0, zc, 5, { surface: 'metal' });
  // Playground: asphalt with a painted court, hopscotch, a basketball hoop.
  k.box(1.7, 0.02, 1.25, C.asphalt, 0.5, 0.115, 0.65, { tex: 'concrete', flat: true });
  paint(k, 1.4, 0.02, 0.5, 0.15);
  paint(k, 1.4, 0.02, 0.5, 1.15);
  paint(k, 0.02, 1.0, -0.2, 0.65);
  paint(k, 0.02, 1.0, 1.2, 0.65);
  paint(k, 0.02, 1.0, 0.5, 0.65);
  ring(k, 0.15, 0.17, 12, 0xf2f0e6, 0.5, 0.127, 0.65);
  for (let i = 0; i < 4; i++) paint(k, 0.09, 0.09, -0.05 + (i % 2) * 0.1, 0.25 + i * 0.1, PRODUCE[i]!);
  k.box(0.03, 0.55, 0.03, C.metalDark, 1.3, 0.38, 0.65, { flat: true });
  k.box(0.02, 0.16, 0.24, C.white, 1.27, 0.66, 0.65, { flat: true });
  ring(k, 0.03, 0.045, 8, 0xe06a20, 1.22, 0.6, 0.65);
  // Climbing frame on the lawn: coloured bars on posts, a slide.
  const fx = -0.95;
  const fz = 0.75;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.box(0.025, 0.36, 0.025, 0xd84a2a, fx + dx * 0.16, 0.28, fz + dz * 0.16, { flat: true });
  k.box(0.36, 0.025, 0.36, 0xe0b23a, fx, 0.32, fz, { flat: true });
  for (const z of [-0.16, 0.16]) k.box(0.34, 0.02, 0.02, 0x2f7fd0, fx, 0.46, fz + z, { flat: true });
  k.box(0.12, 0.02, 0.4, 0x3f9a4a, fx + 0.1, 0.22, fz + 0.32, { rot: [0.7, 0, 0], flat: true });
  // Fence round the front, the team flag, trees, children at play.
  fence(k, 0, 1.42, 2.8, true, 0x2f5a3a);
  flagpole(k, -0.15, 1.15, 1.25, team);
  tree(k, -1.25, -0.1, 0.9, 2);
  tree(k, 1.22, -0.15, 0.85, 5);
  for (let i = 0; i < 6; i++) person(k, 0.1 + ((i * 0.37) % 1.1), 0.4 + ((i * 0.53) % 0.8), i * 9 + 5);
  return k.build();
}

/** Hospital (4x3, Digital age): a white three-storey block and a five-storey ward tower with a helipad, a glazed atrium, an emergency bay. */
function hospital(team: number): THREE.Group {
  const k = new Kit();
  const blue = 0x5a8ab0;
  lot(k, 4, 3, C.paving);
  // Drop-off road and car park.
  k.box(3.7, 0.02, 0.9, C.asphalt, 0, 0.115, 0.95, { tex: 'concrete', flat: true });
  for (let i = 0; i < 6; i++) paint(k, 0.02, 0.36, 0.55 + i * 0.25, 1.15);
  // Main block: three floors of ribbon windows with white spandrels.
  const W = 3.0;
  const D = 1.15;
  const zc = -0.62;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  const ribbon = (f: 'z' | '-z' | 'x' | '-x', off: number, t: number, y: number, len: number, n: number, seed: number) => {
    fbox(k, f, off, t, y, len, 0.2, 0.01, 0x8fb8d0, { surface: 'glass', flat: true });
    // Lit wards: runs of lit panes merged into one strip each.
    const r = rng(seed);
    const pane = len / n;
    let run = -1;
    for (let i = 0; i <= n; i++) {
      const lit = i < n && r() < 0.6;
      if (lit && run < 0) run = i;
      if (!lit && run >= 0) {
        fbox(k, f, off, t - len / 2 + ((run + i) / 2) * pane, y, (i - run) * pane - 0.04, 0.17, 0.004, 0xfff4dc, { glow: 0.5, surface: 'glass', flat: true }, 0.01);
        run = -1;
      }
    }
    for (const m of spread(Math.ceil(n / 2) + 1, len, t)) fbox(k, f, off, m, y, 0.025, 0.21, 0.02, C.white, { flat: true }, 0.004);
  };
  k.block(W + 0.06, 0.06, D + 0.06, C.concrete, 0.45, 0.1, zc, { tex: 'concrete', bevel: 0.015 });
  k.block(W, 1.44, D, 0xf2f2ee, 0.45, 0.16, zc, { tex: 'plaster' });
  for (let i = 0; i < 3; i++) {
    const y = 0.4 + i * 0.46;
    ribbon('z', zf, 0.95, y, 2.0, 8, i * 3 + 1);
    ribbon('-z', zb, 0.45, y, 2.8, 11, i * 3 + 2);
    ribbon('x', W / 2 + 0.45, zc, y, 0.9, 4, i * 3 + 3);
  }
  k.box(W + 0.02, 0.05, D + 0.02, blue, 0.45, 1.58, zc, { flat: true });
  flatRoof(k, W, D, 1.6, C.white, 0.45, zc);
  hvac(k, 1.4, 1.61, zc - 0.2);
  hvac(k, 1.4, 1.61, zc + 0.15);
  hvac(k, 0.75, 1.61, zc - 0.2);
  k.cyl(0.05, 0.05, 0.3, 8, C.metal, 0.9, 1.75, zc + 0.25, { surface: 'metal' });
  // Ward tower on the left, five floors, a big lit red cross, the helipad on top.
  const tx = -0.95;
  const tw = 1.2;
  const td = 1.05;
  const th = 2.4;
  k.block(tw, th, td, 0xf2f2ee, tx, 0.16, zc, { tex: 'plaster' });
  for (let i = 0; i < 5; i++) {
    const y = 0.4 + i * 0.44;
    ribbon('-x', -tx + tw / 2, zc, y, 0.85, 4, i * 5 + 10);
    ribbon('-z', zb - 0.05, tx, y, 1.0, 4, i * 5 + 11);
    if (i < 3) ribbon('z', zc + td / 2, tx - 0.2, y, 0.6, 3, i * 5 + 12);
  }
  redCross(k, 'z', zc + td / 2, tx + 0.3, 2.15, 0.36);
  k.box(tw + 0.02, 0.05, td + 0.02, blue, tx, th + 0.13, zc, { flat: true });
  flatRoof(k, tw, td, th + 0.16, C.white, tx, zc);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.box(0.04, 0.12, 0.04, C.metalDark, tx + dx * 0.3, th + 0.22, zc + dz * 0.3, { flat: true });
  const hy = th + 0.29;
  k.cyl(0.48, 0.48, 0.04, 16, 0x3a3f44, tx, hy, zc, { bevel: 0.01 });
  ring(k, 0.36, 0.4, 16, 0xe0b23a, tx, hy + 0.022, zc);
  for (const x of [-0.1, 0.1]) k.box(0.04, 0.008, 0.28, C.white, tx + x, hy + 0.024, zc, { flat: true });
  k.box(0.2, 0.008, 0.04, C.white, tx, hy + 0.024, zc, { flat: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(0.035, 0.03, 0.035, i % 2 ? 0x7dff8a : 0xffe08a, tx + Math.sin(a) * 0.46, hy + 0.03, zc + Math.cos(a) * 0.46, { glow: 1 });
  }
  // Glazed atrium entrance with a team canopy; the emergency bay with ambulances.
  k.block(0.9, 0.62, 0.36, 0x9cc4dc, 0.9, 0.16, zf + 0.18, { surface: 'glass', tex: 'glass', glow: 0.25 });
  k.block(0.96, 0.05, 0.42, C.white, 0.9, 0.78, zf + 0.18, { bevel: 0.015 });
  for (const t of spread(5, 0.88, 0.9)) fbox(k, 'z', zf + 0.36, t, 0.47, 0.02, 0.62, 0.01, C.white, { flat: true });
  door(k, 'z', zf + 0.36, 0.9, 0.16, 0.34, 0.34, 0x3a3f44, { glass: true });
  canopy(k, 'z', zf + 0.36, 0.9, 0.6, 1.1, 0.3, C.white, true, team);
  canopy(k, 'z', zc + td / 2, tx + 0.1, 0.62, 1.0, 0.55, C.white, true, RED_CROSS);
  vehicle(k, tx - 0.15, zc + td / 2 + 0.35, 'ambulance', false);
  vehicle(k, tx + 0.3, zc + td / 2 + 0.35, 'ambulance', false);
  // Car park, planters, trees, a flag, lamps.
  car(k, 0.55, 1.15, 0xc0392b, false);
  car(k, 1.05, 1.15, 0x34495e, false);
  car(k, 1.55, 1.15, 0xecf0f1, false);
  for (const x of [-1.62, 1.62]) tree(k, x, 1.2, 0.85, Math.round(x * 3));
  planter(k, 1.72, zf + 0.3, 0.2, 0.4, 0.1, 0x5a8a3a);
  flagpole(k, 1.5, 0.45, 1.4, team);
  for (const x of [-0.35, 0.3, 1.0]) lamp(k, x, 1.42, 0.55);
  return k.build();
}

/** University (4x4, Digital age): three sandstone ranges round a quad, a clock tower, and a domed rotunda library in team colours. */
function university(team: number): THREE.Group {
  const k = new Kit();
  const sand = 0xd8c8a0;
  const sandDark = 0xb8a47c;
  lot(k, 4, 4, C.lawn, 'lawn');
  // Paths across the quad.
  k.box(0.32, 0.02, 3.6, C.pavingLight, 0, 0.12, 0.1, { tex: 'concrete', flat: true });
  k.box(2.0, 0.02, 0.24, C.pavingLight, 0, 0.12, -0.3, { tex: 'concrete', flat: true });
  ring(k, 0.0, 0.42, 16, C.pavingLight, 0, 0.122, -0.3, { tex: 'concrete' });
  const range = (x: number, z: number, w: number, d: number, alongX: boolean) => {
    k.block(w + 0.08, 0.06, d + 0.08, sandDark, x, 0.1, z, { tex: 'concrete', bevel: 0.015 });
    k.block(w, 0.9, d, sand, x, 0.16, z, { tex: 'brick' });
    k.box(w + 0.02, 0.03, d + 0.02, sandDark, x, 0.55, z, { flat: true });
    k.block(w + 0.05, 0.05, d + 0.05, sandDark, x, 1.04, z, { bevel: 0.012 });
    if (alongX) k.gable(w, d, 0.45, SLATE, x, 1.09, z, { over: 0.06 });
    else k.gable(d, w, 0.45, SLATE, x, 1.09, z, { over: 0.06, rot: [0, Math.PI / 2, 0] });
  };
  // Back range and two side ranges.
  const bz = -1.42;
  range(0, bz, 3.6, 0.8, true);
  for (const s of [-1, 1]) range(s * 1.45, 0.25, 0.75, 2.0, false);
  const wo = { w: 0.13, h: 0.26, frame: 0xe8e0c8, bars: 0xe8e0c8, lit: 0.75 };
  windowGrid(k, 'z', bz + 0.4, [-1.0, -0.7, -0.4, 0.4, 0.7, 1.0], [0.4, 0.82], { ...wo, seed: 1 });
  const plain = { w: 0.13, h: 0.26, frame: 0xe8e0c8, lit: 0.7 };
  windowGrid(k, '-z', -bz + 0.4, spread(7, 3.0), [0.4, 0.82], { ...plain, seed: 2 });
  for (const s of [-1, 1]) {
    const f = s > 0 ? '-x' : 'x';
    windowGrid(k, f, -(1.45 - 0.375), spread(4, 1.5, 0.25), [0.4, 0.82], { ...wo, seed: 3 + s });
    windowGrid(k, s > 0 ? 'x' : '-x', 1.45 + 0.375, spread(4, 1.6, 0.25), [0.4, 0.82], { ...plain, seed: 5 + s });
    windowGrid(k, 'z', 1.25, [s * 1.45], [0.4, 0.82], { ...wo, w: 0.2, seed: 7 + s });
    windowGrid(k, s > 0 ? 'x' : '-x', 1.8, [bz], [0.4, 0.82], { ...plain, seed: 9 });
    banner(k, 'z', 1.25, s * 1.45 + 0.24, 0.7, 0.14, 0.6, team);
    banner(k, 'z', 1.25, s * 1.45 - 0.24, 0.7, 0.14, 0.6, team);
    // Dormers on the quad side of the back range, chimneys on the side ranges.
    for (const x of [s * 0.65, s * 1.0]) {
      k.block(0.16, 0.16, 0.18, sand, x, 1.12, bz + 0.26, { tex: 'brick' });
      k.gable(0.18, 0.2, 0.08, SLATE, x, 1.28, bz + 0.26, { rot: [0, Math.PI / 2, 0], over: 0.02 });
      windowGrid(k, 'z', bz + 0.35, [x], [1.2], { w: 0.08, h: 0.09, seed: 11, lit: 0.8 });
    }
    k.block(0.12, 0.42, 0.16, sandDark, s * 1.45, 1.25, -0.4, { tex: 'brick', bevel: 0.012 });
    k.block(0.12, 0.42, 0.16, sandDark, s * 1.45, 1.25, 0.9, { tex: 'brick', bevel: 0.012 });
  }
  // Clock tower over the back range's gate: four clocks, an open belfry, a slate spire and a gilt vane.
  const tz = bz;
  k.block(0.62, 1.95, 0.62, sand, 0, 0.16, tz, { tex: 'brick', bevel: 0.015 });
  for (const s of [-1, 1]) k.block(0.08, 1.95, 0.08, sandDark, s * 0.31, 0.16, tz + 0.31, { flat: true });
  door(k, 'z', tz + 0.31, 0, 0.16, 0.26, 0.4, 0x5a3a28, { surround: sandDark });
  windowGrid(k, 'z', tz + 0.31, [0], [1.0, 1.4], { w: 0.12, h: 0.24, frame: 0xe8e0c8, bars: 0xe8e0c8, seed: 12, lit: 1 });
  k.block(0.68, 0.05, 0.68, sandDark, 0, 2.11, tz, { bevel: 0.012 });
  for (const f of ['z', '-z'] as const) clock(k, f, f === 'z' ? 0.31 + tz : 0.31 - tz, 0, 1.85, 0.16);
  for (const f of ['x', '-x'] as const) clock(k, f, 0.31, tz, 1.85, 0.16);
  k.block(0.36, 0.3, 0.36, 0xffe2a0, 0, 2.16, tz, { glow: 0.45 });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.block(0.09, 0.32, 0.09, sand, dx * 0.24, 2.16, tz + dz * 0.24, { bevel: 0.01 });
  k.block(0.62, 0.05, 0.62, sandDark, 0, 2.48, tz, { bevel: 0.012 });
  k.cone(0.4, 0.8, 4, SLATE, 0, 2.93, tz, { rot: [0, Math.PI / 4, 0], tex: 'tiles' });
  k.cyl(0.008, 0.008, 0.25, 4, GOLD, 0, 3.42, tz, { surface: 'metal' });
  k.box(0.16, 0.02, 0.01, GOLD, 0.04, 3.48, tz, { flat: true, surface: 'metal' });
  // The rotunda library: a ring of columns round a drum, an entablature, the team dome, a lantern.
  const lz = 1.0;
  k.cyl(0.66, 0.7, 0.12, 16, sandDark, 0, 0.16, lz, { bevel: 0.02 });
  k.cyl(0.46, 0.46, 0.75, 16, sand, 0, 0.595, lz, { tex: 'brick' });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    column(k, Math.sin(a) * 0.58, lz + Math.cos(a) * 0.58, 0.22, 0.72, 0.04, 0xf0ead8);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    k.box(0.12, 0.24, 0.02, WARM, Math.sin(a) * 0.465, 0.6, lz + Math.cos(a) * 0.465, { glow: 0.6, surface: 'glass', rot: [0, a, 0] });
  }
  k.cyl(0.66, 0.66, 0.1, 16, 0xf0ead8, 0, 0.99, lz, { bevel: 0.02 });
  k.cyl(0.44, 0.48, 0.12, 16, sand, 0, 1.1, lz);
  k.dome(0.46, team, 0, 1.15, lz, 16, { surface: 'gloss' });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(0.02, 0.3, 0.02, tint(team, 0.7), Math.sin(a) * 0.33, 1.38, lz + Math.cos(a) * 0.33, { rot: [Math.cos(a) * 0.75, 0, -Math.sin(a) * 0.75], flat: true });
  }
  k.cyl(0.07, 0.08, 0.14, 8, 0xf0ead8, 0, 1.66, lz);
  k.cone(0.08, 0.12, 8, GOLD, 0, 1.79, lz, { surface: 'metal' });
  // The quad: a statue on a plinth, trees, benches, lamps, students.
  k.block(0.2, 0.22, 0.2, sandDark, 0, 0.12, -0.3, { bevel: 0.02 });
  k.cyl(0.04, 0.05, 0.2, 6, 0x5a7a6a, 0, 0.44, -0.3, { surface: 'metal' });
  k.sphere(0.04, 0x5a7a6a, 0, 0.58, -0.3, 6, { surface: 'metal' });
  for (const [x, z] of [[-0.68, 0.2], [0.68, 0.2]] as const) tree(k, x, z, 0.8, Math.round(x * 10 + z));
  for (const s of [-1, 1]) {
    bench(k, s * 0.5, -0.3, false);
    lantern(k, s * 0.26, 1.75, 0.5);
    tree(k, s * 1.6, 1.7, 0.9, s + 6);
  }
  for (let i = 0; i < 5; i++) person(k, Math.sin(i * 1.9) * 0.15, -0.95 + i * 0.32, i * 11 + 2);
  return k.build();
}

/** Research institute (3x3): a white lab block with team-trimmed parapets and fume stacks, an observatory dome, a turning radio dish, solar arrays. */
function researchInstitute(team: number): THREE.Group {
  const k = new Kit();
  lot(k, 3, 3, C.lawn, 'lawn');
  k.box(0.3, 0.02, 1.3, C.pavingLight, 0.25, 0.12, 0.75, { tex: 'concrete', flat: true });
  k.box(2.7, 0.02, 0.3, C.pavingLight, 0, 0.12, 0.05, { tex: 'concrete', flat: true });
  // The lab: two floors of white panels with glazing bands and vertical fins.
  const x0 = -0.2;
  const W = 2.3;
  const D = 1.05;
  const zc = -0.75;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  k.block(W + 0.06, 0.06, D + 0.06, C.concrete, x0, 0.1, zc, { tex: 'concrete', bevel: 0.015 });
  k.block(W, 1.0, D, 0xeef0f0, x0, 0.16, zc, { tex: 'panels' });
  for (const y of [0.42, 0.88]) {
    for (const [f, off, t, len] of [['z', zf, x0, W - 0.2], ['-z', zb, x0, W - 0.2], ['x', W / 2 + x0, zc, D - 0.2], ['-x', W / 2 - x0, zc, D - 0.2]] as const) {
      fbox(k, f, off, t, y, len, 0.2, 0.01, 0xfff4dc, { glow: 0.45, surface: 'glass', flat: true });
      for (const m of spread(Math.round(len / 0.2), len, t)) fbox(k, f, off, m, y, 0.03, 0.24, 0.05, 0xd6dadc, { flat: true, surface: 'metal' });
    }
  }
  k.block(W + 0.04, 0.04, D + 0.04, team, x0, 1.16, zc, { bevel: 0.01 });
  flatRoof(k, W, D, 1.2, 0xeef0f0, x0, zc);
  door(k, 'z', zf, 0.25, 0.16, 0.3, 0.2, 0x3a3f44, { glass: true });
  canopy(k, 'z', zf, 0.25, 0.4, 0.6, 0.28, C.white, true, team);
  // Roof: fume stacks, plant, a skylight, the radio dish on its pedestal.
  for (const x of [0.35, 0.55, 0.75]) {
    k.cyl(0.04, 0.045, 0.36, 8, C.metal, x, 1.38, zc - 0.25, { surface: 'metal' });
    k.cyl(0.05, 0.05, 0.03, 8, C.metalDark, x, 1.57, zc - 0.25, { surface: 'metal' });
  }
  hvac(k, 0.55, 1.21, zc + 0.2, 0.9);
  k.block(0.5, 0.1, 0.3, 0x9cc4dc, -0.25, 1.2, zc + 0.15, { surface: 'glass', glow: 0.2, bevel: 0.03, taper: 0.2 });
  k.cyl(0.1, 0.14, 0.18, 8, C.metalDark, -0.9, 1.29, -0.6, { surface: 'metal' });
  const dish = k.part('spin', [-0.9, 1.45, -0.6]);
  dish.box(0.06, 0.12, 0.06, C.metal, 0, 0.0, 0, { surface: 'metal' });
  {
    dish.box(0.2, 0.04, 0.04, C.metal, 0, 0.07, 0, { surface: 'metal' });
    dishFace(dish, 0.34, C.white, 0, 0.2, 0, 0, 0.75, 14);
    strut(dish, [0, 0.2, 0.02], [0, 0.38, 0.2], 0.008, C.metalDark, 4);
    dish.sphere(0.025, 0xff4040, 0, 0.39, 0.22, 5, { glow: 0.8 });
  }
  // Observatory: a drum with a door and a metal dome with its slit.
  const ox = 0.85;
  const oz = 0.75;
  k.cyl(0.46, 0.48, 0.55, 16, C.white, ox, 0.375, oz, { bevel: 0.015 });
  k.cyl(0.48, 0.48, 0.04, 16, team, ox, 0.66, oz);
  k.dome(0.46, 0xc8ccd0, ox, 0.68, oz, 16, { surface: 'metal' });
  k.box(0.12, 0.06, 0.46, 0x1a1c1f, ox, 1.0, oz + 0.12, { rot: [0.55, 0, 0], flat: true });
  k.box(0.14, 0.28, 0.46, 0x1a1c1f, ox, 0.88, oz + 0.12, { rot: [1.0, 0, 0], flat: true });
  door(k, '-x', -(ox - 0.48), oz, 0.1, 0.12, 0.24, 0x3a3f44);
  // Solar arrays on the lawn, a sign in team colour, trees, a bench.
  solar(k, -0.75, 0.1, 0.65, 0.9, 3, 0.24);
  k.block(0.5, 0.18, 0.04, team, -0.6, 0.2, 1.28, { bevel: 0.01 });
  k.box(0.42, 0.06, 0.01, C.white, -0.6, 0.3, 1.302, { flat: true, glow: 0.3 });
  for (const x of [-0.8, -0.4]) k.box(0.025, 0.12, 0.025, C.metalDark, x, 0.16, 1.28, { flat: true });
  tree(k, 1.22, -0.15, 0.85, 1);
  tree(k, -1.25, 0.1, 0.8, 2);
  tree(k, 1.26, 1.26, 0.75, 3);
  bench(k, 0.55, 0.3, true);
  for (let i = 0; i < 3; i++) person(k, 0.2 + i * 0.12, 0.4 + i * 0.25, i * 13 + 7);
  return k.build();
}

/** Data exchange (2x2, Digital age): a dark server hall striped with lit cooling fins, fans on the roof, a braced lattice mast with dishes and a beacon. */
function dataExchange(team: number): THREE.Group {
  const k = new Kit();
  const cyan = 0x40e0f0;
  const panel = 0x3f454c;
  lot(k, 2, 2, C.paving);
  const x0 = -0.25;
  const zc = 0.2;
  const W = 1.15;
  const D = 0.95;
  const zf = zc + D / 2;
  const zb = D / 2 - zc;
  k.block(W + 0.06, 0.06, D + 0.06, C.concrete, x0, 0.1, zc, { tex: 'concrete', bevel: 0.015 });
  k.block(W, 0.72, D, panel, x0, 0.16, zc, { tex: 'panels', surface: 'metal' });
  // Lit fins down the faces: the building hums in cyan at night.
  for (const t of spread(7, W - 0.15, x0)) fbox(k, 'z', zf, t, 0.52, 0.025, 0.56, 0.02, cyan, { glow: 0.85 });
  for (const t of spread(7, W - 0.15, x0)) fbox(k, '-z', zb, t, 0.52, 0.025, 0.56, 0.02, cyan, { glow: 0.85 });
  for (const t of spread(6, D - 0.15, zc)) fbox(k, '-x', W / 2 - x0, t, 0.52, 0.025, 0.56, 0.02, cyan, { glow: 0.85 });
  for (const t of spread(6, D - 0.15, zc)) fbox(k, 'x', W / 2 + x0, t, 0.52, 0.025, 0.56, 0.02, cyan, { glow: 0.85 });
  fbox(k, 'z', zf, x0 + 0.38, 0.27, 0.2, 0.22, 0.015, 0x2a2d30, { surface: 'metal', flat: true });
  k.box(0.05, 0.03, 0.02, 0x7dff8a, x0 + 0.5, 0.34, zf + 0.03, { glow: 1 });
  k.block(W + 0.04, 0.05, D + 0.04, team, x0, 0.88, zc, { bevel: 0.012 });
  flatRoof(k, W, D, 0.93, 0x5a6068, x0, zc, 0x4a4f55);
  // Roof fans in a grid.
  for (const dx of [-0.3, 0, 0.3]) for (const dz of [-0.2, 0.2]) {
    k.cyl(0.11, 0.12, 0.08, 10, 0x6a7078, x0 + dx, 0.98, zc + dz, { surface: 'metal', bevel: 0.01 });
    k.cyl(0.085, 0.085, 0.012, 10, 0x1a1c1f, x0 + dx, 1.025, zc + dz);
    k.box(0.16, 0.008, 0.02, C.metal, x0 + dx, 1.034, zc + dz, { rot: [0, dx * 4 + dz * 3, 0], flat: true });
  }
  // The lattice mast: four legs, cross-braced, platforms, dishes and microwave drums, a red beacon.
  const mx = 0.575;
  const mz = -0.375;
  const top = 2.7;
  const leg = 0.13;
  const legs: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [dx, dz] of legs) strut(k, [mx + dx * leg * 1.2, 0.1, mz + dz * leg * 1.2], [mx + dx * leg * 0.6, top, mz + dz * leg * 0.6], 0.016, 0xc8402e, 4, { surface: 'metal' });
  const lerp = (y: number) => leg * (1.2 - (0.6 * (y - 0.1)) / (top - 0.1));
  const levels = [0.1, 0.75, 1.4, 2.05, top];
  for (let i = 0; i + 1 < levels.length; i++) {
    const ya = levels[i]!;
    const yb = levels[i + 1]!;
    const a = lerp(ya);
    const b = lerp(yb);
    for (let s = 0; s < 4; s++) {
      const [ax, az] = legs[s]!;
      const [bx, bz] = legs[(s + 1) % 4]!;
      strut(k, [mx + ax * a, ya, mz + az * a], [mx + bx * b, yb, mz + bz * b], 0.008, i % 2 ? C.white : 0xc8402e, 3, { surface: 'metal' });
      strut(k, [mx + bx * b, yb, mz + bz * b], [mx + ax * b, yb, mz + az * b], 0.008, C.white, 3, { surface: 'metal' });
    }
  }
  k.block(0.36, 0.03, 0.36, C.metalDark, mx, 2.05, mz, { surface: 'metal' });
  dish(k, 0.17, C.white, mx - 0.18, 2.3, mz + 0.1, -0.9, 0.15);
  dish(k, 0.13, C.white, mx + 0.16, 1.7, mz + 0.12, 0.7, 0.05);
  k.cylZ(0.07, 0.06, 10, 0xe8eaec, mx, 1.15, mz + 0.14);
  k.cylX(0.06, 0.05, 10, 0xe8eaec, mx + 0.13, 2.45, mz);
  k.cyl(0.008, 0.008, 0.5, 4, C.metalDark, mx, top + 0.25, mz, { surface: 'metal' });
  k.part('flare', [mx, top + 0.53, mz]).sphere(0.05, 0xff4040, 0, 0, 0, 6, { glow: 1 });
  // A cable tray to the hall, a backup generator with a fuel tank, a security fence, a lamp.
  k.box(0.5, 0.03, 0.06, C.metalDark, 0.23, 0.82, -0.3, { flat: true, surface: 'metal' });
  k.block(0.4, 0.22, 0.2, 0x6a8a5a, -0.6, 0.1, -0.7, { surface: 'metal', tex: 'panels', bevel: 0.015 });
  k.cylX(0.07, 0.36, 10, C.white, -0.6, 0.2, -0.86, { surface: 'metal' });
  k.box(0.04, 0.12, 0.04, C.metalDark, -0.5, 0.38, -0.7, { flat: true });
  for (const [x, z, len, ax] of [[0, -0.94, 1.88, true], [-0.94, -0.3, 1.25, false], [0.94, 0.1, 1.7, false]] as const) {
    k.box(ax ? len : 0.01, 0.2, ax ? 0.01 : len, 0x8c939a, x, 0.2, z, { surface: 'metal', flat: true });
    for (const t of spread(Math.round(len / 0.3), len)) k.box(0.02, 0.24, 0.02, C.metalDark, ax ? x + t : x, 0.22, ax ? z : z + t, { flat: true });
  }
  lamp(k, 0.6, 0.85, 0.6);
  return k.build();
}

export const HOUSING_MODELS: Record<string, ModelFn> = {
  'house:0': cottage,
  'house:1': house,
  'house:2': terrace,
  'house:3': apartment,
  'house:4': tower,
  'house:5': spire,
  town_hall: townHall,
  regional_office: regionalOffice,
  market,
  police_station: policeStation,
  clinic,
  school,
  hospital,
  university,
  research_institute: researchInstitute,
  data_exchange: dataExchange,
};
