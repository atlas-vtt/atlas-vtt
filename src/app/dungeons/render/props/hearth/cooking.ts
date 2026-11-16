import { circlePath, fineLines, type GlyphPen } from '../../glyphPen';
import { burningFuel } from './burningFuel';
import { coldFuel, part, recess, surface } from './parts';
import { HEARTH, HEARTH_FIREBOX, partPath } from './shapes';

const recessPath = partPath(HEARTH_FIREBOX);

/** A cutaway chimney breast: masonry cheeks surround an open firebox, cold, or with a fire burning in it (`lit`). */
export function hearthBody(pen: GlyphPen, painted: boolean, lit = false): void {
  part(pen, HEARTH, 'dressed');
  recess(pen, HEARTH_FIREBOX, painted);
  if (lit) burningFuel(pen, HEARTH_FIREBOX, recessPath);
  else coldFuel(pen, HEARTH_FIREBOX);
  const cheeks = [-0.685, 0.685].map(x => ({ x, y: 0.015, w: 0.22, h: 0.51 }));
  surface(pen, path => {
    for (const b of cheeks) partPath(b)(path);
    partPath({ x: 0, y: 0.31, w: 1.6, h: 0.15 })(path);
  }, 'dressed');
  fineLines(pen, cheeks.flatMap(b => [b.x - 0.1, -0.07, b.x + 0.1, -0.07, b.x - 0.1, 0.1, b.x + 0.1, 0.1]));
  fineLines(pen, [-0.42, 0.24, -0.42, 0.38, 0.08, 0.24, 0.08, 0.38, 0.52, 0.24, 0.52, 0.38]);
  part(pen, { x: 0, y: -0.315, w: 1.66, h: 0.13 }, 'stone', false);
  fineLines(pen, [-0.31, -0.37, -0.31, -0.26, 0.32, -0.37, 0.32, -0.26]);
  // The andirons are low rails in plan; no upright front elevation and no hot accents.
  surface(pen, path => {
    for (const x of [-0.39, 0.39]) {
      partPath({ x, y: -0.005, w: 0.045, h: 0.31 })(path);
      circlePath(path, 0.034, x, -0.16);
    }
  }, 'metal');
}
