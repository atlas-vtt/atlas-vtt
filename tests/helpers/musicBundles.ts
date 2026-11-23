import JSZip from 'jszip';
import { CODEC_VERSION, readAtlasCopy, tagCopy } from '../../src/app/sound/codec/atlasOpus';
import { BUNDLE_MANIFEST, zipPathFor } from '../../src/app/services/collectionBundle/bundleFormat';
import type { MusicBundleManifest } from '../../src/app/services/musicBundle/musicBundleFormat';
import { packMusicBundle, type MusicPackOptions } from '../../src/app/services/musicBundle/musicPacking';
import { sha256 } from '../../src/app/utils/hashing';
import { nameOfRelative } from '../../src/app/soundLibrary/soundPaths';
import { keyOf, taggedCopy } from './atlasCopies';

/** A 3 s Atlas copy, one key per digit, as the Sound library keeps it. */
export const copyOf = (digit: string): Promise<Blob> => taggedCopy({ key: keyOf(digit), from: `Song ${digit}.mp3` });

/**
 * What the Armarium does with an upload from Atlas, as far as Atlas can tell: every track tagged again with its own
 * name and the hash of what was uploaded, every hash recomputed, the zip written anew.
 */
export async function rebuiltAsTheStoreDoes(upload: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(await upload.arrayBuffer());
  const manifest = JSON.parse(await zip.file(BUNDLE_MANIFEST)!.async('string')) as MusicBundleManifest;
  const out = new JSZip();
  const files = [];
  for (const file of manifest.files) {
    let bytes = new Uint8Array(await zip.file(zipPathFor(file.vaultPath))!.async('uint8array'));
    if (file.role === 'music-track') {
      const uploaded = new Blob([bytes]);
      const tagged = await tagCopy(uploaded, { key: await sha256(bytes), codec: CODEC_VERSION, from: nameOfRelative(file.vaultPath), lufs: -20, truePeakDb: -3, peaks: null });
      bytes = new Uint8Array(await tagged.arrayBuffer());
      if (!(await readAtlasCopy(tagged))) throw new Error('The store\'s rebuild must read as an Atlas copy.');
    }
    files.push({ ...file, sha256: await sha256(bytes) });
    out.file(zipPathFor(file.vaultPath), bytes);
  }
  out.file(BUNDLE_MANIFEST, JSON.stringify({ ...manifest, files }));
  return new Blob([await out.generateAsync({ type: 'uint8array' })]);
}

/** An album or single as the Armarium delivers it: packed by Atlas, rebuilt by the store. */
export async function deliveredMusic(options: Omit<MusicPackOptions, 'tracks'> & { titles: string[] }): Promise<Blob> {
  const tracks = await Promise.all(options.titles.map(async (title, index) => ({ title, copy: await copyOf(String((index % 9) + 1)) })));
  const packed = await packMusicBundle({ ...options, tracks });
  return rebuiltAsTheStoreDoes(packed.blob);
}
