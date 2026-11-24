import { UPDATE_PRIORITY, type TextureSource, type Ticker } from 'pixi.js';

/** CPU milliseconds of art uploads a frame that draws the map may take. */
export const ART_UPLOAD_BUDGET_MS = 4;
/** CPU milliseconds of art uploads a frame may take while a load holds the canvas: nothing is drawn whose frames they would slow. */
export const ART_UPLOAD_HELD_BUDGET_MS = 12;

/** The part of a renderer the uploads use. */
export interface ArtUploader {
  texture: { initSource(source: TextureSource): unknown };
}

export interface ArtUploadsOptions {
  /**
   * Not the app's ticker: a load stops that one while it holds the last frame (`bindMapLoadingFrameHold`),
   * which is when the art of the scene being loaded should upload.
   */
  ticker: Ticker;
  /** The renderer that draws the art; null uploads nothing ahead (the art then uploads in the frame that first draws it). */
  renderer: () => ArtUploader | null;
  /** CPU milliseconds the uploads of one frame may take; at least one texture is uploaded per frame. */
  budgetMs: () => number;
  now?: () => number;
}

interface Waiting {
  distance: number;
  resolve: Array<() => void>;
}

/**
 * Uploads token art to the GPU before it is first drawn: a few textures a frame within a time budget,
 * the art of tokens nearest the view first. A texture the renderer meets first in a frame it draws is
 * uploaded there and its mipmaps built, about 1.5 ms of main thread for a 1024 px image and more on the
 * GPU, so a scene of 300 tokens drew its first frame in 670 ms. The token renderer adds a token to the
 * map once its art is uploaded, so a scene's reveal, which waits for its tokens, uploads no art.
 */
export class ArtUploads {
  private readonly waiting = new Map<TextureSource, Waiting>();
  private ticking = false;
  private readonly now: () => number;

  constructor(private readonly options: ArtUploadsOptions) {
    this.now = options.now ?? ((): number => performance.now());
  }

  /** Resolves once `source` is on the GPU; `distance` (from the view's centre) orders the uploads, nearest first. */
  whenUploaded(source: TextureSource, distance: number): Promise<void> {
    if (!this.options.renderer() || source.destroyed) return Promise.resolve();
    return new Promise((resolve) => {
      const waiting = this.waiting.get(source);
      if (waiting) {
        waiting.distance = Math.min(waiting.distance, distance);
        waiting.resolve.push(resolve);
      } else {
        this.waiting.set(source, { distance, resolve: [resolve] });
      }
      this.tick(true);
    });
  }

  /** Lets every waiting token go on; their art uploads when first drawn. */
  destroy(): void {
    this.tick(false);
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const { resolve } of waiting) for (const done of resolve) done();
  }

  private tick(on: boolean): void {
    if (on === this.ticking) return;
    this.ticking = on;
    if (on) this.options.ticker.add(this.upload, undefined, UPDATE_PRIORITY.NORMAL);
    else this.options.ticker.remove(this.upload);
  }

  private readonly upload = (): void => {
    const renderer = this.options.renderer();
    if (!renderer) {
      this.destroy();
      return;
    }
    const order = [...this.waiting.entries()].sort((a, b) => a[1].distance - b[1].distance);
    const start = this.now();
    const budget = this.options.budgetMs();
    for (const [source, waiting] of order) {
      if (this.now() - start >= budget && this.waiting.size < order.length) break;
      this.waiting.delete(source);
      try {
        // Uploads once; a texture already on the GPU is only bound
        if (!source.destroyed) renderer.texture.initSource(source);
      } catch (error) {
        // The frame that draws it tries again; an error must not reach the ticker, which stops at one
        console.warn('[ArtUploads] Token art could not be uploaded ahead:', error);
      }
      for (const done of waiting.resolve) done();
    }
    if (this.waiting.size === 0) this.tick(false);
  };
}
