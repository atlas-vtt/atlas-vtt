import type { App } from 'obsidian';
import { sha256 } from '../../utils/hashing';
import { saveForUser } from '../../platform/saveForUser';
import { showNotice } from '../../ui/notice';
import { toBuffer } from '../collectionBundle/bundleContent';
import { BUNDLE_MANIFEST, zipPathFor, type BundleFile } from '../collectionBundle/bundleFormat';
import { derivedImageExtension } from '../assetImageFiles';
import { ITEM_BUNDLE_FORMAT, ITEM_COVER_ROLE, ITEM_PREVIEW_PATHS, MAX_ITEM_NOTES, itemBundleFileName, itemCoverPath, type ItemBundleManifest, type ItemRef } from './itemBundleFormat';
import { itemListingUid } from './itemListingUid';
import { packItem, type PackedItemFile } from './itemPacking';
import { t } from '../../i18n';

/** The listing an export is made for: its uid, the version it becomes, and what changed in it. */
export interface ItemExportOptions {
  uid: string;
  version: number;
  notes?: string | undefined;
  /** The cover the listing shows, already made a cover (`renderCover`). */
  cover?: ArrayBuffer | undefined;
  /** A template's card as its listing page shows it, PNG in Obsidian's light and dark look (`templateCardPictures`). */
  previews?: { light: ArrayBuffer; dark: ArrayBuffer } | undefined;
}

export interface ItemExport {
  /** `<name> v<n>.atlas-template.zip`, and the like for the other kinds. */
  fileName: string;
  bytes: Uint8Array;
  manifest: ItemBundleManifest;
}

/**
 * Packs the vault item `ref` as an item bundle (format 10): the manifest first, then the item's
 * file, the note beside a template, the vault dice set it rolls with, the listing's cover and a template's card
 * pictures, each with its SHA-256.
 * Throws for a built-in and for an item the vault does not hold or cannot read.
 */
export async function exportItemBundle(app: App, ref: ItemRef, options: ItemExportOptions): Promise<ItemExport> {
  const packed = await packItem(app, ref);
  const contents: Array<{ file: Omit<PackedItemFile, 'text'>; data: ArrayBuffer }> = packed.files.map((file) => ({ file, data: toBuffer(file.text) }));
  if (options.cover) contents.push({ file: { vaultPath: itemCoverPath(derivedImageExtension(options.cover)), role: ITEM_COVER_ROLE }, data: options.cover });
  if (options.previews && ref.kind === 'statblock-template') {
    contents.push({ file: { vaultPath: ITEM_PREVIEW_PATHS['preview-light'], role: 'preview-light' }, data: options.previews.light });
    contents.push({ file: { vaultPath: ITEM_PREVIEW_PATHS['preview-dark'], role: 'preview-dark' }, data: options.previews.dark });
  }
  const files: BundleFile[] = [];
  for (const { file, data } of contents) {
    files.push({ vaultPath: file.vaultPath, role: file.role, sha256: await sha256(data), ...(file.linkedFrom && { linkedFrom: file.linkedFrom }) });
  }
  const notes = options.notes?.trim().slice(0, MAX_ITEM_NOTES);
  const manifest: ItemBundleManifest = {
    format: ITEM_BUNDLE_FORMAT,
    exportedAt: Date.now(),
    item: { kind: ref.kind, uid: options.uid, id: ref.id, name: packed.name, version: options.version, ...(notes ? { notes } : {}) },
    files,
  };
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  // The manifest leads the zip, so a reader knows what it holds before the files.
  zip.file(BUNDLE_MANIFEST, JSON.stringify(manifest, null, 2));
  for (const { file, data } of contents) zip.file(zipPathFor(file.vaultPath), data);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { fileName: itemBundleFileName(packed.name, options.version, ref.kind), bytes, manifest };
}

/** The uid of a bundle handed on as a file, tied to no account's listing. */
export function localItemUid(ref: ItemRef): Promise<string> {
  return itemListingUid('local', ref.kind, ref.id);
}

/**
 * Exports the vault item `ref` as a file the GM can hand to someone (version 1, a uid tied to no
 * listing) and saves it where collection exports go: the browser's download on the desktop, the
 * vault's exports folder on a tablet. A notice says how it went.
 */
export async function saveItemBundle(app: App, ref: ItemRef): Promise<void> {
  try {
    const exported = await exportItemBundle(app, ref, { uid: await localItemUid(ref), version: 1 });
    const saved = await saveForUser(app, exported.fileName, exported.bytes.slice().buffer, 'application/zip');
    // A tablet's save names the file in a notice of its own.
    if (saved.kind === 'download') showNotice(t('itemBundle.exported', { name: exported.manifest.item.name, file: exported.fileName }));
  } catch (error) {
    console.error('[Atlas] Exporting the item failed:', error);
    showNotice(t('itemBundle.exportFailed', { reason: error instanceof Error ? error.message : String(error) }));
  }
}
