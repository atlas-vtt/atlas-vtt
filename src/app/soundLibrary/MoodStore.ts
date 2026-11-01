import type { App } from 'obsidian';
import type { StoredRecord } from '../services/recordFiles/recordLayout';
import type { Mood } from '../sound/soundTypes';
import { runInBackground } from '../utils/backgroundTask';
import { isNewerMood, MOOD_FORMAT, moodOf } from './moodFile';
import { MoodFiles } from './MoodFiles';

const NO_MOODS: readonly Mood[] = [];

interface MoodFolder {
  files: MoodFiles;
  /** The moods of `entries`, in their order; the same array while no file changed. */
  moods: readonly Mood[];
  entries: readonly StoredRecord[] | null;
}

/** A new mood's id, unique across devices. */
const newMoodId = (): string => `mood-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

/**
 * The moods of every collection: read from `collections/<c>/moods/` when a collection is first
 * asked for, and kept current as files change on any device. Saved moods keep every key this
 * version does not know. One per app, released when the plugin unloads.
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

  private readonly folders = new Map<string, MoodFolder>();
  private readonly listeners = new Set<() => void>();

  private constructor(private readonly app: App) {}

  private folderOf(collectionId: string): MoodFolder {
    let folder = this.folders.get(collectionId);
    if (!folder) {
      const files = new MoodFiles(this.app, collectionId);
      folder = { files, moods: NO_MOODS, entries: null };
      this.folders.set(collectionId, folder);
      files.onChange(() => this.changed());
      runInBackground(files.load(), `Reading the moods of ${collectionId}`);
    }
    return folder;
  }

  /** Settles once the collection's mood files have been read. */
  whenLoaded(collectionId: string): Promise<void> {
    return this.folderOf(collectionId).files.load();
  }

  isLoaded(collectionId: string): boolean {
    return this.folderOf(collectionId).files.isLoaded();
  }

  /** The collection's moods in their fixed order; the same array while nothing changed. Empty until they are read (`isLoaded`). */
  moodsOf(collectionId: string): readonly Mood[] {
    const folder = this.folderOf(collectionId);
    const entries = folder.files.entries();
    if (folder.entries !== entries) {
      folder.entries = entries;
      folder.moods = entries
        .flatMap((stored) => moodOf(stored) ?? [])
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    }
    return folder.moods;
  }

  mood(collectionId: string, id: string): Mood | null {
    return this.moodsOf(collectionId).find((mood) => mood.id === id) ?? null;
  }

  /** A mood a newer Atlas wrote: it plays and shows, and is never rewritten. */
  isReadOnly(collectionId: string, id: string): boolean {
    const stored = this.folderOf(collectionId).files.entries().find((entry) => entry.id === id);
    return stored !== undefined && isNewerMood(stored);
  }

  /** A new mood after the collection's last, with `mix`; written at once. */
  createMood(collectionId: string, mix: Omit<Mood, 'id' | 'order'>): Mood {
    const last = this.moodsOf(collectionId).at(-1)?.order ?? 0;
    const mood: Mood = { ...mix, id: newMoodId(), order: last + 1 };
    this.folderOf(collectionId).files.create({ format: MOOD_FORMAT, ...mood }, mood.id);
    return mood;
  }

  /** Writes a mood over what its file holds then, keeping keys this version does not know. False where the file is a newer Atlas' or gone. */
  saveMood(collectionId: string, mood: Mood): boolean {
    const { files } = this.folderOf(collectionId);
    if (files.pathOf(mood.id) === null || this.isReadOnly(collectionId, mood.id)) return false;
    files.update(mood.id, (stored) => ({ ...stored, ...mood }));
    return true;
  }

  removeMood(collectionId: string, id: string): void {
    this.folderOf(collectionId).files.remove(id);
  }

  /** Settles once everything saved so far is on disk. */
  async flush(): Promise<void> {
    await Promise.all([...this.folders.values()].map((folder) => folder.files.flush()));
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private destroy(): void {
    for (const folder of this.folders.values()) folder.files.destroy();
    this.folders.clear();
    this.listeners.clear();
  }
}
