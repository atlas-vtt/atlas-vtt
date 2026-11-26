/**
 * One 2D context that draws on several band canvases at once: the rows `top` of each band of a
 * picture. Every call goes to every band, moved up by its `top`, so a picture is worked out once
 * however many canvases it is drawn on. State and paths also go to `reference`, a context of
 * one pixel with no band offset, which answers what a context is asked (its transform) exactly as the
 * picture's own canvas would.
 */

export interface Band {
  ctx: OffscreenCanvasRenderingContext2D;
  top: number;
}

/** Calls that only put pixels on a canvas: the reference does without them. */
const DRAWS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'fillText', 'strokeText', 'drawFocusIfNeeded']);
/** Calls that ask the context's state: the reference alone answers them. */
const ASKS = new Set(['getTransform', 'measureText', 'isPointInPath', 'isPointInStroke', 'getLineDash', 'getContextAttributes', 'isContextLost']);
/**
 * Calls that make a paint, which the first band makes for all: a pattern made on an accelerated
 * canvas holds its picture on the graphics card, as on the picture's own canvas. One made on the
 * reference (too small to be accelerated) holds it in memory, and each band's upload of it came out
 * differently while other workers drew.
 */
const MAKES = new Set(['createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern', 'createImageData']);
/** Calls in device pixels, which a band would need moved by hand; the dungeon's drawing makes none. */
const REFUSED = new Set(['getImageData', 'putImageData', 'reset', 'commit']);

function matrixOf(args: unknown[]): DOMMatrix {
  if (args.length >= 6) return new DOMMatrix((args as number[]).slice(0, 6));
  return DOMMatrix.fromMatrix(args[0] as DOMMatrix2DInit | undefined);
}

function bandsContext(reference: OffscreenCanvasRenderingContext2D, bands: readonly Band[]): OffscreenCanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {};
  const proto = OffscreenCanvasRenderingContext2D.prototype;
  for (const name of Object.getOwnPropertyNames(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name)!;
    if (name === 'constructor') continue;
    if (descriptor.get) {
      Object.defineProperty(ctx, name, {
        get: () => (reference as unknown as Record<string, unknown>)[name],
        set: (value: unknown) => {
          for (const target of [reference, ...bands.map((band) => band.ctx)]) (target as unknown as Record<string, unknown>)[name] = value;
        },
      });
      continue;
    }
    if (typeof descriptor.value !== 'function') continue;
    const call = (target: OffscreenCanvasRenderingContext2D, args: unknown[]): unknown => (target as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!(...args);
    if (REFUSED.has(name)) ctx[name] = (): never => { throw new Error(`A map drawn in bands cannot ${name}.`); };
    else if (ASKS.has(name)) ctx[name] = (...args: unknown[]): unknown => call(reference, args);
    else if (MAKES.has(name)) ctx[name] = (...args: unknown[]): unknown => call(bands[0]!.ctx, args);
    else if (name === 'setTransform' || name === 'resetTransform') {
      ctx[name] = (...args: unknown[]): void => {
        const m = name === 'resetTransform' ? new DOMMatrix() : matrixOf(args);
        reference.setTransform(m);
        for (const band of bands) band.ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f - band.top);
      };
    } else {
      const draws = DRAWS.has(name);
      ctx[name] = (...args: unknown[]): void => {
        if (!draws) call(reference, args);
        for (const band of bands) call(band.ctx, args);
      };
    }
  }
  return ctx as unknown as OffscreenCanvasRenderingContext2D;
}

/**
 * Draws `draw` once on every band: each band's context is moved up by its `top` first, the
 * reference keeps the picture's own frame.
 */
export function drawOnBands(bands: readonly Band[], draw: (ctx: OffscreenCanvasRenderingContext2D) => void): void {
  const reference = new OffscreenCanvas(1, 1).getContext('2d');
  if (!reference) throw new Error('Could not draw the dungeon: no 2D canvas.');
  for (const band of bands) band.ctx.setTransform(1, 0, 0, 1, 0, -band.top);
  draw(bandsContext(reference, bands));
}
