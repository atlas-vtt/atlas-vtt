import type { App } from 'obsidian';
import type { OutputContext } from '@/app/soundDirector/soundOutput';
import { SoundDirector } from '@/app/soundDirector/SoundDirector';
import type { SoundDirectorDeps } from '@/app/soundDirector/directorDeps';
import type { CopyCache } from '@/app/soundDirector/soundCopies';
import type { CachedSound, SoundIdentity } from '@/app/sound/codec/opusCache';
import type { Mood, SceneSound, SoundRecord } from '@/app/sound/soundTypes';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from '@/app/services/soundSettings';
import type { PresentedScene } from '@/app/services/presentedScene';
import { sha256 } from '@/app/utils/hashing';
import { emptyBytes } from './soundPlayerRig';
import { FakeSoundContext } from './fakeSoundContext';

export class FakeOutputContext extends FakeSoundContext implements OutputContext {
  state = 'running';
  closed = false;
  sinkIds: string[] = [];
  private readonly born = Date.now();

  constructor() {
    super();
    // Runs with the test's fake clock, so the watchdog sees it running.
    Object.defineProperty(this, 'currentTime', { get: () => (Date.now() - this.born) / 1000 });
  }

  suspend(): Promise<void> { return Promise.resolve(); }
  resume(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
  setSinkId(id: string): Promise<void> {
    this.sinkIds.push(id);
    return Promise.resolve();
  }
}

export function record(id: string, kind: SoundRecord['kind'] = 'ambience'): SoundRecord {
  return { id, name: id.toUpperCase(), kind, filePath: `audio/${id}.ogg`, licence: 'unknown', streaming: 'unknown' };
}

export function mood(id: string, layers: string[], music: Mood['music'] = 'keep', fadeSeconds = 4): Mood {
  return { id, name: id, order: id.charCodeAt(0), fadeSeconds, music, layers: layers.map((sound) => ({ sound, levelDb: -3 })) };
}

export interface DirectorRig {
  director: SoundDirector;
  contexts: FakeOutputContext[];
  /** Files in the vault; a path out of it is a file not there yet. */
  files: Set<string>;
  copies: Map<string, CachedSound>;
  /** Conversions under way, each to be let go by the test. */
  conversions: Array<{ source: Blob; finish: () => void; fail: (error: unknown) => void }>;
  storage: Map<string, unknown>;
  moods: Map<string, Mood[]>;
  scenes: Map<string, SceneSound>;
  notices: string[];
  settings: SoundSettings & { on: boolean };
  setPresented(scene: PresentedScene | null): void;
  fireLibraryChange(): void;
  fireFileChange(): void;
  fireSettings(): void;
  records: SoundRecord[];
}

/** A director with everything outside it replaced: its clock is the test's fake timers and Date. */
export function directorRig(records: SoundRecord[], { on = true, ready = true }: { on?: boolean; ready?: boolean } = {}): DirectorRig {
  const contexts: FakeOutputContext[] = [];
  const files = new Set(records.map((sound) => sound.filePath));
  const copies = new Map<string, CachedSound>();
  const identities = new Map<string, SoundIdentity>();
  const conversions: DirectorRig['conversions'] = [];
  const storage = new Map<string, unknown>();
  const moods = new Map<string, Mood[]>();
  const scenes = new Map<string, SceneSound>();
  const notices: string[] = [];
  const settings: DirectorRig['settings'] = { ...DEFAULT_SOUND_SETTINGS, on };
  let presented: PresentedScene | null = null;
  const presentedListeners = new Set<(scene: PresentedScene | null) => void>();
  const settingsListeners = new Set<() => void>();
  const libraryListeners = new Set<() => void>();
  const fileListeners = new Set<() => void>();
  const hashOfPath = (path: string): string => `hash-${path}`;
  const copy = (hash: string): CachedSound => ({ hash, byteLength: 10, frames: 48000 * 10, channels: 2, lufs: -20, truePeakDb: -3, lastUsed: 0 });
  if (ready) {
    for (const sound of records) {
      copies.set(hashOfPath(sound.filePath), copy(hashOfPath(sound.filePath)));
      identities.set(sound.filePath, { path: sound.filePath, size: 1, mtime: 1, hash: hashOfPath(sound.filePath) });
    }
  }
  const cache: CopyCache = {
    get: (hash) => Promise.resolve(copies.get(hash) ?? null),
    put: (hash) => {
      copies.set(hash, copy(hash));
      return Promise.resolve();
    },
    bytes: (hash) => Promise.resolve(copies.has(hash) ? emptyBytes : null),
    hashOf: (path) => Promise.resolve(identities.get(path)?.hash ?? null),
    remember: (identity) => {
      identities.set(identity.path, identity);
      return Promise.resolve();
    },
    blob: (hash) => Promise.resolve(copies.has(hash) ? new Blob([new Uint8Array(4)]) : null),
    setPeaks: (hash, peaks) => {
      const held = copies.get(hash);
      if (held) copies.set(hash, { ...held, peaks });
      return Promise.resolve();
    },
    pin: () => undefined,
    unpin: () => undefined,
  };
  const moodOf = (collectionId: string): Mood[] => moods.get(collectionId) ?? [];
  const deps: SoundDirectorDeps = {
    storage: {
      loadLocalStorage: (key: string) => storage.get(key) ?? null,
      saveLocalStorage: (key: string, value: unknown) => { storage.set(key, value); },
    } as Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>,
    settings: {
      getSoundSettings: () => settings,
      setSoundSettings: (changes) => Object.assign(settings, changes),
      isOn: () => settings.on,
      onChange: (listener) => {
        settingsListeners.add(listener);
        return () => settingsListeners.delete(listener);
      },
    },
    moods: {
      moodsOf: moodOf,
      mood: (collectionId, id) => moodOf(collectionId).find((one) => one.id === id) ?? null,
      whenLoaded: () => Promise.resolve(),
      createMood: (collectionId, mix) => {
        const made: Mood = { ...mix, id: `made-${moodOf(collectionId).length}`, order: moodOf(collectionId).length + 1 };
        moods.set(collectionId, [...moodOf(collectionId), made]);
        return made;
      },
      saveMood: (collectionId, changed) => {
        moods.set(collectionId, moodOf(collectionId).map((one) => (one.id === changed.id ? changed : one)));
        return true;
      },
    },
    presented: {
      get: () => presented,
      onChange: (listener) => {
        presentedListeners.add(listener);
        return () => presentedListeners.delete(listener);
      },
    },
    files: {
      statOf: (path) => (files.has(path) ? { size: 1, mtime: 1 } : null),
      read: (path) => Promise.resolve(new TextEncoder().encode(path).buffer),
    },
    createCache: () => ({ ...cache, close: () => Promise.resolve() }),
    createMaker: () => ({
      run: (job) => new Promise((resolve, reject) => {
        conversions.push({
          source: job.source,
          finish: () => resolve({ bytes: new Blob(['opus']), frames: 48000 * 10, channels: 2, lufs: -20, truePeakDb: -3 }),
          fail: reject,
        });
      }),
      dispose: () => undefined,
    }),
    prepareSource: async (buffer) => ({ hash: await sha256(buffer), source: new Blob([buffer]) }),
    readPeaks: () => Promise.resolve(Uint8Array.of(10, 200, 30)),
    createContext: () => {
      const context = new FakeOutputContext();
      contexts.push(context);
      return context;
    },
    provideConversion: () => () => undefined,
    readRecords: () => Promise.resolve(records),
    onLibraryChange: (listener) => {
      libraryListeners.add(listener);
      return () => libraryListeners.delete(listener);
    },
    onAudioFileChange: (listener) => {
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
    readSceneSound: (path) => Promise.resolve(scenes.get(path) ?? null),
    collectionOf: () => 'c',
    notify: (message) => notices.push(message),
  };
  const director = new SoundDirector(deps);
  const rig: DirectorRig = {
    director,
    contexts,
    files,
    copies,
    conversions,
    storage,
    moods,
    scenes,
    notices,
    settings,
    records,
    setPresented: (scene) => {
      presented = scene;
      for (const listener of presentedListeners) listener(scene);
    },
    fireLibraryChange: () => { for (const listener of libraryListeners) listener(); },
    fireFileChange: () => { for (const listener of fileListeners) listener(); },
    fireSettings: () => { for (const listener of settingsListeners) listener(); },
  };
  return rig;
}

/** Lets promises settle, hashing included, which runs outside the fake timers. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve));
}
