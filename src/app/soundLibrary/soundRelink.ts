import type { App } from 'obsidian';
import { AssetService, type SoundAsset } from '../services/AssetService';
import { runInBackground } from '../utils/backgroundTask';
import type { SoundLibrary } from './SoundLibrary';
import type { SoundKind } from '../sound/soundTypes';
import type { SoundFileEntry } from './soundLocation';
import { nameOfRelative } from './soundPaths';

/**
 * Where records of a root's missing files have gone: found by name and size among what the root holds,
 * the first in path order where several match, so every device with these files finds the same. A record
 * without a size is left to wait.
 */
function relinksIn(
  sounds: readonly SoundAsset[],
  kind: SoundKind,
  files: readonly SoundFileEntry[],
  fileOf: (audioPath: string) => { kind: SoundKind; path: string } | null,
  audioPathOf: (path: string) => string | null,
): Map<string, string> {
  const present = new Set(files.map((file) => file.path));
  const byIdentity = new Map<string, string>();
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const identity = `${file.size}|${file.name}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, file.path);
  }
  const moves = new Map<string, string>();
  for (const sound of sounds) {
    const file = fileOf(sound.audioPath);
    if (file?.kind !== kind || present.has(file.path) || sound.audioSize === undefined) continue;
    const found = byIdentity.get(`${sound.audioSize}|${nameOfRelative(file.path)}`);
    const audioPath = found === undefined ? null : audioPathOf(found);
    if (audioPath !== null) moves.set(sound.id, audioPath);
  }
  return moves;
}

/** Applies what a root's walk found: every record of a missing file that is back, in one save. */
export async function relinkRecords(library: SoundLibrary, assets: Pick<AssetService, 'getAssets' | 'rewriteAssets'>, kind: SoundKind, now = Date.now()): Promise<boolean> {
  if (!library.isWalked(kind)) return false;
  const moves = relinksIn(await assets.getAssets(undefined, 'sound'), kind, library.filesOf(kind), (audioPath) => library.fileOfAudioPath(audioPath), (path) => library.audioPathOf(kind, path));
  if (moves.size === 0) return false;
  return assets.rewriteAssets((asset) => {
    const audioPath = moves.get(asset.id);
    if (asset.type !== 'sound' || audioPath === undefined) return false;
    asset.audioPath = audioPath;
    asset.modifiedAt = now;
    return true;
  });
}

/** Keeps records with their files for as long as the library lives. */
export function followMissingFiles(library: SoundLibrary, app: App): void {
  library.onWalked((kind) => {
    runInBackground(relinkRecords(library, AssetService.getInstance(app), kind).then((moved) => {
      if (moved) app.workspace.trigger('atlas-vtt:refresh-assets');
    }), 'Finding sounds that moved');
  });
}
