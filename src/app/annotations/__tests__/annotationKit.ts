import type { Point } from '../../types/visionTypes';
import { readDrawing, readText } from '../annotationList';
import type { DrawingAnnotation, TextAnnotation } from '../annotationTypes';
import { pathDistanceSq } from '../lineMath';

export { seeded } from '../../measure/__tests__/areaTestKit';

let made = 0;

/** A drawing as the reader reads it, from a record with these fields over a plain white pen stroke. */
export function drawing(fields: Record<string, unknown>): DrawingAnnotation {
  const id = typeof fields.id === 'string' ? fields.id : `d${made++}`;
  const read = readDrawing(id, { id, kind: 'drawing', timestamp: 1, type: 'pen', color: '#ffffff', width: 4, opacity: 1, ...fields });
  if (!read) throw new Error('The test asked for a drawing the reader does not read');
  return read;
}

/** A text as the reader reads it. */
export function text(fields: Record<string, unknown>): TextAnnotation {
  const id = typeof fields.id === 'string' ? fields.id : `t${made++}`;
  const read = readText(id, { id, kind: 'text', x: 0, y: 0, text: 'Text', fontSize: 20, fontFamily: 'Arial', color: '#ffffff', ...fields });
  if (!read) throw new Error('The test asked for a text the reader does not read');
  return read;
}

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** How far `point` lies from the line through `points`. */
export const distanceToPath = (point: Point, points: readonly Point[]): number => Math.sqrt(pathDistanceSq(point, points));

/** Points along the line through `points`, no more than `step` apart, its corners and its ends among them. */
export function sampled(points: readonly Point[], step: number): Point[] {
  const samples: Point[] = points.length > 0 ? [points[0]!] : [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const pieces = Math.max(1, Math.ceil(distance(a, b) / step));
    for (let piece = 1; piece <= pieces; piece++) samples.push({ x: a.x + ((b.x - a.x) * piece) / pieces, y: a.y + ((b.y - a.y) * piece) / pieces });
  }
  return samples;
}

/** How far the line through `from` strays from the line through `to` at most, by points `step` apart along it. */
export function strays(from: readonly Point[], to: readonly Point[], step = 0.05): number {
  return sampled(from, step).reduce((most, point) => Math.max(most, distanceToPath(point, to)), 0);
}

/** A line of `count` points that wanders from `start`, each step up to `stride` long, turning as it goes. */
export function wandering(random: () => number, count: number, stride: number, start: Point = { x: 0, y: 0 }): Point[] {
  const points = [start];
  let heading = random() * 2 * Math.PI;
  for (let i = 1; i < count; i++) {
    heading += (random() - 0.5) * 2.4;
    const length = stride * (0.2 + 0.8 * random());
    const last = points[i - 1]!;
    points.push({ x: last.x + Math.cos(heading) * length, y: last.y + Math.sin(heading) * length });
  }
  return points;
}
