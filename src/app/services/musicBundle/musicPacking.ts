import { forPlayers } from '../../sound/codec/atlasOpus';
import { sha256 } from '../../utils/hashing';
import { derivedImageExtension } from '../assetImageFiles';
import { BUNDLE_MANIFEST, zipPathFor, type BundleFile } from '../collectionBundle/bundleFormat';
import { ITEM_COVER_ROLE, cutItemNotes, MUSIC_BUNDLE_FORMAT, itemCoverPath, type MusicKind } from '../itemBundle/itemBundleFormat';
import { MUSIC_TRACK_ROLE, holdsTrackCount, musicBundleFileName, musicManifestProblem, shownText, trackFileName, type MusicBundleManifest, type MusicTrackEntry } from './musicBundleFormat';

/** A track a share packs: its title, and its Atlas copy as this device keeps it. */
export interface MusicTrackInput {
  title: string;
  copy: Blob;
}

/** The listing a music bundle is packed for, and what it holds. */
export interface MusicPackOptions {
  kind: MusicKind;
  uid: string;
  version: number;
  name: string;
  artist?: string | undefined;
  notes?: string | undefined;
  /** In playing order. */
  tracks: readonly MusicTrackInput[];
  /** The cover the listing shows, already made a cover (`renderCover`). */
  cover?: ArrayBuffer | undefined;
}

/** What of the music Atlas could not read while packing it: the cover, or a track by its title. */
export type UnreadablePart = { readonly part: 'cover' } | { readonly part: 'track'; readonly title: string };

/** Packing stopped at a part it could not read (a file moved or changed since it was chosen); `cause` holds the engine's error. */
export class UnreadablePartError extends Error {
  constructor(readonly unreadable: UnreadablePart, cause: unknown) {
    super(unreadable.part === 'cover' ? 'The cover could not be read.' : `The track "${unreadable.title}" could not be read.`, { cause });
  }
}

export interface MusicExport {
  /** `<name> v<n>.atlas-album.zip` or `<name> v<n>.atlas-track.zip`. */
  fileName: string;
  blob: Blob;
  manifest: MusicBundleManifest;
}

/**
 * Packs music for the Armarium as a bundle of format 11: the manifest first, then every track at
 * `music/<NN> <title>.opus` (a single at `music/<title>.opus`) and the cover, each with its SHA-256, stored
 * uncompressed (Opus does not shrink). A copy leaves the device as players get it (`forPlayers`): none of
 * Atlas' facts, so neither the source's hash nor its file name goes along; the Armarium measures and tags it.
 */
export async function packMusicBundle(options: MusicPackOptions): Promise<MusicExport> {
  const { kind, tracks } = options;
  if (!holdsTrackCount(kind, tracks.length)) throw new Error(`A ${kind} cannot hold ${tracks.length} tracks.`);
  const contents: { file: Omit<BundleFile, 'sha256'>; data: Uint8Array<ArrayBuffer> }[] = [];
  const entries: MusicTrackEntry[] = [];
  for (const [index, track] of tracks.entries()) {
    const title = shownText(track.title).trim();
    const path = `music/${trackFileName(kind, index, tracks.length, title)}`;
    entries.push({ path, title });
    const data = await forPlayers(track.copy).then((copy) => copy.arrayBuffer()).catch((cause: unknown) => {
      throw new UnreadablePartError({ part: 'track', title }, cause);
    });
    contents.push({ file: { vaultPath: path, role: MUSIC_TRACK_ROLE }, data: new Uint8Array(data) });
  }
  if (options.cover) contents.push({ file: { vaultPath: itemCoverPath(derivedImageExtension(options.cover)), role: ITEM_COVER_ROLE }, data: new Uint8Array(options.cover) });
  const files: BundleFile[] = [];
  for (const { file, data } of contents) files.push({ ...file, sha256: await sha256(data.buffer) });
  const artist = options.artist === undefined ? undefined : shownText(options.artist).trim();
  const notes = cutItemNotes(options.notes);
  const manifest: MusicBundleManifest = {
    format: MUSIC_BUNDLE_FORMAT,
    exportedAt: Date.now(),
    item: { kind, uid: options.uid, id: options.uid, name: shownText(options.name).trim(), version: options.version, ...(notes ? { notes } : {}), ...(artist ? { artist } : {}), tracks: entries },
    files,
  };
  const problem = musicManifestProblem(manifest);
  if (problem) throw new Error(problem);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  // The manifest leads the zip, so a reader knows what it holds before the files.
  zip.file(BUNDLE_MANIFEST, JSON.stringify(manifest, null, 2), { compression: 'DEFLATE' });
  for (const { file, data } of contents) zip.file(zipPathFor(file.vaultPath), data, { compression: 'STORE' });
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  return { fileName: musicBundleFileName(manifest.item.name, options.version, kind), blob, manifest };
}
