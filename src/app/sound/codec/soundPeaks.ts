import { BlobWindow } from './demux/blobWindow';
import { MAX_PAGE_BYTES, packetsOfPage, readPage } from './oggPages';
import { opusPacketFrames, readOpusHead, writeOpusHead } from './opusFormat';

/** More than a card's width ever draws; 400 bytes kept with the copy. */
export const PEAK_BUCKETS = 400;

const MAX_QUEUE = 32;
const QUEUE_WAIT_MS = 10;
/** Every eighth sample: 6 kHz says as much of how loud a moment is as 48 do. */
const SAMPLE_STEP = 8;
/** How many pages make a step for the one who watches that it gets anywhere: about 4 s of sound each. */
const PAGES_PER_STEP = 64;

/** How loud each part of a sound is: root mean square per bucket, the loudest part as 255. */
export class PeakCollector {
  private readonly energy = new Float64Array(PEAK_BUCKETS);
  private readonly counts = new Uint32Array(PEAK_BUCKETS);
  private position = 0;

  constructor(private readonly frames: number) {}

  add(samples: Float32Array, length: number): void {
    const perBucket = Math.max(1, this.frames) / PEAK_BUCKETS;
    for (let i = 0; i < length; i += SAMPLE_STEP) {
      const sample = samples[i] ?? 0;
      const bucket = Math.min(PEAK_BUCKETS - 1, Math.floor((this.position + i) / perBucket));
      this.energy[bucket] = (this.energy[bucket] ?? 0) + sample * sample;
      this.counts[bucket] = (this.counts[bucket] ?? 0) + 1;
    }
    this.position += length;
  }

  result(): Uint8Array<ArrayBuffer> {
    const levels = Array.from(this.energy, (energy, bucket) => Math.sqrt(energy / Math.max(1, this.counts[bucket] ?? 0)));
    const loudest = Math.max(...levels);
    return Uint8Array.from(levels, (level) => (loudest > 0 ? Math.round((level / loudest) * 255) : 0));
  }
}

/** Reads a copy through its pages and a real decoder. Meant for a worker: it decodes the whole sound. */
export async function readPeaksOfCopy(copy: Blob, frames: number, onStep: () => void): Promise<Uint8Array<ArrayBuffer>> {
  const collector = new PeakCollector(frames);
  const window = new BlobWindow(copy);
  const failures: Error[] = [];
  let samples = new Float32Array(0);
  const decoder = new AudioDecoder({
    output: (data) => {
      const length = data.numberOfFrames;
      if (samples.length < length) samples = new Float32Array(length);
      data.copyTo(samples, { planeIndex: 0, format: 'f32-planar' });
      data.close();
      collector.add(samples, length);
    },
    error: (error) => {
      failures.push(error);
    },
  });
  let offset = 0;
  let pageIndex = 0;
  let packetFrames = 0;
  try {
    for (;;) {
      const page = readPage(await window.at(offset, MAX_PAGE_BYTES), 0);
      if (!page) break;
      offset += page.end;
      const parts = packetsOfPage(page, null).packets;
      if (pageIndex === 0) {
        const head = parts[0];
        if (!head) throw new Error('The copy has no Opus header.');
        const { channels } = readOpusHead(head);
        decoder.configure({ codec: 'opus', sampleRate: 48_000, numberOfChannels: channels, description: writeOpusHead(channels, 0) });
      } else if (pageIndex > 1) {
        for (const packet of parts) {
          decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round((packetFrames * 1e6) / 48_000), data: packet }));
          packetFrames += opusPacketFrames(packet);
        }
        if (decoder.decodeQueueSize > MAX_QUEUE) await new Promise((resolve) => self.setTimeout(resolve, QUEUE_WAIT_MS));
      }
      pageIndex++;
      if (pageIndex % PAGES_PER_STEP === 0) onStep();
    }
    if (decoder.state === 'configured') await decoder.flush();
  } finally {
    if (decoder.state !== 'closed') decoder.close();
  }
  if (failures[0]) throw failures[0];
  return collector.result();
}
