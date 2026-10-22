// Grid A* with 8-way movement (no corner cutting) and line-of-sight path smoothing.
// If the goal is unreachable (e.g. a tank ordered onto an island), the path leads
// to the reachable tile closest to the goal.

import type { NavGrid, NavLayerId } from './nav.ts';

const SQRT2 = 1.4142135623730951;

/** Binary min-heap of node indices keyed by f-score. */
class NodeHeap {
  private nodes: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  clear(): void {
    this.nodes.length = 0;
    this.keys.length = 0;
  }

  push(node: number, key: number): void {
    const nodes = this.nodes;
    const keys = this.keys;
    let i = nodes.length;
    nodes.push(node);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      // Ties broken by node index so the result never depends on insertion quirks.
      if (keys[p]! < key || (keys[p] === key && nodes[p]! < node)) break;
      nodes[i] = nodes[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    nodes[i] = node;
    keys[i] = key;
  }

  pop(): number {
    const nodes = this.nodes;
    const keys = this.keys;
    const top = nodes[0]!;
    const lastN = nodes.pop()!;
    const lastK = keys.pop()!;
    const n = nodes.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        let c = l;
        if (r < n && (keys[r]! < keys[l]! || (keys[r] === keys[l] && nodes[r]! < nodes[l]!))) c = r;
        if (keys[c]! > lastK || (keys[c] === lastK && nodes[c]! > lastN)) break;
        nodes[i] = nodes[c]!;
        keys[i] = keys[c]!;
        i = c;
      }
      nodes[i] = lastN;
      keys[i] = lastK;
    }
    return top;
  }
}

export class Pathfinder {
  private readonly w: number;
  private readonly h: number;
  private readonly g: Float64Array;
  private readonly parent: Int32Array;
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private gen = 0;
  private readonly heap = new NodeHeap();
  private readonly nav: NavGrid;
  /** Player whose gates count as open during the current search (-1: none). */
  private player = -1;

  constructor(nav: NavGrid) {
    this.nav = nav;
    this.w = nav.width;
    this.h = nav.height;
    const n = this.w * this.h;
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  /** Nearest passable tile to (tx, ty) within maxR, by ring search. */
  nearestPassable(layer: NavLayerId, tx: number, ty: number, maxR = 16, player = -1): [number, number] | null {
    for (let r = 0; r <= maxR; r++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.nav.passable(layer, tx + dx, ty + dy, player)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = [tx + dx, ty + dy];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Find a path between world positions. Returns waypoints as a flat [x0, y0, x1, y1, ...]
   * array, excluding the start, or null if the start itself is not passable.
   */
  findPath(layer: NavLayerId, sx: number, sy: number, gx: number, gy: number, player = -1): number[] | null {
    this.player = player;
    const w = this.w;
    let stx = Math.floor(sx);
    let sty = Math.floor(sy);
    if (!this.nav.passable(layer, stx, sty, player)) {
      const near = this.nearestPassable(layer, stx, sty, 3, player);
      if (!near) return null;
      [stx, sty] = near;
    }
    let gtx = Math.floor(gx);
    let gty = Math.floor(gy);
    let exactGoal = true;
    if (!this.nav.passable(layer, gtx, gty, player)) {
      exactGoal = false;
      const near = this.nearestPassable(layer, gtx, gty, 16, player);
      if (near) [gtx, gty] = near;
    }

    const start = sty * w + stx;
    const goal = gty * w + gtx;
    if (start === goal) {
      return exactGoal ? [gx, gy] : [gtx + 0.5, gty + 0.5];
    }

    const gen = ++this.gen;
    const heap = this.heap;
    heap.clear();
    const hfn = (n: number) => {
      const dx = Math.abs((n % w) - gtx);
      const dy = Math.abs(Math.floor(n / w) - gty);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };
    this.g[start] = 0;
    this.parent[start] = -1;
    this.stamp[start] = gen;
    heap.push(start, hfn(start));

    let best = start;
    let bestH = hfn(start);
    let found = false;

    while (heap.size > 0) {
      const cur = heap.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      const ch = hfn(cur);
      if (ch < bestH) {
        bestH = ch;
        best = cur;
      }
      const cx = cur % w;
      const cy = Math.floor(cur / w);
      const cg = this.g[cur]!;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.nav.passable(layer, nx, ny, player)) continue;
          if (dx !== 0 && dy !== 0) {
            // No cutting corners past blocked tiles.
            if (!this.nav.passable(layer, cx + dx, cy, player) || !this.nav.passable(layer, cx, cy + dy, player)) continue;
          }
          const ni = ny * w + nx;
          if (this.closed[ni] === gen) continue;
          const slow = this.nav.cost(layer, nx, ny) > 1 ? 1.6 : 1;
          const ng = cg + (dx !== 0 && dy !== 0 ? SQRT2 : 1) * slow;
          if (this.stamp[ni] !== gen || ng < this.g[ni]!) {
            this.stamp[ni] = gen;
            this.g[ni] = ng;
            this.parent[ni] = cur;
            heap.push(ni, ng + hfn(ni));
          }
        }
      }
    }

    const end = found ? goal : best;
    const tiles: number[] = [];
    for (let n = end; n !== -1; n = this.parent[n]!) tiles.push(n);
    tiles.reverse();

    // Convert to tile centres, then smooth with line-of-sight checks.
    const pts: number[] = [];
    for (const n of tiles) pts.push((n % w) + 0.5, Math.floor(n / w) + 0.5);
    if (found && exactGoal) {
      pts[pts.length - 2] = gx;
      pts[pts.length - 1] = gy;
    }
    return this.smooth(layer, sx, sy, pts);
  }

  /** Remove waypoints that can be skipped in a straight line. Drops the start point. */
  private smooth(layer: NavLayerId, sx: number, sy: number, pts: number[]): number[] {
    const out: number[] = [];
    let ax = sx;
    let ay = sy;
    let i = 2; // pts[0..1] is the start tile
    const n = pts.length / 2;
    while (i / 2 < n) {
      // Find the furthest point visible from (ax, ay).
      let j = n - 1;
      while (j > i / 2 && !this.lineClear(layer, ax, ay, pts[j * 2]!, pts[j * 2 + 1]!)) j--;
      const px = pts[j * 2]!;
      const py = pts[j * 2 + 1]!;
      out.push(px, py);
      ax = px;
      ay = py;
      i = (j + 1) * 2;
    }
    if (out.length === 0) out.push(pts[pts.length - 2]!, pts[pts.length - 1]!);
    return out;
  }

  /** True if a unit can travel in a straight line, checked with a small clearance. */
  lineClear(layer: NavLayerId, x0: number, y0: number, x1: number, y1: number, player = this.player): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(len / 0.25);
    // Offset sample lines either side of the centre so paths keep clear of walls.
    const nx = len > 0 ? (-dy / len) * 0.3 : 0;
    const ny = len > 0 ? (dx / len) * 0.3 : 0;
    // Shortcuts may not cut through slower ground (forest) than either end stands on.
    const maxCost = Math.max(this.nav.cost(layer, Math.floor(x0), Math.floor(y0)), this.nav.cost(layer, Math.floor(x1), Math.floor(y1)), 1);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      if (!this.nav.passableAt(layer, x, y, player)) return false;
      if (this.nav.cost(layer, Math.floor(x), Math.floor(y)) > maxCost) return false;
      if (!this.nav.passableAt(layer, x + nx, y + ny, player)) return false;
      if (!this.nav.passableAt(layer, x - nx, y - ny, player)) return false;
    }
    return true;
  }
}
