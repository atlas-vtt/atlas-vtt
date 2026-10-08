import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { getDomHost } from '../../host/dom';
import type { Polygon } from '../../vision/visibility';
import { coverCanvas } from '../utils/coverCanvas';
import { destroyTree } from '../utils/destroyTree';

/** What the line-of-sight fallback hides, as the polygons it is made of, in world pixels. */
export interface SightMaskShapes {
  /** The map's size. */
  width: number;
  height: number;
  /** What is shown of the map: everything else of it is black. Null while the players see all of it. */
  shown: readonly Polygon[] | null;
  /** The areas of magical darkness: black again, over what is shown. */
  darkness: readonly Polygon[];
  /** What is shown inside a magical darkness. */
  pierced: readonly Polygon[];
}

/** The longest side of the mask in texels: a larger map gets texels of more than one world pixel. */
export const MASK_MAX_SIDE = 2048;
const BLACK = 'rgba(0, 0, 0, 1)';

/**
 * The side of a texel of the mask in world pixels, for a map of this size: 1 up to 2,048 px,
 * and the map's longer side divided by 2,048 above that (4 on a map of 8,192 px). Each side of
 * the map is divided into whole texels, so along a side this does not divide a texel is a
 * little smaller.
 */
export function maskTexel(width: number, height: number): number {
  return Math.max(1, Math.max(width, height) / MASK_MAX_SIDE);
}

/** The mask's texels over a map: how many, and the world pixels each one covers. */
interface MaskGrid {
  columns: number;
  rows: number;
  texelWidth: number;
  texelHeight: number;
}

/** A grid that covers the map exactly, so the mask is black nowhere beyond the map's edge. */
function gridFor(width: number, height: number): MaskGrid {
  if (!(width > 0 && height > 0 && Number.isFinite(width + height))) throw new RangeError('The map has no size');
  const texel = maskTexel(width, height);
  // Less a rounding error's worth: the longer side of a large map is 2,048 texels, not one more.
  const columns = Math.max(1, Math.ceil(width / texel - 1e-9));
  const rows = Math.max(1, Math.ceil(height / texel - 1e-9));
  return { columns, rows, texelWidth: width / columns, texelHeight: height / rows };
}

function assertFinite(polygons: readonly Polygon[]): void {
  for (const polygon of polygons) {
    for (const corner of polygon) {
      // A canvas leaves a corner that is no number out of the path, which would open another shape than the one meant.
      if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) throw new RangeError('A polygon corner is not a finite number');
    }
  }
}

/**
 * The black that hides what the players do not see, composed on a Canvas 2D context and shown
 * as one sprite, on PIXI's Canvas renderer and on WebGL alike.
 *
 * Nothing works the hidden area out: the canvas is filled black and every shown polygon is
 * erased from it, so a place no polygon covers stays black whatever the polygons' corners do.
 * A magical darkness is filled black on a second canvas, what sees into it erased there, and
 * the rest drawn over the first.
 *
 * A canvas blends the texels an edge passes through, so after composing a texel is open only if
 * it was erased completely and so were the eight around it; every other texel is opaque black.
 * The sprite is sampled without filtering, which would blend half a texel of black with its
 * open neighbour. So nothing shows where what is hidden has a texel (`maskTexel`) to spare
 * around it, and the black reaches at most two texels into what is shown.
 *
 * What it does not hold: a canvas does not fill a path exactly where it lies (measured in
 * Chromium, an edge lying flat moves up or down by up to an eighth of a texel), so a hidden
 * strip thinner than a quarter texel that lies between two shown areas may be erased whole,
 * and then shows. On a map of 8,192 px that is a strip up to one world pixel thick.
 */
export class SightMask {
  /** Black where the map is hidden, laid over the map in world pixels. */
  readonly view = new Container({ label: 'line-of-sight' });
  private readonly sprite = new Sprite(Texture.EMPTY);
  /** Shown in place of the sprite when composing failed. */
  private readonly blackout = new Graphics();
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  /** Where a magical darkness is composed before it is drawn over the map's black; made with the first darkness. */
  private scratch: CanvasRenderingContext2D | null = null;
  private texture: Texture | null = null;

  constructor() {
    this.blackout.visible = false;
    this.view.addChild(this.sprite, this.blackout);
  }

  /**
   * Composes the black for `shapes` and shows it. Geometry that cannot be drawn (a corner that
   * is no finite number) and any failure while drawing leave the whole map black.
   */
  compose(shapes: SightMaskShapes): void {
    try {
      assertFinite([...(shapes.shown ?? []), ...shapes.darkness, ...shapes.pierced]);
      const grid = gridFor(shapes.width, shapes.height);
      const context = this.sized(grid.columns, grid.rows);
      coverCanvas(context.canvas, context, BLACK);
      if (shapes.shown) erase(context, shapes.shown, grid);
      else context.clearRect(0, 0, grid.columns, grid.rows);
      if (shapes.darkness.length > 0) this.drawDarkness(context, shapes, grid);
      harden(context);
      this.sprite.scale.set(grid.texelWidth, grid.texelHeight);
      this.texture?.source.update();
      this.blackout.visible = false;
      this.sprite.visible = true;
    } catch (error) {
      console.error('[SightMask] Sight could not be drawn, the map stays hidden:', error);
      // No canvas is trusted now: a plain black rectangle over the whole map, and a new canvas for the next composition.
      this.context = null;
      this.blackout.clear().rect(0, 0, shapes.width, shapes.height).fill({ color: 0x000000 });
      this.blackout.visible = true;
      this.sprite.visible = false;
    }
  }

  /** Shows nothing, until the next composition. */
  clear(): void {
    this.sprite.visible = false;
    this.blackout.visible = false;
  }

  destroy(): void {
    destroyTree(this.view);
    this.texture?.destroy(true);
    this.texture = null;
    for (const canvas of [this.canvas, this.scratch?.canvas]) {
      if (canvas) canvas.width = canvas.height = 1;
    }
    this.canvas = this.context = this.scratch = null;
  }

  /** The canvas at this size, with the texture that shows it: both are made anew when the map's size changes. */
  private sized(width: number, height: number): CanvasRenderingContext2D {
    if (this.context && this.canvas?.width === width && this.canvas.height === height) return this.context;
    const canvas = getDomHost().createCanvas(undefined, { width, height });
    // Kept only once it has a context: a canvas without one must not pass for the one in use.
    this.context = context2d(canvas);
    this.canvas = canvas;
    this.scratch = null;
    // The sprite lets go of the old texture before it is destroyed.
    this.sprite.texture = Texture.EMPTY;
    this.texture?.destroy(true);
    // Unfiltered: a filter would blend half a texel of black with the open texel beside it.
    this.texture = new Texture({ source: new CanvasSource({ resource: this.canvas, scaleMode: 'nearest' }) });
    this.sprite.texture = this.texture;
    return this.context;
  }

  /** Every darkness in black without what sees into it, drawn over the map's black. */
  private drawDarkness(context: CanvasRenderingContext2D, shapes: SightMaskShapes, grid: MaskGrid): void {
    const { width, height } = context.canvas;
    this.scratch ??= context2d(getDomHost().createCanvas(undefined, { width, height }));
    const scratch = this.scratch;
    scratch.clearRect(0, 0, width, height);
    scratch.fillStyle = BLACK;
    trace(scratch, shapes.darkness, grid);
    scratch.fill('nonzero');
    erase(scratch, shapes.pierced, grid);
    context.drawImage(scratch.canvas, 0, 0);
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  // Read back after every composition, which a canvas kept in main memory answers without a round trip to the graphics card.
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Failed to get a 2D context for the sight mask');
  return context;
}

/** One path of all polygons, in texels. */
function trace(context: CanvasRenderingContext2D, polygons: readonly Polygon[], { texelWidth, texelHeight }: MaskGrid): void {
  context.beginPath();
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    polygon.forEach((corner, index) => {
      const [x, y] = [corner.x / texelWidth, corner.y / texelHeight];
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
  }
}

/**
 * Takes the union of the polygons out of what the canvas holds. They are one path, so that two
 * which end on one line from either side leave no blended seam between them; a point outside
 * every polygon is outside the path whichever way the polygons run.
 */
function erase(context: CanvasRenderingContext2D, polygons: readonly Polygon[], grid: MaskGrid): void {
  context.globalCompositeOperation = 'destination-out';
  context.fillStyle = BLACK;
  trace(context, polygons, grid);
  context.fill('nonzero');
  context.globalCompositeOperation = 'source-over';
}

/**
 * Makes the composed canvas conservative: opaque black wherever a texel, or one of the eight
 * around it, holds any black at all, and clear elsewhere. Beyond the canvas counts as clear.
 */
function harden(context: CanvasRenderingContext2D): void {
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height);
  const { data } = image;
  const count = width * height;
  // Whether a texel or one of its two neighbours in its row holds black.
  const inRow = new Uint8Array(count);
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      inRow[i] = data[i * 4 + 3]! > 0 || (x > 0 && data[i * 4 - 1]! > 0) || (x < width - 1 && data[i * 4 + 7]! > 0) ? 1 : 0;
    }
  }
  data.fill(0);
  for (let i = 0; i < count; i++) {
    if (inRow[i] || (i >= width && inRow[i - width]) || (i < count - width && inRow[i + width])) data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}
