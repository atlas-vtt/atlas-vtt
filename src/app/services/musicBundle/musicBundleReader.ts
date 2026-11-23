import { readAtlasCopy, type AtlasCopyFacts } from '../../sound/codec/atlasOpus';
import { ITEM_COVER_ROLE } from '../itemBundle/itemBundleFormat';
import type { BundleProgressListener } from '../collectionBundle/bundleProgress';
import { readBundleArchive, type BundleArchive } from '../collectionBundle/bundleReader';
import { musicManifestProblem, type MusicBundleManifest } from './musicBundleFormat';
import { readMusicFiles } from './musicBundleFiles';
import { t } from '../../i18n';

/** A track of an opened music bundle: what the manifest says of it, its bytes, and what the copy says of itself. */
export interface MusicBundleTrack {
  path: string;
  title: string;
  bytes: Blob;
  facts: AtlasCopyFacts;
}

/** A music bundle whose manifest is sound, whose files match their checksums and whose every track is an Atlas copy. */
export interface OpenedMusicBundle {
  manifest: MusicBundleManifest;
  /** In playing order. */
  tracks: MusicBundleTrack[];
  cover: Blob | null;
}

/** What a track says of itself; null for a file that is no Atlas copy, whatever its bytes hold. */
async function copyFacts(bytes: Blob): Promise<AtlasCopyFacts | null> {
  try {
    return await readAtlasCopy(bytes);
  } catch {
    return null;
  }
}

/**
 * A read music bundle, checked: its manifest, every file's size and checksum, and every track an Atlas copy, as the
 * Armarium delivers them. A track that is not plays only after a conversion nobody agreed to, so the whole bundle is
 * refused. Each file is inflated once, and only after the zip's directory said it fits (`readMusicFiles`).
 */
export async function checkedMusicBundle({ zip, manifest }: BundleArchive, onProgress: BundleProgressListener = () => undefined): Promise<OpenedMusicBundle> {
  const problem = musicManifestProblem(manifest);
  if (problem) throw new Error(problem);
  const checked = manifest as MusicBundleManifest;
  const files = await readMusicFiles(zip, checked.files, onProgress);
  const tracks: MusicBundleTrack[] = [];
  for (const { path, title } of checked.item.tracks) {
    const bytes = files.get(path);
    const facts = bytes ? await copyFacts(bytes) : null;
    if (!bytes || !facts) throw new Error(t('armariumMusic.notCopies', { title }));
    tracks.push({ path, title, bytes, facts });
  }
  const coverFile = checked.files.find((file) => file.role === ITEM_COVER_ROLE);
  return { manifest: checked, tracks, cover: (coverFile && files.get(coverFile.vaultPath)) ?? null };
}

/** Reads and checks a music bundle; throws, saying why, for anything that is not a sound one. */
export async function readMusicBundle(data: Blob, onProgress: BundleProgressListener = () => undefined): Promise<OpenedMusicBundle> {
  return checkedMusicBundle(await readBundleArchive(data, onProgress), onProgress);
}
