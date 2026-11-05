import { joined } from './pcmStages';
import { crossfadeTailIntoHead, CROSSFADE_FRAMES, LOOP_HOLD_FRAMES, paddingAtEnd, seamState, type PaddingSearch, type Planes } from './loopSeam';

/** What became of the wrap: left as it was, or joined by a crossfade baked into the sound. */
export type LoopSeam = 'continuous' | 'crossfaded';

export interface LoopFinish {
  seam: LoopSeam;
  /** Frames at the start of what was written that the stream's pre-skip must pass over. */
  skipFrames: number;
  /** The sound's last frames: those it already had at the start, so they are measured once. */
  closing: Planes;
  /**
   * What comes after the end, for the encoder alone: told the sound stops, it spends the last frames on the stop,
   * and they splatter on every wrap. The stream ends before these.
   */
  runOn: Planes;
}

/** Under this a sound is more crossfade than sound, and no join can help it. */
const MIN_CROSSFADED_FRAMES = 4 * CROSSFADE_FRAMES;
/** An Opus packet and the encoder's look-ahead, twice over. */
const RUN_ON_FRAMES = 2 * (960 + 312);
/**
 * Where the stream wraps, past its start. An encoder's first packet is its worst, spent on a sound that came from
 * nothing, so the wrap lies past it and what lay before comes again at the end: nothing of the sound changes, and
 * both sides of the wrap are coded with the sound going on around them. No further: from a pre-skip of 1920, two
 * packets, WebKit starts its decoder at the wrap, cold, and the first 40 ms come out up to 10 dB low. With the
 * encoder's own 312 this makes 1752.
 */
const WRAP_INSET_FRAMES = 1440;

/**
 * The two ends of a sound marked as a loop. The start waits until padding can be told from sound; the end is
 * held back until the file is over, and only then is the wrap looked at. Everything between goes straight on,
 * so a crossfade costs no second pass: what it replaces at the start was written already, and stays in the
 * stream as what the decoder runs in on, under a longer pre-skip.
 */
export class LoopEnds {
  private held: Planes;
  private started = false;
  /** The sound's first frames, as the end will need them. */
  private head: Planes = [];
  private written = 0;
  private dropped = 0;

  /**
   * @param padding Where a file does not say how much of its ends is a codec's padding, how to look: null where it does.
   * @param wrapFrames Frames at the start the resampler gave without what lies before them, and gives again past the end.
   */
  constructor(
    channels: number,
    private readonly padding: PaddingSearch | null,
    private readonly wrapFrames: number,
  ) {
    this.held = Array.from({ length: channels }, () => new Float32Array(0));
  }

  /** @param droppedFrames What the silence trim took off the file's start, from which priming is counted. */
  process(planes: readonly Float32Array<ArrayBuffer>[], emit: (planes: Planes) => void, droppedFrames = 0): void {
    this.dropped = droppedFrames;
    this.held = this.held.map((old, channel) => joined(old, planes[channel] ?? new Float32Array(0)));
    if (!this.started) {
      if (this.heldFrames() < this.holdFrames() * 2) return;
      this.start(emit);
    }
    this.emitUpTo(this.heldFrames() - this.holdFrames(), emit);
  }

  finish(emit: (planes: Planes) => void): LoopFinish {
    if (!this.started) this.start(emit);
    if (this.padding) {
      const padding = paddingAtEnd(this.held, this.padding.reach, true);
      this.held = this.held.map((plane) => plane.slice(0, plane.length - padding));
    }
    const state = seamState(this.head, this.held);
    if (this.written + this.heldFrames() < MIN_CROSSFADED_FRAMES || state === 'continuous') {
      this.emitUpTo(this.heldFrames(), emit);
      return this.closed('continuous', 0);
    }
    const fade = crossfadeTailIntoHead(this.head, this.held, state);
    const frames = fade.planes[0]?.length ?? 0;
    this.emitUpTo(this.heldFrames() - fade.lag - frames, emit);
    emit(fade.planes);
    return this.closed('crossfaded', frames);
  }

  private heldFrames(): number {
    return this.held[0]?.length ?? 0;
  }

  private holdFrames(): number {
    return LOOP_HOLD_FRAMES + (this.padding?.reach ?? 0);
  }

  private start(emit: (planes: Planes) => void): void {
    this.started = true;
    const priming = (this.padding?.priming ?? []).map((frames) => frames - this.dropped).filter((frames) => frames > 0);
    const padding = this.padding ? paddingAtEnd(this.held, this.padding.reach, false, priming) : 0;
    this.held = this.held.map((plane) => plane.slice(padding));
    if (this.wrapFrames > 0) {
      emit(this.held.map((plane) => plane.subarray(0, this.wrapFrames)));
      this.held = this.held.map((plane) => plane.slice(this.wrapFrames));
    }
    this.head = this.held.map((plane) => plane.slice(0, LOOP_HOLD_FRAMES));
  }

  /** @param joined Frames of the head the end has already reached. */
  private closed(seam: LoopSeam, joined: number): LoopFinish {
    const inset = Math.max(joined, Math.min(WRAP_INSET_FRAMES - this.wrapFrames, this.written - joined));
    return {
      seam,
      skipFrames: this.wrapFrames + inset,
      closing: this.head.map((plane) => plane.subarray(joined, inset)),
      runOn: this.head.map((plane) => plane.subarray(inset, inset + RUN_ON_FRAMES)),
    };
  }

  private emitUpTo(frames: number, emit: (planes: Planes) => void): void {
    if (frames <= 0) return;
    emit(this.held.map((plane) => plane.subarray(0, frames)));
    this.held = this.held.map((plane) => plane.slice(frames));
    this.written += frames;
  }
}
