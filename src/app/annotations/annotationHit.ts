/**
 * Which annotations a point or an area finds. A line is found by its ink, a fill by its inside
 * less its holes, a text or a stamp by its turned box. `AnnotationIndex` keeps the annotations'
 * bounds in a tree, so a question over a level full of drawings looks closely at a handful.
 */

import type { Point } from '../types/visionTypes';
import type { Box } from '../vision/polygonBounds';
import { annotationBounds, boxOutline, inTurnedBox, stampBox, textBox, type TextMeasure } from './annotationBounds';
import type { Annotation } from './annotationTypes';
import { BoxTree } from './boxTree';
import { inFill, pathDistanceSq } from './lineMath';
import { areaBounds, areaTouches, type SelectArea } from './selectArea';

/**
 * Whether `point` is on `annotation`, or within `tolerance` of it (world pixels: a thin line must
 * stay easy to take). An arrowhead is found by the line it ends.
 */
export function hitAnnotation(point: Point, tolerance: number, annotation: Annotation, measure?: TextMeasure): boolean {
  if (annotation.kind === 'text') return inTurnedBox(point, textBox(annotation, measure), tolerance);
  if (annotation.shape === 'stamp') return inTurnedBox(point, stampBox(annotation), tolerance);
  const bounds = annotationBounds(annotation);
  if (point.x < bounds.minX - tolerance || point.x > bounds.maxX + tolerance || point.y < bounds.minY - tolerance || point.y > bounds.maxY + tolerance) return false;
  const reach = annotation.width / 2 + tolerance;
  if (pathDistanceSq(point, annotation.points) <= reach * reach) return true;
  return annotation.fill !== null && annotation.closed && inFill(point, annotation.points, annotation.holes);
}

/** The lines an area must touch to take `annotation`: a drawing's line and the rings of its holes, a text's or stamp's box. */
function outlinesOf(annotation: Annotation, measure: TextMeasure | undefined): readonly (readonly Point[])[] {
  if (annotation.kind === 'text') return [boxOutline(textBox(annotation, measure))];
  if (annotation.shape === 'stamp') return [boxOutline(stampBox(annotation))];
  if (annotation.holes.length === 0) return [annotation.points];
  return [annotation.points, ...annotation.holes.map((hole) => [...hole, hole[0]!])];
}

/** The annotations of one list by where they are. `list` is in drawing order: a later one lies over an earlier one. */
export class AnnotationIndex {
  private readonly tree: BoxTree;

  constructor(readonly list: readonly Annotation[], readonly measure?: TextMeasure) {
    this.tree = new BoxTree(list.map((annotation) => annotationBounds(annotation, measure)));
  }

  /** The annotations whose bounds touch `box`, in drawing order: what may show on a screen, what a sweep may reach. */
  touching(box: Box): Annotation[] {
    return this.tree.touching(box.minX, box.minY, box.maxX, box.maxY).map((index) => this.list[index]!);
  }

  /** The annotations at `point` (see `hitAnnotation`), the topmost first. */
  at(point: Point, tolerance: number): Annotation[] {
    const found: Annotation[] = [];
    const near = this.tree.touching(point.x - tolerance, point.y - tolerance, point.x + tolerance, point.y + tolerance);
    for (let i = near.length - 1; i >= 0; i--) {
      const annotation = this.list[near[i]!]!;
      if (hitAnnotation(point, tolerance, annotation, this.measure)) found.push(annotation);
    }
    return found;
  }

  /** The annotations `area` touches (see `selectArea.ts`), in drawing order. */
  in(area: SelectArea): Annotation[] {
    const bounds = areaBounds(area);
    if (!(bounds.minX <= bounds.maxX) || !(bounds.minY <= bounds.maxY)) return [];
    const found: Annotation[] = [];
    for (const index of this.tree.touching(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)) {
      const annotation = this.list[index]!;
      if (areaTouches(area, bounds, outlinesOf(annotation, this.measure))) found.push(annotation);
    }
    return found;
  }
}

let indexes = new WeakMap<readonly Annotation[], AnnotationIndex>();

/** Forgets every index built so far: the measurer sizes texts another way now (a face has loaded). */
export function forgetAnnotationIndexes(): void {
  indexes = new WeakMap();
}

/**
 * The index of `list`, built once per list and measurer: the reader hands out the same list while
 * no record changed, so a pointer that moves over a still scene builds nothing.
 */
export function annotationIndex(list: readonly Annotation[], measure?: TextMeasure): AnnotationIndex {
  let index = indexes.get(list);
  if (!index || index.measure !== measure) {
    index = new AnnotationIndex(list, measure);
    indexes.set(list, index);
  }
  return index;
}

/** The annotations of `list` at `point`, the topmost first. */
export function annotationsAt(point: Point, tolerance: number, list: readonly Annotation[], measure?: TextMeasure): Annotation[] {
  return annotationIndex(list, measure).at(point, tolerance);
}

/** The annotations of `list` a marquee's box or a lasso touches, in drawing order. */
export function annotationsIn(area: SelectArea, list: readonly Annotation[], measure?: TextMeasure): Annotation[] {
  return annotationIndex(list, measure).in(area);
}
