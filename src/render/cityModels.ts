// Procedural models for the economy game's buildings. Same conventions as
// buildingModels.ts: centred on the footprint, sitting on y = 0, sized in tiles.
// Named parts animate: 'beam'/'crank' (pumpjacks), 'flare', 'spin', 'smoke'
// (chimney tops that puff while the building works).

import * as THREE from 'three';
import { box, cached, cyl, cylX, mat, mesh, sphere, teamMats } from './models.ts';

const concrete = () => mat(0x9a9890, { rough: 0.95 });
const paving = () => mat(0x8c8a84, { rough: 0.95 });
const plaster = () => mat(0xe6dfcf, { rough: 0.85 });
const brick = () => mat(0xa65a3e, { rough: 0.9 });
const darkBrick = () => mat(0x7d4433, { rough: 0.9 });
const timber = () => mat(0x8a5a32, { rough: 0.9 });
const roofRed = () => mat(0xa8442f, { rough: 0.8 });
const roofGrey = () => mat(0x5b6168, { rough: 0.8 });
const roofGreen = () => mat(0x4f6b4a, { rough: 0.8 });
const metal = () => mat(0x8c939a, { metal: 0.6, rough: 0.45 });
const darkMetal = () => mat(0x3c4146, { metal: 0.5, rough: 0.5 });
const glass = () => mat(0x8fd0f0, { metal: 0.6, rough: 0.15 });
const windowGlow = () => mat(0xffd98a, { emissive: 0xffb84a, rough: 0.4 });
const white = () => mat(0xf2f2ee, { rough: 0.7 });
const grassMat = () => mat(0x6f9a45, { rough: 1 });

function pad(w: number, h: number, m = concrete()): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w - 0.06, 0.12, h - 0.06, m, 0, 0.06, 0));
  return g;
}

/** Gable roof (ridge along x) over a w x d box whose top is at y. */
function gable(w: number, d: number, y: number, rise: number, m: THREE.Material, x = 0, z = 0): THREE.Mesh {
  const geo = cached(`gable${w},${d},${rise}`, () => {
    const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    return g;
  });
  return mesh(geo, m, x, y, z);
}

function windowRow(g: THREE.Group, n: number, span: number, y: number, face: 'x' | 'z', off: number, size = 0.16): void {
  const m = windowGlow();
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
    if (face === 'x') g.add(box(size, size * 0.85, 0.03, m, t, y, off));
    else g.add(box(0.03, size * 0.85, size, m, off, y, t));
  }
}

function chimney(g: THREE.Group, x: number, z: number, h: number, r = 0.16, m = brick()): void {
  g.add(cyl(r * 0.8, r, h, 8, m, x, h / 2, z));
  const top = new THREE.Object3D();
  top.name = 'smoke';
  top.position.set(x, h + 0.05, z);
  g.add(top);
}

function crates(g: THREE.Group, x: number, z: number, n: number, color = 0x9a7a4a): void {
  const m = mat(color, { rough: 0.9 });
  for (let i = 0; i < n; i++) g.add(box(0.3, 0.26, 0.3, m, x + (i % 3) * 0.34, 0.25 + Math.floor(i / 3) * 0.27, z));
}

function tree(g: THREE.Group, x: number, z: number, s = 1): void {
  g.add(cyl(0.05 * s, 0.06 * s, 0.35 * s, 5, timber(), x, 0.29 * s, z));
  g.add(mesh(cached('cityTree', () => new THREE.ConeGeometry(0.28, 0.7, 6)), mat(0x3b7a3a, { rough: 0.9 }), x, 0.75 * s, z));
}

// ---------------------------------------------------------------------------
// Core

function townHall(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(5, 5, paving());
  g.add(box(3.4, 1.4, 2.4, plaster(), 0, 0.82, -0.6));
  g.add(box(3.6, 0.16, 2.6, white(), 0, 1.6, -0.6));
  g.add(gable(3.6, 2.6, 1.68, 0.6, roofGrey(), 0, -0.6));
  // Portico with columns.
  for (const x of [-1.2, -0.6, 0, 0.6, 1.2]) g.add(cyl(0.09, 0.1, 1.3, 8, white(), x, 0.77, 0.75));
  g.add(box(3.0, 0.18, 0.5, white(), 0, 1.5, 0.75));
  g.add(gable(3.0, 0.6, 1.59, 0.35, white(), 0, 0.75));
  // Clock tower with a dome.
  g.add(box(0.8, 1.4, 0.8, plaster(), 0, 2.4, -0.6));
  g.add(cyl(0.18, 0.18, 0.05, 16, white(), 0, 2.6, -0.19));
  g.add(sphere(0.48, t.main, 0, 3.15, -0.6, 10));
  g.add(cyl(0.02, 0.02, 0.5, 4, darkMetal(), 0, 3.75, -0.6));
  windowRow(g, 5, 2.6, 0.9, 'x', 0.61);
  // Plaza: fountain and trees.
  g.add(cyl(0.45, 0.5, 0.18, 14, white(), 0, 0.2, 1.7));
  g.add(cyl(0.38, 0.38, 0.04, 14, mat(0x3fb6d0, { emissive: 0x0a4a5a }), 0, 0.29, 1.7));
  tree(g, -1.9, 1.8);
  tree(g, 1.9, 1.8);
  tree(g, -1.9, -2.0, 0.9);
  tree(g, 1.9, -2.0, 0.9);
  return g;
}

function regionalOffice(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3, paving());
  g.add(box(2.0, 1.1, 1.6, plaster(), 0, 0.67, -0.2));
  g.add(gable(2.1, 1.7, 1.22, 0.45, roofGrey(), 0, -0.2));
  for (const x of [-0.6, 0, 0.6]) g.add(cyl(0.07, 0.07, 0.95, 6, white(), x, 0.6, 0.72));
  g.add(box(1.6, 0.12, 0.3, white(), 0, 1.12, 0.72));
  windowRow(g, 4, 1.5, 0.7, 'x', 0.61);
  g.add(cyl(0.025, 0.03, 2.2, 5, darkMetal(), 1.15, 1.2, 1.1));
  g.add(box(0.5, 0.3, 0.02, t.main, 1.41, 2.1, 1.1));
  return g;
}

// ---------------------------------------------------------------------------
// Logistics

function constructionOffice(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3, mat(0xa59a7f, { rough: 1 }));
  g.add(box(1.2, 0.7, 0.8, mat(0xe0b23a), -0.7, 0.47, -0.9));
  windowRow(g, 2, 0.6, 0.55, 'x', -0.49);
  g.add(box(1.24, 0.08, 0.84, t.main, -0.7, 0.86, -0.9));
  // Crane.
  g.add(box(0.14, 2.6, 0.14, mat(0xe0b23a), 0.9, 1.4, -0.9));
  const jib = new THREE.Group();
  jib.name = 'spin';
  jib.position.set(0.9, 2.7, -0.9);
  jib.add(box(2.4, 0.1, 0.1, mat(0xe0b23a), -0.5, 0, 0));
  jib.add(box(0.3, 0.25, 0.25, darkMetal(), 0.55, -0.1, 0));
  jib.add(box(0.02, 0.9, 0.02, darkMetal(), -1.4, -0.45, 0));
  g.add(jib);
  // Stacked materials.
  for (let i = 0; i < 3; i++) g.add(box(0.9, 0.12, 0.3, timber(), -0.6, 0.18 + i * 0.13, 0.6));
  g.add(box(0.5, 0.4, 0.5, concrete(), 0.5, 0.32, 0.7));
  g.add(box(0.5, 0.3, 0.5, concrete(), 0.5, 0.67, 0.7));
  return g;
}

function warehouse(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(4, 3);
  const body = mat(0xb9b2a2, { rough: 0.85 });
  g.add(box(3.4, 1.1, 2.0, body, 0, 0.67, -0.25));
  // Barrel roof.
  const roof = mesh(cached('whRoof', () => new THREE.CylinderGeometry(1.02, 1.02, 3.45, 14, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2)), t.accent, 0, 1.22, -0.25);
  roof.scale.set(1, 0.45, 1);
  g.add(roof);
  for (const x of [-1.1, 0, 1.1]) g.add(box(0.7, 0.75, 0.04, darkMetal(), x, 0.5, 0.77));
  crates(g, -1.6, 1.05, 6);
  crates(g, 0.6, 1.05, 3, 0x6f8fa0);
  return g;
}

// ---------------------------------------------------------------------------
// Houses: four levels

function cottage(team: number): THREE.Group {
  const g = pad(2, 2, grassMat());
  g.add(box(1.0, 0.6, 0.8, plaster(), -0.2, 0.42, -0.2));
  g.add(gable(1.1, 0.95, 0.72, 0.4, roofRed(), -0.2, -0.2));
  g.add(box(0.18, 0.32, 0.03, timber(), -0.2, 0.28, 0.21));
  g.add(box(0.14, 0.14, 0.03, windowGlow(), 0.1, 0.48, 0.21));
  g.add(box(0.06, 0.25, 0.06, brick(), 0.15, 1.0, -0.3));
  tree(g, 0.6, 0.55, 0.8);
  void team;
  return g;
}

function house(team: number): THREE.Group {
  const g = pad(2, 2, grassMat());
  g.add(box(1.3, 1.05, 1.0, plaster(), 0, 0.64, -0.2));
  g.add(gable(1.4, 1.15, 1.16, 0.5, roofRed(), 0, -0.2));
  windowRow(g, 3, 0.8, 0.45, 'x', 0.31);
  windowRow(g, 3, 0.8, 0.88, 'x', 0.31);
  g.add(box(0.08, 0.35, 0.08, brick(), 0.4, 1.5, -0.35));
  g.add(box(1.6, 0.2, 0.05, mat(0xd8d2c0), 0, 0.22, 0.85)); // garden wall
  void team;
  return g;
}

function terrace(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2, paving());
  for (const x of [-0.45, 0.45]) {
    const unit = new THREE.Group();
    unit.position.x = x;
    unit.add(box(0.82, 1.5, 1.5, x < 0 ? brick() : darkBrick(), 0, 0.87, 0));
    windowRow(unit, 2, 0.4, 0.55, 'x', 0.76);
    windowRow(unit, 2, 0.4, 1.05, 'x', 0.76);
    unit.add(box(0.2, 0.36, 0.03, timber(), 0, 0.28, 0.76));
    g.add(unit);
  }
  g.add(box(1.75, 0.1, 1.55, t.accent, 0, 1.66, 0));
  g.add(box(0.3, 0.2, 0.3, darkMetal(), 0.5, 1.8, -0.3));
  return g;
}

function apartment(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2, paving());
  g.add(box(1.6, 3.0, 1.5, mat(0xd6d0c4, { rough: 0.8 }), 0, 1.6, 0));
  for (const y of [0.5, 1.1, 1.7, 2.3, 2.85]) {
    windowRow(g, 4, 1.2, y, 'x', 0.76);
    windowRow(g, 3, 1.0, y, 'z', 0.81);
  }
  g.add(box(1.66, 0.12, 1.56, t.main, 0, 3.12, 0));
  g.add(box(0.4, 0.3, 0.4, darkMetal(), -0.4, 3.32, -0.3));
  g.add(box(0.5, 0.45, 0.04, glass(), 0, 0.35, 0.76));
  return g;
}

export const HOUSE_MODELS = [cottage, house, terrace, apartment];

// ---------------------------------------------------------------------------
// Raw producers

function farm(team: number): THREE.Group {
  const g = new THREE.Group();
  // Fields: rows of crops on brown soil.
  g.add(box(3.9, 0.08, 3.9, mat(0x7a5a38, { rough: 1 }), 0, 0.04, 0));
  const crop = mat(0xc8b04a, { rough: 0.9 });
  const green = mat(0x7aa040, { rough: 0.9 });
  for (let i = 0; i < 7; i++) g.add(box(2.5, 0.16, 0.22, i % 2 ? crop : green, -0.55, 0.14, -1.6 + i * 0.5));
  // Barn and silo.
  g.add(box(0.9, 0.7, 1.1, mat(0xa8442f, { rough: 0.85 }), 1.35, 0.43, -0.9));
  g.add(gable(1.0, 1.2, 0.78, 0.45, roofGrey(), 1.35, -0.9));
  g.add(box(0.3, 0.42, 0.03, white(), 1.35, 0.3, -0.34));
  g.add(cyl(0.28, 0.28, 1.5, 10, metal(), 1.4, 0.83, 0.75));
  g.add(sphere(0.28, metal(), 1.4, 1.58, 0.75, 10));
  void team;
  return g;
}

function fishingHarbour(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3, mat(0x8a7a62, { rough: 1 }));
  g.add(box(1.4, 0.7, 1.0, mat(0x6f8fa0), -0.5, 0.47, -0.6));
  g.add(gable(1.5, 1.1, 0.82, 0.4, roofRed(), -0.5, -0.6));
  // Jetty out to the water side (+x) and a small boat.
  g.add(box(1.8, 0.08, 0.4, timber(), 1.3, 0.2, 0.6));
  for (const x of [0.6, 1.3, 2.0]) for (const z of [0.42, 0.78]) g.add(cyl(0.04, 0.04, 0.5, 5, timber(), x, -0.05, z));
  const boat = new THREE.Group();
  boat.position.set(1.7, 0.08, 1.15);
  boat.add(box(0.9, 0.18, 0.32, t.main, 0, 0, 0));
  boat.add(box(0.3, 0.22, 0.24, white(), -0.15, 0.18, 0));
  boat.add(cyl(0.015, 0.015, 0.7, 4, darkMetal(), 0.15, 0.4, 0));
  g.add(boat);
  crates(g, -1.2, 0.8, 2, 0x5f7f9a);
  return g;
}

function loggingCamp(team: number): THREE.Group {
  const g = pad(2, 2, mat(0x7a6a50, { rough: 1 }));
  g.add(box(0.8, 0.5, 0.6, timber(), -0.35, 0.37, -0.4));
  g.add(gable(0.9, 0.7, 0.62, 0.3, roofGreen(), -0.35, -0.4));
  const log = mat(0x9a6a3a, { rough: 0.9 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) g.add(cylX(0.1, 1.1, 6, log, 0.1, 0.22 + i * 0.17, 0.3 + j * 0.21 + i * 0.1));
  void team;
  return g;
}

function quarry(team: number): THREE.Group {
  const g = new THREE.Group();
  const stone = mat(0xbdb8ae, { rough: 1 });
  // Stepped pit.
  g.add(box(2.9, 0.1, 2.9, mat(0x9f9a90, { rough: 1 }), 0, 0.05, 0));
  g.add(box(2.2, 0.08, 2.2, stone, 0, 0.1, 0));
  g.add(box(1.5, 0.06, 1.5, mat(0xa9a49a), 0, 0.14, 0));
  for (const [x, z] of [[-1.1, -1.1], [1.0, -1.15], [-1.15, 1.0]] as const) g.add(box(0.45, 0.35, 0.4, stone, x, 0.27, z));
  // Crane and conveyor.
  g.add(box(0.1, 1.4, 0.1, mat(0xe0b23a), 1.1, 0.75, 1.1));
  const arm = box(1.2, 0.08, 0.08, mat(0xe0b23a), 0.6, 1.42, 1.1);
  g.add(arm);
  const conv = box(1.6, 0.06, 0.25, darkMetal(), -0.3, 0.5, 1.15);
  conv.rotation.z = 0.35;
  g.add(conv);
  void team;
  return g;
}

function ironMine(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3, mat(0x6f5a48, { rough: 1 }));
  // Headframe: a lattice tower with a wheel on top.
  const frame = darkMetal();
  for (const sx of [-0.25, 0.25]) for (const sz of [-0.25, 0.25]) g.add(box(0.07, 2.0, 0.07, frame, -0.6 + sx, 1.05, -0.5 + sz));
  for (const y of [0.6, 1.2, 1.8]) g.add(box(0.6, 0.05, 0.6, frame, -0.6, y, -0.5));
  const wheel = new THREE.Group();
  wheel.name = 'spin';
  wheel.position.set(-0.6, 2.15, -0.5);
  wheel.rotation.z = Math.PI / 2;
  wheel.add(mesh(cached('mineWheel', () => new THREE.TorusGeometry(0.28, 0.04, 6, 12)), metal(), 0, 0, 0));
  g.add(wheel);
  g.add(box(1.0, 0.6, 0.8, mat(0x8a7a6a), 0.7, 0.42, -0.6));
  g.add(box(1.04, 0.08, 0.84, t.accent, 0.7, 0.76, -0.6));
  // Ore heap.
  g.add(mesh(cached('oreHeap', () => new THREE.ConeGeometry(0.6, 0.55, 7)), mat(0xa0553a, { rough: 1 }), 0.6, 0.38, 0.8));
  return g;
}

function oilWell(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2, mat(0x5a544c, { rough: 1 }));
  // Pumpjack: post, rocking beam with horse head, crank.
  g.add(box(0.12, 0.8, 0.3, darkMetal(), 0, 0.5, 0));
  const beam = new THREE.Group();
  beam.name = 'beam';
  beam.position.set(0, 0.92, 0);
  beam.add(box(1.4, 0.1, 0.12, t.main, 0, 0, 0));
  beam.add(box(0.15, 0.35, 0.16, t.main, 0.72, -0.1, 0));
  g.add(beam);
  const crank = new THREE.Group();
  crank.name = 'crank';
  crank.position.set(-0.55, 0.45, 0);
  crank.add(box(0.36, 0.08, 0.06, darkMetal(), 0, 0, 0.12));
  g.add(crank);
  g.add(box(0.3, 0.25, 0.3, darkMetal(), -0.55, 0.25, -0.15));
  g.add(cyl(0.05, 0.05, 0.3, 6, metal(), 0.72, 0.25, 0));
  g.add(cyl(0.22, 0.22, 0.5, 10, metal(), -0.55, 0.37, 0.6));
  return g;
}

// ---------------------------------------------------------------------------
// Industry

function factoryHall(g: THREE.Group, w: number, d: number, h: number, x: number, z: number, wallM: THREE.Material, roofM: THREE.Material, sawtooth = false): void {
  g.add(box(w, h, d, wallM, x, h / 2 + 0.1, z));
  if (sawtooth) {
    const n = Math.max(2, Math.round(w / 0.6));
    for (let i = 0; i < n; i++) {
      const tooth = mesh(cached(`tooth${d}`, () => {
        const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.6, 0), new THREE.Vector2(0, 0.35)]);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
        geo.translate(0, 0, -d / 2);
        return geo;
      }), roofM, x - w / 2 + i * (w / n), h + 0.1, z);
      tooth.scale.x = w / n / 0.6;
      g.add(tooth);
    }
  } else {
    g.add(box(w + 0.04, 0.08, d + 0.04, roofM, x, h + 0.14, z));
  }
}

function foodPlant(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3);
  factoryHall(g, 1.9, 1.6, 0.9, -0.4, -0.3, white(), t.accent);
  windowRow(g, 4, 1.4, 0.6, 'x', 0.51);
  for (const z of [-0.8, 0.0]) {
    g.add(cyl(0.28, 0.28, 1.6, 10, metal(), 1.05, 0.9, z));
    g.add(mesh(cached('siloCone', () => new THREE.ConeGeometry(0.28, 0.25, 10)), metal(), 1.05, 1.82, z));
  }
  crates(g, -1.1, 1.05, 4, 0xe08a3c);
  chimney(g, -1.1, -0.9, 1.6, 0.1, metal());
  return g;
}

function sawmill(team: number): THREE.Group {
  const g = pad(3, 3, mat(0x8a7a62, { rough: 1 }));
  g.add(box(1.8, 0.8, 1.2, timber(), -0.3, 0.5, -0.5));
  g.add(gable(1.9, 1.3, 0.9, 0.45, roofGrey(), -0.3, -0.5));
  // Saw blade.
  const blade = new THREE.Group();
  blade.name = 'spin';
  blade.position.set(0.85, 0.5, -0.5);
  blade.rotation.z = Math.PI / 2;
  blade.add(mesh(cached('sawBlade', () => new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16)), metal(), 0, 0, 0));
  g.add(blade);
  const log = mat(0x9a6a3a, { rough: 0.9 });
  for (let i = 0; i < 3; i++) g.add(cylX(0.11, 1.3, 6, log, -0.5, 0.23 + i * 0.2, 0.7));
  const plank = mat(0xd0a060, { rough: 0.9 });
  for (let i = 0; i < 4; i++) g.add(box(0.9, 0.06, 0.4, plank, 0.8, 0.15 + i * 0.07, 0.75));
  void team;
  return g;
}

function cementWorks(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3);
  // Rotary kiln (slanted cylinder), silos, chimney.
  const kiln = cylX(0.3, 2.2, 10, mat(0xbdb8ae), -0.1, 0.62, 0.6);
  kiln.rotation.z = 0.12;
  g.add(kiln);
  for (const x of [-0.8, 0.8]) g.add(box(0.15, 0.45, 0.4, darkMetal(), x, 0.32, 0.6));
  for (const x of [-0.8, 0.0]) g.add(cyl(0.35, 0.35, 1.8, 10, mat(0xd8d4ca), x, 1.0, -0.7));
  g.add(box(1.4, 0.15, 0.4, t.accent, -0.4, 1.95, -0.7));
  chimney(g, 1.0, -0.8, 2.3, 0.14, mat(0xc9c4ba));
  return g;
}

function steelMill(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(4, 4);
  factoryHall(g, 2.6, 1.8, 1.3, -0.5, 0.6, mat(0x6f6a64), t.accent);
  // Blast furnace and stoves.
  g.add(cyl(0.45, 0.6, 2.4, 10, darkMetal(), 1.1, 1.3, -0.9));
  g.add(cyl(0.3, 0.3, 0.5, 8, mat(0xff7a2a, { emissive: 0xff5a00 }), 1.1, 2.6, -0.9));
  for (const x of [-0.2, -0.9]) g.add(cyl(0.28, 0.28, 2.0, 10, metal(), x, 1.1, -1.2));
  chimney(g, -1.6, -1.3, 3.2, 0.18, darkBrick());
  chimney(g, 1.7, 1.4, 2.8, 0.15, darkBrick());
  return g;
}

function oilRefinery(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(4, 4);
  // Distillation columns, tanks, pipes and a gas flare.
  for (const [x, z, h] of [[-1.2, -1.0, 2.8], [-0.6, -1.1, 2.2], [0.0, -1.0, 3.2]] as const) {
    g.add(cyl(0.18, 0.2, h, 8, metal(), x, h / 2 + 0.1, z));
    for (let y = 0.6; y < h; y += 0.6) g.add(cyl(0.22, 0.22, 0.05, 8, darkMetal(), x, y, z));
  }
  for (const [x, z] of [[0.9, 0.6], [-0.3, 0.9], [0.9, -0.6]] as const) {
    g.add(cyl(0.45, 0.45, 0.6, 14, white(), x, 0.4, z));
    g.add(cyl(0.46, 0.46, 0.06, 14, t.main, x, 0.72, z));
  }
  g.add(box(2.6, 0.06, 0.06, darkMetal(), -0.2, 0.4, -0.3));
  g.add(box(0.06, 0.06, 1.8, darkMetal(), -1.2, 0.4, 0.0));
  g.add(cyl(0.05, 0.06, 2.6, 6, darkMetal(), 1.6, 1.4, -1.5));
  const flare = mesh(cached('flare', () => new THREE.ConeGeometry(0.12, 0.45, 6)), mat(0xffa030, { emissive: 0xff7a00 }), 1.6, 2.92, -1.5);
  flare.name = 'flare';
  g.add(flare);
  return g;
}

function goodsFactory(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3);
  factoryHall(g, 2.4, 1.8, 0.9, 0, -0.3, brick(), roofGrey(), true);
  windowRow(g, 5, 2.0, 0.55, 'x', 0.61);
  g.add(box(0.8, 0.5, 0.04, t.main, 0, 1.25, 0.61));
  crates(g, -1.2, 1.1, 5, 0xd070b0);
  chimney(g, 1.15, -1.0, 1.9, 0.12, darkBrick());
  return g;
}

// ---------------------------------------------------------------------------
// Utilities

function powerPlant(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(4, 3);
  factoryHall(g, 2.2, 1.6, 1.4, -0.7, 0.3, mat(0xc9c4ba), t.accent);
  windowRow(g, 4, 1.6, 1.0, 'x', 1.11);
  chimney(g, 1.0, -0.8, 3.6, 0.22, mat(0xd8d4ca));
  chimney(g, 1.5, 0.2, 3.6, 0.22, mat(0xd8d4ca));
  for (const y of [2.8, 3.3]) for (const [x, z] of [[1.0, -0.8], [1.5, 0.2]] as const) g.add(cyl(0.23, 0.23, 0.12, 8, mat(0xc0402a), x, y, z));
  // Transformer yard.
  for (const x of [-1.6, -1.2]) g.add(box(0.25, 0.4, 0.3, darkMetal(), x, 0.32, -1.1));
  g.add(box(0.05, 1.0, 0.05, darkMetal(), -0.8, 0.6, -1.15));
  return g;
}

function pumpingStation(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2);
  g.add(box(1.2, 0.8, 0.9, brick(), -0.2, 0.52, -0.2));
  g.add(gable(1.3, 1.0, 0.92, 0.35, roofGrey(), -0.2, -0.2));
  windowRow(g, 2, 0.6, 0.55, 'x', 0.26);
  g.add(cylX(0.12, 1.2, 8, mat(0x4a7ab0, { metal: 0.4 }), 0.5, 0.25, 0.55));
  g.add(cyl(0.16, 0.16, 0.3, 8, t.main, 0.55, 0.25, -0.5));
  return g;
}

function waterTower(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2);
  for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]] as const) {
    const leg = box(0.07, 2.2, 0.07, darkMetal(), x * 0.8, 1.2, z * 0.8);
    g.add(leg);
  }
  g.add(cyl(0.7, 0.7, 0.9, 14, mat(0x6fa8d8, { metal: 0.3 }), 0, 2.6, 0));
  g.add(mesh(cached('wtTop', () => new THREE.ConeGeometry(0.75, 0.4, 14)), t.main, 0, 3.25, 0));
  g.add(cyl(0.06, 0.06, 2.2, 6, metal(), 0, 1.2, 0));
  return g;
}

// ---------------------------------------------------------------------------
// Services

function market(team: number): THREE.Group {
  const g = pad(3, 3, paving());
  const colors = [0xd64541, 0xe0b23a, 0x3a7bd5, 0x5fa043, 0xd070b0, 0xe08a3c];
  let k = 0;
  for (const x of [-0.9, 0, 0.9]) {
    for (const z of [-0.8, 0.6]) {
      g.add(box(0.7, 0.35, 0.5, timber(), x, 0.3, z));
      const awning = box(0.82, 0.05, 0.62, mat(colors[k++ % colors.length]!), x, 0.85, z);
      awning.rotation.x = 0.15;
      g.add(awning);
      for (const sx of [-0.35, 0.35]) g.add(cyl(0.02, 0.02, 0.7, 4, darkMetal(), x + sx, 0.48, z + 0.25));
    }
  }
  crates(g, -1.2, 1.25, 3, 0xe08a3c);
  void team;
  return g;
}

function policeStation(team: number): THREE.Group {
  const g = pad(2, 2, paving());
  g.add(box(1.5, 0.9, 1.1, mat(0xd8d4ca), 0, 0.57, -0.25));
  g.add(box(1.54, 0.12, 1.14, mat(0x2f4f8f), 0, 1.08, -0.25));
  windowRow(g, 3, 1.0, 0.65, 'x', 0.31);
  const beacon = sphere(0.08, mat(0x4a7aff, { emissive: 0x2a4aff }), 0.5, 1.22, -0.5, 6);
  beacon.name = 'flare';
  g.add(beacon);
  g.add(box(0.5, 0.2, 0.3, mat(0x1f3f7f), -0.3, 0.2, 0.65));
  void team;
  return g;
}

function clinic(team: number): THREE.Group {
  const g = pad(3, 2);
  g.add(box(2.4, 1.0, 1.2, white(), 0, 0.62, -0.2));
  g.add(box(2.44, 0.1, 1.24, mat(0x9ab0b8), 0, 1.15, -0.2));
  windowRow(g, 5, 2.0, 0.65, 'x', 0.41);
  const red = mat(0xd03a30, { emissive: 0x501010 });
  g.add(box(0.36, 0.1, 0.1, red, 0, 1.4, 0.4));
  g.add(box(0.1, 0.36, 0.1, red, 0, 1.4, 0.4));
  g.add(box(0.04, 0.5, 0.04, darkMetal(), 0, 1.2, 0.4));
  void team;
  return g;
}

function school(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3, grassMat());
  g.add(box(2.4, 0.9, 1.0, brick(), 0, 0.57, -0.8));
  g.add(gable(2.5, 1.1, 1.02, 0.4, roofGrey(), 0, -0.8));
  windowRow(g, 6, 2.0, 0.6, 'x', -0.29);
  g.add(box(0.8, 1.2, 0.8, brick(), -0.8, 0.72, -0.8));
  g.add(box(2.2, 0.03, 1.2, mat(0xb0a080), 0.2, 0.13, 0.65)); // playground
  g.add(cyl(0.02, 0.02, 1.6, 4, darkMetal(), 1.2, 0.9, 1.1));
  g.add(box(0.4, 0.25, 0.02, t.main, 1.41, 1.55, 1.1));
  return g;
}

export function buildCityModel(type: string, team: number, level = 0): THREE.Group | null {
  switch (type) {
    case 'town_hall': return townHall(team);
    case 'regional_office': return regionalOffice(team);
    case 'construction_office': return constructionOffice(team);
    case 'warehouse': return warehouse(team);
    case 'house': return HOUSE_MODELS[Math.max(0, Math.min(3, level))]!(team);
    case 'farm': return farm(team);
    case 'fishing_harbour': return fishingHarbour(team);
    case 'logging_camp': return loggingCamp(team);
    case 'quarry': return quarry(team);
    case 'iron_mine': return ironMine(team);
    case 'oil_well': return oilWell(team);
    case 'food_plant': return foodPlant(team);
    case 'sawmill': return sawmill(team);
    case 'cement_works': return cementWorks(team);
    case 'steel_mill': return steelMill(team);
    case 'oil_refinery': return oilRefinery(team);
    case 'goods_factory': return goodsFactory(team);
    case 'power_plant': return powerPlant(team);
    case 'pumping_station': return pumpingStation(team);
    case 'water_tower': return waterTower(team);
    case 'market': return market(team);
    case 'police_station': return policeStation(team);
    case 'clinic': return clinic(team);
    case 'school': return school(team);
    default: return null;
  }
}
