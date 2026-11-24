import { SOUND_RATE } from '../../sound/engine/soundMath';
import { importRoot } from '../../soundLibrary/libraryOperations';
import type { SoundLibrary } from '../../soundLibrary/SoundLibrary';
import type { SoundLocation } from '../../soundLibrary/soundLocation';
import { nameOfRelative } from '../../soundLibrary/soundPaths';
import { isLinked } from '../../soundLibrary/SoundRoots';
import { describeError } from '../../utils/errors';
import type { MusicKind } from '../itemBundle/itemBundleFormat';
import type { ItemImportOptions } from '../itemBundle/itemImport';
import { installedMusic, type InstalledMusic } from './installedMusic';
import { shownText } from './musicBundleFormat';
import type { OpenedMusicBundle } from './musicBundleReader';
import { planMusicImport, type MusicImportPlan } from './musicImportPlan';
import { installMusicFiles, type LetGoFiles } from './musicInstallFiles';
import { followInstall, type MusicRecords } from './musicInstallRecords';
import { MUSIC_SIDECAR_FORMAT, sidecarText } from './musicProvenance';
import { t } from '../../i18n';

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
  /**
   * What an update of the listing's install does; null for a new install. `unchanged` tracks stay as they are, `renamed`
   * ones only take a new name; `kept` counts files the GM changed, which stay beside the new ones.
   */
  update: { from: number; replaced: number; renamed: number; unchanged: number; added: number; removed: number; kept: number } | null;
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
  /** Names of old files the trash did not take, back in the music folder for the GM to delete. */
  putBack: string[];
}

/** The Sound library an install goes into, and the records that name its files. */
export interface MusicLibrary {
  library: SoundLibrary;
  records: MusicRecords;
}

/** A read and checked music bundle, planned against the music root, waiting for the GM's decision. */
export interface MusicImportSession {
  review: MusicReview;
  /** Installs it; throws, leaving nothing of it behind, where a write failed or the folder changed since the review. */
  apply(): Promise<MusicImportResult>;
}

function reviewOf(bundle: OpenedMusicBundle, plan: MusicImportPlan, rootName: string, creator: string | undefined): MusicReview {
  const { kind, name, artist, version, notes } = bundle.manifest.item;
  const tracks = plan.tracks.map((track) => ({ title: shownText(track.title), seconds: track.source.facts.frames / SOUND_RATE, bytes: track.bytes.size }));
  const replaced = plan.tracks.filter((track) => track.replaces).length;
  const unchanged = plan.tracks.filter((track) => track.from === track.path).length;
  const renamed = plan.tracks.filter((track) => track.from !== null && track.from !== track.path).length;
  const removed = plan.removes.filter((path) => path !== plan.installed?.sidecarPath).length;
  return {
    kind, name: shownText(name), artist: artist === undefined ? null : shownText(artist), version, notes: notes?.trim() || undefined, creator, cover: bundle.cover, tracks,
    seconds: tracks.reduce((sum, track) => sum + track.seconds, 0),
    bytes: tracks.reduce((sum, track) => sum + track.bytes, 0),
    where: [rootName, ...plan.folder.split('/').filter(Boolean)],
    update: plan.installed ? { from: plan.installed.sidecar.version, replaced, renamed, unchanged, added: plan.tracks.length - replaced - renamed - unchanged, removed, kept: plan.kept.length } : null,
    same: plan.same,
  };
}

/** Whether the plan made at the review still holds: the same folder, the same files, the same install updated. */
function samePlan(a: MusicImportPlan, b: MusicImportPlan): boolean {
  return a.folder === b.folder && a.sidecarPath === b.sidecarPath && a.installed?.sidecar.version === b.installed?.sidecar.version
    && a.tracks.length === b.tracks.length && a.tracks.every((track, index) => track.path === b.tracks[index]?.path && track.replaces === b.tracks[index]?.replaces && track.from === b.tracks[index]?.from)
    && a.removes.join('\n') === b.removes.join('\n');
}

/** Whether the install takes files of the version before away: those go to the trash once it stands, never for good. */
const takesAway = (plan: MusicImportPlan): boolean => plan.removes.length > 0 || plan.tracks.some((track) => track.replaces);

/** The installs that are what the music root holds, or a sentence why they cannot be known yet. */
async function knownInstalls(library: SoundLibrary, location: SoundLocation | null): Promise<InstalledMusic[]> {
  const installs = location ? await installedMusic(library) : [];
  if (installs === null) throw new Error(t('armariumMusic.stillReading'));
  return installs;
}

/** Refuses a plan that would take files away where the root has no trash, before anything is written. */
function refuseWithoutTrash(location: SoundLocation | null, plan: MusicImportPlan): void {
  if (location !== null && takesAway(plan) && !location.canTrash()) throw new Error(t('armariumMusic.noTrash'));
}

/** One install of music at a time per library: two would plan on a folder the other is writing to. */
const installing = new WeakMap<SoundLibrary, Promise<unknown>>();

function oneAtATime<T>(library: SoundLibrary, run: () => Promise<T>): Promise<T> {
  const before = installing.get(library) ?? Promise.resolve();
  const turn = before.catch(() => undefined).then(run);
  installing.set(library, turn);
  return turn;
}

async function applyMusicImport({ library, records }: MusicLibrary, bundle: OpenedMusicBundle, reviewed: MusicImportPlan, inPlace: boolean): Promise<MusicImportResult> {
  const { kind, name, version } = bundle.manifest.item;
  const location = importRoot(library, 'music');
  if (!location) throw new Error(t('armariumMusic.notHere'));
  const plan = await planMusicImport(location, bundle, await knownInstalls(library, location), inPlace);
  if (!samePlan(plan, reviewed)) throw new Error(t('armariumMusic.changedSinceReview'));
  refuseWithoutTrash(location, plan);
  const tags = kind === 'music-album' || plan.folder !== '' ? [nameOfRelative(plan.folder)] : [];
  if (plan.same) return { kind, name: shownText(name), version, outcome: 'same', tags, putBack: [] };
  let letGo: LetGoFiles;
  try {
    letGo = await installMusicFiles(location, plan, plan.sidecarPath === null ? null : sidecarOf(bundle, plan));
  } catch (error) {
    throw new Error(t('armariumMusic.installFailed', { reason: describeError(error).replace(/\.$/, '') }));
  } finally {
    await library.reread('music');
    await library.settle('music', [plan.folder, ...plan.tracks.flatMap((track) => [track.path, track.from ?? '']), ...plan.removes].filter(Boolean));
  }
  await followInstall(records, library, plan, letGo).catch((error: unknown) => console.error('[Atlas] The sound records could not follow the music install:', error));
  const putBack = [...letGo.putBack.values(), ...letGo.strays].map(nameOfRelative);
  return { kind, name: shownText(name), version, outcome: plan.installed ? 'update' : 'new', tags, putBack };
}

/** What the sidecar records of an install: the listing, and every file as it was written. */
function sidecarOf(bundle: OpenedMusicBundle, plan: MusicImportPlan): Blob {
  const { uid, version, kind, name, artist } = bundle.manifest.item;
  const tracks = plan.tracks.map((track) => ({ file: nameOfRelative(track.path), sha256: track.sha256 }));
  return new Blob([sidecarText({ format: MUSIC_SIDECAR_FORMAT, uid, version, kind, name, artist: artist ?? null, tracks })], { type: 'application/json' });
}

/**
 * Plans the install of a checked music bundle into the music root and shows what it would do; nothing is written,
 * not even the root's link, until `apply`. Only bytes the Armarium delivered for this listing (`listingUid`) may
 * update its install in place and are recorded as its install: a file from anywhere else names a uid anyone can
 * read, and comes in beside without a sidecar. Refused, saying why, where the root is linked on another device only,
 * is not read whole yet, or has no trash for files an update would take away. Installs run one at a time.
 */
export async function openMusicImport(music: MusicLibrary, bundle: OpenedMusicBundle, options: ItemImportOptions = {}): Promise<MusicImportSession> {
  const { library } = music;
  const root = library.rootOf('music');
  const location = library.locationOf('music');
  if (root.status === 'not-linked-here' || (isLinked(root) && location === null)) throw new Error(t('armariumMusic.notHere'));
  const inPlace = options.listingUid === bundle.manifest.item.uid;
  const plan = await planMusicImport(location, bundle, await knownInstalls(library, location), inPlace);
  refuseWithoutTrash(location, plan);
  const review = reviewOf(bundle, plan, t('audio.music'), options.creator?.trim() || undefined);
  return { review, apply: () => oneAtATime(library, () => applyMusicImport(music, bundle, plan, inPlace)) };
}
