import { normalizePath, type App } from 'obsidian';
import { presentedSceneOf, type PresentedSceneSource } from '../services/presentedScene';
import { SettingsService } from '../services/SettingsService';
import { OpusCache, opusCacheBudget, opusCacheDatabaseName } from '../sound/codec/opusCache';
import { SoundImporter } from '../sound/codec/soundImporter';
import { readSoundPeaks } from '../sound/codec/soundPeaksClient';
import { SOUND_CONTEXT_OPTIONS } from '../sound/engine/soundMath';
import type { SceneSound, SoundRecord } from '../sound/soundTypes';
import { MoodStore } from '../soundLibrary/MoodStore';
import { sceneSoundOfText } from '../soundLibrary/sceneSound';
import { isAudioPath } from '../soundLibrary/soundFiles';
import { SoundLibrary } from '../soundLibrary/SoundLibrary';
import { soundRecordOf } from '../soundLibrary/soundRecords';
import { SoundRecordStore } from '../soundLibrary/SoundRecordStore';
import { showNotice } from '../ui/notice';
import type { DeviceStorage } from './deviceFacts';
import type { CopyCache, CopyMaker, SoundFileAccess } from './soundCopies';
import type { OutputContext } from './soundOutput';
import { prepareSource, type PreparedSource } from './sourcePrepare';
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from '../services/soundSettings';

export type DirectorSettings = {
  getSoundSettings(): SoundSettings;
  setSoundSettings(changes: Partial<SoundSettings>): void;
  isOn(): boolean;
  onChange(listener: () => void): () => void;
};

export type DirectorMoods = Pick<MoodStore, 'moods' | 'mood' | 'whenLoaded' | 'createMood' | 'saveMood'>;

/** Everything the director reaches outside itself; tests hand in their own. */
export interface SoundDirectorDeps {
  storage: DeviceStorage;
  settings: DirectorSettings;
  moods: DirectorMoods;
  presented: Pick<PresentedSceneSource, 'get' | 'onChange'>;
  files: SoundFileAccess;
  createCache(): CopyCache & { close(): Promise<void> };
  createMaker(): CopyMaker & { dispose(): void };
  prepareSource(source: ArrayBuffer | Blob): Promise<PreparedSource>;
  readPeaks(copy: Blob, frames: number): Promise<Uint8Array<ArrayBuffer>>;
  createContext(): OutputContext;
  readRecords(): Promise<SoundRecord[]>;
  /** Calls back when sounds may have been added or changed. */
  onLibraryChange(listener: () => void): () => void;
  /** Calls back when an audio file arrived or changed in the vault. */
  onAudioFileChange(listener: () => void): () => void;
  /** Lets go of the library while sound is off: its listeners and its watch on the disk. It comes back with `onAudioFileChange`. */
  releaseLibrary(): void;
  readSceneSound(path: string): Promise<SceneSound | null>;
  notify(message: string): void;
}

function fileAccess(app: App): SoundFileAccess {
  const fileOf = (path: string): ReturnType<App['vault']['getFileByPath']> => app.vault.getFileByPath(normalizePath(path));
  // Never `forApp`: asked late in an unload, that would open a library nobody releases.
  const library = (): SoundLibrary | null => SoundLibrary.opened(app);
  return {
    statOf: ({ filePath, audioSize }) => fileOf(filePath)?.stat ?? library()?.statOfFile(filePath, audioSize) ?? null,
    read: ({ filePath, audioSize }, onStep) => {
      const file = fileOf(filePath);
      if (file) return app.vault.readBinary(file);
      return library()?.readFile(filePath, audioSize, onStep) ?? Promise.reject(new Error(`${filePath} is not reachable now.`));
    },
    pathNow: ({ filePath, audioSize }) => (fileOf(filePath) ? filePath : library()?.pathNow(filePath, audioSize) ?? filePath),
  };
}

async function sceneSoundInFile(app: App, path: string): Promise<SceneSound | null> {
  const file = app.vault.getFileByPath(normalizePath(path));
  return file ? sceneSoundOfText(await app.vault.cachedRead(file)) : null;
}

/** What the director runs on in Obsidian. */
export function realDirectorDeps(app: App): SoundDirectorDeps {
  const records = SoundRecordStore.forApp(app);
  const settings = (): SettingsService | undefined => SettingsService.forApp(app);
  return {
    storage: app,
    settings: {
      getSoundSettings: () => settings()?.getSoundSettings() ?? DEFAULT_SOUND_SETTINGS,
      setSoundSettings: (changes) => settings()?.setSoundSettings(changes),
      isOn: () => settings()?.isExperimentalOn('sound') ?? false,
      onChange: (listener) => settings()?.onChange(listener) ?? (() => undefined),
    },
    moods: MoodStore.forApp(app),
    presented: presentedSceneOf(app),
    files: fileAccess(app),
    createCache: () => new OpusCache(window.indexedDB, opusCacheDatabaseName(app.appId), () => opusCacheBudget(navigator.storage)),
    createMaker: () => new SoundImporter(),
    prepareSource,
    readPeaks: readSoundPeaks,
    createContext: () => new AudioContext({ ...SOUND_CONTEXT_OPTIONS, latencyHint: 'playback' }),
    readRecords: async () => {
      await records.whenLoaded();
      return records.all().map(soundRecordOf);
    },
    onLibraryChange: (listener) => records.onChange(listener),
    onAudioFileChange: (listener) => {
      const heard = (file: { path: string }): void => {
        if (isAudioPath(file.path)) listener();
      };
      const refs = [app.vault.on('create', heard), app.vault.on('modify', heard), app.vault.on('rename', heard)];
      const dropLibrary = SoundLibrary.forApp(app).onChange(listener);
      return () => {
        refs.forEach((ref) => app.vault.offref(ref));
        dropLibrary();
      };
    },
    releaseLibrary: () => SoundLibrary.release(app),
    readSceneSound: (path) => sceneSoundInFile(app, path),
    notify: (message) => showNotice(message),
  };
}

