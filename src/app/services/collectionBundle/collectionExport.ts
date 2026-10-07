import type { App } from 'obsidian';
import { comparedBytes } from './recordPayload';
import type { Asset, AssetService, CollectionMetadata } from '../AssetService';
import { BUNDLE_MANIFEST, PRESET_ROLE, bundleFormatFor, zipPathFor, type BundleFile, type CollectionBundleManifest } from './bundleFormat';
import { flushPresetEdits, packedPresetRecord, withSystemPresetFile } from './bundlePresetFiles';
import { rewriteContent } from './bundleContent';
import { selectContent } from './bundleContents';
import { withLootBases } from './bundleSettings';
import { reportFileStep, type BundleProgressListener } from './bundleProgress';
import { coverCandidates, coverFileFor, currentCover, type CoverCandidate, type CoverChoice, type CurrentCover } from './collectionCover';
import { CollectionReferenceCollector, type MissingReference } from './collectionReferences';
import { sha256 } from '../../utils/hashing';
import { readInstallRecord, type InstalledPreset } from './installRecord';
import { withLinkedFiles } from './noteLinks';
import { remapPaths } from './pathRemap';
import { originNames, recordRelease } from './releaseRecord';
import { readVaultBinary, vaultFileSize } from '../../utils/hiddenVaultFiles';
import { t } from '../../i18n';

/**
 * The kinds of content Atlas has today, as the asset manager shows them. Older
 * vaults may still hold player, character, statblock and note records from
 * removed features; exports leave them behind.
 */
const EXPORTED_TYPES: ReadonlySet<Asset['type']> = new Set<Asset['type']>(['token', 'map', 'scene', 'encounter']);

/** Images and audio are already compressed; deflating them only costs time. */
const STORED_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|mp3|ogg|wav|m4a|zip)$/i;

/** What an export would pack, shown before the user decides how to export. */
export interface ExportPreview {
  collection: CollectionMetadata;
  assets: Asset[];
  files: BundleFile[];
  missing: MissingReference[];
  /** Size in bytes of every file, by vault path. */
  fileSizes: ReadonlyMap<string, number>;
  /** The collection's cover, when it has one. */
  cover?: CurrentCover | undefined;
  /** Maps and scenes whose artwork can become the cover. */
  coverCandidates: CoverCandidate[];
  /**
   * `self`: this vault publishes the collection, so its exports are releases.
   * `other`: it was installed from someone else's release.
   * `unknown`: it predates publishing and was never installed from a bundle, so the user says which it is.
   */
  publisher: 'self' | 'other' | 'unknown';
  /** Lowest version a release may carry. */
  minimumVersion: number;
  suggestedVersion: number;
}

/**
 * - `release`: the publisher's new version, which installed copies update to.
 * - `share`: a copy of the installed version, with the sharer's changes.
 * - `fork`: the collection becomes this vault's own under a new identity and name.
 */
export type ExportChoice = ExportContentChoice & (
  | { kind: 'release'; version: number; author?: string | undefined; notes?: string | undefined }
  | { kind: 'share' }
  | { kind: 'fork'; name: string; author?: string | undefined; notes?: string | undefined }
);

interface ExportContentChoice {
  /** Content keys (see `groupContents`) the user left out. */
  excluded?: ReadonlySet<string> | undefined;
  /** Defaults to the collection's current cover. */
  cover?: CoverChoice | undefined;
}

export interface ExportedBundle {
  blob: Blob;
  /** Records a release or fork in this vault; call once the file has been handed to the user. */
  commit(): Promise<void>;
  fileName: string;
  collectionName: string;
  version: number;
  assetCount: number;
  fileCount: number;
}

async function publisherOf(app: App, assets: AssetService, collection: CollectionMetadata): Promise<ExportPreview['publisher']> {
  if (collection.publisherId !== undefined) return collection.publisherId === await assets.knownVaultId() ? 'self' : 'other';
  return (await readInstallRecord(app, collection)) === null ? 'unknown' : 'other';
}

export async function prepareCollectionExport(app: App, assets: AssetService, collectionId: string): Promise<ExportPreview> {
  await assets.ensureOwnCollectionUid(collectionId);
  const collection = await assets.getCollection(collectionId);
  if (!collection) throw new Error(`Collection ${collectionId} not found`);
  const collectionAssets = (await assets.getAssets(collectionId)).filter((asset) => EXPORTED_TYPES.has(asset.type));
  const { files: referenced, missing } = await new CollectionReferenceCollector(app, assets).collect(collectionAssets, collection.settings.lootBases);
  const files = withSystemPresetFile(app, withLinkedFiles(app, referenced), collection.settings);
  const fileSizes = new Map<string, number>();
  for (const file of files) fileSizes.set(file.vaultPath, await vaultFileSize(app, file.vaultPath));
  const publisher = await publisherOf(app, assets, collection);
  // A collection that was never released starts at its own version; later releases count up.
  const neverReleased = collection.publisherId !== undefined && collection.releasedAt === undefined;
  return {
    collection: { ...collection },
    assets: collectionAssets,
    files,
    missing,
    fileSizes,
    cover: currentCover(app, collection),
    coverCandidates: await coverCandidates(app, collectionAssets),
    publisher,
    minimumVersion: collection.version,
    suggestedVersion: neverReleased ? collection.version : collection.version + 1,
  };
}

function bundleFileName(name: string, version: number): string {
  const safeName = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Collection';
  return `${safeName} v${version}.atlas-collection.zip`;
}

/** The collection record the bundle carries for `choice`. */
async function exportedCollection(assets: AssetService, preview: ExportPreview, choice: ExportChoice, exportedAt: number): Promise<CollectionMetadata> {
  const base: CollectionMetadata = { ...preview.collection, releasedAt: exportedAt };
  if (choice.kind === 'share') return base;
  const release: CollectionMetadata = { ...base, publisherId: await assets.getVaultId() };
  const author = choice.author?.trim();
  if (author) release.author = author;
  else delete release.author;
  return choice.kind === 'release'
    ? { ...release, version: choice.version }
    : { ...release, uid: crypto.randomUUID(), name: choice.name.trim(), version: 1 };
}

/**
 * Packs the previewed collection with every file it depends on into a zip.
 * Files keep their vault paths inside the archive; the manifest lists them
 * with their roles, owners and SHA-256, so the importer can place, verify and
 * compare them. Releases and forks are recorded as this vault's install of
 * that version, so re-importing an older export of it is recognised.
 */
export async function exportCollectionBundle(
  app: App,
  assets: AssetService,
  preview: ExportPreview,
  choice: ExportChoice,
  onProgress: BundleProgressListener = () => undefined,
): Promise<ExportedBundle> {
  if (choice.kind === 'release' && preview.publisher === 'other') {
    throw new Error('Only the collection\'s publisher can release new versions.');
  }
  if (choice.kind === 'release' && (!Number.isInteger(choice.version) || choice.version < preview.minimumVersion)) {
    throw new Error(`The version must be a whole number of at least ${preview.minimumVersion}.`);
  }
  if (choice.kind === 'fork' && await assets.isCollectionNameTaken(choice.name, preview.collection.id)) {
    throw new Error(`A collection named "${choice.name.trim()}" already exists.`);
  }

  const exportedAt = Date.now();
  const selected = selectContent(preview.assets, preview.files, choice.excluded ?? new Set());
  const cover = await coverFileFor(app, preview.collection, choice.cover ?? { kind: 'current' });
  const packedPaths = [...selected.files.map((file) => file.vaultPath), ...(cover ? [cover.path] : [])];
  const origin = choice.kind === 'share'
    ? await originNames(app, preview.collection, packedPaths)
    : { collectionId: preview.collection.id, name: preview.collection.name, names: new Map<string, string>() };
  const named = (value: string): string => origin.names.get(value) ?? value;
  const exported = await exportedCollection(assets, preview, choice, exportedAt);
  // The settings name only the loot bases that travel, as the bundle names them.
  const packed = new Set(selected.files.map((file) => file.vaultPath));
  const collection: CollectionMetadata = {
    ...exported,
    id: origin.collectionId,
    name: choice.kind === 'share' ? origin.name : exported.name,
    settings: withLootBases(exported.settings, (path) => (packed.has(path) ? named(path) : undefined)),
  };
  if (cover) collection.coverPath = named(cover.path);
  else delete collection.coverPath;
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const files: BundleFile[] = [];
  const presets: Record<string, InstalledPreset> = {};
  if (selected.files.some((file) => file.role === PRESET_ROLE)) await flushPresetEdits(app);
  for (const [index, file] of selected.files.entries()) {
    reportFileStep(onProgress, 'bundle.step.adding', index, selected.files.length, 0, 0.6);
    const content = await readVaultBinary(app, file.vaultPath);
    if (!content) continue;
    // A preset file that holds no preset stays behind.
    const preset = file.role === PRESET_ROLE ? await packedPresetRecord(content) : null;
    if (file.role === PRESET_ROLE && !preset) continue;
    if (preset) presets[preset.localId] = preset;
    const data = rewriteContent(file, comparedBytes(file.vaultPath, content), origin.names);
    const bundlePath = named(file.vaultPath);
    files.push({
      ...file,
      vaultPath: bundlePath,
      sha256: await sha256(data),
      ...(file.owners && { owners: file.owners.map(named) }),
      ...(file.linkedFrom && { linkedFrom: file.linkedFrom.map(named) }),
      ...(file.statblockImage && { statblockImage: { ...file.statblockImage, path: named(file.statblockImage.path) } }),
    });
    zip.file(zipPathFor(bundlePath), data, { compression: STORED_EXTENSIONS.test(bundlePath) ? 'STORE' : 'DEFLATE' });
  }
  if (cover && collection.coverPath) {
    files.push({ vaultPath: collection.coverPath, role: 'cover', sha256: await sha256(cover.data) });
    zip.file(zipPathFor(collection.coverPath), cover.data, { compression: 'STORE' });
  }
  const notes = choice.kind === 'share' ? undefined : choice.notes?.trim() || undefined;
  const manifest: CollectionBundleManifest = {
    format: bundleFormatFor(files),
    exportedAt,
    collection,
    release: { kind: choice.kind === 'share' ? 'share' : 'release', ...(notes ? { notes } : {}) },
    assets: selected.assets.map((asset) => remapPaths(asset, origin.names)),
    files,
  };
  zip.file(BUNDLE_MANIFEST, JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', streamFiles: true }, ({ percent }) => {
    onProgress({ message: t('bundle.compressing'), fraction: 0.6 + (percent / 100) * 0.4 });
  });
  return {
    blob,
    commit: () => (choice.kind === 'share' ? Promise.resolve() : recordRelease(app, assets, preview.collection, manifest, cover, presets)),
    fileName: bundleFileName(collection.name, collection.version),
    collectionName: collection.name,
    version: collection.version,
    assetCount: selected.assets.length,
    fileCount: files.length,
  };
}
