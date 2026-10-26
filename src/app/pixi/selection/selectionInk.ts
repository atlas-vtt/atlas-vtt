import type { Graphics } from 'pixi.js';
import { CANVAS_INK, INK_SHADE } from '../utils/canvasInk';
import { HIGHLIGHT_EDGE, SELECTION_LOOK, grownPath, openRuns, outlinePoints, type HighlightPath, type Notch, type RoundedBox } from './selectionGeometry';

/** The group frame's accent opacity: present, never louder than a highlight. */
const GROUP_ALPHA = 0.55;

function trace(graphics: Graphics, path: HighlightPath): Graphics {
  if (path.kind === 'circle') return graphics.circle(0, 0, path.radius);
  return graphics.poly(outlinePoints(path).flatMap(({ x, y }) => [x, y]), true);
}

/**
 * Strokes `path`, leaving out what lies under `handles` with `SELECTION_LOOK.handleClearance` around
 * each: a line of `width` ends that far from a handle's edge, so every band's gap is even.
 */
function strokeBand(graphics: Graphics, path: HighlightPath, handles: readonly Notch[], width: number, color: number, alpha: number): void {
  const reach = SELECTION_LOOK.handleClearance + width / 2;
  const runs = handles.length > 0 ? openRuns(outlinePoints(path), handles.map((handle) => ({ ...handle, radius: handle.radius + reach }))) : null;
  if (runs === null) {
    trace(graphics, path).stroke({ width, color, alpha });
    return;
  }
  for (const run of runs) {
    graphics.moveTo(run[0]!.x, run[0]!.y);
    for (const point of run.slice(1)) graphics.lineTo(point.x, point.y);
  }
  graphics.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

/**
 * A highlight about its middle `path`, in screen pixels: a soft shade outside, the dark line and
 * the accent line on it. Every band lies beside the next, so no translucent line covers another.
 * It passes behind `handles`, the controls that stand on it.
 */
export function drawHighlight(graphics: Graphics, path: HighlightPath, handles: readonly Notch[], accent: number): void {
  let edge = HIGHLIGHT_EDGE;
  for (const band of INK_SHADE) {
    strokeBand(graphics, grownPath(path, edge + band.width / 2), handles, band.width, 0x000000, band.alpha);
    edge += band.width;
  }
  strokeBand(graphics, path, handles, SELECTION_LOOK.stroke + 2 * SELECTION_LOOK.keyline, 0x000000, CANVAS_INK.keylineAlpha);
  strokeBand(graphics, path, handles, SELECTION_LOOK.stroke, accent, 1);
}

/** The quiet frame around a selection of two or more: one thin accent line, no fill. */
export function drawGroupFrame(graphics: Graphics, frame: RoundedBox, accent: number): void {
  graphics
    .roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius)
    .stroke({ width: SELECTION_LOOK.groupStroke, color: accent, alpha: GROUP_ALPHA });
}

/** The stem that carries a group's rotate handle, from the group frame's top edge (`from`) to the handle (`to`): the frame's own line. */
export function drawGroupStem(graphics: Graphics, from: number, to: number, accent: number): void {
  graphics
    .moveTo(0, from)
    .lineTo(0, to)
    .stroke({ width: SELECTION_LOOK.groupStroke, color: accent, alpha: GROUP_ALPHA });
}
