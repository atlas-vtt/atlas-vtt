import type { TableSound } from '../sound/soundTypes';
import { applyDueListChange, EMPTY_MIX, type MixTiming, type SoundMix } from './soundMix';
import type { SoundOutput } from './soundOutput';
import type { SoundShelf } from './soundShelf';
import { LEAVE_DRIFT_MS } from '../sound/engine/soundVoice';
import { isPlaying, OFFLINE_LEAD_MS, onShiftedClock } from './tableSound';
import type { TableClock } from './tableClock';

const PULSE_MS = 250;
const WATCH_EVERY_PULSES = 4;
/** A list change is taken in this long before its track ends, or twice the lead where that is longer. */
const LIST_CHANGE_AHEAD_MS = 1000;

const OFFLINE_CLOCK: TableClock = { now: () => Date.now(), leadMs: OFFLINE_LEAD_MS };

function keysOf(table: TableSound): Set<string> {
  const sounds = [...(table.music?.tracks ?? []), ...table.outgoing.flatMap((play) => play.tracks), ...table.layers.map((play) => play.sound), ...table.outgoingLayers.map((play) => play.sound)];
  return new Set(sounds.map((sound) => sound.key));
}

export interface SoundTableHost {
  fadeMs(): number;
  /** Something is previewed: the context must stay though the table is quiet. */
  isPreviewing(): boolean;
  onMix(mix: SoundMix, tableChanged: boolean): void;
  onWaitingKeys(keys: readonly string[]): void;
}

/** The mix and the clock it runs on, on a timer of its own that runs only while something plays. */
export class SoundTable {
  private current: SoundMix = EMPTY_MIX;
  private tableClock: TableClock = OFFLINE_CLOCK;
  private timer: number | null = null;
  private pulses = 0;
  private waitingKeys = '';

  constructor(
    private readonly output: SoundOutput,
    private readonly shelf: SoundShelf,
    private readonly host: SoundTableHost,
  ) {}

  get mix(): SoundMix {
    return this.current;
  }

  get clock(): TableClock {
    return this.tableClock;
  }

  now(): number {
    return this.tableClock.now();
  }

  /** Another clock: what plays stays at its position, or a GM's clock minutes ahead of the table's would leave everyone minutes of silence. */
  useClock(clock: TableClock | null): void {
    const next = clock ?? OFFLINE_CLOCK;
    const deltaMs = next.now() - this.tableClock.now();
    this.tableClock = next;
    if (Math.abs(deltaMs) >= LEAVE_DRIFT_MS) this.clockStepped(deltaMs);
  }

  /** The clock itself jumped by this much: its first answer from the table, on a machine whose own clock is off. */
  clockStepped(deltaMs: number): void {
    const { table } = this.current;
    if (table.silenced || table.music || table.layers.length > 0 || table.outgoing.length > 0 || table.outgoingLayers.length > 0) this.commit({ ...this.current, table: onShiftedClock(table, deltaMs) });
  }

  timing(): MixTiming {
    return { now: this.now(), leadMs: this.tableClock.leadMs, fadeMs: this.host.fadeMs() };
  }

  commit(next: SoundMix): void {
    if (next === this.current) return;
    const tableChanged = next.table !== this.current.table;
    this.current = next;
    if (tableChanged) {
      this.output.setState(next.table);
      this.shelf.pinOnly(keysOf(next.table));
    }
    if (this.isBusy()) this.keepPulsing();
    this.host.onMix(next, tableChanged);
  }

  keepPulsing(): void {
    this.timer ??= window.setInterval(() => this.pulse(), PULSE_MS);
  }

  /** At once, for an unload: nothing fades. */
  shut(): void {
    this.stopPulsing();
    this.output.close();
    this.current = EMPTY_MIX;
  }

  private isBusy(): boolean {
    const { table, waitingMusic, waitingLayers } = this.current;
    return isPlaying(table, this.now()) || waitingMusic !== null || waitingLayers.length > 0;
  }

  private stopPulsing(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private pulse(): void {
    this.output.tick();
    this.commit(applyDueListChange(this.current, this.now(), Math.max(LIST_CHANGE_AHEAD_MS, this.tableClock.leadMs * 2)));
    this.pulses++;
    if (this.pulses % WATCH_EVERY_PULSES !== 0) return;
    void this.output.check();
    const waitingKeys = this.output.waitingKeys();
    if (waitingKeys.join() !== this.waitingKeys) {
      this.waitingKeys = waitingKeys.join();
      this.host.onWaitingKeys(waitingKeys);
    }
    if (!this.isBusy() && !this.host.isPreviewing()) {
      this.stopPulsing();
      this.output.close();
    }
  }
}
