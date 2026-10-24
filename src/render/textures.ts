// Procedural textures, drawn once at start-up (no image files: the game stays one
// offline bundle). They are greyscale "detail" maps centred on 0.5 that multiply a
// material's own colour, sampled by world position (triplanar), so they tile
// seamlessly on any size of building or terrain without UV coordinates.
//
//   ground: R grass, G rock, B sand/snow, A soil (forest floor, fields)
//   walls:  R brick, G roof tiles, B concrete, A timber planks
//   finish: R plaster, G metal panels, B glass curtain wall, A grass/lawn

import * as THREE from 'three';

const SIZE = 256;

function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise, `cells` per side, 0..1. */
function noise(cells: number, seed: number): Float32Array {
  const r = mulberry(seed);
  const grid = new Float32Array(cells * cells).map(() => r());
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const fy = (y / SIZE) * cells;
    const iy = Math.floor(fy);
    let ty = fy - iy;
    ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < SIZE; x++) {
      const fx = (x / SIZE) * cells;
      const ix = Math.floor(fx);
      let tx = fx - ix;
      tx = tx * tx * (3 - 2 * tx);
      const g = (a: number, b: number) => grid[((b + cells) % cells) * cells + ((a + cells) % cells)]!;
      const top = g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * tx;
      const bot = g(ix, iy + 1) + (g(ix + 1, iy + 1) - g(ix, iy + 1)) * tx;
      out[y * SIZE + x] = top + (bot - top) * ty;
    }
  }
  return out;
}

/** Tileable fractal noise, normalised to 0..1. */
function fbm(cells: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(SIZE * SIZE);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = noise(cells << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i]! += n[i]! * amp;
    total += amp;
    amp *= 0.5;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < out.length; i++) {
    out[i]! /= total;
    lo = Math.min(lo, out[i]!);
    hi = Math.max(hi, out[i]!);
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i]! - lo) / (hi - lo || 1);
  return out;
}

/** A canvas to draw strokes on, wrapping at the edges; returns its grey values 0..1. */
function strokes(draw: (ctx: CanvasRenderingContext2D, wrap: (f: () => void) => void) => void, bg = 128): Float32Array {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `rgb(${bg},${bg},${bg})`;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const wrap = (f: () => void) => {
    for (const dx of [-SIZE, 0, SIZE]) {
      for (const dy of [-SIZE, 0, SIZE]) {
        ctx.save();
        ctx.translate(dx, dy);
        f();
        ctx.restore();
      }
    }
  };
  draw(ctx, wrap);
  const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const out = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4]! / 255;
  return out;
}

const grey = (v: number) => {
  const g = Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${g},${g},${g})`;
};

/** Shift and scale so the mean is 0.5 and values stay in range. */
function centre(a: Float32Array, contrast = 1): Float32Array {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  return a.map((v) => Math.max(0, Math.min(1, 0.5 + (v - m) * contrast)));
}

// --- Ground -------------------------------------------------------------------

function grass(): Float32Array {
  const base = fbm(8, 4, 11);
  const blades = strokes((ctx, wrap) => {
    const r = mulberry(5);
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const a = -Math.PI / 2 + (r() - 0.5) * 1.6;
      const l = 3 + r() * 6;
      ctx.strokeStyle = grey(r() < 0.5 ? 0.25 + r() * 0.15 : 0.7 + r() * 0.2);
      wrap(() => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        ctx.stroke();
      });
    }
  });
  const clumps = fbm(4, 3, 17);
  return centre(base.map((v, i) => 0.35 * v + 0.45 * blades[i]! + 0.3 * clumps[i]!), 1.1);
}

function rock(): Float32Array {
  const base = fbm(4, 5, 23);
  const strata = new Float32Array(SIZE * SIZE);
  const warp = fbm(2, 3, 29);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) strata[y * SIZE + x] = 0.5 + 0.5 * Math.sin((y / SIZE) * Math.PI * 2 * 9 + warp[y * SIZE + x]! * 8);
  const cracks = strokes((ctx, wrap) => {
    const r = mulberry(31);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 40; i++) {
      let x = r() * SIZE;
      let y = r() * SIZE;
      let a = r() * Math.PI * 2;
      ctx.strokeStyle = grey(0.15 + r() * 0.2);
      const pts: Array<[number, number]> = [[x, y]];
      for (let k = 0; k < 8; k++) {
        a += (r() - 0.5) * 1.2;
        x += Math.cos(a) * (4 + r() * 8);
        y += Math.sin(a) * (4 + r() * 8);
        pts.push([x, y]);
      }
      wrap(() => {
        ctx.beginPath();
        ctx.moveTo(pts[0]![0], pts[0]![1]);
        for (const [px, py] of pts) ctx.lineTo(px, py);
        ctx.stroke();
      });
    }
  }, 150);
  return centre(base.map((v, i) => 0.6 * v + 0.2 * strata[i]! + 0.45 * (cracks[i]! - 0.6)), 1.4);
}

function sand(): Float32Array {
  const r = mulberry(41);
  const warp = fbm(4, 3, 43);
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const ripple = Math.sin(((x + y * 0.3) / SIZE) * Math.PI * 2 * 14 + warp[i]! * 9);
      out[i] = 0.5 + ripple * 0.07 + (r() - 0.5) * 0.22 + (warp[i]! - 0.5) * 0.25;
    }
  }
  return centre(out);
}

function soil(): Float32Array {
  const base = fbm(16, 4, 53);
  const spots = strokes((ctx, wrap) => {
    const r = mulberry(59);
    for (let i = 0; i < 700; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const s = 0.8 + r() * 2.2;
      ctx.fillStyle = grey(r() < 0.6 ? 0.2 + r() * 0.15 : 0.75 + r() * 0.15);
      wrap(() => {
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
  return centre(base.map((v, i) => 0.6 * v + 0.5 * spots[i]!), 1.2);
}

// --- Buildings ----------------------------------------------------------------

function brick(): Float32Array {
  const n = fbm(16, 3, 61);
  const r = mulberry(67);
  const rowH = 8;
  const brickW = 22;
  const shade = new Float32Array(Math.ceil(SIZE / rowH) * 16).map(() => (r() - 0.5) * 0.22);
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = Math.floor(y / rowH);
    const off = row % 2 ? brickW / 2 : 0;
    for (let x = 0; x < SIZE; x++) {
      const bx = (x + off) % SIZE;
      const col = Math.floor(bx / brickW);
      const mortar = y % rowH < 1.5 || bx % brickW < 1.5;
      const i = y * SIZE + x;
      out[i] = mortar ? 0.82 : 0.44 + shade[(row * 16 + col) % shade.length]! + (n[i]! - 0.5) * 0.15;
    }
  }
  return out;
}

function roofTiles(): Float32Array {
  const n = fbm(16, 3, 71);
  const r = mulberry(73);
  const rowH = 16;
  const tileW = 12;
  const out = new Float32Array(SIZE * SIZE);
  const shade = new Float32Array(512).map(() => (r() - 0.5) * 0.14);
  for (let y = 0; y < SIZE; y++) {
    const row = Math.floor(y / rowH);
    const t = (y % rowH) / rowH;
    const off = row % 2 ? tileW / 2 : 0;
    for (let x = 0; x < SIZE; x++) {
      const bx = (x + off) % SIZE;
      const col = Math.floor(bx / tileW);
      const gap = bx % tileW < 1;
      const i = y * SIZE + x;
      // Each course is lit at the top and shadowed where the next overlaps it.
      out[i] = (gap ? 0.3 : 0.62 - t * 0.28) + shade[(row * 23 + col) % 512]! + (n[i]! - 0.5) * 0.1;
    }
  }
  return out;
}

function concrete(): Float32Array {
  const a = fbm(8, 5, 79);
  const stains = fbm(3, 3, 83);
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const joint = x % 128 < 1.5 || y % 128 < 1.5;
      out[i] = joint ? 0.32 : 0.5 + (a[i]! - 0.5) * 0.18 + (stains[i]! - 0.5) * 0.16;
    }
  }
  return out;
}

function planks(): Float32Array {
  const grain = fbm(4, 4, 89);
  const r = mulberry(97);
  const w = 16;
  const shade = new Float32Array(SIZE / w).map(() => (r() - 0.5) * 0.18);
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const p = Math.floor(x / w);
      const gap = x % w < 1.5;
      const g = Math.sin((x / w) * 9 + grain[i]! * 14 + y * 0.02) * 0.06;
      out[i] = gap ? 0.25 : 0.52 + shade[p]! + g;
    }
  }
  return out;
}

function plaster(): Float32Array {
  const a = fbm(16, 4, 101);
  const b = fbm(4, 3, 103);
  return centre(a.map((v, i) => v * 0.6 + b[i]! * 0.4), 0.35);
}

function panels(): Float32Array {
  const n = fbm(8, 3, 107);
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const seam = y % 64 < 1.5;
      out[i] = seam ? 0.3 : 0.5 + Math.sin((x / 8) * Math.PI * 2) * 0.12 + (n[i]! - 0.5) * 0.1;
    }
  }
  return out;
}

function glassWall(): Float32Array {
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const mullion = x % 32 < 2.5;
      const floor = y % 32 < 4;
      // A soft diagonal reflection across each pane.
      const px = (x % 32) / 32;
      const py = (y % 32) / 32;
      const sheen = 0.5 + 0.18 * Math.sin((px + py) * Math.PI) - 0.1 * py;
      out[i] = floor ? 0.28 : mullion ? 0.35 : sheen;
    }
  }
  return out;
}

// --- Packing ------------------------------------------------------------------

function pack(chans: Float32Array[], name: string): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(Math.max(0, Math.min(1, chans[c]![i]!)) * 255);
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  t.name = name;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let ground: THREE.DataTexture | null = null;
let walls: THREE.DataTexture | null = null;
let finish: THREE.DataTexture | null = null;

export function groundTexture(): THREE.DataTexture {
  return (ground ??= pack([grass(), rock(), sand(), soil()], 'ground'));
}

export function buildingTextures(): [THREE.DataTexture, THREE.DataTexture] {
  walls ??= pack([brick(), roofTiles(), concrete(), planks()], 'walls');
  finish ??= pack([plaster(), panels(), glassWall(), grass()], 'finish');
  return [walls, finish];
}

// --- Materials ----------------------------------------------------------------

export type DetailKind = 'brick' | 'tiles' | 'concrete' | 'planks' | 'plaster' | 'panels' | 'glass' | 'lawn';

/** Which texture and channel, world units per texture repeat, and how strongly it shows. */
export const KINDS: Record<DetailKind, { tex: 0 | 1; chan: number; size: number; strength: number }> = {
  brick: { tex: 0, chan: 0, size: 1.6, strength: 0.85 },
  tiles: { tex: 0, chan: 1, size: 1.4, strength: 0.8 },
  concrete: { tex: 0, chan: 2, size: 2, strength: 0.7 },
  planks: { tex: 0, chan: 3, size: 1.4, strength: 0.75 },
  plaster: { tex: 1, chan: 0, size: 2, strength: 0.7 },
  panels: { tex: 1, chan: 1, size: 1.2, strength: 0.6 },
  glass: { tex: 1, chan: 2, size: 1.2, strength: 0.9 },
  lawn: { tex: 1, chan: 3, size: 3, strength: 0.6 },
};

/** Graphics quality: detail textures on (1) or off (0), shared by every patched material. */
export const detailUniforms = { uDetailOn: { value: 1 } };

const MASKS = [new THREE.Vector4(1, 0, 0, 0), new THREE.Vector4(0, 1, 0, 0), new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 0, 1)];

const detailPatched = new WeakSet<THREE.Material>();

/**
 * Give a (standard) material a world-space detail texture. Faces pick the texture
 * plane by their own orientation, so walls get courses and roofs get tiles the right way up.
 */
export function applyDetail(material: THREE.MeshStandardMaterial, kind: DetailKind): void {
  if (detailPatched.has(material)) return;
  detailPatched.add(material);
  const k = KINDS[kind];
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uDetail = { value: buildingTextures()[k.tex] };
    shader.uniforms.uDetailMask = { value: MASKS[k.chan] };
    shader.uniforms.uDetailScale = { value: 1 / k.size };
    shader.uniforms.uDetailStrength = { value: k.strength };
    shader.uniforms.uDetailOn = detailUniforms.uDetailOn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 detWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          detWorld = instanceMatrix * detWorld;
        #endif
        vDetPos = (modelMatrix * detWorld).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetPos;\nuniform sampler2D uDetail;\nuniform vec4 uDetailMask;\nuniform float uDetailScale;\nuniform float uDetailStrength;\nuniform float uDetailOn;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 fn = normalize(cross(dFdx(vDetPos), dFdy(vDetPos)));
          vec3 w = pow(abs(fn), vec3(6.0));
          w /= (w.x + w.y + w.z + 1e-4);
          vec3 p = vDetPos * uDetailScale;
          float dx = dot(texture2D(uDetail, vec2(p.z, -p.y)), uDetailMask);
          float dy = dot(texture2D(uDetail, p.xz), uDetailMask);
          float dz = dot(texture2D(uDetail, vec2(p.x, -p.y)), uDetailMask);
          float d = dx * w.x + dy * w.y + dz * w.z;
          diffuseColor.rgb *= mix(1.0, d * 2.0, uDetailStrength * uDetailOn);
        }`,
      );
  };
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => prevKey() + `|detail-${kind}`;
  material.needsUpdate = true;
}

/**
 * The ground: tile colours blended smoothly (a texel per tile, linear filtering) and
 * grass, rock, sand and soil detail, mixed per tile from a weights texture; steep
 * ground shows rock sampled on the slope's own plane.
 */
export function applyGroundDetail(material: THREE.MeshStandardMaterial, colors: THREE.DataTexture, kinds: THREE.DataTexture, width: number, height: number): void {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uGround = { value: groundTexture() };
    shader.uniforms.uTileColor = { value: colors };
    shader.uniforms.uTileKind = { value: kinds };
    shader.uniforms.uTileSize = { value: new THREE.Vector2(width, height) };
    shader.uniforms.uDetailOn = detailUniforms.uDetailOn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGPos;\nuniform sampler2D uGround;\nuniform sampler2D uTileColor;\nuniform sampler2D uTileKind;\nuniform vec2 uTileSize;\nuniform float uDetailOn;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 tuv = vGPos.xz / uTileSize;
          vec3 base = texture2D(uTileColor, tuv).rgb;
          vec4 kw = texture2D(uTileKind, tuv);
          vec3 fn = normalize(cross(dFdx(vGPos), dFdy(vGPos)));
          float steep = smoothstep(0.82, 0.6, abs(fn.y));
          vec2 uvA = vGPos.xz * 0.25;
          vec2 uvB = vGPos.xz * 0.071 + vec2(0.37, 0.61);
          vec4 dA = texture2D(uGround, uvA);
          vec4 dB = texture2D(uGround, uvB);
          vec4 d = mix(dA, dB, 0.4);
          // Cliffs: rock on the slope's own plane, with strata running level.
          vec2 side = abs(fn.x) > abs(fn.z) ? vGPos.zy : vGPos.xy;
          float rockSide = texture2D(uGround, side * vec2(0.25, 0.5)).g;
          kw = mix(kw, vec4(0.0, 1.0, 0.0, 0.0), steep);
          d.g = mix(d.g, rockSide, steep);
          float total = kw.r + kw.g + kw.b + kw.a;
          float detail = total > 0.01 ? dot(kw, d) / total : 0.5;
          // Large, soft patches break up the repeat.
          float blotch = texture2D(uGround, vGPos.xz * 0.013).a;
          diffuseColor.rgb = base * mix(1.0, mix(1.0, detail * 2.0, 0.75) * (0.9 + 0.2 * blotch), uDetailOn);
        }`,
      );
  };
  const prevKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => prevKey() + '|ground';
  material.needsUpdate = true;
}
