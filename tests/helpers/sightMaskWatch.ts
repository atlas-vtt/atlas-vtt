import type { Container } from 'pixi.js';
import { vi } from 'vitest';
import { SightMask, type SightMaskShapes } from '../../src/app/pixi/lighting/SightMask';
import { pointInPolygon, type Polygon } from '../../src/app/vision/visibility';

/**
 * Sight masks in jsdom, which has no canvas to compose on: each records what it was asked to
 * compose instead. The picture a real canvas makes of it is the browser tests' to hold.
 */
export interface WatchedMasks {
  /** How often any mask was composed since the last `reset`. */
  composed: () => number;
  reset: () => void;
  /** What the mask a fallback added to `viewport` shows: null while it shows nothing. */
  shapesIn: (viewport: Container) => SightMaskShapes | null;
  restore: () => void;
}

/** The mask a line-of-sight fallback added to `viewport`. */
export function maskViewOf(viewport: Container): Container {
  const view = viewport.children.find((child) => child.label === 'line-of-sight');
  if (!view) throw new Error('The fallback added no sight mask');
  return view;
}

export function watchSightMasks(): WatchedMasks {
  const held = new WeakMap<Container, SightMaskShapes | null>();
  let composed = 0;
  const compose = vi.spyOn(SightMask.prototype, 'compose').mockImplementation(function (this: SightMask, shapes: SightMaskShapes): void {
    held.set(this.view, shapes);
    composed++;
  });
  const clear = vi.spyOn(SightMask.prototype, 'clear').mockImplementation(function (this: SightMask): void {
    held.set(this.view, null);
  });
  return {
    composed: () => composed,
    reset: () => { composed = 0; },
    shapesIn: (viewport) => held.get(maskViewOf(viewport)) ?? null,
    restore: () => {
      compose.mockRestore();
      clear.mockRestore();
    },
  };
}

/**
 * Whether the black a mask composes from `shapes` is meant to cover a world point of the map,
 * by the polygons themselves: outside everything shown, or in a magical darkness nothing sees into.
 */
export function maskCovers(shapes: SightMaskShapes | null, x: number, y: number): boolean {
  if (!shapes || x < 0 || y < 0 || x > shapes.width || y > shapes.height) return false;
  const point = { x, y };
  const inAny = (polygons: readonly Polygon[]): boolean => polygons.some((polygon) => pointInPolygon(point, polygon));
  if (shapes.shown && !inAny(shapes.shown)) return true;
  return inAny(shapes.darkness) && !inAny(shapes.pierced);
}

/** The stretches of the row at `y` the black leaves open, as [first, end) world pixels read at pixel centres. */
export function openSpans(shapes: SightMaskShapes | null, y: number): [number, number][] {
  const width = shapes?.width ?? 0;
  const spans: [number, number][] = [];
  let start: number | null = null;
  for (let x = 0; x <= width; x++) {
    const open = x < width && !maskCovers(shapes, x + 0.5, y);
    if (open && start === null) start = x;
    if (!open && start !== null) {
      spans.push([start, x]);
      start = null;
    }
  }
  return spans;
}
