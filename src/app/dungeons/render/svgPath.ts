/**
 * The path part of the SVG drawing context (`SvgCanvas`): subpaths, lines, curves and arcs as
 * Canvas 2D builds them, written as SVG path data in device pixels through the current transform.
 */

export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const TAU = Math.PI * 2;

export const num = (n: number): string => (Math.round(n * 100) / 100).toString();
export const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export abstract class SvgPathBuilder {
  protected path: string[] = [];
  /** The current point in user space, and where the open subpath began. */
  protected last: { x: number; y: number } | null = null;
  protected start: { x: number; y: number } | null = null;

  /** The transform points are taken through. */
  protected abstract get matrix(): Matrix;

  beginPath(): void {
    this.path = [];
    this.last = null;
    this.start = null;
  }

  moveTo(x: number, y: number): void {
    this.path.push(`M${this.point(x, y)}`);
    this.last = { x, y };
    this.start = { x, y };
  }

  lineTo(x: number, y: number): void {
    if (!this.last) {
      this.moveTo(x, y);
      return;
    }
    this.path.push(`L${this.point(x, y)}`);
    this.last = { x, y };
  }

  closePath(): void {
    if (!this.start) return;
    this.path.push('Z');
    this.last = { ...this.start };
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
    this.moveTo(x, y);
  }

  /** An ellipse as Canvas 2D adds one, as straight pieces fine enough for the small things drawn so (leaves' shadows, caps, petals). */
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, from: number, to: number, counterclockwise = false): void {
    let sweep = counterclockwise ? from - to : to - from;
    sweep = sweep >= TAU ? TAU : ((sweep % TAU) + TAU) % TAU;
    const signed = counterclockwise ? -sweep : sweep;
    const pieces = Math.max(4, Math.ceil((sweep / TAU) * 24));
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let i = 0; i <= pieces; i++) {
      const a = from + (signed * i) / pieces;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      const qx = x + px * cos - py * sin;
      const qy = y + px * sin + py * cos;
      if (i === 0 && !this.last) this.moveTo(qx, qy);
      else this.lineTo(qx, qy);
    }
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!this.last) this.moveTo(cx, cy);
    this.path.push(`Q${this.point(cx, cy)} ${this.point(x, y)}`);
    this.last = { x, y };
  }

  arc(x: number, y: number, r: number, from: number, to: number, counterclockwise = false): void {
    let sweep = counterclockwise ? from - to : to - from;
    sweep = sweep >= TAU ? TAU : ((sweep % TAU) + TAU) % TAU;
    const signed = counterclockwise ? -sweep : sweep;
    const startX = x + Math.cos(from) * r;
    const startY = y + Math.sin(from) * r;
    if (this.last) this.lineTo(startX, startY);
    else this.moveTo(startX, startY);
    if (sweep === 0 || r <= 0) return;
    // Halves at most, so no piece is ever a full turn.
    const pieces = Math.ceil(sweep / Math.PI);
    for (let i = 1; i <= pieces; i++) this.arcPiece(x, y, r, from + (signed * i) / pieces, signed / pieces);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
    const p0 = this.last;
    if (!p0) {
      this.moveTo(x1, y1);
      return;
    }
    const ax = p0.x - x1;
    const ay = p0.y - y1;
    const bx = x2 - x1;
    const by = y2 - y1;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (r === 0 || la === 0 || lb === 0 || Math.abs(ax * by - ay * bx) < 1e-12) {
      this.lineTo(x1, y1);
      return;
    }
    const cos = (ax * bx + ay * by) / (la * lb);
    const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;
    const reach = r / Math.tan(half);
    const t1 = { x: x1 + (ax / la) * reach, y: y1 + (ay / la) * reach };
    const t2 = { x: x1 + (bx / lb) * reach, y: y1 + (by / lb) * reach };
    // The centre lies along the bisector, r / sin(half) from the corner.
    const mx = ax / la + bx / lb;
    const my = ay / la + by / lb;
    const ml = Math.hypot(mx, my);
    const away = r / Math.sin(half);
    const cx = x1 + (mx / ml) * away;
    const cy = y1 + (my / ml) * away;
    const from = Math.atan2(t1.y - cy, t1.x - cx);
    const to = Math.atan2(t2.y - cy, t2.x - cx);
    // The corner's arc is the short way round.
    this.arc(cx, cy, r, from, to, (((to - from) % TAU) + TAU) % TAU > Math.PI);
  }

  /** Uniform scale of the transform: what a line width becomes in the drawing. */
  protected get unit(): number {
    const [a, b, c, d] = this.matrix;
    return Math.sqrt(Math.abs(a * d - b * c));
  }

  private point(x: number, y: number): string {
    const [a, b, c, d, e, f] = this.matrix;
    return `${num(a * x + c * y + e)} ${num(b * x + d * y + f)}`;
  }

  /** One piece of an arc, at most half a turn, ending at angle `end`; the transform keeps circles round. */
  private arcPiece(x: number, y: number, r: number, end: number, sweep: number): void {
    const [a, b, c, d] = this.matrix;
    const similar = Math.abs(a * a + b * b - (c * c + d * d)) < 1e-9 * (a * a + b * b + 1) && Math.abs(a * c + b * d) < 1e-9 * (a * a + b * b + 1);
    const ex = x + Math.cos(end) * r;
    const ey = y + Math.sin(end) * r;
    if (!similar) {
      // A transform that squashes circles: follow the arc in short lines.
      const steps = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 32)));
      for (let i = 1; i <= steps; i++) {
        const angle = end - sweep + (sweep * i) / steps;
        this.path.push(`L${this.point(x + Math.cos(angle) * r, y + Math.sin(angle) * r)}`);
      }
    } else {
      const det = a * d - b * c;
      const clockwise = (sweep > 0) === (det > 0);
      this.path.push(`A${num(r * this.unit)} ${num(r * this.unit)} 0 ${Math.abs(sweep) > Math.PI ? 1 : 0} ${clockwise ? 1 : 0} ${this.point(ex, ey)}`);
    }
    this.last = { x: ex, y: ey };
  }
}
