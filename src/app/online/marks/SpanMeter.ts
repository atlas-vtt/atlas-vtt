import { MAX_LASER_SPAN_MS } from '../protocol/index.ts';

/**
 * Measures the span a sender tells with a message about a pointer: whole milliseconds from the
 * sample its last message ended on to its newest. The spans told add up to the time that passed,
 * whatever each one's rounding, so a receiver's timeline keeps step with the sender's clock.
 */
export class SpanMeter {
  private movedAt: number | null = null;
  /** The moment the last message ended on, in whole milliseconds after the first. */
  private toldAt: number | null = null;

  /** The pointer has a new sample at `now` (ms). */
  moved(now: number): void {
    this.movedAt = now;
  }

  /** The span of the message being sent; none while there is no earlier message to measure from. */
  take(): number | undefined {
    const { movedAt, toldAt } = this;
    if (movedAt === null) return undefined;
    if (toldAt === null) {
      this.toldAt = movedAt;
      return undefined;
    }
    const passed = Math.max(0, Math.round(movedAt - toldAt));
    const span = Math.min(passed, MAX_LASER_SPAN_MS);
    this.toldAt = passed > MAX_LASER_SPAN_MS ? movedAt : toldAt + span;
    return span;
  }

  /** What comes next is another pointer's path: its first message tells no span. */
  reset(): void {
    this.movedAt = null;
    this.toldAt = null;
  }
}
