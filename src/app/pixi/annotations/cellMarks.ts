import type { Graphics } from 'pixi.js';
import { CELL_FILL_OPACITY } from '../../annotations/cellFill';
import type { FilledPart } from '../../annotations/quantized';
import { contrastOf } from '../../annotations/textLook';
import type { Point } from '../../types/visionTypes';

/** The marks over cells an unfill will clear: a light veil in a dark and a light line, which read on any map. */
const CLEARING = { veil: 0.28, dark: 0x000000, light: 0xffffff, line: 1.5 } as const;
/** The outline of a cell a press will fill: the fill's colour on a wider line in the tone that stands out from it. Screen pixels. */
const FILLING = { line: 2, casing: 4, alpha: 0.9 } as const;

const flat = (ring: readonly Point[]): number[] => ring.flatMap(({ x, y }) => [x, y]);

/** Traces every ring of `parts`, for one stroke over all of them. */
function rings(graphics: Graphics, parts: readonly FilledPart[]): void {
  for (const { outline, holes } of parts) {
    for (const ring of [outline, ...holes]) {
      if (ring.length >= 3) graphics.poly(flat(ring), true);
    }
  }
}

function fills(graphics: Graphics, parts: readonly FilledPart[], color: string | number, alpha: number): void {
  for (const { outline, holes } of parts) {
    if (outline.length < 3) continue;
    graphics.poly(flat(outline), true).fill({ color, alpha });
    for (const hole of holes) graphics.poly(flat(hole), true).cut();
  }
}

/**
 * Marks `parts` as cells an unfill will clear, in place of what `graphics` held. `zoom` is screen
 * pixels to a world pixel: the lines keep their width on screen.
 */
export function paintClearing(graphics: Graphics, parts: readonly FilledPart[], zoom: number): void {
  const line = CLEARING.line / zoom;
  graphics.clear();
  fills(graphics, parts, CLEARING.light, CLEARING.veil);
  for (const [color, width] of [[CLEARING.dark, 3 * line], [CLEARING.light, line]] as const) {
    rings(graphics, parts);
    graphics.stroke({ color, width, alpha: 0.9, join: 'round' });
  }
}

/**
 * Marks `parts` as cells a press will fill with `color`, in place of what `graphics` held: tinted
 * as their fill will tint them, and outlined in the colour so the cell is told from one filled
 * already.
 */
export function paintFilling(graphics: Graphics, parts: readonly FilledPart[], color: string, zoom: number): void {
  graphics.clear();
  fills(graphics, parts, color, CELL_FILL_OPACITY);
  for (const [tone, width] of [[contrastOf(color), FILLING.casing / zoom], [color, FILLING.line / zoom]] as const) {
    rings(graphics, parts);
    graphics.stroke({ color: tone, width, alpha: FILLING.alpha, join: 'round' });
  }
}
