/** More than a card's width ever draws; 400 bytes kept with the copy. */
export const PEAK_BUCKETS = 400;

/** Every eighth sample: 6 kHz says as much of how loud a moment is as 48 do. */
const SAMPLE_STEP = 8;

/** How loud each part of a sound is: root mean square per bucket, the loudest part as 255. */
export class PeakCollector {
  private readonly energy = new Float64Array(PEAK_BUCKETS);
  private readonly counts = new Uint32Array(PEAK_BUCKETS);
  private position = 0;
  private scratch = new Float32Array(0);

  constructor(private readonly frames: number) {}

  /** The first channel of what a decoder gave. The data stays open: closing it is the caller's. */
  take(data: AudioData): void {
    const length = data.numberOfFrames;
    if (this.scratch.length < length) this.scratch = new Float32Array(length);
    data.copyTo(this.scratch, { planeIndex: 0, format: 'f32-planar' });
    this.add(this.scratch, length);
  }

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
