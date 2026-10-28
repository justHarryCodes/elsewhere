// Finding the way round an inside: each floor as a grid of small cells, free where the body fits
// (inside the rooms, clear of walls, furniture and shut doors, off the stairs). A* finds a path between
// two points; the path is then straightened so the character walks direct lines, not cell steps.

import type { InteriorNav } from './interiorScene';
import type { Rect } from './playerMotion';

export interface NavGrid {
  level: number;
  x0: number;
  z0: number;
  cell: number;
  cols: number;
  rows: number;
  free: Uint8Array;
}

const CELL = 0.2;
/** A little more than the body's reach: paths keep clear of corners instead of scraping them. */
const CLEARANCE = 0.26;

export function buildNavGrid(nav: InteriorNav, level: number, shut: readonly Rect[] = []): NavGrid {
  const floor = nav.floors[level];
  const rooms = floor?.rooms ?? [];
  const x0 = Math.min(...rooms.map((r) => r.minX));
  const z0 = Math.min(...rooms.map((r) => r.minZ));
  const cols = Math.max(1, Math.ceil((Math.max(...rooms.map((r) => r.maxX)) - x0) / CELL));
  const rows = Math.max(1, Math.ceil((Math.max(...rooms.map((r) => r.maxZ)) - z0) / CELL));
  const free = new Uint8Array(cols * rows);
  const blocks = [...(floor?.solids ?? []), ...shut];
  // The flights meeting this floor are walked onto deliberately, not routed across.
  const flights = nav.stairs
    .filter((s) => s.level === level || s.level + 1 === level)
    .map((s) => ({
      minX: Math.min(s.bottom.x, s.top.x) - s.width / 2,
      maxX: Math.max(s.bottom.x, s.top.x) + s.width / 2,
      minZ: Math.min(s.bottom.z, s.top.z) - s.width / 2,
      maxZ: Math.max(s.bottom.z, s.top.z) + s.width / 2,
    }));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + (c + 0.5) * CELL;
      const z = z0 + (r + 0.5) * CELL;
      const inRoom = rooms.some((q) => x >= q.minX + 0.05 && x <= q.maxX - 0.05 && z >= q.minZ + 0.05 && z <= q.maxZ - 0.05);
      const blocked =
        blocks.some((b) => x > b.minX - CLEARANCE && x < b.maxX + CLEARANCE && z > b.minZ - CLEARANCE && z < b.maxZ + CLEARANCE) ||
        flights.some((b) => x > b.minX - 0.1 && x < b.maxX + 0.1 && z > b.minZ - 0.1 && z < b.maxZ + 0.1);
      free[r * cols + c] = inRoom && !blocked ? 1 : 0;
    }
  }
  return { level, x0, z0, cell: CELL, cols, rows, free };
}

const cellOf = (g: NavGrid, x: number, z: number) => [Math.floor((x - g.x0) / g.cell), Math.floor((z - g.z0) / g.cell)] as const;
const centre = (g: NavGrid, c: number, r: number) => ({ x: g.x0 + (c + 0.5) * g.cell, z: g.z0 + (r + 0.5) * g.cell });
const isFreeCell = (g: NavGrid, c: number, r: number) => c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.free[r * g.cols + c] === 1;

export function isFree(g: NavGrid, x: number, z: number) {
  const [c, r] = cellOf(g, x, z);
  return isFreeCell(g, c, r);
}

/** The free cell nearest a point, within `reach` metres (a spot the body can actually stand on). */
export function nearestFree(g: NavGrid, x: number, z: number, reach = 0.6): { x: number; z: number } | null {
  const [c0, r0] = cellOf(g, x, z);
  const span = Math.ceil(reach / g.cell);
  let best: { x: number; z: number } | null = null;
  let nearest = Infinity;
  for (let r = r0 - span; r <= r0 + span; r++) {
    for (let c = c0 - span; c <= c0 + span; c++) {
      if (!isFreeCell(g, c, r)) continue;
      const p = centre(g, c, r);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d <= reach && d < nearest) {
        nearest = d;
        best = p;
      }
    }
  }
  return best;
}

/**
 * The way from one point to another on the grid (both moved onto the nearest free cell), as a few
 * straight legs ending exactly at `to`'s free spot; null if there's no way.
 */
export function findPath(g: NavGrid, from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] | null {
  const start = nearestFree(g, from.x, from.z, 0.8);
  const goal = nearestFree(g, to.x, to.z, 0.9);
  if (!start || !goal) return null;
  const [sc, sr] = cellOf(g, start.x, start.z);
  const [gc, gr] = cellOf(g, goal.x, goal.z);
  const n = g.cols * g.rows;
  const cost = new Float32Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: [number, number][] = [];
  const push = (f: number, i: number) => {
    open.push([f, i]);
    let k = open.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (open[p][0] <= open[k][0]) break;
      [open[p], open[k]] = [open[k], open[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = open[0];
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === k) break;
        [open[m], open[k]] = [open[k], open[m]];
        k = m;
      }
    }
    return top;
  };
  const h = (c: number, r: number) => Math.hypot(c - gc, r - gr);
  const s = sr * g.cols + sc;
  cost[s] = 0;
  push(h(sc, sr), s);
  const target = gr * g.cols + gc;
  while (open.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === target) break;
    const c = i % g.cols;
    const r = (i - c) / g.cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (!isFreeCell(g, nc, nr)) continue;
        // No cutting corners past a blocked cell.
        if (dc && dr && (!isFreeCell(g, c + dc, r) || !isFreeCell(g, c, r + dr))) continue;
        const j = nr * g.cols + nc;
        const next = cost[i] + (dc && dr ? Math.SQRT2 : 1);
        if (next < cost[j]) {
          cost[j] = next;
          prev[j] = i;
          push(next + h(nc, nr), j);
        }
      }
    }
  }
  if (!closed[target]) return null;
  const cells: { x: number; z: number }[] = [];
  for (let i = target; i !== -1; i = prev[i]) {
    const c = i % g.cols;
    cells.push(centre(g, c, (i - c) / g.cols));
  }
  cells.reverse();
  cells[cells.length - 1] = goal;
  // Straighten: from each corner, go to the furthest point still in plain sight.
  const legs: { x: number; z: number }[] = [];
  let at = start;
  let k = 0;
  while (k < cells.length - 1) {
    let far = k + 1;
    for (let j = cells.length - 1; j > k + 1; j--) {
      if (clear(g, at, cells[j])) {
        far = j;
        break;
      }
    }
    legs.push(cells[far]);
    at = cells[far];
    k = far;
  }
  return legs.length ? legs : [goal];
}

/** Whether the straight line between two points stays on free cells. */
function clear(g: NavGrid, a: { x: number; z: number }, b: { x: number; z: number }) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (g.cell / 2));
  for (let k = 0; k <= steps; k++) {
    const t = steps ? k / steps : 0;
    if (!isFree(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}
