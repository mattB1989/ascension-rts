// Kit-built utilities, logistics, military and late-age buildings (see ../kit.ts,
// common.ts and infra-parts.ts). Waterfront buildings (trade_port, coast_guard,
// river_dock, hydro_plant, pumping_station) face the water on +x; the renderer
// turns them to the shore.

import * as THREE from 'three';
import { Kit, type Vec3 } from '../kit.ts';
import { C, car, chimney, crates, hedge, lamp, lot, pine, tint, tree, type ModelFn } from './common.ts';
import {
  beam, cones, container, CONTAINER_COLOURS, coolingTower, flag, floodMast, HT, hvac, ladder, lattice, light, OLIVE, prism, pylon, RED_LIGHT,
  panelRow, railing, ribbon, ring, ringRail, sandbags, securityFence, sign, sphereTank, strut, tank, teamOf, transformer, truck, trussX, water,
  aimRotor, batteryModule, gantry, sheep, solarTable, trackPath, windTurbine,
} from './infra-parts.ts';

// ---------------------------------------------------------------------------
// Utilities

/** Coal-fired power station: brick turbine hall, boiler house, twin stacks, coal yard and a switchyard. */
function powerPlant(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 4, 3);
  // Turbine hall: brick with piers and tall windows, a slate roof with a ridge vent.
  const hx = -0.85;
  const hz = -0.45;
  k.block(2.16, 0.06, 1.36, C.concrete, hx, 0.11, hz, { tex: 'concrete', bevel: 0.02 });
  k.block(2.1, 1.0, 1.3, C.brick, hx, 0.17, hz, { tex: 'brick' });
  for (let i = 0; i <= 6; i++) k.block(0.07, 1.0, 0.04, C.brickDark, hx - 1.05 + i * 0.35, 0.17, hz + 0.66, { tex: 'brick', bevel: 0.01 });
  k.windows(6, 1.75, 0.62, 'z', hz + 0.655, { frame: 0xd8d0c0, w: 0.17, h: 0.52, glow: 0.5 });
  k.box(2.14, 0.05, 1.34, 0xd8d0c0, hx, 1.12, hz, { flat: true });
  k.box(2.14, 0.04, 0.03, 0xd8d0c0, hx, 0.3, hz + 0.67, { flat: true });
  k.gable(2.1, 1.3, 0.42, C.roofSlate, hx, 1.17, hz, { over: 0.06 });
  k.block(1.5, 0.1, 0.22, C.metalDark, hx, 1.52, hz, { bevel: 0.02, tex: 'panels' });
  k.gable(1.5, 0.26, 0.07, C.roofSlate, hx, 1.62, hz, { over: 0.02 });
  sign(k, hx - 0.55, 1.0, hz + 0.672, 0.6, 0.12, t.main);
  k.windows(3, 0.7, 0.62, '-x', -(hx - 1.06), { frame: 0xd8d0c0, w: 0.17, h: 0.52, cx: hz });
  k.windows(1, 0, 0.9, 'x', hx + 1.06, { frame: 0xd8d0c0, w: 0.3, h: 0.3, cx: hz });
  // Boiler house: tall concrete block with strip windows and a parapet.
  const bx = 0.62;
  k.block(0.9, 1.75, 1.5, 0xc9c4ba, bx, 0.11, hz, { tex: 'concrete', bevel: 0.03 });
  k.box(0.94, 0.06, 1.54, 0xa9a49a, bx, 1.86, hz, { flat: true });
  for (const z of [-0.95, -0.45, 0.05]) k.box(0.02, 1.2, 0.1, C.glassDark, bx + 0.455, 1.05, z, { surface: 'glass', glow: 0.3 });
  for (const x of [0.38, 0.62, 0.86]) k.box(0.1, 1.2, 0.02, C.glassDark, x, 1.05, hz + 0.755, { surface: 'glass', glow: 0.3 });
  k.block(0.9, 0.06, 1.5, t.main, bx, 1.6, hz, { flat: true });
  hvac(k, bx - 0.15, 1.86, hz - 0.3, 0.3, 0.2);
  // Two stacks with red bands, a gallery each, flue ducts from the boiler house.
  for (const [x, z] of [[1.55, -1.0], [1.55, -0.15]] as const) {
    chimney(k, x, z, 3.3, 0.21, 0xd8d4ca, 0.11);
    for (const y of [2.75, 3.15]) k.cyl(0.19, 0.195, 0.14, 10, 0xc0402a, x, y, z, { flat: true });
    k.cyl(0.26, 0.26, 0.03, 10, C.metalDark, x, 2.5, z, { surface: 'metal' });
    ringRail(k, x, 2.515, z, 0.25, C.metalDark, 10, 0.06);
    k.cylX(0.09, 0.5, 8, 0x8a8f94, x - 0.3, 1.25, z, { surface: 'metal' });
    k.block(0.36, 0.3, 0.36, 0xb0aba0, x, 0.11, z, { tex: 'concrete', bevel: 0.02 });
    const f = k.part('flare', [x, 3.47, z]);
    light(f, 0, 0, 0, 0.06, RED_LIGHT);
  }
  // Coal yard and an inclined conveyor gallery up to the boiler house.
  k.box(1.1, 0.01, 0.62, 0x5a564e, 1.1, 0.115, 0.95, { tex: 'concrete', flat: true });
  for (const [x, z, r, h] of [[1.3, 0.95, 0.3, 0.2], [0.85, 1.05, 0.24, 0.15]] as const) {
    k.cone(r, h, 9, 0x403d3a, x, 0.12 + h / 2, z, { flat: true, tex: 'concrete' });
    k.cone(r * 0.5, h * 0.45, 7, 0x4a4743, x + 0.07, 0.12 + h * 0.62, z - 0.04, { flat: true, rot: [0, 0.4, 0], tex: 'concrete' });
  }
  for (const z of [0.72, 1.18]) k.block(1.1, 0.08, 0.04, 0x9d9a92, 1.1, 0.11, z, { tex: 'concrete', bevel: 0.01 });
  beam(k, [1.2, 0.5, 0.75], [0.85, 1.55, 0.25], 0.14, 0x9a9890, { tex: 'panels' });
  for (const f of [0.3, 0.65]) {
    const x = 1.2 - 0.35 * f;
    const y = 0.5 + 1.05 * f;
    const z = 0.75 - 0.5 * f;
    k.block(0.04, y - 0.11, 0.04, C.metalDark, x - 0.06, 0.11, z, { surface: 'metal' });
    k.block(0.04, y - 0.11, 0.04, C.metalDark, x + 0.06, 0.11, z, { surface: 'metal' });
  }
  truck(k, 0.12, 0.85, C.hazard, 0x6a6e72, true, 'tipper');
  // Switchyard: transformers, a gantry, a pylon carrying the line away, a fence.
  k.box(1.5, 0.02, 0.85, 0x8a8478, -1.2, 0.12, 0.95, { tex: 'concrete', flat: true });
  transformer(k, -1.6, 0.85);
  transformer(k, -1.1, 0.85);
  for (const x of [-1.85, -0.85]) k.block(0.04, 0.6, 0.04, 0x8c939a, x, 0.11, 0.55, { surface: 'metal' });
  k.box(1.04, 0.04, 0.04, 0x8c939a, -1.35, 0.71, 0.55, { surface: 'metal' });
  pylon(k, -0.6, 1.15, 1.35, Math.PI / 2);
  securityFence(k, -1.2, 1.42, 1.5, true);
  securityFence(k, -1.95, 0.98, 0.88, false);
  lamp(k, 0.05, 1.35, 0.6);
  return k.build();
}

/** Hydro-electric dam: a concrete dam holding a reservoir on +x, a spillway, powerhouse and switchyard. */
function hydroPlant(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 3, 3);
  const top = 1.05; // crest
  const wx = 0.45; // upstream face
  const toe = -0.15;
  const run = wx - 0.2 - toe; // downstream slope, horizontal
  const slope = Math.atan2(run, top - 0.11);
  // Reservoir against the dam, held on the water side by a rock-fill bank.
  const lvl = 0.95;
  k.block(0.8, lvl - 0.14, 2.96, 0x6f6c64, 0.84, 0.11, 0, { tex: 'concrete' });
  prism(k, [[1.2, 0], [1.2, lvl - 0.08], [1.28, lvl - 0.08], [1.49, 0]], 2.96, 0xa89e8a, 0, 0.11, 0, { tex: 'concrete' });
  k.box(0.1, 0.02, 2.96, C.lawnDark, 1.24, lvl + 0.035, 0, { tex: 'lawn', flat: true });
  for (let i = 0; i < 9; i++) {
    const z = -1.3 + i * 0.32 + ((i * 7) % 3) * 0.04;
    const f = 0.25 + ((i * 5) % 4) * 0.15;
    k.add(new THREE.DodecahedronGeometry(0.06 + (i % 3) * 0.015, 0), 0xb8afa0, 1.28 + f * 0.2, 0.11 + (1 - f) * (lvl - 0.1), z, { flat: true, rot: [i, i * 2, 0] });
  }
  water(k, 0.8, 2.94, 0.84, lvl, 0, 0x2a7fa2);
  for (let i = 0; i < 5; i++) k.box(0.3, 0.004, 0.012, 0x9fd4e6, 0.75 + (i % 2) * 0.15, lvl + 0.003, -1.1 + i * 0.5, { glow: 0.2, flat: true });
  // Intake towers standing in the reservoir with footbridges to the crest.
  for (const z of [-0.95, 0.95]) {
    k.block(0.2, top + 0.1 - 0.11, 0.24, 0xbab6ac, 0.72, 0.11, z, { tex: 'concrete', bevel: 0.02 });
    k.box(0.02, 0.22, 0.16, 0x2a2e33, 0.83, lvl - 0.02, z, { flat: true });
    k.block(0.24, 0.12, 0.28, t.main, 0.72, top + 0.1, z, { bevel: 0.025 });
    k.box(0.26, 0.02, 0.3, 0xd6d2c8, 0.72, top + 0.23, z, { flat: true });
    k.box(0.2, 0.025, 0.08, 0x8c939a, wx + 0.07, top - 0.01, z, { surface: 'metal' });
    light(k, 0.72, top + 0.26, z, 0.035);
  }
  // The dam: vertical upstream face, a sloping downstream face with lift lines, a crest road with parapets and lamps.
  prism(k, [[wx, 0], [wx, top - 0.11], [wx - 0.2, top - 0.11], [toe, 0]], 2.96, 0xc8c4ba, 0, 0.11, 0, { tex: 'concrete' });
  for (let i = 1; i < 6; i++) {
    const f = i / 6;
    const y = 0.11 + f * (top - 0.11);
    const x = toe + f * run - 0.006;
    k.box(0.012, 0.018, 2.96, 0xa29e94, x, y, 0, { flat: true, rot: [0, 0, slope] });
  }
  for (const x of [wx - 0.015, wx - 0.185]) k.box(0.03, 0.06, 2.96, 0xdcd8ce, x, top + 0.03, 0, { flat: true });
  k.box(0.14, 0.005, 2.9, 0x55595e, wx - 0.1, top + 0.003, 0, { flat: true });
  for (const z of [-1.3, -0.62, 0.62, 1.3]) lamp(k, wx - 0.19, z, top - 0.11 + 0.06);
  // Spillway: piers and team-coloured radial gates under a hoist bridge, a stepped chute of white water.
  const sw = 0.66;
  for (const z of [-sw / 2 - 0.03, -0.11, 0.11, sw / 2 + 0.03]) k.block(0.3, 0.24, 0.06, 0xdcd8ce, wx - 0.1, top, z, { bevel: 0.015 });
  for (const z of [-0.22, 0, 0.22]) k.box(0.05, 0.17, 0.16, t.main, wx - 0.03, top + 0.085, z, { surface: 'metal', bevel: 0.01 });
  k.block(0.32, 0.1, sw + 0.12, 0x8c939a, wx - 0.1, top + 0.24, 0, { bevel: 0.015, tex: 'panels' });
  for (const z of [-0.22, 0, 0.22]) k.block(0.1, 0.06, 0.1, C.hazard, wx - 0.1, top + 0.34, z, { bevel: 0.01 });
  for (const z of [-sw / 2 - 0.01, sw / 2 + 0.01]) beam(k, [wx - 0.22, top + 0.06, z], [toe + 0.02, 0.18, z], 0.05, 0xdcd8ce);
  const steps = 8;
  const dh = (top - 0.16) / steps;
  for (let i = 0; i < steps; i++) {
    const f = (i + 0.5) / steps;
    const y = top - 0.04 - f * (top - 0.16);
    const x = wx - 0.24 - f * (run - 0.06);
    k.box(run / steps + 0.03, 0.02, sw - 0.04, 0xf0f8fc, x, y, 0, { glow: 0.3, surface: 'gloss', flat: true });
    k.box(0.015, dh, sw - 0.04, 0xcfe8f2, x - run / steps / 2 - 0.01, y - dh / 2, 0, { glow: 0.22, flat: true });
  }
  // Stilling basin and the tailrace running off to -x, foam at its head, a footbridge.
  const tl = 1.33;
  const tc = toe - tl / 2;
  k.box(tl, 0.03, sw + 0.12, 0x8f8b82, tc, 0.115, 0, { tex: 'concrete', flat: true });
  for (const z of [-sw / 2 - 0.05, sw / 2 + 0.05]) k.block(tl, 0.08, 0.05, 0xb4b0a6, tc, 0.11, z, { tex: 'concrete', bevel: 0.01 });
  water(k, tl, sw, tc, 0.16, 0, 0x3a9ab8);
  for (let i = 0; i < 8; i++) k.box(0.1 + (i % 3) * 0.04, 0.015, 0.07 + (i % 2) * 0.04, 0xf2fbff, toe - 0.06 - i * 0.07, 0.165, -0.24 + ((i * 37) % 6) * 0.09, { glow: 0.35, flat: true });
  k.block(0.12, 0.03, sw + 0.24, 0x8c939a, -1.1, 0.2, 0, { surface: 'metal' });
  railing(k, -1.15, 0.23, 0, sw + 0.24, false, C.metalDark, 0.06);
  railing(k, -1.05, 0.23, 0, sw + 0.24, false, C.metalDark, 0.06);
  // Powerhouse at the toe (+z side): penstocks down the face, tall windows, generator exciters turning on the roof.
  const px = -0.64;
  const pz = 0.95;
  k.block(0.98, 0.06, 0.9, C.concrete, px, 0.11, pz, { tex: 'concrete', bevel: 0.015 });
  k.block(0.94, 0.62, 0.86, 0xd8d2c4, px, 0.17, pz, { tex: 'plaster', bevel: 0.025 });
  k.box(0.98, 0.05, 0.9, t.main, px, 0.78, pz, { flat: true });
  k.windows(4, 0.66, 0.46, 'z', pz + 0.44, { frame: 0x6a6e72, w: 0.11, h: 0.38, glow: 0.55 });
  k.windows(3, 0.5, 0.46, '-x', -(px - 0.48), { frame: 0x6a6e72, w: 0.11, h: 0.38, cx: pz });
  k.box(0.02, 0.3, 0.22, 0x3a3f44, px - 0.48, 0.32, pz + 0.25, { tex: 'panels' });
  sign(k, px + 0.2, 0.68, pz + 0.442, 0.4, 0.09, t.dark);
  for (const z of [0.72, 1.18]) {
    strut(k, [wx - 0.3, 0.85, z], [toe - 0.02, 0.32, z], 0.065, 0x5b6168, 8, { surface: 'metal' });
    for (const f of [0.3, 0.7]) {
      const x = wx - 0.3 + (toe - 0.02 - wx + 0.3) * f;
      const y = 0.85 + (0.32 - 0.85) * f;
      k.box(0.04, 0.06, 0.16, 0xb4b0a6, x, y - 0.05, z, { flat: true, rot: [0, 0, slope] });
    }
  }
  for (const x of [px - 0.22, px + 0.2]) {
    k.cyl(0.14, 0.15, 0.05, 10, 0x8c939a, x, 0.83, pz, { surface: 'metal' });
    const s = k.part('spin', [x, 0.87, pz]);
    s.cyl(0.1, 0.11, 0.04, 10, 0x5b6168, 0, 0, 0, { surface: 'metal' });
    for (let i = 0; i < 6; i++) s.box(0.22, 0.025, 0.025, 0xd0d4d8, 0, 0.03, 0, { rot: [0, (i / 6) * Math.PI, 0], surface: 'metal' });
    s.cyl(0.035, 0.035, 0.06, 6, t.main, 0, 0.05, 0);
  }
  // Switchyard, a pylon and the control house on the -z side; a crest crane over the north intake.
  k.box(1.1, 0.02, 0.62, 0x8a8478, -0.95, 0.12, -1.08, { tex: 'concrete', flat: true });
  transformer(k, -1.2, -1.1);
  transformer(k, -0.8, -1.1);
  pylon(k, -1.25, -0.6, 1.3, 0);
  securityFence(k, -0.95, -0.72, 1.1, true);
  k.block(0.36, 0.34, 0.4, 0xd8d2c4, -0.35, 0.11, -1.05, { tex: 'plaster', bevel: 0.02 });
  k.box(0.38, 0.04, 0.42, t.main, -0.35, 0.47, -1.05, { flat: true });
  k.windows(2, 0.16, 0.32, 'z', -0.84, { frame: 0x6a6e72, cx: -0.35 });
  for (const z of [-1.12, -0.78]) k.block(0.035, 0.34, 0.035, C.hazard, wx - 0.1, top, z, { surface: 'metal' });
  k.box(0.06, 0.06, 0.42, C.hazard, wx - 0.1, top + 0.37, -0.95, { bevel: 0.01 });
  k.box(0.1, 0.07, 0.1, C.metalDark, wx - 0.1, top + 0.31, -0.95);
  return k.build();
}
/** Nuclear power station: two hyperboloid cooling towers, a domed containment, turbine hall, vent stack. */
function nuclearPlant(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 4, 4);
  coolingTower(k, -1.05, -0.98, 0.76, 2.7);
  coolingTower(k, 0.85, -1.2, 0.68, 2.45);
  // Containment: drum, dome, buttresses, a team band, an equipment hatch.
  const cx = -1.0;
  const cz = 0.85;
  k.cyl(0.66, 0.7, 0.1, 18, C.concrete, cx, 0.16, cz, { tex: 'concrete' });
  k.cyl(0.56, 0.58, 0.95, 20, 0xd8d4ca, cx, 0.68, cz, { tex: 'concrete' });
  k.dome(0.56, 0xe2ded4, cx, 1.15, cz, 18, { tex: 'concrete' });
  k.cyl(0.565, 0.565, 0.08, 20, t.main, cx, 1.05, cz, { flat: true });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.block(0.08, 0.95, 0.08, 0xc4c0b6, cx + Math.cos(a) * 0.57, 0.2, cz + Math.sin(a) * 0.57, { tex: 'concrete', bevel: 0.015, rot: [0, -a, 0] });
  }
  k.block(0.26, 0.3, 0.14, 0xb0aca2, cx + 0.1, 0.2, cz + 0.6, { tex: 'concrete', bevel: 0.02 });
  k.box(0.16, 0.18, 0.02, 0x3a3f44, cx + 0.1, 0.32, cz + 0.675, { tex: 'panels' });
  light(k, cx + 0.1, 0.55, cz + 0.68, 0.035);
  // Auxiliary block between the containment and the turbine hall, with the vent stack.
  k.block(0.55, 0.62, 0.9, 0xbcb8ae, -0.15, 0.11, 0.85, { tex: 'concrete', bevel: 0.025 });
  k.windows(3, 0.5, 0.48, 'z', 1.31, { frame: 0x6a6e72, w: 0.1 });
  k.box(0.57, 0.04, 0.92, 0x8c8880, -0.15, 0.75, 0.85, { flat: true });
  hvac(k, -0.2, 0.73, 0.65, 0.22, 0.16);
  k.cyl(0.07, 0.1, 2.3, 8, 0xd8d4ca, 0.05, 0.11 + 1.15, 0.6, { tex: 'concrete' });
  for (const y of [2.05, 2.25]) k.cyl(0.072, 0.074, 0.1, 8, 0xc0402a, 0.05, y, 0.6, { flat: true });
  lattice(k, 0.05, 0.6, 0.34, 0.14, 1.6, 0x8c939a, { y0: 0.73, bays: 4, m: 0.014 });
  const f = k.part('flare', [0.05, 2.46, 0.6]);
  light(f, 0, 0, 0, 0.05, RED_LIGHT);
  // Turbine hall: long, panelled, a team stripe and a sign, roof vents.
  const tx = 1.05;
  const tz = 0.85;
  k.block(1.6, 0.9, 1.0, 0xc8ccd0, tx, 0.11, tz, { tex: 'panels', bevel: 0.03 });
  k.box(1.62, 0.1, 1.02, t.main, tx, 0.82, tz, { flat: true });
  ribbon(k, tx, 0.55, tz + 0.505, 1.4, 0.12, 'z', 0.35, C.glassDark, 8);
  ribbon(k, tx + 0.805, 0.55, tz, 0.8, 0.12, 'x', 0.35, C.glassDark, 5);
  for (const x of [tx - 0.5, tx, tx + 0.5]) k.block(0.24, 0.08, 0.6, 0x9aa0a6, x, 1.01, tz, { bevel: 0.02, tex: 'panels' });
  k.box(0.3, 0.32, 0.02, 0x3a3f44, tx + 0.45, 0.27, tz + 0.505, { tex: 'panels' });
  sign(k, tx - 0.4, 0.27, tz + 0.51, 0.5, 0.12, t.main);
  // Cooling-water pipes on trestles from the turbine hall to the towers.
  for (const z of [0.25, 0.4]) {
    k.cylX(0.05, 1.2, 8, 0x6f8fa0, 0.65, 0.42, z - 0.05, { surface: 'metal' });
  }
  for (const x of [0.2, 0.7, 1.1]) k.block(0.04, 0.3, 0.3, C.metalDark, x, 0.11, 0.3, { surface: 'metal' });
  // Switchyard on the east side.
  transformer(k, 1.6, -0.2);
  transformer(k, 1.6, 0.15);
  pylon(k, 1.85, -0.5, 1.2, Math.PI / 2);
  // Fence, a guard post and a car park at the front.
  securityFence(k, 0.2, 1.9, 3.5, true);
  securityFence(k, 1.92, 0.5, 2.8, false);
  k.block(0.22, 0.22, 0.2, C.white, -1.65, 0.11, 1.7, { tex: 'plaster', bevel: 0.02 });
  k.box(0.26, 0.03, 0.24, t.main, -1.65, 0.345, 1.7, { flat: true });
  k.windows(1, 0, 0.24, 'x', -1.53, { cx: 1.7 });
  k.box(0.02, 0.02, 0.4, 0xd0402a, -1.65, 0.24, 1.45, { flat: true });
  for (let i = 0; i < 4; i++) car(k, -0.95 + i * 0.28, 1.6, [0xc0392b, 0xecf0f1, 0x34495e, 0x2e86c1][i]!, false);
  return k.build();
}

/** Wind farm: three turbines on grazed grass, all facing the wind, gravel tracks to crane pads, a fenced substation. */
function windFarm(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 3, 3, C.lawn, 'lawn');
  const gravel = 0xb3a88f;
  // Mown stripes across the pasture.
  for (const z of [-0.95, -0.25, 0.45]) k.box(2.8, 0.004, 0.32, C.lawnDark, 0, 0.111, z, { tex: 'lawn', flat: true });
  // Tracks from the gate on the front edge to each turbine's crane pad and the substation.
  trackPath(k, [[0.12, 1.44], [0.12, 0.25], [0.02, -0.15], [-0.32, -0.55], [-0.56, -0.74]], 0.12, gravel);
  trackPath(k, [[0.12, 0.62], [-0.12, 0.78]], 0.12, gravel);
  trackPath(k, [[0.06, -0.08], [0.44, -0.42]], 0.12, gravel);
  trackPath(k, [[0.12, 0.98], [0.5, 0.98]], 0.12, gravel);
  for (const [x, z, a] of [[-0.58, -0.8, 0.6], [0.48, -0.46, -0.7], [-0.14, 0.82, 0.3]] as const) {
    k.box(0.34, 0.012, 0.24, gravel, x, 0.114, z, { rot: [0, a, 0], flat: true, tex: 'concrete' });
  }
  // The turbines (one model, all yawed to the same wind).
  const yaw = 0.55;
  const rotors = ([[-0.82, -0.98], [0.68, -0.64], [-0.38, 0.72]] as const).map(([x, z]) => windTurbine(k, x, z, 2.3, 0.82, yaw, t.main));
  // Substation: a gravel yard behind a fence, a transformer, a busbar gantry, a control house and a pylon taking the line away.
  const sx = 0.93;
  const sz = 0.93;
  k.box(0.88, 0.014, 0.84, 0x8a8478, sx, 0.114, sz, { tex: 'concrete', flat: true });
  transformer(k, sx + 0.18, sz - 0.2, 0x6f7b72, 0.12);
  for (const x of [sx - 0.05, sx + 0.38]) k.block(0.03, 0.46, 0.03, 0x8c939a, x, 0.12, sz - 0.2, { surface: 'metal' });
  k.box(0.46, 0.03, 0.03, 0x8c939a, sx + 0.165, 0.57, sz - 0.2, { surface: 'metal' });
  for (const x of [sx + 0.05, sx + 0.17, sx + 0.29]) k.cyl(0.01, 0.01, 0.07, 5, 0x6a8a6a, x, 0.52, sz - 0.2, { surface: 'glass' });
  const hx = sx - 0.2;
  const hz = sz + 0.2;
  k.block(0.36, 0.28, 0.28, 0xd8d2c4, hx, 0.12, hz, { tex: 'plaster', bevel: 0.02 });
  k.box(0.4, 0.04, 0.32, t.main, hx, 0.42, hz, { flat: true });
  k.box(0.07, 0.15, 0.01, 0x4a5056, hx + 0.09, 0.2, hz + 0.145, { tex: 'panels' });
  k.windows(1, 0, 0.27, 'z', hz + 0.141, { frame: 0x6a6e72, cx: hx - 0.08, w: 0.12, h: 0.09 });
  k.windows(1, 0, 0.27, 'x', hx + 0.181, { frame: 0x6a6e72, cx: hz, w: 0.12, h: 0.09 });
  light(k, hx + 0.09, 0.31, hz + 0.16, 0.025);
  gantry(k, sx + 0.22, sz + 0.2, 0.3, 0.62, false, 0.12);
  securityFence(k, sx, sz - 0.43, 0.88, true, 0.2, 0.11, 0.45);
  securityFence(k, sx, sz + 0.43, 0.88, true, 0.2, 0.11, 0.45);
  securityFence(k, sx + 0.44, sz, 0.86, false, 0.2, 0.11, 0.45);
  securityFence(k, sx - 0.44, sz - 0.27, 0.32, false, 0.2, 0.11, 0.45);
  securityFence(k, sx - 0.44, sz + 0.3, 0.26, false, 0.2, 0.11, 0.45);
  // Grazing: a hedge along the west side, a few trees by the gate, sheep.
  hedge(k, -1.36, -0.05, 2.5, false);
  hedge(k, -0.62, -1.36, 1.4, true);
  tree(k, -1.1, 1.12, 0.95, 1);
  tree(k, -0.8, 1.2, 0.8, 2);
  pine(k, -1.25, 0.88, 0.85);
  for (const [x, z, a] of [[-0.95, 0.12, 0.4], [-0.78, 0.26, 2.2], [-1.05, -0.3, 1.1], [0.95, 0.12, 3.0], [1.12, -1.18, 0.8], [-0.2, -1.12, 2.6]] as const) sheep(k, x, z, a);
  const g = k.build();
  rotors.forEach((at, i) => aimRotor(g, at, yaw, i * 0.75));
  return g;
}

/** An inverter cabin: a prefab box along z with louvres on its +x side, a door, a team stripe and a lit status panel. */
function inverterCabin(k: Kit, x: number, z: number, t: { main: number; light: number }, y0 = 0.11): void {
  k.block(0.24, 0.03, 0.44, 0x9aa0a6, x, y0, z, { tex: 'concrete', bevel: 0.008 });
  k.block(0.2, 0.22, 0.4, 0xdfe3e6, x, y0 + 0.03, z, { tex: 'panels', bevel: 0.015 });
  k.box(0.22, 0.025, 0.42, HT.trim, x, y0 + 0.265, z, { flat: true, surface: 'metal' });
  k.box(0.202, 0.025, 0.402, t.main, x, y0 + 0.21, z, { flat: true });
  for (const dz of [-0.11, 0.06]) {
    k.box(0.006, 0.1, 0.11, 0x3a4048, x + 0.102, y0 + 0.12, z + dz, { flat: true });
    for (let i = 0; i < 3; i++) k.box(0.01, 0.008, 0.11, 0xb8c0c8, x + 0.105, y0 + 0.09 + i * 0.03, z + dz, { flat: true });
  }
  k.box(0.1, 0.17, 0.006, 0x8a939b, x - 0.03, y0 + 0.115, z + 0.202, { flat: true, surface: 'metal' });
  k.box(0.035, 0.03, 0.006, HT.cyan, x + 0.06, y0 + 0.16, z + 0.203, { glow: 0.9, flat: true });
  k.block(0.12, 0.04, 0.16, 0xc8ced3, x, y0 + 0.28, z - 0.08, { tex: 'panels' });
  k.box(0.08, 0.004, 0.12, 0x3a3f44, x, y0 + 0.322, z - 0.08, { flat: true });
}

/** Solar farm: two blocks of racked photovoltaic rows tilted to the sun, inverter cabins in the aisle, a substation, a weather mast, a fence. */
function solarFarm(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 4, 3, C.lawnDark, 'lawn');
  const gravel = 0xb3a88f;
  // Service track along the front, the aisle between the blocks, and the substation strip.
  trackPath(k, [[-1.86, 1.12], [1.86, 1.12]], 0.16, gravel);
  k.box(0.42, 0.012, 2.3, gravel, -0.22, 0.113, -0.1, { tex: 'concrete', flat: true });
  k.box(0.5, 0.014, 2.34, 0x8a8478, 1.6, 0.114, -0.12, { tex: 'concrete', flat: true });
  // Panel rows: five rows in each block.
  for (let r = 0; r < 5; r++) {
    const z = -1.1 + r * 0.44;
    solarTable(k, -1.84, -0.48, z, 0.36, 0.5);
    solarTable(k, 0.04, 1.3, z, 0.36, 0.5);
  }
  // Inverter cabins in the aisle.
  inverterCabin(k, -0.22, -0.76, t);
  inverterCabin(k, -0.22, 0.28, t);
  // Substation: transformer, switchgear, the control building with a sign, a pylon line out.
  transformer(k, 1.6, 0.35, 0x6f7b72, 0.12);
  k.block(0.3, 0.26, 0.16, 0xc8ced3, 1.6, 0.12, -0.05, { tex: 'panels', bevel: 0.012 });
  for (let i = 0; i < 3; i++) k.box(0.07, 0.2, 0.006, 0x9aa3ab, 1.5 + i * 0.1, 0.25, 0.033, { flat: true });
  for (let i = 0; i < 3; i++) k.box(0.02, 0.015, 0.006, i === 2 ? HT.amber : 0x6dff9a, 1.5 + i * 0.1, 0.33, 0.037, { glow: 1, flat: true });
  techBlock(k, 0.42, 0.34, 0.52, 1.6, -0.62, t, 0.12, 1);
  sign(k, 1.6, 0.36, -0.355, 0.26, 0.07, t.main);
  gantry(k, 1.62, 0.8, 0.34, 0.6, true, 0.12);
  // Weather station: a mast with a pyranometer arm and a cup anemometer that turns.
  const wx = 1.62;
  const wz = -1.18;
  k.cyl(0.012, 0.016, 0.62, 5, 0xc8ccd0, wx, 0.12 + 0.31, wz, { surface: 'metal' });
  k.box(0.18, 0.012, 0.012, 0xc8ccd0, wx, 0.6, wz, { flat: true });
  k.box(0.06, 0.012, 0.05, 0x1d3360, wx + 0.08, 0.61, wz, { rot: [0.5, 0, 0], surface: 'glass' });
  k.box(0.03, 0.03, 0.03, 0xf4f4f0, wx - 0.08, 0.625, wz, { bevel: 0.008 });
  const s = k.part('spin', [wx, 0.75, wz]);
  s.cyl(0.006, 0.006, 0.03, 5, 0xc8ccd0, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    s.box(0.06, 0.005, 0.005, 0xc8ccd0, Math.cos(a) * 0.03, 0.01, Math.sin(a) * 0.03, { rot: [0, -a, 0], flat: true });
    s.box(0.022, 0.022, 0.022, 0xf4f4f0, Math.cos(a) * 0.06, 0.01, Math.sin(a) * 0.06, { rot: [0, -a, 0], flat: true });
  }
  // A CCTV pole, a perimeter fence with a gate on the track, a van.
  k.cyl(0.01, 0.014, 0.5, 5, 0x8c939a, -1.88, 0.12 + 0.25, 1.38, { surface: 'metal' });
  k.box(0.05, 0.03, 0.03, 0xe8ecef, -1.86, 0.6, 1.38, { bevel: 0.006 });
  light(k, -1.88, 0.63, 1.38, 0.012, RED_LIGHT);
  securityFence(k, 0, -1.42, 3.8, true, 0.2, 0.11, 0.55);
  securityFence(k, -1.92, 0, 2.84, false, 0.2, 0.11, 0.55);
  securityFence(k, 1.92, 0, 2.84, false, 0.2, 0.11, 0.55);
  securityFence(k, -1.05, 1.42, 1.74, true, 0.2, 0.11, 0.55);
  securityFence(k, 1.05, 1.42, 1.74, true, 0.2, 0.11, 0.55);
  for (const x of [-0.18, 0.18]) k.block(0.04, 0.3, 0.04, 0x8c939a, x, 0.11, 1.42, { surface: 'metal', bevel: 0.008 });
  car(k, 0.75, 1.14, 0xe8ecef, true);
  return k.build();
}

/** Grid battery: two rows of white battery enclosures with glowing status lights, power conversion, a transformer and a fence. */
function batteryStorage(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  techLot(k, 3, 2, t.light);
  k.box(2.36, 0.012, 1.12, 0x8f8a80, -0.28, 0.113, -0.2, { tex: 'concrete', flat: true });
  // Two rows of four enclosures facing the front, a cable trench between them.
  const lights: Vec3[] = [];
  for (const z of [-0.5, 0.12]) {
    for (let i = 0; i < 4; i++) lights.push(batteryModule(k, -1.12 + i * 0.55, z, 0.5, t.light, 0.11, i === 0 ? [-1] : i === 3 ? [1] : []));
  }
  k.box(2.1, 0.012, 0.1, 0x6a7178, -0.3, 0.113, -0.22, { tex: 'concrete', flat: true });
  for (let i = 0; i < 4; i++) k.box(0.004, 0.014, 0.1, 0x4a5056, -1.2 + i * 0.55, 0.114, -0.22, { flat: true });
  lights.forEach((at) => {
    const f = k.part('flare', at);
    for (const dy of [-0.02, 0.02]) f.box(0.03, 0.022, 0.006, dy < 0 ? 0x5dff8a : 0x9dffc0, 0, dy, 0, { glow: 1, flat: true });
  });
  // Power conversion skid and transformer on the east side, a pylon carrying the line.
  const px = 1.12;
  k.block(0.42, 0.04, 0.36, 0x9aa0a6, px, 0.11, 0.18, { tex: 'concrete', bevel: 0.01 });
  k.block(0.36, 0.26, 0.28, 0xd6dce1, px, 0.15, 0.18, { tex: 'panels', bevel: 0.018 });
  for (let i = 0; i < 3; i++) k.box(0.09, 0.18, 0.006, 0xa4adb6, px - 0.11 + i * 0.11, 0.27, 0.323, { flat: true });
  for (let i = 0; i < 3; i++) k.box(0.022, 0.016, 0.006, i === 1 ? HT.amber : 0x6dff9a, px - 0.11 + i * 0.11, 0.35, 0.327, { glow: 1, flat: true });
  k.box(0.38, 0.02, 0.3, t.main, px, 0.42, 0.18, { flat: true });
  hvac(k, px, 0.43, 0.18, 0.2, 0.14, 0xc8ced3);
  transformer(k, px, -0.5, 0x6f7b72, 0.11);
  gantry(k, 1.2, -0.12, 0.36, 0.62, true);
  // Fire-water tank and the control room by the gate (a dish on its roof); the fence with a gate on the front.
  k.cyl(0.11, 0.11, 0.3, 12, 0xc0402a, -1.3, 0.11 + 0.15 + 0.02, 0.62, { surface: 'gloss', bevel: 0.015 });
  k.cyl(0.13, 0.13, 0.02, 12, 0x9aa0a6, -1.3, 0.12, 0.62, { flat: true });
  techBlock(k, 0.5, 0.24, 0.3, -0.78, 0.6, t, 0.11, 1);
  k.cyl(0.008, 0.008, 0.08, 4, HT.trim, -0.62, 0.45, 0.55);
  k.add(new THREE.SphereGeometry(0.06, 8, 3, 0, Math.PI * 2, 0, 1.0), HT.panel, -0.62, 0.53, 0.55, { rot: [2.4, 0.6, 0], flat: true, surface: 'gloss' });
  securityFence(k, 0, -0.94, 2.9, true, 0.2, 0.11, 0.45);
  securityFence(k, -1.44, 0, 1.86, false, 0.2, 0.11, 0.45);
  securityFence(k, 1.44, 0, 1.86, false, 0.2, 0.11, 0.45);
  securityFence(k, -0.95, 0.94, 0.98, true, 0.2, 0.11, 0.45);
  securityFence(k, 0.85, 0.94, 1.18, true, 0.2, 0.11, 0.45);
  car(k, 0.0, 0.62, 0xe8ecef, true);
  for (const x of [-0.24, 0.24]) k.box(0.012, 0.004, 0.24, C.hazard, x, 0.113, 0.62, { flat: true });
  floodMast(k, 1.32, 0.8, 0.7, 0.11, Math.PI / 4);
  return k.build();
}

/** Victorian pumping station on the water (+x): brick engine house, standpipe tower, intake and mains. */
function pumpingStation(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  // Ground on the land side; a walled intake basin at the water's edge.
  k.box(1.5, 0.08, 1.96, tint(C.paving, 0.92), -0.23, 0.04, 0, { tex: 'concrete', flat: true });
  k.box(1.44, 0.03, 1.9, C.paving, -0.23, 0.095, 0, { tex: 'concrete', flat: true });
  for (const z of [-0.9, 0.9]) k.block(0.46, 0.14, 0.12, 0xa9a59c, 0.74, 0, z, { tex: 'concrete', bevel: 0.02 });
  k.block(0.08, 0.14, 1.68, 0xa9a59c, 0.54, 0, 0, { tex: 'concrete', bevel: 0.02 });
  water(k, 0.42, 1.68, 0.76, 0.06, 0, 0x2f87a8);
  for (let i = 0; i < 7; i++) k.box(0.012, 0.16, 0.012, C.metalDark, 0.62, 0.1, -0.3 + i * 0.1, { flat: true });
  k.box(0.014, 0.014, 0.7, C.metalDark, 0.62, 0.18, 0, { flat: true });
  // Engine house: brick, stone plinth and string course, tall arched windows, slate hip roof, a vent lantern.
  const hx = -0.35;
  const hz = -0.2;
  k.block(1.16, 0.06, 0.96, 0xb9b2a2, hx, 0.11, hz, { tex: 'concrete', bevel: 0.02 });
  k.block(1.1, 0.72, 0.9, C.brick, hx, 0.17, hz, { tex: 'brick' });
  k.box(1.13, 0.035, 0.93, 0xd8cdb4, hx, 0.62, hz, { flat: true });
  k.box(1.14, 0.05, 0.94, 0xd8cdb4, hx, 0.88, hz, { flat: true });
  for (const x of [-0.7, -0.35, 0]) {
    k.box(0.15, 0.36, 0.02, 0xffd890, x, 0.4, hz + 0.455, { glow: 0.55, surface: 'glass' });
    k.add(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 8, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), 0xffd890, x, 0.58, hz + 0.455, { glow: 0.55, surface: 'glass' });
    k.box(0.2, 0.025, 0.04, 0xd8cdb4, x, 0.215, hz + 0.465, { flat: true });
  }
  for (const z of [-0.45, 0.05]) {
    k.box(0.02, 0.36, 0.15, 0xffd890, hx + 0.555, 0.4, z, { glow: 0.55, surface: 'glass' });
  }
  k.hip(1.1, 0.9, 0.36, C.roofSlate, hx, 0.9, hz, { over: 0.07 });
  k.block(0.2, 0.12, 0.2, 0xd8cdb4, hx, 1.18, hz, { flat: true });
  k.hip(0.24, 0.24, 0.12, C.roofSlate, hx, 1.3, hz, { over: 0.02 });
  // Door with a team-colour surround and a sign.
  k.box(0.18, 0.3, 0.02, t.dark, hx + 0.35, 0.32, hz + 0.455, { tex: 'planks' });
  k.box(0.24, 0.05, 0.03, t.main, hx + 0.35, 0.5, hz + 0.46, { flat: true });
  // Standpipe tower: square brick shaft with a pyramid cap.
  const sx = -0.78;
  const sz = -0.72;
  k.block(0.26, 1.65, 0.26, C.brickDark, sx, 0.11, sz, { tex: 'brick', bevel: 0.015 });
  k.box(0.3, 0.06, 0.3, 0xd8cdb4, sx, 1.4, sz, { flat: true });
  k.box(0.02, 0.18, 0.08, 0xffd890, sx + 0.131, 1.55, sz, { glow: 0.5 });
  k.box(0.08, 0.18, 0.02, 0xffd890, sx, 1.55, sz + 0.131, { glow: 0.5 });
  k.add(new THREE.ConeGeometry(0.22, 0.3, 4).rotateY(Math.PI / 4), C.roofSlate, sx, 1.91, sz, { tex: 'tiles' });
  k.cyl(0.006, 0.006, 0.18, 3, C.metalDark, sx, 2.12, sz);
  // Rising mains: big blue pipes with flanges and valve wheels from the intake into the house.
  for (const z of [0.42, 0.6]) {
    k.cylX(0.07, 0.95, 10, 0x3f6f9a, 0.12, 0.2, z, { surface: 'metal' });
    for (const x of [-0.25, 0.1, 0.45]) k.cylX(0.085, 0.03, 10, 0x2e5577, x, 0.2, z);
  }
  for (const x of [0.25]) for (const z of [0.42, 0.6]) {
    k.cyl(0.015, 0.015, 0.14, 5, C.metalDark, x, 0.33, z);
    ring(k, x, 0.4, z, 0.05, 0.008, 0xc0402a, 10);
  }
  k.cyl(0.08, 0.08, 0.3, 10, 0x3f6f9a, -0.35, 0.11 + 0.15, 0.6, { surface: 'metal' });
  // Garden touches: lamp, a bench, a hedge.
  lamp(k, 0.4, 0.85, 0.5);
  hedge(k, -0.55, 0.88, 0.7, true);
  return k.build();
}

/** Well: a stone wellhead with a winch roof, a wind pump (its rotor turns), a pump hut, trough and tank. */
function waterWell(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 2, 2, C.lawn, 'lawn');
  // Gravel yard and path.
  k.box(1.1, 0.02, 0.9, 0xb5a98e, 0.1, 0.12, 0.3, { tex: 'concrete', flat: true });
  // Wellhead: stone ring, dark water, posts, a little tiled roof, the winch and a bucket.
  const wx = 0.38;
  const wz = 0.45;
  k.cyl(0.21, 0.23, 0.22, 12, 0x9a948a, wx, 0.22, wz, { tex: 'brick', bevel: 0.02 });
  k.cyl(0.16, 0.16, 0.01, 12, 0x1e3a48, wx, 0.325, wz, { surface: 'gloss' });
  for (const s of [-1, 1]) k.block(0.04, 0.42, 0.04, C.timber, wx + s * 0.2, 0.22, wz, { tex: 'planks' });
  k.gable(0.36, 0.48, 0.16, C.roofRed, wx, 0.64, wz, { over: 0.03, rot: [0, Math.PI / 2, 0] });
  k.cylX(0.03, 0.4, 6, C.timberDark, wx, 0.54, wz, { tex: 'planks' });
  k.box(0.012, 0.012, 0.08, C.metalDark, wx + 0.22, 0.54, wz + 0.04, { flat: true });
  k.cyl(0.004, 0.004, 0.16, 3, 0x6a5a40, wx, 0.45, wz);
  k.cyl(0.035, 0.03, 0.05, 7, 0x6a5a40, wx, 0.36, wz, { tex: 'planks' });
  // Water trough.
  k.block(0.5, 0.1, 0.14, 0x8f8a80, wx - 0.1, 0.11, 0.82, { tex: 'concrete', bevel: 0.015 });
  k.box(0.44, 0.01, 0.1, C.water, wx - 0.1, 0.205, 0.82, { surface: 'gloss' });
  // Wind pump: a tapered steel lattice, a platform, the rotor (turns about z) and a tail vane.
  const px = -0.5;
  const pz = 0.4;
  const ph = 1.55;
  k.block(0.36, 0.04, 0.36, C.concrete, px, 0.11, pz, { tex: 'concrete' });
  lattice(k, px, pz, 0.32, 0.08, ph, 0x8c939a, { y0: 0.15, bays: 5, m: 0.014 });
  k.box(0.2, 0.02, 0.2, C.timber, px, 0.15 + ph * 0.92, pz, { tex: 'planks' });
  k.cyl(0.012, 0.012, ph - 0.1, 4, C.metalDark, px, 0.15 + ph / 2, pz);
  k.box(0.06, 0.06, 0.18, 0x5b6168, px, 0.15 + ph + 0.03, pz, { bevel: 0.015, surface: 'metal' });
  k.box(0.008, 0.12, 0.28, t.main, px, 0.15 + ph + 0.06, pz - 0.28, { flat: true });
  k.box(0.012, 0.012, 0.24, C.metalDark, px, 0.15 + ph + 0.03, pz - 0.15, { flat: true });
  const rotor = k.part('crank', [px, 0.15 + ph + 0.03, pz + 0.11]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rotor.box(0.05, 0.2, 0.006, i % 3 ? 0xe8e4dc : t.main, Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0, { rot: [0.25, 0, a - Math.PI / 2], flat: true });
  }
  rotor.add(new THREE.TorusGeometry(0.26, 0.006, 3, 16), C.metalDark, 0, 0, 0, { flat: true });
  rotor.add(new THREE.TorusGeometry(0.08, 0.006, 3, 10), C.metalDark, 0, 0, 0, { flat: true });
  rotor.cyl(0.03, 0.03, 0.04, 8, 0x3a3f44, 0, 0, 0, { rot: [Math.PI / 2, 0, 0] });
  // Pump hut and a timber water tank on a stand.
  k.block(0.62, 0.42, 0.5, C.plaster, -0.28, 0.11, -0.55, { tex: 'plaster', bevel: 0.015 });
  k.gable(0.62, 0.5, 0.24, C.roofRed, -0.28, 0.53, -0.55, { over: 0.05 });
  k.box(0.14, 0.26, 0.02, t.dark, -0.12, 0.24, -0.29, { tex: 'planks' });
  k.windows(1, 0, 0.36, 'z', -0.29, { frame: C.trim, cx: -0.42, w: 0.12, h: 0.12 });
  for (const [x, z] of [[0.35, -0.75], [0.7, -0.75], [0.35, -0.4], [0.7, -0.4]] as const) k.block(0.04, 0.45, 0.04, C.timberDark, x, 0.11, z, { tex: 'planks' });
  k.block(0.42, 0.03, 0.42, C.timber, 0.525, 0.56, -0.575, { tex: 'planks' });
  k.cyl(0.2, 0.2, 0.32, 12, 0x8a6a44, 0.525, 0.75, -0.575, { tex: 'planks' });
  for (const y of [0.66, 0.84]) k.cyl(0.205, 0.205, 0.02, 12, C.metalDark, 0.525, y, -0.575, { flat: true });
  k.cone(0.22, 0.08, 12, 0x6a5038, 0.525, 0.95, -0.575, { tex: 'planks' });
  k.cylX(0.025, 0.55, 6, 0x4a7ab0, 0.0, 0.2, -0.2, { surface: 'metal' });
  strut(k, [px, 0.2, pz], [-0.28, 0.2, -0.3], 0.02, 0x4a7ab0, 5);
  // Trees and a fence line.
  tree(k, 0.75, 0.15, 0.85, 3);
  pine(k, -0.74, -0.78, 0.9);
  pine(k, 0.82, 0.8, 0.75);
  return k.build();
}

/** Steel water tower: braced legs, a riser, a tank with a team band, a catwalk, a beacon. */
function waterTower(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 2, 2);
  k.box(1.5, 0.02, 1.5, 0x8a8478, 0, 0.12, 0, { tex: 'concrete', flat: true });
  const legs = 6;
  const r0 = 0.62;
  const r1 = 0.46;
  const y1 = 1.95;
  const at = (i: number, f: number): [number, number, number] => {
    const a = (i / legs) * Math.PI * 2 + Math.PI / 6;
    const r = r0 + (r1 - r0) * f;
    return [Math.cos(a) * r, 0.13 + f * (y1 - 0.13), Math.sin(a) * r];
  };
  for (let i = 0; i < legs; i++) {
    const [x, , z] = at(i, 0);
    k.block(0.12, 0.08, 0.12, C.concrete, x, 0.11, z, { tex: 'concrete', bevel: 0.02 });
    strut(k, at(i, 0), at(i, 1), 0.035, 0x7f8f9a, 6, { surface: 'metal' });
    for (let tier = 0; tier < 3; tier++) {
      const f0 = tier / 3 + 0.03;
      const f1 = (tier + 1) / 3;
      strut(k, at(i, f0), at(i + 1, f1), 0.009, 0x6a7680, 4);
      strut(k, at(i + 1, f0), at(i, f1), 0.009, 0x6a7680, 4);
      strut(k, at(i, f1), at(i + 1, f1), 0.014, 0x7f8f9a, 4);
    }
  }
  k.cyl(0.07, 0.07, y1 - 0.11, 8, 0x8c9aa4, 0, 0.11 + (y1 - 0.11) / 2, 0, { surface: 'metal' });
  // The tank: cone bottom, drum, dome roof with a finial; a team band and a white stripe.
  const tr = 0.7;
  k.add(new THREE.CylinderGeometry(tr, 0.12, 0.38, 18), 0xb9cdd8, 0, y1 + 0.02, 0, { flat: true, surface: 'metal' });
  k.cyl(tr, tr, 0.62, 18, 0xc4d6e0, 0, y1 + 0.21 + 0.31, 0, { surface: 'metal', tex: 'panels' });
  k.cyl(tr + 0.006, tr + 0.006, 0.2, 18, t.main, 0, y1 + 0.52, 0, { flat: true });
  k.cyl(tr + 0.008, tr + 0.008, 0.03, 18, 0xf0f0ea, 0, y1 + 0.4, 0, { flat: true });
  k.add(new THREE.SphereGeometry(tr, 18, 4, 0, Math.PI * 2, 0, 0.62), 0xd0dee6, 0, y1 + 0.83 - tr * Math.cos(0.62), 0, { flat: true, surface: 'metal' });
  k.cyl(0.08, 0.1, 0.08, 8, 0x8c9aa4, 0, y1 + 0.83 + 0.06, 0, { surface: 'metal' });
  // Catwalk round the tank's waist, ladders up a leg and up the tank.
  k.add(new THREE.CylinderGeometry(tr + 0.12, tr + 0.12, 0.025, 18, 1, false), 0x5b6168, 0, y1 + 0.22, 0, { flat: true, surface: 'metal' });
  ringRail(k, 0, y1 + 0.23, 0, tr + 0.11, 0x5b6168, 18, 0.08);
  const [lx, , lz] = at(0, 0);
  strut(k, [lx + 0.05, 0.13, lz + 0.05], [Math.cos(Math.PI / 6) * (r1 + 0.05), y1 + 0.22, Math.sin(Math.PI / 6) * (r1 + 0.05)], 0.006, C.metalDark, 3);
  ladder(k, 0.0, y1 + 0.24, y1 + 0.82, tr + 0.012);
  // Beacon (pulses) on the finial and a small pump house with a fence.
  const f = k.part('flare', [0, y1 + 0.97, 0]);
  light(f, 0, 0, 0, 0.05, RED_LIGHT);
  k.block(0.36, 0.3, 0.3, C.brick, 0.62, 0.11, 0.62, { tex: 'brick', bevel: 0.015 });
  k.box(0.4, 0.04, 0.34, t.main, 0.62, 0.43, 0.62, { flat: true });
  k.box(0.12, 0.2, 0.02, C.door, 0.62, 0.21, 0.775, { tex: 'planks' });
  securityFence(k, 0, 0.92, 1.84, true, 0.16);
  securityFence(k, 0.92, 0, 1.84, false, 0.16);
  securityFence(k, 0, -0.92, 1.84, true, 0.16);
  securityFence(k, -0.92, 0, 1.84, false, 0.16);
  return k.build();
}

// ---------------------------------------------------------------------------
// Logistics

/** Distribution warehouse: a barrel-roofed shed, loading docks with lorries, an office wing. */
function warehouse(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 4, 3);
  // Lorry yard with painted bays.
  k.box(3.3, 0.01, 0.95, C.asphalt, -0.3, 0.115, 0.95, { tex: 'concrete', flat: true });
  for (let i = 0; i < 5; i++) k.box(0.02, 0.005, 0.5, 0xe8e4d8, -1.6 + i * 0.62, 0.122, 1.15, { flat: true });
  // The shed: panelled walls on a plinth, an arched team-coloured roof with ribs and skylights, gable ends.
  const sx = -0.3;
  const sz = -0.55;
  const L = 3.2;
  const D = 1.6;
  const wh = 0.78;
  k.block(L + 0.04, 0.1, D + 0.04, 0x9d9a92, sx, 0.11, sz, { tex: 'concrete', bevel: 0.015 });
  k.block(L, wh, D, 0xcfc8b8, sx, 0.21, sz, { tex: 'panels' });
  const ry = 0.21 + wh;
  const g = new THREE.CylinderGeometry(1, 1, L + 0.08, 12, 1, true, -Math.PI / 2, Math.PI);
  g.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.42, D / 2 + 0.05);
  k.add(g, t.main, sx, ry, sz, { tex: 'panels', flat: true });
  for (const x of [sx - L / 2 - 0.005, sx + L / 2 + 0.005]) {
    const e = new THREE.CylinderGeometry(1, 1, 0.02, 12, 1, false, -Math.PI / 2, Math.PI);
    e.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.42, D / 2);
    k.add(e, 0xbfb8a8, x, ry, sz, { tex: 'panels', flat: true });
  }
  for (let i = 0; i < 6; i++) {
    const x = sx - L / 2 + 0.1 + (i * (L - 0.2)) / 5;
    const r = new THREE.CylinderGeometry(1, 1, 0.04, 12, 1, true, -Math.PI / 2, Math.PI);
    r.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.44, D / 2 + 0.07);
    k.add(r, t.dark, x, ry, sz, { flat: true });
  }
  for (let i = 0; i < 5; i++) {
    const x = sx - L / 2 + 0.42 + (i * (L - 0.84)) / 4;
    k.box(0.22, 0.02, 1.0, 0xcfe6f2, x, ry + 0.43, sz, { surface: 'glass', glow: 0.25 });
  }
  k.box(L + 0.02, 0.05, D + 0.02, 0x8c8578, sx, ry - 0.02, sz, { flat: true });
  // Loading docks along the front: dock plinth, roll-up doors with bumpers and lamps, a canopy.
  const fz = sz + D / 2;
  k.block(2.5, 0.12, 0.2, 0x9d9a92, sx - 0.25, 0.11, fz + 0.1, { tex: 'concrete', bevel: 0.01 });
  for (let i = 0; i < 4; i++) {
    const x = sx - 1.2 + i * 0.62;
    k.box(0.38, 0.42, 0.02, 0x5b6168, x, 0.44, fz + 0.012, { tex: 'panels', surface: 'metal' });
    for (let j = 0; j < 4; j++) k.box(0.38, 0.008, 0.025, 0x454a50, x, 0.28 + j * 0.1, fz + 0.015, { flat: true });
    k.box(0.44, 0.03, 0.03, C.hazard, x, 0.67, fz + 0.015, { flat: true });
    for (const s of [-1, 1]) k.box(0.04, 0.06, 0.03, 0x1e2022, x + s * 0.17, 0.2, fz + 0.21, { flat: true });
    light(k, x, 0.72, fz + 0.03, 0.04, 0xfff0c0);
  }
  k.box(2.5, 0.03, 0.34, 0xd0d4d8, sx - 0.25, 0.8, fz + 0.16, { surface: 'metal', bevel: 0.01 });
  k.box(2.5, 0.05, 0.02, t.main, sx - 0.25, 0.8, fz + 0.33, { flat: true });
  sign(k, sx + 1.05, 0.62, fz + 0.012, 0.5, 0.14, t.main);
  // Lorries backed up to two of the docks, one waiting in the yard.
  truck(k, sx - 1.2, fz + 0.5, 0xd9d4c8, 0xe8e4dc, false, 'box');
  truck(k, sx + 0.04, fz + 0.5, t.main, 0xe8e4dc, false, 'box');
  truck(k, sx + 0.65, 1.05, 0x34495e, 0xb84a2a, false, 'box');
  // Office wing at the east end: two floors of windows, a parapet, an entrance canopy.
  const ox = 1.62;
  const oz = -0.45;
  k.block(0.62, 0.86, 1.2, 0xe8e4dc, ox, 0.11, oz, { tex: 'plaster', bevel: 0.025 });
  k.box(0.66, 0.06, 1.24, 0x8c8578, ox, 0.97, oz, { flat: true });
  k.windows(4, 0.86, 0.36, 'x', ox + 0.31, { frame: 0x6a6e72, cx: oz, w: 0.16, h: 0.15 });
  k.windows(4, 0.86, 0.7, 'x', ox + 0.31, { frame: 0x6a6e72, cx: oz, w: 0.16, h: 0.15 });
  k.windows(2, 0.3, 0.7, 'z', oz + 0.6, { frame: 0x6a6e72, cx: ox, w: 0.14 });
  k.box(0.2, 0.3, 0.02, C.glassDark, ox, 0.26, oz + 0.61, { surface: 'glass', glow: 0.3 });
  k.box(0.36, 0.03, 0.22, t.main, ox, 0.44, oz + 0.7, { bevel: 0.01 });
  hvac(k, ox, 0.97, oz - 0.2, 0.26, 0.18);
  for (let i = 0; i < 3; i++) car(k, 1.15 + i * 0.26, 1.2, [0xecf0f1, 0xc0392b, 0x2e86c1][i]!, false);
  // Pallets, a forklift and yard lights.
  crates(k, -1.9 + 0.12, 0.6, 4, 0x9a7a4a);
  k.block(0.14, 0.08, 0.22, C.hazard, -1.2, 0.13, 1.2, { bevel: 0.015 });
  k.block(0.1, 0.08, 0.08, 0x2a2d31, -1.2, 0.21, 1.16, {});
  k.box(0.1, 0.3, 0.015, 0x2a2d31, -1.2, 0.28, 1.32, { flat: true });
  k.box(0.1, 0.012, 0.12, 0x6a6e72, -1.2, 0.14, 1.38, { flat: true });
  floodMast(k, -1.88, 1.4, 1.1, 0.11, Math.PI / 4);
  floodMast(k, 1.88, 0.3, 1.1, 0.11, -Math.PI / 4);
  return k.build();
}

/** Construction office: stacked site cabins, a tower crane (its jib slews), a foundation with rebar, materials. */
function constructionOffice(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 3, 3, 0xa59a7f);
  k.box(1.3, 0.01, 0.9, 0x938870, 0.6, 0.115, 0.55, { tex: 'concrete', flat: true });
  // Hoarding along the front and the west side, team-striped, with a gate.
  for (const [x, z, len, ax] of [[-0.75, 1.42, 1.4, true], [1.05, 1.42, 0.8, true], [-1.42, 0.2, 2.4, false]] as const) {
    k.block(ax ? len : 0.03, 0.24, ax ? 0.03 : len, 0xd8d0b8, x, 0.11, z, { tex: 'planks' });
    k.box(ax ? len : 0.035, 0.04, ax ? 0.035 : len, t.main, x, 0.3, z, { flat: true });
  }
  for (const s of [-1, 1]) k.block(0.04, 0.32, 0.04, C.hazard, 0.25 + s * 0.38, 0.11, 1.42, { surface: 'metal' });
  // Site cabins: two stacked, with an outside stair, lit windows and a sign.
  const cx = -0.75;
  const cz = -0.95;
  for (const [y, w, c] of [[0.11, 1.1, 0xe8e4d8], [0.47, 1.1, 0xd9d2c0]] as const) {
    k.block(w, 0.34, 0.44, c, cx, y + 0.01, cz, { tex: 'panels', bevel: 0.015 });
    for (const s of [-1, 1]) k.box(0.03, 0.34, 0.46, 0x6a6e72, cx + s * (w / 2 - 0.01), y + 0.18, cz, { flat: true });
    k.windows(3, 0.6, y + 0.2, 'z', cz + 0.225, { frame: 0x6a6e72, w: 0.16, h: 0.12 });
  }
  k.box(0.14, 0.24, 0.02, C.door, cx + 0.42, 0.24, cz + 0.225, { tex: 'planks' });
  beam(k, [cx + 0.75, 0.13, cz + 0.32], [cx + 0.35, 0.47, cz + 0.32], 0.1, 0x8c939a, { surface: 'metal' });
  railing(k, cx + 0.15, 0.82, cz + 0.27, 0.8, true, C.hazard, 0.07);
  k.box(0.6, 0.12, 0.02, t.main, cx - 0.2, 0.92, cz + 0.2, { flat: true });
  k.box(0.5, 0.03, 0.022, 0xf4f4ee, cx - 0.2, 0.92, cz + 0.205, { flat: true, glow: 0.4 });
  // Tower crane: lattice mast, cab, and a slewing jib with counterweights, trolley, hook and load.
  const mx = 0.85;
  const mz = -0.85;
  const mh = 2.5;
  k.block(0.36, 0.08, 0.36, C.concrete, mx, 0.11, mz, { tex: 'concrete', bevel: 0.02 });
  lattice(k, mx, mz, 0.18, 0.18, mh, C.hazard, { y0: 0.19, bays: 10, m: 0.016 });
  const j = k.part('spin', [mx, 0.19 + mh, mz]);
  j.block(0.24, 0.05, 0.24, 0x5b6168, 0, 0, 0, { surface: 'metal' });
  j.block(0.14, 0.12, 0.14, 0xe8e4d8, 0.04, 0.05, 0.14, { bevel: 0.015 });
  j.box(0.02, 0.08, 0.12, C.glassDark, 0.115, 0.11, 0.14, { surface: 'glass', glow: 0.3 });
  trussX(j, -1.7, 0.1, 0.12, 0, 0.12, 0.12, C.hazard, 9, 0.012);
  trussX(j, 0.1, 0.6, 0.1, 0, 0.12, 0.08, C.hazard, 3, 0.012);
  for (const [x, c] of [[0.46, 0x9d9a92], [0.54, 0x9d9a92]] as const) j.block(0.07, 0.16, 0.18, c, x, -0.02, 0, { tex: 'concrete', bevel: 0.01 });
  beam(j, [-0.05, 0.05, 0], [0, 0.55, 0], 0.03, C.hazard);
  beam(j, [0.05, 0.05, 0], [0, 0.55, 0], 0.03, C.hazard);
  strut(j, [0, 0.55, 0], [-1.2, 0.18, 0], 0.005, C.metalDark, 3);
  strut(j, [0, 0.55, 0], [0.55, 0.15, 0], 0.005, C.metalDark, 3);
  light(j, 0, 0.58, 0, 0.035, RED_LIGHT);
  j.box(0.08, 0.04, 0.1, 0x3a3f44, -1.05, 0.04, 0, {});
  j.cyl(0.004, 0.004, 0.9, 3, C.metalDark, -1.05, -0.43, 0);
  j.box(0.06, 0.05, 0.05, C.hazard, -1.05, -0.9, 0, {});
  for (let i = 0; i < 3; i++) j.box(0.4, 0.035, 0.035, 0x8a4a3a, -1.05, -0.97 - i * 0.035, 0, { surface: 'metal' });
  // Foundation in progress: a slab with rebar starters and formwork.
  const fx = 0.55;
  const fz = 0.55;
  k.block(1.0, 0.08, 0.7, 0xb8b4aa, fx, 0.11, fz, { tex: 'concrete' });
  k.block(1.04, 0.1, 0.03, 0x9a7a4a, fx, 0.11, fz + 0.36, { tex: 'planks' });
  k.block(0.03, 0.1, 0.74, 0x9a7a4a, fx + 0.52, 0.11, fz, { tex: 'planks' });
  for (let i = 0; i < 6; i++) for (let jj = 0; jj < 4; jj++) k.box(0.012, 0.22, 0.012, 0x8a4a3a, fx - 0.4 + i * 0.16, 0.3, fz - 0.24 + jj * 0.16, { flat: true });
  for (let i = 0; i < 4; i++) k.box(0.84, 0.01, 0.01, 0x8a4a3a, fx, 0.36, fz - 0.24 + i * 0.16, { flat: true });
  // Materials: timber, concrete pipes, brick pallets, a sand heap, a mixer lorry, cones.
  for (let i = 0; i < 3; i++) k.block(0.6, 0.05, 0.22 - i * 0.02, tint(0xb08850, 1 - i * 0.06), -0.75, 0.13 + i * 0.05, 0.05, { tex: 'planks' });
  for (const z of [0.42, 0.62]) k.cylX(0.08, 0.32, 10, 0xb8b4aa, -1.05, 0.2, z, { tex: 'concrete' });
  k.cylX(0.08, 0.32, 10, 0xb8b4aa, -1.05, 0.34, 0.52, { tex: 'concrete' });
  for (const x of [-0.55, -0.3]) {
    k.block(0.2, 0.025, 0.2, 0x9a7a4a, x, 0.11, 0.55, { tex: 'planks' });
    k.block(0.18, 0.16, 0.18, C.brick, x, 0.135, 0.55, { tex: 'brick', bevel: 0.01 });
  }
  k.cone(0.3, 0.26, 9, 0xd2b57a, -0.6, 0.24, 1.0, { flat: true });
  truck(k, 0.05, 1.05, t.main, 0xd8d4ca, true, 'tank');
  cones(k, 0.9, 1.25, 4, true, 0.12);
  lamp(k, -1.25, 1.25, 0.6);
  return k.build();
}

/** Road maintenance depot: a garage with two bays, a salt dome, a gritter, a roller and road gear. */
function maintenanceDepot(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 3, 2, 0x8c8a84);
  // Garage: panelled walls, two big yellow doors with hazard frames, a shallow roof with a team band.
  const gx = -0.55;
  const gz = -0.3;
  k.block(1.6, 0.68, 1.0, 0xc4c8cc, gx, 0.11, gz, { tex: 'panels', bevel: 0.02 });
  k.box(1.64, 0.08, 1.04, t.main, gx, 0.76, gz, { flat: true });
  k.gable(1.6, 1.0, 0.16, 0x5b6168, gx, 0.8, gz, { over: 0.05, tex: 'panels' });
  for (const x of [gx - 0.38, gx + 0.22]) {
    k.box(0.44, 0.48, 0.02, C.hazard, x, 0.35, gz + 0.51, { tex: 'panels' });
    for (let j = 0; j < 5; j++) k.box(0.44, 0.008, 0.025, 0xb08a2a, x, 0.15 + j * 0.09, gz + 0.515, { flat: true });
    for (const s of [-1, 1]) for (let j = 0; j < 4; j++) k.box(0.035, 0.12, 0.03, j % 2 ? 0x222222 : C.hazard, x + s * 0.25, 0.17 + j * 0.12, gz + 0.515, { flat: true });
    light(k, x, 0.65, gz + 0.53, 0.04, 0xfff0c0);
  }
  k.windows(2, 0.5, 0.45, 'x', gx + 0.81, { frame: 0x6a6e72, cx: gz });
  k.box(0.15, 0.3, 0.02, C.door, gx + 0.65, 0.26, gz + 0.51, { tex: 'panels' });
  // Salt dome with its opening, and a heap of grit in front.
  const dx = 0.9;
  const dz = -0.4;
  k.cyl(0.52, 0.54, 0.12, 14, C.concrete, dx, 0.17, dz, { tex: 'concrete' });
  k.add(new THREE.ConeGeometry(0.52, 0.7, 14), 0x8a6a48, dx, 0.58, dz, { tex: 'planks' });
  k.cone(0.07, 0.08, 8, 0x5b6168, dx, 0.96, dz, { flat: true });
  k.block(0.3, 0.32, 0.2, 0x8a6a48, dx, 0.22, dz + 0.42, { tex: 'planks' });
  k.gable(0.22, 0.3, 0.1, 0x6a5038, dx, 0.54, dz + 0.42, { rot: [0, Math.PI / 2, 0], tex: 'planks' });
  k.box(0.2, 0.24, 0.02, 0x2a2622, dx, 0.26, dz + 0.525, { flat: true });
  k.cone(0.22, 0.16, 8, 0xe8e4dc, dx + 0.1, 0.19, dz + 0.78, { flat: true });
  // Vehicles: a gritter lorry and a road roller.
  truck(k, -0.6, 0.62, C.hazard, 0x6a6e72, true, 'tipper');
  k.box(0.04, 0.012, 0.2, 0xff8a2a, -0.4, 0.42, 0.62, { glow: 0.9 });
  const rx = 0.55;
  const rz = 0.62;
  k.cylZ(0.09, 0.26, 12, 0x3a3f44, rx + 0.18, 0.2, rz, { surface: 'metal' });
  k.cylZ(0.07, 0.24, 10, 0x3a3f44, rx - 0.12, 0.18, rz, { surface: 'metal' });
  k.block(0.24, 0.12, 0.22, C.hazard, rx, 0.18, rz, { bevel: 0.02 });
  k.block(0.14, 0.12, 0.16, C.glassDark, rx - 0.04, 0.3, rz, { surface: 'glass', bevel: 0.01 });
  k.box(0.18, 0.02, 0.2, C.hazard, rx - 0.04, 0.43, rz, { flat: true });
  light(k, rx - 0.04, 0.46, rz, 0.03, 0xff8a2a);
  // Road gear: cones, stacked barriers, a cable drum, a fuel pump.
  cones(k, -1.35, 0.35, 4, false, 0.11);
  for (let i = 0; i < 3; i++) {
    k.box(0.4, 0.06, 0.04, 0xe8e4dc, 1.15, 0.15 + i * 0.07, 0.25, { flat: true });
    for (let j = 0; j < 3; j++) k.box(0.07, 0.061, 0.042, 0xc0302a, 1.0 + j * 0.15, 0.15 + i * 0.07, 0.25, { flat: true });
  }
  k.cylZ(0.12, 0.1, 10, 0x8a6a48, -1.3, 0.23, -0.82, { tex: 'planks' });
  k.cylZ(0.08, 0.11, 10, 0x2a2d31, -1.3, 0.23, -0.82);
  k.block(0.1, 0.24, 0.08, t.main, 0.15, 0.11, 0.25, { bevel: 0.015 });
  k.box(0.06, 0.05, 0.01, 0xf4f4ee, 0.15, 0.3, 0.295, { glow: 0.6 });
  lamp(k, 1.38, 0.88, 0.6);
  return k.build();
}

/** Container port on the water (+x): a quay, a ship-to-shore gantry crane, stacks, a straddle carrier, an office. */
function tradePort(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 4, 3, 0x8c8a84);
  k.box(3.9, 0.01, 2.9, 0x55595e, 0, 0.115, 0, { tex: 'concrete', flat: true });
  // Quay edge: a concrete cope with fenders and bollards; crane rails.
  k.block(0.12, 0.06, 2.96, 0xb9b5ab, 1.92, 0.11, 0, { tex: 'concrete', bevel: 0.015 });
  for (let i = 0; i < 6; i++) {
    const z = -1.25 + i * 0.5;
    k.box(0.04, 0.1, 0.12, 0x1e2022, 1.985, 0.08, z, { bevel: 0.01 });
    k.cyl(0.025, 0.03, 0.06, 6, 0x2a2d31, 1.9, 0.2, z + 0.25, { surface: 'metal' });
  }
  for (const x of [0.92, 1.68]) k.box(0.025, 0.012, 2.9, 0x8c939a, x, 0.125, 0, { surface: 'metal', flat: true });
  for (let i = 0; i < 12; i++) k.box(0.4, 0.006, 0.05, i % 2 ? 0x222222 : C.hazard, 1.3, 0.122, -1.375 + i * 0.25, { flat: true });
  // Ship-to-shore crane: two portal frames, a girder deck with a machinery house, an A-frame, the boom raised.
  const cz = 0.15;
  const legs: Array<[number, number]> = [[0.92, cz - 0.48], [1.68, cz - 0.48], [0.92, cz + 0.48], [1.68, cz + 0.48]];
  for (const [x, z] of legs) {
    k.block(0.14, 0.08, 0.2, 0x3a3f44, x, 0.12, z, { bevel: 0.015 });
    k.block(0.08, 1.55, 0.08, t.main, x, 0.2, z, { surface: 'metal', bevel: 0.01 });
  }
  for (const z of [cz - 0.48, cz + 0.48]) {
    k.box(0.84, 0.07, 0.07, t.main, 1.3, 0.6, z, { surface: 'metal' });
    beam(k, [0.92, 0.65, z], [1.68, 1.3, z], 0.035, t.dark, { surface: 'metal' });
    k.box(1.6, 0.1, 0.09, t.main, 1.2, 1.75, z, { surface: 'metal', bevel: 0.015 });
  }
  for (const x of [0.92, 1.68]) k.box(0.09, 0.08, 1.0, t.main, x, 1.6, cz, { surface: 'metal' });
  k.block(0.5, 0.22, 0.5, 0xe8e4dc, 0.62, 1.8, cz, { tex: 'panels', bevel: 0.02 });
  k.box(0.52, 0.04, 0.52, t.dark, 0.62, 1.9, cz, { flat: true });
  for (const z of [cz - 0.4, cz + 0.4]) {
    beam(k, [0.85, 1.8, z], [1.1, 2.75, cz + (z - cz) * 0.3], 0.05, t.main, { surface: 'metal' });
    beam(k, [1.4, 1.8, z], [1.1, 2.75, cz + (z - cz) * 0.3], 0.05, t.main, { surface: 'metal' });
  }
  k.box(0.08, 0.06, 0.3, t.dark, 1.1, 2.76, cz, { surface: 'metal' });
  light(k, 1.1, 2.82, cz, 0.05, RED_LIGHT);
  // Raised boom over the water, its stays and the trolley with the operator's cab.
  for (const z of [cz - 0.4, cz + 0.4]) {
    beam(k, [1.85, 1.78, z], [1.95, 2.95, z], 0.06, t.main, { surface: 'metal' });
    strut(k, [1.1, 2.76, cz], [1.93, 2.75, z], 0.008, C.metalDark, 3);
  }
  for (const y of [2.1, 2.5, 2.9]) k.box(0.05, 0.04, 0.8, t.main, 1.86 + (y - 1.78) * 0.085, y, cz, { surface: 'metal' });
  light(k, 1.96, 3.0, cz, 0.045, RED_LIGHT);
  k.block(0.26, 0.08, 0.28, 0x5b6168, 1.45, 1.61, cz, { surface: 'metal' });
  k.block(0.16, 0.14, 0.14, 0xe8e4dc, 1.5, 1.45, cz + 0.08, { bevel: 0.015 });
  k.box(0.02, 0.1, 0.12, C.glassDark, 1.585, 1.52, cz + 0.08, { surface: 'glass', glow: 0.4 });
  for (const z of [-0.06, 0.06]) k.cyl(0.004, 0.004, 0.5, 3, C.metalDark, 1.45, 1.35, cz + z);
  k.block(0.5, 0.05, 0.22, C.hazard, 1.45, 1.05, cz, { bevel: 0.01 });
  container(k, 1.45, 0.82, cz, 0x2f6fb5, true);
  // Container stacks in two blocks, a straddle carrier over one row.
  const cols = [-1.55, -0.98, -0.41, 0.16];
  let n = 0;
  for (const x of cols) for (const [z0, rows] of [[-1.28, 4], [0.05, 3]] as const) for (let r = 0; r < rows; r++) {
    const z = z0 + r * 0.23;
    const h = 1 + ((n * 7 + r * 3 + (x > 0 ? 1 : 0)) % 3);
    for (let y = 0; y < h; y++) container(k, x, 0.12 + y * 0.205, z, CONTAINER_COLOURS[(n * 5 + y * 3) % CONTAINER_COLOURS.length]!, true);
    n++;
  }
  const sxx = 0.55;
  const szz = -0.6;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.block(0.04, 0.72, 0.04, C.hazard, sxx + sx * 0.3, 0.16, szz + sz * 0.16, { surface: 'metal' });
    k.box(0.05, 0.05, 0.4, C.hazard, sxx + sx * 0.3, 0.88, szz, { surface: 'metal' });
    for (const sz of [-1, 1]) k.cylX(0.04, 0.05, 8, 0x1c1e21, sxx + sx * 0.3, 0.16, szz + sz * 0.16);
  }
  k.block(0.66, 0.08, 0.36, C.hazard, sxx, 0.9, szz, { bevel: 0.015 });
  k.block(0.14, 0.12, 0.14, 0xe8e4dc, sxx + 0.22, 0.98, szz + 0.1, { bevel: 0.01 });
  container(k, sxx, 0.5, szz, 0xc96a2a, true);
  // Port office with a control room on top, a flag, light masts and a lorry at the gate.
  const ox = -1.45;
  const oz = 1.0;
  k.block(0.8, 0.6, 0.62, 0xe8e4dc, ox, 0.11, oz, { tex: 'plaster', bevel: 0.025 });
  k.windows(3, 0.5, 0.25, 'z', oz + 0.31, { frame: 0x6a6e72, w: 0.14 });
  k.windows(3, 0.5, 0.5, 'z', oz + 0.31, { frame: 0x6a6e72, w: 0.14 });
  k.windows(2, 0.3, 0.5, 'x', ox + 0.4, { frame: 0x6a6e72, cx: oz, w: 0.14 });
  k.block(0.5, 0.28, 0.42, 0x8c939a, ox - 0.05, 0.71, oz - 0.04, { surface: 'metal', bevel: 0.02 });
  ribbon(k, ox - 0.05, 0.86, oz + 0.17, 0.48, 0.12, 'z', 0.4, C.glassDark, 4);
  ribbon(k, ox + 0.2, 0.86, oz - 0.04, 0.4, 0.12, 'x', 0.4, C.glassDark, 3);
  k.box(0.56, 0.04, 0.48, t.main, ox - 0.05, 1.01, oz - 0.04, { bevel: 0.01 });
  k.cyl(0.006, 0.006, 0.4, 3, C.metalDark, ox - 0.2, 1.23, oz - 0.1);
  flag(k, ox + 0.55, oz + 0.25, 0.9, t.main);
  floodMast(k, -1.9, -0.25, 1.5, 0.11, 0);
  floodMast(k, 0.6, 0.0, 1.5, 0.11, 0);
  truck(k, -0.55, 1.15, t.main, 0, true, 'flat');
  container(k, -0.63, 0.24, 1.15, 0x3f8a4a, true, 0.36);
  return k.build();
}

/** Coast guard station on the water (+x): a lookout tower with a turning radar, a helipad, a patrol boat at the jetty. */
function coastGuard(team: number): THREE.Group {
  const t = teamOf(team);
  const RED = 0xc8362a;
  const k = new Kit();
  // Land on the west, a quay wall, a basin of water on the east with a jetty and the patrol boat.
  const qx = 0.78;
  k.box(qx + 1.48, 0.08, 2.96, tint(C.paving, 0.92), (qx - 1.48) / 2, 0.04, 0, { tex: 'concrete', flat: true });
  k.box(qx + 1.42, 0.03, 2.9, C.paving, (qx - 1.48) / 2, 0.095, 0, { tex: 'concrete', flat: true });
  k.block(0.08, 0.13, 2.96, 0xb9b5ab, qx, 0, 0, { tex: 'concrete', bevel: 0.015 });
  water(k, 1.48 - qx, 2.96, (qx + 1.48) / 2 + 0.02, 0.05, 0, 0x2f87a8);
  for (let i = 0; i < 5; i++) k.box(0.04, 0.08, 0.1, 0x1e2022, qx + 0.05, 0.06, -1.2 + i * 0.6, { bevel: 0.01 });
  // Jetty on piles.
  const jz = -0.55;
  k.block(0.66, 0.035, 0.24, 0x8a6a48, qx + 0.37, 0.1, jz, { tex: 'planks' });
  for (const x of [qx + 0.15, qx + 0.4, qx + 0.65]) for (const s of [-1, 1]) k.cyl(0.02, 0.02, 0.16, 5, 0x5e3d24, x, 0.06, jz + s * 0.11, { tex: 'planks' });
  railing(k, qx + 0.37, 0.135, jz - 0.115, 0.66, true, 0xe8e4dc, 0.06);
  // Patrol boat alongside the quay (along z): white hull, red stripe, wheelhouse, mast and a blue light.
  const bx = qx + 0.36;
  const bz = 0.55;
  k.block(0.3, 0.1, 0.9, C.white, bx, 0.03, bz, { bevel: 0.02, taper: 0.08, surface: 'gloss' });
  k.cone(0.15, 0.22, 4, C.white, bx, 0.08, bz + 0.55, { rot: [Math.PI / 2, Math.PI / 4, 0], surface: 'gloss' });
  k.box(0.31, 0.03, 0.9, RED, bx, 0.1, bz, { flat: true });
  k.box(0.04, 0.03, 0.5, t.main, bx + 0.155, 0.1, bz - 0.05, { flat: true });
  k.box(0.26, 0.015, 0.84, 0xd8d0c0, bx, 0.135, bz, { tex: 'planks', flat: true });
  k.block(0.2, 0.14, 0.3, C.white, bx, 0.14, bz + 0.05, { bevel: 0.025, surface: 'gloss' });
  ribbon(k, bx, 0.24, bz + 0.2, 0.18, 0.05, 'z', 0.4, C.glassDark);
  ribbon(k, bx + 0.101, 0.24, bz + 0.05, 0.24, 0.05, 'x', 0.4, C.glassDark);
  k.box(0.22, 0.02, 0.32, RED, bx, 0.29, bz + 0.05, { bevel: 0.008 });
  k.cyl(0.006, 0.006, 0.22, 3, C.metalDark, bx, 0.4, bz);
  light(k, bx, 0.52, bz, 0.03, 0x5aa0ff);
  k.cylX(0.03, 0.12, 6, 0xff7a2a, bx, 0.17, bz - 0.33);
  for (const z of [bz - 0.3, bz + 0.3]) strut(k, [qx - 0.03, 0.12, z], [bx - 0.12, 0.12, z], 0.004, 0xd8d0c0, 3);
  // Station house: two floors, white with red bands, a team stripe, windows on both fronts.
  const hx = -0.62;
  const hz = -0.8;
  k.block(1.4, 0.8, 0.9, C.white, hx, 0.11, hz, { tex: 'plaster', bevel: 0.025 });
  k.box(1.43, 0.06, 0.93, RED, hx, 0.51, hz, { flat: true });
  k.box(1.44, 0.08, 0.94, t.main, hx, 0.93, hz, { flat: true });
  k.windows(4, 1.0, 0.33, 'z', hz + 0.45, { frame: 0x6a6e72, w: 0.15 });
  k.windows(4, 1.0, 0.72, 'z', hz + 0.45, { frame: 0x6a6e72, w: 0.15 });
  k.windows(2, 0.5, 0.72, 'x', hx + 0.7, { frame: 0x6a6e72, cx: hz, w: 0.15 });
  k.box(0.22, 0.3, 0.02, 0x2f4f6f, hx + 0.48, 0.26, hz + 0.455, { tex: 'panels' });
  k.box(0.32, 0.03, 0.18, RED, hx + 0.48, 0.44, hz + 0.53, { bevel: 0.01 });
  hvac(k, hx - 0.35, 0.97, hz - 0.15, 0.24, 0.16);
  // Lookout tower at the corner: shaft, a glazed watch room, a gallery, the turning radar and a beacon.
  const tx = hx + 0.45;
  const tz = hz - 0.12;
  k.block(0.4, 1.7, 0.4, C.white, tx, 0.91, tz, { tex: 'plaster', bevel: 0.02 });
  for (const y of [1.25, 1.65]) k.box(0.41, 0.08, 0.41, RED, tx, y, tz, { flat: true });
  k.block(0.52, 0.04, 0.52, 0x5b6168, tx, 2.61, tz, { surface: 'metal' });
  railing(k, tx, 2.65, tz + 0.25, 0.5, true, 0xe8e4dc, 0.06);
  railing(k, tx + 0.25, 2.65, tz, 0.5, false, 0xe8e4dc, 0.06);
  k.block(0.36, 0.2, 0.36, C.glassDark, tx, 2.65, tz, { surface: 'glass', glow: 0.35 });
  k.block(0.42, 0.05, 0.42, RED, tx, 2.85, tz, { bevel: 0.015 });
  const r = k.part('spin', [tx, 2.9, tz]);
  r.cyl(0.03, 0.04, 0.1, 6, C.metalDark, 0, 0.05, 0);
  r.box(0.5, 0.05, 0.04, 0xe8e4dc, 0, 0.12, 0, { bevel: 0.01 });
  r.box(0.5, 0.012, 0.042, t.main, 0, 0.12, 0, { flat: true });
  const f = k.part('flare', [tx - 0.15, 2.95, tz - 0.15]);
  light(f, 0, 0, 0, 0.05, 0x5aa0ff);
  // Radio mast, a helipad with a helicopter, a lifeboat on a trailer, lifebuoys and lamps.
  lattice(k, 0.45, -1.2, 0.14, 0.04, 2.3, 0xe8e4dc, { y0: 0.11, bays: 8, m: 0.012 });
  const f2 = k.part('flare', [0.45, 2.44, -1.2]);
  light(f2, 0, 0, 0, 0.045, RED_LIGHT);
  const px = -0.65;
  const pz = 0.7;
  k.cyl(0.58, 0.6, 0.04, 20, 0x4a4e52, px, 0.13, pz, { tex: 'concrete' });
  ring(k, px, 0.152, pz, 0.5, 0.025, C.hazard, 20);
  k.box(0.06, 0.006, 0.34, 0xf0f0ea, px - 0.1, 0.153, pz, { flat: true });
  k.box(0.06, 0.006, 0.34, 0xf0f0ea, px + 0.1, 0.153, pz, { flat: true });
  k.box(0.2, 0.006, 0.06, 0xf0f0ea, px, 0.153, pz, { flat: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    light(k, px + Math.cos(a) * 0.57, 0.16, pz + Math.sin(a) * 0.57, 0.03, 0x7aff8a);
  }
  // Helicopter: body, tail boom, fin, skids, rotor.
  const hy = 0.17;
  k.sphere(0.13, RED, px + 0.05, hy + 0.13, pz, 10, { surface: 'gloss' });
  k.box(0.22, 0.14, 0.16, RED, px - 0.04, hy + 0.12, pz, { bevel: 0.04, surface: 'gloss' });
  k.sphere(0.09, C.glassDark, px + 0.12, hy + 0.15, pz, 8, { surface: 'glass', glow: 0.2 });
  k.box(0.04, 0.04, 0.17, C.white, px - 0.04, hy + 0.12, pz, { flat: true });
  beam(k, [px - 0.12, hy + 0.15, pz], [px - 0.48, hy + 0.2, pz], 0.035, RED);
  k.box(0.08, 0.12, 0.012, C.white, px - 0.47, hy + 0.26, pz, { flat: true, rot: [0, 0, -0.3] });
  for (const s of [-1, 1]) {
    k.box(0.3, 0.012, 0.012, C.metalDark, px, hy + 0.01, pz + s * 0.09, { flat: true });
    for (const x of [-0.06, 0.08]) k.box(0.01, 0.05, 0.01, C.metalDark, px + x, hy + 0.035, pz + s * 0.08, { flat: true });
  }
  k.cyl(0.015, 0.015, 0.06, 5, C.metalDark, px, hy + 0.28, pz);
  for (const a of [0.3, 0.3 + Math.PI / 2]) k.box(0.62, 0.006, 0.03, 0x2a2d31, px, hy + 0.31, pz, { rot: [0, a, 0], flat: true });
  // Inflatable on a trailer.
  k.box(0.32, 0.03, 0.14, 0x5b6168, 0.35, 0.15, 0.95, { flat: true });
  k.block(0.34, 0.07, 0.16, 0xff7a2a, 0.35, 0.165, 0.95, { bevel: 0.03 });
  for (const s of [-1, 1]) k.cylZ(0.035, 0.03, 8, 0x1c1e21, 0.35, 0.15, 0.95 + s * 0.08);
  for (const z of [-1.1, 0.0]) {
    k.box(0.02, 0.12, 0.02, C.metalDark, qx - 0.12, 0.17, z, { flat: true });
    ring(k, qx - 0.11, 0.22, z, 0.04, 0.012, 0xff6a2a, 10, { rot: [0, Math.PI / 2, 0] });
  }
  lamp(k, qx - 0.12, 0.35, 0.6);
  lamp(k, qx - 0.12, -1.3, 0.6);
  return k.build();
}

/** River dock (+x is the water): a timber wharf on piles, a derrick crane, a goods shed, a moored barge. */
function riverDock(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  const qx = 0.55;
  k.box(qx + 1.48, 0.08, 2.96, tint(C.paving, 0.92), (qx - 1.48) / 2, 0.04, 0, { tex: 'concrete', flat: true });
  k.box(qx + 1.42, 0.03, 2.9, 0x9a948a, (qx - 1.48) / 2, 0.095, 0, { tex: 'concrete', flat: true });
  k.block(0.06, 0.12, 2.96, 0x8f877a, qx, 0, 0, { tex: 'brick' });
  water(k, 1.48 - qx, 2.96, (qx + 1.48) / 2 + 0.02, 0.04, 0, 0x3a8a9a);
  // Wharf deck on piles along the water, a stair, bollards.
  const wz = -0.45;
  const wl = 1.9;
  k.block(0.62, 0.04, wl, 0x8a6a48, qx + 0.33, 0.1, wz, { tex: 'planks' });
  for (let i = 0; i < 6; i++) for (const x of [qx + 0.1, qx + 0.6]) k.cyl(0.025, 0.025, 0.2, 5, 0x5e3d24, x, 0.06, wz - wl / 2 + 0.1 + i * 0.34, { tex: 'planks' });
  for (let i = 0; i < 4; i++) k.cyl(0.025, 0.03, 0.06, 6, 0x2a2d31, qx + 0.6, 0.17, wz - 0.75 + i * 0.5, { surface: 'metal' });
  // Moored barge (along z) with a heap of cargo and a wheelhouse at the stern.
  const bx = qx + 0.48;
  const bz = 0.95;
  k.block(0.42, 0.1, 0.95, 0x4a3a2e, bx, 0.0, bz, { bevel: 0.02, taper: 0.05 });
  k.box(0.43, 0.025, 0.96, t.main, bx, 0.09, bz, { flat: true });
  k.box(0.36, 0.02, 0.6, 0x2a2420, bx, 0.105, bz + 0.1, { flat: true });
  k.cone(0.2, 0.12, 6, 0x2c2b2a, bx, 0.17, bz + 0.25, { flat: true, rot: [0, 0.3, 0] });
  k.cone(0.16, 0.1, 6, 0x34322f, bx + 0.02, 0.16, bz - 0.02, { flat: true });
  k.block(0.22, 0.14, 0.16, 0xe8e4dc, bx, 0.1, bz - 0.36, { bevel: 0.015 });
  ribbon(k, bx, 0.2, bz - 0.279, 0.18, 0.04, 'z', 0.4, C.glassDark);
  k.box(0.24, 0.02, 0.18, 0x6a2a2a, bx, 0.25, bz - 0.36, { flat: true });
  k.cyl(0.02, 0.02, 0.12, 6, 0x2a2d31, bx + 0.06, 0.32, bz - 0.4);
  // Derrick crane on the wharf: mast, boom swung out over the water, guys, a load of sacks.
  const dx = qx + 0.3;
  const dz = -1.0;
  k.cyl(0.05, 0.05, 0.08, 8, 0x3a3f44, dx, 0.18, dz);
  k.block(0.06, 1.3, 0.06, t.main, dx, 0.14, dz, { surface: 'metal', bevel: 0.01 });
  beam(k, [dx, 0.3, dz], [dx + 0.5, 1.15, dz + 0.3], 0.045, t.main, { surface: 'metal' });
  strut(k, [dx, 1.44, dz], [dx + 0.5, 1.15, dz + 0.3], 0.005, C.metalDark, 3);
  for (const [gx, gz] of [[-0.6, -0.35], [-0.55, 0.4]] as const) strut(k, [dx, 1.4, dz], [dx + gx, 0.12, dz + gz], 0.004, C.metalDark, 3);
  k.block(0.18, 0.12, 0.14, 0x5b6168, dx - 0.14, 0.14, dz, { surface: 'metal' });
  k.cyl(0.004, 0.004, 0.55, 3, C.metalDark, dx + 0.5, 0.86, dz + 0.3);
  k.box(0.18, 0.1, 0.14, 0xc8b07a, dx + 0.5, 0.55, dz + 0.3, { bevel: 0.03 });
  // Goods shed: timber walls, a big sliding door to the wharf, a hoist beam in the gable.
  const sx = -0.65;
  const sz = -0.7;
  k.block(1.25, 0.06, 1.05, C.concrete, sx, 0.11, sz, { tex: 'concrete' });
  k.block(1.2, 0.6, 1.0, 0x9a6a44, sx, 0.17, sz, { tex: 'planks' });
  for (const x of [sx - 0.6, sx + 0.6]) for (const z of [sz - 0.5, sz + 0.5]) k.block(0.06, 0.6, 0.06, C.timberDark, x, 0.17, z, { tex: 'planks' });
  k.gable(1.0, 1.2, 0.36, C.roofSlate, sx, 0.77, sz, { rot: [0, Math.PI / 2, 0], over: 0.07 });
  k.box(0.02, 0.4, 0.5, C.timberDark, sx + 0.61, 0.37, sz, { tex: 'planks' });
  k.box(0.03, 0.04, 0.6, 0x3a3f44, sx + 0.62, 0.6, sz, { surface: 'metal' });
  k.box(0.022, 0.14, 0.14, 0xffd890, sx + 0.61, 0.9, sz, { glow: 0.5 });
  k.box(0.3, 0.03, 0.03, C.timberDark, sx + 0.72, 1.0, sz, { tex: 'planks' });
  k.cyl(0.004, 0.004, 0.35, 3, C.metalDark, sx + 0.84, 0.82, sz);
  k.windows(3, 0.7, 0.5, 'z', sz + 0.51, { frame: C.timberDark, w: 0.13, h: 0.13 });
  k.box(0.6, 0.1, 0.02, t.main, sx, 0.72, sz + 0.51, { flat: true });
  // Cargo on the quay: crates, barrels, sacks, a rope coil; a lamp and a lorry.
  crates(k, -1.25, 0.3, 6, 0x9a7a4a);
  for (let i = 0; i < 5; i++) {
    const x = -0.45 + (i % 3) * 0.13;
    const z = 0.3 + Math.floor(i / 3) * 0.13;
    k.cyl(0.055, 0.055, 0.14, 8, i % 2 ? 0x6a4a32 : 0x3f6f9a, x, 0.18, z, { tex: 'planks' });
    k.cyl(0.057, 0.057, 0.015, 8, C.metalDark, x, 0.21, z, { flat: true });
  }
  for (let i = 0; i < 6; i++) k.box(0.14, 0.06, 0.09, 0xd8c8a0, 0.1 + (i % 3) * 0.12, 0.14 + Math.floor(i / 3) * 0.055, -0.1 + (i % 2) * 0.03, { bevel: 0.025, edge: 1.1 });
  ring(k, qx - 0.15, 0.13, 0.15, 0.05, 0.015, 0xc8b07a, 10);
  truck(k, -0.3, 1.05, t.dark, 0x8a6a48, true, 'flat');
  crates(k, -0.42, 0.97, 2, 0xb08850);
  lamp(k, qx - 0.12, -0.2, 0.65);
  lamp(k, -1.35, 1.35, 0.6);
  return k.build();
}

/** Railway station: a brick station house with a clock gable, a canopied platform, a train at the platform. */
function railStation(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 4, 2);
  // Track along the front: ballast, sleepers, rails; buffer stops at the west end, a signal at the east.
  const tz = 0.64;
  k.block(3.92, 0.04, 0.42, 0x7a7266, 0, 0.1, tz, { tex: 'concrete', taper: 0.04 });
  for (let i = 0; i < 30; i++) k.box(0.05, 0.02, 0.32, 0x5e4a38, -1.9 + i * 0.131, 0.15, tz, { flat: true, tex: 'planks' });
  for (const s of [-1, 1]) k.box(3.92, 0.025, 0.02, 0xa9b0b6, 0, 0.17, tz + s * 0.1, { surface: 'metal', flat: true });
  k.block(0.08, 0.14, 0.3, 0xc0402a, -1.9, 0.14, tz, { bevel: 0.015 });
  k.cyl(0.012, 0.015, 0.55, 5, C.metalDark, 1.85, 0.4, tz + 0.27);
  k.block(0.07, 0.16, 0.04, 0x1e2022, 1.85, 0.62, tz + 0.27, { bevel: 0.01 });
  light(k, 1.85, 0.73, tz + 0.295, 0.035, 0x5aff7a);
  light(k, 1.85, 0.67, tz + 0.295, 0.035, 0x401010);
  // Platform: raised, a yellow line, benches, lamps; a canopy on iron columns with a team valance.
  const pz = 0.23;
  k.block(3.3, 0.12, 0.42, 0xb9b5ab, -0.2, 0.11, pz, { tex: 'concrete', bevel: 0.01 });
  k.box(3.3, 0.005, 0.03, C.hazard, -0.2, 0.232, pz + 0.18, { flat: true });
  for (let i = 0; i < 6; i++) {
    const x = -1.6 + i * 0.56;
    k.cyl(0.018, 0.022, 0.5, 6, 0x2f4a3a, x, 0.48, pz + 0.02, { surface: 'metal' });
    k.box(0.06, 0.04, 0.3, 0x2f4a3a, x, 0.72, pz + 0.02, { flat: true });
  }
  k.box(3.2, 0.03, 0.5, 0xd8d4ca, -0.2, 0.76, pz + 0.04, { rot: [0.12, 0, 0], tex: 'panels', bevel: 0.01 });
  k.box(3.2, 0.06, 0.015, t.main, -0.2, 0.72, pz + 0.3, { flat: true });
  for (let i = 0; i < 16; i++) k.box(0.1, 0.03, 0.012, t.main, -1.75 + i * 0.207, 0.68, pz + 0.3, { flat: true, rot: [0, 0, Math.PI / 4] });
  for (const x of [-1.3, -0.2, 0.9]) {
    k.box(0.22, 0.02, 0.06, 0x6a4a32, x, 0.28, pz - 0.1, { tex: 'planks' });
    k.box(0.22, 0.06, 0.012, 0x6a4a32, x, 0.32, pz - 0.13, { tex: 'planks' });
  }
  for (const x of [-0.75, 0.35]) {
    k.box(0.16, 0.08, 0.02, 0x1e2022, x, 0.62, pz + 0.02, { flat: true });
    k.box(0.14, 0.05, 0.022, 0xffb347, x, 0.62, pz + 0.02, { glow: 0.8 });
  }
  // Station house: a two-storey centre with a clock gable and two single-storey wings.
  const hz = -0.52;
  const brick = C.brick;
  k.block(1.0, 0.92, 0.7, brick, -0.3, 0.11, hz, { tex: 'brick' });
  k.box(1.03, 0.04, 0.73, 0xe8dcc0, -0.3, 0.52, hz, { flat: true });
  k.gable(0.7, 1.0, 0.32, C.roofSlate, -0.3, 1.03, hz, { over: 0.06, rot: [0, Math.PI / 2, 0] });
  for (const s of [-1, 1]) {
    k.block(0.9, 0.5, 0.56, brick, -0.3 + s * 0.95, 0.11, hz - 0.02, { tex: 'brick' });
    k.gable(0.9, 0.56, 0.2, C.roofSlate, -0.3 + s * 0.95, 0.61, hz - 0.02, { over: 0.05 });
    k.windows(2, 0.4, 0.38, 'z', hz + 0.27, { frame: 0xe8dcc0, cx: -0.3 + s * 0.95, w: 0.13, h: 0.2 });
  }
  k.windows(2, 0.4, 0.72, 'z', hz + 0.36, { frame: 0xe8dcc0, cx: -0.3, w: 0.13, h: 0.22 });
  k.box(0.2, 0.3, 0.02, C.door, -0.3, 0.26, hz + 0.355, { tex: 'planks' });
  k.box(0.02, 0.06, 0.02, 0xe8dcc0, -0.3, 0.44, hz + 0.36, { flat: true });
  // Clock on the gable (+z face of the ridge is the platform side).
  k.cylZ(0.11, 0.025, 14, 0xe8dcc0, -0.3, 1.13, hz + 0.37);
  k.cylZ(0.09, 0.03, 14, 0xf8f4e8, -0.3, 1.13, hz + 0.375, { glow: 0.4 });
  k.box(0.012, 0.07, 0.008, 0x1e2022, -0.3, 1.155, hz + 0.392, { flat: true });
  k.box(0.05, 0.012, 0.008, 0x1e2022, -0.28, 1.13, hz + 0.392, { flat: true });
  k.block(0.1, 0.28, 0.1, C.brickDark, -0.05, 1.05, hz - 0.15, { tex: 'brick' });
  k.box(0.13, 0.03, 0.13, 0xe8dcc0, -0.05, 1.34, hz - 0.15, { flat: true });
  sign(k, 0.65, 0.5, hz + 0.26, 0.4, 0.1, t.main);
  // A train at the platform: locomotive in team colour and a carriage.
  const ly = 0.19;
  const lx = 0.55;
  k.block(0.95, 0.24, 0.2, t.main, lx, ly + 0.04, tz, { bevel: 0.04, surface: 'gloss' });
  k.block(0.95, 0.05, 0.2, 0x2a2d31, lx, ly, tz);
  k.block(0.8, 0.05, 0.18, t.dark, lx - 0.04, ly + 0.28, tz, { bevel: 0.03, surface: 'metal' });
  k.box(0.02, 0.09, 0.16, C.glassDark, lx + 0.476, ly + 0.2, tz, { surface: 'glass', glow: 0.3 });
  k.box(0.96, 0.025, 0.205, 0xf0f0ea, lx, ly + 0.12, tz, { flat: true });
  light(k, lx + 0.48, ly + 0.08, tz, 0.035, 0xfff0c0);
  for (const x of [lx - 0.3, lx + 0.3]) k.block(0.24, 0.06, 0.18, 0x1c1e21, x, ly - 0.03, tz);
  const cx = -0.55;
  k.block(1.15, 0.24, 0.2, 0xe8dcc0, cx, ly + 0.04, tz, { bevel: 0.03, surface: 'gloss' });
  k.block(1.15, 0.05, 0.2, 0x2a2d31, cx, ly, tz);
  k.box(1.1, 0.07, 0.205, 0x6a2a2a, cx, ly + 0.07, tz, { flat: true });
  ribbon(k, cx, ly + 0.2, tz + 0.101, 1.0, 0.07, 'z', 0.5, 0x3e5d74, 8);
  k.block(1.1, 0.04, 0.17, 0x8c939a, cx, ly + 0.28, tz, { bevel: 0.02, surface: 'metal' });
  for (const x of [cx - 0.4, cx + 0.4]) k.block(0.24, 0.06, 0.18, 0x1c1e21, x, ly - 0.03, tz);
  // Forecourt: a lamp, a car, a tree.
  lamp(k, -1.8, -0.85, 0.6);
  car(k, 1.3, -0.62, 0x2e86c1, true);
  tree(k, 1.75, -0.7, 0.85, 4);
  return k.build();
}

/** An airliner parked nose toward +z (scale s): fuselage, swept wings, engines, a team tail. */
function airliner(k: Kit, x: number, z: number, s: number, tail: number, y = 0.13): void {
  const fy = y + 0.12 * s;
  k.cylZ(0.075 * s, 0.85 * s, 10, 0xf2f2ee, x, fy, z, { surface: 'gloss' });
  k.add(new THREE.SphereGeometry(0.075 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xf2f2ee, x, fy, z + 0.425 * s, { rot: [Math.PI / 2, 0, 0], flat: true, surface: 'gloss' });
  k.add(new THREE.ConeGeometry(0.075 * s, 0.22 * s, 10), 0xe8e8e4, x, fy + 0.02 * s, z - 0.53 * s, { rot: [-Math.PI / 2, 0, 0], flat: true, surface: 'gloss' });
  k.box(0.07 * s, 0.03 * s, 0.03 * s, C.glassDark, x, fy + 0.03 * s, z + 0.45 * s, { surface: 'glass', glow: 0.3 });
  for (const sg of [-1, 1]) {
    k.box(0.155 * s, 0.012 * s, 0.75 * s, 0x2a3a4a, x + sg * 0.072 * s, fy + 0.02 * s, z, { flat: true, glow: 0.25 });
    k.box(0.48 * s, 0.018 * s, 0.17 * s, 0xd8dce0, x + sg * 0.3 * s, fy - 0.035 * s, z - 0.02 * s, { rot: [0, sg * 0.42, 0], surface: 'metal' });
    k.cylZ(0.035 * s, 0.13 * s, 8, 0xc8ccd0, x + sg * 0.24 * s, fy - 0.075 * s, z + 0.06 * s, { surface: 'metal' });
    k.cylZ(0.026 * s, 0.135 * s, 8, 0x2a2d31, x + sg * 0.24 * s, fy - 0.075 * s, z + 0.06 * s);
    k.box(0.2 * s, 0.012 * s, 0.08 * s, 0xd8dce0, x + sg * 0.1 * s, fy + 0.03 * s, z - 0.55 * s, { rot: [0, sg * 0.35, 0], surface: 'metal' });
    light(k, x + sg * 0.5 * s, fy - 0.03 * s, z - 0.14 * s, 0.02 * s, sg > 0 ? 0x5aff7a : RED_LIGHT);
  }
  k.box(0.014 * s, 0.22 * s, 0.17 * s, tail, x, fy + 0.15 * s, z - 0.55 * s, { rot: [0.45, 0, 0], surface: 'gloss' });
  k.box(0.0145 * s, 0.05 * s, 0.1 * s, 0xf2f2ee, x, fy + 0.2 * s, z - 0.6 * s, { rot: [0.45, 0, 0], flat: true });
  for (const zz of [-0.04, 0.35]) k.box(0.02 * s, 0.08 * s, 0.02 * s, 0x2a2d31, x, y + 0.04 * s, z + zz * s, { flat: true });
}

/** Airport: a runway with lights, a taxiway and apron, a terminal with jet bridges, airliners, a control tower, a hangar. */
function airport(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 6, 4, C.lawn, 'lawn');
  // Runway: asphalt, threshold bars, centreline, edge lights.
  const rz = -1.42;
  k.box(5.9, 0.02, 0.78, 0x3a3d41, 0, 0.12, rz, { tex: 'concrete', flat: true });
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) k.box(0.22, 0.004, 0.05, 0xf0f0ea, sx * 2.72, 0.132, rz - 0.3 + i * 0.12, { flat: true });
  for (let i = 0; i < 9; i++) k.box(0.28, 0.004, 0.035, 0xf0f0ea, -2.2 + i * 0.55, 0.132, rz, { flat: true });
  for (const sx of [-1, 1]) k.box(0.05, 0.004, 0.7, 0xf0f0ea, sx * 2.5, 0.132, rz, { flat: true });
  for (let i = 0; i < 12; i++) for (const s of [-1, 1]) light(k, -2.75 + i * 0.5, 0.14, rz + s * 0.4, 0.03, s > 0 ? 0xfff0c0 : 0xfff0c0);
  for (let i = 0; i < 4; i++) light(k, -2.92, 0.14, rz - 0.3 + i * 0.2, 0.035, 0x5aff7a);
  // Taxiway and connectors, with a yellow centreline; the apron.
  k.box(5.0, 0.016, 0.26, 0x4a4d51, 0, 0.12, -0.75, { tex: 'concrete', flat: true });
  k.box(5.0, 0.004, 0.02, C.hazard, 0, 0.13, -0.75, { flat: true });
  for (const x of [-2.4, 2.4]) {
    k.box(0.26, 0.016, 0.6, 0x4a4d51, x, 0.12, -1.0, { tex: 'concrete', flat: true });
    k.box(0.02, 0.004, 0.6, C.hazard, x, 0.13, -1.0, { flat: true });
  }
  for (let i = 0; i < 9; i++) light(k, -2.4 + i * 0.6, 0.135, -0.6, 0.025, 0x5aa0ff);
  k.box(3.6, 0.018, 1.2, 0x7f7c75, -0.75, 0.12, 0.0, { tex: 'concrete', flat: true });
  for (const x of [-1.95, -0.45, 0.6]) {
    k.box(0.02, 0.004, 0.9, C.hazard, x, 0.131, 0.05, { flat: true });
    k.box(0.3, 0.004, 0.02, C.hazard, x, 0.131, -0.4, { flat: true });
  }
  // Terminal: glass walls under a long curved roof with a team stripe; jet bridges to the stands.
  const tz = 1.0;
  k.block(3.5, 0.06, 0.82, C.concrete, -0.75, 0.11, tz, { tex: 'concrete' });
  k.block(3.4, 0.5, 0.72, 0xdfe3e6, -0.75, 0.17, tz, { tex: 'panels' });
  ribbon(k, -0.75, 0.42, tz - 0.365, 3.3, 0.36, '-z', 0.35, HT.glass, 16);
  ribbon(k, -0.75, 0.42, tz + 0.365, 3.3, 0.36, 'z', 0.35, HT.glass, 16);
  const roof = new THREE.CylinderGeometry(1, 1, 3.56, 10, 1, false, -Math.PI / 2, Math.PI);
  roof.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.18, 0.5);
  k.add(roof, 0xe8ecef, -0.75, 0.67, tz, { tex: 'panels', flat: true });
  k.box(3.58, 0.05, 0.9, t.main, -0.75, 0.67, tz, { flat: true });
  for (const x of [-2.1, -1.2, -0.3, 0.6]) hvac(k, x, 0.82, tz, 0.2, 0.14, 0xd0d4d8);
  k.box(1.2, 0.03, 0.3, 0xe8ecef, -0.75, 0.52, tz + 0.5, { surface: 'metal', bevel: 0.01 });
  for (const x of [-1.25, -0.25]) k.cyl(0.015, 0.015, 0.4, 5, 0x8c939a, x, 0.32, tz + 0.6);
  sign(k, -0.75, 0.6, tz + 0.66, 0.6, 0.08, t.main);
  // Two airliners at their stands, nose to the terminal, with jet bridges.
  for (const x of [-1.95, -0.45]) {
    airliner(k, x, -0.2, 1.3, t.main);
    beam(k, [x + 0.42, 0.4, tz - 0.36], [x + 0.14, 0.33, 0.42], 0.09, 0xc8ccd0);
    k.block(0.04, 0.22, 0.04, 0x5b6168, x + 0.24, 0.11, 0.52, {});
    k.box(0.1, 0.05, 0.12, 0x3a3f44, x + 0.24, 0.35, 0.52, {});
  }
  truck(k, 0.55, 0.05, 0xe8e4dc, 0xe8e4dc, false, 'tank');
  // Control tower: a tapering shaft, a glazed cab with a team roof, a mast and a beacon.
  const cx = 1.45;
  const cz = 1.3;
  k.block(0.5, 0.3, 0.44, 0xdfe3e6, cx, 0.11, cz, { tex: 'panels', bevel: 0.02 });
  ribbon(k, cx, 0.3, cz + 0.221, 0.4, 0.1, 'z', 0.4, HT.glass, 4);
  k.cyl(0.11, 0.15, 1.7, 10, 0xe8ecef, cx, 0.41 + 0.85, cz, { tex: 'panels' });
  k.cyl(0.24, 0.16, 0.1, 10, 0xd0d4d8, cx, 2.15, cz, { surface: 'metal' });
  k.cyl(0.27, 0.24, 0.2, 10, HT.glass, cx, 2.3, cz, { surface: 'glass', glow: 0.45 });
  k.cyl(0.29, 0.29, 0.04, 10, t.main, cx, 2.42, cz, { bevel: 0.01 });
  k.cyl(0.2, 0.26, 0.06, 10, 0xd0d4d8, cx, 2.47, cz, { surface: 'metal' });
  k.cyl(0.008, 0.012, 0.4, 4, C.metalDark, cx + 0.08, 2.7, cz);
  const f = k.part('flare', [cx + 0.08, 2.92, cz]);
  light(f, 0, 0, 0, 0.045, RED_LIGHT);
  // Radar on its own trestle, turning.
  const rx = 2.55;
  const rzz = 1.45;
  lattice(k, rx, rzz, 0.26, 0.12, 0.7, 0xd0d4d8, { y0: 0.11, bays: 3, m: 0.014 });
  const r = k.part('spin', [rx, 0.83, rzz]);
  r.cyl(0.04, 0.05, 0.08, 6, 0x5b6168, 0, 0.04, 0);
  r.box(0.5, 0.14, 0.03, 0xe8ecef, 0, 0.16, 0.03, { rot: [-0.25, 0, 0], tex: 'panels' });
  r.box(0.52, 0.02, 0.035, t.main, 0, 0.09, 0.05, { flat: true });
  // Hangar: arched, doors toward the taxiway, a light aircraft half out.
  const hx = 1.95;
  const hz = 0.05;
  k.block(1.6, 0.36, 1.1, 0xb8bec4, hx, 0.11, hz, { tex: 'panels' });
  const hg = new THREE.CylinderGeometry(1, 1, 1.12, 12, 1, false, -Math.PI / 2, Math.PI);
  hg.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.42, 0.82);
  k.add(hg, 0x9aa3ab, hx, 0.47, hz, { tex: 'panels', flat: true, rot: [0, Math.PI / 2, 0] });
  for (let i = 0; i < 4; i++) {
    const rg = new THREE.CylinderGeometry(1, 1, 0.035, 12, 1, true, -Math.PI / 2, Math.PI);
    rg.rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.44, 0.83);
    k.add(rg, t.dark, hx, 0.47, hz - 0.5 + i * 0.33, { flat: true, rot: [0, Math.PI / 2, 0] });
  }
  k.box(1.3, 0.5, 0.02, 0x2a2d31, hx, 0.4, hz - 0.55, { flat: true });
  k.box(0.6, 0.5, 0.025, 0x8c939a, hx - 0.45, 0.4, hz - 0.56, { tex: 'panels', surface: 'metal' });
  k.box(1.36, 0.06, 0.03, t.main, hx, 0.7, hz - 0.57, { flat: true });
  airliner(k, hx + 0.2, hz - 0.65, 0.55, t.main, 0.12);
  // Landside: car park, a road, a windsock by the runway.
  k.box(2.6, 0.01, 0.4, C.asphalt, -0.75, 0.115, 1.72, { flat: true, tex: 'concrete' });
  for (let i = 0; i < 6; i++) car(k, -1.8 + i * 0.42, 1.72, [0xc0392b, 0xecf0f1, 0x34495e, 0x2e86c1, 0x27ae60, 0xecf0f1][i]!, false);
  k.cyl(0.008, 0.01, 0.5, 4, 0xe8e4dc, 2.7, 0.36, -0.95);
  k.cone(0.04, 0.22, 6, 0xff7a2a, 2.8, 0.58, -0.95, { rot: [0, 0, -Math.PI / 2 + 0.25] });
  return k.build();
}

/** Military supply depot: sandbags, tents, crates and fuel drums, a camouflaged lorry, a flag and a radio mast. */
function supplyDepot(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 3, 3, 0x8a8460);
  k.box(0.6, 0.01, 2.9, 0x7a7454, 0.35, 0.115, 0, { tex: 'concrete', flat: true });
  // Sandbag walls round the front and sides, with a gate gap and a barrier.
  sandbags(k, -0.6, 1.38, 1.6, true, 2);
  sandbags(k, 1.05, 1.38, 0.7, true, 2);
  sandbags(k, -1.38, 0.0, 2.6, false, 2);
  sandbags(k, 1.38, 0.0, 2.6, false, 2);
  k.block(0.05, 0.22, 0.05, 0xd8d4c8, 0.62, 0.11, 1.4, {});
  k.box(0.5, 0.03, 0.03, 0xc8362a, 0.38, 0.3, 1.4, { flat: true });
  for (let i = 0; i < 3; i++) k.box(0.06, 0.031, 0.031, 0xf0f0ea, 0.2 + i * 0.13, 0.3, 1.4, { flat: true });
  // Tents: a long ridge tent and a smaller one, olive with darker ends and guy ropes.
  for (const [x, z, w, d, h] of [[-0.65, -0.85, 1.2, 0.7, 0.5], [-0.75, 0.15, 0.8, 0.6, 0.42]] as const) {
    k.block(w, 0.06, d, tint(OLIVE, 0.85), x, 0.11, z, {});
    k.gable(w, d, h, OLIVE, x, 0.17, z, { over: 0.04, tex: 'planks' });
    k.box(0.02, h * 0.7, d * 0.4, tint(OLIVE, 0.6), x + w / 2 + 0.01, 0.17 + h * 0.35, z, { flat: true });
    for (const s of [-1, 1]) for (const e of [-1, 1]) strut(k, [x + e * w * 0.4, 0.17, z + s * (d / 2 + 0.04)], [x + e * w * 0.4, 0.12, z + s * (d / 2 + 0.2)], 0.004, 0xd8d4c8, 3);
  }
  // Crates, ammunition boxes and drums.
  crates(k, 0.25, -1.2, 8, 0x6a6a3a);
  for (let i = 0; i < 6; i++) k.block(0.16, 0.08, 0.09, 0x4a5a32, 0.85 + (i % 2) * 0.18, 0.11 + Math.floor(i / 2) * 0.08, -1.2, { bevel: 0.01 });
  for (let i = 0; i < 7; i++) {
    const x = 0.85 + (i % 4) * 0.12;
    const z = -0.65 + Math.floor(i / 4) * 0.12;
    k.cyl(0.05, 0.05, 0.15, 8, i % 3 ? 0x3f4a2a : 0x8a2a22, x, 0.185, z, { surface: 'metal' });
    k.cyl(0.052, 0.052, 0.012, 8, C.metalDark, x, 0.22, z, { flat: true });
  }
  // Fuel bladder.
  k.add(new THREE.SphereGeometry(0.3, 10, 5).scale(1.4, 0.3, 1), 0x2a2e33, 0.9, 0.17, 0.1, { flat: true, surface: 'gloss' });
  k.cylX(0.015, 0.4, 5, 0x1e2022, 0.45, 0.13, 0.1);
  // Camouflage net on poles over a lorry.
  truck(k, 0.15, 0.85, OLIVE, tint(OLIVE, 0.9), true, 'flat');
  crates(k, 0.0, 0.8, 2, 0x6a6a3a);
  for (const [x, z] of [[-0.3, 0.55], [0.6, 0.55], [-0.3, 1.15], [0.6, 1.15]] as const) k.block(0.025, 0.45, 0.025, C.timberDark, x, 0.11, z, {});
  for (let i = 0; i < 4; i++) k.box(0.36, 0.015, 0.7, i % 2 ? 0x4a5a32 : 0x5d6a3c, -0.17 + i * 0.22, 0.56 + (i % 2) * 0.02, 0.85, { flat: true, rot: [0, 0, (i % 2 ? 1 : -1) * 0.08] });
  // Flag, radio mast with a whip and a small dish, a generator, a lamp.
  flag(k, 1.15, 1.1, 1.1, t.main);
  k.cyl(0.012, 0.02, 1.4, 5, 0x5b6168, -1.15, 0.81, -1.15, { surface: 'metal' });
  for (const [dx, dz] of [[0.35, 0.2], [-0.2, 0.35]] as const) strut(k, [-1.15, 1.3, -1.15], [-1.15 + dx, 0.12, -1.15 + dz], 0.003, C.metalDark, 3);
  light(k, -1.15, 1.53, -1.15, 0.03, RED_LIGHT);
  k.add(new THREE.SphereGeometry(0.1, 8, 3, 0, Math.PI * 2, 0, 0.9), 0xd8d4c8, -0.95, 0.4, -1.15, { rot: [-1.1, 0, 0], flat: true });
  k.block(0.22, 0.16, 0.14, 0x4a5a32, -1.05, 0.11, -0.5, { bevel: 0.015 });
  k.box(0.08, 0.06, 0.01, 0x1e2022, -1.05, 0.2, -0.43, { flat: true });
  k.cyl(0.012, 0.012, 0.1, 5, C.metalDark, -0.98, 0.32, -0.52);
  lamp(k, 0.75, 1.25, 0.55);
  return k.build();
}

export const INFRA_MODELS: Record<string, ModelFn> = {
  power_plant: powerPlant,
  hydro_plant: hydroPlant,
  nuclear_plant: nuclearPlant,
  wind_farm: windFarm,
  solar_farm: solarFarm,
  battery_storage: batteryStorage,
  pumping_station: pumpingStation,
  water_well: waterWell,
  water_tower: waterTower,
  warehouse,
  construction_office: constructionOffice,
  maintenance_depot: maintenanceDepot,
  trade_port: tradePort,
  coast_guard: coastGuard,
  river_dock: riverDock,
  rail_station: railStation,
  airport,
  supply_depot: supplyDepot,
  fusion_plant: fusionPlant,
  shield_generator: shieldGenerator,
  mech_foundry: mechFoundry,
  launch_site: launchSite,
  orbital_relay: orbitalRelay,
  space_elevator: spaceElevator,
};

// ---------------------------------------------------------------------------
// Late ages: white composite panels, glass, light.

/** A high-tech lot: pale composite paving with dark seams and a lit kerb. */
function techLot(k: Kit, w: number, d: number, accent: number): void {
  k.box(w - 0.04, 0.08, d - 0.04, 0x8a9096, 0, 0.04, 0, { tex: 'concrete', flat: true });
  k.box(w - 0.14, 0.03, d - 0.14, 0xc4c9ce, 0, 0.095, 0, { tex: 'panels', flat: true });
  for (const s of [-1, 1]) {
    k.box(w - 0.1, 0.012, 0.025, accent, 0, 0.085, s * (d / 2 - 0.05), { glow: 0.5, flat: true });
    k.box(0.025, 0.012, d - 0.1, accent, s * (w / 2 - 0.05), 0.085, 0, { glow: 0.5, flat: true });
  }
}

/** A white composite block with a dark plinth, a glass ribbon on its +z and +x faces and a lit team stripe. */
function techBlock(k: Kit, w: number, h: number, d: number, x: number, z: number, t: { main: number; light: number }, y0 = 0.11, bands = 1): void {
  k.block(w + 0.04, 0.06, d + 0.04, HT.trim, x, y0, z, { bevel: 0.015, surface: 'metal' });
  k.block(w, h, d, HT.panel, x, y0 + 0.06, z, { tex: 'panels', bevel: 0.03, edge: 1.15 });
  for (let i = 0; i < bands; i++) {
    const y = y0 + 0.06 + ((i + 0.6) * h) / (bands + 0.3);
    ribbon(k, x, y, z + d / 2 + 0.006, w - 0.12, Math.min(0.12, h / (bands * 2.4)), 'z', 0.45, HT.glass, Math.max(2, Math.round(w / 0.2)));
    ribbon(k, x + w / 2 + 0.006, y, z, d - 0.12, Math.min(0.12, h / (bands * 2.4)), 'x', 0.45, HT.glass, Math.max(2, Math.round(d / 0.2)));
  }
  k.box(w + 0.01, 0.025, d + 0.01, t.light, x, y0 + 0.06 + h - 0.06, z, { glow: 0.7, flat: true });
}

/** Fusion plant: a tokamak in an open ring hall (its plasma pulses), cryo tanks, radiator fins, a control block. */
function fusionPlant(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  techLot(k, 5, 5, t.light);
  const cx = -0.45;
  const cz = -0.45;
  // Ring hall: a low white drum with a lit band, open on top; a service ring on four pylons above it.
  k.cyl(1.55, 1.6, 0.08, 28, HT.trim, cx, 0.15, cz, { surface: 'metal' });
  k.add(new THREE.CylinderGeometry(1.5, 1.52, 0.5, 28, 1, true), HT.panel, cx, 0.44, cz, { tex: 'panels', flat: true });
  const inner = new THREE.CylinderGeometry(1.42, 1.42, 0.5, 28, 1, true);
  inner.scale(-1, 1, 1);
  k.add(inner, HT.panelShade, cx, 0.44, cz, { flat: true });
  ring(k, cx, 0.69, cz, 1.46, 0.05, 0xf4f6f8, 28);
  k.add(new THREE.CylinderGeometry(1.525, 1.525, 0.05, 28, 1, true), t.light, cx, 0.5, cz, { glow: 0.8, flat: true });
  k.cyl(1.42, 1.42, 0.02, 28, 0x3a4048, cx, 0.2, cz, { tex: 'panels' });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = cx + Math.cos(a) * 1.62;
    const pz = cz + Math.sin(a) * 1.62;
    k.block(0.16, 1.9, 0.16, HT.panel, px, 0.11, pz, { bevel: 0.03, taper: 0.3, tex: 'panels' });
    k.box(0.04, 1.2, 0.17, t.light, px, 1.0, pz, { glow: 0.7, rot: [0, -a, 0] });
    light(k, px, 2.04, pz, 0.05, HT.red);
  }
  ring(k, cx, 1.95, cz, 1.62, 0.06, 0xe8ecef, 28, { surface: 'metal' });
  ring(k, cx, 1.95, cz, 1.62, 0.02, t.light, 28, { glow: 0.8 });
  // The tokamak: a steel vessel cut away on the camera side, D-coils round it, a central solenoid.
  const R = 0.88;
  const ty = 0.62;
  k.add(new THREE.TorusGeometry(R, 0.3, 8, 24, Math.PI * 1.5), 0x9aa4ae, cx, ty, cz, { rot: [Math.PI / 2, 0, Math.PI / 2], surface: 'metal' });
  for (const a of [Math.PI / 2, Math.PI * 2]) {
    k.add(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 10), 0x6a747e, cx + Math.cos(a) * R, ty, cz - Math.sin(a) * R, { rot: [0, -a, Math.PI / 2], flat: true });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const show = !(Math.cos(a) > 0.15 && Math.sin(a) > 0.15);
    k.add(new THREE.TorusGeometry(0.36, 0.045, 3, 10), show ? 0x2f4f8f : 0x3a6ab0, cx + Math.cos(a) * R, ty, cz + Math.sin(a) * R, { rot: [0, -a, 0], surface: 'metal', flat: true });
  }
  k.cyl(0.26, 0.28, 0.9, 12, 0x5b6570, cx, 0.2 + 0.45, cz, { surface: 'metal', bevel: 0.02 });
  for (const y of [0.45, 0.7, 0.95]) k.cyl(0.285, 0.285, 0.04, 12, t.light, cx, y, cz, { glow: 0.9 });
  const p = k.part('flare', [cx, ty, cz]);
  p.add(new THREE.TorusGeometry(R, 0.11, 6, 32), 0xff7ae8, 0, 0, 0, { rot: [Math.PI / 2, 0, 0], glow: 1, flat: true });
  p.add(new THREE.TorusGeometry(R, 0.17, 6, 32, Math.PI / 2), 0xffc0f4, 0, 0, 0, { rot: [Math.PI / 2, 0, 0], glow: 0.6, flat: true });
  // Cryoplant: spherical tanks and two tall dewars, linked to the hall by pipes.
  for (const [x, z, r] of [[1.55, -1.85, 0.32], [2.0, -1.2, 0.26]] as const) sphereTankHT(k, x, z, r);
  for (const [x, z] of [[1.45, -0.85], [1.85, -0.55]] as const) {
    k.cyl(0.16, 0.16, 0.9, 12, HT.panel, x, 0.11 + 0.45, z, { tex: 'panels', bevel: 0.02 });
    k.dome(0.16, HT.panel, x, 1.01, z, 12);
    k.cyl(0.165, 0.165, 0.04, 12, t.light, x, 0.85, z, { glow: 0.7 });
  }
  for (const z of [-1.3, -1.1]) k.cylX(0.035, 1.2, 6, 0xd0d6dc, 0.85, 0.3, z, { surface: 'metal' });
  // Heat radiators along the west side: tall white fins with lit edges.
  for (let i = 0; i < 7; i++) {
    const z = -2.0 + i * 0.32;
    k.block(0.42, 0.75, 0.04, HT.panel, -2.15, 0.11, z, { tex: 'panels', bevel: 0.01 });
    k.box(0.44, 0.02, 0.045, t.light, -2.15, 0.84, z, { glow: 0.8 });
  }
  k.block(0.5, 0.08, 2.1, HT.trim, -2.15, 0.11, -1.04, { surface: 'metal' });
  // Control block with a glass front, a roof terrace, a lit team logo; a power converter yard.
  techBlock(k, 1.5, 0.75, 0.9, 1.45, 1.55, t, 0.11, 2);
  k.block(0.6, 0.3, 0.5, HT.panel, 1.75, 0.92, 1.45, { tex: 'panels', bevel: 0.03 });
  ribbon(k, 1.75, 1.07, 1.706, 0.5, 0.14, 'z', 0.5, HT.glass, 4);
  k.cyl(0.16, 0.16, 0.02, 12, t.main, 1.05, 0.93, 1.55, { glow: 0.4 });
  k.cyl(0.1, 0.1, 0.024, 12, 0xffffff, 1.05, 0.935, 1.55, { glow: 0.8 });
  for (let i = 0; i < 4; i++) {
    const x = -1.9 + i * 0.4;
    k.block(0.28, 0.32, 0.5, 0x3a4048, x, 0.11, 1.75, { bevel: 0.02, surface: 'metal' });
    k.box(0.22, 0.03, 0.51, t.light, x, 0.36, 1.75, { glow: 0.8 });
    k.box(0.12, 0.06, 0.02, HT.cyan, x, 0.22, 2.005, { glow: 0.9 });
  }
  for (let i = 0; i < 3; i++) k.box(0.05, 0.012, 1.05, HT.cyan, -1.3 + i * 0.12, 0.112, 0.92, { glow: 0.9, flat: true });
  k.block(0.08, 1.3, 0.08, HT.panel, -0.3, 0.11, 2.05, { bevel: 0.02, taper: 0.3 });
  k.box(0.6, 0.04, 0.06, HT.panel, -0.3, 1.35, 2.05, { bevel: 0.01 });
  for (const s of [-1, 1]) light(k, -0.3 + s * 0.27, 1.32, 2.05, 0.035, HT.cyan);
  return k.build();
}

/** A white spherical tank on a ring base (late-age cryogenics). */
function sphereTankHT(k: Kit, x: number, z: number, r: number): void {
  k.cyl(r * 0.7, r * 0.8, 0.18, 12, HT.trim, x, 0.2, z, { surface: 'metal', bevel: 0.02 });
  k.sphere(r, HT.panel, x, 0.29 + r * 0.9, z, 14, { surface: 'gloss' });
  k.add(new THREE.TorusGeometry(r * 1.0, 0.012, 3, 20), HT.panelShade, x, 0.29 + r * 0.9, z, { rot: [Math.PI / 2, 0, 0], flat: true });
}

/** Shield generator: an octagonal plinth, four emitter blades leaning in, a stacked core, a pulsing orb. */
function shieldGenerator(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  techLot(k, 2, 2, t.light);
  k.add(new THREE.CylinderGeometry(0.82, 0.88, 0.14, 8, 1).rotateY(Math.PI / 8), HT.trim, 0, 0.18, 0, { surface: 'metal' });
  k.add(new THREE.CylinderGeometry(0.72, 0.8, 0.08, 8, 1).rotateY(Math.PI / 8), HT.panel, 0, 0.29, 0, { tex: 'panels' });
  k.add(new THREE.TorusGeometry(0.62, 0.02, 3, 8).rotateZ(Math.PI / 8), t.light, 0, 0.335, 0, { rot: [Math.PI / 2, 0, 0], glow: 1, flat: true });
  // Emitter blades at the four diagonals, leaning toward the orb, each tipped with a light.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const bx = ca * 0.62;
    const bz = sa * 0.62;
    k.block(0.2, 0.08, 0.2, HT.trim, bx, 0.33, bz, { bevel: 0.02, rot: [0, -a, 0] });
    const lean = 0.32;
    const h = 1.05;
    const mx = bx - ca * Math.sin(lean) * h * 0.5;
    const mz = bz - sa * Math.sin(lean) * h * 0.5;
    k.box(0.12, h, 0.06, HT.panel, mx, 0.41 + Math.cos(lean) * h * 0.5, mz, { rot: [0, -a, lean], bevel: 0.02, taper: 0.4, tex: 'panels' });
    k.box(0.03, h * 0.8, 0.065, t.light, mx - ca * 0.01, 0.41 + Math.cos(lean) * h * 0.45, mz - sa * 0.01, { rot: [0, -a, lean], glow: 0.9 });
    const tx = bx - ca * Math.sin(lean) * h;
    const tz = bz - sa * Math.sin(lean) * h;
    k.sphere(0.05, HT.cyan, tx, 0.41 + Math.cos(lean) * h + 0.02, tz, 8, { glow: 1 });
  }
  // Core column: stacked drums with lit rings, a cradle for the orb.
  k.cyl(0.26, 0.32, 0.3, 10, HT.trim, 0, 0.48, 0, { surface: 'metal', bevel: 0.02 });
  k.cyl(0.16, 0.22, 0.5, 10, HT.panel, 0, 0.88, 0, { tex: 'panels', bevel: 0.02 });
  for (const y of [0.72, 0.9, 1.06]) k.cyl(0.2 - (y - 0.72) * 0.15, 0.2 - (y - 0.72) * 0.15, 0.03, 10, t.light, 0, y, 0, { glow: 0.9 });
  k.cyl(0.24, 0.12, 0.12, 10, HT.trim, 0, 1.19, 0, { surface: 'metal' });
  const o = k.part('flare', [0, 1.55, 0]);
  o.sphere(0.24, 0x9fd8ff, 0, 0, 0, 14, { glow: 1, surface: 'glass' });
  o.add(new THREE.TorusGeometry(0.34, 0.012, 3, 24), HT.cyan, 0, 0, 0, { rot: [1.2, 0.3, 0], glow: 1, flat: true });
  o.add(new THREE.TorusGeometry(0.3, 0.012, 3, 24), t.light, 0, 0, 0, { rot: [1.9, -0.5, 0], glow: 1, flat: true });
  // Capacitor banks and conduits.
  for (const [x, z] of [[0.75, -0.2], [-0.2, 0.75]] as const) {
    k.block(0.16, 0.2, 0.16, HT.trim, x, 0.11, z, { bevel: 0.02, surface: 'metal' });
    k.box(0.17, 0.03, 0.17, HT.cyan, x, 0.25, z, { glow: 0.9 });
  }
  return k.build();
}

/** A walking mech for the foundry yard, facing +z, feet on y0, height about 1.7 (scale s). */
function mech(k: Kit, x: number, z: number, t: { main: number; dark: number; light: number }, y0 = 0.11, s = 1): void {
  const G = 0x8f979f;
  const D = 0x4a5058;
  // Legs: feet, shins, knees, thighs.
  for (const sg of [-1, 1]) {
    const lx = x + sg * 0.22 * s;
    k.block(0.2 * s, 0.07 * s, 0.32 * s, D, lx, y0, z + 0.03 * s, { bevel: 0.02 * s });
    k.block(0.14 * s, 0.42 * s, 0.16 * s, G, lx, y0 + 0.07 * s, z, { bevel: 0.02 * s, taper: -0.1 });
    k.box(0.15 * s, 0.1 * s, 0.06 * s, t.main, lx, y0 + 0.3 * s, z + 0.09 * s, { bevel: 0.015 * s });
    k.sphere(0.08 * s, D, lx, y0 + 0.52 * s, z + 0.02 * s, 8, {});
    k.block(0.16 * s, 0.36 * s, 0.18 * s, G, lx, y0 + 0.55 * s, z - 0.02 * s, { bevel: 0.03 * s, taper: 0.15 });
  }
  // Hips, torso with team armour, cockpit visor, back pack.
  k.block(0.56 * s, 0.14 * s, 0.26 * s, D, x, y0 + 0.88 * s, z, { bevel: 0.03 * s });
  k.block(0.62 * s, 0.38 * s, 0.44 * s, t.main, x, y0 + 1.0 * s, z, { bevel: 0.06 * s, taper: -0.08, surface: 'gloss' });
  k.box(0.36 * s, 0.07 * s, 0.03 * s, 0xffb347, x, y0 + 1.25 * s, z + 0.23 * s, { glow: 1 });
  k.block(0.4 * s, 0.24 * s, 0.18 * s, G, x, y0 + 1.04 * s, z - 0.28 * s, { bevel: 0.03 * s });
  for (const sg of [-1, 1]) k.cyl(0.04 * s, 0.05 * s, 0.12 * s, 6, D, x + sg * 0.12 * s, y0 + 1.0 * s, z - 0.4 * s, { rot: [Math.PI / 2, 0, 0] });
  // Shoulders: a missile pod on the left, a cannon arm on the right.
  k.block(0.26 * s, 0.2 * s, 0.32 * s, G, x - 0.44 * s, y0 + 1.22 * s, z, { bevel: 0.03 * s });
  for (let i = 0; i < 4; i++) k.box(0.05 * s, 0.05 * s, 0.01 * s, D, x - 0.5 * s + (i % 2) * 0.1 * s, y0 + 1.3 * s + Math.floor(i / 2) * 0.07 * s - 0.04 * s, z + 0.165 * s, { flat: true });
  k.block(0.2 * s, 0.34 * s, 0.2 * s, G, x + 0.44 * s, y0 + 0.86 * s, z, { bevel: 0.03 * s });
  k.sphere(0.11 * s, t.dark, x + 0.44 * s, y0 + 1.22 * s, z, 8, {});
  k.cylZ(0.05 * s, 0.5 * s, 8, D, x + 0.44 * s, y0 + 0.9 * s, z + 0.3 * s, {});
  k.cylZ(0.065 * s, 0.1 * s, 8, G, x + 0.44 * s, y0 + 0.9 * s, z + 0.55 * s);
}

/** Mech foundry: a dark steel assembly hall with a lit bay, a mech in a scaffold under a gantry crane, parts racks. */
function mechFoundry(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 5, 5, 0x8c8a84);
  k.box(4.8, 0.01, 2.2, 0x55595e, 0, 0.115, 1.2, { tex: 'concrete', flat: true });
  for (let i = 0; i < 18; i++) k.box(0.13, 0.006, 0.05, i % 2 ? 0x222222 : C.hazard, -2.1 + i * 0.13, 0.122, 0.12, { flat: true });
  // Assembly hall: dark steel with ribs, team bands, a sawtooth glazed roof, and a tall open bay door.
  const hx = -0.4;
  const hz = -1.25;
  const W = 3.9;
  const D = 2.1;
  const H = 1.5;
  const G = 0x7d858d;
  k.block(W + 0.06, 0.08, D + 0.06, 0x3a3f44, hx, 0.11, hz, { bevel: 0.02 });
  k.block(W, H, D, G, hx, 0.19, hz, { tex: 'panels' });
  for (let i = 0; i <= 10; i++) k.block(0.06, H, 0.05, 0x5f666e, hx - W / 2 + i * (W / 10), 0.19, hz + D / 2 + 0.01, { bevel: 0.01 });
  k.box(W + 0.02, 0.14, D + 0.02, t.main, hx, 0.19 + H - 0.2, hz, { flat: true });
  k.box(W + 0.03, 0.03, D + 0.03, t.light, hx, 0.19 + H - 0.28, hz, { glow: 0.7, flat: true });
  for (let i = 0; i < 5; i++) {
    const z = hz - D / 2 + 0.22 + i * 0.42;
    k.box(W, 0.04, 0.46, 0x9aa1a8, hx, 0.19 + H + 0.12, z, { rot: [-0.5, 0, 0], tex: 'panels', bevel: 0.01 });
    k.box(W - 0.1, 0.18, 0.02, 0x9fc8e8, hx, 0.19 + H + 0.1, z + 0.2, { glow: 0.45, surface: 'glass' });
  }
  const bx = hx + 0.55;
  k.box(1.5, 1.2, 0.03, 0x1a1c1f, bx, 0.79, hz + D / 2 + 0.02, { flat: true });
  for (let i = 0; i < 3; i++) light(k, bx - 0.5 + i * 0.5, 1.3, hz + D / 2 + 0.035, 0.08, 0xfff0c0);
  for (const s of [-1, 1]) for (let j = 0; j < 6; j++) k.box(0.06, 0.2, 0.04, j % 2 ? 0x222222 : C.hazard, bx + s * 0.78, 0.29 + j * 0.2, hz + D / 2 + 0.03, { flat: true });
  k.box(1.62, 0.1, 0.06, C.hazard, bx, 1.44, hz + D / 2 + 0.04, { bevel: 0.01 });
  sign(k, hx - 1.25, 1.2, hz + D / 2 + 0.035, 0.9, 0.16, t.main);
  hvac(k, hx - 1.4, 0.19 + H + 0.02, hz - 0.6, 0.32, 0.22);
  hvac(k, hx + 1.4, 0.19 + H + 0.02, hz - 0.6, 0.32, 0.22);
  chimney(k, 1.95, -2.05, 2.6, 0.17, 0x3c4146, 0.11);
  k.cyl(0.18, 0.18, 0.08, 10, t.main, 1.95, 2.4, -2.05, { flat: true });
  // Yard: a gantry crane parked behind the mech bay, on two portal frames.
  const gz = 0.75;
  for (const x of [-1.95, 0.85]) {
    for (const z of [gz - 0.3, gz + 0.3]) {
      k.block(0.12, 0.06, 0.12, 0x3a3f44, x, 0.11, z, {});
      k.block(0.09, 2.5, 0.09, C.hazard, x, 0.17, z, { bevel: 0.01 });
    }
    k.box(0.12, 0.12, 0.74, C.hazard, x, 2.7, gz, { bevel: 0.015 });
    beam(k, [x, 0.5, gz - 0.3], [x, 2.2, gz + 0.3], 0.03, C.hazard);
    for (let j = 0; j < 4; j++) k.box(0.1, 0.1, 0.02, j % 2 ? 0x222222 : C.hazard, x, 0.3 + j * 0.1, gz + 0.35, { flat: true });
  }
  for (const z of [gz - 0.15, gz + 0.15]) k.box(2.95, 0.16, 0.09, C.hazard, -0.55, 2.8, z, { bevel: 0.015 });
  k.block(0.34, 0.14, 0.42, 0x3a3f44, -0.75, 2.72, gz, { bevel: 0.015 });
  k.cyl(0.006, 0.006, 0.6, 3, C.metalDark, -0.75, 2.42, gz + 0.1);
  k.box(0.12, 0.08, 0.08, C.hazard, -0.75, 2.1, gz + 0.1, {});
  light(k, -0.75, 2.66, gz + 0.22, 0.05, 0xff8a2a);
  // The mech in front of the crane, between two scaffold towers; sparks at the welds.
  const mx = -0.55;
  const mz = 1.5;
  mech(k, mx, mz, t, 0.12, 1.3);
  for (const s of [-1, 1]) {
    const sx = mx + s * 0.92;
    lattice(k, sx, mz, 0.24, 0.24, 1.75, 0x8c939a, { y0: 0.11, bays: 5, m: 0.012 });
    for (const y of [0.7, 1.3]) k.box(0.34, 0.025, 0.34, 0x6a6e72, sx, 0.11 + y, mz, { tex: 'panels' });
    railing(k, sx, 1.43, mz + 0.17, 0.34, true, C.hazard, 0.06);
    k.box(0.4, 0.02, 0.14, 0x6a6e72, mx + s * 0.62, 1.41, mz, { tex: 'panels' });
  }
  for (const [x, y, z] of [[mx + 0.42, 1.25, mz + 0.42], [mx - 0.3, 0.75, mz + 0.3], [mx + 0.2, 1.75, mz + 0.35]] as const) {
    light(k, x, y, z, 0.045, 0xfff4c0);
    for (let i = 0; i < 4; i++) light(k, x + (i - 1.5) * 0.035, y - 0.03 - i * 0.025, z + 0.03 + (i % 2) * 0.02, 0.015, 0xff9a30);
  }
  // Parts racks: armour plates, a spare leg, a stack of missile pods; a test-fire berm on the east side.
  for (let i = 0; i < 4; i++) k.box(0.5, 0.04, 0.34, i % 2 ? t.main : 0x6a7078, 1.65, 0.14 + i * 0.045, 0.6, { bevel: 0.01, rot: [0, 0.1 * i, 0] });
  k.block(0.06, 0.04, 0.8, 0x3a3f44, 1.55, 0.11, 1.5, {});
  k.block(0.06, 0.04, 0.8, 0x3a3f44, 1.85, 0.11, 1.5, {});
  k.cylZ(0.08, 0.6, 8, 0x5b6168, 1.7, 0.24, 1.5, {});
  k.block(0.22, 0.12, 0.3, 0x2f343a, 1.7, 0.15, 1.95, { bevel: 0.02 });
  for (let i = 0; i < 3; i++) {
    k.block(0.3, 0.16, 0.24, 0x5b6168, 2.15, 0.11 + i * 0.165, 0.4 + (i % 2) * 0.05, { bevel: 0.02 });
    k.box(0.22, 0.1, 0.01, 0x2f343a, 2.15, 0.19 + i * 0.165, 0.525 + (i % 2) * 0.05, { flat: true });
  }
  floodMast(k, 2.3, 2.3, 1.4, 0.11, Math.PI / 4);
  floodMast(k, -2.3, 2.3, 1.4, 0.11, -Math.PI / 4);
  flag(k, -2.2, 0.35, 1.2, t.main);
  return k.build();
}

/** A multi-stage rocket standing on y0 at (x, z): boosters, core, upper stage, a team fairing; about 3.4 tall. */
function rocket(k: Kit, x: number, z: number, y0: number, t: { main: number; dark: number }): void {
  const W = 0xf2f2ee;
  const r = 0.2;
  k.cyl(r, r, 1.8, 14, W, x, y0 + 0.9 + 0.1, z, { surface: 'gloss' });
  k.cyl(r * 1.01, r * 1.01, 0.12, 14, 0x2a2d31, x, y0 + 1.55, z, { flat: true });
  k.cyl(r * 1.01, r * 1.01, 0.06, 14, t.main, x, y0 + 0.5, z, { flat: true });
  for (let i = 0; i < 3; i++) k.cone(0.07, 0.12, 8, 0x2a2d31, x + (i - 1) * 0.12, y0 + 0.06, z, { rot: [Math.PI, 0, 0], surface: 'metal' });
  // Side boosters with nose cones and fins.
  for (const [dx, dz] of [[0.31, 0], [-0.31, 0]] as const) {
    k.cyl(0.1, 0.1, 1.2, 10, W, x + dx, y0 + 0.7, z + dz, { surface: 'gloss' });
    k.cone(0.1, 0.25, 10, W, x + dx, y0 + 1.42, z + dz, { surface: 'gloss' });
    k.cyl(0.102, 0.102, 0.05, 10, 0x2a2d31, x + dx, y0 + 1.05, z + dz, { flat: true });
    k.cone(0.07, 0.1, 8, 0x2a2d31, x + dx, y0 + 0.06, z + dz, { rot: [Math.PI, 0, 0], surface: 'metal' });
    k.box(0.14, 0.18, 0.012, t.main, x + dx * 1.35, y0 + 0.2, z, { flat: true, taper: 0.3 });
    beam(k, [x + dx * 0.6, y0 + 1.25, z], [x + dx, y0 + 1.25, z], 0.02, 0x8c939a);
  }
  // Upper stage, interstage cone, payload fairing in team colour, the escape tower.
  k.cyl(0.16, r, 0.15, 14, 0xd8dce0, x, y0 + 1.975, z, { surface: 'metal' });
  k.cyl(0.16, 0.16, 0.75, 14, W, x, y0 + 2.42, z, { surface: 'gloss' });
  k.cyl(0.162, 0.162, 0.04, 14, 0x2a2d31, x, y0 + 2.2, z, { flat: true });
  k.cyl(0.19, 0.16, 0.12, 14, t.main, x, y0 + 2.86, z, { surface: 'gloss' });
  k.cyl(0.19, 0.19, 0.35, 14, t.main, x, y0 + 3.1, z, { surface: 'gloss' });
  k.cone(0.19, 0.4, 14, t.main, x, y0 + 3.47, z, { surface: 'gloss' });
  k.cyl(0.012, 0.012, 0.3, 4, 0xd8dce0, x, y0 + 3.8, z);
  k.box(0.01, 0.3, 0.12, t.dark, x + 0.2, y0 + 1.2, z, { flat: true });
}

/** Launch site: a pad with a flame trench, the rocket beside its service tower, lightning masts, fuel spheres, an assembly building. */
function launchSite(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  lot(k, 5, 5, 0x8c8a84);
  // Crawlerway from the assembly building to the pad.
  for (const s of [-1, 1]) k.box(1.0, 0.012, 0.22, 0xb8ad94, 0.0, 0.115, -1.15 + s * 0.2, { tex: 'concrete', flat: true });
  // The pad: a raised concrete hardstand, a flame trench running west, a deflector, a ramp.
  const px = -0.9;
  const pz = -0.9;
  k.block(2.0, 0.26, 2.0, 0xa9a59c, px, 0.11, pz, { tex: 'concrete', bevel: 0.04, taper: 0.04 });
  k.box(1.94, 0.012, 1.94, 0x8a867e, px, 0.375, pz, { tex: 'concrete', flat: true });
  k.box(1.1, 0.02, 0.36, 0x1a1a1a, px - 0.5, 0.375, pz, { flat: true });
  k.box(0.6, 0.12, 0.34, 0x3a3634, px - 1.2, 0.12, pz, { flat: true });
  ring(k, px, 0.39, pz, 0.42, 0.03, C.hazard, 16);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.block(0.08, 0.14, 0.08, 0x5b6168, px + Math.cos(a) * 0.3, 0.38, pz + Math.sin(a) * 0.3, { surface: 'metal' });
  }
  // The rocket and its service tower with swing arms and a crane on top.
  rocket(k, px, pz, 0.45, t);
  const tx = px + 0.62;
  const tz = pz;
  lattice(k, tx, tz, 0.42, 0.42, 3.6, 0xb8402a, { y0: 0.38, bays: 12, m: 0.018 });
  for (const y of [1.2, 2.0, 2.75]) {
    k.box(0.38, 0.04, 0.14, 0x8c939a, tx - 0.3, y + 0.38, tz, { surface: 'metal' });
    k.box(0.46, 0.03, 0.46, 0x8c939a, tx, y + 0.36, tz, { tex: 'panels' });
  }
  k.block(0.5, 0.2, 0.5, 0xd8dce0, tx, 3.98, tz, { bevel: 0.02, tex: 'panels' });
  k.box(0.8, 0.06, 0.08, 0xb8402a, tx - 0.15, 4.25, tz, { surface: 'metal' });
  k.cyl(0.015, 0.02, 0.6, 5, 0x8c939a, tx + 0.1, 4.48, tz + 0.1);
  const f = k.part('flare', [tx + 0.1, 4.8, tz + 0.1]);
  light(f, 0, 0, 0, 0.06, RED_LIGHT);
  // Lightning masts at two pad corners with warning lights.
  for (const [x, z] of [[px - 0.85, pz + 0.85], [px + 0.85, pz - 0.85]] as const) {
    k.cyl(0.025, 0.05, 3.6, 6, 0xd8dce0, x, 0.37 + 1.8, z, { surface: 'metal' });
    for (const y of [1.2, 2.4]) k.cyl(0.055, 0.055, 0.1, 6, 0xc0402a, x, 0.37 + y, z, { flat: true });
    const g = k.part('flare', [x, 4.02, z]);
    light(g, 0, 0, 0, 0.05, RED_LIGHT);
  }
  // Fuel farm: spherical tanks and pipe runs to the pad; a sound-suppression water tank.
  for (const [x, z] of [[-2.05, 0.6], [-1.45, 0.75]] as const) sphereTank(k, x, z, 0.28, 0xf2f2ee);
  for (const z of [0.25, 0.32]) k.cylX(0.025, 1.2, 6, 0xc8ccd0, -1.6, 0.18, z, { surface: 'metal' });
  tank(k, -2.05, -2.0, 0.28, 0.9, 0xd8dce0, t.main, 0.11);
  // Vehicle assembly building: a big white block, a tall door, a team flag painted on its flank.
  const vx = 1.45;
  const vz = -1.45;
  k.block(1.9, 0.06, 1.7, 0x6a6e72, vx, 0.11, vz, { bevel: 0.02 });
  k.block(1.8, 1.9, 1.6, 0xeceeed, vx, 0.17, vz, { tex: 'panels', bevel: 0.04, edge: 1.12 });
  k.box(0.6, 1.6, 0.02, 0x8c939a, vx - 0.35, 0.97, vz + 0.81, { tex: 'panels', surface: 'metal' });
  for (let i = 0; i < 7; i++) k.box(0.6, 0.012, 0.025, 0x6a6e72, vx - 0.35, 0.3 + i * 0.22, vz + 0.82, { flat: true });
  k.box(0.02, 0.8, 1.0, t.main, vx + 0.91, 1.2, vz, { flat: true });
  k.box(0.022, 0.3, 0.45, 0xf2f2ee, vx + 0.912, 1.45, vz - 0.27, { flat: true });
  k.box(0.022, 0.08, 1.0, t.dark, vx + 0.913, 0.75, vz, { flat: true });
  ribbon(k, vx + 0.5, 0.35, vz + 0.808, 0.6, 0.1, 'z', 0.4, HT.glass, 4);
  for (const x of [vx - 0.4, vx + 0.4]) hvac(k, x, 2.07, vz - 0.3, 0.3, 0.2, 0xd0d4d8);
  light(k, vx + 0.85, 2.1, vz + 0.75, 0.05, RED_LIGHT);
  // Mission control: a low bunker with a glass front and a dish; a car park.
  const mx = 1.35;
  const mz = 1.35;
  k.block(1.4, 0.4, 0.9, 0xb9b5ab, mx, 0.11, mz, { tex: 'concrete', bevel: 0.06, taper: 0.06 });
  ribbon(k, mx, 0.32, mz + 0.43, 1.1, 0.12, 'z', 0.5, HT.glass, 8);
  k.box(1.2, 0.04, 0.7, t.main, mx, 0.53, mz, { flat: true });
  k.cyl(0.04, 0.06, 0.3, 6, 0x8c939a, mx + 0.4, 0.66, mz - 0.15);
  k.add(new THREE.SphereGeometry(0.26, 12, 3, 0, Math.PI * 2, 0, 0.8), 0xf2f2ee, mx + 0.4, 0.95, mz - 0.25, { rot: [Math.PI - 0.7, 0, 0], flat: true });
  for (let i = 0; i < 3; i++) car(k, 0.95 + i * 0.3, 0.5, [0xecf0f1, 0x2e86c1, 0xc0392b][i]!, false);
  floodMast(k, 0.3, 0.3, 1.6, 0.11, Math.PI / 4);
  flag(k, -0.3, 1.9, 1.2, t.main);
  return k.build();
}

/** Orbital relay: a great dish on a pedestal (it turns), radomes, a rectenna field, an operations block. */
function orbitalRelay(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  techLot(k, 4, 4, t.light);
  // Rectenna field along the front.
  for (let row = 0; row < 3; row++) panelRow(k, -1.55, 0.95 + row * 0.33, 5, 0.62, 0.52, 0.24, 0x1f3466, -0.55, 0.3);
  for (let i = 0; i < 3; i++) k.box(3.4, 0.008, 0.02, HT.cyan, -0.3, 0.115, 0.82 + i * 0.33, { glow: 0.8, flat: true });
  // Pedestal: a white tower with a lit band and a control cab.
  const dx = 0.15;
  const dz = -0.55;
  k.cyl(0.7, 0.78, 0.12, 12, HT.trim, dx, 0.17, dz, { surface: 'metal' });
  k.cyl(0.42, 0.6, 0.85, 12, HT.panel, dx, 0.655, dz, { tex: 'panels', bevel: 0.03 });
  k.cyl(0.5, 0.5, 0.05, 12, t.light, dx, 0.62, dz, { glow: 0.8 });
  ribbon(k, dx, 0.42, dz + 0.58, 0.4, 0.08, 'z', 0.5, HT.glass, 3);
  k.cyl(0.44, 0.42, 0.06, 12, HT.trim, dx, 1.11, dz, { surface: 'metal' });
  // The dish (turns about y): yoke, a tilted bowl (white inside, ribbed back), the feed on a tripod.
  const s = k.part('spin', [dx, 1.14, dz]);
  s.block(0.5, 0.14, 0.4, HT.panel, 0, 0, 0, { bevel: 0.03, tex: 'panels' });
  for (const sg of [-1, 1]) s.block(0.08, 0.5, 0.2, HT.panelShade, sg * 0.22, 0.12, 0, { bevel: 0.02, tex: 'panels' });
  const tilt = 0.75;
  const hubY = 0.62;
  const R = 1.25;
  const cap = 0.55;
  const bowl = new THREE.SphereGeometry(R, 20, 4, 0, Math.PI * 2, Math.PI - cap, cap);
  bowl.translate(0, R, 0);
  const back = bowl.clone();
  const inside = bowl.clone().scale(-1, 1, 1);
  s.add(back, 0xc8d0d8, 0, hubY, 0, { rot: [tilt, 0, 0], flat: true, surface: 'metal' });
  s.add(inside.scale(0.995, 0.995, 0.995), 0xf4f6f8, 0, hubY + 0.004, 0, { rot: [tilt, 0, 0], flat: true });
  const rimR = R * Math.sin(cap);
  const rimH = R * (1 - Math.cos(cap));
  s.add(new THREE.TorusGeometry(rimR, 0.025, 3, 24), t.main, 0, hubY + Math.cos(tilt) * rimH, Math.sin(tilt) * rimH, { rot: [Math.PI / 2 + tilt, 0, 0], flat: true });
  const feed: [number, number, number] = [0, hubY + Math.cos(tilt) * 0.95, Math.sin(tilt) * 0.95];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const lx = Math.cos(a) * rimR * 0.85;
    const lz0 = Math.sin(a) * rimR * 0.85;
    const ly = hubY + Math.cos(tilt) * rimH - Math.sin(tilt) * lz0;
    const lz = Math.sin(tilt) * rimH + Math.cos(tilt) * lz0;
    strut(s, [lx, ly, lz], feed, 0.012, 0xd0d6dc, 4);
  }
  s.cyl(0.07, 0.05, 0.16, 8, HT.panel, feed[0], feed[1], feed[2], { rot: [tilt, 0, 0] });
  const fl = s.part('flare', [feed[0], feed[1] + 0.1, feed[2]]);
  light(fl, 0, 0, 0, 0.06, HT.cyan);
  // Radomes on their bases, each with a light.
  for (const [x, z, r] of [[-1.35, -1.3, 0.42], [1.45, -1.45, 0.34]] as const) {
    k.cyl(r * 0.85, r * 0.9, 0.3, 10, HT.panelShade, x, 0.26, z, { tex: 'panels', bevel: 0.02 });
    k.add(new THREE.IcosahedronGeometry(r, 1), HT.panel, x, 0.41 + r * 0.55, z, { flat: true, tex: 'panels' });
    light(k, x, 0.41 + r * 1.55, z, 0.04, RED_LIGHT);
  }
  // Operations block with a lit team stripe, a mast with lights.
  techBlock(k, 1.0, 0.5, 0.7, -1.35, -0.2, t, 0.11, 1);
  k.block(0.06, 1.6, 0.06, HT.panel, 1.65, 0.11, -0.3, { taper: 0.4, bevel: 0.01 });
  for (const y of [0.9, 1.4]) k.box(0.3, 0.025, 0.03, HT.panel, 1.65, y, -0.3, { flat: true });
  light(k, 1.65, 1.74, -0.3, 0.045, RED_LIGHT);
  return k.build();
}

/** Space elevator: a great anchor station, a tapering tower, the tether rising out of sight with a climber on it. */
function spaceElevator(team: number): THREE.Group {
  const t = teamOf(team);
  const k = new Kit();
  techLot(k, 6, 6, t.light);
  // Base platform: a 12-sided deck with a dark skirt and lit seams.
  k.cyl(2.75, 2.85, 0.22, 12, HT.trim, 0, 0.22, 0, { surface: 'metal', bevel: 0.03 });
  k.cyl(2.62, 2.7, 0.08, 12, HT.panel, 0, 0.37, 0, { tex: 'panels' });
  k.add(new THREE.TorusGeometry(2.3, 0.025, 3, 12), t.light, 0, 0.415, 0, { rot: [Math.PI / 2, 0, 0], glow: 1, flat: true });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    k.box(0.02, 0.012, 1.0, HT.cyan, Math.cos(a) * 1.75, 0.415, Math.sin(a) * 1.75, { glow: 0.8, flat: true, rot: [0, -a + Math.PI / 2, 0] });
  }
  // Maglev ring on pylons round the tower, in team colour.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.block(0.08, 0.32, 0.08, HT.panelShade, Math.cos(a) * 1.95, 0.41, Math.sin(a) * 1.95, { bevel: 0.01 });
  }
  ring(k, 0, 0.78, 0, 1.95, 0.07, t.main, 32, { surface: 'gloss' });
  ring(k, 0, 0.84, 0, 1.95, 0.025, t.light, 32, { glow: 0.9 });
  // Six station pods round the rim, each with lights and a glass front.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * 2.45;
    const z = Math.sin(a) * 2.45;
    k.add(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 6, 1), HT.panel, x, 0.66, z, { tex: 'panels' });
    k.add(new THREE.CylinderGeometry(0.405, 0.405, 0.08, 6, 1), HT.glass, x, 0.62, z, { glow: 0.5, surface: 'glass' });
    k.add(new THREE.CylinderGeometry(0.3, 0.34, 0.06, 6, 1), HT.trim, x, 0.94, z, { surface: 'metal' });
    light(k, x, 1.0, z, 0.05, i % 2 ? HT.cyan : RED_LIGHT);
  }
  // The anchor tower: stacked tapering drums with glass bands and team rings; buttress fins.
  const secs: Array<[number, number, number]> = [[1.15, 0.95, 0.9], [0.92, 0.72, 0.9], [0.7, 0.52, 0.85], [0.5, 0.36, 0.8]];
  let y = 0.41;
  secs.forEach(([rb, rt, h], i) => {
    k.cyl(rt, rb, h, 12, HT.panel, 0, y + h / 2, 0, { tex: 'panels', bevel: 0.03, edge: 1.12 });
    k.cyl((rb + rt) / 2 + 0.006, (rb + rt) / 2 + 0.03, 0.1, 12, HT.glass, 0, y + h * 0.45, 0, { surface: 'glass', glow: 0.55 });
    k.cyl(rt + 0.02, rt + 0.02, 0.05, 12, i % 2 ? t.main : t.light, 0, y + h - 0.02, 0, { glow: i % 2 ? 0 : 0.8 });
    y += h;
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    prism(k, [[0, 0], [0.75, 0], [0.7, 0.08], [0, 1.75]], 0.09, HT.panelShade, Math.cos(a) * 0.92, 0.41, Math.sin(a) * 0.92, { rot: [0, -a, 0], tex: 'panels' });
    k.box(0.6, 0.02, 0.095, t.light, Math.cos(a) * 1.25, 0.6, Math.sin(a) * 1.25, { rot: [0, -a, -0.6], glow: 0.8 });
  }
  k.cyl(0.2, 0.3, 0.5, 10, HT.trim, 0, y + 0.25, 0, { surface: 'metal' });
  for (const yy of [y + 0.12, y + 0.35]) k.cyl(0.31 - (yy - y) * 0.2, 0.31 - (yy - y) * 0.2, 0.03, 10, HT.cyan, 0, yy, 0, { glow: 1 });
  const b = k.part('flare', [0, y + 0.6, 0]);
  light(b, 0, 0, 0, 0.09, HT.red);
  // The tether: a bright ribbon rising out of sight, a sheath at its foot, guide lights up it.
  k.cyl(0.11, 0.14, 1.2, 8, HT.steel, 0, y + 1.1, 0, { tex: 'panels' });
  k.cyl(0.05, 0.05, 60, 6, 0xe6f8ff, 0, y + 31, 0, { glow: 0.7, surface: 'glass' });
  for (const yy of [6, 12, 20, 30]) light(k, 0, yy, 0, 0.12, HT.cyan);
  // The climber: a hexagonal pod with clamps, lit windows and a team band.
  const cy = 9;
  k.add(new THREE.CylinderGeometry(0.45, 0.5, 0.55, 6), HT.panel, 0, cy, 0, { tex: 'panels' });
  k.add(new THREE.CylinderGeometry(0.505, 0.505, 0.1, 6), HT.glass, 0, cy - 0.05, 0, { glow: 0.6, surface: 'glass' });
  k.add(new THREE.CylinderGeometry(0.46, 0.46, 0.06, 6), t.main, 0, cy + 0.2, 0, {});
  k.add(new THREE.ConeGeometry(0.45, 0.25, 6), HT.panelShade, 0, cy + 0.4, 0, {});
  k.add(new THREE.ConeGeometry(0.5, 0.2, 6).rotateX(Math.PI), HT.trim, 0, cy - 0.37, 0, { surface: 'metal' });
  for (const s of [-1, 1]) light(k, s * 0.3, cy - 0.5, 0, 0.06, HT.cyan);
  return k.build();
}
