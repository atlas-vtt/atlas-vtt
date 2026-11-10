import { encode } from 'uqr';

/**
 * The invite link as a QR code, and how it is drawn. The encoder (`uqr`) only makes the module matrix,
 * at error correction level H; the drawing is ours and is all geometry on the module grid, in units of
 * one module, so it is the same at every size and pixel ratio:
 *
 * - Dark modules are joined: a run of them is one shape, and only a corner where the dark ends on both
 *   sides is rounded. A light corner the dark closes in on three sides is rounded too, so a blob has no
 *   sharp notch.
 * - The three finder patterns are a rounded ring and a rounded eye, on the grid's own lines, so the
 *   1:1:3:1:1 a reader looks for holds along both axes.
 * - The middle is cleared for the Atlas icon in whole modules, which level H recovers.
 *
 * Nothing here knows the DOM, and the link goes nowhere but into the matrix.
 */

/** The quiet zone the standard asks for, in modules. */
export const QUIET = 4;
/** A dark corner's radius, in modules. */
const OUTER = 0.45;
/** The radius of a light corner the dark closes in on. */
const INNER = 0.3;
/** The widest the cleared middle may be, as a share of the code's side. */
const PLATE_SHARE = 0.21;
/** The icon's margin inside the cleared middle, in modules. */
const ICON_MARGIN = 1;
/** A finder pattern's side, its ring's corner, the corner of the ring's hole and of the eye. */
const FINDER = 7;
const FINDER_RADIUS = 1.75;
const FINDER_HOLE_RADIUS = 0.75;
const EYE_RADIUS = 1;

/** The module matrix of a code: `dark(x, y)` inside `size` × `size`, false outside. */
export interface QrMatrix {
  readonly size: number;
  dark(x: number, y: number): boolean;
}

/** A square on the drawing, in modules from its top left corner. */
export interface QrBox {
  readonly x: number;
  readonly y: number;
  readonly side: number;
}

export interface QrDrawing {
  /** The drawing's side in modules: the code and the quiet zone around it. */
  readonly side: number;
  /** The code's own side in modules. */
  readonly size: number;
  /** The joined data modules, as path data for a nonzero fill. */
  readonly modules: string;
  /** The three finder patterns, as path data for an even-odd fill. */
  readonly finders: string;
  /** The modules cleared in the middle. */
  readonly plate: QrBox;
  /** Where the icon stands inside them. */
  readonly icon: QrBox;
}

/** The link's matrix at level H, which lets a reader recover the modules the icon covers. */
export function qrMatrix(text: string): QrMatrix {
  const { size, data } = encode(text, { ecc: 'H', border: 0, boostEcc: false });
  return { size, dark: (x, y) => data[y]?.[x] === true };
}

/** The top left modules of the three finder patterns. */
const finderCorners = (size: number): readonly (readonly [number, number])[] => [[0, 0], [size - FINDER, 0], [0, size - FINDER]];

/** The cleared middle: the largest odd number of modules within the share, so it is centred on the grid. */
function plateOf(size: number): QrBox {
  const most = Math.floor(size * PLATE_SHARE);
  const side = most % 2 === 1 ? most : most - 1;
  const start = (size - side) / 2;
  return { x: start, y: start, side };
}

/** Whether a module lies in the cleared middle: a square without its four corner modules, so it runs round the icon's corners. */
function inPlate(plate: QrBox, x: number, y: number): boolean {
  const end = plate.x + plate.side - 1;
  if (x < plate.x || y < plate.y || x > end || y > end) return false;
  return !((x === plate.x || x === end) && (y === plate.y || y === end));
}

const num = (value: number): string => String(Math.round(value * 100) / 100);

/** A rounded rectangle, clockwise from its top edge; a radius of 0 is a plain corner. */
function roundedRect(x: number, y: number, width: number, height: number, [tl, tr, br, bl]: readonly [number, number, number, number]): string {
  const arc = (r: number, dx: number, dy: number): string => (r === 0 ? '' : `a${num(r)} ${num(r)} 0 0 1 ${num(dx)} ${num(dy)}`);
  return `M${num(x + tl)} ${num(y)}h${num(width - tl - tr)}${arc(tr, tr, tr)}v${num(height - tr - br)}${arc(br, -br, br)}h${num(bl + br - width)}${arc(bl, -bl, -bl)}v${num(tl + bl - height)}${arc(tl, tl, -tl)}z`;
}

/**
 * The sliver that rounds a light corner at (x, y), which opens towards (dx, dy): from the corner along
 * both edges, closed by an arc that bulges back into the corner. It lies in a light module, so the
 * nonzero fill adds it whichever way it runs.
 */
function fillet(x: number, y: number, dx: number, dy: number): string {
  const r = INNER;
  return `M${num(x)} ${num(y)}h${num(dx * r)}A${num(r)} ${num(r)} 0 0 ${dx * dy > 0 ? 0 : 1} ${num(x)} ${num(y + dy * r)}z`;
}

/** The link as it is drawn. */
export function qrDrawing(matrix: QrMatrix): QrDrawing {
  const { size } = matrix;
  const plate = plateOf(size);
  const corners = finderCorners(size);
  const inFinder = (x: number, y: number): boolean => corners.some(([fx, fy]) => x >= fx && x < fx + FINDER && y >= fy && y < fy + FINDER);
  /** A module the joined shapes are made of: dark, outside the finder patterns and the cleared middle. */
  const dark = (x: number, y: number): boolean => matrix.dark(x, y) && !inFinder(x, y) && !inPlate(plate, x, y);
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!dark(x, y)) {
        // A light corner with dark on both edges and across it.
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          if (!dark(x + dx, y) || !dark(x, y + dy) || !dark(x + dx, y + dy)) continue;
          parts.push(fillet(QUIET + x + (dx > 0 ? 1 : 0), QUIET + y + (dy > 0 ? 1 : 0), -dx, -dy));
        }
        continue;
      }
      // One shape per run along the row: only its ends can have a corner where the dark ends on both sides.
      let end = x;
      while (dark(end + 1, y)) end++;
      const round = (cx: number, dx: number, dy: number): number => (!dark(cx + dx, y) && !dark(cx, y + dy) ? OUTER : 0);
      parts.push(roundedRect(QUIET + x, QUIET + y, end - x + 1, 1, [round(x, -1, -1), round(end, 1, -1), round(end, 1, 1), round(x, -1, 1)]));
      x = end;
    }
  }
  const all = (radius: number): readonly [number, number, number, number] => [radius, radius, radius, radius];
  const finders = corners.map(([fx, fy]) => {
    const x = QUIET + fx;
    const y = QUIET + fy;
    return roundedRect(x, y, FINDER, FINDER, all(FINDER_RADIUS)) + roundedRect(x + 1, y + 1, FINDER - 2, FINDER - 2, all(FINDER_HOLE_RADIUS)) + roundedRect(x + 2, y + 2, FINDER - 4, FINDER - 4, all(EYE_RADIUS));
  }).join('');
  const iconSide = plate.side - 2 * ICON_MARGIN;
  return {
    side: size + 2 * QUIET,
    size,
    modules: parts.join(''),
    finders,
    plate: { x: QUIET + plate.x, y: QUIET + plate.y, side: plate.side },
    icon: { x: QUIET + plate.x + ICON_MARGIN, y: QUIET + plate.y + ICON_MARGIN, side: iconSide },
  };
}
