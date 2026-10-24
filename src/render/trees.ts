// Low-poly trees shared by the terrain (instanced forests) and the town models.
// Three kinds: a layered conifer, a rounded broadleaf (a cluster of lumpy
// icosahedra) and a slim poplar. Canopies carry vertex colours (darker low down
// and on the undersides) that multiply the per-instance colour; foliage, needle
// and bark detail textures come from textures.ts. Everything stands on y = 0.

import * as THREE from 'three';
import { applyFow } from './fog.ts';
import { applyDetail } from './textures.ts';

export type TreeKind = 'conifer' | 'broadleaf' | 'poplar';
export const TREE_KINDS: readonly TreeKind[] = ['conifer', 'broadleaf', 'poplar'];

/** Trunk height (before the per-tree scale) for each kind. */
export const TRUNK_HEIGHT: Record<TreeKind, number> = { conifer: 0.42, broadleaf: 0.62, poplar: 0.5 };

/** Deterministic 0..1 hash of a position (so shared vertices move together). */
function h3(x: number, y: number, z: number, k: number): number {
  const s = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + k * 4.581) * 43758.5453;
  return s - Math.floor(s);
}

/** Push every vertex out or in a little (same amount for coincident vertices). */
function jitter(geo: THREE.BufferGeometry, amount: number, seed: number): void {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    p.setXYZ(i, x + (h3(x, y, z, seed) - 0.5) * amount, y + (h3(x, y, z, seed + 1) - 0.5) * amount, z + (h3(x, y, z, seed + 2) - 0.5) * amount);
  }
}

/**
 * Per-vertex shade: darker towards the base of the canopy and on downward faces, a
 * little random per face. `tiers`: vertices on the trunk axis (conifer tier tips) are
 * lit and rim vertices shaded, so each layer of branches stands out from the next.
 */
function shade(geo: THREE.BufferGeometry, y0: number, y1: number, seed: number, tiers = false): void {
  geo.computeVertexNormals();
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = geo.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let f = 0; f < p.count; f += 3) {
    const fr = 0.92 + h3(p.getX(f), p.getY(f), p.getZ(f), seed) * 0.16;
    for (let v = f; v < f + 3; v++) {
      const t = Math.max(0, Math.min(1, (p.getY(v) - y0) / (y1 - y0)));
      const up = n.getY(v) * 0.5 + 0.5;
      const onAxis = Math.abs(p.getX(v)) + Math.abs(p.getZ(v)) < 1e-4;
      const layer = tiers ? (onAxis ? 1.18 : 0.7) : 1;
      const s = (0.55 + 0.45 * t) * (0.78 + 0.3 * up) * fr * layer;
      col[v * 3] = s * 0.97;
      col[v * 3 + 1] = s;
      col[v * 3 + 2] = s * 0.94;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** One conifer tier: a cone whose rim alternates long drooping branch tips and short ones. */
function tier(r: number, y0: number, h: number, segs: number, twist: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const apex = [0, y0 + h, 0];
  const rim: Array<[number, number, number]> = [];
  for (let i = 0; i < segs; i++) {
    const a = twist + (i / segs) * Math.PI * 2;
    const long = i % 2 === 0;
    const rr = r * (long ? 1 : 0.78);
    rim.push([Math.cos(a) * rr, y0 + (long ? -0.06 : 0.04), Math.sin(a) * rr]);
  }
  for (let i = 0; i < segs; i++) {
    const a = rim[i]!;
    const b = rim[(i + 1) % segs]!;
    pos.push(...apex, ...b, ...a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    const a = p.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++, o += 3) {
      pos[o] = a.getX(i);
      pos[o + 1] = a.getY(i);
      pos[o + 2] = a.getZ(i);
    }
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

function blob(r: number, x: number, y: number, z: number, seed: number, sy = 1, dropUnderside = false): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, 0);
  g.rotateY(seed * 1.7);
  g.rotateX(seed * 0.9);
  jitter(g, r * 0.35, seed * 7);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  if (dropUnderside) g = withoutUnderside(g);
  return g;
}

/** Drop faces pointing well downwards (never seen from the strategy camera). */
function withoutUnderside(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const keep: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < p.count; f += 3) {
    a.fromBufferAttribute(p, f);
    b.fromBufferAttribute(p, f + 1);
    c.fromBufferAttribute(p, f + 2);
    const n = b.sub(a).cross(c.sub(a)).normalize();
    if (n.y > -0.75) for (let v = f; v < f + 3; v++) keep.push(p.getX(v), p.getY(v), p.getZ(v));
  }
  g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return out;
}

const canopies = new Map<TreeKind, THREE.BufferGeometry>();

/** Canopy geometry (24 triangles conifer, 50 broadleaf, 20 poplar; trunks add 10). */
export function canopyGeometry(kind: TreeKind): THREE.BufferGeometry {
  let g = canopies.get(kind);
  if (g) return g;
  if (kind === 'conifer') {
    g = merge([tier(0.52, 0.32, 0.78, 8, 0), tier(0.4, 0.7, 0.68, 8, 0.4), tier(0.27, 1.04, 0.62, 8, 0.8)]);
    shade(g, 0.25, 1.66, 3, true);
  } else if (kind === 'broadleaf') {
    g = merge([blob(0.44, 0, 1.02, 0, 1, 1, true), blob(0.34, 0.27, 0.82, 0.12, 2, 1, true), blob(0.33, -0.22, 0.86, -0.2, 3, 1, true)]);
    shade(g, 0.5, 1.45, 5);
  } else {
    g = merge([blob(0.3, 0, 1.15, 0, 4, 2.0)]);
    shade(g, 0.55, 1.75, 7);
  }
  g.computeBoundingSphere();
  canopies.set(kind, g);
  return g;
}

let trunkGeo: THREE.BufferGeometry | null = null;

/** Unit-height tapered trunk (10 triangles); scale y by TRUNK_HEIGHT. */
export function trunkGeometry(): THREE.BufferGeometry {
  return (trunkGeo ??= new THREE.CylinderGeometry(0.055, 0.085, 1, 5, 1, true).translate(0, 0.5, 0));
}

let mats: { foliage: THREE.MeshStandardMaterial; needles: THREE.MeshStandardMaterial; bark: THREE.MeshStandardMaterial } | null = null;

/** Materials for instanced trees (canopy colour comes from the instance colour). */
export function treeMaterials(): { foliage: THREE.MeshStandardMaterial; needles: THREE.MeshStandardMaterial; bark: THREE.MeshStandardMaterial } {
  if (mats) return mats;
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  const needles = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1, flatShading: true });
  applyDetail(foliage, 'foliage');
  applyDetail(needles, 'needles');
  applyDetail(bark, 'bark');
  mats = { foliage, needles, bark };
  return mats;
}

const cityMats = new Map<string, THREE.MeshStandardMaterial>();

function cityMat(kind: 'foliage' | 'needles' | 'bark', color: number): THREE.MeshStandardMaterial {
  const key = `${kind}${color}`;
  let m = cityMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, vertexColors: kind !== 'bark', flatShading: true, roughness: kind === 'bark' ? 1 : 0.9 });
    applyDetail(m, kind);
    applyFow(m);
    cityMats.set(key, m);
  }
  return m;
}

const CITY_GREENS: Record<TreeKind, number[]> = {
  conifer: [0x3a7a44, 0x2f6e3c],
  broadleaf: [0x5f9e48, 0x6eaa4c, 0x56943f],
  poplar: [0x7aae50, 0x6ea248],
};

/** A single (non-instanced) tree for building models; `pick` (0..1) chooses its shade. */
export function cityTree(kind: TreeKind, pick = 0): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeometry(), cityMat('bark', 0x5a4030));
  trunk.scale.y = TRUNK_HEIGHT[kind];
  const greens = CITY_GREENS[kind];
  const canopy = new THREE.Mesh(canopyGeometry(kind), cityMat(kind === 'conifer' ? 'needles' : 'foliage', greens[Math.floor(pick * greens.length) % greens.length]!));
  for (const m of [trunk, canopy]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}
