import type { Asset, CollectionMetadata } from '../AssetService';
import { isLibraryOwnFile } from '../library/libraryPaths';
import { isRecord } from '../../utils/guards';
import { LEGACY_SNAPSHOTS_DIR } from '../../snapshots/snapshotPaths';
import { STATBLOCK_IMAGE_KEYS, type StatblockImageKey } from '../statblockImageKeys';
import { t } from '../../i18n';

/** Bumped when the zip layout or manifest shape changes: the newest format this version reads and writes. */
export const BUNDLE_FORMAT = 8;
/** What a bundle without a user preset says, so Atlas versions that stop at format 6 still import it. */
const FORMAT_WITHOUT_PRESETS = 6;
/** Oldest format this version still imports. */
const OLDEST_BUNDLE_FORMAT = 2;
export const BUNDLE_MANIFEST = 'manifest.json';
/** Vault files are stored under this folder with their vault path, so nothing is lost or renamed. */
export const BUNDLE_FILES_DIR = 'files';

/**
 * `asset-file` is the file that backs an asset record: token image, map JSON, scene, encounter or player JSON.
 * `linked-note` is a note a scene's pins or characters open, or one such a note links to, however far along;
 * `note-attachment` is an image or PDF one of those notes shows (format 5); `cover` is the collection's cover image (format 4).
 * `loot-base` is a `.base` file the collection's settings pick as a loot source and `loot-item` a file the base
 * holds (format 6). `system-preset` is the user game system preset the collection's settings name (format 8): it is
 * matched by its preset id and placed in the presets folder, never at its path.
 */
const BUNDLE_FILE_ROLES = [
  'asset-file', 'thumbnail', 'scene-map', 'scene-thumbnail', 'scene-snapshot', 'scene-snapshot-thumbnail', 'background', 'token-image', 'statblock-note', 'statblock-image',
  'linked-note', 'note-attachment', 'cover', 'loot-base', 'loot-item', 'system-preset',
] as const;
export type BundleFileRole = typeof BUNDLE_FILE_ROLES[number];

/** A user game system preset, which is matched by its preset id and not by its path. */
export const PRESET_ROLE = 'system-preset' satisfies BundleFileRole;

/** Files an import matches by the id inside them, never as files at a path. */
export const ID_MATCHED_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>([PRESET_ROLE]);

/** The format a manifest says: 8 only when the bundle packs a user preset. */
export function bundleFormatFor(files: readonly BundleFile[]): number {
  return files.some((file) => file.role === PRESET_ROLE) ? BUNDLE_FORMAT : FORMAT_WITHOUT_PRESETS;
}

/** Statblock notes and their artwork: files an importing vault may already have, and then reuses in place. */
export const REUSABLE_FILE_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>(['statblock-note', 'statblock-image']);

export interface BundleFile {
  vaultPath: string;
  role: BundleFileRole;
  /** For statblock notes: the frontmatter field and the vault path it resolved to at export time. */
  statblockImage?: { key: StatblockImageKey; path: string };
  /** SHA-256 of the bytes in the zip (format 3). */
  sha256?: string;
  /** Ids of the bundle's assets that use this file (format 3). */
  owners?: string[];
  /** Paths of the bundled files this one travels with: the notes that link to it (format 5), a loot item's bases (format 6). It is packed while one of them or an owner is. */
  linkedFrom?: string[];
}

/** How the bundle came to be. Only the collection's publisher makes releases; others share the version they have. */
export type BundleKind = 'release' | 'share';

interface BundleRelease {
  kind: BundleKind;
  /** Shown to people installing or updating. */
  notes?: string;
}

/** manifest.json inside an exported collection zip. */
export interface CollectionBundleManifest {
  format: number;
  exportedAt: number;
  /** Carries `version`, `publisherId`, `author` and `coverPath` (a bundled `cover` file) of the exported release. */
  collection: CollectionMetadata;
  /** Missing in format 2 bundles, which are treated as releases without notes. */
  release?: BundleRelease;
  assets: Asset[];
  files: BundleFile[];
}

export const zipPathFor = (vaultPath: string): string => `${BUNDLE_FILES_DIR}/${vaultPath}`;

/** The uid names the collection's install record file. */
const SAFE_UID = /^[A-Za-z0-9-]{8,64}$/;

/** Asset ids end up in file names (`maps/<id>.json`) and index records, so they must not name another folder or a prototype key. */
const SAFE_ID = /^[^/\\.][^/\\]{0,127}$/;
const RESERVED_IDS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
const isSafeId = (id: unknown): boolean => typeof id === 'string' && SAFE_ID.test(id) && !RESERVED_IDS.has(id);

/** A scene's snapshot files, which travel with the scene and are placed by its id. */
export const SNAPSHOT_FILE_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>(['scene-snapshot', 'scene-snapshot-thumbnail']);

/**
 * Whether a bundled vault path is safe to plan an import for: relative, and
 * without `.`/`..` segments or hidden folders such as `.obsidian`.
 */
export function isSafeBundlePath(path: string): boolean {
  if (!path || path.length > 1024 || path.startsWith('/') || path.includes('\\')) return false;
  if ([...path].some((character) => character.charCodeAt(0) < 0x20)) return false;
  return path.split('/').every((segment) => segment !== '' && !segment.startsWith('.'));
}

/**
 * Whether the file is a snapshot as bundles of earlier versions name it, in
 * the hidden folder beside its scene's map (`scenes/.snapshots/Cave/<id>.json`).
 * Such a path is never written: the import places the file by the scene that
 * owns it (`sceneOfSnapshot`).
 */
export function isLegacySnapshotFile(file: Pick<BundleFile, 'vaultPath' | 'role'>): boolean {
  if (!SNAPSHOT_FILE_ROLES.has(file.role)) return false;
  const segments = file.vaultPath.split('/');
  const hidden = segments.length - 3;
  return hidden >= 0 && segments[hidden] === LEGACY_SNAPSHOTS_DIR
    && isSafeBundlePath(segments.filter((_, index) => index !== hidden).join('/'));
}

const isStatblockImage = (value: unknown): boolean =>
  isRecord(value) && STATBLOCK_IMAGE_KEYS.some((key) => key === value.key) && typeof value.path === 'string';

const isStrings = (value: unknown): boolean => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const isBundleFile = (value: unknown): value is BundleFile =>
  isRecord(value)
  && typeof value.vaultPath === 'string'
  && typeof value.role === 'string'
  && (BUNDLE_FILE_ROLES as readonly string[]).includes(value.role)
  && (value.sha256 === undefined || (typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256)))
  && (value.owners === undefined || isStrings(value.owners))
  && (value.linkedFrom === undefined || isStrings(value.linkedFrom))
  && (value.statblockImage === undefined || isStatblockImage(value.statblockImage));

const isBundleRelease = (value: unknown): value is BundleRelease =>
  isRecord(value)
  && (value.kind === 'release' || value.kind === 'share')
  && (value.notes === undefined || typeof value.notes === 'string');

/** Why a bundle cannot be imported, or null when its manifest is sound. */
export function manifestProblem(value: unknown): string | null {
  if (!isRecord(value) || typeof value.format !== 'number') return t('bundle.notExport');
  if (value.format > BUNDLE_FORMAT) return t('bundle.tooNew');
  if (value.format < OLDEST_BUNDLE_FORMAT) return t('bundle.tooOld');
  const { collection, assets, files, release } = value;
  const isSound = typeof value.exportedAt === 'number'
    && isRecord(collection)
    && typeof collection.uid === 'string' && SAFE_UID.test(collection.uid)
    && typeof collection.name === 'string' && collection.name.trim() !== ''
    && typeof collection.id === 'string'
    && typeof collection.version === 'number' && Number.isInteger(collection.version) && collection.version >= 1
    && isRecord(collection.tags) && isRecord(collection.settings)
    && (release === undefined || isBundleRelease(release))
    && Array.isArray(assets)
    && assets.every((asset) => isRecord(asset) && isSafeId(asset.id) && typeof asset.type === 'string' && typeof asset.name === 'string'
      && (asset.tags === undefined || (Array.isArray(asset.tags) && asset.tags.every((tag) => typeof tag === 'string'))))
    && Array.isArray(files)
    && files.every(isBundleFile);
  if (!isSound) return t('bundle.damaged');
  const { coverPath } = collection;
  if (coverPath !== undefined && !files.some((file) => file.role === 'cover' && file.vaultPath === coverPath)) return t('bundle.damaged');
  const sceneIds = new Set(assets.flatMap((asset) => (isRecord(asset) && asset.type === 'scene' && typeof asset.id === 'string' ? [asset.id] : [])));
  // An earlier version's snapshot is placed by its scene, so it must name one of the bundle's scenes.
  const isPlaceable = (file: BundleFile): boolean => isSafeBundlePath(file.vaultPath)
    || (isLegacySnapshotFile(file) && (file.owners ?? []).some((owner) => sceneIds.has(owner)));
  const unsafe = files.find((file) => !isPlaceable(file)
    || isLibraryOwnFile(file.vaultPath)
    || (file.statblockImage && !isSafeBundlePath(file.statblockImage.path)));
  if (unsafe) return t('bundle.unsafe', { path: unsafe.vaultPath });
  return null;
}
