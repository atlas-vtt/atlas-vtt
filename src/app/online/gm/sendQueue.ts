import { MAX_BATCH_SENDS, MAX_GM_FRAME, PROTOCOL_VERSION } from '../protocol/index.ts';
import { companionTimers, type Timers } from './companionTimers.ts';

/** What the queue needs of a socket. */
export interface QueueSocket {
  readonly bufferedAmount: number;
  send(text: string): void;
}

/** Frames a second the queue sends at most over time, below the relay's GM rate limit (100). */
export const FRAMES_PER_SECOND = 80;
/** Frames the queue may send at once after a quiet spell, well below the relay's burst (200). */
export const BURST = 40;
/** Bytes the socket may hold unsent before even a live frame waits. */
export const MAX_BUFFERED = 1024 * 1024;
/**
 * Bytes the socket may hold unsent before other frames wait: about one asset chunk, so a live frame
 * never queues behind more than that on a slow uplink.
 */
export const BULK_BUFFERED = 64 * 1024;
/**
 * While the relay takes `sends` frames, the queue sends one at most this often while game messages
 * keep coming: everything that came meanwhile goes in it. One after a quiet spell goes at once, and a
 * frame that is full makes room for the next at once.
 */
export const BATCH_MS = 50;
/** How soon the queue looks again while the socket drains. */
const DRAIN_CHECK_MS = 10;
/** A `sends` frame without its entries, whose length every batch counts. */
const BATCH_HEAD = `{"v":${PROTOCOL_VERSION},"t":"sends","sends":[`;
const BATCH_TAIL = ']}';

/** The clock and timers the queue paces with; the companion's in Obsidian, fakes in tests. */
export type QueueClock = Timers;

interface QueuedFrame {
  readonly text: string;
  /** The player or players (`ALL_PLAYERS`) a game message goes to; unset for the GM's own requests. */
  readonly to: string | undefined;
  /** A game message as an entry of a `sends` frame; unset for the GM's own requests to the relay, which always go alone. */
  readonly entry: string | undefined;
}

type Next = { readonly frame: QueuedFrame; readonly live: true; readonly key: string } | { readonly frame: QueuedFrame; readonly live: false };

/**
 * Frames in two lanes, under the relay's rate limit (a token bucket) and the socket's buffer: live
 * frames (`pushLive`) keep only the latest of each key and go first; every other frame goes in order
 * after them, and only while the socket holds little unsent, so a large asset never holds a live
 * frame back for long. Frames wait while no socket is attached and go out once one is. A socket of a
 * relay that takes `sends` frames (`attach` with `batching`) gets the game messages of a moment in
 * one frame, live ones first, at most every `BATCH_MS`, each frame within the relay's limits.
 */
export class SendQueue {
  private frames: QueuedFrame[] = [];
  private live = new Map<string, QueuedFrame>();
  private socket: QueueSocket | null = null;
  private batching = false;
  private timer: number | undefined;
  private tokens = BURST;
  private filledAt: number;
  private sentAt = Number.NEGATIVE_INFINITY;
  /** The last batch left messages behind that did not fit in it: the next goes without waiting. */
  private full = false;
  private readonly clock: QueueClock;

  constructor(clock: QueueClock = companionTimers()) {
    this.clock = clock;
    this.filledAt = clock.now();
  }

  get length(): number {
    return this.frames.length + this.live.size;
  }

  /** Queues a frame; `to` names who a game message is for, so it can be dropped once they are gone; `entry` is the message as a batch carries it. */
  push(frame: string, to?: string, entry?: string): void {
    this.frames.push({ text: frame, to, entry });
    this.pump();
  }

  /** Queues a live frame: it replaces a waiting one of the same key and goes before every other frame. */
  pushLive(key: string, frame: string, to?: string, entry?: string): void {
    this.live.delete(key);
    this.live.set(key, { text: frame, to, entry });
    this.pump();
  }

  /** Drops the waiting game messages for recipients that are gone. */
  drop(gone: (to: string) => boolean): void {
    const kept = (frame: QueuedFrame): boolean => frame.to === undefined || !gone(frame.to);
    this.frames = this.frames.filter(kept);
    this.live = new Map([...this.live].filter(([, frame]) => kept(frame)));
  }

  /** Sends through `socket` from now on; `batching`: its relay takes `sends` frames. */
  attach(socket: QueueSocket, batching = false): void {
    this.socket = socket;
    this.batching = batching;
    this.pump();
  }

  detach(): void {
    this.socket = null;
    if (this.timer !== undefined) this.clock.clearTimer(this.timer);
    this.timer = undefined;
  }

  /** Sends what the rate and the socket allow now and schedules the rest. */
  pump(): void {
    if (this.socket === null || this.timer !== undefined) return;
    for (;;) {
      const next = this.next();
      if (next === null) return;
      const gap = this.sentAt + BATCH_MS - this.clock.now();
      if (this.batching && !this.full && gap > 0) return this.wait(gap);
      this.refill();
      if (this.tokens < 1) return this.wait(((1 - this.tokens) * 1000) / FRAMES_PER_SECOND);
      if (this.socket.bufferedAmount > (next.live ? MAX_BUFFERED : BULK_BUFFERED)) return this.wait(DRAIN_CHECK_MS);
      const text = this.batching ? this.takeBatch(this.socket.bufferedAmount) : this.take(next).text;
      this.tokens -= 1;
      this.sentAt = this.clock.now();
      this.socket.send(text);
    }
  }

  /** The frame to send next: the oldest live one, else the oldest of the others. */
  private next(): Next | null {
    const [live] = this.live;
    if (live !== undefined) return { frame: live[1], live: true, key: live[0] };
    const frame = this.frames[0];
    return frame === undefined ? null : { frame, live: false };
  }

  private take(next: Next): QueuedFrame {
    if (next.live) this.live.delete(next.key);
    else this.frames.shift();
    return next.frame;
  }

  /**
   * The next frame of a batching socket: as many waiting game messages as fit in one `sends` frame,
   * live ones first and the others only while the socket holds little; one message alone goes as its
   * own frame, and so does a request to the relay.
   */
  private takeBatch(buffered: number): string {
    const taken: QueuedFrame[] = [];
    let size = BATCH_HEAD.length + BATCH_TAIL.length;
    this.full = false;
    for (let next = this.next(); next !== null; next = this.next()) {
      if (!next.live && buffered > BULK_BUFFERED) break;
      const { entry } = next.frame;
      const fits = entry !== undefined && taken.length < MAX_BATCH_SENDS && size + entry.length + 1 <= MAX_GM_FRAME;
      if (!fits) {
        if (taken.length === 0) return this.take(next).text;
        this.full = true;
        break;
      }
      taken.push(this.take(next));
      size += entry.length + 1;
    }
    const [first] = taken;
    if (taken.length === 1 && first !== undefined) return first.text;
    return `${BATCH_HEAD}${taken.map((frame) => frame.entry).join(',')}${BATCH_TAIL}`;
  }

  private refill(): void {
    const now = this.clock.now();
    this.tokens = Math.min(BURST, this.tokens + ((now - this.filledAt) * FRAMES_PER_SECOND) / 1000);
    this.filledAt = now;
  }

  private wait(ms: number): void {
    this.timer = this.clock.setTimer(() => {
      this.timer = undefined;
      this.pump();
    }, Math.max(1, Math.ceil(ms)));
  }
}
