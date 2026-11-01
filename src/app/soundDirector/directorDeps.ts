import { normalizePath, type App } from 'obsidian';
import { AssetService } from '../services/AssetService';
import { presentedSceneOf, type PresentedSceneSource } from '../services/presentedScene';
import { SettingsService } from '../services/SettingsService';
import { OpusCache, opusCacheBudget, opusCacheDatabaseName } from '../sound/codec/opusCache';
import { SoundImporter } from '../sound/codec/soundImporter';
import { SOUND_CONTEXT_OPTIONS } from '../sound/engine/soundMath';
import type { SceneSound, SoundRecord } from '../sound/soundTypes';
import { MoodStore } from '../soundLibrary/MoodStore';
import { readSceneSound } from '../soundLibrary/sceneSound';
import { isAudioPath } from '../soundLibrary/soundFiles';
import { provideSoundConversion, type SoundConversionState } from '../soundLibrary/soundConversion';
import { soundRecordsOf } from '../soundLibrary/soundRecords';
import { showNotice } from '../ui/notice';
import { isRecord } from '../utils/guards';
import type { CopyCache, CopyMaker, SoundFileAccess } from './soundCopies';
import type { OutputContext } from './soundOutput';
import type { SoundSettings } from '../services/soundSettings';

export type DirectorSettings = {
  getSoundSettings(): SoundSettings;
  setSoundSettings(changes: Partial<SoundSettings>): void;
  isOn(): boolean;
  onChange(listener: () => void): () => void;
};

export type DirectorMoods = Pick<MoodStore, 'moodsOf' | 'mood' | 'whenLoaded' | 'createMood' | 'saveMood'>;

/** Everything the director reaches outside itself; tests hand in their own. */
export interface SoundDirectorDeps {
  storage: Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;
  settings: DirectorSettings;
  moods: DirectorMoods;
  presented: Pick<PresentedSceneSource, 'get' | 'onChange'>;
  files: SoundFileAccess;
  createCache(): CopyCache;
  createMaker(): CopyMaker & { dispose(): void };
  createContext(): OutputContext;
  provideConversion(source: SoundConversionState): () => void;
  readRecords(): Promise<SoundRecord[]>;
  /** Calls back when sounds may have been added or changed. */
  onLibraryChange(listener: () => void): () => void;
  /** Calls back when an audio file arrived or changed in the vault. */
  onAudioFileChange(listener: () => void): () => void;
  readSceneSound(path: string): Promise<SceneSound | null>;
  /** A scene's collection; a map outside them all uses the default one's moods. */
  collectionOf(scenePath: string): string;
  notify(message: string): void;
}

function fileAccess(app: App): SoundFileAccess {
  const fileOf = (path: string): ReturnType<App['vault']['getFileByPath']> => app.vault.getFileByPath(normalizePath(path));
  return {
    statOf: (path) => fileOf(path)?.stat ?? null,
    read: (path) => {
      const file = fileOf(path);
      return file ? app.vault.readBinary(file) : Promise.reject(new Error(`${path} is not in the vault.`));
    },
  };
}

async function sceneSoundInFile(app: App, path: string): Promise<SceneSound | null> {
  const file = app.vault.getFileByPath(normalizePath(path));
  if (!file) return null;
  try {
    const data: unknown = JSON.parse(await app.vault.cachedRead(file));
    return isRecord(data) && isRecord(data.state) ? readSceneSound(data.state.sound) : null;
  } catch (error) {
    console.error(`[Atlas] Could not read the sound of ${path}`, error);
    return null;
  }
}

/** What the director runs on in Obsidian. */
export function realDirectorDeps(app: App): SoundDirectorDeps {
  const assets = (): AssetService => AssetService.getInstance(app);
  const settings = (): SettingsService | undefined => SettingsService.forApp(app);
  return {
    storage: app,
    settings: {
      getSoundSettings: () => settings()?.getSoundSettings() ?? { musicDb: 0, ambienceDb: -6, masterDb: 0, fadeSeconds: 4, followScenes: true },
      setSoundSettings: (changes) => settings()?.setSoundSettings(changes),
      isOn: () => settings()?.isExperimentalOn('sound') ?? false,
      onChange: (listener) => settings()?.onChange(listener) ?? (() => undefined),
    },
    moods: MoodStore.forApp(app),
    presented: presentedSceneOf(app),
    files: fileAccess(app),
    createCache: () => new OpusCache(window.indexedDB, opusCacheDatabaseName(app.appId), () => opusCacheBudget(navigator.storage)),
    createMaker: () => new SoundImporter(),
    createContext: () => new AudioContext({ ...SOUND_CONTEXT_OPTIONS, latencyHint: 'playback' }),
    provideConversion: (source) => provideSoundConversion(app, source),
    readRecords: async () => {
      await assets().initialize();
      return soundRecordsOf(assets());
    },
    onLibraryChange: (listener) => {
      const ref = app.workspace.on('atlas-vtt:refresh-assets', listener);
      return () => app.workspace.offref(ref);
    },
    onAudioFileChange: (listener) => {
      const heard = (file: { path: string }): void => {
        if (isAudioPath(file.path)) listener();
      };
      const refs = [app.vault.on('create', heard), app.vault.on('modify', heard), app.vault.on('rename', heard)];
      return () => refs.forEach((ref) => app.vault.offref(ref));
    },
    readSceneSound: (path) => sceneSoundInFile(app, path),
    collectionOf: (scenePath) => assets().getCollectionForMap(scenePath) ?? assets().getDefaultCollectionId(),
    notify: (message) => showNotice(message),
  };
}

