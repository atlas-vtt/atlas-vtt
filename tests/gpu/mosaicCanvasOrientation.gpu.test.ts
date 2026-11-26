import { describe, expect, it } from 'vitest';
import { DecodedLevels, decodeSource } from '../../src/app/pixi/mosaicCanvas/decodedLevels';
import { tesseraContentFrame, tesseraContentRect, tesseraSourceRect, type Pyramid, type TesseraRef } from '../../src/app/pixi/mosaicCanvas/pyramid';
import { browserGraphicsPrimitives, createTesseraGraphics } from '../../src/app/pixi/mosaicCanvas/tesseraGraphics';

/**
 * A phone photo of a map is stored on its side and turned by its EXIF orientation. Chromium crops
 * such a bitmap (`createImageBitmap` with a rect) at the wrong place for a quarter turn
 * (orientations 6 and 8), so every tessera cut from its decoded levels showed another part of the
 * map. Only a real decoder turns the photo, so this runs in the browser.
 */

const CELL = 170;
const COLUMNS = 8;
const ROWS = 6;

/** The colour of the shown picture's cell: every cell its own, far enough apart to survive JPEG. */
function cellColour(column: number, row: number): [number, number, number] {
  return [column * 30 + 15, row * 40 + 15, 128];
}

/**
 * A JPEG that shows a checker of `COLUMNS` × `ROWS` cells once turned by `orientation`: stored on
 * its side (quarter turns 6 and 8) or upright (1).
 */
async function turnedPhoto(orientation: 1 | 6 | 8): Promise<Blob> {
  const shownWidth = COLUMNS * CELL;
  const shownHeight = ROWS * CELL;
  const turned = orientation !== 1;
  const canvas = new OffscreenCanvas(turned ? shownHeight : shownWidth, turned ? shownWidth : shownHeight);
  const ctx = canvas.getContext('2d')!;
  for (let column = 0; column < COLUMNS; column++) {
    for (let row = 0; row < ROWS; row++) {
      const [r, g, b] = cellColour(column, row);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      const x = column * CELL;
      const y = row * CELL;
      // Orientation 6 shows the stored picture turned a quarter clockwise, 8 anticlockwise.
      if (orientation === 6) ctx.fillRect(y, shownWidth - x - CELL, CELL, CELL);
      else if (orientation === 8) ctx.fillRect(shownHeight - y - CELL, x, CELL, CELL);
      else ctx.fillRect(x, y, CELL, CELL);
    }
  }
  const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 1 })).arrayBuffer());
  if (!turned) return new Blob([jpeg], { type: 'image/jpeg' });
  const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app1 = new Uint8Array([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body]);
  return new Blob([jpeg.slice(0, 2), app1, jpeg.slice(2)], { type: 'image/jpeg' });
}

/** The cell the pixel at the content's centre of each tessera of `level` shows, against the cell it should. */
async function tesseraCells(pyramid: Pyramid, levels: DecodedLevels, level: number, graphics: ReturnType<typeof createTesseraGraphics>): Promise<{ got: string[]; want: string[] }> {
  const { cols, rows } = pyramid.levels[level]!;
  const factor = pyramid.width / pyramid.levels[level]!.width;
  const got: string[] = [];
  const want: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ref: TesseraRef = { level, col, row };
      const content = tesseraContentRect(pyramid, ref);
      const frame = tesseraContentFrame(pyramid, ref);
      const bitmap = (await levels.use(level, (source) => graphics.crop(source, tesseraSourceRect(pyramid, ref))))!;
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const x = Math.floor(frame.x + frame.width / 2);
      const y = Math.floor(frame.y + frame.height / 2);
      const [r, g] = ctx.getImageData(x, y, 1, 1).data;
      got.push(`${Math.round((r! - 15) / 30)},${Math.round((g! - 15) / 40)}`);
      const shownX = (content.x + content.width / 2) * factor;
      const shownY = (content.y + content.height / 2) * factor;
      want.push(`${Math.floor(shownX / CELL)},${Math.floor(shownY / CELL)}`);
    }
  }
  return { got, want };
}

describe('tesserae of a photo turned by EXIF', () => {
  for (const orientation of [1, 6, 8] as const) {
    it(`show their own part of the map (orientation ${orientation})`, async () => {
      const graphics = createTesseraGraphics(browserGraphicsPrimitives());
      const { pyramid, bitmap } = await decodeSource(await turnedPhoto(orientation), graphics);
      expect({ width: pyramid.width, height: pyramid.height }).toEqual({ width: COLUMNS * CELL, height: ROWS * CELL });
      const levels = new DecodedLevels(pyramid, bitmap, graphics);
      await levels.ready();
      try {
        for (const level of [0, 1]) {
          const { got, want } = await tesseraCells(pyramid, levels, level, graphics);
          expect(got, `level ${level}`).toEqual(want);
        }
      } finally {
        levels.releaseAll();
      }
    });
  }
});
