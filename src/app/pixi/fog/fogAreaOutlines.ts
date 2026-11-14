/**
 * The outlines of fog areas as the GM sees them: a solid line around a hidden area and a dashed
 * one around a revealed area, in the theme's accent over a dark line, as wide on screen at any zoom.
 */
import type { Graphics } from 'pixi.js';
import { outlineRings } from '../../fog/fogKeyhole';
import type { Point } from '../../types/visionTypes';

/** Screen pixels. */
const LINE = { width: 2, casing: 4 } as const;
const CASING = { color: 0x000000, alpha: 0.4 } as const;
const DASH = { on: 8, off: 6 } as const;
/** The most dashes one outline is drawn with: a longer one gets longer dashes, so no outline costs more. */
const MAX_DASHES = 400;

/** One area's outline to draw. */
export interface AreaOutline {
  readonly outline: readonly Point[];
  /** A revealed area: its outline is dashed. */
  readonly dashed: boolean;
}

function trace(g: Graphics, outline: readonly Point[]): void {
  const first = outline[0]!;
  g.moveTo(first.x, first.y);
  for (let i = 1; i < outline.length; i++) g.lineTo(outline[i]!.x, outline[i]!.y);
  g.closePath();
}

/** Traces dashes around the closed `outline`, the pattern running on over its corners. `on` and `off` are world pixels. */
function traceDashes(g: Graphics, outline: readonly Point[], on: number, off: number): void {
  let length = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const stretch = Math.max(1, length / ((on + off) * MAX_DASHES));
  const dash = on * stretch;
  const period = (on + off) * stretch;
  // How far along the pattern the line is: within a dash below `dash`, in a gap from there.
  let phase = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const edge = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(edge > 0)) continue;
    const ux = (b.x - a.x) / edge;
    const uy = (b.y - a.y) / edge;
    let at = 0;
    if (phase < dash) g.moveTo(a.x, a.y);
    while (at < edge) {
      const inDash = phase < dash;
      const end = inDash ? dash : period;
      // The pattern's next change, or the corner where that comes first.
      const left = edge - at;
      const reaches = end - phase <= left;
      at = reaches ? at + (end - phase) : edge;
      phase = reaches ? end % period : phase + left;
      if (inDash) g.lineTo(a.x + ux * at, a.y + uy * at);
      else if (reaches && at < edge) g.moveTo(a.x + ux * at, a.y + uy * at);
    }
  }
}

/** Draws `areas` into `g` (cleared first) for a viewport at `zoom`, in `accent`. Outlines of fewer than three corners are passed over. */
export function drawAreaOutlines(g: Graphics, areas: readonly AreaOutline[], zoom: number, accent: number): void {
  g.clear();
  const pixel = 1 / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
  // A room around rooms is one outline with slits to what it encloses: its rings are drawn, never the slits.
  const drawn = areas.flatMap(({ outline, dashed }) => (outline.length >= 3 ? outlineRings(outline) : []).map((ring) => ({ outline: ring, dashed })));
  if (drawn.length === 0) return;
  // Every casing first, then every line: one stroke each, however many areas there are.
  for (const pass of ['casing', 'line'] as const) {
    for (const { outline, dashed } of drawn) {
      if (dashed) traceDashes(g, outline, DASH.on * pixel, DASH.off * pixel);
      else trace(g, outline);
    }
    if (pass === 'casing') g.stroke({ width: LINE.casing * pixel, color: CASING.color, alpha: CASING.alpha, join: 'round', cap: 'round' });
    else g.stroke({ width: LINE.width * pixel, color: accent, join: 'round', cap: 'round' });
  }
}
