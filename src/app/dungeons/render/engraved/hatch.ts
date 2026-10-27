import type { Canvas2D } from '../geometry';

/**
 * Engraved lines: a field of parallel lines whose width follows a tone, each drawn as a ribbon
 * that swells where the tone is deep and tapers to nothing where it fades, as a burin cuts.
 */
export interface HatchSpec {
  /** Direction of the lines, radians on screen. */
  angle: number;
  /** Distance between lines, in cells. */
  spacing: number;
  /** Offset of the first line, in cells. */
  phase?: number;
  /** The area to cover, in cells. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Distance between samples along a line, in cells. */
  step: number;
  /** The line's full width at a point, in cells. */
  width: (x: number, y: number) => number;
  /** A sideways offset of the line at a point, in cells: the hand's tremor. */
  wobble?: (x: number, y: number) => number;
  /** Narrower than this, a line is not drawn. */
  minWidth: number;
  /** Whether anything is cut near a point at all; samples where not are skipped cheaply. */
  active?: (x: number, y: number) => boolean;
  /** Called every few lines with what has been traced, so no one path grows huge: fill it and begin anew. */
  batch?: () => void;
}

/** Adds every ribbon of the hatch to the current path (fill with nonzero or evenodd alike). */
export function traceHatch(path: CanvasPath, spec: HatchSpec): void {
  const tx = Math.cos(spec.angle);
  const ty = Math.sin(spec.angle);
  const nx = -ty;
  const ny = tx;
  const { minX, minY, maxX, maxY } = spec.bounds;
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]] as const;
  let cMin = Infinity;
  let cMax = -Infinity;
  let uMin = Infinity;
  let uMax = -Infinity;
  for (const [x, y] of corners) {
    const c = x * nx + y * ny;
    const u = x * tx + y * ty;
    cMin = Math.min(cMin, c);
    cMax = Math.max(cMax, c);
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
  }
  const phase = spec.phase ?? 0;
  const first = Math.ceil((cMin - phase) / spec.spacing);
  const left: number[] = [];
  const right: number[] = [];
  const flush = (): void => {
    if (left.length >= 4) {
      path.moveTo(left[0]!, left[1]!);
      for (let i = 2; i < left.length; i += 2) path.lineTo(left[i]!, left[i + 1]!);
      for (let i = right.length - 2; i >= 0; i -= 2) path.lineTo(right[i]!, right[i + 1]!);
      path.closePath();
    }
    left.length = 0;
    right.length = 0;
  };
  // Along a line the width changes slowly: a point is kept only where it turns by more than this.
  const tolerance = spec.spacing * 0.03;
  let pending: [number, number, number, number] | null = null;
  let lastW = -1;
  const push = (lx: number, ly: number, rx: number, ry: number): void => {
    left.push(lx, ly);
    right.push(rx, ry);
  };
  for (let k = first; phase + k * spec.spacing <= cMax; k++) {
    const c = phase + k * spec.spacing;
    const [u0, u1] = spanInBox(nx * c, ny * c, tx, ty, spec.bounds);
    lastW = -1;
    pending = null;
    for (let u = u0; u <= u1; u += spec.step) {
      let x = nx * c + tx * u;
      let y = ny * c + ty * u;
      const w = spec.active && !spec.active(x, y) ? 0 : spec.width(x, y);
      if (w < spec.minWidth) {
        if (pending) push(...pending);
        pending = null;
        lastW = -1;
        flush();
        continue;
      }
      if (spec.wobble) {
        const o = spec.wobble(x, y);
        x += nx * o;
        y += ny * o;
      }
      const h = w / 2;
      const point: [number, number, number, number] = [x + nx * h, y + ny * h, x - nx * h, y - ny * h];
      if (!spec.wobble && lastW >= 0 && Math.abs(w - lastW) < tolerance) {
        pending = point;
        continue;
      }
      if (pending) push(...pending);
      pending = null;
      push(...point);
      lastW = w;
    }
    if (pending) push(...pending);
    flush();
    if (spec.batch && k % 24 === 0) spec.batch();
  }
  spec.batch?.();
}

/** The stretch of the line through (px, py) along (tx, ty) that lies in the box, by its parameter. */
function spanInBox(px: number, py: number, tx: number, ty: number, b: HatchSpec['bounds']): [number, number] {
  let lo = -Infinity;
  let hi = Infinity;
  for (const [p, t, min, max] of [[px, tx, b.minX, b.maxX], [py, ty, b.minY, b.maxY]] as const) {
    if (Math.abs(t) < 1e-12) {
      if (p < min || p > max) return [1, 0];
      continue;
    }
    const a = (min - p) / t;
    const z = (max - p) / t;
    lo = Math.max(lo, Math.min(a, z));
    hi = Math.min(hi, Math.max(a, z));
  }
  return [lo, hi];
}

/** Fills a hatch in `colour`, in batches of lines, so no single path grows huge. */
export function hatchFill(ctx: Canvas2D, colour: string, spec: HatchSpec): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  traceHatch(ctx, {
    ...spec,
    batch: () => {
      ctx.fill();
      ctx.beginPath();
    },
  });
}
