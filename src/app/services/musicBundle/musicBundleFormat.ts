/**
 * Music bundles: an album or a single track shared in the Armarium, in the zip every item travels in
 * (`manifest.json` first, the files under `files/<vaultPath>`), with an item manifest of format 11.
 * Every track lies at `music/<file name>` and is an Atlas copy (48 kHz Ogg Opus that `readAtlasCopy`
 * reads), the cover at the bundle's root. Pure.
 */

import { isRecord } from '../../utils/guards';
import { isBundleFile, isSafeBundlePath, SAFE_UID, type BundleFile, type BundleFileRole } from '../collectionBundle/bundleFormat';
import { ITEM_COVER_ROLE, MAX_ITEM_NOTES, MUSIC_BUNDLE_FORMAT, isMusicKind, type MusicKind } from '../itemBundle/itemBundleFormat';
import { t } from '../../i18n';

export const MUSIC_TRACK_ROLE: BundleFileRole = 'music-track';

/** The longest name, artist and track title a music manifest carries, in UTF-16 units (`length`), as the Armarium's rules count. */
export const MAX_MUSIC_TEXT = 120;
/** The tracks an album holds; a single holds one. */
export const MIN_ALBUM_TRACKS = 2;
export const MAX_ALBUM_TRACKS = 100;

/** One track of a music manifest, in playing order. */
export interface MusicTrackEntry {
  /** Where its file lies in the bundle: `music/<file name>`. */
  path: string;
  title: string;
}

/** manifest.json inside a music bundle. */
export interface MusicBundleManifest {
  format: typeof MUSIC_BUNDLE_FORMAT;
  exportedAt: number;
  item: {
    kind: MusicKind;
    /** The Armarium listing's uid: random when it was first shared. */
    uid: string;
    /** Equals `uid`: music has no id of its own in the vault. */
    id: string;
    /** The album's or the track's title. */
    name: string;
    version: number;
    /** What changed in this version. */
    notes?: string;
    artist?: string;
    tracks: MusicTrackEntry[];
  };
  files: BundleFile[];
}

/** Where a track lies in a bundle Atlas reads: one Opus file in `music/`. */
const TRACK_PATH = /^music\/[^/]+\.opus$/;
const COVER_PATH = /^cover\.(?:webp|png)$/;
/** Characters no file name on any disk holds, and control characters. */
const UNSAFE_NAME = /[\\/:*?"<>|\p{Cc}]/gu;
/** Names Windows keeps for devices, whatever follows a dot: `nul.x` is the device too. */
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)(?=\.|$)/i;
/**
 * The most bytes (UTF-8) a file or folder name of music takes before its number, suffix and extensions: ext4 and btrfs
 * hold 255 a name, and `01 <name> 12.opus.atlas-part` or `<name>.armarium.json.atlas-part` add up to 26 more.
 */
export const MAX_NAME_BYTES = 200;
/** A line break of any kind (U+2028 and U+2029 too) or a control character. */
const BREAK_OR_CONTROL = /[\p{Cc}\u2028\u2029]/u;
/**
 * Format characters, which change how text reads without being seen (U+202E turns it around); the joiners (U+200C,
 * U+200D) and emoji tag characters stay, as emoji and some scripts are written with them.
 */
const HIDDEN_FORMAT = /(?!\u200c|\u200d|[\u{e0020}-\u{e007f}])\p{Cf}/gu;
const utf8 = new TextEncoder();

/** A name, an artist or a title as Atlas shows it and names files by: its hidden format characters taken out. */
export function shownText(text: string): string {
  return text.replace(HIDDEN_FORMAT, '');
}

/**
 * The one rule for a line of music text, which shares and manifests both follow: no line break of any kind and no
 * control character. Hidden format characters do not break it; `shownText` takes them out wherever text is shown.
 */
export function isOneLine(text: string): boolean {
  return !BREAK_OR_CONTROL.test(text);
}

/**
 * Whether a name, an artist or a title is one a manifest may carry: one line, something to show, at most 120 UTF-16
 * units, as the Armarium's rules count (an emoji takes two), so nothing Atlas packs is refused there for its length.
 */
export function isMusicText(value: unknown): value is string {
  return typeof value === 'string' && shownText(value).trim() !== '' && value.length <= MAX_MUSIC_TEXT && isOneLine(value);
}

/** The longest start of `text` whose UTF-8 takes at most `maxBytes`, cut between graphemes, so no emoji or accent is split. */
export function cutToBytes(text: string, maxBytes: number): string {
  if (utf8.encode(text).length <= maxBytes) return text;
  let cut = '';
  let bytes = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    bytes += utf8.encode(segment).length;
    if (bytes > maxBytes) break;
    cut += segment;
  }
  return cut;
}

/**
 * What a text may be called as a file or folder: what no disk holds replaced, hidden format characters out, no dot in
 * front or blank behind, at most `MAX_NAME_BYTES` of UTF-8, and a device name of Windows made a name.
 */
export function safeFileName(text: string, fallback: string): string {
  const cleaned = cutToBytes(shownText(text).replace(UNSAFE_NAME, '-').replace(/\s+/g, ' ').trim(), MAX_NAME_BYTES)
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '');
  if (cleaned === '') return fallback;
  return cleaned.replace(RESERVED_NAME, '$1_');
}

/** A track's number in an album's file names, as wide as the album's last: `01` of twelve, `007` of a hundred. */
export function trackNumber(index: number, count: number): string {
  return String(index + 1).padStart(Math.max(2, String(count).length), '0');
}

/** A track's file name: `<NN> <title>.opus` in an album, `<title>.opus` for a single. */
export function trackFileName(kind: MusicKind, index: number, count: number, title: string): string {
  const name = safeFileName(title, 'Track');
  return kind === 'music-album' ? `${trackNumber(index, count)} ${name}.opus` : `${name}.opus`;
}

/** `<name> v<n>.atlas-album.zip` or `<name> v<n>.atlas-track.zip`. */
export function musicBundleFileName(name: string, version: number, kind: MusicKind): string {
  return `${safeFileName(name, 'Music')} v${version}.${kind === 'music-album' ? 'atlas-album' : 'atlas-track'}.zip`;
}

/** How many tracks a bundle of `kind` holds: one for a single, 2 to 100 for an album. */
export function holdsTrackCount(kind: MusicKind, count: number): boolean {
  return kind === 'music-track' ? count === 1 : count >= MIN_ALBUM_TRACKS && count <= MAX_ALBUM_TRACKS;
}

const isWholeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

function isTrackEntry(value: unknown): value is MusicTrackEntry {
  return isRecord(value) && typeof value.path === 'string' && isMusicText(value.title);
}

function isMusicItem(item: unknown): item is MusicBundleManifest['item'] {
  if (!isRecord(item)) return false;
  const { kind, uid, id, name, version, notes, artist, tracks } = item;
  return isMusicKind(kind)
    && typeof uid === 'string' && SAFE_UID.test(uid)
    && id === uid
    && isMusicText(name)
    && isWholeNumber(version)
    && (notes === undefined || (typeof notes === 'string' && [...notes].length <= MAX_ITEM_NOTES))
    && (artist === undefined || isMusicText(artist))
    && Array.isArray(tracks) && tracks.every(isTrackEntry);
}

/** The stem a path is compared by: two tracks whose names differ only in case or extension would become one file. */
const stemKey = (path: string): string => path.slice(0, path.lastIndexOf('.')).toLowerCase();

/** Whether the files are those the item names: each track once, at most one cover, nothing else, nothing linked. */
function holdsItsFiles(item: MusicBundleManifest['item'], files: readonly BundleFile[]): boolean {
  if (files.some((file) => (file.role !== MUSIC_TRACK_ROLE && file.role !== ITEM_COVER_ROLE) || file.linkedFrom !== undefined)) return false;
  const covers = files.filter((file) => file.role === ITEM_COVER_ROLE);
  if (covers.length > 1 || covers.some((file) => !COVER_PATH.test(file.vaultPath))) return false;
  const tracks = files.filter((file) => file.role === MUSIC_TRACK_ROLE);
  if (!tracks.every((file) => TRACK_PATH.test(file.vaultPath) && isSafeBundlePath(file.vaultPath))) return false;
  const listed = item.tracks.map((track) => track.path);
  if (new Set(listed.map(stemKey)).size !== listed.length) return false;
  if (tracks.length !== listed.length) return false;
  const filed = new Set(tracks.map((file) => file.vaultPath));
  return listed.every((path) => filed.has(path));
}

/** Why a music bundle cannot be installed, or null when its manifest is sound. Its tracks are read on opening. */
export function musicManifestProblem(value: unknown): string | null {
  if (!isRecord(value) || typeof value.format !== 'number') return t('itemBundle.notItem');
  if (value.format > MUSIC_BUNDLE_FORMAT) return t('itemBundle.tooNew');
  const { item, files } = value;
  const isSound = value.format === MUSIC_BUNDLE_FORMAT
    && typeof value.exportedAt === 'number'
    && isMusicItem(item)
    && holdsTrackCount(item.kind, item.tracks.length)
    && Array.isArray(files)
    && files.every(isBundleFile)
    && holdsItsFiles(item, files);
  return isSound ? null : t('itemBundle.damaged');
}
