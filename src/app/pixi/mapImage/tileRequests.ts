/** The tile requests a map image layer has open: how many at once, in which order, and which to abort. */
import { tileKey, type Pyramid, type TileRef } from './pyramid';

/** Tile requests open at once per layer: enough to keep the decoder busy, few enough to follow the camera. */
export const MAX_TILES_IN_FLIGHT = 6;

/** Where a layer's tiles come from: a pyramid and a way to get one tile's bitmap. */
export interface TileSource {
  /** The pyramid's identity (the source's hash): tile textures are cached under it. */
  readonly key: string;
  readonly pyramid: Pyramid;
  /** The tile's bitmap (its source rect, overlap included); rejects with an `AbortError` once `signal` aborts. */
  requestTile(ref: TileRef, signal: AbortSignal): Promise<ImageBitmap>;
}

export interface TileRequestHandlers {
  /** A tile arrived; the handler owns the bitmap. */
  arrived(ref: TileRef, bitmap: ImageBitmap): void;
  /** A request failed for another reason than being aborted. */
  failed(ref: TileRef, error: unknown): void;
}

export class TileRequests {
  private readonly open = new Map<string, AbortController>();
  private closed = false;

  constructor(
    private readonly source: TileSource,
    private readonly handlers: TileRequestHandlers,
    private readonly maxInFlight = MAX_TILES_IN_FLIGHT,
  ) {}

  get inFlight(): number {
    return this.open.size;
  }

  isOpen(key: string): boolean {
    return this.open.has(key);
  }

  /** Aborts the open requests whose tile is not in `keep`, then opens `queue` in order up to the cap. */
  sync(queue: readonly TileRef[], keep: ReadonlySet<string>): void {
    if (this.closed) return;
    for (const [key, controller] of this.open) {
      if (keep.has(key)) continue;
      this.open.delete(key);
      controller.abort();
    }
    for (const ref of queue) {
      if (this.open.size >= this.maxInFlight) return;
      if (!this.open.has(tileKey(ref))) this.request(ref);
    }
  }

  /** Aborts every open request; nothing is requested afterwards. */
  close(): void {
    this.closed = true;
    for (const controller of this.open.values()) controller.abort();
    this.open.clear();
  }

  private request(ref: TileRef): void {
    const key = tileKey(ref);
    const controller = new AbortController();
    this.open.set(key, controller);
    const settle = (): boolean => {
      const current = this.open.get(key) === controller;
      if (current) this.open.delete(key);
      return current && !controller.signal.aborted;
    };
    let pending: Promise<ImageBitmap>;
    try {
      pending = this.source.requestTile(ref, controller.signal);
    } catch (error) {
      this.open.delete(key);
      this.handlers.failed(ref, error);
      return;
    }
    void pending.then(
      (bitmap) => {
        if (settle()) this.handlers.arrived(ref, bitmap);
        else bitmap.close();
      },
      (error: unknown) => {
        if (settle()) this.handlers.failed(ref, error);
      },
    );
  }
}
