import type { GestureClock } from '../../../src/app/pixi/input/gestureTypes';

/** Time a test moves by hand: timers run in order as `advance` passes them. */
export class FakeClock implements GestureClock {
  private time = 0;
  private nextId = 1;
  private timers: Array<{ id: number; at: number; run: () => void }> = [];

  now(): number {
    return this.time;
  }

  setTimeout(run: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.push({ id, at: this.time + ms, run });
    return id;
  }

  clearTimeout(id: number): void {
    this.timers = this.timers.filter((timer) => timer.id !== id);
  }

  advance(ms: number): void {
    const until = this.time + ms;
    for (;;) {
      const due = this.timers.filter((timer) => timer.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((timer) => timer !== due);
      this.time = due.at;
      due.run();
    }
    this.time = until;
  }

  /**
   * The thread is held up for `ms`: the timers that fell due meanwhile run when it is free again,
   * and what they set, like anything else that waited, has its turn after them.
   */
  holdUp(ms: number): void {
    this.time += ms;
    const due = this.timers.filter((timer) => timer.at <= this.time).sort((a, b) => a.at - b.at);
    for (const timer of due) {
      if (!this.timers.includes(timer)) continue;
      this.timers = this.timers.filter((other) => other !== timer);
      timer.run();
    }
  }
}
