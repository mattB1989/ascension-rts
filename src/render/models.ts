// Procedural low-poly 3D models, built entirely in code (no asset files).
// Every model faces +X, sits on y = 0 (ships: y = 0 is the waterline) and is sized in tiles.

import * as THREE from 'three';
import type { UnitTypeId } from '../data/units.ts';
import { applyFow } from './fog.ts';

// ---------------------------------------------------------------------------
// Materials (cached per colour so units share them)

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: number, opts: { metal?: number; rough?: number; emissive?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.metal ?? 0.2}|${opts.rough ?? 0.7}|${opts.emissive ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      metalness: opts.metal ?? 0.2,
      roughness: opts.rough ?? 0.7,
      flatShading: true,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissive ? 0.6 : 0,
    });
    applyFow(m);
    matCache.set(key, m);
  }
  return m;
}

export const C = {
  dark: 0x2b2f33,
  steel: 0x5c636b,
  light: 0xb9c0c7,
  hullGrey: 0x6d7782,
  deck: 0x8a8f94,
  skin: 0xc99a74,
  black: 0x15181b,
  glass: 0x7fc4e8,
  yellow: 0xe0b23a,
  concrete: 0x9a9890,
};

/** Team colour variants: main, darker accent. */
export function teamMats(color: number): { main: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial } {
  const c = new THREE.Color(color);
  const accent = c.clone().multiplyScalar(0.6);
  return { main: mat(color, { metal: 0.3, rough: 0.55 }), accent: mat(accent.getHex(), { metal: 0.3, rough: 0.6 }) };
}

// ---------------------------------------------------------------------------
// Geometry helpers

const geoCache = new Map<string, THREE.BufferGeometry>();
export function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(cached(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z);
}

/** Cylinder along the Y axis. */
export function cyl(rt: number, rb: number, h: number, seg: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  return mesh(cached(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y, z);
}

/** Cylinder along the X axis (barrels, fuselages). */
export function cylX(r: number, len: number, seg: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const g = cached(`cylx${r},${len},${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2));
  return mesh(g, m, x, y, z);
}

export function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  return mesh(cached(`sph${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2))), m, x, y, z);
}

/** Flat outline (in the XZ plane, points given as [x, z]) extruded upwards by `height`. */
export function extrudeXZ(key: string, pts: Array<[number, number]>, height: number, m: THREE.Material, y = 0): THREE.Mesh {
  const g = cached(`ext${key}`, () => {
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  });
  return mesh(g, m, 0, y, 0);
}

// ---------------------------------------------------------------------------
// Units

function soldier(team: number, kind: 'rifle' | 'rocket' | 'engineer' | 'skyguard'): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  g.add(box(0.12, 0.24, 0.2, mat(C.dark), 0, 0.12, 0));
  g.add(box(0.16, 0.24, 0.26, t.main, 0, 0.36, 0));
  g.add(sphere(0.075, mat(C.skin), 0.01, 0.54, 0, 6));
  const helmet = kind === 'engineer' ? mat(C.yellow) : t.accent;
  g.add(sphere(0.085, helmet, 0, 0.57, 0, 6));
  if (kind === 'rifle') {
    g.add(box(0.34, 0.04, 0.04, mat(C.black), 0.14, 0.38, 0.1));
  } else if (kind === 'rocket') {
    g.add(cylX(0.05, 0.46, 6, mat(C.steel), 0.02, 0.5, 0.13));
  } else if (kind === 'skyguard') {
    const tube = cylX(0.045, 0.5, 6, mat(0x4a5a3a), 0.05, 0.56, 0.13);
    tube.rotation.z = 0.6; // pointed at the sky
    g.add(tube);
    g.add(box(0.06, 0.08, 0.1, mat(C.dark), 0.12, 0.5, 0.2));
  } else {
    g.add(box(0.12, 0.2, 0.2, mat(C.steel), -0.13, 0.38, 0));
    const tool = new THREE.Group();
    tool.name = 'tool';
    tool.position.set(0.06, 0.4, 0.12);
    tool.add(box(0.04, 0.04, 0.3, mat(0x7a5a3a), 0.1, 0, 0).rotateY(Math.PI / 2));
    tool.add(box(0.05, 0.12, 0.05, mat(C.steel, { metal: 0.6 }), 0.24, 0.02, 0));
    g.add(tool);
    const carry = mesh(cached('carryOre', () => new THREE.OctahedronGeometry(0.11, 0).scale(1, 1.4, 1)), mat(0x4fd1c5, { emissive: 0x1a8f86, rough: 0.3 }), -0.2, 0.55, 0);
    carry.name = 'carry';
    carry.visible = false;
    g.add(carry);
  }
  g.scale.setScalar(1.5);
  return g;
}

function tracks(len: number, width: number, gap: number): THREE.Mesh[] {
  const m = mat(C.dark, { rough: 0.9 });
  return [box(len, 0.24, width, m, 0, 0.12, gap), box(len, 0.24, width, m, 0, 0.12, -gap)];
}

function battleTank(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  for (const tr of tracks(1.45, 0.3, 0.34)) g.add(tr);
  g.add(box(1.3, 0.24, 0.66, t.main, 0, 0.34, 0));
  g.add(box(0.3, 0.14, 0.6, t.accent, 0.58, 0.3, 0)); // sloped front plate stand-in
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(-0.08, 0.53, 0);
  turret.add(box(0.62, 0.2, 0.5, t.main, 0, 0, 0));
  turret.add(box(0.2, 0.08, 0.2, t.accent, -0.12, 0.13, 0.1));
  turret.add(cylX(0.05, 0.85, 6, mat(C.steel, { metal: 0.6 }), 0.68, 0.02, 0));
  g.add(turret);
  return g;
}

function flakTrack(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  for (const tr of tracks(1.15, 0.24, 0.3)) g.add(tr);
  g.add(box(1.1, 0.24, 0.58, t.main, 0, 0.33, 0));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(-0.1, 0.52, 0);
  turret.add(box(0.42, 0.18, 0.44, t.accent));
  for (const z of [0.12, -0.12]) {
    const barrel = cylX(0.035, 0.6, 6, mat(C.steel, { metal: 0.6 }), 0.25, 0.2, z);
    barrel.rotation.z = 0.7;
    turret.add(barrel);
  }
  turret.add(box(0.1, 0.12, 0.3, mat(C.light), -0.15, 0.15, 0)); // radar
  g.add(turret);
  return g;
}

function scoutBuggy(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  g.add(box(0.95, 0.14, 0.48, t.main, 0, 0.26, 0));
  g.add(box(0.3, 0.12, 0.46, t.accent, 0.3, 0.36, 0));
  const wheel = mat(C.black, { rough: 0.95 });
  const wg = cached('wheel', () => new THREE.CylinderGeometry(0.15, 0.15, 0.12, 8).rotateX(Math.PI / 2));
  for (const x of [0.32, -0.32]) for (const z of [0.29, -0.29]) g.add(mesh(wg, wheel, x, 0.15, z));
  const bar = mat(C.dark);
  g.add(box(0.05, 0.3, 0.05, bar, -0.08, 0.46, 0.2));
  g.add(box(0.05, 0.3, 0.05, bar, -0.08, 0.46, -0.2));
  g.add(box(0.05, 0.05, 0.45, bar, -0.08, 0.6, 0));
  g.add(cylX(0.03, 0.4, 5, mat(C.steel), 0.05, 0.66, 0));
  return g;
}

function destroyer(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const outline: Array<[number, number]> = [
    [-1.45, 0.34], [0.5, 0.42], [1.05, 0.3], [1.6, 0], [1.05, -0.3], [0.5, -0.42], [-1.45, -0.34],
  ];
  g.add(extrudeXZ('destroyerHull', outline, 0.42, mat(C.hullGrey, { metal: 0.4, rough: 0.5 }), -0.18));
  const deckOutline: Array<[number, number]> = [
    [-1.4, 0.3], [0.5, 0.38], [1.0, 0.27], [1.5, 0], [1.0, -0.27], [0.5, -0.38], [-1.4, -0.3],
  ];
  g.add(extrudeXZ('destroyerDeck', deckOutline, 0.04, mat(C.deck), 0.24));
  g.add(box(0.7, 0.32, 0.46, mat(C.light), -0.1, 0.44, 0)); // bridge
  g.add(box(0.72, 0.06, 0.48, t.main, -0.1, 0.62, 0)); // team-coloured roof band
  g.add(box(0.3, 0.12, 0.3, mat(C.light), -0.1, 0.71, 0));
  g.add(cyl(0.03, 0.04, 0.7, 5, mat(C.dark), -0.2, 1.0, 0)); // mast
  g.add(box(0.05, 0.05, 0.4, mat(C.dark), -0.2, 1.15, 0));
  g.add(cyl(0.12, 0.14, 0.32, 8, mat(C.hullGrey), -0.75, 0.42, 0)); // funnel
  g.add(box(0.12, 0.04, 0.3, t.main, -0.75, 0.6, 0));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0.75, 0.34, 0);
  turret.add(box(0.3, 0.14, 0.26, mat(C.light)));
  turret.add(cylX(0.035, 0.45, 6, mat(C.steel), 0.3, 0.02, 0));
  g.add(turret);
  g.add(box(0.35, 0.12, 0.3, mat(C.steel), -1.15, 0.33, 0)); // missile box
  return g;
}

function patrolBoat(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const outline: Array<[number, number]> = [[-0.75, 0.26], [0.3, 0.3], [0.85, 0], [0.3, -0.3], [-0.75, -0.26]];
  g.add(extrudeXZ('patrolHull', outline, 0.3, mat(C.hullGrey, { metal: 0.4 }), -0.12));
  g.add(box(0.4, 0.22, 0.34, mat(C.light), -0.15, 0.29, 0));
  g.add(box(0.1, 0.16, 0.34, mat(C.glass, { metal: 0.5, rough: 0.2 }), 0.08, 0.3, 0));
  g.add(box(0.42, 0.04, 0.36, t.main, -0.15, 0.42, 0));
  g.add(cylX(0.025, 0.3, 5, mat(C.dark), 0.45, 0.3, 0));
  return g;
}

function fighterJet(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const body = mat(C.light, { metal: 0.5, rough: 0.4 });
  g.add(cylX(0.12, 1.2, 8, body, -0.05, 0, 0));
  const nose = mesh(cached('jetNose', () => new THREE.ConeGeometry(0.12, 0.45, 8).rotateZ(-Math.PI / 2)), body, 0.77, 0, 0);
  g.add(nose);
  g.add(box(0.28, 0.1, 0.14, mat(C.glass, { metal: 0.5, rough: 0.15 }), 0.35, 0.1, 0)); // canopy
  const wing: Array<[number, number]> = [[0.3, 0.08], [-0.45, 0.85], [-0.62, 0.85], [-0.55, 0.08], [-0.55, -0.08], [-0.62, -0.85], [-0.45, -0.85], [0.3, -0.08]];
  g.add(extrudeXZ('jetWing', wing, 0.04, t.main, -0.02));
  const fin: Array<[number, number]> = [[-0.35, 0], [-0.65, 0.4], [-0.75, 0.4], [-0.7, 0]];
  for (const z of [0.1, -0.1]) {
    const f = mesh(
      cached('jetFin', () => {
        const shape = new THREE.Shape(fin.map(([x, y]) => new THREE.Vector2(x, y)));
        return new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
      }),
      t.accent, 0, 0.05, z,
    );
    f.rotation.x = z > 0 ? -0.25 : 0.25;
    g.add(f);
  }
  g.add(cylX(0.08, 0.1, 8, mat(0xff8a3d, { emissive: 0xff6a00 }), -0.68, 0, 0)); // afterburner glow
  return g;
}

function attackHelicopter(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const body = mesh(cached('heliBody', () => new THREE.SphereGeometry(0.3, 8, 6).scale(1.5, 0.85, 0.75)), t.main, 0.1, 0, 0);
  g.add(body);
  g.add(box(0.22, 0.14, 0.2, mat(C.glass, { metal: 0.5, rough: 0.15 }), 0.42, 0.06, 0));
  g.add(cylX(0.06, 0.9, 6, t.accent, -0.6, 0.05, 0)); // tail boom
  g.add(box(0.18, 0.28, 0.04, t.accent, -1.02, 0.15, 0)); // tail fin
  const tailRotor = box(0.03, 0.3, 0.03, mat(C.dark), -1.02, 0.18, 0.05);
  tailRotor.name = 'tailRotor';
  g.add(tailRotor);
  g.add(box(0.12, 0.05, 0.9, t.accent, 0, -0.05, 0)); // stub wings
  for (const z of [0.42, -0.42]) g.add(cylX(0.05, 0.3, 6, mat(C.steel), 0.05, -0.12, z));
  const skid = mat(C.dark);
  for (const z of [0.18, -0.18]) g.add(box(0.7, 0.03, 0.03, skid, 0.05, -0.32, z));
  g.add(cyl(0.03, 0.03, 0.18, 5, mat(C.dark), 0.1, 0.33, 0));
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.set(0.1, 0.43, 0);
  const blade = mat(C.black);
  rotor.add(box(2.0, 0.02, 0.09, blade));
  rotor.add(box(0.09, 0.02, 2.0, blade));
  g.add(rotor);
  return g;
}

function cargoPlane(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const body = mat(0x8f9aa3, { metal: 0.4, rough: 0.5 });
  g.add(cylX(0.24, 1.9, 10, body, 0, 0, 0));
  g.add(mesh(cached('cargoNose', () => new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2)), body, 0.95, 0, 0));
  // Upswept tail with a loading ramp
  const tail = mesh(cached('cargoTail', () => new THREE.CylinderGeometry(0.24, 0.1, 0.8, 10).rotateZ(Math.PI / 2)), body, -1.3, 0.1, 0);
  tail.rotation.z = -0.12;
  g.add(tail);
  // High wing with two engines each side
  g.add(box(0.5, 0.05, 2.9, t.main, 0.1, 0.22, 0));
  for (const z of [-1.0, -0.5, 0.5, 1.0]) {
    g.add(cylX(0.08, 0.38, 8, mat(C.dark), 0.25, 0.12, z));
    const prop = box(0.02, 0.36, 0.04, mat(C.black), 0.46, 0.12, z);
    prop.name = 'prop';
    g.add(prop);
  }
  // T-tail
  g.add(box(0.35, 0.5, 0.04, t.accent, -1.6, 0.42, 0));
  g.add(box(0.3, 0.04, 1.0, t.accent, -1.65, 0.66, 0));
  g.add(box(0.2, 0.07, 0.3, mat(C.glass, { metal: 0.5, rough: 0.2 }), 0.85, 0.13, 0));
  return g;
}

/** Parachute canopy (shown over paratroopers while they descend). */
export function buildChute(team: number): THREE.Group {
  const g = new THREE.Group();
  const canopy = mesh(cached('chute', () => new THREE.SphereGeometry(0.55, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.6)), mat(0xf1efe8, { rough: 0.9 }), 0, 1.1, 0);
  g.add(canopy);
  g.add(mesh(cached('chuteBand', () => new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10, 1, true)), teamMats(team).main, 0, 1.12, 0));
  for (const [x, z] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]] as const) {
    const line = box(0.012, 0.75, 0.012, mat(C.dark), x * 0.55, 0.75, z * 0.55);
    line.rotation.z = -x * 0.6;
    line.rotation.x = z * 0.6;
    g.add(line);
  }
  return g;
}

function howitzer(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  for (const tr of tracks(1.5, 0.28, 0.34)) g.add(tr);
  g.add(box(1.4, 0.26, 0.66, t.main, 0, 0.36, 0));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(-0.2, 0.6, 0);
  turret.add(box(0.75, 0.32, 0.56, t.accent));
  const barrel = cylX(0.06, 1.4, 6, mat(C.steel, { metal: 0.6 }), 0.75, 0.25, 0);
  barrel.rotation.z = 0.35;
  turret.add(barrel);
  turret.add(cylX(0.09, 0.2, 6, mat(C.dark), 1.38, 0.5, 0).rotateZ(0.35));
  g.add(turret);
  return g;
}

function seaEngineer(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const outline: Array<[number, number]> = [[-0.7, 0.32], [0.35, 0.34], [0.8, 0], [0.35, -0.34], [-0.7, -0.32]];
  g.add(extrudeXZ('seaEngHull', outline, 0.3, mat(0xc98a2a, { rough: 0.6 }), -0.12));
  g.add(box(0.36, 0.26, 0.4, mat(C.light), -0.35, 0.3, 0));
  g.add(box(0.38, 0.04, 0.42, t.main, -0.35, 0.45, 0));
  // Little work crane
  g.add(cyl(0.04, 0.05, 0.5, 5, mat(C.yellow), 0.2, 0.42, 0));
  const jib = box(0.6, 0.05, 0.05, mat(C.yellow), 0.45, 0.66, 0);
  jib.rotation.z = -0.35;
  g.add(jib);
  return g;
}

function frigate(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const outline: Array<[number, number]> = [[-1.25, 0.3], [0.45, 0.37], [0.9, 0.26], [1.4, 0], [0.9, -0.26], [0.45, -0.37], [-1.25, -0.3]];
  g.add(extrudeXZ('frigateHull', outline, 0.38, mat(C.hullGrey, { metal: 0.4, rough: 0.5 }), -0.16));
  g.add(box(0.9, 0.36, 0.44, mat(C.light), -0.15, 0.4, 0));
  g.add(box(0.92, 0.06, 0.46, t.main, -0.15, 0.6, 0));
  // Radar mast with a rotating array
  g.add(cyl(0.05, 0.08, 0.6, 5, mat(C.dark), -0.1, 0.9, 0));
  const radar = box(0.08, 0.18, 0.5, mat(C.light), -0.1, 1.22, 0);
  radar.name = 'radar';
  g.add(radar);
  // Vertical launch cells fore and aft
  for (const x of [0.65, -0.85]) g.add(box(0.3, 0.06, 0.3, mat(C.steel), x, 0.25, 0));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.set(0.95, 0.3, 0);
  turret.add(box(0.22, 0.12, 0.2, mat(C.light)));
  turret.add(cylX(0.03, 0.3, 5, mat(C.steel), 0.2, 0.02, 0));
  g.add(turret);
  return g;
}

function transportShip(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const outline: Array<[number, number]> = [[-1.3, 0.48], [0.9, 0.5], [1.3, 0.38], [1.3, -0.38], [0.9, -0.5], [-1.3, -0.48]];
  g.add(extrudeXZ('transportHull', outline, 0.42, mat(0x5a6670, { metal: 0.4, rough: 0.55 }), -0.18));
  // Open cargo well with a bow ramp
  g.add(box(1.7, 0.04, 0.78, mat(0x3d4247), 0.05, 0.25, 0));
  g.add(box(0.08, 0.3, 0.86, t.main, 1.28, 0.35, 0));
  g.add(box(0.5, 0.45, 0.8, mat(C.light), -1.0, 0.45, 0));
  g.add(box(0.06, 0.12, 0.6, mat(C.glass, { metal: 0.5, rough: 0.2 }), -0.74, 0.55, 0));
  g.add(box(0.52, 0.05, 0.82, t.main, -1.0, 0.7, 0));
  return g;
}

/** Digital age: a soldier in a powered exoskeleton with a heavy rifle. */
function exoTrooper(team: number): THREE.Group {
  const t = teamMats(team);
  const frame = mat(0x50565c, { metal: 0.6, rough: 0.4 });
  const g = new THREE.Group();
  for (const z of [0.07, -0.07]) {
    g.add(box(0.1, 0.26, 0.09, frame, 0, 0.13, z));
    g.add(box(0.16, 0.04, 0.11, mat(C.dark), 0.02, 0.02, z));
  }
  g.add(box(0.2, 0.28, 0.3, t.main, 0, 0.4, 0));
  g.add(box(0.12, 0.22, 0.26, frame, -0.12, 0.42, 0)); // power pack
  g.add(box(0.03, 0.05, 0.2, mat(0x40e0f0, { emissive: 0x20c0e0 }), -0.19, 0.46, 0));
  g.add(sphere(0.095, t.accent, 0.01, 0.62, 0, 6));
  g.add(box(0.05, 0.05, 0.12, mat(0x40e0f0, { emissive: 0x20a0c0 }), 0.08, 0.63, 0)); // visor
  g.add(box(0.42, 0.06, 0.06, mat(C.black), 0.18, 0.42, 0.14));
  g.add(box(0.12, 0.1, 0.07, frame, 0.04, 0.42, 0.14));
  g.scale.setScalar(1.6);
  return g;
}

/** Digital age: a wheeled launcher with a tilted rocket pod. */
function rocketArtillery(team: number): THREE.Group {
  const t = teamMats(team);
  const g = new THREE.Group();
  const tyre = mat(C.dark, { rough: 0.9 });
  for (const x of [-0.5, -0.1, 0.45]) for (const z of [0.3, -0.3]) g.add(cyl(0.14, 0.14, 0.1, 10, tyre, x, 0.14, z).rotateX(Math.PI / 2));
  g.add(box(1.4, 0.18, 0.56, t.main, 0, 0.3, 0));
  g.add(box(0.36, 0.34, 0.54, t.main, 0.52, 0.52, 0)); // cab
  g.add(box(0.04, 0.16, 0.44, mat(C.glass, { metal: 0.5, rough: 0.2 }), 0.71, 0.58, 0));
  const pod = new THREE.Group();
  pod.name = 'turret';
  pod.position.set(-0.3, 0.45, 0);
  const launcher = new THREE.Group();
  launcher.rotation.z = 0.45;
  launcher.add(box(0.8, 0.3, 0.46, t.accent, 0.2, 0.15, 0));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) launcher.add(cylX(0.05, 0.04, 6, mat(C.black), 0.61, 0.07 + j * 0.15, -0.14 + i * 0.14));
  pod.add(launcher);
  g.add(pod);
  return g;
}

/** Digital age: the first mech, a two-legged walker with shoulder guns. */
function warden(team: number): THREE.Group {
  const t = teamMats(team);
  const frame = mat(0x5a6068, { metal: 0.6, rough: 0.4 });
  const g = new THREE.Group();
  for (const z of [0.28, -0.28]) {
    g.add(box(0.5, 0.08, 0.26, mat(C.dark), 0.05, 0.04, z)); // feet
    g.add(box(0.16, 0.5, 0.18, frame, 0, 0.32, z)); // shins
    g.add(box(0.2, 0.4, 0.22, t.main, -0.05, 0.75, z)); // thighs
  }
  g.add(box(0.5, 0.2, 0.7, frame, -0.02, 0.98, 0)); // hips
  const torso = new THREE.Group();
  torso.name = 'turret';
  torso.position.set(0, 1.3, 0);
  torso.add(box(0.7, 0.5, 0.8, t.main, 0, 0, 0));
  torso.add(box(0.2, 0.18, 0.5, mat(0x40e0f0, { emissive: 0x2090b0, metal: 0.4 }), 0.36, 0.08, 0)); // cockpit
  for (const z of [0.5, -0.5]) {
    torso.add(box(0.4, 0.3, 0.22, t.accent, 0, 0.12, z));
    torso.add(cylX(0.06, 0.7, 6, mat(C.steel, { metal: 0.6 }), 0.45, 0.12, z));
  }
  torso.add(box(0.3, 0.2, 0.3, frame, -0.3, 0.3, 0));
  g.add(torso);
  return g;
}

export function buildUnitModel(type: UnitTypeId, team: number): THREE.Group {
  switch (type) {
    case 'exo_trooper':
      return exoTrooper(team);
    case 'rocket_artillery':
      return rocketArtillery(team);
    case 'warden':
      return warden(team);
    case 'engineer':
      return soldier(team, 'engineer');
    case 'rifleman':
      return soldier(team, 'rifle');
    case 'rocket_trooper':
      return soldier(team, 'rocket');
    case 'skyguard':
      return soldier(team, 'skyguard');
    case 'howitzer':
      return howitzer(team);
    case 'sea_engineer':
      return seaEngineer(team);
    case 'frigate':
      return frigate(team);
    case 'transport_ship':
      return transportShip(team);
    case 'cargo_plane':
      return cargoPlane(team);
    case 'battle_tank':
      return battleTank(team);
    case 'flak_track':
      return flakTrack(team);
    case 'scout_buggy':
      return scoutBuggy(team);
    case 'destroyer':
      return destroyer(team);
    case 'patrol_boat':
      return patrolBoat(team);
    case 'fighter_jet':
      return fighterJet(team);
    case 'attack_helicopter':
      return attackHelicopter(team);
    default:
      return placeholder(team);
  }
}

/** Stand-in for units whose models arrive with their age (M5+). */
function placeholder(team: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.8, 0.5, 0.6, teamMats(team).main, 0, 0.25, 0));
  return g;
}

// ---------------------------------------------------------------------------
// Buildings and map features

export function buildOreCrystals(seedish: number): THREE.Group {
  const g = new THREE.Group();
  const m = mat(0x4fd1c5, { metal: 0.1, rough: 0.25, emissive: 0x1a8f86 });
  const geo = cached('crystal', () => new THREE.OctahedronGeometry(0.35, 0).scale(0.6, 1.4, 0.6));
  const n = 4 + (seedish % 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seedish;
    const r = i === 0 ? 0 : 0.35 + ((seedish * (i + 3)) % 7) * 0.04;
    const c = mesh(geo, m, Math.cos(a) * r, 0.3, Math.sin(a) * r);
    const s = i === 0 ? 1.2 : 0.6 + ((seedish + i) % 5) * 0.1;
    c.scale.setScalar(s);
    c.position.y = 0.3 * s;
    c.rotation.set(((seedish + i) % 3) * 0.2 - 0.2, a, ((seedish * i) % 4) * 0.12 - 0.18);
    g.add(c);
  }
  return g;
}

export function buildOilSpot(offshore: boolean): THREE.Group {
  const g = new THREE.Group();
  const pool = mesh(
    cached('oilPool', () => new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2)),
    new THREE.MeshStandardMaterial({ color: offshore ? 0x2a2030 : 0x2a211b, roughness: 0.12, metalness: 0.6, transparent: true, opacity: offshore ? 0.7 : 0.9 }),
    0, 0.03, 0,
  );
  pool.scale.set(offshore ? 1.6 : 0.8, 1, offshore ? 1.3 : 0.6);
  pool.castShadow = false;
  g.add(pool);
  if (!offshore) {
    for (let i = 0; i < 3; i++) g.add(sphere(0.06 + i * 0.02, mat(0x111111, { rough: 0.2, metal: 0.6 }), -0.35 + i * 0.22, 0.04, (i % 2) * 0.2 - 0.1, 6));
    g.add(cyl(0.07, 0.09, 0.4, 6, mat(0x6b4a2e), 0.3, 0.2, 0.15)); // rusty pipe stub
    g.add(cyl(0.12, 0.12, 0.06, 6, mat(0xd0a030), 0.3, 0.42, 0.15));
  } else {
    // Small marker buoy so offshore oil is easy to spot.
    g.add(cyl(0.08, 0.12, 0.35, 6, mat(0xf2a33a), 0, 0.12, 0));
    g.add(sphere(0.07, mat(0xff5a3c, { emissive: 0xff3a1c }), 0, 0.36, 0, 6));
  }
  return g;
}
