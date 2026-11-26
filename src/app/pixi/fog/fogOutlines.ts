/**
 * Outlines the fog tool marks ground with for the GM: the room under the pointer, and what the
 * fog's menu acts on. A solid line in the theme's accent over a dark line, as wide on screen at
 * any zoom.
 */
import type { Graphics } from 'pixi.js';
import { outlineRings } from '../../fog/fogKeyhole';
import type { Point } from '../../types/visionTypes';

/** Screen pixels. */
const LINE = { width: 2, casing: 4 } as const;
const CASING = { color: 0x000000, alpha: 0.4 } as const;

function trace(g: Graphics, outline: readonly Point[]): void {
  const first = outline[0]!;
  g.moveTo(first.x, first.y);
  for (let i = 1; i < outline.length; i++) g.lineTo(outline[i]!.x, outline[i]!.y);
  g.closePath();
}

/** Draws `outlines` into `g` (cleared first) for a viewport at `zoom`, in `accent`. Outlines of fewer than three corners are passed over. */
export function drawFogOutlines(g: Graphics, outlines: ReadonlyArray<readonly Point[]>, zoom: number, accent: number): void {
  g.clear();
  const pixel = 1 / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  // Ground round a hole is one outline with a slit to the hole: its rings are drawn, never the slit.
  const rings = outlines.flatMap((outline) => (outline.length >= 3 ? outlineRings(outline) : []));
  if (rings.length === 0) return;
  // The casing first, then the line: one stroke each, however many outlines there are.
  for (const ring of rings) trace(g, ring);
  g.stroke({ width: LINE.casing * pixel, color: CASING.color, alpha: CASING.alpha, join: 'round', cap: 'round' });
  for (const ring of rings) trace(g, ring);
  g.stroke({ width: LINE.width * pixel, color: accent, join: 'round', cap: 'round' });
}
