import { releaseCanvas } from '../../imageProcessing/canvasLimit';
import { drawOnBands } from './bandContext';

/**
 * Most pixels one band of a map is drawn on. Chromium draws a 2D canvas on the graphics card, and
 * rastering one of about 30 MP made the GPU process run out of memory (Skia OOM) and restart on a
 * 12 GB card, which empties every picture it holds: a floor read back after that came out blank.
 * 25 MP survived; a band stays well below that, with three floors drawn at once.
 */
export const BAND_PIXELS = 16_000_000;

/** Tries at one band before the map counts as not drawn. */
const ATTEMPTS = 3;
const ROW_STEP = 8;
/** Opaque, so it reads back exactly; any colour would do. */
const SENTINEL = [23, 101, 197] as const;

/** Raised where a band's canvas lost its pixels at every try: the map cannot be drawn on this device now. */
export class BandLostError extends Error {
  constructor() {
    super('Could not draw the dungeon: the graphics card lost the picture.');
  }
}

/**
 * Rows of a band of a picture `width` wide: a multiple of 8, since Chromium dithers gradients by an
 * 8 × 8 pattern of device pixels, and a band starting on another row would dither differently.
 */
export function bandRows(width: number, maxPixels = BAND_PIXELS): number {
  return Math.max(ROW_STEP, Math.floor(maxPixels / Math.max(1, width) / ROW_STEP) * ROW_STEP);
}

/** A canvas's rows of the picture, with whether it told of a lost context (asked after the worker had its turn). */
interface BandCanvas {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  top: number;
  rows: number;
  lost: () => boolean;
}

function bandCanvas(width: number, top: number, rows: number): BandCanvas {
  const canvas = new OffscreenCanvas(width, rows);
  let lost = false;
  canvas.addEventListener('contextlost', () => {
    lost = true;
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the dungeon: no 2D canvas.');
  return { canvas, ctx, top, rows, lost: () => lost };
}

/**
 * The band's pixels, read back into memory where a later restart of the GPU process cannot reach
 * them; null where the canvas did not hold them. After the read a pixel of a known colour is set
 * and read back: a canvas that lost its pixels before (drawing on it does nothing, reading gives
 * nothing) does not hold it. Nothing is drawn on a band but the picture: an extra row or pixel
 * changed how Chromium drew the rest.
 */
function readBand(band: BandCanvas, width: number): Uint8ClampedArray | null {
  const { ctx } = band;
  const data = ctx.getImageData(0, 0, width, band.rows).data;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgb(${SENTINEL.join(',')})`;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return !ctx.isContextLost() && r === SENTINEL[0] && g === SENTINEL[1] && b === SENTINEL[2] && a === 255 ? data : null;
}

/** A turn of the event loop, after `ms`: a lost context is told by an event, and a restarting GPU process takes a moment. */
function nextTurn(ms: number): Promise<void> {
  return new Promise((resolve) => self.setTimeout(resolve, ms));
}

/** Draws every band once and copies them into `picture`; false where a canvas lost its pixels. */
async function drawnOnce(picture: ImageData, step: number, draw: (ctx: OffscreenCanvasRenderingContext2D) => void): Promise<boolean> {
  const { width, height } = picture;
  const bands: BandCanvas[] = [];
  try {
    for (let top = 0; top < height; top += step) bands.push(bandCanvas(width, top, Math.min(step, height - top)));
    drawOnBands(bands, draw);
    const read = bands.map((band) => readBand(band, width));
    await nextTurn(0);
    if (read.some((data, k) => !data || bands[k]!.lost())) return false;
    read.forEach((data, k) => picture.data.set(data!, bands[k]!.top * width * 4));
    return true;
  } finally {
    for (const band of bands) releaseCanvas(band.canvas);
  }
}

/**
 * The picture `draw` draws on a `width` × `height` canvas, drawn on bands of whole rows of at most
 * `maxPixels`, each a canvas of its own, all in one go (`drawOnBands`): `draw` runs once.
 * Pixels come back unpremultiplied, as `getImageData` gives them. Bands whose canvases lost their
 * pixels are drawn again; lost at every try, `BandLostError` is raised. Never answers with a
 * picture the canvases did not hold.
 */
export async function drawInBands(width: number, height: number, draw: (ctx: OffscreenCanvasRenderingContext2D) => void, maxPixels = BAND_PIXELS): Promise<ImageData> {
  const picture = new ImageData(width, height);
  const step = bandRows(width, maxPixels);
  for (let attempt = 1; !(await drawnOnce(picture, step, draw)); attempt++) {
    if (attempt === ATTEMPTS) throw new BandLostError();
    await nextTurn(500 * attempt);
  }
  return picture;
}
