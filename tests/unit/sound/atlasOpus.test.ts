import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { atlasComments, CODEC_VERSION, forPlayers, readAtlasCopy, tagCopy, withComments, type AtlasCopyFacts } from '@/app/sound/codec/atlasOpus';
import { OggOpusWriter } from '@/app/sound/codec/oggOpusWriter';
import { lacingOf, packetsOfPage, readPage, writePage, type CarriedPacket } from '@/app/sound/codec/oggPages';
import { readOpusComment, readOpusComments, readOpusHead, writeOpusTags } from '@/app/sound/codec/opusFormat';
import { SEEK_COMMENT } from '@/app/sound/codec/seekTable';

const KEY = 'ab'.repeat(32);

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** The 61 s tone as Atlas 0.13.x stores it: its packets written again by the copy writer, which adds `ATLAS_SEEK`. */
function atlasCopyOf(file: Uint8Array): { copy: Blob; frames: number; channels: number } {
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

function peaks(): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length: 400 }, (_, index) => (index * 7) % 256);
}

const FACTS: Omit<AtlasCopyFacts, 'frames' | 'channels'> = {
  key: KEY,
  codec: CODEC_VERSION,
  from: 'Tavern Night – ambience.mp3',
  lufs: -17.25,
  truePeakDb: -1.5,
  peaks: peaks(),
};

/** The file with its second page replaced by one holding `tags`, checksum and all. */
function withTagsPacket(file: Uint8Array, tags: Uint8Array): Blob {
  const first = readPage(file, 0);
  const second = first && readPage(file, first.end);
  if (!first || !second) throw new Error('no header');
  const page = writePage({ flags: 0, granule: 0, serial: second.serial, sequence: 1, segments: lacingOf(tags.length), body: [tags] });
  return new Blob([file.subarray(0, first.end), page, file.subarray(second.end)]);
}

function tagsHeader(count: number, ...rest: number[]): Uint8Array {
  const vendor = new TextEncoder().encode('x');
  const bytes = new Uint8Array(8 + 4 + vendor.length + 4 + rest.length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('OpusTags'), 0);
  view.setUint32(8, vendor.length, true);
  bytes.set(vendor, 12);
  view.setUint32(13, count, true);
  bytes.set(rest, 17);
  return bytes;
}

describe('Atlas facts in an Opus copy', () => {
  let fixture: Blob;
  let fixtureBytes: Uint8Array;
  let frames: number;
  let channels: number;
  let tagged: Blob;

  beforeAll(async () => {
    const copy = atlasCopyOf(new Uint8Array(readFileSync('tests/fixtures/sound/tone220-61s.ogg')));
    fixture = copy.copy;
    frames = copy.frames;
    channels = copy.channels;
    fixtureBytes = await bytesOf(fixture);
    tagged = await withComments(fixture, () => true, atlasComments(FACTS));
  });

  it('starts from a copy that carries a seek table', () => {
    const first = readPage(fixtureBytes, 0);
    const second = first && readPage(fixtureBytes, first.end);
    const tags = second && packetsOfPage(second, null).packets[0];
    expect(tags && readOpusComment(tags, SEEK_COMMENT)).toBeTruthy();
  });

  it('round trip', async () => {
    expect(await readAtlasCopy(tagged)).toEqual({ ...FACTS, frames, channels });
  });

  it('round trip of silence without peaks', async () => {
    const silent = { ...FACTS, lufs: -Infinity, truePeakDb: -Infinity, peaks: null };
    const comments = atlasComments(silent);
    expect(comments.some((comment) => comment.startsWith('R128_TRACK_GAIN='))).toBe(false);
    expect(comments.some((comment) => comment.startsWith('ATLAS_PEAKS='))).toBe(false);
    expect(await readAtlasCopy(await withComments(fixture, () => true, comments))).toEqual({ ...silent, frames, channels });
  });

  it('writes the track gain as Q7.8 towards -23 LUFS, within int16', () => {
    const gain = (lufs: number): string | undefined => atlasComments({ ...FACTS, lufs }).find((comment) => comment.startsWith('R128_TRACK_GAIN='));
    expect(gain(-17.25)).toBe(`R128_TRACK_GAIN=${Math.round(256 * -5.75)}`);
    expect(gain(-200)).toBe('R128_TRACK_GAIN=32767');
    expect(gain(100)).toBe('R128_TRACK_GAIN=-31488');
  });

  it('forPlayers gives the 0.13.1 bytes back', async () => {
    expect(await bytesOf(await forPlayers(tagged))).toEqual(fixtureBytes);
  });

  it('audio pages untouched', async () => {
    const taggedBytes = await bytesOf(tagged);
    const fixtureFirst = readPage(fixtureBytes, 0);
    const fixtureTags = fixtureFirst && readPage(fixtureBytes, fixtureFirst.end);
    const taggedFirst = readPage(taggedBytes, 0);
    const taggedTags = taggedFirst && readPage(taggedBytes, taggedFirst.end);
    if (!fixtureTags || !taggedTags || !fixtureFirst || !taggedFirst) throw new Error('no header');
    expect(taggedBytes.subarray(0, taggedFirst.end)).toEqual(fixtureBytes.subarray(0, fixtureFirst.end));
    expect(taggedBytes.subarray(taggedTags.end)).toEqual(fixtureBytes.subarray(fixtureTags.end));
    expect(taggedTags.sequence).toBe(1);
    expect(taggedTags.serial).toBe(fixtureTags.serial);
  });

  it('not Atlas-made', async () => {
    expect(await readAtlasCopy(fixture)).toBeNull();
    const shortKey = atlasComments(FACTS).map((comment) => (comment.startsWith('ATLAS_SOURCE=') ? `ATLAS_SOURCE=${KEY.slice(1)}` : comment));
    expect(await readAtlasCopy(await withComments(fixture, () => true, shortKey))).toBeNull();
  });

  it('refuses what is no Opus file', async () => {
    await expect(withComments(new Blob([new Uint8Array(100)]), () => true, [])).rejects.toThrow();
    expect(await readAtlasCopy(new Blob([new Uint8Array(100)]))).toBeNull();
    expect(await readAtlasCopy(new Blob([]))).toBeNull();
  });

  it('hostile', async () => {
    const taggedBytes = await bytesOf(tagged);
    const first = readPage(taggedBytes, 0);
    if (!first) throw new Error('no header');
    expect(await readAtlasCopy(new Blob([taggedBytes.subarray(0, first.end + 200)]))).toBeNull();
    expect(await readAtlasCopy(withTagsPacket(fixtureBytes, tagsHeader(2 ** 32 - 1, 1, 0, 0, 0, 0x41)))).toBeNull();
    expect(await readAtlasCopy(withTagsPacket(fixtureBytes, tagsHeader(1, 0xe8, 0x03, 0, 0, 0x41, 0x42)))).toBeNull();
    expect(await readAtlasCopy(new Blob([taggedBytes.subarray(0, taggedBytes.length - 10)]))).toBeNull();
  });

  it('reads what a value may hold, and nothing else', async () => {
    const replaced = (name: string, value: string): string[] =>
      atlasComments(FACTS).map((comment) => (comment.startsWith(`${name}=`) ? `${name}=${value}` : comment));
    const read = async (comments: readonly string[]): Promise<AtlasCopyFacts | null> => readAtlasCopy(await withComments(fixture, () => true, comments));
    expect(await read(replaced('ATLAS_LUFS', 'loud'))).toBeNull();
    expect(await read(replaced('ATLAS_LUFS', ''))).toBeNull();
    expect(await read(replaced('ATLAS_TRUE_PEAK', 'NaN'))).toBeNull();
    expect(await read(replaced('ATLAS_VTT', '1.5'))).toBeNull();
    expect((await read(replaced('ATLAS_PEAKS', 'AAAA')))?.peaks).toBeNull();
    expect((await read(replaced('ATLAS_PEAKS', '%%%')))?.peaks).toBeNull();
    expect((await read(replaced('ATLAS_FROM', 'x'.repeat(300))))?.from).toBe('x'.repeat(255));
  });

  it('fits one page', async () => {
    const seek = `${SEEK_COMMENT}=${'a'.repeat(64_000)}`;
    const big = await bytesOf(await withComments(fixture, (comment) => !comment.startsWith(SEEK_COMMENT), [seek, ...atlasComments(FACTS)]));
    const first = readPage(big, 0);
    const second = first && readPage(big, first.end);
    if (!second) throw new Error('tags page did not read');
    const { packets, tail } = packetsOfPage(second, null);
    expect(tail).toBeNull();
    expect(packets).toHaveLength(1);
    expect(readOpusComment(packets[0] ?? new Uint8Array(), SEEK_COMMENT)).toHaveLength(64_000);
    expect(await readAtlasCopy(new Blob([big]))).toEqual({ ...FACTS, frames, channels });
  });

  it('refuses to write what it would not read back as Atlas-made', () => {
    for (const key of [KEY.slice(1), KEY.toUpperCase(), `${KEY.slice(1)}g`]) expect(() => atlasComments({ ...FACTS, key })).toThrow();
    for (const codec of [0, -1, 1.5, NaN, 2 ** 31]) expect(() => atlasComments({ ...FACTS, codec })).toThrow();
    for (const lufs of [NaN, Infinity, 150, -300]) expect(() => atlasComments({ ...FACTS, lufs })).toThrow();
    for (const truePeakDb of [NaN, Infinity, 200, -2000]) expect(() => atlasComments({ ...FACTS, truePeakDb })).toThrow();
    expect(() => atlasComments({ ...FACTS, lufs: -Infinity, truePeakDb: -Infinity })).not.toThrow();
  });

  it('tags a copy beside the largest seek table, its file name cut to the room left', async () => {
    const seek = `${SEEK_COMMENT}=${'a'.repeat(64_000)}`;
    const longest = await withComments(fixture, (comment) => !comment.startsWith(SEEK_COMMENT), [seek]);
    const name = 'Ünterwelt 音 '.repeat(160).slice(0, 2_000);
    const facts = await readAtlasCopy(await tagCopy(longest, { ...FACTS, from: name }));
    expect(facts).toEqual({ ...FACTS, from: expect.any(String) as string, frames, channels });
    const from = facts?.from ?? '';
    expect(from.length).toBeGreaterThan(0);
    expect(Array.from(from).length).toBeLessThan(255);
    expect(name.startsWith(from)).toBe(true);
    expect(from).not.toContain('\uFFFD');
  });

  it('tags a copy keeping its seek table and nothing else of what it said', async () => {
    const dated = await withComments(fixture, () => true, ['ATLAS_VTT=0', 'OTHER=1']);
    const taggedAgain = await tagCopy(dated, FACTS);
    expect(await readAtlasCopy(taggedAgain)).toEqual({ ...FACTS, frames, channels });
    expect(await bytesOf(await forPlayers(taggedAgain))).toEqual(fixtureBytes);
  });

  it('refuses tags that do not fit one page', async () => {
    await expect(withComments(fixture, () => true, [`X=${'a'.repeat(70_000)}`])).rejects.toThrow();
  });
});

describe('readOpusComments', () => {
  it('reads every comment', () => {
    expect(readOpusComments(writeOpusTags(['A=1', 'B=two']))).toEqual(['A=1', 'B=two']);
  });

  it('refuses counts and lengths the packet does not hold', () => {
    expect(readOpusComments(tagsHeader(2 ** 32 - 1))).toBeNull();
    expect(readOpusComments(tagsHeader(65))).toBeNull();
    expect(readOpusComments(tagsHeader(1, 0xe8, 0x03, 0, 0, 0x41))).toBeNull();
    expect(readOpusComments(tagsHeader(2, 1, 0, 0, 0, 0x41))).toBeNull();
    expect(readOpusComments(new Uint8Array(20))).toBeNull();
  });
});
