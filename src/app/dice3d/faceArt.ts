/**
 * What a face cell carries: Atlas's numerals, or a dice look's art where it has some. Art goes
 * where the numeral would: centred on the numeral's place, upright as it reads, and as large as
 * the face lets it be within the numeral's margin (`fitNumeral`). On a d4 each of a face's three
 * corner numbers is its own mark, so its art is painted three times per face, turned to its corner.
 */

import { CELL } from './atlasCell';
import { artKey, bodySides, type DieBody } from './dieBody';
import { dieGeometry, faceIndexForValue } from './dieGeometry';
import { paintNumeralMark } from './dieNumerals';
import type { ResolvedLook } from './dieSkin';
import { faceMarks, type NumeralMark } from './faceMarks';
import { fitNumeral } from './numeralFit';

/** `art` in the room of `mark`, in the cell centred on `x`, `y`. */
function paintArt(ctx: CanvasRenderingContext2D, x: number, y: number, mark: NumeralMark, art: HTMLCanvasElement): void {
  const fill = CELL / Math.max(art.width, art.height);
  const k = fill * fitNumeral(mark.room, art.width * fill, art.height * fill);
  const width = art.width * k;
  const height = art.height * k;
  ctx.save();
  // The cell's y points up, the canvas' down.
  ctx.translate(x + mark.at[0], y - mark.at[1]);
  ctx.rotate(Math.atan2(mark.up[0], mark.up[1]));
  ctx.drawImage(art, -width / 2, -height / 2, width, height);
  ctx.restore();
}

/** The art covering the whole face of `body` standing for `value` in a `fill: 'face'` look; null for a face without art. */
function fillArt(body: DieBody, value: number, look: ResolvedLook): HTMLCanvasElement | null {
  return look.fill === 'face' ? look.art?.faces.get(body)?.get(artKey(body, value)) ?? null : null;
}

/** `art` scaled to cover the cell centred on `x`, `y`, turned as the face's numeral reads, and clipped to the cell. */
function paintCover(ctx: CanvasRenderingContext2D, x: number, y: number, body: DieBody, value: number, art: HTMLCanvasElement): void {
  const geometry = dieGeometry(bodySides(body));
  const marks = faceMarks(geometry, faceIndexForValue(geometry, value), CELL);
  const mark = marks.find((candidate) => candidate.value === value) ?? marks[0];
  const k = CELL / Math.min(art.width, art.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - CELL / 2, y - CELL / 2, CELL, CELL);
  ctx.clip();
  ctx.translate(x, y);
  if (mark && marks.length === 1) ctx.rotate(Math.atan2(mark.up[0], mark.up[1]));
  ctx.drawImage(art, (-art.width * k) / 2, (-art.height * k) / 2, art.width * k, art.height * k);
  ctx.restore();
}

/**
 * A `fill: 'face'` look's face: its art over the whole cell, on the look's body colour where the art is transparent,
 * and nothing of Atlas's. False (nothing painted) for any other look or a face it has no art for.
 */
export function paintFaceFill(ctx: CanvasRenderingContext2D, x: number, y: number, body: DieBody, value: number, look: ResolvedLook): boolean {
  const art = fillArt(body, value, look);
  if (!art) return false;
  if (look.body !== null) {
    ctx.fillStyle = look.body;
    ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
  }
  paintCover(ctx, x, y, body, value, art);
  return true;
}

/** The relief of such a face: the look's relief art over the whole cell, else none (flat). False for any other face. */
export function paintFaceFillRelief(ctx: CanvasRenderingContext2D, x: number, y: number, body: DieBody, value: number, look: ResolvedLook): boolean {
  if (!fillArt(body, value, look)) return false;
  const relief = look.art?.bump.get(body)?.get(artKey(body, value));
  if (relief) {
    ctx.save();
    ctx.filter = 'grayscale(1)';
    paintCover(ctx, x, y, body, value, relief);
    ctx.restore();
  }
  return true;
}

/** The bare cell (chamfers and corners) of a `fill: 'face'` look with a body colour: that colour alone, so the edges match its faces. */
export function paintBareFill(ctx: CanvasRenderingContext2D, x: number, y: number, look: ResolvedLook): boolean {
  if (look.fill !== 'face' || look.body === null) return false;
  ctx.fillStyle = look.body;
  ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
  return true;
}

/**
 * The marks of the face of `body` that stands for `value`: a look's art for its key where it has
 * some, Atlas's numeral (in `look`'s font and ink) everywhere else.
 */
export function paintFaceMarks(ctx: CanvasRenderingContext2D, x: number, y: number, body: DieBody, value: number, look: ResolvedLook): void {
  const sides = bodySides(body);
  const geometry = dieGeometry(sides);
  const art = look.art?.faces.get(body);
  for (const mark of faceMarks(geometry, faceIndexForValue(geometry, value), CELL)) {
    const image = art?.get(artKey(body, mark.value));
    if (image) paintArt(ctx, x, y, mark, image);
    else paintNumeralMark(ctx, x, y, sides, mark, look.font, look.ink);
  }
}

/**
 * The relief of the same marks, drawn dark into the tooth: a look's relief art as given (grey),
 * else its face art's silhouette, else Atlas's numeral, as Atlas presses its own numerals in.
 */
export function paintFaceRelief(ctx: CanvasRenderingContext2D, x: number, y: number, body: DieBody, value: number, look: ResolvedLook): void {
  const sides = bodySides(body);
  const geometry = dieGeometry(sides);
  const relief = look.art?.bump.get(body);
  const art = look.art?.faces.get(body);
  for (const mark of faceMarks(geometry, faceIndexForValue(geometry, value), CELL)) {
    const key = artKey(body, mark.value);
    const own = relief?.get(key);
    const image = own ?? art?.get(key);
    if (!image) {
      paintNumeralMark(ctx, x, y, sides, mark, look.font, null);
      continue;
    }
    ctx.save();
    ctx.filter = own ? 'grayscale(1)' : 'brightness(0)';
    paintArt(ctx, x, y, mark, image);
    ctx.restore();
  }
}
