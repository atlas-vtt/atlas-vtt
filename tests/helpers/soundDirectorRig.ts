import type { App } from 'obsidian';
import type { OutputContext } from '@/app/soundDirector/soundOutput';
import { SoundDirector } from '@/app/soundDirector/SoundDirector';
import type { SoundDirectorDeps } from '@/app/soundDirector/directorDeps';
import type { CopyFolder, FolderCopy } from '@/app/soundDirector/copyFolder';
import { readAtlasCopy, type AtlasCopyFacts } from '@/app/sound/codec/atlasOpus';
import { SoundImportError } from '@/app/sound/codec/demux/demuxTypes';
import type { OriginalsChoice } from '@/app/soundLibrary/SoundRoots';
import { nameOfRelative } from '@/app/soundLibrary/soundPaths';
import type { SoundImportJob } from '@/app/sound/codec/soundImporter';
import type { Mood, SceneSound, SoundRecord } from '@/app/sound/soundTypes';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from '@/app/services/soundSettings';
import type { PresentedScene } from '@/app/services/presentedScene';
import { sha256 } from '@/app/utils/hashing';
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
  return { id, name: id.toUpperCase(), kind, filePath: `audio/${id}.ogg` };
}

export function mood(id: string, layers: string[], music: Mood['music'] = 'keep', fadeSeconds = 4): Mood {
  return { id, name: id, order: id.charCodeAt(0), fadeSeconds, music, layers: layers.map((sound) => ({ sound, levelDb: -3 })) };
}

/** A copy in the fake folder: what its file says, and its bytes. */
export interface FakeFolderCopy {
  facts: AtlasCopyFacts;
  blob: Blob;
}

/** What a copy of `key` says of itself in the rig: ten seconds of stereo at -20 LUFS. */
export function factsOf(key: string, peaks: Uint8Array<ArrayBuffer> | null = null): AtlasCopyFacts {
  return { key, codec: 1, from: '', frames: 48000 * 10, channels: 2, lufs: -20, truePeakDb: -3, peaks };
}

/** The GM's folders held in memory: copies by the path a record names, stored where the source lay. */
export class FakeCopyFolder implements CopyFolder {
  readonly copies = new Map<string, FakeFolderCopy>();
  readonly stores: Array<{ sound: SoundRecord; copy: Blob; choice: OriginalsChoice; sourceStat: { size: number; mtime: number } }> = [];
  /** The facts a fake copy maker's result carries, by its bytes. */
  readonly made = new WeakMap<Blob, AtlasCopyFacts>();
  /** Paths whose file carries Atlas' mark beside facts that do not read. */
  readonly damaged = new Set<string>();
  /** Paths outside every linked folder. */
  readonly outsidePaths = new Set<string>();
  /** Paths whose reads take too long to say what they are. */
  readonly slow = new Set<string>();
  readonly hurried: string[] = [];
  choice: OriginalsChoice | null = 'trash';
  failStore: Error | null = null;

  choiceFor(): OriginalsChoice | null {
    return this.choice;
  }

  sourceName(sound: SoundRecord): string | null {
    return nameOfRelative(sound.filePath);
  }

  rootOf(sound: SoundRecord): string | null {
    return this.outsidePaths.has(sound.filePath) ? null : 'root';
  }

  outside(sound: SoundRecord): boolean {
    return this.outsidePaths.has(sound.filePath);
  }

  hurry(sound: SoundRecord): void {
    this.hurried.push(sound.id);
  }

  factsOf(sound: SoundRecord): Promise<FolderCopy | null | 'unknown'> {
    if (this.slow.has(sound.filePath)) return Promise.resolve('unknown');
    if (this.damaged.has(sound.filePath)) return Promise.reject(new SoundImportError('unreadable', 'Atlas copy whose facts do not read'));
    const held = this.copies.get(sound.filePath);
    return Promise.resolve(held ? { facts: held.facts, audioPath: sound.filePath } : null);
  }

  async store(sound: SoundRecord, copy: Blob, choice: OriginalsChoice, sourceStat: { size: number; mtime: number }): Promise<string> {
    if (this.failStore) throw this.failStore;
    const facts = this.made.get(copy) ?? (await readAtlasCopy(copy));
    if (!facts) throw new Error('A copy Atlas did not make.');
    this.copies.set(sound.filePath, { facts, blob: copy });
    this.stores.push({ sound, copy, choice, sourceStat });
    return sound.filePath;
  }

  blob(audioPath: string): Promise<Blob> {
    const held = this.copies.get(audioPath);
    return held ? Promise.resolve(held.blob) : Promise.reject(new Error(`${audioPath} is gone.`));
  }
}

export interface DirectorRig {
  director: SoundDirector;
  contexts: FakeOutputContext[];
  /** Files in the vault; a path out of it is a file not there yet. */
  files: Set<string>;
  folder: FakeCopyFolder;
  /** The folder's copies, by the path a record names. */
  copies: Map<string, FakeFolderCopy>;
  /** Conversions under way, each to be let go by the test. */
  conversions: Array<{ source: Blob; job: SoundImportJob; finish: () => void; fail: (error: unknown) => void }>;
  storage: Map<string, unknown>;
  moods: { current: Mood[] };
  scenes: Map<string, SceneSound>;
  notices: string[];
  settings: SoundSettings & { on: boolean };
  setPresented(scene: PresentedScene | null): void;
  fireLibraryChange(): void;
  fireFileChange(): void;
  fireSettings(): void;
  records: SoundRecord[];
  /** Files this device keeps under another name than their record says. */
  filedAs: Map<string, string>;
  /** How often the library was opened (by listening to its files) and let go of. */
  library: { opened: number; released: number };
}

/** A director with everything outside it replaced: its clock is the test's fake timers and Date. */
export function directorRig(records: SoundRecord[], { on = true, ready = true }: { on?: boolean; ready?: boolean } = {}): DirectorRig {
  const contexts: FakeOutputContext[] = [];
  const files = new Set(records.map((sound) => sound.filePath));
  const folder = new FakeCopyFolder();
  const copies = folder.copies;
  const conversions: DirectorRig['conversions'] = [];
  const storage = new Map<string, unknown>();
  const moods: DirectorRig['moods'] = { current: [] };
  const scenes = new Map<string, SceneSound>();
  const notices: string[] = [];
  const settings: DirectorRig['settings'] = { ...DEFAULT_SOUND_SETTINGS, on };
  let presented: PresentedScene | null = null;
  const presentedListeners = new Set<(scene: PresentedScene | null) => void>();
  const settingsListeners = new Set<() => void>();
  const libraryListeners = new Set<() => void>();
  const fileListeners = new Set<() => void>();
  const library = { opened: 0, released: 0 };
  const filedAs = new Map<string, string>();
  const peaksOf = (kind: SoundRecord['kind']): Uint8Array<ArrayBuffer> | null => (kind === 'music' ? Uint8Array.of(10, 200, 30) : null);
  if (ready) {
    for (const sound of records) copies.set(sound.filePath, { facts: factsOf(`hash-${sound.filePath}`, peaksOf(sound.kind)), blob: new Blob([new Uint8Array(4)]) });
  }
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
      moods: () => moods.current,
      mood: (id) => moods.current.find((one) => one.id === id) ?? null,
      whenLoaded: () => Promise.resolve(),
      createMood: (mix) => {
        const made: Mood = { ...mix, id: `made-${moods.current.length}`, order: moods.current.length + 1 };
        moods.current = [...moods.current, made];
        return made;
      },
      saveMood: (changed) => {
        moods.current = moods.current.map((one) => (one.id === changed.id ? changed : one));
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
      statOf: ({ filePath }) => (files.has(filePath) ? { size: 1, mtime: 1 } : null),
      read: ({ filePath }) => Promise.resolve(new TextEncoder().encode(filePath).buffer),
      pathNow: ({ filePath }) => filedAs.get(filePath) ?? filePath,
    },
    createFolder: () => folder,
    createMaker: () => ({
      run: (job) => new Promise((resolve, reject) => {
        conversions.push({
          source: job.source,
          job,
          finish: () => {
            const bytes = new Blob(['opus']);
            const peaks = job.kind === 'music' ? Uint8Array.of(10, 200, 30) : new Uint8Array(0);
            folder.made.set(bytes, { ...factsOf(job.key, job.kind === 'music' ? peaks : null), from: job.from });
            resolve({ bytes, frames: 48000 * 10, channels: 2, lufs: -20, truePeakDb: -3, peaks });
          },
          fail: reject,
        });
      }),
      dispose: () => undefined,
    }),
    prepareSource: async (buffer) => ({ hash: await hashing(sha256(buffer)), source: new Blob([buffer]) }),
    createContext: () => {
      const context = new FakeOutputContext();
      contexts.push(context);
      return context;
    },
    readRecords: () => Promise.resolve(records),
    onLibraryChange: (listener) => {
      libraryListeners.add(listener);
      return () => libraryListeners.delete(listener);
    },
    onAudioFileChange: (listener) => {
      library.opened++;
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
    releaseLibrary: () => { library.released++; },
    readSceneSound: (path) => Promise.resolve(scenes.get(path) ?? null),
    notify: (message) => notices.push(message),
  };
  const director = new SoundDirector(deps);
  const rig: DirectorRig = {
    director,
    contexts,
    files,
    folder,
    copies,
    conversions,
    storage,
    moods,
    scenes,
    notices,
    settings,
    records,
    library,
    filedAs,
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

/** Hashes under way: Web Crypto answers outside the event loop, sooner or later as the machine is loaded. */
const hashes = new Set<Promise<string>>();

function hashing(hash: Promise<string>): Promise<string> {
  hashes.add(hash);
  void hash.finally(() => hashes.delete(hash)).catch(() => undefined);
  return hash;
}

/**
 * Lets promises settle, hashing included, which runs outside the fake timers: a number of turns of the
 * event loop, and again after every hash under way has answered, so a slow machine sees what a fast one does.
 */
export async function settle(): Promise<void> {
  const turns = async (): Promise<void> => {
    for (let i = 0; i < 12; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  await turns();
  for (let round = 0; round < 20 && hashes.size > 0; round++) {
    await Promise.allSettled([...hashes]);
    await turns();
  }
}
