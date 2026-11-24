import type { PixelRect } from './pyramid';
import type { TesseraGraphics } from './tesseraGraphics';
import type { EncoderReply, EncoderRequest } from './tesseraEncoderProtocol';

/**
 * Encodes tesserae for the builds of the tessera core. Encoding a lossless WebP is nearly all of a
 * build's time and runs on the thread that asks for it, so the core hands it to encoder workers
 * (`tesseraEncoderWorker.ts`) when the page gave it their ports: each tessera's rect is cropped
 * here and the crop transferred, never copied. Without encoders, or where one fails, a tessera is
 * encoded here as before; the pixels and bytes are the same either way.
 */

export interface TesseraEncoder {
  /** How many tesserae a build may have under way at once. */
  readonly slots: number;
  /** `source`'s rect encoded as a tessera (`TesseraGraphics.encodeTessera`). */
  encode(source: ImageBitmap, rect: PixelRect): Promise<Blob>;
}

/** Encodes on this thread, one tessera at a time. */
export function localEncoder(graphics: TesseraGraphics): TesseraEncoder {
  return { slots: 1, encode: (source, rect) => graphics.encodeTessera(source, rect) };
}

/**
 * An encoder that has not answered for this long is taken for dead; what it held is encoded here. Chromium
 * tells a port whose worker ended at once (its `close` event); this is for where nothing tells.
 */
export const ENCODER_TIMEOUT_MS = 30_000;

interface Lane {
  port: MessagePort;
  /** Answered its first message: a worker that never started is never given a tessera. */
  live: boolean;
  busy: number;
}

/** What a failed or timed-out request settles with. */
const FAILED = Symbol('failed');
type Answer = Blob | null | typeof FAILED;

interface Pending {
  lane: Lane;
  settle: (answer: Answer) => void;
  timer: number;
}

export class TesseraEncoderPool implements TesseraEncoder {
  private readonly lanes: Lane[] = [];
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private asked = false;

  /** `want`: asks the page for encoders, once, when the first tessera is to be encoded without any. */
  constructor(
    private readonly graphics: TesseraGraphics,
    private readonly want: () => void = () => undefined,
  ) {}

  /** Two a live encoder, so none waits for its next tessera; one where none is live. */
  get slots(): number {
    const live = this.lanes.filter((lane) => lane.live).length;
    return live === 0 ? 1 : live * 2;
  }

  /** Takes the encoders' ports; each is used once it answered. */
  attach(ports: readonly MessagePort[]): void {
    for (const port of ports) {
      const lane: Lane = { port, live: false, busy: 0 };
      this.lanes.push(lane);
      port.onmessage = (event: MessageEvent<EncoderReply>) => this.answered(event.data);
      port.addEventListener('close', () => this.failLane(lane));
      void this.send(lane, null).then((answer) => {
        lane.live = answer !== FAILED && this.lanes.includes(lane);
      });
    }
  }

  async encode(source: ImageBitmap, rect: PixelRect): Promise<Blob> {
    if (!this.asked && this.lanes.length === 0) {
      this.asked = true;
      this.want();
    }
    const lane = this.idlest();
    if (!lane) return this.graphics.encodeTessera(source, rect);
    lane.busy += 1;
    try {
      const blob = await this.send(lane, await this.graphics.crop(source, rect));
      // Each realm learns its own format: an encoder that wrote another than this one's is not used again.
      if (blob instanceof Blob && blob.type === `image/${await this.graphics.tesseraFormat()}`) return blob;
      lane.live = false;
      return await this.graphics.encodeTessera(source, rect);
    } finally {
      lane.busy -= 1;
    }
  }

  /** Forgets every encoder; tesserae under way with one are encoded here. */
  dispose(): void {
    for (const lane of this.lanes.splice(0)) lane.port.close();
    for (const id of [...this.pending.keys()]) this.settle(id, FAILED);
  }

  private idlest(): Lane | null {
    let best: Lane | null = null;
    for (const lane of this.lanes) if (lane.live && (!best || lane.busy < best.busy)) best = lane;
    return best;
  }

  /** The encoder's blob of `bitmap` (transferred), null for a ping (no bitmap), `FAILED` when it failed or timed out. */
  private send(lane: Lane, bitmap: ImageBitmap | null): Promise<Answer> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = self.setTimeout(() => this.failLane(lane), ENCODER_TIMEOUT_MS);
      this.pending.set(id, { lane, settle: resolve, timer });
      const request: EncoderRequest = { id, bitmap };
      try {
        lane.port.postMessage(request, bitmap ? [bitmap] : []);
      } catch {
        bitmap?.close();
        this.failLane(lane);
      }
    });
  }

  /** The encoder is not used again, and what it holds is encoded here. */
  private failLane(lane: Lane): void {
    lane.live = false;
    for (const [id, pending] of [...this.pending]) if (pending.lane === lane) this.settle(id, FAILED);
  }

  private answered(reply: EncoderReply): void {
    this.settle(reply.id, 'error' in reply ? FAILED : reply.blob);
  }

  private settle(id: number, answer: Answer): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    self.clearTimeout(pending.timer);
    pending.settle(answer);
  }
}
