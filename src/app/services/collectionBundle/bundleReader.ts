import type JSZip from 'jszip';
import { BUNDLE_MANIFEST, manifestProblem, zipPathFor, type BundleFile, type CollectionBundleManifest } from './bundleFormat';
import { reportFileStep, type BundleProgressListener } from './bundleProgress';
import { sha256 } from '../../utils/hashing';
import { baseName } from '../../utils/pathUtils';
import { t } from '../../i18n';

/** A bundle whose manifest is sound and whose files match their checksums. */
export interface OpenedBundle {
  zip: JSZip;
  manifest: CollectionBundleManifest;
  /** SHA-256 of every packed file's bytes, by bundle path. Files the manifest lists but the zip lacks are absent. */
  sourceHashes: Map<string, string>;
}

async function readManifest(zip: JSZip): Promise<CollectionBundleManifest> {
  const entry = zip.file(BUNDLE_MANIFEST);
  if (!entry) throw new Error('This file is not an Atlas collection export.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await entry.async('string'));
  } catch {
    throw new Error('This collection export is damaged.');
  }
  const problem = manifestProblem(parsed);
  if (problem) throw new Error(problem);
  return parsed as CollectionBundleManifest;
}

/** Reads the zip and checks every file against its recorded checksum before anything is written. */
export async function openBundle(data: Blob, onProgress: BundleProgressListener): Promise<OpenedBundle> {
  onProgress({ message: t('bundle.reading'), fraction: 0 });
  const { default: JSZip } = await import('jszip');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await data.arrayBuffer());
  } catch {
    throw new Error('This file is not a readable zip archive.');
  }
  const manifest = await readManifest(zip);

  const sourceHashes = new Map<string, string>();
  const damaged: BundleFile[] = [];
  for (const [index, file] of manifest.files.entries()) {
    reportFileStep(onProgress, 'bundle.step.checking', index, manifest.files.length, 0, 0.5);
    const entry = zip.file(zipPathFor(file.vaultPath));
    if (!entry) {
      if (file.sha256) damaged.push(file);
      continue;
    }
    const hash = await sha256(await entry.async('uint8array'));
    if (file.sha256 && file.sha256 !== hash) damaged.push(file);
    sourceHashes.set(file.vaultPath, hash);
  }
  if (damaged.length > 0) {
    const names = damaged.slice(0, 3).map((file) => baseName(file.vaultPath)).join(', ');
    throw new Error(t('bundle.checksum', { count: damaged.length, names: `${names}${damaged.length > 3 ? ', …' : ''}` }));
  }
  return { zip, manifest, sourceHashes };
}

/** Reads files packed in a bundle by their bundle path, before anything is imported. */
export interface BundleFileReader {
  blob(path: string): Promise<Blob | null>;
  text(path: string): Promise<string | null>;
}

export function bundleFileReader({ zip }: OpenedBundle): BundleFileReader {
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
