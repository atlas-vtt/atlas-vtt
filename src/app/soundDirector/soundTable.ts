import { LEAVE_DRIFT_MS } from '../sound/engine/soundVoice';
import type { TableSound } from '../sound/soundTypes';
import { soundingTrack } from './musicList';
import { notePlayed } from './playedTracks';
import { EMPTY_MIX, withStopStillMeant, type MixTiming, type SoundMix } from './soundMix';
import { pauseOnShiftedClock, withPauseStillMeant } from './musicPause';
import type { SoundOutput } from './soundOutput';
import type { SoundShelf } from './soundShelf';
import { applyDueListChange } from './trackEnd';
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
  crossfadeMs(): number;
  /** Something is previewed: the context must stay though the table is quiet. */
  isPreviewing(): boolean;
  onMix(mix: SoundMix, tableChanged: boolean): void;
  onWaitingKeys(keys: readonly string[]): void;
  onPlayed(keys: readonly string[]): void;
}

/** The mix and the clock it runs on, on a timer of its own that runs only while something plays. */
export class SoundTable {
  private current: SoundMix = EMPTY_MIX;
  private tableClock: TableClock = OFFLINE_CLOCK;
  private timer: number | null = null;
  private pulses = 0;
  private waitingKeys = '';
  /** Presses still on their way to a commit: what they opened stands until then. */
  private holds = 0;
  private soundingKey: string | null = null;
  private played: readonly string[] = [];

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
    const { table, paused } = this.current;
    if (table.silenced || table.music || table.layers.length > 0 || table.outgoing.length > 0 || table.outgoingLayers.length > 0 || paused) {
      this.commit({ ...this.current, table: onShiftedClock(table, deltaMs), ...(paused && { paused: pauseOnShiftedClock(paused, deltaMs) }) });
    }
  }

  timing(): MixTiming {
    return { now: this.now(), leadMs: this.tableClock.leadMs, fadeMs: this.host.fadeMs() };
  }

  commit(asked: SoundMix): void {
    const next = withPauseStillMeant(withStopStillMeant(asked, this.now()));
    if (next === this.current) return;
    const tableChanged = next.table !== this.current.table;
    this.current = next;
    if (tableChanged) {
      // A press holds what it opened; anything else that begins to sound opens it here.
      if (!this.output.isOpen && isPlaying(next.table, this.now())) this.output.ensureRunning();
      this.output.setState(next.table);
      // A paused list keeps its copies: it resumes from them.
      const pinned = keysOf(next.table);
      for (const track of next.paused?.play.tracks ?? []) pinned.add(track.key);
      this.shelf.pinOnly(pinned);
    }
    if (this.isBusy()) this.keepPulsing();
    this.host.onMix(next, tableChanged);
  }

  keepPulsing(): void {
    this.timer ??= window.setInterval(() => this.pulse(), PULSE_MS);
  }

  /** The context stands until the result is called; a pulse then closes it if the press came to nothing. */
  hold(): () => void {
    this.holds++;
    this.keepPulsing();
    let held = true;
    return () => {
      if (held) this.holds--;
      held = false;
    };
  }

  /** At once, for an unload: nothing fades. */
  shut(): void {
    this.stopPulsing();
    this.output.close();
    this.current = EMPTY_MIX;
  }

  private isBusy(): boolean {
    const { table, waitingMusic, waitingLayers } = this.current;
    return isPlaying(table, this.now()) || [...(waitingMusic?.tracks ?? []), ...waitingLayers.map((layer) => layer.sound)].some((id) => this.shelf.mayCome(id));
  }

  /** What has played this session, in memory and on this side alone; a list goes on by itself, so the clock tells. */
  private noteSounding(): void {
    const key = soundingTrack(this.current.table, this.now())?.key ?? null;
    if (key === this.soundingKey) return;
    if (this.soundingKey !== null) {
      this.played = notePlayed(this.played, this.soundingKey);
      this.host.onPlayed(this.played);
    }
    this.soundingKey = key;
  }

  private stopPulsing(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private pulse(): void {
    this.output.tick();
    const { leadMs } = this.tableClock;
    this.commit(applyDueListChange(this.current, this.now(), Math.max(LIST_CHANGE_AHEAD_MS, leadMs * 2), { leadMs, crossfadeMs: this.host.crossfadeMs() }));
    this.noteSounding();
    this.pulses++;
    if (this.pulses % WATCH_EVERY_PULSES !== 0) return;
    void this.output.check();
    const waitingKeys = this.output.waitingKeys();
    if (waitingKeys.join() !== this.waitingKeys) {
      this.waitingKeys = waitingKeys.join();
      this.host.onWaitingKeys(waitingKeys);
    }
    if (this.holds === 0 && !this.isBusy() && !this.host.isPreviewing()) {
      this.stopPulsing();
      this.output.close();
    }
  }
}
