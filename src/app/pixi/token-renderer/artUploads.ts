import { UPDATE_PRIORITY, type TextureSource, type Ticker } from 'pixi.js';

/** CPU milliseconds of art uploads a frame that draws the map may take. */
export const ART_UPLOAD_BUDGET_MS = 4;
/** CPU milliseconds of art uploads a frame may take while a load holds the canvas: nothing is drawn whose frames they would slow. */
export const ART_UPLOAD_HELD_BUDGET_MS = 12;
/**
 * Tokens that go on to the map in one frame that draws it. A token's first draw also rasterises its
 * name and numbers, about 0.6 ms of main thread each: a floor of 300 tokens switched back to, whose
 * art was all on the GPU, drew them in one frame of 200 ms.
 */
export const TOKENS_PER_FRAME = 12;

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
  /** Whether a load holds the canvas (`rendersHeld`): no frame is drawn, so uploads take more of each and every token goes on. */
  held: () => boolean;
  now?: () => number;
}

interface Waiting {
  source: TextureSource;
  distance: number;
  resolve: () => void;
}

/**
 * Uploads token art to the GPU before it is first drawn: a few textures a frame within a time budget,
 * the art of tokens nearest the view first. A texture the renderer meets first in a frame it draws is
 * uploaded there and its mipmaps built, about 1.5 ms of main thread for a 1024 px image and more on the
 * GPU, so a scene of 300 tokens drew its first frame in 670 ms. The token renderer adds a token to the
 * map once its art is uploaded, so a scene's reveal, which waits for its tokens, uploads no art; outside
 * a load, tokens go on a few a frame (`TOKENS_PER_FRAME`).
 */
export class ArtUploads {
  private waiting: Waiting[] = [];
  private ticking = false;
  private readonly now: () => number;

  constructor(private readonly options: ArtUploadsOptions) {
    this.now = options.now ?? ((): number => performance.now());
  }

  /** Resolves once `source` is on the GPU and the token may go on; `distance` (from the view's centre) orders them, nearest first. */
  whenUploaded(source: TextureSource, distance: number): Promise<void> {
    if (!this.options.renderer() || source.destroyed) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.push({ source, distance, resolve });
      this.tick(true);
    });
  }

  /** Lets every waiting token go on; their art uploads when first drawn. */
  destroy(): void {
    this.tick(false);
    const waiting = this.waiting;
    this.waiting = [];
    for (const { resolve } of waiting) resolve();
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
    const held = this.options.held();
    const budget = held ? ART_UPLOAD_HELD_BUDGET_MS : ART_UPLOAD_BUDGET_MS;
    const tokens = held ? Infinity : TOKENS_PER_FRAME;
    const order = this.waiting.sort((a, b) => a.distance - b.distance);
    const start = this.now();
    let done = 0;
    while (done < order.length && done < tokens && (done === 0 || this.now() - start < budget)) {
      const { source, resolve } = order[done]!;
      done++;
      try {
        // Uploads once; a texture already on the GPU is only bound
        if (!source.destroyed) renderer.texture.initSource(source);
      } catch (error) {
        // The frame that draws it tries again; an error must not reach the ticker, which stops at one
        console.warn('[ArtUploads] Token art could not be uploaded ahead:', error);
      }
      resolve();
    }
    this.waiting = order.slice(done);
    if (this.waiting.length === 0) this.tick(false);
  };
}
