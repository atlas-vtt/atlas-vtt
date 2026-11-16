/*
 * A MODEL of the GM's home uplink, not a measurement. Its assumptions, so a reader knows what the
 * numbers it gives rest on:
 *
 * - One bottleneck: the uplink drains `bitsPerSecond` from one first-in, first-out queue (the home
 *   router's or modem's buffer). Everything the GM sends passes it: uploads, the table's WebSocket
 *   frames and its keep-alive. Nothing else on the network sends.
 * - An upload request is a TCP flow. It never puts its whole body into the bottleneck at once: it keeps
 *   at most `flowWindow` bytes queued there (its congestion window beyond the path's bandwidth-delay
 *   product, ~50 KB at 10 Mbit/s and 40 ms); the rest waits in the GM's own socket buffer, which delays
 *   nobody else. The router holds at most `routerBuffer` bytes; flows share that room equally (what
 *   loss-based TCP settles to). So the queue a live frame waits behind is set by the windows and the
 *   buffer, not by how large a request's body is.
 * - A request's response comes one base round trip after its last byte left the bottleneck. A request
 *   costs nothing to start; no flow slows down after a loss (the buffer cap stands in for that).
 * - Live frames (marks, token lists, progress) are small WebSocket messages: each waits for the bytes
 *   queued ahead of it (`queued / rate`), its "added delay"; the base round trip is not counted.
 * - The keep-alive measures `baseRttMs` plus the queue it meets, every `keepAliveMs`, as the GM's pulse
 *   does (`KEEPALIVE_MS`).
 * - Time moves in steps of `stepMs`; queue delays are worked out exactly at each enqueue.
 */

export interface UplinkOptions {
  readonly bitsPerSecond: number;
  readonly baseRttMs: number;
  readonly flowWindow: number;
  readonly routerBuffer: number;
}

interface Flow {
  unsent: number;
  queued: number;
  readonly done: () => void;
}

/** The bottleneck: upload flows, live frames, and what a frame or the keep-alive waits behind. */
export class FakeUplink {
  private readonly flows = new Set<Flow>();
  private liveQueued = 0;
  /** Responses due: when, and whose. */
  private readonly due: { readonly at: number; readonly done: () => void }[] = [];
  /** The live frames' added delays, in ms. */
  readonly liveDelays: number[] = [];
  /** The keep-alive's last round trip, in ms; null before the first. */
  lastRttMs: number | null = null;
  /** Bytes of uploads that left the bottleneck. */
  sent = 0;

  constructor(private readonly options: UplinkOptions) {}

  private get bytesPerMs(): number {
    return this.options.bitsPerSecond / 8 / 1000;
  }

  /** The bytes queued in the bottleneck now. */
  get queued(): number {
    let total = this.liveQueued;
    for (const flow of this.flows) total += flow.queued;
    return total;
  }

  get flowsInFlight(): number {
    return this.flows.size;
  }

  /** An upload request of `bytes`: resolves one base round trip after its last byte left. */
  request(bytes: number): Promise<void> {
    return new Promise((resolve) => this.flows.add({ unsent: bytes, queued: 0, done: resolve }));
  }

  /** A live frame of `bytes` sent now; `measured`: its added delay is counted. */
  live(bytes: number, measured: boolean): void {
    if (measured) this.liveDelays.push(this.queued / this.bytesPerMs);
    this.liveQueued += bytes;
  }

  /** The keep-alive goes now and measures the queue it meets. */
  keepAlive(): void {
    this.lastRttMs = Math.round(this.options.baseRttMs + this.queued / this.bytesPerMs);
  }

  /** Moves the model on by `ms` at time `now` (after the step): flows fill their windows, the bottleneck drains, responses come. */
  step(now: number, ms: number): void {
    const { flowWindow, routerBuffer, baseRttMs } = this.options;
    const share = this.flows.size === 0 ? 0 : Math.max(0, routerBuffer - this.liveQueued) / this.flows.size;
    for (const flow of this.flows) {
      const room = Math.max(0, Math.min(flowWindow, share) - flow.queued);
      const add = Math.min(room, flow.unsent);
      flow.unsent -= add;
      flow.queued += add;
    }
    const total = this.queued;
    const drained = Math.min(total, this.bytesPerMs * ms);
    if (total > 0) {
      const part = drained / total;
      this.liveQueued -= this.liveQueued * part;
      for (const flow of [...this.flows]) {
        const left = flow.queued * part;
        flow.queued -= left;
        this.sent += left;
        if (flow.unsent === 0 && flow.queued < 1) {
          this.flows.delete(flow);
          this.due.push({ at: now + baseRttMs, done: flow.done });
        }
      }
    }
    for (const response of this.due.filter((entry) => entry.at <= now)) {
      this.due.splice(this.due.indexOf(response), 1);
      response.done();
    }
  }
}

/** The 50th and 95th percentile and the largest of some values. */
export function percentiles(values: readonly number[]): { readonly p50: number; readonly p95: number; readonly max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share: number): number => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
  return { p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
}
