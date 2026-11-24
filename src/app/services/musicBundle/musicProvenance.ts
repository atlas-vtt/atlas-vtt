/**
 * Where music installed from the Armarium came from: a visible file beside it, `Armarium.json` in an album's folder,
 * `<title>.armarium.json` beside a single track. It names the listing, the version and every file as it was written
 * (its SHA-256), so an update replaces only what the GM left as it came, and the Armarium page knows what is
 * installed. It moves and syncs with the folder, as the music does. Pure.
 */

import { isRecord } from '../../utils/guards';
import { SAFE_UID } from '../collectionBundle/bundleFormat';
import { isMusicKind, type MusicKind } from '../itemBundle/itemBundleFormat';
import { stemOf } from '../../soundLibrary/soundPaths';
import { MAX_ALBUM_TRACKS, isMusicText } from './musicBundleFormat';

export const MUSIC_SIDECAR_FORMAT = 1;
/** The sidecar of an album, in its folder. */
export const ALBUM_SIDECAR = 'Armarium.json';
const TRACK_SIDECAR_SUFFIX = '.armarium.json';

/** One file the install wrote, by its name in the sidecar's folder. */
export interface SidecarTrack {
  file: string;
  sha256: string;
}

export interface MusicSidecar {
  format: typeof MUSIC_SIDECAR_FORMAT;
  uid: string;
  version: number;
  kind: MusicKind;
  name: string;
  artist: string | null;
  tracks: SidecarTrack[];
}

const SHA256 = /^[0-9a-f]{64}$/;

/** A file name of the sidecar's own folder: no folder in it, nothing hidden. */
const isFileName = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && value.length <= 255 && !value.startsWith('.') && !/[\\/\p{Cc}]/u.test(value);

function isSidecarTrack(value: unknown): value is SidecarTrack {
  return isRecord(value) && isFileName(value.file) && typeof value.sha256 === 'string' && SHA256.test(value.sha256);
}

/** The sidecar a file's text holds, when it is a sound one of a format this version reads; null for anything else. */
export function readSidecar(text: string): MusicSidecar | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.format !== MUSIC_SIDECAR_FORMAT) return null;
  const { uid, version, kind, name, artist, tracks } = value;
  if (typeof uid !== 'string' || !SAFE_UID.test(uid) || !isMusicKind(kind) || !isMusicText(name)) return null;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) return null;
  if (artist !== undefined && artist !== null && !isMusicText(artist)) return null;
  if (!Array.isArray(tracks) || tracks.length === 0 || tracks.length > MAX_ALBUM_TRACKS || !tracks.every(isSidecarTrack)) return null;
  return { format: MUSIC_SIDECAR_FORMAT, uid, version, kind, name, artist: typeof artist === 'string' ? artist : null, tracks: tracks.map(({ file, sha256 }) => ({ file, sha256 })) };
}

export function sidecarText(sidecar: MusicSidecar): string {
  return `${JSON.stringify(sidecar, null, 2)}\n`;
}

/** The sidecar beside a single track: `Tavern.opus` has `Tavern.armarium.json`. */
export function trackSidecarName(trackFile: string): string {
  return `${stemOf(trackFile)}${TRACK_SIDECAR_SUFFIX}`;
}
