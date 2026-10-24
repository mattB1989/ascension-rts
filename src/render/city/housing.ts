// Kit-built housing and civic buildings (see ../kit.ts and common.ts).

import * as THREE from 'three';
import { Kit } from '../kit.ts';
import { BRICKS, C, DOORS, fence, hedge, lamp, lot, pick, ROOFS, tint, tree, WALLS, type ModelFn } from './common.ts';

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

export const HOUSING_MODELS: Record<string, ModelFn> = {
  'house:0': cottage,
  'house:1': house,
};

void tint;
