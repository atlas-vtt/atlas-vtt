import type { App } from 'obsidian';
import { t } from '../i18n';
import type { LocalLevels } from '../sound/engine/mixerGraph';
import type { Mood, SoundRecord, TableSound } from '../sound/soundTypes';
import { moodAfter } from '../soundLibrary/moodOrdering';
import { loadLastMix, type LastMix, type StoredOutput } from './deviceFacts';
import { noteDirector, openedDirector } from './directorRegistry';
import { LastMixKeeper } from './lastMixKeeper';
import { OutputChoice } from './outputChoice';
import { PlayersSeam } from './playersSeam';
import { SoundPreview } from './soundPreview';
import { realDirectorDeps, type SoundDirectorDeps } from './directorDeps';
import type { FightStore } from './fightWatch';
import { MixDesk } from './mixDesk';
import { TableFights } from './tableFights';
import { EMPTY_MIX, type SoundMix } from './soundMix';
import { SoundOutput } from './soundOutput';
import { SoundShelf } from './soundShelf';
import type { SoundSnapshot } from './soundSnapshot';
import { SoundTable } from './soundTable';
import { stopFade } from './tableSound';
import { stopAll } from './liveEdits';
import type { AudienceLine, TableClock } from './tableClock';

const SHELF_AFTER_FADE_MS = 500;

/**
 * The owner of a table's sound: one per app, from the plugin's load to its unload. It holds the context,
 * the mix and the queue of copies and runs on its own timer, so it outlives the DM screen, tabs, maps and
 * popouts; everything else only sends it intents. What plays lives here, in memory: in no scene, no
 * history and no file, but for the device's note of what to offer back.
 */
export class SoundDirector {
  static forApp(app: App): SoundDirector {
    let director = openedDirector(app);
    if (!director) {
      director = new SoundDirector(realDirectorDeps(app));
      noteDirector(app, director);
    }
    return director;
  }

  static release(app: App): void {
    openedDirector(app)?.destroy();
    noteDirector(app, null);
  }

  readonly desk: MixDesk;
  readonly shelf: SoundShelf;
  /** A table online, while one runs. */
  readonly players: PlayersSeam;
  private readonly output: SoundOutput;
  private readonly table: SoundTable;
  private readonly fights: TableFights;
  private current: SoundSnapshot = { mix: EMPTY_MIX, levels: { musicDb: 0, ambienceDb: 0, masterDb: 0 }, lifecycle: 'off', lastMix: null, previewing: null, output: null, audience: null, audienceDetail: null, waitingKeys: [], played: [], shelfRevision: 0, playersRevision: 0 };
  private readonly listeners = new Set<() => void>();
  private readonly stateListeners = new Set<(state: TableSound) => void>();
  private stops: Array<() => void> = [];
  private on = false;
  private closeShelf = 0;
  private readonly lastMix: LastMixKeeper;
  private readonly choice: OutputChoice;
  private readonly previews: SoundPreview;
  private readonly dropSettings: () => void;

  constructor(private readonly deps: SoundDirectorDeps) {
    this.output = new SoundOutput({
      createContext: () => deps.createContext(),
      tableNow: () => this.table.now(),
      resolve: (key) => this.shelf.bytes(key),
      levels: () => this.current.levels,
      onSoundError: (key, error) => this.shelf.copyFailed(key, error),
      onLifecycle: (lifecycle) => this.publish({ lifecycle }),
      wait: (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); }),
    });
    this.shelf = new SoundShelf(deps, (record, reason) => deps.notify(t('audio.refusedNotice', { name: record.name, reason: t(`audio.refused.${reason}`), next: t(`audio.refusedNext.${reason}`) })), (key) => this.output.forgetSource(key));
    this.table = new SoundTable(this.output, this.shelf, {
      fadeMs: () => this.fadeSeconds() * 1000,
      crossfadeMs: () => this.crossfadeMs(),
      isPreviewing: () => this.current.previewing !== null,
      onMix: (mix, tableChanged) => this.onMix(mix, tableChanged),
      onWaitingKeys: (waitingKeys) => this.publish({ waitingKeys }),
      onPlayed: (played) => this.publish({ played }),
    });
    this.desk = new MixDesk(this.table, this.shelf, this.output, { isOn: () => this.on, fadeSeconds: () => this.fadeSeconds(), moods: deps.moods });
    this.fights = new TableFights(deps, {
      isOn: () => this.on,
      activeMoodId: () => this.table.mix.mood?.id ?? null,
      play: (mood) => this.desk.playMix({ id: mood.id }, mood, false),
      snapshot: () => this.lastMixNow(),
      restore: (last) => this.desk.playMix(last.mood, { ...last.mix, fadeSeconds: this.fadeSeconds() }, false),
    });
    this.lastMix = new LastMixKeeper(deps.storage, () => (this.on && this.isHeld() ? this.lastMixNow() : null));
    this.choice = new OutputChoice(deps.storage, (message) => deps.notify(message));
    this.previews = new SoundPreview(this.output, this.shelf, this.table, (previewing) => this.publish({ previewing }));
    this.players = new PlayersSeam(deps, () => this.publish({ playersRevision: this.current.playersRevision + 1 }));
    this.dropSettings = deps.settings.onChange(() => this.sync());
    this.sync();
  }

  get isOn(): boolean { return this.on; }

  snapshot(): SoundSnapshot { return this.current; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Seam for a table online: every new state of the table. A preview is never one. */
  onStateChanged(listener: (state: TableSound) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Seam for a table online: the clock it runs on; null goes back to this machine's own. */
  useTableClock(clock: TableClock | null): void {
    this.table.useClock(clock);
  }

  /** Seam for a table online: the clock it gave has jumped by this much. */
  tableClockStepped(deltaMs: number): void {
    this.table.clockStepped(deltaMs);
  }

  /** Seam for a table online: who hears it, in one line. */
  useAudience(audience: AudienceLine | null): void {
    this.players.useAudience(audience, (line, detail) => this.publish({ audience: line, audienceDetail: detail }));
  }

  now(): number { return this.table.now(); }

  crossfadeMs(): number {
    return this.deps.settings.getSoundSettings().crossfadeSeconds * 1000;
  }

  joinView(viewId: string, store: FightStore): void { this.fights.join(viewId, store); }

  leaveView(viewId: string): void { this.fights.leave(viewId); }

  /** A mood the GM pressed: it stands until the table next changes scene or fight. */
  press(mood: Mood): void {
    this.fights.follow.manualPress();
    this.desk.playMix({ id: mood.id }, mood, true);
  }

  /** The mood after the one playing; the first where none is. */
  pressNext(): void {
    const next = moodAfter(this.deps.moods.moods(), this.table.mix.mood?.id ?? null);
    if (next) this.press(next);
  }

  /** Ends the mix, with nothing left to bring back. */
  stop(): void {
    this.fights.follow.manualPress();
    this.desk.stop();
    this.lastMix.forget();
    this.publish({ lastMix: null });
  }

  /** Brings back what played before the restart. */
  resume(): void {
    const last = this.current.lastMix;
    if (!last) return;
    this.desk.playMix(last.mood, last.mix, true);
    this.publish({ lastMix: null });
  }

  /** The GM's press after the context would not start by itself. */
  tap(): void { this.output.unlock(); }

  /** The GM's press, for what reaches the mix only after waiting for the disk: unlocks now, inside the gesture, and holds the context until the result is called. */
  holdForPress(): () => void {
    this.tap();
    return this.table.hold();
  }

  /** A sound to the GM alone, in no state anyone else gets. The same sound again, or null, ends it. */
  preview(record: SoundRecord | null): void {
    this.previews.toggle(record);
  }

  /** While the result has not been called, `readMeters` reads real levels. A view that shows none costs nothing. */
  openMeters(): () => void {
    return this.output.openMeters();
  }

  /** The level of each strip now, linear: `music`, `master` and each layer's sound key. */
  readMeters(into: Map<string, number>): void {
    this.output.readMeters(into);
  }

  /** A fader writes through at once; `save` is its release, which reaches the settings. */
  setChannelLevels(changes: Partial<LocalLevels>, save: boolean): void {
    const levels = { ...this.current.levels, ...changes };
    this.output.setLevels(levels);
    this.publish({ levels });
    if (save) this.deps.settings.setSoundSettings(levels);
  }

  /** The output this device plays on; null is the system's default. */
  setOutput(output: StoredOutput | null): void {
    this.choice.choose(output);
    this.publish({ output });
  }

  destroy(): void {
    this.lastMix.flush();
    this.turnOff(true);
    // Switched off softly a moment ago, a fade may still sound and its timer run.
    this.table.shut();
    window.clearTimeout(this.closeShelf);
    this.shelf.close();
    this.dropSettings();
    this.players.useAudience(null, () => undefined);
    this.fights.dispose();
    this.listeners.clear();
    this.stateListeners.clear();
  }

  private fadeSeconds(): number {
    return this.deps.settings.getSoundSettings().fadeSeconds;
  }

  private sync(): void {
    const { musicDb, ambienceDb, masterDb } = this.deps.settings.getSoundSettings();
    this.setChannelLevels({ musicDb, ambienceDb, masterDb }, false);
    const wanted = this.deps.settings.isOn();
    if (wanted === this.on) return;
    if (wanted) this.turnOn();
    else this.turnOff(false);
  }

  private turnOn(): void {
    this.on = true;
    const { deps } = this;
    window.clearTimeout(this.closeShelf);
    this.shelf.close();
    const copies = this.shelf.open();
    this.stops = [
      copies.onChanged(() => this.onCopies()),
      deps.presented.onChange(() => this.fights.follow.presentedChanged()),
      deps.onLibraryChange(() => void this.refreshShelf()),
      deps.onAudioFileChange(() => this.desk.requestWaiting()),
      this.output.watchVisibility(),
    ];
    this.publish({ lastMix: loadLastMix(deps.storage), output: this.choice.apply() });
    void this.refreshShelf();
  }

  /** Switching off fades out and lets go of everything; on an unload there is no time for a fade. */
  private turnOff(atOnce: boolean): void {
    if (!this.on) return;
    this.on = false;
    this.fights.follow.dispose();
    for (const stop of this.stops) stop();
    this.stops = [];
    this.deps.releaseLibrary();
    this.previews.reset();
    this.lastMix.cancel();
    this.choice.release();
    if (atOnce) return;
    const fadeMs = stopFade(this.fadeSeconds() * 1000);
    this.table.commit({ ...EMPTY_MIX, table: stopAll(this.table.mix.table, this.table.now(), fadeMs) });
    // What fades out still reads its copy.
    this.closeShelf = window.setTimeout(() => this.shelf.close(), fadeMs + SHELF_AFTER_FADE_MS);
  }

  private async refreshShelf(): Promise<void> {
    await this.shelf.refresh();
    this.desk.requestWaiting();
    this.publish({ shelfRevision: this.current.shelfRevision + 1 });
  }

  private onCopies(): void {
    this.desk.followCopies();
    this.desk.joinWaiting();
    this.previews.copiesChanged();
    this.publish({ shelfRevision: this.current.shelfRevision + 1 });
  }

  private lastMixNow(): LastMix {
    return { mood: this.table.mix.mood, mix: this.desk.mixNow(this.fadeSeconds()) };
  }

  /** Publishes before telling state listeners: a table online reads the snapshot, and sent the change before this one otherwise. */
  private onMix(mix: SoundMix, tableChanged: boolean): void {
    this.lastMix.schedule();
    this.publish({ mix });
    if (tableChanged) for (const listener of [...this.stateListeners]) listener(mix.table);
  }

  private publish(change: Partial<SoundSnapshot>): void {
    this.current = { ...this.current, ...change };
    for (const listener of [...this.listeners]) listener();
  }

  /** Only a mix that plays is worth offering back. */
  private isHeld(): boolean {
    const { table } = this.table.mix;
    return table.music !== null || table.layers.length > 0;
  }
}
