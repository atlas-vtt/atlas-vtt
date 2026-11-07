import { estimateClockOffset, type ClockSample } from './clockMath';

/** At a join, a reconnect and a page coming back. */
export const JOIN_SAMPLES = 6;
/** Every `BURST_EVERY_MS` while sound plays. */
export const BURST_SAMPLES = 3;
export const BURST_EVERY_MS = 10 * 60_000;
/** An answer later than this is lost: the next exchange goes out. */
const ANSWER_LIMIT_MS = 3000;

export interface ClockSyncPorts {
  /** This device's clock in ms. */
  local(): number;
  /** Sends one exchange; false while nothing can carry it. */
  send(t1: number): boolean;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
}

/**
 * A table's clock on one device, from exchanges with the table: one at a time, so the answer's way is
 * never queued behind another's. Nothing is sent but for a `measure`, and on its own only while sound
 * plays, so a silent table is never woken. Bursts fall on the same moment of the table's clock on every
 * device, where the table is awake for one of them and pays for one wake.
 */
export class TableClockSync {
  private samples: ClockSample[] = [];
  private offset: number | null = null;
  private left = 0;
  private asked: number | null = null;
  private answerTimer: number | null = null;
  private burstTimer: number | null = null;
  private stopped = false;

  constructor(private readonly ports: ClockSyncPorts) {}

  /** Table time; this device's own until the first answer. */
  now(): number {
    return this.ports.local() + (this.offset ?? 0);
  }

  /** Whether an answer has come: until then `now` is only this device's own clock. */
  get known(): boolean {
    return this.offset !== null;
  }

  /** At least `count` exchanges from now on, one after the other. */
  measure(count: number = JOIN_SAMPLES): void {
    if (this.stopped) return;
    this.left = Math.max(this.left, count);
    if (this.asked === null) this.next();
  }

  heard(t1: number, t2: number): void {
    if (t1 !== this.asked) return;
    this.asked = null;
    this.clearAnswerTimer();
    this.samples = [...this.samples, { t1, t2, t4: this.ports.local() }].slice(-JOIN_SAMPLES);
    this.offset = estimateClockOffset(this.samples) ?? this.offset;
    this.next();
  }

  /** The socket is gone: what was asked will not be answered, and a new one measures anew. */
  linkLost(): void {
    this.asked = null;
    this.left = 0;
    this.clearAnswerTimer();
  }

  /** Bursts run only while this says so. */
  setPlaying(playing: boolean): void {
    if (playing === (this.burstTimer !== null) || this.stopped) return;
    if (playing) this.scheduleBurst();
    else this.clearBurstTimer();
  }

  stop(): void {
    this.stopped = true;
    this.linkLost();
    this.clearBurstTimer();
  }

  private next(): void {
    if (this.left <= 0) return;
    const t1 = this.ports.local();
    if (!this.ports.send(t1)) {
      this.left = 0;
      return;
    }
    this.left -= 1;
    this.asked = t1;
    this.answerTimer = this.ports.setTimer(() => {
      this.answerTimer = null;
      this.asked = null;
      this.next();
    }, ANSWER_LIMIT_MS);
  }

  private scheduleBurst(): void {
    const toSlot = BURST_EVERY_MS - (((this.now() % BURST_EVERY_MS) + BURST_EVERY_MS) % BURST_EVERY_MS);
    // A burst may move the clock back past the slot it fell on, which is no reason for another.
    const wait = toSlot < BURST_EVERY_MS / 2 ? toSlot + BURST_EVERY_MS : toSlot;
    this.burstTimer = this.ports.setTimer(() => {
      this.burstTimer = null;
      this.measure(BURST_SAMPLES);
      this.scheduleBurst();
    }, wait);
  }

  private clearAnswerTimer(): void {
    if (this.answerTimer !== null) this.ports.clearTimer(this.answerTimer);
    this.answerTimer = null;
  }

  private clearBurstTimer(): void {
    if (this.burstTimer !== null) this.ports.clearTimer(this.burstTimer);
    this.burstTimer = null;
  }
}
