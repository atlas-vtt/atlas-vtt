import { DEFAULT_ROOM, type Mood, type MusicRepeat, type RoomId, type SoundInfo, type SoundRecord, type TableSound } from '../sound/soundTypes';
import { applySoonest, readyToJoin } from './libraryMix';
import type { DirectorMoods } from './directorDeps';
import { addLayer, withCurrentInfos, setLayerLevel, setLayerMuted, setLayerReverb, setMusicLevel, setMusicMuted, setMusicReverb, setRoom, stopAll } from './liveEdits';
import { mixDiffersFrom } from './mixChange';
import { bringBack, editPausedMusic, pauseMusic, resumeMusic, stopEverything } from './musicPause';
import { musicPosition, nextTrack, playTrack, previousTrack, seekMusic, skipTrack, soundingTrack } from './musicList';
import { addTrack, clearComing, dropLayer, dropWaitingTrack, EMPTY_MIX, joinReady, mixAsMood, moveTrack, pressMood, removeTrack, setRepeat, setShuffle, withoutSoonest, type ActiveMood, type SoundMix } from './soundMix';
import type { SoundOutput } from './soundOutput';
import type { SoundShelf } from './soundShelf';
import type { SoundTable } from './soundTable';
import { isPlaying, type MoodMix } from './tableSound';

function withWaitingTracks(mix: SoundMix, ids: readonly string[]): SoundMix {
  const repeat = mix.table.music?.repeat;
  const base = mix.waitingMusic ?? { tracks: [], shuffle: mix.table.music?.shuffle ?? false, levelDb: mix.table.music?.gainDb ?? 0, ...(repeat && { repeat }) };
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
  playMix(active: ActiveMood | null, saved: MoodMix, gesture: boolean): void {
    if (!this.host.isOn()) return;
    if (gesture) this.output.unlock();
    else this.output.ensureRunning();
    // Every mood fades by the one Fade setting; a mood file's own fadeSeconds stays for older versions and is not read.
    const mood: MoodMix = { ...saved, fadeSeconds: this.host.fadeSeconds() };
    const records = this.shelf.recordsOf(mood);
    this.shelf.request(records.filter((record) => !this.shelf.infoOf(record)), true);
    const { now, leadMs } = this.table.timing();
    this.table.commit(pressMood(this.table.mix, mood, active, this.shelf.readyOf(records), (id) => this.shelf.has(id), now, leadMs));
  }

  /** Brings in what waits for its copy, as far as copies have come. */
  /** The table's sounds as their copies say now: a copy made while it played grows, and ends whole. */
  followCopies(): void {
    const { table } = this.table.mix;
    const next = withCurrentInfos(table, (key) => {
      const record = this.shelf.recordOfKey(key);
      return record && this.shelf.infoOf(record);
    });
    if (next !== table) this.table.commit({ ...this.table.mix, table: next });
  }

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

  /** Stop all, or Bring back what it held; the table stays silenced (on the wire too) while stopped. */
  toggleSilence(): void {
    const { mix } = this.table;
    const now = this.table.now();
    if (mix.table.silenced) {
      this.output.unlock();
      this.table.commit(bringBack(mix, now));
    } else if (isPlaying(mix.table, now)) {
      this.table.commit(stopEverything(mix, now));
    }
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

  /** Music plays now on the default fade, or as soon as its copy is here; what follows it in the selection goes on from it. The last press wins over one still waiting for its copy. */
  playNow(records: readonly SoundRecord[]): void {
    const { soonest } = this.table.mix;
    if (soonest?.at === 'now') this.table.commit(soonest.sounds.reduce((mix, id) => dropWaitingTrack(mix, id), this.table.mix));
    this.playSoon(records, 'now');
  }

  /** Music follows the track sounding in the order of the selection, or does so as its copies come. */
  playNext(records: readonly SoundRecord[]): void {
    this.playSoon(records, 'next');
  }

  /** One state for the whole selection, however many tracks it holds. */
  private playSoon(records: readonly SoundRecord[], at: 'now' | 'next'): void {
    this.output.unlock();
    this.shelf.request(records.filter((record) => !this.shelf.infoOf(record)), true);
    const soonest = { sounds: records.map((record) => record.id), at };
    const applied = applySoonest({ ...this.table.mix, soonest }, this.shelf.readyOf(records), this.table.timing());
    // What is not placed yet is in the mix all the same: the rows and a saved mood read it there.
    this.table.commit(withWaitingTracks(applied, applied.soonest?.sounds ?? []));
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
    this.editMusic((table, now) => setMusicLevel(table, db, now));
  }

  setMusicMuted(muted: boolean): void {
    this.editMusic((table, now) => setMusicMuted(table, muted, now));
  }

  /** The music stops where it is and goes on from there; the ambience plays on. */
  togglePause(): void {
    const { mix } = this.table;
    if (mix.table.silenced) {
      // Play under Stop all brings everything back, the music too.
      this.output.unlock();
      const back = bringBack(mix, this.table.now());
      this.table.commit(back.paused ? resumeMusic(back, this.table.now()) : back);
    } else if (mix.paused) {
      this.output.unlock();
      this.table.commit(resumeMusic(mix, this.table.now()));
    } else {
      this.table.commit(pauseMusic(mix, this.table.now()));
    }
  }

  /** An edit of the music; while it is paused, of the paused music, which resumes with it. */
  private editMusic(edit: (table: TableSound, now: number) => TableSound): void {
    const { mix } = this.table;
    const now = this.table.now();
    if (mix.paused) {
      this.table.commit(editPausedMusic(mix, (play) => edit({ ...mix.table, music: play }, now).music));
      return;
    }
    this.table.commit({ ...mix, table: edit(mix.table, now) });
  }

  /** How much of the room a layer, or the music, carries: 0 to 1. */
  setLayerReverb(key: string, amount: number): void {
    this.table.commit({ ...this.table.mix, table: setLayerReverb(this.table.mix.table, key, amount, this.table.now()) });
  }

  setMusicReverb(amount: number): void {
    this.editMusic((table, now) => setMusicReverb(table, amount, now));
  }

  /** The room the mix rings in, crossfaded from the one it was. */
  setRoom(id: RoomId): void {
    this.table.commit({ ...this.table.mix, table: setRoom(this.table.mix.table, id, this.table.now() + this.table.clock.leadMs) });
  }

  skip(): void {
    const mix = this.table.mix;
    this.table.commit({ ...mix, table: skipTrack(mix.table, this.table.now(), this.table.clock.leadMs, mix.listChange), listChange: null });
  }

  /** Early in a track the one before it; otherwise this one from its start. */
  back(): void {
    const { table, listChange } = this.table.mix;
    const previous = previousTrack(table, this.table.now(), listChange);
    if (previous) this.playTrack(previous.key);
    else this.seekMusic(0);
  }

  playTrack(key: string): void {
    const mix = this.table.mix;
    this.table.commit({ ...mix, table: playTrack(mix.table, key, this.table.now(), this.table.clock.leadMs, mix.listChange), listChange: null });
  }

  seekMusic(frame: number): void {
    const mix = this.table.mix;
    this.table.commit({ ...mix, table: seekMusic(mix.table, frame, this.table.now()) });
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

  setRepeat(repeat: MusicRepeat | undefined): void {
    this.table.commit(setRepeat(this.table.mix, repeat));
  }

  /** A track to another place on the list. What sounds goes on; the list shows it at once and plays it from the track's end. */
  moveTrack(key: string, index: number): void {
    this.table.commit(moveTrack(this.table.mix, key, index));
  }

  clearComing(): void {
    this.table.commit(clearComing(this.table.mix, this.table.now()));
  }

  /** At this track's end the music stops. Another track taking its place ends the wish. */
  setStopAfter(on: boolean): void {
    const play = this.table.mix.table.music;
    const key = on && play ? (musicPosition(play, this.table.now())?.track.key ?? null) : null;
    this.table.commit({ ...this.table.mix, stopAfter: key });
  }

  /** What played earlier: gone to where it is on the list, in the place of what plays where it left it. */
  playPlayed(key: string): void {
    const record = this.shelf.recordOfKey(key);
    if (record) this.playNow([record]);
  }

  nextTrack(): SoundInfo | null {
    return nextTrack(this.table.mix.table, this.table.now(), this.table.mix.listChange);
  }

  /** What the mix would save as. */
  mixNow(fadeSeconds: number, at = this.table.now()): MoodMix {
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
    const { music, layers, room } = this.mixNow(mood.fadeSeconds);
    // The room is written even where it is the default, or the one the file held would stay.
    const saved = this.host.moods.saveMood({ ...mood, music: mood.music === 'keep' ? 'keep' : music, layers, room: room ?? DEFAULT_ROOM });
    if (saved) this.table.commit({ ...this.table.mix, mood: { id: mood.id } });
    return saved;
  }
}
