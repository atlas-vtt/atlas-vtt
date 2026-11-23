import { readAtlasCopy } from '../../sound/codec/atlasOpus';
import { SOUND_RATE } from '../../sound/engine/soundMath';
import { importRoot } from '../../soundLibrary/libraryOperations';
import type { SoundLibrary } from '../../soundLibrary/SoundLibrary';
import type { SoundLocation } from '../../soundLibrary/soundLocation';
import { nameOfRelative } from '../../soundLibrary/soundPaths';
import { isLinked } from '../../soundLibrary/SoundRoots';
import { describeError } from '../../utils/errors';
import { sha256 } from '../../utils/hashing';
import type { MusicKind } from '../itemBundle/itemBundleFormat';
import type { ItemImportOptions } from '../itemBundle/itemImport';
import { installedMusic } from './installedMusic';
import type { OpenedMusicBundle } from './musicBundleReader';
import { planMusicImport, type MusicImportPlan, type PlannedTrack } from './musicImportPlan';
import { MUSIC_SIDECAR_FORMAT, sidecarText } from './musicProvenance';
import { t } from '../../i18n';

/** A file being written, beside where it goes: never listed, since it is no audio, and trashed when the install fails. */
const PART = '.atlas-part';

export interface MusicReviewTrack {
  title: string;
  seconds: number;
  bytes: number;
}

/** What the music review shows. */
export interface MusicReview {
  kind: MusicKind;
  name: string;
  artist: string | null;
  version: number;
  notes?: string | undefined;
  /** Who shared it, where the source knows (an Armarium install). */
  creator?: string | undefined;
  cover: Blob | null;
  tracks: MusicReviewTrack[];
  seconds: number;
  bytes: number;
  /** Where it goes: the music root, then the folders below it. */
  where: string[];
  /** What an update of the listing's install does; null for a new install. */
  update: { from: number; replaced: number; added: number; removed: number; kept: number } | null;
  /** This version lies there already, as it came. */
  same: boolean;
}

export interface MusicImportResult {
  kind: MusicKind;
  name: string;
  version: number;
  /** Added anew, an earlier version updated, or the same version found there already. */
  outcome: 'new' | 'update' | 'same';
  /** The tags of the music root that show what was installed: its folder's name. */
  tags: string[];
}

/** A read and checked music bundle, planned against the music root, waiting for the GM's decision. */
export interface MusicImportSession {
  review: MusicReview;
  /** Installs it; throws, leaving nothing of it behind, where a write failed or the folder changed since the review. */
  apply(): Promise<MusicImportResult>;
}

function reviewOf(bundle: OpenedMusicBundle, plan: MusicImportPlan, rootName: string, creator: string | undefined): MusicReview {
  const { kind, name, artist, version, notes } = bundle.manifest.item;
  const tracks = plan.tracks.map((track) => ({ title: track.title, seconds: track.source.facts.frames / SOUND_RATE, bytes: track.bytes.size }));
  const replaced = plan.tracks.filter((track) => track.replaces).length;
  const removed = plan.removes.filter((path) => path !== plan.installed?.sidecarPath).length;
  return {
    kind, name, artist: artist ?? null, version, notes: notes?.trim() || undefined, creator, cover: bundle.cover, tracks,
    seconds: tracks.reduce((sum, track) => sum + track.seconds, 0),
    bytes: tracks.reduce((sum, track) => sum + track.bytes, 0),
    where: [rootName, ...plan.folder.split('/').filter(Boolean)],
    update: plan.installed ? { from: plan.installed.sidecar.version, replaced, added: plan.tracks.length - replaced, removed, kept: plan.kept.length } : null,
    same: plan.same,
  };
}

/** Whether the plan made at the review still holds: the same folder, the same files, the same install updated. */
function samePlan(a: MusicImportPlan, b: MusicImportPlan): boolean {
  return a.folder === b.folder && a.sidecarPath === b.sidecarPath && a.installed?.sidecar.version === b.installed?.sidecar.version
    && a.tracks.length === b.tracks.length && a.tracks.every((track, index) => track.path === b.tracks[index]?.path && track.replaces === b.tracks[index]?.replaces)
    && a.removes.join('\n') === b.removes.join('\n');
}

/** Writes each track beside its place and reads it back; throws on the first that does not read as written. */
async function writeParts(location: SoundLocation, tracks: readonly PlannedTrack[], written: string[]): Promise<void> {
  for (const track of tracks) {
    const part = `${track.path}${PART}`;
    if (await location.exists(part)) await location.trash(part);
    await location.write(part, track.bytes);
    written.push(part);
    const back = await location.read(part);
    if ((await sha256(await back.arrayBuffer())) !== track.sha256 || !(await readAtlasCopy(back))) throw new Error(t('armariumMusic.verifyFailed', { title: track.title }));
  }
}

/** Puts every part in its place, trashes what the version before leaves, and writes the sidecar last. */
async function commit(location: SoundLocation, bundle: OpenedMusicBundle, plan: MusicImportPlan, moved: string[]): Promise<void> {
  for (const track of plan.tracks) {
    if (track.replaces) await location.trash(track.path);
    await location.move(`${track.path}${PART}`, track.path);
    moved.push(track.path);
  }
  for (const path of plan.removes) await location.trash(path);
  const { uid, version, kind, name, artist } = bundle.manifest.item;
  const tracks = plan.tracks.map((track) => ({ file: nameOfRelative(track.path), sha256: track.sha256 }));
  await location.replace(plan.sidecarPath, new Blob([sidecarText({ format: MUSIC_SIDECAR_FORMAT, uid, version, kind, name, artist: artist ?? null, tracks })], { type: 'application/json' }));
}

/** What an install that failed wrote goes to the trash: its parts, the tracks it put in place, and a folder it made. */
async function rollBack(location: SoundLocation, written: readonly string[], madeFolder: string | null): Promise<void> {
  const leftovers = madeFolder === null ? written : [madeFolder];
  for (const path of leftovers) {
    if (await location.exists(path).catch(() => false)) await location.trash(path).catch((error: unknown) => console.error(`[Atlas] Could not take back ${path}:`, error));
  }
}

async function applyMusicImport(library: SoundLibrary, bundle: OpenedMusicBundle, reviewed: MusicImportPlan, inPlace: boolean): Promise<MusicImportResult> {
  const { kind, name, version } = bundle.manifest.item;
  const location = importRoot(library, 'music');
  if (!location) throw new Error(t('armariumMusic.notHere'));
  const plan = await planMusicImport(location, bundle, await installedMusic(library), inPlace);
  if (!samePlan(plan, reviewed)) throw new Error(t('armariumMusic.changedSinceReview'));
  const tags = kind === 'music-album' || plan.folder !== '' ? [nameOfRelative(plan.folder)] : [];
  if (plan.same) return { kind, name, version, outcome: 'same', tags };
  const madeFolder = plan.folder !== '' && !(await location.exists(plan.folder)) ? plan.folder : null;
  const written: string[] = [];
  const moved: string[] = [];
  try {
    await location.makeFolder(plan.folder);
    await writeParts(location, plan.tracks, written);
    await commit(location, bundle, plan, moved);
  } catch (error) {
    // A part already moved lies at its track's place now: both are what this install wrote.
    await rollBack(location, [...written, ...moved], madeFolder);
    throw new Error(t('armariumMusic.installFailed', { reason: describeError(error).replace(/\.$/, '') }));
  } finally {
    await library.reread('music');
    await library.settle('music', [plan.folder, ...plan.tracks.map((track) => track.path), ...plan.removes].filter(Boolean));
  }
  return { kind, name, version, outcome: plan.installed ? 'update' : 'new', tags };
}

/**
 * Plans the install of a checked music bundle into the music root and shows what it would do; nothing is written,
 * not even the root's link, until `apply`. Only bytes the Armarium delivered for this listing (`listingUid`) may
 * update its install in place: a file from anywhere else names a uid anyone can read, and comes in beside.
 */
export async function openMusicImport(library: SoundLibrary, bundle: OpenedMusicBundle, options: ItemImportOptions = {}): Promise<MusicImportSession> {
  const root = library.rootOf('music');
  const location = library.locationOf('music');
  if (isLinked(root) && location === null) throw new Error(t('armariumMusic.notHere'));
  const inPlace = options.listingUid === bundle.manifest.item.uid;
  const plan = await planMusicImport(location, bundle, location ? await installedMusic(library) : [], inPlace);
  const review = reviewOf(bundle, plan, t('audio.music'), options.creator?.trim() || undefined);
  return { review, apply: () => applyMusicImport(library, bundle, plan, inPlace) };
}
