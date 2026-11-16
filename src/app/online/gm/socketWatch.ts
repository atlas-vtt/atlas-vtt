import { KEEPALIVE_MS, KEEPALIVE_PING } from '../protocol/index.ts';
import { every, type Timers } from './companionTimers.ts';

/** A socket that has not opened after this long is given up: a handshake is a few round trips, and one that hangs fires no event. */
export const OPEN_TIMEOUT_MS = 10_000;
/** After its hello a socket must carry the relay's welcome within this long: the relay answers a hello at once, with a welcome or a close. */
export const WELCOME_TIMEOUT_MS = 8_000;
/**
 * How long after a keep-alive the GM's socket may stay without any sign of life before it counts
 * as dead. The answer comes from the relay's edge, one round trip away, but the ping may stand
 * behind a large message on a slow uplink, and replacing the socket sends every player the scene
 * anew: so the time is generous, and a socket whose buffer still drains is not judged at all.
 */
export const PULSE_DEADLINE_MS = 20_000;
/** How soon after a keep-alive the pulse looks whether it has left the socket's buffer: a buffer says what it holds, not when it lets go. */
export const FLUSH_LOOK_MS = 1_000;
/** A timer that fires this much later than set fired late: the window was hidden, busy or asleep. */
export const LATE_MS = 2_000;
/** How long a limit that fired late waits for what queued up meanwhile before it is judged. */
export const SETTLE_MS = 1_000;

/**
 * A time limit judged by the clock. Obsidian's window is often hidden or behind another app, and a
 * timer there, or on a machine that slept, may fire long after its time, at the same moment as the
 * socket events that waited with it. So a limit that fires late proves nothing yet: it waits
 * `SETTLE_MS` for those events and runs only if nothing cleared it meanwhile.
 */
export class Deadline {
  private readonly timers: Timers;
  private timer: number | undefined;

  constructor(timers: Timers) {
    this.timers = timers;
  }

  /** `expired` runs once `ms` have passed, unless the limit is cleared or set anew before. */
  set(ms: number, expired: () => void): void {
    this.clear();
    const due = this.timers.now() + ms;
    this.timer = this.timers.setTimer(() => {
      this.timer = undefined;
      if (this.timers.now() - due <= LATE_MS) return expired();
      this.timer = this.timers.setTimer(() => {
        this.timer = undefined;
        expired();
      }, SETTLE_MS);
    }, ms);
  }

  clear(): void {
    if (this.timer !== undefined) this.timers.clearTimer(this.timer);
    this.timer = undefined;
  }
}

/** What the pulse asks of the socket it watches. */
export interface PulseSocket {
  /** Bytes the socket holds unsent. */
  readonly bufferedAmount: number;
  send(text: string): void;
}

/**
 * The pulse of the GM's socket. Every `KEEPALIVE_MS` it sends the keep-alive, which the relay
 * answers without waking the table; from then any frame is a sign of life, and `PULSE_DEADLINE_MS`
 * without one is a dead socket: one that died without a close (a network that changed, a router
 * that forgot the connection) fires no event of its own, and the table would stand still while the
 * panel says online. The time runs for a ping that has left the socket's buffer. One that still
 * stands there behind an asset (everything the table sends goes through `start`'s socket, so the
 * pulse knows what went in before it) waits as long as the buffer drains, and a buffer that stands
 * still for the whole time is a dead socket too. One ping every 30 s is far below the relay's rate,
 * which does not count it: the relay's edge answers it before the table sees a frame.
 */
export class Pulse {
  private readonly timers: Timers;
  private readonly limit: Deadline;
  private readonly dead: () => void;
  private socket: PulseSocket | null = null;
  private stopBeat: () => void = () => undefined;
  /** What was handed to the socket so far, in bytes as its buffer counts them. */
  private handed = 0;
  /** A keep-alive that waits for a sign of life: where it stands in what was handed over, how much had left the buffer when last looked, and whether it had left itself. */
  private asked: { readonly mark: number; left: number; inFlight: boolean } | null = null;
  private pingAt: number | null = null;
  private latency: number | null = null;

  constructor(timers: Timers, dead: () => void) {
    this.timers = timers;
    this.limit = new Deadline(timers);
    this.dead = dead;
  }

  /** The time the last keep-alive took to be answered, or null. */
  latencyMs(): number | null {
    return this.latency;
  }

  /** The relay welcomed the socket: it beats from now on. What the table sends goes through the socket returned. */
  start(socket: PulseSocket): PulseSocket {
    this.stop();
    this.socket = socket;
    this.handed = socket.bufferedAmount;
    this.stopBeat = every(this.timers, KEEPALIVE_MS, () => this.beat());
    const send = (text: string): void => this.send(socket, text);
    return { get bufferedAmount(): number { return socket.bufferedAmount; }, send };
  }

  /** The socket is gone: nothing beats and nothing is timed. */
  stop(): void {
    this.stopBeat();
    this.stopBeat = () => undefined;
    this.limit.clear();
    this.socket = null;
    this.asked = null;
    this.pingAt = null;
  }

  /** A frame came, the keep-alive's answer (`pong`) or any other: the socket lives. */
  heard(pong: boolean): void {
    this.limit.clear();
    this.asked = null;
    if (!pong) return;
    if (this.pingAt !== null) this.latency = Math.round(this.timers.now() - this.pingAt);
    this.pingAt = null;
  }

  private send(socket: PulseSocket, text: string): void {
    // A buffer rises by what a send hands it at once, and falls later as that leaves.
    const before = socket.bufferedAmount;
    socket.send(text);
    this.handed += socket.bufferedAmount - before;
  }

  private beat(): void {
    const { socket } = this;
    if (socket === null) return;
    this.pingAt = this.timers.now();
    this.send(socket, KEEPALIVE_PING);
    if (this.asked !== null) return;
    this.asked = { mark: this.handed, left: this.handed - socket.bufferedAmount, inFlight: false };
    this.limit.set(FLUSH_LOOK_MS, () => this.judge(PULSE_DEADLINE_MS - FLUSH_LOOK_MS, true));
  }

  /**
   * No frame came. A ping that had left the buffer is unanswered: the socket is dead. One that left
   * since the last look gets `next` as its time; one still behind what the buffer holds waits while
   * the buffer drains (`first`: the look just after it was sent), and a buffer that did not drain is
   * a dead socket.
   */
  private judge(next: number, first = false): void {
    const { socket, asked } = this;
    if (socket === null || asked === null) return;
    const left = this.handed - socket.bufferedAmount;
    const gone = left >= asked.mark;
    if (asked.inFlight || (!gone && !first && left <= asked.left)) {
      this.asked = null;
      return this.dead();
    }
    asked.inFlight = gone;
    asked.left = left;
    this.limit.set(gone ? next : PULSE_DEADLINE_MS, () => this.judge(PULSE_DEADLINE_MS));
  }
}
