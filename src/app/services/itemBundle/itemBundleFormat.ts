/**
 * Item bundles: one Atlas file shared on its own (a statblock template, a user game system
 * preset, a dice set) in the zip collections travel in: `manifest.json` first, the files under
 * `files/<vaultPath>`, with an item manifest of format 10 instead of a collection manifest. It may
 * carry the cover its Armarium listing shows (`cover.webp`) and, for a template, its card drawn in
 * Obsidian's light and dark look (`preview-light.png`, `preview-dark.png`), which no import writes.
 * Atlas versions that stop at format 9 refuse it as made with a newer Atlas.
 */

import { isRecord } from '../../utils/guards';
import { isLibraryOwnFile } from '../library/libraryPaths';
import {
  DICE_SET_ROLE, PRESET_ROLE, SAFE_UID, TEMPLATE_BODY_ROLE, TEMPLATE_ROLE, isBundleFile, isSafeBundlePath,
  type BundleFile, type BundleFileRole,
} from '../collectionBundle/bundleFormat';
import type { DerivedFormat } from '../../imageProcessing/imageEncoder';
import { t } from '../../i18n';

/** The newest item bundle format this version reads and the one it writes. */
export const ITEM_BUNDLE_FORMAT = 10;

export const ITEM_KINDS = ['statblock-template', 'system-preset', 'dice-set'] as const;
export type ItemKind = typeof ITEM_KINDS[number];

/** One shareable item of the vault, by its kind and the id inside its file. */
export interface ItemRef {
  kind: ItemKind;
  id: string;
}

/** The longest name and release notes an item manifest carries. */
export const MAX_ITEM_NAME = 120;
export const MAX_ITEM_NOTES = 2000;

/** manifest.json inside an item bundle. */
export interface ItemBundleManifest {
  format: typeof ITEM_BUNDLE_FORMAT;
  exportedAt: number;
  item: {
    kind: ItemKind;
    /** The Armarium listing's uid (`itemListingUid`). */
    uid: string;
    /** The item's id in the vault it came from; the id inside its file. */
    id: string;
    /** A template's file basename, a preset's or dice set's record name. */
    name: string;
    version: number;
    /** What changed in this version. */
    notes?: string;
  };
  files: BundleFile[];
}

/** The role of the file that is the item itself. */
export const ITEM_ROLE: Readonly<Record<ItemKind, BundleFileRole>> = {
  'statblock-template': TEMPLATE_ROLE,
  'system-preset': PRESET_ROLE,
  'dice-set': DICE_SET_ROLE,
};

/** The role of the cover a listing shows: an image no import writes into the vault. */
export const ITEM_COVER_ROLE: BundleFileRole = 'cover';

/** Where an item bundle's cover lies: `cover.webp`, or `cover.png` from a device that cannot encode WebP. */
const COVER_PATH = /^cover\.(?:webp|png)$/;
export const itemCoverPath = (extension: DerivedFormat): string => `cover.${extension}`;

/** A template's card as its listing page shows it, by look: drawn by Atlas with sample values, never written by an import. */
export const ITEM_PREVIEW_PATHS = { 'preview-light': 'preview-light.png', 'preview-dark': 'preview-dark.png' } as const satisfies Partial<Record<BundleFileRole, string>>;
type PreviewRole = keyof typeof ITEM_PREVIEW_PATHS;
const isPreviewRole = (role: BundleFileRole): role is PreviewRole => Object.hasOwn(ITEM_PREVIEW_PATHS, role);

/** The files a bundle of each kind may hold beside its item, at most one of each. */
const COMPANION_ROLES: Readonly<Record<ItemKind, readonly BundleFileRole[]>> = {
  'statblock-template': [TEMPLATE_BODY_ROLE, DICE_SET_ROLE, ITEM_COVER_ROLE, 'preview-light', 'preview-dark'],
  'system-preset': [DICE_SET_ROLE, ITEM_COVER_ROLE],
  'dice-set': [ITEM_COVER_ROLE],
};

/** The suffix of an item bundle's file name, by kind. */
const FILE_SUFFIX: Readonly<Record<ItemKind, string>> = {
  'statblock-template': 'atlas-template',
  'system-preset': 'atlas-system',
  'dice-set': 'atlas-dice',
};

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === 'string' && (ITEM_KINDS as readonly string[]).includes(value);
}

/** Whether a parsed manifest is an item manifest rather than a collection manifest. */
export function isItemManifest(value: unknown): value is Record<string, unknown> & { item: unknown } {
  return isRecord(value) && Object.hasOwn(value, 'item');
}

/** `<name> v<n>.atlas-template.zip`, and the like for the other kinds. */
export function itemBundleFileName(name: string, version: number, kind: ItemKind): string {
  const safeName = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Item';
  return `${safeName} v${version}.${FILE_SUFFIX[kind]}.zip`;
}

/** The file that is the item itself; the manifest must have been checked (`itemManifestProblem`). */
export function itemFileOf(manifest: ItemBundleManifest): BundleFile {
  return manifest.files.find((file) => file.role === ITEM_ROLE[manifest.item.kind])!;
}

const isWholeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

function isSoundItem(item: unknown): item is ItemBundleManifest['item'] {
  if (!isRecord(item)) return false;
  const { kind, uid, id, name, version, notes } = item;
  return isItemKind(kind)
    && typeof uid === 'string' && SAFE_UID.test(uid)
    && typeof id === 'string' && id.trim() !== '' && id.length <= 128
    && typeof name === 'string' && name.trim() !== '' && name.length <= MAX_ITEM_NAME
    && isWholeNumber(version)
    && (notes === undefined || typeof notes === 'string');
}

/** Whether the files are those a bundle of `kind` holds: its item once, each companion at most once, nothing else. */
function holdsItsFiles(kind: ItemKind, files: readonly BundleFile[]): boolean {
  const itemRole = ITEM_ROLE[kind];
  const allowed = new Set<BundleFileRole>([itemRole, ...COMPANION_ROLES[kind]]);
  if (files.some((file) => !allowed.has(file.role))) return false;
  const count = (role: BundleFileRole): number => files.filter((file) => file.role === role).length;
  if (count(itemRole) !== 1) return false;
  if (COMPANION_ROLES[kind].some((role) => role !== itemRole && count(role) > 1)) return false;
  const itemPath = files.find((file) => file.role === itemRole)!.vaultPath;
  // The note beside a template goes where the template goes, so it must name it.
  if (!files.every((file) => file.role !== TEMPLATE_BODY_ROLE || file.linkedFrom?.[0] === itemPath)) return false;
  if (!files.every((file) => file.role !== ITEM_COVER_ROLE || (file.linkedFrom === undefined && COVER_PATH.test(file.vaultPath)))) return false;
  return files.every((file) => !isPreviewRole(file.role) || (file.linkedFrom === undefined && file.vaultPath === ITEM_PREVIEW_PATHS[file.role]));
}

/** Why an item bundle cannot be imported, or null when its manifest is sound. Its files' contents are checked on reading. */
export function itemManifestProblem(value: unknown): string | null {
  if (!isRecord(value) || typeof value.format !== 'number') return t('itemBundle.notItem');
  if (value.format > ITEM_BUNDLE_FORMAT) return t('itemBundle.tooNew');
  const { item, files } = value;
  const isSound = value.format === ITEM_BUNDLE_FORMAT
    && typeof value.exportedAt === 'number'
    && isSoundItem(item)
    && Array.isArray(files)
    && files.every(isBundleFile)
    && holdsItsFiles(item.kind, files);
  if (!isSound) return t('itemBundle.damaged');
  const unsafe = files.find((file) => !isSafeBundlePath(file.vaultPath) || isLibraryOwnFile(file.vaultPath));
  return unsafe ? t('itemBundle.unsafe', { path: unsafe.vaultPath }) : null;
}
