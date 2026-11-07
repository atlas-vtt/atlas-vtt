import { ASSET_CAPS, MAX_SEGMENTS } from '../../protocol/index.ts';
import type { GrowingCopy } from '../../../sound/codec/growingCopy';
import { openOggOpus } from '../../../sound/codec/oggOpusReader';
import { readPage } from '../../../sound/codec/oggPages';
import { encodeSegmentManifest, SEGMENT_FRAMES, SegmentCutter, segmentManifest } from '../../../sound/codec/soundSegments';
import type { SoundBytes } from '../../../sound/soundTypes';
import type { FormPart } from '../assets/multipartBody.ts';

/** A batch of segments, as one request carries them: few enough that the first goes up at once, and well under the store's 8 MiB. */
const BATCH_SEGMENTS = 8;
const BATCH_BYTES = 6 * 1024 * 1024;
/** The most a second of a copy takes, with room: Opus at 96 kbit/s is 12 kB, a loud passage more, and pages add their headers. */
const BOUND_BYTES_PER_SECOND = 24_000;
/** A copy's length may come out longer than estimated by this much before its bound is too small. */
const LENGTH_ROOM = 1.25;

/** A batch to send: its parts (the manifest with the first), and the next segment after it. */
export interface SegmentBatch {
  readonly parts: FormPart[];
  readonly next: number;
}

/**
 * A long sound's segments for players, cut as its copy is made or read from its stored copy: the manifest,
 * then each 30-second segment once a later page begins. Offered at a bound worked out of its estimated
 * length, it settles at its true size and count once the copy is whole. Segments are kept as Blobs, out of
 * the JS heap, for as long as the table runs.
 */
export class LiveSegments {
  readonly manifest: Uint8Array<ArrayBuffer>;
  /** What the store is asked to keep at most until the copy is whole: bytes and pieces (the manifest and the segments). */
  readonly boundBytes: number;
  readonly boundPieces: number;
  private readonly segments: Blob[] = [];
  private readonly cutter: SegmentCutter;
  private segmentBytes = 0;
  /** Where the next page begins. */
  private granule = 0;
  private finished = false;
  private failure: Error | null = null;
  private readonly listeners = new Set<() => void>();

  private constructor(head: Uint8Array, estimatedFrames: number) {
    const manifest = segmentManifest(head);
    this.manifest = Uint8Array.from(new TextEncoder().encode(encodeSegmentManifest(manifest)));
    const seconds = (estimatedFrames * LENGTH_ROOM) / 48_000;
    this.boundPieces = Math.min(MAX_SEGMENTS, Math.ceil((estimatedFrames * LENGTH_ROOM) / SEGMENT_FRAMES) + 1) + 1;
    this.boundBytes = Math.min(ASSET_CAPS.segments, Math.ceil(seconds * BOUND_BYTES_PER_SECOND) + this.manifest.byteLength);
    this.cutter = new SegmentCutter(manifest.preSkip, (segment) => {
      this.segments[segment.index] = new Blob([segment.bytes]);
      this.segmentBytes += segment.bytes.byteLength;
      this.changed();
    });
  }

  /** The segments of a copy being made, cut as its pages come and done when it is. */
  static async ofGrowing(copy: GrowingCopy): Promise<LiveSegments> {
    const live = new LiveSegments(copy.head, copy.estimatedFrames);
    await copy.follow({ pages: (bytes) => live.feed(bytes), ended: (failure) => (failure ? live.fail(failure) : live.end()) });
    return live;
  }

  /** The segments of a stored copy, all cut at once. */
  static async ofStored(bytes: SoundBytes): Promise<LiveSegments> {
    const sound = await openOggOpus(bytes);
    const audio = await bytes.read(sound.audioStart, bytes.byteLength);
    const lastGranule = lastPageGranule(audio);
    const live = new LiveSegments(sound.head, Math.max(0, lastGranule - sound.preSkip));
    live.feed(audio);
    live.end();
    return live;
  }

  /** The true size once the copy is whole: the manifest and every segment. */
  get bytes(): number {
    return this.manifest.byteLength + this.segmentBytes;
  }

  /** Pieces once the copy is whole: the manifest and every segment. */
  get pieces(): number {
    return this.segments.length + 1;
  }

  get done(): boolean {
    return this.finished;
  }

  get failed(): boolean {
    return this.failure !== null;
  }

  /** Segment `next` is cut and may go up. */
  readyAt(next: number): boolean {
    return next < this.segments.length;
  }

  /** Nothing from `next` on is left to send. */
  doneAt(next: number): boolean {
    return this.finished && next >= this.segments.length;
  }

  /** Segments from `next` on, as many as one request carries; the manifest goes with the first. */
  async batch(next: number): Promise<SegmentBatch> {
    const parts: FormPart[] = next === 0 ? [{ name: 'manifest.json', bytes: this.manifest, type: 'application/json' }] : [];
    let bytes = 0;
    let index = next;
    for (; index < this.segments.length && index < next + BATCH_SEGMENTS; index++) {
      const segment = this.segments[index];
      if (!segment || (index > next && bytes + segment.size > BATCH_BYTES)) break;
      parts.push({ name: `${index}.ogg`, bytes: new Uint8Array(await segment.arrayBuffer()), type: 'audio/ogg' });
      bytes += segment.size;
    }
    return { parts, next: index };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Whole Ogg pages in order; each page's start is where the one before it ended (the stream begins at 0). */
  private feed(bytes: Uint8Array): void {
    for (let offset = 0; ;) {
      const page = readPage(bytes, offset);
      if (!page) break;
      this.cutter.add(bytes.subarray(page.offset, page.end), this.granule);
      this.granule = page.granule;
      offset = page.end;
    }
  }

  private end(): void {
    this.cutter.finish();
    this.finished = true;
    this.changed();
  }

  private fail(failure: Error): void {
    this.failure = failure;
    this.changed();
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/** The granule of the last whole page in some bytes of pages. */
function lastPageGranule(bytes: Uint8Array): number {
  let granule = 0;
  for (let offset = 0; ;) {
    const page = readPage(bytes, offset);
    if (!page) return granule;
    granule = page.granule;
    offset = page.end;
  }
}
