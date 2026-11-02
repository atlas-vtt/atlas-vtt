import type { Mood, MoodMusic, SoundInfo, SoundRecord } from '../sound/soundTypes';
import { applySoonest, readyToJoin } from './libraryMix';
import type { DirectorMoods } from './directorDeps';
import { addLayer, setLayerLevel, setLayerMuted, setMusicLevel, setMusicMuted, stopAll, toggleSilence } from './liveEdits';
import { mixDiffersFrom } from './mixChange';
import { nextTrack, playTrack, skipTrack, soundingTrack } from './musicList';
import { addTrack, dropLayer, dropWaitingTrack, EMPTY_MIX, joinReady, mixAsMood, pressMood, removeTrack, setShuffle, withoutSoonest, type ActiveMood, type SoundMix } from './soundMix';
import type { SoundOutput } from './soundOutput';
import type { SoundShelf } from './soundShelf';
import type { SoundTable } from './soundTable';
import { isPlaying, type MoodMix } from './tableSound';

function withWaitingTracks(mix: SoundMix, ids: readonly string[]): SoundMix {
  const base = mix.waitingMusic ?? { tracks: [], shuffle: mix.table.music?.shuffle ?? false, levelDb: mix.table.music?.gainDb ?? 0 };
  const tracks = [...base.tracks, ...ids.filter((id) => !base.tracks.includes(id))];
  return tracks.length === 0 ? mix : { ...mix, waitingMusic: { ...base, tracks } };
}

export interface MixDeskHost {
  isOn(): boolean;
  fadeSeconds(): number;
  moods: DirectorMoods;
}

/** What the GM does to the mix, from the tab, the status bar, a key or the palette. */
export class MixDesk {
  constructor(
    private readonly table: SoundTable,
    private readonly shelf: SoundShelf,
    private readonly output: SoundOutput,
    private readonly host: MixDeskHost,
  ) {}

  /** One press, whoever makes it; only a gesture may start a silent context by itself. */
  playMix(active: ActiveMood | null, mood: MoodMix, gesture: boolean): void {
    if (!this.host.isOn()) return;
    if (gesture) this.output.unlock();
    else this.output.ensureRunning();
    const records = this.shelf.recordsOf(mood);
    this.shelf.request(records.filter((record) => !this.shelf.infoOf(record)), true);
    const { now, leadMs } = this.table.timing();
    this.table.commit(pressMood(this.table.mix, mood, active, this.shelf.readyOf(records), (id) => this.shelf.has(id), now, leadMs));
  }

  /** Brings in what waits for its copy, as far as copies have come. */
  joinWaiting(): void {
    const mix = this.withoutGiveUps(this.table.mix);
    const { waitingLayers, waitingMusic, soonest } = mix;
    if (waitingLayers.length === 0 && !waitingMusic && !soonest) return;
    const ready = this.shelf.readyOf([...this.waitingIds(), ...(soonest?.sounds ?? [])].flatMap((id) => this.shelf.recordOf(id) ?? []));
    const timing = this.table.timing();
    this.table.commit(applySoonest(joinReady(mix, readyToJoin(mix, ready), timing), ready, timing));
  }

  /** A selection waits for its first only while that can come: one refused or gone gives way to the next. */
  private withoutGiveUps(mix: SoundMix): SoundMix {
    return (mix.soonest?.sounds ?? []).reduce((held, id) => (this.shelf.mayCome(id) ? held : withoutSoonest(held, id)), mix);
  }

  /** Asks again for what waits, once a file may have come. */
  requestWaiting(): void {
    this.shelf.request(this.waitingIds().flatMap((id) => this.shelf.recordOf(id) ?? []), true);
  }

  private waitingIds(): string[] {
    const { waitingLayers, waitingMusic } = this.table.mix;
    return [...waitingLayers.map((layer) => layer.sound), ...(waitingMusic?.tracks ?? [])];
  }

  toggleSilence(): void {
    if (!isPlaying(this.table.mix.table, this.table.now())) return;
    this.output.unlock();
    this.table.commit({ ...this.table.mix, table: toggleSilence(this.table.mix.table, this.table.now()) });
  }

  /** Ends the mix. */
  stop(): void {
    const { now, fadeMs } = this.table.timing();
    this.table.commit({ ...EMPTY_MIX, table: stopAll(this.table.mix.table, now, fadeMs) });
  }

  /** False where it is refused: a sound already in the mix, or a ninth layer. */
  addSound(record: SoundRecord): boolean {
    const info = this.shelf.infoOf(record);
    if (!info) {
      this.shelf.request([record], true);
      return this.addWaiting(record);
    }
    this.output.unlock();
    const timing = this.table.timing();
    const mix = this.table.mix;
    const next = record.kind === 'ambience'
      ? { ...mix, table: addLayer(mix.table, info, 0, timing.now, timing.fadeMs, timing.leadMs) }
      : addTrack(mix, info, mix.table.music?.gainDb ?? 0, timing);
    const refused = next.table === mix.table && next.listChange === mix.listChange;
    if (!refused) this.table.commit(next);
    return !refused;
  }

  /** Music plays now on a short crossfade, or as soon as its copy is here; what follows it in the selection goes on from it. */
  playNow(records: readonly SoundRecord[]): void {
    this.playSoon(records, 'now');
  }

  /** Music follows the track sounding in the order of the selection, or does so as its copies come. */
  playNext(records: readonly SoundRecord[]): void {
    this.playSoon(records, 'next');
  }

  /** One state for the whole selection, however many tracks it holds. */
  private playSoon(records: readonly SoundRecord[], at: 'now' | 'next'): void {
    this.output.unlock();
    const missing = records.filter((record) => !this.shelf.infoOf(record));
    this.shelf.request(missing, true);
    const ready = this.shelf.readyOf(records);
    const timing = this.table.timing();
    const held = withWaitingTracks(this.table.mix, missing.map((record) => record.id));
    this.table.commit(applySoonest({ ...held, soonest: { sounds: records.map((record) => record.id), at } }, ready, timing));
  }

  /** A folder as the music: the list changes on the mood's crossfade, the layers stay as they are. */
  playList(records: readonly SoundRecord[], shuffle: boolean): void {
    if (records.length === 0) return;
    const { layers } = this.mixNow(this.host.fadeSeconds());
    const levelDb = this.table.mix.table.music?.gainDb ?? 0;
    this.playMix(null, { fadeSeconds: this.host.fadeSeconds(), music: { tracks: records.map((record) => record.id), shuffle, levelDb }, layers }, true);
  }

  private addWaiting(record: SoundRecord): boolean {
    const mix = this.table.mix;
    if (record.kind === 'ambience') {
      if (mix.waitingLayers.some((layer) => layer.sound === record.id)) return false;
      this.table.commit({ ...mix, waitingLayers: [...mix.waitingLayers, { sound: record.id, levelDb: 0 }] });
      return true;
    }
    if (mix.waitingMusic?.tracks.includes(record.id)) return false;
    this.table.commit(withWaitingTracks(mix, [record.id]));
    return true;
  }

  removeLayer(soundId: string, key: string | null): void {
    const { now, fadeMs } = this.table.timing();
    this.table.commit(dropLayer(this.table.mix, soundId, key, now, fadeMs));
  }

  setLayerLevel(key: string, db: number): void {
    this.table.commit({ ...this.table.mix, table: setLayerLevel(this.table.mix.table, key, db, this.table.now()) });
  }

  setLayerMuted(key: string, muted: boolean): void {
    this.table.commit({ ...this.table.mix, table: setLayerMuted(this.table.mix.table, key, muted, this.table.now()) });
  }

  setMusicLevel(db: number): void {
    this.table.commit({ ...this.table.mix, table: setMusicLevel(this.table.mix.table, db, this.table.now()) });
  }

  setMusicMuted(muted: boolean): void {
    this.table.commit({ ...this.table.mix, table: setMusicMuted(this.table.mix.table, muted, this.table.now()) });
  }

  skip(): void {
    const mix = this.table.mix;
    this.table.commit({ ...mix, table: skipTrack(mix.table, this.table.now(), this.table.clock.leadMs, mix.listChange), listChange: null });
  }

  playTrack(key: string): void {
    const mix = this.table.mix;
    this.table.commit({ ...mix, table: playTrack(mix.table, key, this.table.now(), this.table.clock.leadMs, mix.listChange), listChange: null });
  }

  removeTrack(key: string): void {
    const timing = this.table.timing();
    const mix = withoutSoonest(this.table.mix, this.shelf.idOfKey(key));
    this.table.commit(removeTrack(mix, key, timing, soundingTrack(mix.table, timing.now)?.key ?? null));
  }

  removeWaitingTrack(soundId: string): void {
    this.table.commit(dropWaitingTrack(this.table.mix, soundId));
  }

  setShuffle(shuffle: boolean): void {
    this.table.commit(setShuffle(this.table.mix, shuffle));
  }

  nextTrack(): SoundInfo | null {
    return nextTrack(this.table.mix.table, this.table.now(), this.table.mix.listChange);
  }

  /** What the mix would save as. */
  mixNow(fadeSeconds: number, at = this.table.now()): { fadeSeconds: number; music: MoodMusic; layers: { sound: string; levelDb: number }[] } {
    return mixAsMood(this.table.mix, (key) => this.shelf.idOfKey(key), fadeSeconds, at);
  }

  /** Whether the mix is no longer `mood`, once what was just asked for has begun: nothing else tells when that is. */
  differsFrom(mood: Mood): boolean {
    return mixDiffersFrom(mood, this.mixNow(mood.fadeSeconds, this.table.now() + this.table.clock.leadMs), (id) => this.shelf.has(id));
  }

  /** Takes the mix as it is now as a new mood. */
  saveAsMood(name: string): Mood {
    const mood = this.host.moods.createMood({ name, ...this.mixNow(this.host.fadeSeconds()) });
    this.table.commit({ ...this.table.mix, mood: { id: mood.id } });
    return mood;
  }

  /** The mix as it is now into `mood`, which keeps its name, place and fade. A mood that leaves the music alone goes on doing so. */
  saveToMood(mood: Mood): boolean {
    const { music, layers } = this.mixNow(mood.fadeSeconds);
    const saved = this.host.moods.saveMood({ ...mood, music: mood.music === 'keep' ? 'keep' : music, layers });
    if (saved) this.table.commit({ ...this.table.mix, mood: { id: mood.id } });
    return saved;
  }
}
