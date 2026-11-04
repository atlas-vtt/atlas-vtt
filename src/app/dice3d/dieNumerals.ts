import { getDomHost } from '../host/dom';
/**
 * The numerals on the faces. Each font is a sheet of 22 cells, 6 across: the
 * numbers 1 to 20, then 6 and 9 with their underline. The medieval sheet is a
 * pencil drawing baked in the original project; the sci-fi sheet is set in
 * Oxanium at runtime in the same layout, so both are measured, fitted and
 * coloured alike.
 */

import NUMERALS_URL from '../assets/dice3d/numerals.webp?inline';
import { CELL } from './atlasCell';
import type { DiceFont } from './diceLook';
import { dieGeometry, faceIndexForValue, type DieSides } from './dieGeometry';
import { faceMarks, type NumeralMark } from './faceMarks';
import { fitNumeral, type InkBox } from './numeralFit';

const SHEET_CELL = 160;
const SHEET_COLS = 6;
const SHEET_ROWS = 4;
/**
 * How much of its cell the drawn numeral itself fills (`HEIGHT / CELL` in the
 * baking tool). From it follows how large the cell has to land on the face for
 * the numeral to get the requested height.
 */
const SHEET_FILL = 0.6;
const SHEET_NUMERALS = 22;
/** Alpha above which a sheet pixel counts as ink. */
const INK_ALPHA = 40;
/** Assumed ink while the sheet cannot be measured: the drawn height, as wide as tall, centred. */
const NOMINAL_INK: InkBox = {
  x0: SHEET_CELL * (1 - SHEET_FILL) / 2,
  y0: SHEET_CELL * (1 - SHEET_FILL) / 2,
  x1: SHEET_CELL * (1 + SHEET_FILL) / 2,
  y1: SHEET_CELL * (1 + SHEET_FILL) / 2,
};
/** Size at which the sci-fi face is measured before it is set to fill its cells. */
const SCIFI_PROBE_PX = 100;

/** The sci-fi face at a size, declared with @font-face in main.scss. */
function scifiFont(px: number | string): string {
  return `600 ${px}px "Atlas Oxanium", sans-serif`;
}

/** Top-left corner of a sheet cell, in sheet pixels. */
function cellOrigin(cell: number): { left: number; top: number } {
  return { left: (cell % SHEET_COLS) * SHEET_CELL, top: Math.floor(cell / SHEET_COLS) * SHEET_CELL };
}

interface NumeralSheet {
  image: HTMLImageElement | HTMLCanvasElement;
  /** Ink bounds per cell; null where the canvas cannot be read. */
  ink: InkBox[] | null;
}

const sheets = new Map<DiceFont, NumeralSheet>();
const pending = new Map<DiceFont, Promise<void>>();
const scales = new Map<string, number>();
/** One cell of scratch space, for colouring a numeral before it goes onto a face. */
let scratch: HTMLCanvasElement | null = null;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => resolve(img);
    img.onerror = (): void => reject(new Error('Dice artwork failed to load'));
    img.src = url;
  });
}

/**
 * Makes the numeral sheet of a font ready, once. If it fails the dice keep
 * blank faces: ugly, but it does not hold up the throw.
 */
export function loadNumerals(font: DiceFont): Promise<void> {
  let loading = pending.get(font);
  if (!loading) {
    const sheet = font === 'medieval' ? loadImage(NUMERALS_URL) : setScifiSheet();
    loading = sheet
      .then((image) => {
        sheets.set(font, { image, ink: measureInk(image) });
      })
      .catch(() => undefined);
    pending.set(font, loading);
  }
  return loading;
}

/** Sets the numbers in Oxanium, each as tall as the pencil numerals fill their cells. */
async function setScifiSheet(): Promise<HTMLCanvasElement> {
  await getDomHost().activeDocument().fonts.load(scifiFont(SCIFI_PROBE_PX));
  const canvas = getDomHost().createCanvas();
  canvas.width = SHEET_COLS * SHEET_CELL;
  canvas.height = SHEET_ROWS * SHEET_CELL;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.font = scifiFont(SCIFI_PROBE_PX);
  const probe = ctx.measureText('8');
  const size = (SCIFI_PROBE_PX * SHEET_FILL * SHEET_CELL) / (probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent);
  ctx.font = scifiFont(size.toFixed(1));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';

  for (let cell = 0; cell < SHEET_NUMERALS; cell++) {
    const underlined = cell >= 20;
    let label = String(cell + 1);
    if (underlined) label = cell === 20 ? '6' : '9';
    const metrics = ctx.measureText(label);
    const { left, top } = cellOrigin(cell);
    const cx = left + SHEET_CELL / 2;
    const cy = top + SHEET_CELL / 2;
    // Centred on its ink; an underlined numeral moves up to make room for its bar.
    const lift = underlined ? size * 0.08 : 0;
    const baseline = cy + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2 - lift;
    ctx.fillText(label, cx, baseline);
    if (underlined) {
      const bar = metrics.width * 0.9;
      ctx.fillRect(cx - bar / 2, baseline + size * 0.08, bar, size * 0.07);
    }
  }
  return canvas;
}

/** Whether the numeral sheet of a font is loaded. */
export function numeralsReady(font: DiceFont): boolean {
  return sheets.has(font);
}

/** The ink bounds of every numeral in a sheet; null where the canvas cannot be read. */
function measureInk(sheet: HTMLImageElement | HTMLCanvasElement): InkBox[] | null {
  const canvas = getDomHost().createCanvas();
  canvas.width = sheet.width;
  canvas.height = sheet.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(sheet, 0, 0);
  const { data, width } = ctx.getImageData(0, 0, sheet.width, sheet.height);
  return Array.from({ length: SHEET_NUMERALS }, (_, cell): InkBox => {
    const { left, top } = cellOrigin(cell);
    const box = { x0: SHEET_CELL, y0: SHEET_CELL, x1: 0, y1: 0 };
    for (let y = 0; y < SHEET_CELL; y++) {
      for (let x = 0; x < SHEET_CELL; x++) {
        if (data[((top + y) * width + left + x) * 4 + 3]! <= INK_ALPHA) continue;
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x + 1);
        box.y1 = Math.max(box.y1, y + 1);
      }
    }
    return box.x1 > box.x0 ? box : NOMINAL_INK;
  });
}

/** Font size of the numeral per body: many faces means little room, and the d4 writes three on each face. */
export function numeralSize(sides: DieSides): number {
  if (sides === 4) return CELL * 0.19;
  if (sides >= 12) return CELL * 0.36;
  return CELL * 0.44;
}

/** The 6 and the 9 carry an underline where both occur on the body. */
export function needsUnderline(sides: DieSides, value: number): boolean {
  return sides >= 10 && (value === 6 || value === 9);
}

/** Which cell of the sheet carries this number; underlined 6 and 9 sit at the end. */
export function numeralCell(sides: DieSides, value: number): number {
  if (needsUnderline(sides, value)) return value === 6 ? 20 : 21;
  return value - 1;
}

/**
 * How far a numeral is shrunk to fit its room; see `numeralFit.ts`. Kept per
 * number: on every body all the rooms a number is written into are alike.
 */
function scaleFor(font: DiceFont, sides: DieSides, mark: NumeralMark, ink: InkBox, pxPerSheetPx: number): number {
  const key = `${font}:${sides}:${mark.value}`;
  let scale = scales.get(key);
  if (scale === undefined) {
    scale = fitNumeral(mark.room, (ink.x1 - ink.x0) * pxPerSheetPx, (ink.y1 - ink.y0) * pxPerSheetPx);
    scales.set(key, scale);
  }
  return scale;
}

/** The sheet cell of a numeral, in `ink`, or as drawn when `ink` is null. */
function numeralSource(sheet: NumeralSheet, cell: number, ink: string | null): { image: CanvasImageSource; sx: number; sy: number } {
  const { left: sx, top: sy } = cellOrigin(cell);
  if (ink === null) return { image: sheet.image, sx, sy };
  scratch ??= getDomHost().createCanvas(undefined, { width: SHEET_CELL, height: SHEET_CELL });
  const ctx = scratch.getContext('2d');
  if (!ctx) return { image: sheet.image, sx, sy };
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, SHEET_CELL, SHEET_CELL);
  ctx.drawImage(sheet.image, sx, sy, SHEET_CELL, SHEET_CELL, 0, 0, SHEET_CELL, SHEET_CELL);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, SHEET_CELL, SHEET_CELL);
  return { image: scratch, sx: 0, sy: 0 };
}

/**
 * The numerals of the face that stands for `value` (`faceMarks`), from the
 * font's sheet: each fitted into its room, its ink centre on its place, and
 * coloured `ink` (null: as drawn).
 */
export function paintNumeral(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sides: DieSides,
  value: number,
  font: DiceFont,
  ink: string | null,
): void {
  const sheet = sheets.get(font);
  if (!sheet) return;
  const geometry = dieGeometry(sides);
  const pxPerSheetPx = numeralSize(sides) / SHEET_FILL / SHEET_CELL;
  for (const mark of faceMarks(geometry, faceIndexForValue(geometry, value), CELL)) {
    const cell = numeralCell(sides, mark.value);
    const box = sheet.ink?.[cell] ?? NOMINAL_INK;
    const k = pxPerSheetPx * scaleFor(font, sides, mark, box, pxPerSheetPx);
    const source = numeralSource(sheet, cell, ink);
    ctx.save();
    // The cell's y points up, the canvas' down.
    ctx.translate(x + mark.at[0], y - mark.at[1]);
    ctx.rotate(Math.atan2(mark.up[0], mark.up[1]));
    ctx.drawImage(
      source.image,
      source.sx,
      source.sy,
      SHEET_CELL,
      SHEET_CELL,
      -((box.x0 + box.x1) / 2) * k,
      -((box.y0 + box.y1) / 2) * k,
      SHEET_CELL * k,
      SHEET_CELL * k,
    );
    ctx.restore();
  }
}
