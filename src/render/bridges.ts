// Bridges: a straight deck per bridge (following the same height profile the
// sim uses for units on it), side walls, railings and pillars to the seabed.
// Built as a few merged meshes (one draw call each).

import * as THREE from 'three';
import { bridgeDeckHeight, groundHeight, type BridgeInfo, type GameMap } from '../sim/map.ts';
import { applyDetail, type DetailKind } from './textures.ts';

const DECK_THICKNESS = 0.25;
const STEP = 0.5; // tiles between cross-sections along the deck
const S2 = Math.SQRT1_2;

class GeoBuilder {
  readonly pos: number[] = [];
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
    }
  }
  mesh(material: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

/** World position (three.js: x, y up, z) of a point on a bridge at (p, q offset) and height y. */
function at(b: BridgeInfo, p: number, dq: number, y: number): THREE.Vector3 {
  const q = b.q + dq;
  return new THREE.Vector3((p + q) * S2, y, (p - q) * S2);
}

export function buildBridges(map: GameMap): THREE.Group {
  const deck = new GeoBuilder();
  const sides = new GeoBuilder();
  const rails = new GeoBuilder();
  const pillars = new GeoBuilder();
  const lines = new GeoBuilder();
  const pillarGeo = new THREE.CylinderGeometry(0.28, 0.34, 1, 6);
  const postGeo = new THREE.BoxGeometry(0.09, 0.36, 0.09);
  const m4 = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  for (const b of map.bridges) {
    const hw = b.halfWidth;
    const len = b.pEnd - b.pStart;
    const n = Math.max(2, Math.ceil(len / STEP));
    for (let i = 0; i < n; i++) {
      const p0 = b.pStart + (len * i) / n;
      const p1 = b.pStart + (len * (i + 1)) / n;
      const y0 = bridgeDeckHeight(b, p0);
      const y1 = bridgeDeckHeight(b, p1);
      // Road surface. (+q side is "left" when looking along +p; order keeps faces pointing up.)
      const a = at(b, p0, hw, y0);
      const c = at(b, p1, hw, y1);
      const d = at(b, p1, -hw, y1);
      const e = at(b, p0, -hw, y0);
      deck.quad(a, e, d, c);
      // Lane markings: dashed centre line.
      if (i % 3 === 0) lines.quad(at(b, p0, 0.07, y0 + 0.01), at(b, p0, -0.07, y0 + 0.01), at(b, p1, -0.07, y1 + 0.01), at(b, p1, 0.07, y1 + 0.01));
      // Side walls below the deck edge.
      for (const sgn of [1, -1]) {
        const top0 = at(b, p0, sgn * hw, y0);
        const top1 = at(b, p1, sgn * hw, y1);
        sides.quad(top0, top1, at(b, p1, sgn * hw, y1 - DECK_THICKNESS), at(b, p0, sgn * hw, y0 - DECK_THICKNESS));
        // Railing: continuous bar plus posts every tile.
        const r0 = at(b, p0, sgn * (hw - 0.05), y0 + 0.32);
        const r1 = at(b, p1, sgn * (hw - 0.05), y1 + 0.32);
        const r0b = at(b, p0, sgn * (hw - 0.12), y0 + 0.32);
        const r1b = at(b, p1, sgn * (hw - 0.12), y1 + 0.32);
        rails.quad(r0, r1, r1.clone().setY(r1.y - 0.07), r0.clone().setY(r0.y - 0.07));
        rails.quad(r0b, r0, r1, r1b); // top of the rail
        if (i % 2 === 0) {
          const pp = at(b, p0, sgn * (hw - 0.08), y0 + 0.17);
          m4.compose(pp, q0, one);
          rails.add(postGeo, m4);
        }
      }
    }
    // End caps.
    for (const p of [b.pStart, b.pEnd]) {
      const y = bridgeDeckHeight(b, p);
      sides.quad(at(b, p, hw, y), at(b, p, -hw, y), at(b, p, -hw, y - DECK_THICKNESS), at(b, p, hw, y - DECK_THICKNESS));
    }
    // Pillars in pairs every few tiles, down to the seabed.
    for (let p = b.pStart + 3; p < b.pEnd - 2; p += 3.5) {
      for (const sgn of [1, -1]) {
        const top = at(b, p, sgn * (hw - 0.7), bridgeDeckHeight(b, p) - DECK_THICKNESS);
        const bottom = groundHeight(map, top.x, top.z);
        const h = top.y - bottom;
        if (h < 0.3) continue;
        m4.compose(new THREE.Vector3(top.x, bottom + h / 2, top.z), q0, new THREE.Vector3(1, h, 1));
        pillars.add(pillarGeo, m4);
      }
    }
  }

  const g = new THREE.Group();
  g.name = 'bridges';
  // World-space detail: asphalt on the deck, cast concrete below, brushed metal railings.
  const mat = (opts: THREE.MeshStandardMaterialParameters, kind: DetailKind) => {
    const m = new THREE.MeshStandardMaterial(opts);
    applyDetail(m, kind);
    return m;
  };
  g.add(deck.mesh(mat({ color: 0x5c5f63, roughness: 0.85, flatShading: true }, 'asphalt')));
  const lineMesh = lines.mesh(new THREE.MeshStandardMaterial({ color: 0xe8d36a, roughness: 0.6 }));
  lineMesh.castShadow = false;
  g.add(lineMesh);
  g.add(sides.mesh(mat({ color: 0xa8a59d, roughness: 0.9, flatShading: true, side: THREE.DoubleSide }, 'concrete')));
  g.add(rails.mesh(mat({ color: 0xd8dde2, roughness: 0.5, metalness: 0.4, flatShading: true, side: THREE.DoubleSide }, 'metal')));
  g.add(pillars.mesh(mat({ color: 0x9a978f, roughness: 0.9, flatShading: true }, 'concrete')));
  return g;
}
