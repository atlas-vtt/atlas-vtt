import { boxOutline, stampBox, textBox } from '../../annotations/annotationBounds';
import type { Annotation } from '../../annotations/annotationTypes';
import { inFill } from '../../annotations/lineMath';
import type { Point } from '../../types/visionTypes';

/** The most places of one drawing or text that are asked about. */
const MAX_SAMPLES = 16;
/** The most places one look asks the players' sight about: what is left waits for the next look. */
const SIGHT_BUDGET = 1_024;

/** What says which places of the map players know. */
export interface KnownPlaces {
  /** What the players' sight is worked out from now, by identity: while every part is the same, so is what they see. Without it every look asks anew. */
  readonly sight?: readonly unknown[];
  /** Which of `points` the players see now; null while that cannot be read. */
  seen(points: readonly Point[]): boolean[] | null;
  /** What the players' memory is, by identity, and whether it holds a place; without it nothing is remembered. */
  readonly memory?: { readonly key: unknown; holds(point: Point): boolean } | undefined;
}

const samples = new WeakMap<Annotation, readonly Point[]>();

/**
 * The places a drawing or text on the map is asked about: along its line (its ends and points
 * between them), the corners and the middle of a stamp's or a text's box, and places inside a
 * fill. At most `MAX_SAMPLES`, worked out once for what was read.
 */
export function samplePoints(annotation: Annotation): readonly Point[] {
  let points = samples.get(annotation);
  if (points === undefined) {
    points = sampled(annotation);
    samples.set(annotation, points);
  }
  return points;
}

function sampled(annotation: Annotation): Point[] {
  if (annotation.kind === 'text') return [{ x: annotation.x, y: annotation.y }, ...boxOutline(textBox(annotation)).slice(0, 4)];
  const { points } = annotation;
  if (annotation.shape === 'stamp') return [{ ...points[0]! }, ...boxOutline(stampBox(annotation)).slice(0, 4)];
  const along = annotation.fill === null ? MAX_SAMPLES : MAX_SAMPLES / 2;
  const taken: Point[] = [];
  const count = Math.min(along, points.length);
  for (let index = 0; index < count; index += 1) taken.push(points[count === 1 ? 0 : Math.round((index * (points.length - 1)) / (count - 1))]!);
  if (annotation.fill === null) return taken;
  // Inside a fill: a grid over its box, of which the places in the fill count. A room coloured in is known by its floor.
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  for (const row of [0.25, 0.5, 0.75]) {
    for (const column of [0.25, 0.5, 0.75]) {
      const point = { x: minX + (maxX - minX) * column, y: minY + (maxY - minY) * row };
      if (taken.length < MAX_SAMPLES && inFill(point, points, annotation.holes)) taken.push(point);
    }
  }
  return taken;
}

/** What a drawing or text is known under: a text and a drawing may share an id. */
const nameOf = (annotation: Annotation): string => `${annotation.kind}:${annotation.id}`;
/** What a drawing or text is known by: where it lies. Its colour may change and it stays known; moved, it is asked about anew. */
const placeOf = (annotation: Annotation): unknown => (annotation.kind === 'text' ? `${annotation.x},${annotation.y}` : annotation.points);

/**
 * Which drawings and texts on the map the players know of. What lies on the map is lit like the
 * floor and shows only where players see or remember the map, but a page is told all of what it
 * is told: its line, its words. So an entry on the map is told only once players have seen or
 * remember a part of it: one of the places it is asked about (`samplePoints`) is in their sight
 * now or in their memory. A large one is told whole once any part of it is known.
 *
 * Known once, an entry stays known while it lies where it lay: players remember, and nothing
 * flickers. Sight is asked about only when it, the fog or the entries changed, of the entries
 * not known yet alone, and of no more than `SIGHT_BUDGET` places a look: the rest waits for the
 * next (`pending`).
 */
export class KnownOnMap {
  private readonly known = new Map<string, unknown>();
  private key: readonly unknown[] = [];
  private memoryKey: readonly unknown[] = [];
  /** Where among the entries not known yet the next look goes on. */
  private cursor = 0;
  private more = false;
  /** Counts up whenever an entry becomes known or is known no more. */
  version = 0;

  /** Whether a look left entries unasked: whoever looks should look again soon. */
  get pending(): boolean {
    return this.more;
  }

  /** Looks at `onMap`, the entries on the map players may be told at all, and takes in which of them they know now. `key`: what `onMap` was read from, by identity. */
  look(onMap: readonly Annotation[], key: readonly unknown[], places: KnownPlaces): void {
    const there = new Set(onMap.map(nameOf));
    for (const id of [...this.known.keys()]) {
      if (there.has(id)) continue;
      this.known.delete(id);
      this.version += 1;
    }
    const unknown = onMap.filter((annotation) => !this.knows(annotation));
    for (const annotation of unknown) if (this.known.delete(nameOf(annotation))) this.version += 1;
    if (unknown.length === 0) {
      this.more = false;
      return;
    }
    const same = (parts: readonly unknown[], last: readonly unknown[]): boolean => parts.length === last.length && parts.every((part, index) => part === last[index]);
    const { memory } = places;
    // The memory is asked about every entry not known whenever it or the entries are others: it only reads a grid.
    const memoryKey = [...key, memory?.key];
    if (memory !== undefined && !same(memoryKey, this.memoryKey)) {
      for (const annotation of unknown) if (samplePoints(annotation).some((point) => memory.holds(point))) this.learn(annotation);
    }
    this.memoryKey = memoryKey;
    const sightKey = [...key, ...(places.sight ?? [{}])];
    const sameSight = same(sightKey, this.key);
    if (sameSight && !this.more) return;
    if (!sameSight) this.cursor = 0;
    this.key = sightKey;
    const asked = unknown.filter((annotation) => !this.knows(annotation));
    const batch: Annotation[] = [];
    let budget = SIGHT_BUDGET;
    let at = Math.min(this.cursor, asked.length);
    for (; at < asked.length && budget > 0; at += 1) {
      batch.push(asked[at]!);
      budget -= samplePoints(asked[at]!).length;
    }
    const points = batch.flatMap((annotation) => samplePoints(annotation));
    const seen = points.length === 0 ? [] : places.seen(points);
    // Sight that cannot be read is asked about again at the next look.
    if (seen === null) {
      this.key = [];
      this.more = false;
      return;
    }
    let from = 0;
    let learnt = 0;
    for (const annotation of batch) {
      const count = samplePoints(annotation).length;
      if (seen.slice(from, from + count).some(Boolean)) {
        this.learn(annotation);
        learnt += 1;
      }
      from += count;
    }
    // Those just learnt are asked about no more, so the entries after them come that much sooner.
    this.cursor = at - learnt;
    this.more = at < asked.length;
  }

  knows(annotation: Annotation): boolean {
    return this.known.get(nameOf(annotation)) === placeOf(annotation);
  }

  clear(): void {
    if (this.known.size > 0) this.version += 1;
    this.known.clear();
    this.key = [];
    this.memoryKey = [];
    this.cursor = 0;
    this.more = false;
  }

  private learn(annotation: Annotation): void {
    this.known.set(nameOf(annotation), placeOf(annotation));
    this.version += 1;
  }
}
