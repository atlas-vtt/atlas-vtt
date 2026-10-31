/** The tessera requests a map image layer has open: how many at once, in which order, and which to abort. */
import { tesseraKey, type Pyramid, type TesseraRef } from './pyramid';

/** Tessera requests open at once per layer: enough to keep the decoder busy, few enough to follow the camera. */
export const MAX_TESSERAE_IN_FLIGHT = 6;

/** Where a layer's tesserae come from: a pyramid and a way to get one tessera's bitmap. */
export interface TesseraSource {
  /** The pyramid's identity (the source's hash): tessera textures are cached under it. */
  readonly key: string;
  readonly pyramid: Pyramid;
  /** The longest side of the finest level this source serves; finer levels are never asked for (a coarser one is drawn scaled). Unset: every level. */
  readonly finestSide?: number;
  /** The tessera's bitmap (its source rect, overlap included); rejects with an `AbortError` once `signal` aborts. */
  requestTessera(ref: TesseraRef, signal: AbortSignal): Promise<ImageBitmap>;
}

export interface TesseraRequestHandlers {
  /** A tessera arrived; the handler owns the bitmap. */
  arrived(ref: TesseraRef, bitmap: ImageBitmap): void;
  /** A request failed for another reason than being aborted. */
  failed(ref: TesseraRef, error: unknown): void;
}

export class TesseraRequests {
  private readonly open = new Map<string, AbortController>();
  private closed = false;

  constructor(
    private readonly source: TesseraSource,
    private readonly handlers: TesseraRequestHandlers,
    private readonly maxInFlight = MAX_TESSERAE_IN_FLIGHT,
  ) {}

  get inFlight(): number {
    return this.open.size;
  }

  isOpen(key: string): boolean {
    return this.open.has(key);
  }

  /** Aborts the open requests whose tessera is not in `keep`, then opens `queue` in order up to the cap. */
  sync(queue: readonly TesseraRef[], keep: ReadonlySet<string>): void {
    if (this.closed) return;
    for (const [key, controller] of this.open) {
      if (keep.has(key)) continue;
      this.open.delete(key);
      controller.abort();
    }
    for (const ref of queue) {
      if (this.open.size >= this.maxInFlight) return;
      if (!this.open.has(tesseraKey(ref))) this.request(ref);
    }
  }

  /** Aborts every open request; nothing is requested afterwards. */
  close(): void {
    this.closed = true;
    for (const controller of this.open.values()) controller.abort();
    this.open.clear();
  }

  private request(ref: TesseraRef): void {
    const key = tesseraKey(ref);
    const controller = new AbortController();
    this.open.set(key, controller);
    const settle = (): boolean => {
      const current = this.open.get(key) === controller;
      if (current) this.open.delete(key);
      return current && !controller.signal.aborted;
    };
    let pending: Promise<ImageBitmap>;
    try {
      pending = this.source.requestTessera(ref, controller.signal);
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
