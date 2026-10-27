import { inflateShape, intersectShapes, subtractShapes, unionShapes } from '../../lighting/polygonClip';
import type { QShape } from '../../types/shapeTypes';
import type { Vec } from './geometry';

/**
 * Polygon union, intersection and difference in cells, through the lighting's clipping helpers, which work on
 * integers: cells are scaled to 1/1024 of a cell, far finer than any pixel a map is drawn at.
 */
const SCALE = 1024;

export type Rings = Vec[][];

function toQ(rings: readonly (readonly Vec[])[]): QShape {
  return rings
    .filter(ring => ring.length >= 3)
    .map(ring => ring.flatMap(p => [Math.round(p.x * SCALE), Math.round(p.y * SCALE)]));
}

function fromQ(shape: QShape): Rings {
  return shape.map(ring => {
    const out: Vec[] = [];
    for (let i = 0; i < ring.length; i += 2) out.push({ x: ring[i]! / SCALE, y: ring[i + 1]! / SCALE });
    return out;
  });
}

export function unionRings(rings: readonly (readonly Vec[])[]): Rings {
  return fromQ(unionShapes(toQ(rings), []));
}

/** What `a` and `b` cover both. */
export function intersectRings(a: readonly (readonly Vec[])[], b: readonly (readonly Vec[])[]): Rings {
  return fromQ(intersectShapes(toQ(a), toQ(b)));
}

/** Rings grown by `grow` cells (shrunk where negative), holes shrinking as the outer grows, with round or square corners. */
export function grownRings(rings: readonly (readonly Vec[])[], grow: number, join: 'round' | 'miter' = 'round'): Rings {
  return fromQ(inflateShape(toQ(rings), Math.round(grow * SCALE), join));
}

/** What `a` covers and `b` does not. */
export function subtractRings(a: readonly (readonly Vec[])[], b: readonly (readonly Vec[])[]): Rings {
  return fromQ(subtractShapes(toQ(a), toQ(b)));
}
