import type { Timers } from '../../../src/app/utils/workerTimers';

/** Lets every promise that waits only on others settle. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** A clock the test moves; timers fire in order as it passes them. */
export class ManualTimers implements Timers {
  private time = 0;
  private next = 1;
  private readonly due = new Map<number, { at: number; run: () => void }>();

  now(): number {
    return this.time;
  }

  setTimer(run: () => void, ms: number): number {
    const id = this.next++;
    this.due.set(id, { at: this.time + ms, run });
    return id;
  }

  clearTimer(id: number): void {
    this.due.delete(id);
  }

  get pending(): number {
    return this.due.size;
  }

  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    for (;;) {
      await settle();
      const [id, timer] = [...this.due].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
      if (id === undefined || timer === undefined || timer.at > end) break;
      this.due.delete(id);
      this.time = timer.at;
      timer.run();
    }
    this.time = end;
    await settle();
  }
}
