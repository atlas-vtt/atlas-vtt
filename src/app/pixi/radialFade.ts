import type { Segment } from './spectralEngine/gridTemplate';

/** Opacity at a distance from the centre; stops are sorted by radius, and the last one holds beyond it. */
export interface FadeStop {
  radius: number;
  alpha: number;
}

/** Pieces of line that share one opacity, so each group needs a single stroke. */
export interface FadeGroup {
  alpha: number;
  pieces: Segment[];
}

export function fadeAlphaAt(stops: readonly FadeStop[], distance: number): number {
  const first = stops[0];
  if (!first || distance <= first.radius) return first?.alpha ?? 1;
  for (let i = 1; i < stops.length; i++) {
    const inner = stops[i - 1]!;
    const outer = stops[i]!;
    if (distance <= outer.radius) {
      const t = (distance - inner.radius) / (outer.radius - inner.radius);
      return inner.alpha + (outer.alpha - inner.alpha) * t;
    }
  }
  return stops[stops.length - 1]!.alpha;
}

/**
 * Cuts `segments` into pieces about `pieceLength` long and groups them by the
 * opacity the fade gives their midpoint (distance from the origin), rounded to
 * `levels` steps. Invisible pieces are dropped.
 */
export function radialFadeGroups(
  segments: readonly Segment[],
  stops: readonly FadeStop[],
  pieceLength: number,
  levels: number,
): FadeGroup[] {
  const groups = new Map<number, Segment[]>();
  for (const { x1, y1, x2, y2 } of segments) {
    const count = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / pieceLength));
    for (let i = 0; i < count; i++) {
      const a = i / count;
      const b = (i + 1) / count;
      const midX = x1 + (x2 - x1) * (a + b) / 2;
      const midY = y1 + (y2 - y1) * (a + b) / 2;
      const level = Math.round(fadeAlphaAt(stops, Math.hypot(midX, midY)) * levels);
      if (level <= 0) continue;
      const piece = { x1: x1 + (x2 - x1) * a, y1: y1 + (y2 - y1) * a, x2: x1 + (x2 - x1) * b, y2: y1 + (y2 - y1) * b };
      const group = groups.get(level);
      if (group) group.push(piece);
      else groups.set(level, [piece]);
    }
  }
  return [...groups].map(([level, pieces]) => ({ alpha: level / levels, pieces }));
}
