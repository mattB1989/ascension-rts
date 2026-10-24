// Procedural textures, drawn once at start-up (no image files: the game stays one
// offline bundle). They are greyscale "detail" maps centred on 0.5 that multiply a
// material's own colour, sampled by world position (triplanar), so they tile
// seamlessly on any size of building or terrain without UV coordinates.
//
//   ground: R grass, G rock, B sand/snow, A soil (forest floor, fields)
//   walls:  R brick, G roof tiles, B concrete, A timber planks
//   finish: R plaster, G metal panels, B glass curtain wall, A grass/lawn
//   nature: R broadleaf foliage, G conifer needles, B bark, A boulder rock
//   infra:  R asphalt, G gravel ballast, B paving slabs, A grime
//   wear:   R road repair patches, G cracks/potholes (as wear thresholds), B brushed metal, A wood grain
//   water:  RGB ripple normal map, A cellular foam pattern

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

// --- Nature (trees, boulders) ---------------------------------------------------

/** Broadleaf foliage: overlapping leaf clumps, each lit from above and shadowed at its rim. */
function foliage(): Float32Array {
  const clumps = strokes((ctx, wrap) => {
    const r = mulberry(131);
    for (let i = 0; i < 520; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const rad = 5 + r() * 12;
      const lit = 0.55 + r() * 0.3;
      wrap(() => {
        const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.35, rad * 0.1, x, y, rad);
        g.addColorStop(0, grey(lit));
        g.addColorStop(0.65, grey(lit - 0.22));
        g.addColorStop(1, grey(0.12));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, 40);
  const n = fbm(16, 3, 137);
  return centre(clumps.map((v, i) => v * 0.85 + n[i]! * 0.25), 1.1);
}

/** Conifer needles: drooping branch sprays (chevrons) in layers, dark gaps between. */
function needles(): Float32Array {
  const sprays = strokes((ctx, wrap) => {
    const r = mulberry(139);
    ctx.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const l = 6 + r() * 10;
      const droop = 0.45 + r() * 0.5;
      ctx.lineWidth = 1.5 + r() * 2.5;
      ctx.strokeStyle = grey(r() < 0.35 ? 0.2 + r() * 0.15 : 0.55 + r() * 0.35);
      wrap(() => {
        ctx.beginPath();
        ctx.moveTo(x - l, y + l * droop);
        ctx.lineTo(x, y);
        ctx.lineTo(x + l, y + l * droop);
        ctx.stroke();
      });
    }
  }, 70);
  const n = fbm(8, 3, 149);
  return centre(sprays.map((v, i) => v * 0.8 + n[i]! * 0.3), 1.5);
}

/** Bark: long vertical ridges with dark furrows and the odd horizontal crack. */
function bark(): Float32Array {
  const ridges = strokes((ctx, wrap) => {
    const r = mulberry(151);
    ctx.lineCap = 'round';
    for (let i = 0; i < 420; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const l = 20 + r() * 70;
      ctx.lineWidth = 1 + r() * 3;
      ctx.strokeStyle = grey(r() < 0.5 ? 0.15 + r() * 0.15 : 0.6 + r() * 0.3);
      const wob = (r() - 0.5) * 6;
      wrap(() => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + wob, y + l / 2, x, y + l);
        ctx.stroke();
      });
    }
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 40; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      ctx.strokeStyle = grey(0.12);
      wrap(() => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 4 + r() * 8, y + (r() - 0.5) * 2);
        ctx.stroke();
      });
    }
  });
  return centre(ridges, 1.2);
}

/** Boulders: lumpy stone with cracks and pale lichen spots. */
function boulder(): Float32Array {
  const base = fbm(4, 5, 157);
  const fine = fbm(32, 2, 163);
  const marks = strokes((ctx, wrap) => {
    const r = mulberry(167);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 30; i++) {
      let x = r() * SIZE;
      let y = r() * SIZE;
      let a = r() * Math.PI * 2;
      const pts: Array<[number, number]> = [[x, y]];
      for (let k = 0; k < 7; k++) {
        a += (r() - 0.5) * 1.4;
        x += Math.cos(a) * (5 + r() * 9);
        y += Math.sin(a) * (5 + r() * 9);
        pts.push([x, y]);
      }
      ctx.strokeStyle = grey(0.1 + r() * 0.15);
      wrap(() => {
        ctx.beginPath();
        ctx.moveTo(pts[0]![0], pts[0]![1]);
        for (const [px, py] of pts) ctx.lineTo(px, py);
        ctx.stroke();
      });
    }
    for (let i = 0; i < 260; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const s = 1 + r() * 4;
      ctx.fillStyle = grey(0.85 + r() * 0.15);
      wrap(() => {
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
  return centre(base.map((v, i) => 0.55 * v + 0.25 * fine[i]! + 0.5 * (marks[i]! - 0.5)), 1.3);
}

// --- Infrastructure (roads, rails, pipes) -------------------------------------

function asphalt(): Float32Array {
  const fine = fbm(32, 3, 211);
  const broad = fbm(8, 3, 213);
  // Aggregate: small light and dark stones pressed into the binder.
  const stones = strokes((ctx, wrap) => {
    const r = mulberry(217);
    for (let i = 0; i < 2600; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const s = 0.7 + r() * 1.6;
      ctx.fillStyle = grey(r() < 0.55 ? 0.28 + r() * 0.12 : 0.66 + r() * 0.22);
      wrap(() => {
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
  return centre(fine.map((v, i) => 0.35 * v + 0.25 * broad[i]! + 0.5 * stones[i]!), 1.0);
}

function gravel(): Float32Array {
  const base = fbm(16, 3, 221);
  // Ballast: packed angular stones, each lit on one side.
  const stones = strokes((ctx, wrap) => {
    const r = mulberry(223);
    for (let i = 0; i < 2400; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const s = 2 + r() * 3.2;
      const g = 0.35 + r() * 0.4;
      const a = r() * Math.PI;
      const sides = 5 + Math.floor(r() * 3);
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < sides; k++) {
        const t = a + (k / sides) * Math.PI * 2;
        const rr = s * (0.7 + r() * 0.4);
        pts.push([x + Math.cos(t) * rr, y + Math.sin(t) * rr]);
      }
      wrap(() => {
        ctx.fillStyle = grey(g * 0.55);
        ctx.beginPath();
        pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + 0.8, py + 0.8) : ctx.moveTo(px + 0.8, py + 0.8)));
        ctx.fill();
        ctx.fillStyle = grey(g);
        ctx.beginPath();
        pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.fill();
        ctx.fillStyle = grey(Math.min(1, g + 0.18));
        ctx.beginPath();
        ctx.arc(x - s * 0.25, y - s * 0.25, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, 60);
  return centre(stones.map((v, i) => v * 0.85 + base[i]! * 0.2), 1.1);
}

/** Paving slabs for pavements: a grid of slabs, each its own shade, with dark joints. */
function paving(): Float32Array {
  const n = fbm(16, 3, 231);
  const r = mulberry(233);
  const slab = 32;
  const per = SIZE / slab;
  const shade = new Float32Array(per * per).map(() => (r() - 0.5) * 0.16);
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const joint = x % slab < 2 || y % slab < 2;
      out[i] = joint ? 0.3 : 0.55 + shade[Math.floor(y / slab) * per + Math.floor(x / slab)]! + (n[i]! - 0.5) * 0.14;
    }
  }
  return out;
}

/** Soft, broad stains (dirt, oil, damp) to break up large surfaces. */
function grime(): Float32Array {
  const a = fbm(4, 4, 241);
  const b = fbm(8, 3, 243);
  return centre(a.map((v, i) => v * 0.7 + b[i]! * 0.3), 1.3);
}

/**
 * Repair patches on asphalt: 1 where there is none, else the wear (0..1) at which
 * the patch shows, so worse roads gather more of them.
 */
function roadPatches(): Float32Array {
  return strokes((ctx, wrap) => {
    const r = mulberry(251);
    for (let i = 0; i < 26; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const w = 18 + r() * 46;
      const h = 14 + r() * 34;
      const rot = (Math.floor(r() * 4) * Math.PI) / 2 + (r() - 0.5) * 0.12;
      ctx.fillStyle = grey(0.15 + (i / 26) * 0.6);
      wrap(() => {
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillRect(-w / 2, -h / 2, w, h);
      });
    }
  }, 255);
}

/**
 * Cracks: 1 where there is none, else the wear at which the crack shows. Long
 * meandering cracks first, then branches, then alligator cracking and potholes.
 */
function roadCracks(): Float32Array {
  return strokes((ctx, wrap) => {
    const r = mulberry(261);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const crack = (x: number, y: number, a: number, steps: number, len: number, width: number, v: number, depth: number) => {
      const pts: Array<[number, number]> = [[x, y]];
      for (let k = 0; k < steps; k++) {
        a += (r() - 0.5) * 0.9;
        x += Math.cos(a) * len * (0.6 + r() * 0.8);
        y += Math.sin(a) * len * (0.6 + r() * 0.8);
        pts.push([x, y]);
        if (depth > 0 && r() < 0.18) crack(x, y, a + (r() < 0.5 ? 1 : -1) * (0.8 + r() * 0.7), 3 + Math.floor(r() * 4), len * 0.8, width * 0.75, Math.min(0.95, v + 0.12), depth - 1);
      }
      ctx.strokeStyle = grey(v);
      ctx.lineWidth = width;
      wrap(() => {
        ctx.beginPath();
        ctx.moveTo(pts[0]![0], pts[0]![1]);
        for (const [px, py] of pts) ctx.lineTo(px, py);
        ctx.stroke();
      });
    };
    for (let i = 0; i < 14; i++) crack(r() * SIZE, r() * SIZE, r() * Math.PI * 2, 10 + Math.floor(r() * 8), 7, 2.6, 0.32 + r() * 0.2, 2);
    // Alligator cracking: small polygon cells in a few areas.
    for (let i = 0; i < 6; i++) {
      const cx = r() * SIZE;
      const cy = r() * SIZE;
      for (let k = 0; k < 18; k++) {
        const x = cx + (r() - 0.5) * 50;
        const y = cy + (r() - 0.5) * 50;
        crack(x, y, r() * Math.PI * 2, 2, 6, 1.8, 0.62 + r() * 0.15, 0);
      }
    }
    // Potholes, only on the worst roads.
    for (let i = 0; i < 9; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const s = 4 + r() * 6;
      ctx.fillStyle = grey(0.8 + r() * 0.12);
      wrap(() => {
        ctx.beginPath();
        ctx.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, 255);
}

/** Brushed metal: fine streaks along x, faint seams, a little mottling. */
function metal(): Float32Array {
  const r = mulberry(271);
  const mottle = fbm(4, 3, 273);
  const rows = new Float32Array(SIZE).map(() => (r() - 0.5) * 0.16);
  const streak = fbm(64, 2, 277);
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const seam = x % 128 < 2;
      const s = streak[y * SIZE + ((x >> 3) % SIZE)]!;
      out[i] = seam ? 0.3 : 0.5 + rows[y]! + (s - 0.5) * 0.12 + (mottle[i]! - 0.5) * 0.18;
    }
  }
  return out;
}

/** Weathered wood grain running along x (rail sleepers). */
function woodGrain(): Float32Array {
  const warp = fbm(4, 3, 281);
  const n = fbm(32, 2, 283);
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const g = Math.sin((y / SIZE) * Math.PI * 2 * 24 + warp[i]! * 10);
      out[i] = 0.5 + g * 0.1 + (n[i]! - 0.5) * 0.25;
    }
  }
  return out;
}

// --- Water --------------------------------------------------------------------

/** Tileable cellular noise: distance to the nearest feature point, 0..1. */
function worley(cells: number, seed: number): Float32Array {
  const r = mulberry(seed);
  const pts = new Float32Array(cells * cells * 2).map(() => r());
  const out = new Float32Array(SIZE * SIZE);
  const cs = SIZE / cells;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const gx = Math.floor(x / cs);
      const gy = Math.floor(y / cs);
      let best = 9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx;
          const cy = gy + dy;
          const k = (((cy + cells) % cells) * cells + ((cx + cells) % cells)) * 2;
          const px = (cx + pts[k]!) * cs;
          const py = (cy + pts[k + 1]!) * cs;
          const d = Math.hypot(px - x, py - y) / cs;
          if (d < best) best = d;
        }
      }
      out[y * SIZE + x] = Math.min(1, best);
    }
  }
  return out;
}

/**
 * Water ripples: a tileable height field (wind-driven crests plus noise) turned
 * into a normal map: RGB = normal (x, y in the plane, z up), A = cellular foam pattern.
 */
function waterChannels(): Float32Array[] {
  const n1 = fbm(4, 5, 301);
  const n2 = fbm(8, 3, 303);
  const hgt = new Float32Array(SIZE * SIZE);
  const TAU = Math.PI * 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const i = y * SIZE + x;
      // Integer frequencies keep the crests tileable; noise warps them so they never look regular.
      const w = n1[i]! * 2.4;
      const crest = Math.sin(TAU * (5 * u + 3 * v) + w * 3) * 0.35 + Math.sin(TAU * (-4 * u + 7 * v) + w * 2) * 0.25 + Math.sin(TAU * (9 * u - 2 * v) + w * 4) * 0.12;
      hgt[i] = crest + (n1[i]! - 0.5) * 1.2 + (n2[i]! - 0.5) * 0.5;
    }
  }
  const nx = new Float32Array(SIZE * SIZE);
  const ny = new Float32Array(SIZE * SIZE);
  const nz = new Float32Array(SIZE * SIZE);
  const k = 2.2; // slope scale
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const hx = hgt[y * SIZE + ((x + 1) % SIZE)]! - hgt[y * SIZE + ((x + SIZE - 1) % SIZE)]!;
      const hy = hgt[((y + 1) % SIZE) * SIZE + x]! - hgt[((y + SIZE - 1) % SIZE) * SIZE + x]!;
      const a = -hx * k;
      const b = -hy * k;
      const l = Math.hypot(a, b, 1);
      nx[i] = 0.5 + (0.5 * a) / l;
      ny[i] = 0.5 + (0.5 * b) / l;
      nz[i] = 0.5 + 0.5 / l;
    }
  }
  const cellsA = worley(8, 311);
  const cellsB = worley(16, 313);
  const foam = cellsA.map((v, i) => Math.min(1, v * 0.6 + cellsB[i]! * 0.5));
  return [nx, ny, nz, foam];
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
let nature: THREE.DataTexture | null = null;

export function groundTexture(): THREE.DataTexture {
  return (ground ??= pack([grass(), rock(), sand(), soil()], 'ground'));
}

export function buildingTextures(): [THREE.DataTexture, THREE.DataTexture] {
  walls ??= pack([brick(), roofTiles(), concrete(), planks()], 'walls');
  finish ??= pack([plaster(), panels(), glassWall(), grass()], 'finish');
  return [walls, finish];
}

let infra: THREE.DataTexture | null = null;
let wear: THREE.DataTexture | null = null;
let water: THREE.DataTexture | null = null;

/**
 * Roads, rails and pipes.
 *   infra: R asphalt, G gravel ballast, B paving slabs, A grime
 *   wear:  R repair patches, G cracks (both: wear level at which they show, 1 = none), B brushed metal, A wood grain
 */
export function infraTextures(): [THREE.DataTexture, THREE.DataTexture] {
  infra ??= pack([asphalt(), gravel(), paving(), grime()], 'infra');
  wear ??= pack([roadPatches(), roadCracks(), metal(), woodGrain()], 'wear');
  return [infra, wear];
}

/** Tileable water ripple normals (RGB, z up) and a cellular foam pattern (A). */
export function waterTexture(): THREE.DataTexture {
  return (water ??= pack(waterChannels(), 'water'));
}

/** Detail texture by index: 0 walls, 1 finish, 2 nature, 3 infra, 4 wear (built on first use). */
function detailTexture(i: number): THREE.DataTexture {
  if (i === 2) return (nature ??= pack([foliage(), needles(), bark(), boulder()], 'nature'));
  return i < 2 ? buildingTextures()[i]! : infraTextures()[i - 3]!;
}

// --- Materials ----------------------------------------------------------------

export type DetailKind = 'brick' | 'tiles' | 'concrete' | 'planks' | 'plaster' | 'panels' | 'glass' | 'lawn' | 'foliage' | 'needles' | 'bark' | 'rock' | 'asphalt' | 'gravel' | 'paving' | 'metal';

/** Which texture and channel, world units per texture repeat, and how strongly it shows. */
export const KINDS: Record<DetailKind, { tex: 0 | 1 | 2 | 3 | 4; chan: number; size: number; strength: number }> = {
  brick: { tex: 0, chan: 0, size: 1.6, strength: 0.85 },
  tiles: { tex: 0, chan: 1, size: 1.4, strength: 0.8 },
  concrete: { tex: 0, chan: 2, size: 2, strength: 0.7 },
  planks: { tex: 0, chan: 3, size: 1.4, strength: 0.75 },
  plaster: { tex: 1, chan: 0, size: 2, strength: 0.7 },
  panels: { tex: 1, chan: 1, size: 1.2, strength: 0.6 },
  glass: { tex: 1, chan: 2, size: 1.2, strength: 0.9 },
  lawn: { tex: 1, chan: 3, size: 3, strength: 0.6 },
  foliage: { tex: 2, chan: 0, size: 0.9, strength: 0.85 },
  needles: { tex: 2, chan: 1, size: 0.8, strength: 0.9 },
  bark: { tex: 2, chan: 2, size: 0.45, strength: 0.8 },
  rock: { tex: 2, chan: 3, size: 1.3, strength: 0.8 },
  asphalt: { tex: 3, chan: 0, size: 2, strength: 0.6 },
  gravel: { tex: 3, chan: 1, size: 1, strength: 0.8 },
  paving: { tex: 3, chan: 2, size: 1, strength: 0.6 },
  metal: { tex: 4, chan: 2, size: 1, strength: 0.5 },
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
    shader.uniforms.uDetail = { value: detailTexture(k.tex) };
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
