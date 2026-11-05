import { Pacer } from '../../marks/index.ts';
import { parsePlayerSoundState, isRecord, type GmMessage, type PlayerSoundState } from '../../protocol/index.ts';
import { SOFT_DRIFT_MS } from '../../../sound/engine/soundVoice';
import { JOIN_SAMPLES, TableClockSync } from '../../../sound/engine/tableClockSync';
import type { GrowingCopy } from '../../../sound/codec/growingCopy';
import type { Mood, SoundBytes, SoundInfo, SoundRecord, TableSound } from '../../../sound/soundTypes';
import type { SoundSnapshot } from '../../../soundDirector/soundSnapshot';
import { stopAll } from '../../../soundDirector/liveEdits';
import type { AudienceLine, PlayersCopy, PlayersSounds, TableClock } from '../../../soundDirector/tableClock';
import { EMPTY_TABLE_SOUND, isPlaying } from '../../../soundDirector/tableSound';
import { ASSET_USES } from '../assets/assetUses.ts';
import type { CopyState } from '../assets/uploadQueue.ts';
import type { Timers } from '../companionTimers.ts';
import { SoundAudience } from './soundAudience.ts';
import { SoundOffers } from './soundOffers.ts';
import { SoundRefs, type SoundRefsPorts } from './soundRefs.ts';
import { keysOfState, wireState } from './soundWire.ts';

/** How far ahead a change begins online, so that the state has reached every page in time. */
const ONLINE_LEAD_MS = 1000;
/** A moving fader sends about four states a second, and always the last. */
export const SOUND_SEND_MS = 250;
/** The Sound page hears how uploads go at most this often. */
const COPIES_SHOWN_MS = 500;
/** What players hear when this device stops sending. */
const SEND_OFF_FADE_MS = 1500;

/** What the share reads of the app's `SoundDirector`, its seams for a table online. */
export interface ShareDirector {
  readonly isOn: boolean;
  snapshot(): Pick<SoundSnapshot, 'mix' | 'shelfRevision'>;
  subscribe(listener: () => void): () => void;
  onStateChanged(listener: (state: TableSound) => void): () => void;
  useTableClock(clock: TableClock | null): void;
  tableClockStepped(deltaMs: number): void;
  useAudience(audience: AudienceLine | null): void;
  readonly players: {
    use(sounds: PlayersSounds | null): void;
    moods(): readonly Mood[];
    sceneMoods(scenePath: string): Promise<Mood[]>;
  };
  readonly shelf: {
    /** Only a stored, whole copy. */
    storedBytes(key: string): Promise<SoundBytes>;
    /** A copy while it is made: it goes up in segments as it grows. */
    growingOf(key: string): GrowingCopy | null;
    infoOf(record: SoundRecord): SoundInfo | null;
    recordOfKey(key: string): SoundRecord | null;
    recordsOf(mix: Pick<Mood, 'music' | 'layers'>): SoundRecord[];
    request(records: readonly SoundRecord[]): void;
  };
}

export interface SoundSharePorts extends Pick<SoundRefsPorts, 'copyRef' | 'segmentsRef' | 'segmentsTaken'> {
  readonly director: ShareDirector;
  readonly timers: Timers;
  send(body: GmMessage, to?: string): void;
  /** One time exchange past the queue; false where it cannot go. */
  sendTime(t1: number): boolean;
  connected(): readonly string[];
  /** A player's name at the table, for the audience's tooltip; null where none is known. */
  nameOf?(player: string): string | null;
  copyState(id: string): CopyState;
  presentedPath(): string | null;
  onPresentedChange(listener: () => void): () => void;
  /** This device's switch. */
  loadSending(): boolean;
  saveSending(on: boolean): void;
  /** The first upload of this device was just noticed; the owner of the note decides whether it says it. */
  uploadsBegan(): void;
  /** What pages last told, as `rememberHeard` kept it before a reload of the plugin; none where nothing was kept. */
  recallHeard?(): ReadonlyArray<readonly [string, PlayerSoundState]>;
  rememberHeard?(pages: ReadonlyArray<readonly [string, PlayerSoundState]>): void;
}

/**
 * A table's sound for its players while one runs, the sound switch is on and this device sends it: every
 * change of the director's state as one small message, on one clock with the table, and the sounds it
 * names in the store, with whoever hears it told back to the Sound page. It binds to the director's seams
 * and owns nothing that plays: taking it away leaves the GM's own sound as it was.
 */
export class TableSoundShare implements PlayersSounds {
  private readonly clock: TableClockSync;
  private readonly refs: SoundRefs;
  private readonly offers: SoundOffers;
  private readonly pacer: Pacer;
  private readonly copiesPacer: Pacer;
  private readonly audience: SoundAudience;
  private readonly copyListeners = new Set<() => void>();
  private stops: Array<() => void> = [];
  private stopState: (() => void) | null = null;
  private attached = false;
  private on: boolean;
  private shelfRevision = -1;
  private moodId: string | null = null;
  private lastSent: GmMessage | null = null;
  private lastKey = '';
  /** How many sounds the audience line last counted, and whether stopped: it is told again when that changes, not only when a page tells. */
  private audienceCounted = '';

  constructor(private readonly ports: SoundSharePorts) {
    this.on = ports.loadSending();
    const { director, timers } = ports;
    this.clock = new TableClockSync({ local: () => Date.now(), send: (t1) => ports.sendTime(t1), setTimer: (run, ms) => timers.setTimer(run, ms), clearTimer: (timer) => timers.clearTimer(timer) });
    this.refs = new SoundRefs({
      bytes: (key) => director.shelf.storedBytes(key),
      growing: (key) => director.shelf.growingOf(key),
      copyRef: (copy, read, use, handed) => ports.copyRef(copy, read, use, handed),
      segmentsRef: (key, codecVersion, segments, use, handed) => ports.segmentsRef(key, codecVersion, segments, use, handed),
      segmentsTaken: () => ports.segmentsTaken?.() ?? true,
    });
    this.offers = new SoundOffers({
      refs: this.refs,
      send: (body, to) => ports.send(body, to),
      presentedPath: () => ports.presentedPath(),
      sceneMoods: (path) => director.players.sceneMoods(path),
      moods: () => director.players.moods(),
      activeMood: () => director.snapshot().mix.mood,
      recordsOf: (mood) => director.shelf.recordsOf(mood),
      copyKey: (record) => this.copyKey(record),
    });
    this.audience = new SoundAudience({
      connected: () => ports.connected(),
      soundsPlaying: () => (isPlaying(this.table(), this.clock.now()) ? keysOfState(this.table()).length : 0),
      uploading: () => this.uploading(),
      stopped: () => this.table().silenced,
      nameOf: (player) => ports.nameOf?.(player) ?? null,
    }, ports.recallHeard?.() ?? [], (pages) => ports.rememberHeard?.([...pages]));
    this.pacer = new Pacer(timers, SOUND_SEND_MS, () => this.flush());
    this.copiesPacer = new Pacer(timers, COPIES_SHOWN_MS, () => {
      if (this.uploading() > 0) ports.uploadsBegan();
      this.audience.changed();
      for (const listener of [...this.copyListeners]) listener();
    });
  }

  get sending(): boolean {
    return this.on;
  }

  start(): void {
    const { director } = this.ports;
    this.stops = [director.subscribe(() => this.directorChanged()), this.ports.onPresentedChange(() => this.attached && void this.offers.refresh())];
    director.players.use(this);
    this.directorChanged();
  }

  stop(): void {
    // Kept fresh as the share goes, so a reload finds it however long ago a page last told anything.
    this.audience.keep();
    for (const stop of this.stops) stop();
    this.stops = [];
    this.detach(false);
    this.ports.director.players.use(null);
    this.clock.stop();
    this.pacer.cancel();
    this.copiesPacer.cancel();
  }

  /** The relay welcomed the GM: the clock is measured anew, and every page is told the state as it is. */
  welcome(): void {
    if (!this.attached) return;
    this.clock.measure(JOIN_SAMPLES);
    void this.offers.refresh();
  }

  /** The socket is gone. */
  linkLost(): void {
    this.clock.linkLost();
  }

  /** An answer can move the clock by what this device's clock is off, far past what a voice corrects by itself. What moves it less is the answers settling, which voices follow on a median. */
  heardTime(t1: number, t2: number): void {
    const before = this.clock.now();
    this.clock.heard(t1, t2);
    const step = this.clock.now() - before;
    if (this.attached && Math.abs(step) > SOFT_DRIFT_MS) this.ports.director.tableClockStepped(step);
  }

  /** To one who came, or everyone; while nothing plays too, so a page has the clock before the first mood. */
  resend(to?: string): void {
    if (!this.attached) return;
    this.ports.send(this.lastSent ?? { t: 'sound', state: wireState(EMPTY_TABLE_SOUND, () => ({ key: '' })) }, to);
    this.offers.resend(to);
  }

  playerLeft(player: string): void {
    this.audience.left(player);
  }

  receive(from: string, body: unknown): boolean {
    if (!isRecord(body) || body.t !== 'sound-state') return false;
    const state = parsePlayerSoundState(body);
    if (state !== null) this.audience.take(from, state);
    return true;
  }

  /** What the store said may have changed: what it would not keep is asked for again. */
  refreshAssets(): void {
    this.refs.forgetRefused();
    this.pacer.request();
    this.copiesPacer.request();
  }

  storeChanged(): void {
    this.copiesPacer.request();
  }

  copyOf(record: SoundRecord): PlayersCopy {
    const key = this.ports.director.shelf.infoOf(record)?.key;
    const ref = key === undefined ? undefined : this.refs.known(key);
    return ref ? this.ports.copyState(ref.id) : { state: 'nowhere' };
  }

  prepare(sounds?: readonly SoundRecord[]): void {
    this.offers.prepare(sounds);
  }

  setSending(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.ports.saveSending(on);
    this.directorChanged();
    for (const listener of [...this.copyListeners]) listener();
  }

  onChange(listener: () => void): () => void {
    this.copyListeners.add(listener);
    return () => this.copyListeners.delete(listener);
  }

  private table(): TableSound {
    return this.ports.director.snapshot().mix.table;
  }

  private copyKey(record: SoundRecord): string | null {
    const { shelf } = this.ports.director;
    const key = shelf.infoOf(record)?.key ?? null;
    if (key === null) shelf.request([record]);
    return key;
  }

  private uploading(): number {
    return this.refs.keys().filter((key) => {
      const ref = this.refs.known(key);
      return ref && this.ports.copyState(ref.id).state === 'uploading';
    }).length;
  }

  private directorChanged(): void {
    const { director } = this.ports;
    const wanted = director.isOn && this.on;
    if (wanted !== this.attached) {
      if (wanted) this.attach();
      else this.detach(true);
    }
    if (!this.attached) return;
    const { shelfRevision, mix } = director.snapshot();
    if (shelfRevision !== this.shelfRevision) {
      this.shelfRevision = shelfRevision;
      this.offers.shelfChanged();
      this.copiesPacer.request();
    }
    if ((mix.mood?.id ?? null) !== this.moodId) {
      this.moodId = mix.mood?.id ?? null;
      void this.offers.refresh();
    }
    this.clock.setPlaying(isPlaying(mix.table, this.clock.now()));
    const counted = `${isPlaying(mix.table, this.clock.now()) ? keysOfState(mix.table).length : 0}|${mix.table.silenced}`;
    if (counted !== this.audienceCounted) {
      this.audienceCounted = counted;
      this.audience.changed();
    }
  }

  private attach(): void {
    const { director } = this.ports;
    this.attached = true;
    director.useTableClock({ now: () => this.clock.now(), leadMs: ONLINE_LEAD_MS });
    director.useAudience(this.audience);
    this.stopState = director.onStateChanged(() => this.pacer.request());
    this.clock.measure(JOIN_SAMPLES);
    this.pacer.request();
    void this.offers.refresh();
  }

  /** `tell`: players hear the sound go, as they would on this side; a table that ended tells nobody. */
  private detach(tell: boolean): void {
    if (!this.attached) return;
    this.attached = false;
    this.stopState?.();
    this.stopState = null;
    this.clock.setPlaying(false);
    const { director } = this.ports;
    if (tell) this.sendWire(stopAll(this.table(), this.clock.now(), SEND_OFF_FADE_MS));
    director.useTableClock(null);
    director.useAudience(null);
    this.lastSent = null;
    this.lastKey = '';
  }

  private flush(): void {
    if (!this.attached) return;
    const table = this.table();
    // A sound only staged ahead has a reference players were never handed: offered again as handed, or its progress never reaches them.
    const missing = keysOfState(table).filter((key) => this.refs.known(key) === undefined || (this.refs.known(key) !== null && !this.refs.handed(key)));
    if (missing.length > 0) {
      // The state goes as soon as what it names has a reference: it holds its own start, so a page joins it in its place.
      void Promise.all(missing.map((key) => this.refs.ensure(key, ASSET_USES.audio, true))).then(() => this.pacer.request());
      return;
    }
    this.clock.setPlaying(isPlaying(table, this.clock.now()));
    this.sendWire(table);
    this.copiesPacer.request();
  }

  private sendWire(table: TableSound): void {
    const state = wireState(table, (key) => ({ key: this.refs.wireKey(key), asset: this.refs.known(key) ?? undefined }));
    const text = JSON.stringify(state);
    if (text === this.lastKey) return;
    this.lastKey = text;
    this.lastSent = { t: 'sound', state };
    this.ports.send(this.lastSent);
  }
}
