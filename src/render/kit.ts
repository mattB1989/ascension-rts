// The building kit: low-poly models assembled from primitives, then merged into
// ONE vertex-coloured mesh per part, so a whole building costs one or two draw
// calls however detailed it is. Everything that makes a model read well is baked
// into the vertices, free at run time:
//
// - colour per primitive, darkened toward its own base (`grade`), so stacked
//   parts separate and every block looks lit from above even without shadows;
// - contact shade near the ground (`ao`);
// - chamfered top edges on blocks, lightened (the crisp edge highlight);
// - a surface per vertex: matte, metal or glass (roughness and metalness);
// - a detail texture per vertex (brick, roof tiles, concrete, timber, plaster,
//   metal panels, glass, lawn: see textures.ts), sampled by world position;
// - a glow weight (windows, lamps, beacons) that the shader turns into light,
//   brighter at night (`kitUniforms.uGlow`, set by the renderer).
//
// Coordinates: tiles; y up; a building's model sits centred on its footprint at
// y = 0. Animated parts (named 'spin', 'beam', 'crank', 'flare', 'turret'…) are
// sub-kits built as separate meshes pivoting at their own origin; 'smoke' is an
// empty anchor where chimney smoke puffs start.

import * as THREE from 'three';
import { applyFow } from './fog.ts';
import { buildingTextures, detailUniforms, KINDS, type DetailKind } from './textures.ts';

export type Vec3 = [number, number, number];
export type Surface = 'matte' | 'metal' | 'glass' | 'gloss';

export interface PartOpts {
  /** Euler rotation in radians (XYZ). */
  rot?: Vec3;
  /** Light it gives off, 0..1 (windows ~0.6, lamps 1). */
  glow?: number;
  /** Detail texture. */
  tex?: DetailKind;
  surface?: Surface;
  /** Colour multiplier for this primitive (quick shade variants). */
  shade?: number;
  /** No base-darkening for this primitive (e.g. thin trims). */
  flat?: boolean;
}

export interface BlockOpts extends PartOpts {
  /** Chamfer on the top edges (tiles). */
  bevel?: number;
  /** Colour multiplier on the chamfer (default 1.25: a highlight). */
  edge?: number;
  /** Top narrower than the base by this fraction. */
  taper?: number;
}

const KIND_ORDER: DetailKind[] = ['brick', 'tiles', 'concrete', 'planks', 'plaster', 'panels', 'glass', 'lawn'];
const SURFACE: Record<Surface, number> = { matte: 0, metal: 1, glass: 2, gloss: 3 };

/** Shared by every kit material: how bright glowing parts are (night raises it). */
export const kitUniforms = { uGlow: { value: 0.55 } };

let material: THREE.MeshStandardMaterial | null = null;

/** The one material every kit mesh uses. */
export function kitMaterial(): THREE.MeshStandardMaterial {
  if (material) return material;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.05 });
  const masks = KIND_ORDER.map((k) => new THREE.Vector4(...[0, 1, 2, 3].map((c) => (c === KINDS[k].chan ? 1 : 0))));
  m.onBeforeCompile = (shader) => {
    const [texA, texB] = buildingTextures();
    shader.uniforms.uDetA = { value: texA };
    shader.uniforms.uDetB = { value: texB };
    shader.uniforms.uKMask = { value: [new THREE.Vector4(), ...masks] };
    shader.uniforms.uKScale = { value: [1, ...KIND_ORDER.map((k) => 1 / KINDS[k].size)] };
    shader.uniforms.uKStr = { value: [0, ...KIND_ORDER.map((k) => KINDS[k].strength)] };
    shader.uniforms.uKTex = { value: [0, ...KIND_ORDER.map((k) => KINDS[k].tex)] };
    shader.uniforms.uGlow = kitUniforms.uGlow;
    shader.uniforms.uDetailOn = detailUniforms.uDetailOn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float kind;\nattribute float glow;\nattribute float surf;\nvarying float vKind;\nvarying float vGlow;\nvarying float vSurf;\nvarying vec3 vKitPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vKind = kind; vGlow = glow; vSurf = surf;
        vec4 kitW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          kitW = instanceMatrix * kitW;
        #endif
        vKitPos = (modelMatrix * kitW).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vKind; varying float vGlow; varying float vSurf; varying vec3 vKitPos;
        uniform sampler2D uDetA; uniform sampler2D uDetB;
        uniform vec4 uKMask[9]; uniform float uKScale[9]; uniform float uKStr[9]; uniform float uKTex[9];
        uniform float uGlow; uniform float uDetailOn;
        float kitSample(vec2 uv, int k) {
          vec4 t = uKTex[k] > 0.5 ? texture2D(uDetB, uv) : texture2D(uDetA, uv);
          return dot(t, uKMask[k]);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          int k = int(vKind + 0.5);
          if (k > 0 && uDetailOn > 0.5) {
            vec3 fn = normalize(cross(dFdx(vKitPos), dFdy(vKitPos)));
            vec3 w = pow(abs(fn), vec3(6.0));
            w /= (w.x + w.y + w.z + 1e-4);
            vec3 p = vKitPos * uKScale[k];
            float d = kitSample(vec2(p.z, -p.y), k) * w.x + kitSample(p.xz, k) * w.y + kitSample(vec2(p.x, -p.y), k) * w.z;
            diffuseColor.rgb *= mix(1.0, d * 2.0, uKStr[k]);
          }
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = vSurf < 0.5 ? roughnessFactor : vSurf < 1.5 ? 0.42 : vSurf < 2.5 ? 0.12 : 0.3;`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = vSurf < 0.5 ? metalnessFactor : vSurf < 1.5 ? 0.35 : vSurf < 2.5 ? 0.4 : 0.1;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;`,
      );
  };
  m.customProgramCacheKey = () => 'kit';
  applyFow(m);
  material = m;
  return m;
}

const tmpColor = new THREE.Color();

/** Concatenate non-indexed geometries that share the same attributes. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const names = Object.keys(parts[0]!.attributes);
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = parts[0]!.getAttribute(name).itemSize;
    let total = 0;
    for (const p of parts) total += p.getAttribute(name).array.length;
    const arr = new Float32Array(total);
    let o = 0;
    for (const p of parts) {
      const a = p.getAttribute(name).array as Float32Array;
      arr.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/** Rings of a solid: height and half-extents (rx, rz); shades per band and for the top cap. */
type Ring = [number, number, number];

function loft(outline: Array<[number, number]>, rings: Ring[], shades: number[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const sh: number[] = [];
  const n = outline.length;
  const pt = (r: Ring, i: number): Vec3 => [outline[i % n]![0] * r[1], r[0], outline[i % n]![1] * r[2]];
  const tri = (a: Vec3, b: Vec3, c: Vec3, s: number) => {
    pos.push(...a, ...b, ...c);
    sh.push(s, s, s);
  };
  for (let k = 0; k + 1 < rings.length; k++) {
    const lo = rings[k]!;
    const hi = rings[k + 1]!;
    const s = shades[k] ?? 1;
    for (let i = 0; i < n; i++) {
      tri(pt(lo, i), pt(lo, i + 1), pt(hi, i + 1), s);
      tri(pt(lo, i), pt(hi, i + 1), pt(hi, i), s);
    }
  }
  const last = rings[rings.length - 1]!;
  for (let i = 1; i + 1 < n; i++) tri(pt(last, 0), pt(last, i), pt(last, i + 1), shades[rings.length - 1] ?? 1);
  const first = rings[0]!;
  for (let i = 1; i + 1 < n; i++) tri(pt(first, 0), pt(first, i + 1), pt(first, i), 0.8);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(sh, 1));
  return g;
}

const SQUARE: Array<[number, number]> = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const polys = new Map<number, Array<[number, number]>>();
function polygon(seg: number): Array<[number, number]> {
  let p = polys.get(seg);
  if (!p) {
    p = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2 + Math.PI / seg;
      p.push([Math.sin(a), Math.cos(a)]);
    }
    polys.set(seg, p);
  }
  return p;
}

function bevelled(outline: Array<[number, number]>, rx: number, rz: number, h: number, o: BlockOpts): THREE.BufferGeometry {
  const taper = o.taper ?? 0;
  const tx = rx * (1 - taper);
  const tz = rz * (1 - taper);
  const e = Math.min(o.bevel ?? 0, tx * 0.45, tz * 0.45, h * 0.6);
  if (e <= 0) return loft(outline, [[-h / 2, rx, rz], [h / 2, tx, tz]], [1, 1]);
  const f = (h - e) / h;
  return loft(outline, [[-h / 2, rx, rz], [h / 2 - e, rx + (tx - rx) * f, rz + (tz - rz) * f], [h / 2, tx - e, tz - e]], [1, o.edge ?? 1.25, 1]);
}

export interface KitOptions {
  /** Each primitive's lowest vertices darken by this fraction (default 0.22). */
  grade?: number;
  /** Ground contact shade: below height ao[0], darken by up to ao[1] (default [0.5, 0.25]). */
  ao?: [number, number];
}

export class Kit {
  private parts: THREE.BufferGeometry[] = [];
  private children: Array<{ name: string; at: Vec3; kit: Kit }> = [];
  private anchors: Array<{ name: string; at: Vec3 }> = [];
  private readonly grade: number;
  private readonly ao: [number, number];
  /** Height of the ground plane for contact shade (parts are relative to their own pivot). */
  private readonly base: number;

  constructor(opts: KitOptions = {}, base = 0) {
    this.grade = opts.grade ?? 0.22;
    this.ao = opts.ao ?? [0.5, 0.25];
    this.base = base;
  }

  /** Add any geometry, consumed (transformed and coloured in place). */
  add(geo: THREE.BufferGeometry, hex: number, x: number, y: number, z: number, o: PartOpts = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0]))), new THREE.Vector3(1, 1, 1)));
    const shade = g.getAttribute('shade') as THREE.BufferAttribute | undefined;
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    const p = g.getAttribute('position');
    const n = p.count;
    const glow = o.glow ?? 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      lo = Math.min(lo, p.getY(i));
      hi = Math.max(hi, p.getY(i));
    }
    const dy = Math.max(1e-4, hi - lo);
    const grade = glow > 0 || o.flat ? 0 : this.grade;
    tmpColor.setHex(hex).multiplyScalar(o.shade ?? 1);
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let k = shade ? shade.getX(i) : 1;
      k *= 1 - grade * (1 - (p.getY(i) - lo) / dy);
      const wy = p.getY(i) + this.base;
      if (glow <= 0 && wy < this.ao[0]) k *= 1 - this.ao[1] * (1 - Math.max(0, wy) / this.ao[0]);
      cols[i * 3] = tmpColor.r * k;
      cols[i * 3 + 1] = tmpColor.g * k;
      cols[i * 3 + 2] = tmpColor.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
    g.setAttribute('kind', new THREE.BufferAttribute(new Float32Array(n).fill(o.tex ? KIND_ORDER.indexOf(o.tex) + 1 : 0), 1));
    g.setAttribute('surf', new THREE.BufferAttribute(new Float32Array(n).fill(SURFACE[o.surface ?? 'matte']), 1));
    this.parts.push(g);
    return this;
  }

  /** A box centred at (x, y, z), optionally with a chamfered, highlighted top edge. */
  box(w: number, h: number, d: number, hex: number, x: number, y: number, z: number, o: BlockOpts = {}): this {
    const g = o.bevel || o.taper ? bevelled(SQUARE, w / 2, d / 2, h, o) : new THREE.BoxGeometry(w, h, d);
    return this.add(g, hex, x, y, z, o);
  }

  /** A box standing on y (its base), centred on x, z. */
  block(w: number, h: number, d: number, hex: number, x: number, y: number, z: number, o: BlockOpts = {}): this {
    return this.box(w, h, d, hex, x, y + h / 2, z, o);
  }

  /** Vertical cylinder centred at (x, y, z); optional chamfered top. */
  cyl(rTop: number, rBot: number, h: number, seg: number, hex: number, x: number, y: number, z: number, o: BlockOpts = {}): this {
    if (o.bevel) {
      const g = bevelled(polygon(seg), rBot, rBot, h, { ...o, taper: 1 - rTop / Math.max(1e-4, rBot) });
      return this.add(g, hex, x, y, z, o);
    }
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), hex, x, y, z, o);
  }

  /** Horizontal cylinder along x (pipes, tanks on their side). */
  cylX(r: number, len: number, seg: number, hex: number, x: number, y: number, z: number, o: PartOpts = {}): this {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), hex, x, y, z, { ...o, rot: [0, 0, Math.PI / 2], flat: true });
  }

  /** Horizontal cylinder along z. */
  cylZ(r: number, len: number, seg: number, hex: number, x: number, y: number, z: number, o: PartOpts = {}): this {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), hex, x, y, z, { ...o, rot: [Math.PI / 2, 0, 0], flat: true });
  }

  sphere(r: number, hex: number, x: number, y: number, z: number, seg = 10, o: PartOpts = {}): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.6))), hex, x, y, z, { flat: true, ...o });
  }

  /** Half sphere (domes), base at y. */
  dome(r: number, hex: number, x: number, y: number, z: number, seg = 12, o: PartOpts = {}): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(3, Math.round(seg / 3)), 0, Math.PI * 2, 0, Math.PI / 2), hex, x, y, z, { flat: true, ...o });
  }

  cone(r: number, h: number, seg: number, hex: number, x: number, y: number, z: number, o: PartOpts = {}): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), hex, x, y, z, o);
  }

  /** Gable roof: ridge along x, w long, d deep, `rise` high, eaves at y; overhang `over`. */
  gable(w: number, d: number, rise: number, hex: number, x: number, y: number, z: number, o: PartOpts & { over?: number } = {}): this {
    const ov = o.over ?? 0.06;
    const hw = w / 2 + ov;
    const hd = d / 2 + ov;
    const t = 0.05;
    const pos: number[] = [];
    const sh: number[] = [];
    const quad = (a: Vec3, b: Vec3, c: Vec3, e: Vec3, s: number) => {
      pos.push(...a, ...b, ...c, ...a, ...c, ...e);
      sh.push(s, s, s, s, s, s);
    };
    // Two roof planes (with a little thickness at the eaves), and the gable ends.
    quad([-hw, 0, hd], [hw, 0, hd], [hw, rise, 0], [-hw, rise, 0], 1);
    quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, rise, 0], [hw, rise, 0], 0.9);
    quad([-hw, -t, hd], [hw, -t, hd], [hw, 0, hd], [-hw, 0, hd], 0.7);
    quad([hw, -t, -hd], [-hw, -t, -hd], [-hw, 0, -hd], [hw, 0, -hd], 0.7);
    for (const sx of [-1, 1]) {
      const xx = sx * (w / 2);
      const tri = sx > 0 ? [[xx, 0, d / 2], [xx, 0, -d / 2], [xx, rise, 0]] : [[xx, 0, -d / 2], [xx, 0, d / 2], [xx, rise, 0]];
      for (const v of tri) pos.push(...(v as Vec3));
      sh.push(0.95, 0.95, 0.95);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(sh, 1));
    return this.add(g, hex, x, y, z, { tex: 'tiles', flat: true, ...o });
  }

  /** Hip roof (slopes on all four sides). */
  hip(w: number, d: number, rise: number, hex: number, x: number, y: number, z: number, o: PartOpts & { over?: number } = {}): this {
    const ov = o.over ?? 0.06;
    const hw = w / 2 + ov;
    const hd = d / 2 + ov;
    const r = Math.max(0, hw - hd);
    const pos: number[] = [];
    const sh: number[] = [];
    const tri = (a: Vec3, b: Vec3, c: Vec3, s: number) => {
      pos.push(...a, ...b, ...c);
      sh.push(s, s, s);
    };
    const A: Vec3 = [-hw, 0, hd], B: Vec3 = [hw, 0, hd], C: Vec3 = [hw, 0, -hd], D: Vec3 = [-hw, 0, -hd];
    const P: Vec3 = [-r, rise, 0], Q: Vec3 = [r, rise, 0];
    tri(A, B, Q, 1); tri(A, Q, P, 1);
    tri(C, D, P, 0.88); tri(C, P, Q, 0.88);
    tri(B, C, Q, 0.94); tri(D, A, P, 0.94);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(sh, 1));
    return this.add(g, hex, x, y, z, { tex: 'tiles', flat: true, ...o });
  }

  /** A row of lit windows on a wall facing +z (face 'z') or +x (face 'x'), at height y, wall plane at `off`. */
  windows(n: number, span: number, y: number, face: 'x' | 'z' | '-x' | '-z', off: number, o: { w?: number; h?: number; frame?: number; color?: number; glow?: number; cx?: number } = {}): this {
    const ww = o.w ?? 0.14;
    const wh = o.h ?? 0.16;
    const cx = o.cx ?? 0;
    for (let i = 0; i < n; i++) {
      const t = cx + (n === 1 ? 0 : -span / 2 + (span * i) / (n - 1));
      const sgn = face.startsWith('-') ? -1 : 1;
      const axis = face.endsWith('x') ? 'x' : 'z';
      const [x, z] = axis === 'z' ? [t, off * sgn] : [off * sgn, t];
      const [bw, bd] = axis === 'z' ? [ww, 0.02] : [0.02, ww];
      if (o.frame !== undefined) this.box(axis === 'z' ? ww + 0.04 : 0.025, wh + 0.04, axis === 'z' ? 0.025 : ww + 0.04, o.frame, x, y, z, { flat: true });
      this.box(bw, wh, bd, o.color ?? 0xffd890, axis === 'z' ? x : x + sgn * 0.006, y, axis === 'z' ? z + sgn * 0.006 : z, { glow: o.glow ?? 0.6, surface: 'glass' });
    }
    return this;
  }

  /** A child part built separately (animated): named, pivoting at `at`. */
  part(name: string, at: Vec3, opts: KitOptions = {}): Kit {
    const k = new Kit({ grade: this.grade, ao: [0, 0], ...opts }, this.base + at[1]);
    this.children.push({ name, at, kit: k });
    return k;
  }

  /** An empty named point (e.g. 'smoke' at a chimney top). */
  anchor(name: string, x: number, y: number, z: number): this {
    this.anchors.push({ name, at: [x, y, z] });
    return this;
  }

  /** Merge into meshes: one for the body, one per named part. */
  build(): THREE.Group {
    const g = new THREE.Group();
    const mesh = this.mesh();
    if (mesh) g.add(mesh);
    for (const c of this.children) {
      const sub = c.kit.build();
      sub.name = c.name;
      sub.position.set(...c.at);
      g.add(sub);
    }
    for (const a of this.anchors) {
      const o = new THREE.Object3D();
      o.name = a.name;
      o.position.set(...a.at);
      g.add(o);
    }
    return g;
  }

  private mesh(): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const geo = merge(this.parts);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!geo) return null;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, kitMaterial());
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}
