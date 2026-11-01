import { beforeAll, describe, expect, it } from 'vitest';
import { openOggOpus, readPacketRange } from '@/app/sound/codec/oggOpusReader';
import { webCodecsWindowDecode, wholeFileWindowDecode, PRE_ROLL_FRAMES } from '@/app/sound/engine/windowDecoder';
import { FIXTURE_FRAMES, loadFixtures, memoryBytes, type Fixtures } from './soundHarness';

function snr(reference: Float32Array, tested: Float32Array): number {
  let signal = 0;
  let noise = 0;
  for (let i = 0; i < reference.length; i++) {
    const a = reference[i] ?? 0;
    signal += a * a;
    noise += (a - (tested[i] ?? 0)) ** 2;
  }
  return noise === 0 ? Infinity : 10 * Math.log10(signal / noise);
}

describe('the file a long sound is', () => {
  let fixtures: Fixtures;
  let whole: Float32Array;
  let bytes: Uint8Array;

  beforeAll(async () => {
    fixtures = await loadFixtures();
    bytes = fixtures.files.get('long') ?? new Uint8Array();
    const context = new OfflineAudioContext(2, 48000, 48000);
    whole = (await context.decodeAudioData(bytes.slice().buffer)).getChannelData(0).slice();
  });

  it('has a table, which decodeAudioData does not mind: exact length', async () => {
    const sound = await openOggOpus(memoryBytes(bytes));
    expect(sound.seek.length).toBeGreaterThan(5);
    expect(whole.length).toBe(FIXTURE_FRAMES.long);
  });

  it('plays in an <audio> element at its right length, table and all', async () => {
    const element = new Audio();
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'audio/ogg' }));
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        element.onloadedmetadata = (): void => resolve(element.duration);
        element.onerror = (): void => reject(new Error('the element refused the file'));
        element.src = url;
      });
      console.log(`<audio> reads the tagged file as ${duration.toFixed(3)} s`);
      expect(duration).toBeCloseTo(FIXTURE_FRAMES.long / 48000, 1);
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  it.each([
    ['AudioDecoder', webCodecsWindowDecode],
    ['whole-file windows', wholeFileWindowDecode],
  ])('gets the same audio through %s as a whole decode, anywhere in the file', async (name, decodeOf) => {
    if (name === 'AudioDecoder' && typeof AudioDecoder === 'undefined') return;
    const context = new OfflineAudioContext(2, 48000, 48000);
    const decode = decodeOf(context);
    const source = memoryBytes(bytes);
    const sound = await openOggOpus(source);
    const reports: string[] = [];
    for (const [frame, count] of [[0, 96_000], [1_000_003, 240_000], [FIXTURE_FRAMES.long - 96_000, 96_000]] as const) {
      const from = frame + sound.preSkip;
      const packets = await readPacketRange(sound, source, from - PRE_ROLL_FRAMES, from + count);
      const buffer = await decode(sound, packets, from, count);
      expect(buffer.length).toBe(count);
      const reference = whole.subarray(frame, frame + count);
      const quality = snr(reference, (buffer as AudioBuffer).getChannelData(0));
      reports.push(`${frame}: ${quality.toFixed(1)} dB`);
      expect(quality).toBeGreaterThan(30);
    }
    console.log(`window against whole decode, ${name}: ${reports.join(', ')}`);
  });
});
