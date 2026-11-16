/** Segments in a uniform grid, for asking where a ray first meets one already drawn. */
export class SegmentHash {
  /** x0, y0, x1, y1 per segment. */
  private coords: number[] = [];
  private readonly cells = new Map<number, number[]>();
  /** The query that last looked at each segment, so one met in several cells is tested once. */
  private readonly stamps: number[] = [];
  private query = 0;

  constructor(private readonly cellSize: number) {}

  get count(): number {
    return this.coords.length / 4;
  }

  add(x0: number, y0: number, x1: number, y1: number): void {
    const id = this.coords.length / 4;
    this.coords.push(x0, y0, x1, y1);
    this.stamps.push(0);
    const s = this.cellSize;
    for (let gy = Math.floor(Math.min(y0, y1) / s); gy <= Math.floor(Math.max(y0, y1) / s); gy++) {
      for (let gx = Math.floor(Math.min(x0, x1) / s); gx <= Math.floor(Math.max(x0, x1) / s); gx++) {
        const key = keyOf(gx, gy);
        const list = this.cells.get(key);
        if (list) list.push(id);
        else this.cells.set(key, [id]);
      }
    }
  }

  /**
   * How far along the unit direction (dx, dy) from (x, y) the first stored segment is met, up to
   * `reach`; `reach` itself when none is.
   */
  firstHit(x: number, y: number, dx: number, dy: number, reach: number): number {
    const s = this.cellSize;
    const ex = x + dx * reach;
    const ey = y + dy * reach;
    let best = reach;
    const query = ++this.query;
    for (let gy = Math.floor(Math.min(y, ey) / s); gy <= Math.floor(Math.max(y, ey) / s); gy++) {
      for (let gx = Math.floor(Math.min(x, ex) / s); gx <= Math.floor(Math.max(x, ex) / s); gx++) {
        const list = this.cells.get(keyOf(gx, gy));
        if (!list) continue;
        for (const id of list) {
          if (this.stamps[id] === query) continue;
          this.stamps[id] = query;
          const t = rayHit(x, y, dx, dy, this.coords, id * 4);
          if (t >= 0 && t < best) best = t;
        }
      }
    }
    return best;
  }
}

/** Distance along a ray to a segment, or −1 when it misses. */
function rayHit(x: number, y: number, dx: number, dy: number, c: readonly number[], i: number): number {
  const ax = c[i]!;
  const ay = c[i + 1]!;
  const sx = c[i + 2]! - ax;
  const sy = c[i + 3]! - ay;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-12) return -1;
  const qx = ax - x;
  const qy = ay - y;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * dy - qy * dx) / denom;
  return t >= 0 && u >= 0 && u <= 1 ? t : -1;
}

function keyOf(gx: number, gy: number): number {
  return (gx + 32768) * 65536 + (gy + 32768);
}
