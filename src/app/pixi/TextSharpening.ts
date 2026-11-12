import type { Container, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { TesseraView } from './mosaicCanvas/levelOfDetail';
import { TEXT_CONTENT_LABEL } from './textElementView';
import { TEXT_TEXTURE_LIMITS, textResolution, type TextSize, type TextTextureLimits } from './textSharpness';

/** What the sharpening must know of the renderer its texts are drawn by. */
export interface TextSharpnessHost {
  /** Device pixels to each point of the view's canvas. */
  resolution(): number;
  /** The longest texture side the renderer draws; null while it cannot say. */
  maxTextureSide(): number | null;
}

/** How long the camera and the players' frame must rest before a text gives pixels back. */
export const TEXT_SETTLE_MS = 200;
/** How far past a picture's edge a text is already drawn for it, as a share of the picture's size. */
const MARGIN = 0.5;

interface Entry {
  view: Container;
  text: Text;
  size: TextSize;
}

/** A picture of the map: the part of the world it shows, and the device pixels it has to each world unit. */
interface Picture {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pixelsPerUnit: number;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
  resolution: number;
}

/**
 * Keeps the texts on the map sharp. PIXI draws a text once, into a texture, and stretches that
 * texture with the zoom and the text's scale; here each text's resolution follows the pictures
 * that show it: the view's own camera and every region asked for (the player window's frame),
 * whichever shows it largest. Resolutions go in steps (`textResolution`), so a zoom draws a text
 * anew once per doubling. A text is made finer at once, in the frame's tick, and coarser only
 * when camera and regions have rested, and a text no picture shows keeps the least resolution,
 * so the closest zoom holds fine textures only for what is on screen.
 */
export class TextSharpening {
  private readonly entries = new Map<string, Entry>();
  private readonly regions = new Set<TesseraView>();
  private readonly camera: Camera = { x: Number.NaN, y: Number.NaN, zoom: Number.NaN, width: Number.NaN, height: Number.NaN, resolution: Number.NaN };
  private restingSince = 0;
  /** Something changed since the texts were last brought to their resolutions: the camera, a region, a text's scale under a handle. */
  private stale = false;
  /** A text waits to become coarser. */
  private waiting = false;
  private maxSide: number | null = null;

  constructor(
    private readonly viewport: Viewport,
    private readonly host: TextSharpnessHost,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Follows the text of `view` (made or edited just now), which is drawn at its resolution from its next render on. */
  track(id: string, view: Container): void {
    const text = view.getChildByLabel(TEXT_CONTENT_LABEL) as Text | null;
    if (!text) return;
    if (this.entries.size === 0) this.viewport.options.ticker?.add(this.tick);
    const bounds = text.getLocalBounds();
    const entry: Entry = { view, text, size: { width: bounds.width, height: bounds.height } };
    this.entries.set(id, entry);
    this.look();
    setResolution(text, this.wanted(entry, this.pictures(), this.limits()));
  }

  forget(id: string): void {
    if (this.entries.delete(id) && this.entries.size === 0) this.viewport.options.ticker?.remove(this.tick);
  }

  /** A text's scale or place changed on its view alone, as under a handle that is being dragged. */
  touch(): void {
    this.stale = true;
  }

  /**
   * Keeps the texts `region` shows as fine as its pixels need, until the returned function is
   * called: a picture of the map rendered with a camera of its own.
   */
  addDemandRegion(region: TesseraView): () => void {
    this.regions.add(region);
    this.look();
    this.restingSince = this.now();
    // Finer at once: the picture may be rendered before the next tick.
    this.waiting = this.apply(false);
    return (): void => {
      if (!this.regions.delete(region)) return;
      this.restingSince = this.now();
      this.stale = true;
    };
  }

  destroy(): void {
    if (this.entries.size > 0) this.viewport.options.ticker?.remove(this.tick);
    this.entries.clear();
    this.regions.clear();
  }

  private readonly tick = (): void => {
    this.look();
    if (!this.stale && !this.waiting) return;
    this.stale = false;
    this.waiting = this.apply(this.now() - this.restingSince >= TEXT_SETTLE_MS);
  };

  /** Reads the view's camera, which moves without a word (`moveCenter`, `setZoom`, a glide). */
  private look(): void {
    const { x, y, scale, screenWidth, screenHeight } = this.viewport;
    const zoom = Math.abs(scale.x);
    const resolution = this.host.resolution();
    const camera = this.camera;
    if (camera.x === x && camera.y === y && camera.zoom === zoom && camera.width === screenWidth && camera.height === screenHeight && camera.resolution === resolution) return;
    camera.x = x;
    camera.y = y;
    camera.zoom = zoom;
    camera.width = screenWidth;
    camera.height = screenHeight;
    camera.resolution = resolution;
    this.restingSince = this.now();
    this.stale = true;
  }

  /** Brings every text to its resolution, coarser only where `rested`; whether a text still waits to become coarser. */
  private apply(rested: boolean): boolean {
    if (this.entries.size === 0) return false;
    const pictures = this.pictures();
    const limits = this.limits();
    let waiting = false;
    for (const entry of this.entries.values()) {
      const wanted = this.wanted(entry, pictures, limits);
      const current = entry.text.resolution;
      if (wanted < current && !rested) waiting = true;
      else setResolution(entry.text, wanted);
    }
    return waiting;
  }

  private wanted(entry: Entry, pictures: readonly Picture[], limits: TextTextureLimits): number {
    const { view, size } = entry;
    const scale = Math.abs(view.scale.x);
    // Whatever its rotation, the text lies within this circle.
    const reach = (Math.hypot(size.width, size.height) / 2) * scale;
    let pixelsPerUnit = 0;
    for (const picture of pictures) {
      const marginX = (picture.x1 - picture.x0) * MARGIN + reach;
      const marginY = (picture.y1 - picture.y0) * MARGIN + reach;
      const shown = view.x >= picture.x0 - marginX && view.x <= picture.x1 + marginX
        && view.y >= picture.y0 - marginY && view.y <= picture.y1 + marginY;
      if (shown) pixelsPerUnit = Math.max(pixelsPerUnit, picture.pixelsPerUnit * scale);
    }
    return textResolution(pixelsPerUnit, size, limits);
  }

  private pictures(): Picture[] {
    const pictures: Picture[] = [];
    const camera = this.camera;
    if (camera.zoom > 0 && camera.width > 0 && camera.height > 0 && camera.resolution > 0) {
      const x0 = -camera.x / camera.zoom;
      const y0 = -camera.y / camera.zoom;
      pictures.push({ x0, y0, x1: x0 + camera.width / camera.zoom, y1: y0 + camera.height / camera.zoom, pixelsPerUnit: camera.zoom * camera.resolution });
    }
    for (const { rect, worldPerScreenPixel } of this.regions) {
      if (!(worldPerScreenPixel > 0)) continue;
      pictures.push({ x0: rect.x, y0: rect.y, x1: rect.x + rect.width, y1: rect.y + rect.height, pixelsPerUnit: 1 / worldPerScreenPixel });
    }
    return pictures;
  }

  private limits(): TextTextureLimits {
    // Asked until the renderer answers, then kept: the limit is the graphics card's.
    this.maxSide ??= this.host.maxTextureSide();
    return this.maxSide === null ? TEXT_TEXTURE_LIMITS : { ...TEXT_TEXTURE_LIMITS, maxSide: Math.min(TEXT_TEXTURE_LIMITS.maxSide, this.maxSide) };
  }
}

/** Every change of resolution draws the text anew, so only a change is written. */
function setResolution(text: Text, resolution: number): void {
  if (text.resolution !== resolution) text.resolution = resolution;
}
