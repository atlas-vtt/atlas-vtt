import type { App } from 'obsidian';
import type { StoredRecord } from '../services/recordFiles/recordLayout';
import type { Mood } from '../sound/soundTypes';
import { runInBackground } from '../utils/backgroundTask';
import { isNewerMood, MOOD_FORMAT, moodOf } from './moodFile';
import { MoodFiles } from './MoodFiles';

const NO_MOODS: readonly Mood[] = [];

/** A new mood's id, unique across devices. */
const newMoodId = (): string => `mood-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

/**
 * The GM's moods, once for the whole vault: read from `atlas-vtt/sounds/moods/` when first asked for,
 * and kept current as files change on any device. Saved moods keep every key this version does not
 * know. One per app, released when the plugin unloads.
 */
export class MoodStore {
  private static readonly instances = new WeakMap<App, MoodStore>();

  static forApp(app: App): MoodStore {
    let store = MoodStore.instances.get(app);
    if (!store) {
      store = new MoodStore(app);
      MoodStore.instances.set(app, store);
    }
    return store;
  }

  static release(app: App): void {
    MoodStore.instances.get(app)?.destroy();
    MoodStore.instances.delete(app);
  }

  private readonly files: MoodFiles;
  private entries: readonly StoredRecord[] | null = null;
  private shown: readonly Mood[] = NO_MOODS;
  private started = false;

  private constructor(app: App) {
    this.files = new MoodFiles(app);
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    runInBackground(this.files.load(), 'Reading the moods');
  }

  /** Settles once the mood files have been read. */
  whenLoaded(): Promise<void> {
    this.started = true;
    return this.files.load();
  }

  isLoaded(): boolean {
    this.start();
    return this.files.isLoaded();
  }

  /** The moods in their fixed order; the same array while nothing changed. Empty until they are read (`isLoaded`). */
  moods(): readonly Mood[] {
    this.start();
    const entries = this.files.entries();
    if (this.entries !== entries) {
      this.entries = entries;
      this.shown = entries
        .flatMap((stored) => moodOf(stored) ?? [])
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    }
    return this.shown;
  }

  mood(id: string): Mood | null {
    return this.moods().find((mood) => mood.id === id) ?? null;
  }

  /** A mood a newer Atlas wrote: it plays and shows, and is never rewritten. */
  isReadOnly(id: string): boolean {
    const stored = this.files.entries().find((entry) => entry.id === id);
    return stored !== undefined && isNewerMood(stored);
  }

  /** A new mood after the last, with `mix`; written at once. */
  createMood(mix: Omit<Mood, 'id' | 'order'>): Mood {
    const last = this.moods().at(-1)?.order ?? 0;
    const mood: Mood = { ...mix, id: newMoodId(), order: last + 1 };
    this.files.create({ format: MOOD_FORMAT, ...mood }, mood.id);
    return mood;
  }

  /** Writes a mood over what its file holds then, keeping keys this version does not know. False where the file is a newer Atlas' or gone. */
  saveMood(mood: Mood): boolean {
    if (this.files.pathOf(mood.id) === null || this.isReadOnly(mood.id)) return false;
    this.files.update(mood.id, (stored) => ({ ...stored, ...mood }));
    return true;
  }

  removeMood(id: string): void {
    this.files.remove(id);
  }

  /** Settles once everything saved so far is on disk. */
  flush(): Promise<void> {
    return this.files.flush();
  }

  onChange(listener: () => void): () => void {
    return this.files.onChange(listener);
  }

  private destroy(): void {
    this.files.destroy();
  }
}
