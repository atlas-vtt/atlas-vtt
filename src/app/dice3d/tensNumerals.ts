/**
 * The tens die of a percentile roll reads in tens, as real percentile dice do: 10, 20 … 90 and 00
 * for its ten. The sheet has no lone 0, so the 0 is cut from its 10, right of the gap between the
 * two digits, and set after the tens digit at the gap the 10 leaves between them.
 */

import { getDomHost } from '../host/dom';
import { CELL } from './atlasCell';
import type { DiceFont } from './diceLook';
import { dieGeometry, faceIndexForValue } from './dieGeometry';
import { cellOrigin, INK_ALPHA, NOMINAL_INK, numeralCell, numeralSheet, numeralSize, numeralSource, SHEET_CELL, SHEET_FILL, type NumeralSheet } from './dieNumerals';
import { faceMarks } from './faceMarks';
import { fitNumeral, type InkBox } from './numeralFit';

/** The sheet's 10, whose 0 the tens die borrows. */
const TEN_CELL = 9;

interface ZeroCut {
  /** The 0 within the 10's cell. */
  box: InkBox;
  /** The room the 10 leaves between its digits, in sheet pixels. */
  gap: number;
}

const cuts = new Map<NumeralSheet, ZeroCut>();

/** Where the 10's 0 begins: right of the widest run of empty columns within its ink. */
function zeroCut(sheet: NumeralSheet): ZeroCut {
  const known = cuts.get(sheet);
  if (known) return known;
  const ink = sheet.ink?.[TEN_CELL] ?? NOMINAL_INK;
  let cut: ZeroCut = { box: { ...ink, x0: (ink.x0 + ink.x1) / 2 }, gap: (ink.x1 - ink.x0) * 0.08 };
  const canvas = getDomHost().createCanvas(undefined, { width: SHEET_CELL, height: SHEET_CELL });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    const { left, top } = cellOrigin(TEN_CELL);
    ctx.drawImage(sheet.image, left, top, SHEET_CELL, SHEET_CELL, 0, 0, SHEET_CELL, SHEET_CELL);
    const { data } = ctx.getImageData(0, 0, SHEET_CELL, SHEET_CELL);
    const [x0, x1, y0, y1] = [ink.x0, ink.x1, ink.y0, ink.y1].map(Math.round) as [number, number, number, number];
    const inked = (x: number): boolean => {
      for (let y = y0; y < y1; y++) if (data[(y * SHEET_CELL + x) * 4 + 3]! > INK_ALPHA) return true;
      return false;
    };
    let best = { start: -1, length: 0 };
    let run = { start: -1, length: 0 };
    for (let x = x0; x < x1; x++) {
      if (inked(x)) {
        if (run.length > best.length) best = run;
        run = { start: -1, length: 0 };
      } else {
        run = run.start < 0 ? { start: x, length: 1 } : { start: run.start, length: run.length + 1 };
      }
    }
    if (best.length > 0) cut = { box: { ...ink, x0: best.start + best.length }, gap: best.length };
  }
  cuts.set(sheet, cut);
  return cut;
}

/** One digit to set: a cell of the sheet and the part of it that is the digit. */
interface Piece {
  cell: number;
  box: InkBox;
}

/**
 * The numeral of the tens die's face that stands for `value` (1 to 9 the tens digit, 10 its ten):
 * the digit and a 0, fitted together into the face's room, coloured `ink` (null: as drawn).
 */
export function paintTensNumeral(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, font: DiceFont, ink: string | null): void {
  const sheet = numeralSheet(font);
  if (!sheet) return;
  const zero = zeroCut(sheet);
  const zeroPiece: Piece = { cell: TEN_CELL, box: zero.box };
  const digit = value % 10;
  const first: Piece = digit === 0 ? zeroPiece : { cell: numeralCell(10, digit), box: sheet.ink?.[numeralCell(10, digit)] ?? NOMINAL_INK };
  const pieces = [first, zeroPiece];
  const width = pieces.reduce((sum, piece) => sum + piece.box.x1 - piece.box.x0, zero.gap);
  const height = Math.max(...pieces.map((piece) => piece.box.y1 - piece.box.y0));

  const geometry = dieGeometry(10);
  const pxPerSheetPx = numeralSize(10) / SHEET_FILL / SHEET_CELL;
  for (const mark of faceMarks(geometry, faceIndexForValue(geometry, value), CELL)) {
    const k = pxPerSheetPx * fitNumeral(mark.room, width * pxPerSheetPx, height * pxPerSheetPx);
    ctx.save();
    // The cell's y points up, the canvas' down.
    ctx.translate(x + mark.at[0], y - mark.at[1]);
    ctx.rotate(Math.atan2(mark.up[0], mark.up[1]));
    let left = (-width / 2) * k;
    for (const piece of pieces) {
      const { box } = piece;
      const w = box.x1 - box.x0;
      const h = box.y1 - box.y0;
      const source = numeralSource(sheet, piece.cell, ink);
      ctx.drawImage(source.image, source.sx + box.x0, source.sy + box.y0, w, h, left, (-h / 2) * k, w * k, h * k);
      left += (w + zero.gap) * k;
    }
    ctx.restore();
  }
}
