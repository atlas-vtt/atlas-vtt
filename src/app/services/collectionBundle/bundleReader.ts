import type JSZip from 'jszip';
import { BUNDLE_MANIFEST, manifestProblem, zipPathFor, type BundleFile, type CollectionBundleManifest } from './bundleFormat';
import { reportFileStep, type BundleProgressListener } from './bundleProgress';
import { sha256 } from '../../utils/hashing';
import type { LibraryTemplate } from '../../statblocks/model/resolvedTypes';
import { baseName } from '../../utils/pathUtils';
import { t } from '../../i18n';

/** A bundle whose manifest is sound and whose files match their checksums. */
export interface OpenedBundle {
  zip: JSZip;
  manifest: CollectionBundleManifest;
  /** SHA-256 of every packed file's bytes, by bundle path. Files the manifest lists but the zip lacks are absent. */
  sourceHashes: Map<string, string>;
}

/** A zip read with its manifest parsed, before either is checked: a collection bundle or an item bundle. */
export interface BundleArchive {
  zip: JSZip;
  manifest: unknown;
}

/** Reads the zip and parses its manifest; throws where it is no zip or holds no readable manifest. */
export async function readBundleArchive(data: Blob, onProgress: BundleProgressListener): Promise<BundleArchive> {
  onProgress({ message: t('bundle.reading'), fraction: 0 });
  const { default: JSZip } = await import('jszip');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await data.arrayBuffer());
  } catch {
    throw new Error('This file is not a readable zip archive.');
  }
  const entry = zip.file(BUNDLE_MANIFEST);
  if (!entry) throw new Error('This file is not an Atlas collection export.');
  try {
    return { zip, manifest: JSON.parse(await entry.async('string')) as unknown };
  } catch {
    throw new Error('This collection export is damaged.');
  }
}

/**
 * The SHA-256 of every packed file's bytes, by bundle path, once each matches the checksum its
 * manifest records; throws, naming them, where any does not. Files the manifest lists but the zip
 * lacks are absent, and damaged where the manifest records a checksum for them.
 */
export async function verifiedFileHashes(zip: JSZip, files: readonly BundleFile[], onProgress: BundleProgressListener): Promise<Map<string, string>> {
  const sourceHashes = new Map<string, string>();
  const damaged: BundleFile[] = [];
  for (const [index, file] of files.entries()) {
    reportFileStep(onProgress, 'bundle.step.checking', index, files.length, 0, 0.5);
    const entry = zip.file(zipPathFor(file.vaultPath));
    if (!entry) {
      if (file.sha256) damaged.push(file);
      continue;
    }
    const hash = await sha256(await entry.async('arraybuffer'));
    if (file.sha256 && file.sha256 !== hash) damaged.push(file);
    sourceHashes.set(file.vaultPath, hash);
  }
  if (damaged.length > 0) {
    const names = damaged.slice(0, 3).map((file) => baseName(file.vaultPath)).join(', ');
    throw new Error(t('bundle.checksum', { count: damaged.length, names: `${names}${damaged.length > 3 ? ', …' : ''}` }));
  }
  return sourceHashes;
}

/** A read collection bundle whose manifest is sound and whose files match their checksums. */
export async function checkedBundle({ zip, manifest }: BundleArchive, onProgress: BundleProgressListener): Promise<OpenedBundle> {
  const problem = manifestProblem(manifest);
  if (problem) throw new Error(problem);
  const checked = manifest as CollectionBundleManifest;
  return { zip, manifest: checked, sourceHashes: await verifiedFileHashes(zip, checked.files, onProgress) };
}

/** Reads the zip and checks every file against its recorded checksum before anything is written. */
export async function openBundle(data: Blob, onProgress: BundleProgressListener): Promise<OpenedBundle> {
  return checkedBundle(await readBundleArchive(data, onProgress), onProgress);
}

/** Reads files packed in a bundle by their bundle path, before anything is imported. */
export interface BundleFileReader {
  blob(path: string): Promise<Blob | null>;
  text(path: string): Promise<string | null>;
  /** The bundle's statblock templates, read without code, which previews of its notes look up first. */
  templates?: readonly LibraryTemplate[] | undefined;
}

export function bundleFileReader({ zip }: Pick<OpenedBundle, 'zip'>): BundleFileReader {
  return {
    blob: async (path) => (await zip.file(zipPathFor(path))?.async('blob')) ?? null,
    text: async (path) => (await zip.file(zipPathFor(path))?.async('string')) ?? null,
  };
}

/** The collection's cover image packed in the bundle, if it has one. */
export async function bundleCover(bundle: OpenedBundle): Promise<Blob | undefined> {
  const { coverPath } = bundle.manifest.collection;
  return (coverPath && await bundleFileReader(bundle).blob(coverPath)) || undefined;
}
