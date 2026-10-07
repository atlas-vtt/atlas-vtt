/** A point of the beam: where it is and how much of its life is left (1 fresh, 0 gone). */
export interface BeamPoint {
  x: number;
  y: number;
  life: number;
}

/**
 * Vertex data for one frame of the beam, reused between frames. The beam is a chain of
 * capsules, one per segment; each is a quad whose four vertices all carry the segment,
 * so the shader measures every pixel's distance to it.
 */
export interface LaserBeamBuffers {
  /** x, y of each quad corner. */
  positions: Float32Array;
  /** Per vertex: the segment's start x, y and end x, y. */
  segments: Float32Array;
  /** Per vertex: life at the start and end, radius at the start and end. */
  shapes: Float32Array;
  indices: Uint32Array;
}

export interface BeamBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Most raw pointer samples a trail keeps. */
export const MAX_TRAIL_SAMPLES = 100;
/** Smoothing adds at most this many points between two raw samples. */
const MAX_SUBDIVISIONS = 8;
const MAX_BEAM_POINTS = (MAX_TRAIL_SAMPLES + 1) * MAX_SUBDIVISIONS + 1;
/** A capsule per segment, plus one for the hovering pointer's dot. */
const MAX_CAPSULES = MAX_BEAM_POINTS;
/** The hovering pointer's dot is a little wider than the beam, so it reads as the laser's spot. */
export const DOT_SCALE = 1.25;

/** Longest straight step of the smoothed beam, in screen pixels. */
const SMOOTHING_SPACING = 3;
/**
 * Wide beams take longer steps: every capsule is a square as wide as the glow, so fine
 * steps would shade the same pixels many times over, and the curve stays round anyway.
 */
const SMOOTHING_SPACING_PER_WIDTH = 0.25;

/** Radius of the beam's solid body per unit of the size setting, in screen pixels. */
const BODY_PER_SIZE = 0.35;
/** The glow around the body grows with the size only up to GLOW_MAX, so wide beams stay crisp instead of hazy. */
const GLOW_PER_SIZE = 1.15;
const GLOW_MAX = 40;

/** Closest two trail points may be, in screen pixels; closer samples are mostly hand jitter. */
const MIN_POINT_SPACING = 3;
/** Wide beams keep points further apart: detail finer than the beam is invisible and costly. */
const MIN_POINT_SPACING_PER_WIDTH = 0.15;

/** The hot filament's share of the body, as in the shader, for beams drawn as strokes. */
export const FILAMENT_SHARE = 0.25;
export const FILAMENT_COLOR = 0xffffff;

export interface BeamWidth {
  /** Half the beam's width including its glow, in world units. */
  halfWidth: number;
  /** Share of that half width the solid body takes. */
  bodyShare: number;
}

/** Longest straight step of the smoothed beam in world units, so the curve stays round at any zoom. */
export function beamSmoothingSpacing(halfWidth: number, zoom: number): number {
  return Math.max(SMOOTHING_SPACING / zoom, halfWidth * SMOOTHING_SPACING_PER_WIDTH);
}

/** How wide the beam is for the size setting, which is in screen pixels at any zoom. */
export function beamWidth(size: number, zoom: number): BeamWidth {
  const body = size * BODY_PER_SIZE;
  const radius = body + Math.min(GLOW_MAX, size * GLOW_PER_SIZE);
  return { halfWidth: radius / zoom, bodyShare: body / radius };
}

/** The closest two trail points may be, in world units, for a laser of `size` at `zoom`. */
export function laserPointSpacing(size: number, zoom: number): number {
  const { halfWidth } = beamWidth(size, zoom);
  return Math.max(MIN_POINT_SPACING / zoom, halfWidth * MIN_POINT_SPACING_PER_WIDTH);
}

/** The beam's half width at `point`, narrowing as the point ages. */
export function beamRadius(point: BeamPoint, halfWidth: number): number {
  return halfWidth * Math.sqrt(Math.max(0, point.life));
}

export function createLaserBeamBuffers(): LaserBeamBuffers {
  return {
    positions: new Float32Array(MAX_CAPSULES * 4 * 2),
    segments: new Float32Array(MAX_CAPSULES * 4 * 4),
    shapes: new Float32Array(MAX_CAPSULES * 4 * 4),
    indices: new Uint32Array(MAX_CAPSULES * 6),
  };
}

/**
 * Catmull-Rom curve through the pointer samples, so fast strokes stay round instead of
 * showing the straight segments between pointer events. `spacing` is the longest step
 * between output points; life is interpolated along with the position.
 */
export function smoothBeam(points: readonly BeamPoint[], spacing: number): BeamPoint[] {
  if (points.length < 3) return points.map((point) => ({ ...point }));
  const smoothed: BeamPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const steps = Math.min(MAX_SUBDIVISIONS, Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / spacing)));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      smoothed.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
        life: p1.life + (p2.life - p1.life) * t,
      });
    }
  }
  smoothed.push({ ...points[points.length - 1]! });
  return smoothed;
}

/**
 * Writes the beam into `buffers`: a capsule along every segment of `trail`, narrowing as
 * its points age, and a round dot at `dot` (the pointer while it is not drawing). Each
 * capsule depends only on its own two ends, so jitter and sharp turns cannot fold the
 * beam. Index slots left over from longer frames become empty triangles. Returns the
 * area the beam covers, or null when nothing is drawn.
 */
export function writeLaserBeam(buffers: LaserBeamBuffers, trail: readonly BeamPoint[], dot: BeamPoint | null, halfWidth: number): BeamBounds | null {
  const writer = new CapsuleWriter(buffers);
  const points = trail.slice(-MAX_BEAM_POINTS);
  const radius = (point: BeamPoint): number => beamRadius(point, halfWidth);

  if (points.length === 1) writer.capsule(points[0]!, points[0]!, radius(points[0]!), radius(points[0]!));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    writer.capsule(a, b, radius(a), radius(b));
  }
  if (dot) writer.capsule(dot, dot, halfWidth * DOT_SCALE, halfWidth * DOT_SCALE);
  return writer.finish();
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t2 * t);
}

class CapsuleWriter {
  private count = 0;
  private readonly bounds: BeamBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  constructor(private readonly buffers: LaserBeamBuffers) {}

  /** A quad around the segment from `a` to `b`, reaching the larger radius beyond it on every side. */
  capsule(a: BeamPoint, b: BeamPoint, radiusA: number, radiusB: number): void {
    const reach = Math.max(radiusA, radiusB);
    if (reach <= 0 || this.count >= MAX_CAPSULES) return;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = length > 1e-6 ? (b.x - a.x) / length : 1;
    const dy = length > 1e-6 ? (b.y - a.y) / length : 0;
    const corners: [number, number][] = [
      [a.x - (dx - dy) * reach, a.y - (dy + dx) * reach],
      [a.x - (dx + dy) * reach, a.y - (dy - dx) * reach],
      [b.x + (dx - dy) * reach, b.y + (dy + dx) * reach],
      [b.x + (dx + dy) * reach, b.y + (dy - dx) * reach],
    ];

    const first = this.count * 4;
    corners.forEach(([x, y], corner) => {
      const vertex = first + corner;
      this.buffers.positions.set([x, y], vertex * 2);
      this.buffers.segments.set([a.x, a.y, b.x, b.y], vertex * 4);
      this.buffers.shapes.set([a.life, b.life, radiusA, radiusB], vertex * 4);
      this.bounds.minX = Math.min(this.bounds.minX, x);
      this.bounds.minY = Math.min(this.bounds.minY, y);
      this.bounds.maxX = Math.max(this.bounds.maxX, x);
      this.bounds.maxY = Math.max(this.bounds.maxY, y);
    });
    this.buffers.indices.set([first, first + 1, first + 2, first, first + 2, first + 3], this.count * 6);
    this.count++;
  }

  finish(): BeamBounds | null {
    this.buffers.indices.fill(0, this.count * 6);
    return this.count > 0 ? { ...this.bounds } : null;
  }
}
