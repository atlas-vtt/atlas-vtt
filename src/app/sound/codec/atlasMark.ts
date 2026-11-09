import { ATLAS_MARK, readAtlasCopy, type AtlasCopyFacts } from './atlasOpus';
import { SoundImportError } from './demux/demuxTypes';
import type { FileRanges } from './fileRanges';
import { MAX_PAGE_BYTES } from './oggPages';

const CAPTURE = new TextEncoder().encode('OggS');
const TAGS_MAGIC = new TextEncoder().encode('OpusTags');
const MARK = new TextEncoder().encode(`${ATLAS_MARK}=`);
/** The two header pages lie within this. */
const HEADER_BYTES = 2 * MAX_PAGE_BYTES;

function indexOf(bytes: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let at = from; at <= bytes.length - needle.length; at++) {
    for (let index = 0; index < needle.length; index++) if (bytes[at + index] !== needle[index]) continue outer;
    return at;
  }
  return -1;
}

/**
 * Whether an Ogg file's comment header names Atlas as its maker, read from its bytes alone, so it holds
 * where the pages or the facts beside the mark do not read. Such a file is never converted again.
 */
export async function hasAtlasMark(file: FileRanges): Promise<boolean> {
  const head = await file.read(0, HEADER_BYTES);
  if (indexOf(head.subarray(0, CAPTURE.length), CAPTURE, 0) !== 0) return false;
  const tags = indexOf(head, TAGS_MAGIC, 0);
  return tags >= 0 && indexOf(head, MARK, tags) >= 0;
}

/** What an Atlas-made copy says of itself; a file whose mark stands beside facts that do not read is refused as damaged. */
export async function readMarkedCopy(file: FileRanges, name: string): Promise<AtlasCopyFacts | null> {
  const facts = await readAtlasCopy(file);
  if (facts || !(await hasAtlasMark(file))) return facts;
  throw new SoundImportError('unreadable', `${name} was made by Atlas and its facts do not read.`);
}
