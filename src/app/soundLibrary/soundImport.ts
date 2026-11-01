import type { App, TFile } from 'obsidian';
import { isPathTaken, ensureFolder } from '../plugin/vaultFolders';
import { INVALID_NAME_CHARACTERS } from '../services/assetPaths';
import type { AssetService, NewAsset, SoundAsset } from '../services/AssetService';
import { freePathIn } from '../services/collectionBundle/pathRemap';
import { ownedPaths } from '../services/vault-sync/assetFiles';
import { isReservedCollectionPath } from '../services/vault-sync/reservedPaths';
import { baseName, parentPath } from '../utils/pathUtils';
import { readAudioSeconds } from './audioDuration';
import { isAudioPath, soundsFolderOf } from './soundFiles';
import { defaultSoundKind } from './soundRecords';

/** What an import did. */
export interface SoundImportOutcome {
  added: SoundAsset[];
  /** Files that are no audio by their name. */
  refused: string[];
  /** Files that could not be stored. */
  failed: string[];
}

export interface SoundImportDeps {
  app: App;
  assetService: AssetService;
  /** How long a file plays, in seconds, null when it cannot be told. */
  secondsOf?: (source: File | TFile) => Promise<number | null>;
}

const stemOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

const asFileName = (name: string): string =>
  name.replace(new RegExp(INVALID_NAME_CHARACTERS.source, 'g'), '-').replace(/^\.+/, '') || 'sound';

function newSound(path: string, collection: string, seconds: number | null): NewAsset {
  const name = baseName(path);
  return {
    type: 'sound',
    name: stemOf(name),
    tags: [],
    collection,
    audioPath: path,
    kind: defaultSoundKind(name, seconds),
    licence: 'unknown',
    streaming: 'unknown',
  };
}

const isSound = (asset: { type: string }): asset is SoundAsset => asset.type === 'sound';

/**
 * Stores a file from outside the vault in the collection's `sounds/` and records it, under the index
 * lock, so the vault check never sees the file without its record. A file of that name and size is
 * the same file dropped again: it is not written twice, and takes a record only if it has none.
 */
async function storeDropped(deps: SoundImportDeps, file: File, collectionId: string, seconds: number | null): Promise<SoundAsset | null> {
  const { app, assetService } = deps;
  const folder = soundsFolderOf(collectionId);
  return assetService.runExclusive(async () => {
    const name = asFileName(file.name);
    const here = app.vault.getFileByPath(`${folder}/${name}`);
    const dropped = here !== null && here.stat.size === file.size;
    const path = dropped ? here.path : freePathIn(folder, name, (candidate) => isPathTaken(app, candidate));
    if (dropped && (await assetService.getAssets(collectionId, 'sound')).some((sound) => sound.audioPath === path)) return null;
    if (!dropped) {
      await ensureFolder(app, folder);
      await app.vault.createBinary(path, await file.arrayBuffer());
    }
    try {
      const added = await assetService.addAsset(newSound(path, collectionId, seconds));
      return isSound(added) ? added : null;
    } catch (error) {
      const written = dropped ? null : app.vault.getFileByPath(path);
      if (written) await app.fileManager.trashFile(written);
      throw error;
    }
  });
}

/** Stores files from outside the vault and records them, one at a time: a track can be hundreds of megabytes. */
export async function importSoundFiles(
  deps: SoundImportDeps,
  files: readonly File[],
  collectionId: string,
  onStep?: (done: number, total: number) => void,
): Promise<SoundImportOutcome> {
  const secondsOf = deps.secondsOf ?? ((source): Promise<number | null> => readAudioSeconds(deps.app, source));
  const outcome: SoundImportOutcome = { added: [], refused: [], failed: [] };
  for (const [index, file] of files.entries()) {
    onStep?.(index, files.length);
    if (!isAudioPath(file.name)) {
      outcome.refused.push(file.name);
      continue;
    }
    try {
      const added = await storeDropped(deps, file, collectionId, await secondsOf(file));
      if (added) outcome.added.push(added);
    } catch (error) {
      console.error(`[Atlas] Could not add the sound ${file.name}:`, error);
      outcome.failed.push(file.name);
    }
  }
  return outcome;
}

/** Records files already in the vault where they lie, in one save; nothing is copied. A file the collection already holds stays as it is. */
export async function recordVaultSounds(deps: SoundImportDeps, files: readonly TFile[], collectionId: string): Promise<SoundAsset[]> {
  const { app, assetService } = deps;
  const secondsOf = deps.secondsOf ?? ((source): Promise<number | null> => readAudioSeconds(app, source));
  const lengths = new Map<string, number | null>();
  for (const file of files) lengths.set(file.path, await secondsOf(file));
  return assetService.runExclusive(async () => {
    const known = new Set((await assetService.getAssets(collectionId, 'sound')).map((sound) => sound.audioPath));
    const fresh = files.filter((file) => !known.has(file.path));
    if (fresh.length === 0) return [];
    const added = await assetService.addAssets(fresh.map((file) => newSound(file.path, collectionId, lengths.get(file.path) ?? null)));
    return added.filter(isSound);
  });
}

/**
 * The vault's audio files a collection has no sound for, below `folder` if given. Files other
 * assets stand on (a video map) are none, a sound of another collection does not stand in the way.
 */
export async function unrecordedAudio(app: App, assetService: AssetService, collectionId: string, folder?: string): Promise<TFile[]> {
  const taken = new Set((await assetService.getAssets()).flatMap((asset) => {
    if (asset.type !== 'sound') return ownedPaths(asset);
    return asset.collection === collectionId ? [asset.audioPath] : [];
  }));
  return app.vault.getFiles()
    .filter((file) => isAudioPath(file.path) && !taken.has(file.path) && !isReservedCollectionPath(file.path)
      && (folder === undefined || parentPath(file.path) === folder || file.path.startsWith(`${folder}/`)))
    .sort((a, b) => a.path.localeCompare(b.path));
}
