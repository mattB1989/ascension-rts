// Procedural building models. Each is centred on its footprint, sits on y = 0,
// and is sized to its footprint in tiles. Named parts are animated by the view:
//   'spin'  rotates around Y (radar dishes)      'beam'  rocks (pumpjack beam)
//   'crank' rotates around Z (pumpjack crank)    'flare' flickers (gas flare)

import * as THREE from 'three';
import { BUILDINGS, type BuildingTypeId } from '../data/buildings.ts';
import { buildCityModel } from './cityModels.ts';
import { box, C, cached, cyl, cylX, mat, mesh, sphere, teamMats } from './models.ts';

const concrete = () => mat(C.concrete, { rough: 0.95 });
const concreteDark = () => mat(0x7f7d76, { rough: 0.95 });
const wall = () => mat(0xd9d6cc, { rough: 0.8 });
const wallGrey = () => mat(0xb3b6b9, { rough: 0.7 });
const roof = () => mat(0x5b6168, { rough: 0.8 });
const metal = () => mat(0x8c939a, { metal: 0.6, rough: 0.45 });
const darkMetal = () => mat(0x3c4146, { metal: 0.5, rough: 0.5 });
const glass = () => mat(0x8fd0f0, { metal: 0.6, rough: 0.15 });
const windowGlow = () => mat(0xffd98a, { emissive: 0xffb84a, rough: 0.4 });
const hazard = () => mat(0xe0b23a, { rough: 0.6 });

/** Concrete pad slightly larger than the footprint. */
function pad(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w - 0.1, 0.16, h - 0.1, concrete(), 0, 0.08, 0));
  g.add(box(w - 0.02, 0.06, h - 0.02, concreteDark(), 0, 0.03, 0));
  return g;
}

/** A row of lit windows along one face. */
function windows(g: THREE.Group, count: number, span: number, y: number, along: 'x' | 'z', offset: number, size = 0.18): void {
  const m = windowGlow();
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : -span / 2 + (span * i) / (count - 1);
    if (along === 'x') g.add(box(size, size * 0.8, 0.04, m, t, y, offset));
    else g.add(box(0.04, size * 0.8, size, m, offset, y, t));
  }
}

function flag(team: number, x: number, z: number, h = 1.6): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.025, 0.03, h, 5, darkMetal(), x, h / 2, z));
  const f = box(0.36, 0.22, 0.02, teamMats(team).main, x + 0.19, h - 0.14, z);
  f.name = 'flag';
  g.add(f);
  return g;
}

// ---------------------------------------------------------------------------

function commandCenter(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(4, 4);
  g.add(box(3.0, 1.5, 2.6, wall(), -0.3, 0.9, 0));
  g.add(box(3.04, 0.22, 2.64, t.main, -0.3, 1.5, 0));
  g.add(box(0.05, 0.9, 2.2, glass(), 1.22, 0.75, 0)); // glass facade
  windows(g, 5, 2.2, 0.55, 'x', 1.31, 0.22);
  windows(g, 5, 2.2, 1.05, 'x', 1.31, 0.22);
  g.add(box(1.1, 0.9, 1.1, wallGrey(), 1.35, 0.6, 1.25));
  g.add(box(1.12, 0.14, 1.12, t.main, 1.35, 1.05, 1.25));
  g.add(box(2.0, 0.6, 1.6, metal(), -0.5, 1.95, -0.2));
  for (const x of [-1.2, -0.6, 0.0]) g.add(box(0.3, 0.18, 0.3, darkMetal(), x, 2.34, 0.4)); // roof units
  g.add(cyl(0.12, 0.18, 1.8, 6, darkMetal(), -1.3, 3.05, 0.65));
  const dish = new THREE.Group();
  dish.name = 'spin';
  dish.position.set(-1.3, 3.95, 0.65);
  const d = mesh(cached('ccDish', () => new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2.4)), metal(), 0, 0, 0.1);
  d.rotation.x = -1.1;
  dish.add(d);
  g.add(dish);
  // Helipad
  g.add(mesh(cached('ccPad', () => new THREE.CylinderGeometry(0.72, 0.72, 0.05, 20)), darkMetal(), 1.3, 0.2, -1.3));
  g.add(box(0.5, 0.06, 0.08, hazard(), 1.3, 0.24, -1.3));
  g.add(box(0.08, 0.06, 0.5, hazard(), 1.13, 0.24, -1.3));
  g.add(box(0.08, 0.06, 0.5, hazard(), 1.47, 0.24, -1.3));
  g.add(flag(team, -1.8, -1.8, 2.2));
  return g;
}

function habitat(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2);
  g.add(box(1.55, 2.1, 1.55, wall(), 0, 1.2, 0));
  for (const y of [0.55, 0.95, 1.35, 1.75]) {
    windows(g, 3, 1.0, y, 'x', 0.79, 0.2);
    windows(g, 3, 1.0, y, 'z', 0.79, 0.2);
  }
  g.add(box(1.6, 0.14, 1.6, t.main, 0, 2.3, 0));
  g.add(box(0.5, 0.2, 0.4, darkMetal(), 0.3, 2.47, -0.3));
  g.add(box(0.6, 0.08, 0.6, mat(0x5f8f43), -0.35, 2.41, 0.35)); // roof garden
  g.add(box(0.5, 0.5, 0.05, glass(), 0, 0.42, 0.8)); // entrance
  return g;
}

function refinery(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3);
  g.add(box(1.6, 1.0, 2.4, wallGrey(), -0.55, 0.65, 0));
  g.add(box(1.64, 0.1, 2.44, t.main, -0.55, 1.2, 0));
  for (const z of [-0.7, 0.7]) {
    g.add(cyl(0.45, 0.45, 1.8, 10, metal(), 0.75, 1.05, z));
    g.add(cyl(0.47, 0.47, 0.12, 10, t.accent, 0.75, 1.5, z));
    g.add(mesh(cached('siloTop', () => new THREE.ConeGeometry(0.45, 0.3, 10)), metal(), 0.75, 2.1, z));
  }
  // Glowing crystal vat
  g.add(cyl(0.38, 0.4, 0.3, 10, darkMetal(), -0.55, 1.4, 0.5));
  g.add(cyl(0.32, 0.32, 0.05, 10, mat(0x4fd1c5, { emissive: 0x1fbfb0 }), -0.55, 1.56, 0.5));
  // Conveyor ramp from the ground to the hall
  const ramp = box(1.4, 0.08, 0.32, darkMetal(), -1.0, 0.75, -1.0);
  ramp.rotation.z = 0.5;
  g.add(ramp);
  g.add(box(0.3, 0.4, 0.3, hazard(), -1.55, 0.3, -1.0));
  g.add(cyl(0.08, 0.1, 1.0, 6, darkMetal(), -0.9, 1.7, -0.6)); // stack
  return g;
}

function oilDerrick(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2);
  const frame = darkMetal();
  g.add(box(1.6, 0.12, 0.5, frame, 0, 0.22, 0));
  // A-frame (Samson post)
  for (const z of [0.16, -0.16]) {
    const leg = box(0.07, 1.1, 0.07, frame, 0.1, 0.75, z);
    leg.rotation.x = z > 0 ? -0.1 : 0.1;
    g.add(leg);
  }
  // Walking beam, pivoting on the A-frame
  const beam = new THREE.Group();
  beam.name = 'beam';
  beam.position.set(0.1, 1.3, 0);
  beam.add(box(1.5, 0.1, 0.12, t.main, 0, 0, 0));
  const head = mesh(cached('horseHead', () => new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2)), t.accent, 0.75, -0.05, 0);
  head.rotation.z = -Math.PI / 2;
  beam.add(head);
  g.add(beam);
  // Crank and counterweight
  const crank = new THREE.Group();
  crank.name = 'crank';
  crank.position.set(-0.55, 0.55, 0);
  crank.add(box(0.5, 0.12, 0.08, frame, 0.1, 0, 0.18));
  crank.add(box(0.5, 0.12, 0.08, frame, 0.1, 0, -0.18));
  crank.add(box(0.2, 0.25, 0.3, metal(), 0.32, 0, 0));
  g.add(crank);
  g.add(box(0.35, 0.35, 0.35, metal(), -0.7, 0.4, 0)); // motor
  g.add(cyl(0.04, 0.04, 1.1, 5, metal(), 0.85, 0.7, 0)); // polished rod
  g.add(cyl(0.3, 0.3, 0.5, 10, mat(0x9b6b3d, { rough: 0.6 }), 0.4, 0.4, 0.6)); // storage tank
  g.add(cyl(0.31, 0.31, 0.06, 10, t.main, 0.4, 0.66, 0.6));
  return g;
}

function offshoreRig(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const steel = mat(0x8a8178, { metal: 0.5, rough: 0.5 });
  for (const x of [-1.1, 1.1]) for (const z of [-1.1, 1.1]) g.add(cyl(0.16, 0.2, 3.4, 8, mat(0xd0a030, { rough: 0.6 }), x, -0.3, z));
  g.add(box(2.9, 0.25, 2.9, steel, 0, 1.4, 0));
  g.add(box(2.94, 0.08, 2.94, t.main, 0, 1.3, 0));
  // Derrick tower: tapered lattice
  const tower = darkMetal();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.06, 2.4, 0.06, tower, 0.45 + sx * 0.3, 2.7, -0.3 + sz * 0.3);
      leg.rotation.z = -sx * 0.1;
      leg.rotation.x = sz * 0.1;
      g.add(leg);
    }
  }
  for (const y of [2.0, 2.6, 3.2]) g.add(box(0.6 - (y - 2) * 0.25, 0.04, 0.6 - (y - 2) * 0.25, tower, 0.45, y, -0.3));
  g.add(box(1.1, 0.7, 0.9, wall(), -0.75, 1.88, 0.6)); // accommodation block
  windows(g, 3, 0.7, 1.95, 'x', 1.06, 0.15);
  g.add(mesh(cached('rigPad', () => new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16)), darkMetal(), -0.75, 2.27, 0.6));
  g.add(box(0.06, 0.04, 0.45, hazard(), -0.75, 2.31, 0.6));
  // Flare boom with a flickering flame
  const boom = box(1.2, 0.06, 0.06, steel, 1.6, 1.8, 1.1);
  boom.rotation.z = 0.35;
  g.add(boom);
  const flame = mesh(cached('flame', () => new THREE.ConeGeometry(0.14, 0.45, 6)), mat(0xff9a3c, { emissive: 0xff6a10 }), 2.15, 2.25, 1.1);
  flame.name = 'flare';
  g.add(flame);
  return g;
}

function barracks(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3);
  const hut = mesh(
    cached('quonset', () => new THREE.CylinderGeometry(0.85, 0.85, 2.4, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2)),
    mat(0x7c8463, { rough: 0.85 }), -0.35, 0.15, 0,
  );
  g.add(hut);
  g.add(box(0.06, 0.5, 0.5, darkMetal(), 0.86, 0.45, 0)); // door
  g.add(box(0.08, 0.12, 0.9, t.main, 0.88, 0.85, 0));
  windows(g, 3, 1.4, 0.6, 'z', 0.83, 0.16);
  // Sandbag wall around the yard
  const sand = mat(0xb8a173, { rough: 1 });
  for (let i = 0; i < 5; i++) g.add(box(0.36, 0.2, 0.22, sand, 0.7 + (i % 2) * 0.05, 0.25, -1.3 + i * 0.12 + (i > 2 ? 1.6 : 0)));
  g.add(box(0.9, 0.22, 0.24, sand, 1.0, 0.25, 1.25));
  g.add(flag(team, 1.25, -1.25, 1.8));
  return g;
}

function vehicleFactory(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(4, 4);
  g.add(box(3.4, 1.4, 3.2, wallGrey(), -0.1, 0.85, 0));
  // Sawtooth roof
  for (let i = 0; i < 3; i++) {
    const tooth = mesh(cached('tooth', () => {
      const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.13, 0), new THREE.Vector2(1.13, 0.5)]);
      return new THREE.ExtrudeGeometry(s, { depth: 3.2, bevelEnabled: false }).translate(0, 0, -1.6);
    }), roof(), -1.8 + i * 1.13, 1.55, 0);
    g.add(tooth);
    g.add(box(0.03, 0.45, 3.0, glass(), -0.67 + i * 1.13, 1.78, 0));
  }
  // Big door with hazard stripes, facing +x
  g.add(box(0.06, 1.0, 2.0, darkMetal(), 1.62, 0.66, 0));
  for (let i = 0; i < 5; i++) g.add(box(0.07, 0.12, 0.25, i % 2 ? hazard() : mat(0x222222), 1.64, 1.25, -0.8 + i * 0.4));
  g.add(box(3.44, 0.14, 3.24, t.main, -0.1, 1.5, 0));
  for (const z of [-1.2, 1.2]) g.add(cyl(0.14, 0.16, 1.4, 8, darkMetal(), -1.4, 2.2, z));
  // Yard crane
  g.add(box(0.12, 1.6, 0.12, hazard(), 1.75, 0.95, -1.6));
  g.add(box(1.0, 0.1, 0.1, hazard(), 1.4, 1.75, -1.6));
  return g;
}

function shipyard(team: number): THREE.Group {
  // Local +x is the water side; the view rotates it to face the actual sea.
  const t = teamMats(team);
  const g = pad(4, 4);
  g.add(box(1.6, 1.3, 3.4, wallGrey(), -1.0, 0.8, 0));
  g.add(box(1.64, 0.12, 3.44, t.main, -1.0, 1.4, 0));
  windows(g, 4, 2.6, 0.8, 'z', -0.18, 0.2);
  // Slipway running out over the water
  g.add(box(4.0, 0.14, 1.6, concreteDark(), 1.6, 0.1, 0));
  for (const z of [-0.85, 0.85]) g.add(box(4.0, 0.3, 0.12, concrete(), 1.6, 0.2, z));
  // Gantry crane straddling the slipway
  const crane = hazard();
  for (const z of [-1.0, 1.0]) {
    g.add(box(0.14, 2.2, 0.14, crane, 1.0, 1.25, z));
    g.add(box(0.14, 2.2, 0.14, crane, 2.2, 1.25, z));
  }
  g.add(box(1.4, 0.18, 2.3, crane, 1.6, 2.4, 0));
  g.add(box(0.3, 0.25, 0.3, darkMetal(), 1.6, 2.2, 0.3));
  // A hull taking shape on the slip
  g.add(box(1.6, 0.35, 0.6, mat(C.hullGrey, { metal: 0.4 }), 1.8, 0.45, 0));
  return g;
}

function airfield(team: number): THREE.Group {
  // 6x5 footprint: runway along +z edge, four parking stands in the middle,
  // hangar and control tower at the back. Stand positions match sim/transport.ts.
  const t = teamMats(team);
  const g = new THREE.Group();
  g.add(box(5.9, 0.1, 4.9, concreteDark(), 0, 0.05, 0));
  const tarmac = mat(0x3d4043, { rough: 0.9 });
  const paint = mat(0xf2f2f2);
  g.add(box(5.9, 0.04, 1.3, tarmac, 0, 0.12, 1.65));
  for (let i = 0; i < 7; i++) g.add(box(0.45, 0.02, 0.08, paint, -2.55 + i * 0.85, 0.15, 1.65));
  for (const x of [-2.75, 2.75]) for (let k = 0; k < 4; k++) g.add(box(0.14, 0.02, 0.08, paint, x, 0.15, 1.25 + k * 0.27));
  // Taxiway and stands
  g.add(box(5.9, 0.03, 1.5, mat(0x585c60, { rough: 0.9 }), 0, 0.115, 0.15));
  const yellow = hazard();
  for (const x of [-2.1, -0.7, 0.7, 2.1]) {
    g.add(box(0.06, 0.02, 1.2, yellow, x, 0.14, 0.15));
    g.add(box(0.5, 0.02, 0.06, yellow, x, 0.14, -0.5));
  }
  // Hangar (arched roof along x)
  const hangar = mesh(
    cached('hangar6', () => new THREE.CylinderGeometry(0.75, 0.75, 2.4, 14, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2)),
    metal(), -1.4, 0.1, -1.75,
  );
  g.add(hangar);
  g.add(box(2.4, 0.08, 0.06, t.main, -1.4, 0.82, -1.0));
  g.add(box(1.6, 0.6, 0.04, darkMetal(), -1.4, 0.4, -1.03));
  // Fuel tanks
  for (const x of [0.5, 1.05]) {
    g.add(cyl(0.25, 0.25, 0.55, 10, mat(0xe8e2d0, { rough: 0.6 }), x, 0.38, -1.9));
    g.add(cyl(0.26, 0.26, 0.06, 10, t.main, x, 0.62, -1.9));
  }
  // Control tower
  g.add(cyl(0.22, 0.28, 1.8, 8, wall(), 2.3, 0.95, -1.75));
  g.add(cyl(0.42, 0.34, 0.4, 8, glass(), 2.3, 2.05, -1.75));
  g.add(cyl(0.45, 0.45, 0.08, 8, t.main, 2.3, 2.29, -1.75));
  const beacon = sphere(0.06, mat(0xff4a3a, { emissive: 0xff2a1a }), 2.3, 2.4, -1.75, 6);
  beacon.name = 'flare';
  g.add(beacon);
  // Windsock
  g.add(cyl(0.02, 0.02, 0.9, 4, darkMetal(), 2.8, 0.5, -0.8));
  g.add(mesh(cached('sock', () => new THREE.ConeGeometry(0.08, 0.35, 6).rotateZ(Math.PI / 2)), mat(0xff7a2a), 2.97, 0.9, -0.8));
  return g;
}

function radarStation(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2);
  g.add(box(0.9, 0.6, 0.9, wallGrey(), -0.3, 0.45, 0.3));
  g.add(box(0.92, 0.08, 0.92, t.main, -0.3, 0.78, 0.3));
  // Lattice mast
  for (const [x, z] of [[0.15, -0.55], [0.55, -0.55], [0.15, -0.15], [0.55, -0.15]] as const) g.add(box(0.05, 1.6, 0.05, darkMetal(), x, 0.95, z));
  for (const y of [0.6, 1.1, 1.6]) g.add(box(0.45, 0.04, 0.45, darkMetal(), 0.35, y, -0.35));
  const dish = new THREE.Group();
  dish.name = 'spin';
  dish.position.set(0.35, 1.85, -0.35);
  dish.add(box(1.3, 0.35, 0.05, metal(), 0, 0.1, 0.12));
  dish.add(box(0.08, 0.2, 0.25, darkMetal(), 0, -0.05, 0));
  g.add(dish);
  return g;
}

function researchLab(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(3, 3);
  g.add(box(2.4, 0.9, 2.0, wall(), -0.2, 0.6, 0.3));
  g.add(box(2.44, 0.1, 2.04, t.main, -0.2, 1.06, 0.3));
  windows(g, 6, 2.0, 0.6, 'x', 1.31, 0.18);
  g.add(cyl(0.75, 0.8, 0.4, 16, wallGrey(), 0.6, 1.25, -0.6));
  g.add(mesh(cached('labDome', () => new THREE.SphereGeometry(0.72, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0x9fe6ff, { emissive: 0x2a8fbf, metal: 0.3, rough: 0.2 }), 0.6, 1.45, -0.6));
  // Solar panels
  for (let i = 0; i < 3; i++) {
    const panel = box(0.6, 0.04, 0.4, mat(0x1d2f5a, { metal: 0.6, rough: 0.3 }), -0.9 + i * 0.65, 1.25, 0.8);
    panel.rotation.x = -0.4;
    g.add(panel);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Defenses

const sandbag = () => mat(0xb8a173, { rough: 1 });

/** One wall pillar; the pieces between neighbouring segments are drawn by the view. */
function wallPillar(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  g.add(box(0.62, 1.15, 0.62, mat(0xb8b4aa, { rough: 0.9 }), 0, 0.575, 0));
  g.add(box(0.7, 0.12, 0.7, mat(0x9c988e, { rough: 0.9 }), 0, 1.2, 0));
  g.add(box(0.64, 0.08, 0.64, t.main, 0, 0.9, 0));
  return g;
}

/** Gate along local x: two posts and a barrier that lifts for friendly units. */
function gate(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  for (const x of [-0.42, 0.42]) {
    g.add(box(0.2, 1.4, 0.5, mat(0xb8b4aa, { rough: 0.9 }), x, 0.7, 0));
    g.add(box(0.24, 0.12, 0.54, t.main, x, 1.42, 0));
  }
  const bar = new THREE.Group();
  bar.name = 'gateBar';
  bar.position.set(-0.32, 0.75, 0);
  bar.add(box(0.7, 0.55, 0.12, darkMetal(), 0.35, 0, 0));
  for (let i = 0; i < 3; i++) bar.add(box(0.12, 0.56, 0.13, hazard(), 0.1 + i * 0.22, 0, 0));
  g.add(bar);
  return g;
}

function watchtower(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const wood = mat(0x7a5a3a, { rough: 0.9 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = box(0.09, 2.2, 0.09, wood, sx * 0.3, 1.1, sz * 0.3);
      leg.rotation.z = -sx * 0.06;
      leg.rotation.x = sz * 0.06;
      g.add(leg);
    }
  }
  g.add(box(0.75, 0.04, 0.05, wood, 0, 1.0, 0.3), box(0.75, 0.04, 0.05, wood, 0, 1.0, -0.3));
  g.add(box(0.9, 0.12, 0.9, wood, 0, 2.2, 0));
  for (const [x, z, w, d] of [[0, 0.42, 0.9, 0.08], [0, -0.42, 0.9, 0.08], [0.42, 0, 0.08, 0.9], [-0.42, 0, 0.08, 0.9]] as const) g.add(box(w, 0.3, d, sandbag(), x, 2.4, z));
  g.add(cyl(0.05, 0.05, 0.6, 4, wood, 0.38, 2.6, 0.38), cyl(0.05, 0.05, 0.6, 4, wood, -0.38, 2.6, -0.38));
  g.add(box(1.0, 0.07, 1.0, t.main, 0, 2.92, 0));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 2.45, 0);
  turret.add(cylX(0.03, 0.45, 5, mat(C.black), 0.3, 0.08, 0));
  turret.add(box(0.14, 0.12, 0.12, mat(C.dark), 0.06, 0.06, 0));
  g.add(turret);
  return g;
}

function bunker(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const conc = mat(0x8f8b80, { rough: 1 });
  g.add(box(1.8, 0.5, 1.8, conc, 0, 0.25, 0));
  g.add(mesh(cached('bunkerTop', () => new THREE.CylinderGeometry(0.62, 0.9, 0.38, 8)), conc, 0, 0.69, 0));
  g.add(box(1.82, 0.08, 1.82, t.main, 0, 0.5, 0));
  const slit = mat(0x0c0c0c);
  for (const [x, z, w, d] of [[0, 0.91, 0.9, 0.04], [0, -0.91, 0.9, 0.04], [0.91, 0, 0.04, 0.9], [-0.91, 0, 0.04, 0.9]] as const) g.add(box(w, 0.1, d, slit, x, 0.32, z));
  for (let i = 0; i < 6; i++) g.add(box(0.36, 0.18, 0.22, sandbag(), -0.75 + (i % 3) * 0.75, 0.09, i < 3 ? 1.02 : -1.02));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 0.9, 0);
  turret.add(box(0.3, 0.16, 0.3, mat(C.dark)));
  turret.add(cylX(0.035, 0.5, 5, mat(C.black), 0.32, 0, 0));
  g.add(turret);
  return g;
}

function gunTurret(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  g.add(mesh(cached('turretBase', () => new THREE.CylinderGeometry(0.42, 0.48, 0.5, 8)), mat(0x9c988e, { rough: 0.9 }), 0, 0.25, 0));
  g.add(cyl(0.44, 0.44, 0.06, 8, t.main, 0, 0.5, 0));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 0.68, 0);
  turret.add(box(0.5, 0.28, 0.42, t.accent));
  turret.add(box(0.2, 0.14, 0.3, mat(C.steel), -0.18, 0.18, 0));
  for (const z of [0.09, -0.09]) turret.add(cylX(0.04, 0.62, 6, mat(C.steel, { metal: 0.6 }), 0.5, 0.02, z));
  g.add(turret);
  return g;
}

function samSite(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2);
  for (let i = 0; i < 4; i++) g.add(box(0.36, 0.2, 0.22, sandbag(), -0.6 + i * 0.4, 0.26, 0.8));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 0.3, 0);
  turret.add(cyl(0.3, 0.36, 0.25, 8, mat(C.dark), 0, 0.12, 0));
  const rack = new THREE.Group();
  rack.position.set(0, 0.45, 0);
  rack.rotation.z = 0.6;
  rack.add(box(0.9, 0.08, 0.6, t.main, 0, -0.08, 0));
  for (const z of [-0.2, 0.2]) {
    for (const y of [0.04, 0.2]) {
      rack.add(cylX(0.07, 0.85, 8, mat(0xe8e8e0), 0, y, z));
      rack.add(mesh(cached('samNose', () => new THREE.ConeGeometry(0.07, 0.18, 8).rotateZ(-Math.PI / 2)), mat(0xd04a3a), 0.5, y, z));
    }
  }
  turret.add(rack);
  g.add(turret);
  // Radar mast
  g.add(cyl(0.03, 0.03, 1.2, 4, darkMetal(), -0.75, 0.75, -0.7));
  const dish = new THREE.Group();
  dish.name = 'spin';
  dish.position.set(-0.75, 1.38, -0.7);
  dish.add(box(0.55, 0.18, 0.04, metal(), 0, 0, 0.05));
  g.add(dish);
  return g;
}

function coastalBattery(team: number): THREE.Group {
  const t = teamMats(team);
  const g = pad(2, 2);
  const conc = mat(0x8f8b80, { rough: 1 });
  g.add(box(1.7, 0.55, 1.7, conc, 0, 0.42, 0));
  g.add(box(1.72, 0.08, 1.72, t.main, 0, 0.72, 0));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0, 0.95, 0);
  turret.add(mesh(cached('coastalDome', () => new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat(C.hullGrey, { metal: 0.4 }), 0, -0.2, 0));
  turret.add(cylX(0.09, 1.5, 8, mat(C.steel, { metal: 0.6 }), 0.95, 0.05, 0));
  turret.add(cylX(0.13, 0.2, 8, mat(C.dark), 1.68, 0.05, 0));
  g.add(turret);
  return g;
}

/** Stand-in for buildings whose models arrive with their milestone. */
function genericBuilding(type: BuildingTypeId, team: number): THREE.Group {
  const t = teamMats(team);
  const [w, h] = BUILDINGS[type].size;
  const g = pad(w, h);
  const hgt = 0.8 + Math.min(w, h) * 0.25;
  g.add(box(w * 0.75, hgt, h * 0.75, wallGrey(), 0, hgt / 2 + 0.15, 0));
  g.add(box(w * 0.77, 0.12, h * 0.77, t.main, 0, hgt + 0.1, 0));
  return g;
}

export function buildBuildingModel(type: BuildingTypeId, team: number, level = 0): THREE.Group {
  const city = buildCityModel(type, team, level);
  if (city) return city;
  switch (type) {
    case 'command_center': return commandCenter(team);
    case 'habitat_block': return habitat(team);
    case 'ore_refinery': return refinery(team);
    case 'oil_derrick': return oilDerrick(team);
    case 'offshore_rig': return offshoreRig(team);
    case 'barracks': return barracks(team);
    case 'vehicle_factory': return vehicleFactory(team);
    case 'shipyard': return shipyard(team);
    case 'airfield': return airfield(team);
    case 'radar_station': return radarStation(team);
    case 'research_lab': return researchLab(team);
    case 'wall': return wallPillar(team);
    case 'gate': return gate(team);
    case 'watchtower': return watchtower(team);
    case 'bunker': return bunker(team);
    case 'gun_turret': return gunTurret(team);
    case 'sam_site': return samSite(team);
    case 'coastal_battery': return coastalBattery(team);
    default: return genericBuilding(type, team);
  }
}

/** Scaffolding shown while a building is under construction. */
export function buildScaffold(w: number, h: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const pole = mat(0xc9a24a, { rough: 0.7 });
  const hw = w / 2 - 0.08;
  const hh = h / 2 - 0.08;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.06, height, 0.06, pole, sx * hw, height / 2, sz * hh));
  for (let y = 0.6; y < height; y += 0.6) {
    g.add(box(w - 0.1, 0.04, 0.05, pole, 0, y, hh));
    g.add(box(w - 0.1, 0.04, 0.05, pole, 0, y, -hh));
    g.add(box(0.05, 0.04, h - 0.1, pole, hw, y, 0));
    g.add(box(0.05, 0.04, h - 0.1, pole, -hw, y, 0));
  }
  return g;
}


