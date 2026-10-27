import type { Hand, Material } from '../../../src/app/dungeons/render/art/hand';
import type { Canvas2D, Vec } from '../../../src/app/dungeons/render/geometry';
import type { PathFn } from '../../../src/app/dungeons/render/art/paths';
import type { ArtDirection } from '../../../src/app/dungeons/style';

/** What a test hand was asked to draw, with the context's turn at the time. */
export interface HandCall {
  kind: 'edges' | 'solid' | 'tone' | 'grain';
  /** The context's net rotation when called, radians. */
  rotation: number;
  poly?: readonly Vec[];
  path?: PathFn;
  centre?: Vec;
  material?: Material;
}

/** A context that keeps only its net rotation and scale, for asking in which frame a hand was called. */
export function turnTracker(): { ctx: Canvas2D; rotation: () => number } {
  let state = { rotation: 0 };
  const stack: (typeof state)[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_target, key) {
      if (key === 'save') return () => stack.push({ ...state });
      if (key === 'restore') return () => { state = stack.pop() ?? state; };
      if (key === 'rotate') return (a: number) => { state.rotation += a; };
      return () => undefined;
    },
    set: () => true,
  });
  return { ctx: ctx as unknown as Canvas2D, rotation: () => state.rotation };
}

/** Line widths in cells by weight; any other weight is a heavy line. */
const WEIGHTS: Record<string, number> = { outline: 0.013, fine: 0.007 };

/** A hand over `ctx` that records what it is asked to draw and draws nothing. */
export function recordingHand(ctx: Canvas2D, rotation: () => number, direction: ArtDirection = 'stone'): { hand: Hand; calls: HandCall[] } {
  const calls: HandCall[] = [];
  const palette = { ink: '#111111', fill: '#eeeeee', water: '#88aacc', paper: '#ffffff', floor: '#eeeeee', rock: '#999999', line: '#111111' };
  const hand = {
    scene: { env: { ctx, palette, style: { direction } }, raster: false },
    tone: (_field: unknown, _bounds: unknown, path: PathFn | null) => calls.push({ kind: 'tone', rotation: rotation(), ...(path && { path }) }),
    surface: () => undefined,
    fill: () => undefined,
    line: () => undefined,
    edges: (poly: readonly Vec[]) => calls.push({ kind: 'edges', rotation: rotation(), poly }),
    solid: (path: PathFn, centre: Vec) => calls.push({ kind: 'solid', rotation: rotation(), path, centre }),
    water: () => undefined,
    lava: () => undefined,
    paint: () => ({ fill: '#eeeeee', ink: '#111111' }),
    grain: (path: PathFn, material: Material) => calls.push({ kind: 'grain', rotation: rotation(), path, material }),
    weight: (w: string) => WEIGHTS[w] ?? 0.028,
  };
  return { hand: hand as unknown as Hand, calls };
}
