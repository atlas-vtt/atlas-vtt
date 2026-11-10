import { readFileSync } from 'node:fs';
import { CODEC_VERSION, tagCopy, type CopyTags } from '../../src/app/sound/codec/atlasOpus';
import { OggOpusWriter } from '../../src/app/sound/codec/oggOpusWriter';
import { packetsOfPage, readPage, type CarriedPacket } from '../../src/app/sound/codec/oggPages';
import { readOpusHead } from '../../src/app/sound/codec/opusFormat';

/** A fixture's packets written again by the copy writer, as Atlas 0.13.x stored a copy: with `ATLAS_SEEK`, without Atlas' facts. */
export function atlasCopyOf(file: Uint8Array): { copy: Blob; frames: number; channels: number } {
  const first = readPage(file, 0);
  const second = first && readPage(file, first.end);
  if (!first || !second) throw new Error('fixture has no header');
  const head = packetsOfPage(first, null).packets[0];
  if (!head) throw new Error('fixture has no OpusHead');
  const writer = new OggOpusWriter(head);
  let carried: CarriedPacket | null = null;
  let granule = 0;
  for (let page = readPage(file, second.end); page; page = readPage(file, page.end)) {
    const { packets, tail } = packetsOfPage(page, carried);
    carried = tail;
    for (const packet of packets) writer.addPacket(packet);
    granule = page.granule;
  }
  const frames = granule - readOpusHead(head).preSkip;
  return { copy: writer.finish(frames), frames, channels: readOpusHead(head).channels };
}

/** The 3 s tone as a 0.13.x copy: an Ogg Opus file Atlas did not tag. */
export function plainCopy(): Blob {
  return atlasCopyOf(new Uint8Array(readFileSync('tests/fixtures/sound/tone220-3s.ogg'))).copy;
}

/** The 3 s tone as Atlas makes a copy now: its facts in its comments. */
export function taggedCopy(tags: Partial<CopyTags> & Pick<CopyTags, 'key'>): Promise<Blob> {
  return tagCopy(plainCopy(), { codec: CODEC_VERSION, from: 'Tavern.mp3', lufs: -20, truePeakDb: -3, peaks: null, ...tags });
}

/** A sound key: 64 lowercase hex digits made of one. */
export const keyOf = (digit: string): string => digit.repeat(64);
