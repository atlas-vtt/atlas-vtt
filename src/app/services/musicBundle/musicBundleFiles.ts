import type JSZip from 'jszip';
import type { JSZipObject } from 'jszip';
import { isRecord } from '../../utils/guards';
import { sha256 } from '../../utils/hashing';
import { zipPathFor, type BundleFile } from '../collectionBundle/bundleFormat';
import { reportFileStep, type BundleProgressListener } from '../collectionBundle/bundleProgress';
import { checksumError } from '../collectionBundle/bundleReader';
import { t } from '../../i18n';

/** What the Armarium's rules allow a music bundle to unpack to: 256 MiB a file, 2 GiB in all (100 tracks the manifest holds). */
export const MUSIC_UNPACKED_LIMITS = { fileBytes: 256 * 1024 * 1024, totalBytes: 2 * 1024 * 1024 * 1024 } as const;

/** The zip method of an entry stored as it is: the Armarium stores audio and pictures, which do not shrink. */
const STORED = '\x00\x00';

/** What the zip's directory says of an entry: whether it is stored and the size it unpacks to. */
interface EntryFacts {
  stored: boolean;
  bytes: number;
}

/**
 * What the zip's directory says of an entry, read before anything is inflated. JSZip keeps it on the entry it loaded
 * (`_data`: the compressed object with its method and declared size); null where it is not there as expected, which
 * refuses the bundle rather than inflating blind.
 */
function entryFacts(entry: JSZipObject): EntryFacts | null {
  const data: unknown = Reflect.get(entry, '_data');
  if (!isRecord(data)) return null;
  const { uncompressedSize, compression } = data;
  const method = isRecord(compression) ? compression.magic : undefined;
  if (typeof uncompressedSize !== 'number' || !Number.isSafeInteger(uncompressedSize) || uncompressedSize < 0 || typeof method !== 'string') return null;
  return { stored: method === STORED, bytes: uncompressedSize };
}

/**
 * The files of a music bundle by bundle path, each matching its checksum. A bundle may be any zip a GM picked, so the
 * directory is read first: every music file must be stored and fit `MUSIC_UNPACKED_LIMITS`, or nothing is inflated
 * at all. Then each file is read once, its size checked against what the directory declared, and kept as one Blob.
 */
export async function readMusicFiles(zip: JSZip, files: readonly BundleFile[], onProgress: BundleProgressListener): Promise<Map<string, Blob>> {
  const entries = files.map((file) => ({ file, entry: zip.file(zipPathFor(file.vaultPath)) }));
  let total = 0;
  for (const { entry } of entries) {
    const facts = entry ? entryFacts(entry) : null;
    if (!facts || !facts.stored) throw new Error(t('itemBundle.damaged'));
    total += facts.bytes;
    if (facts.bytes > MUSIC_UNPACKED_LIMITS.fileBytes || total > MUSIC_UNPACKED_LIMITS.totalBytes) throw new Error(t('armariumMusic.tooLarge'));
  }
  const read = new Map<string, Blob>();
  const damaged: BundleFile[] = [];
  for (const [index, { file, entry }] of entries.entries()) {
    reportFileStep(onProgress, 'bundle.step.checking', index, entries.length, 0, 0.5);
    if (!entry) continue;
    const bytes = await entry.async('arraybuffer');
    if (bytes.byteLength !== entryFacts(entry)?.bytes) throw new Error(t('itemBundle.damaged'));
    if (file.sha256 && file.sha256 !== (await sha256(bytes))) damaged.push(file);
    else read.set(file.vaultPath, new Blob([bytes]));
  }
  if (damaged.length > 0) throw checksumError(damaged);
  return read;
}
