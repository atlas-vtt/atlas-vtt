import type { PlayerInfo } from '../protocol/index.ts';
import { ARM_MS } from '../gm/armedCards.ts';
import type { Timers } from '../gm/companionTimers.ts';
import type { GateEvents } from '../gm/TableConnection.ts';

/** A device that waits to be let in, as the GM is asked about it. */
export interface Knock {
  readonly id: string;
  readonly name: string;
  /** The four digits the device shows too; null until worked out. */
  readonly check: string | null;
  /**
   * The prompt has stood for `ARM_MS` with its number: until then it takes no answer, so a press meant
   * for something else in the moment a knock appears never lets a device in.
   */
  readonly armed: boolean;
}

/**
 * The devices that wait, in the order they knocked; the GM is asked about one at a time, the first.
 * Each knock's check number comes from the link's key and the relay's id for the knock (`check`).
 */
export class GmScreenKnocks {
  private list: Knock[] = [];
  private arming: number | null = null;
  private run = 0;

  constructor(private readonly timers: Timers, private readonly check: (id: string) => Promise<string>, private readonly changed: () => void) {}

  /**
   * The room's gate as its connection tells it, heard while it is `live`: everyone is asked about;
   * `full` hears of a device let in while every seat was taken.
   */
  gate(live: () => boolean, full: (id: string) => void): GateEvents {
    return {
      frame: () => ({ code: null, ask: true }),
      welcomed: (waiting) => live() && this.reset(waiting),
      knocked: (player) => live() && this.add(player),
      gone: (id, isFull) => {
        if (!live()) return;
        this.remove(id);
        if (isFull) full(id);
      },
      paused: () => undefined,
    };
  }

  /** The knock the GM is asked about now. */
  get first(): Knock | null {
    return this.list[0] ?? null;
  }

  get count(): number {
    return this.list.length;
  }

  /** The relay's welcome: who waits now. */
  reset(waiting: readonly PlayerInfo[]): void {
    this.list = [];
    this.disarm();
    for (const player of waiting) this.add(player);
    this.changed();
  }

  add(player: PlayerInfo): void {
    if (this.list.some((knock) => knock.id === player.id)) return;
    this.list.push({ id: player.id, name: player.name, check: null, armed: false });
    const run = this.run;
    void this.check(player.id).then((check) => {
      if (run !== this.run) return;
      this.update(player.id, { check });
      this.arm();
    });
    this.changed();
  }

  /** The knock of `id`, taken off the list where the GM may answer it now; null otherwise. */
  take(id: string): Knock | null {
    const knock = this.first;
    if (knock === null || knock.id !== id || !knock.armed) return null;
    this.remove(id);
    return knock;
  }

  remove(id: string): void {
    const wasFirst = this.first?.id === id;
    const before = this.list.length;
    this.list = this.list.filter((knock) => knock.id !== id);
    if (this.list.length === before) return;
    if (wasFirst) {
      this.disarm();
      this.arm();
    }
    this.changed();
  }

  clear(): void {
    this.run += 1;
    this.list = [];
    this.disarm();
    this.changed();
  }

  private update(id: string, fields: Partial<Knock>): void {
    this.list = this.list.map((knock) => (knock.id === id ? { ...knock, ...fields } : knock));
    this.changed();
  }

  /** Starts the first knock's time once its number is known. */
  private arm(): void {
    const first = this.first;
    if (first === null || first.check === null || first.armed || this.arming !== null) return;
    this.arming = this.timers.setTimer(() => {
      this.arming = null;
      if (this.first?.id === first.id) this.update(first.id, { armed: true });
    }, ARM_MS);
  }

  private disarm(): void {
    if (this.arming !== null) this.timers.clearTimer(this.arming);
    this.arming = null;
  }
}
