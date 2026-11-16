import type { SoundBuffer, SoundContext, SoundGainNode, SoundSourceNode } from './audioNodes';
import { GainTrack } from './gainTrack';
import { SOUND_RATE } from './soundMath';
import { frameInSpan, framesToWrap, type TimelineSpan } from './soundTimeline';
import type { SoundSources } from './soundSources';

/** Time a source is given to be ready in, past the next render. */
const START_MARGIN_SECONDS = 0.02;
/** A start that is not on its exact place fades up, as it comes in at some point of the waveform. */
const JOIN_SECONDS = 0.02;
export const CROSSFADE_SECONDS = 0.04;
/** Decoded audio kept ahead: about 8 MB per voice. */
const AHEAD_SECONDS = 20;
const WINDOW_FRAMES = 5 * SOUND_RATE;
/**
 * A run's first window is short: a press waits for its decode, which grows with the window, and the windows
 * after it are decoded while it sounds. Two seconds outlast a tick slowed to once a second (a tab in the back).
 */
export const FIRST_WINDOW_FRAMES = 2 * SOUND_RATE;
/**
 * What a late window aims past now once the run sounds, the time it takes to read and decode one, so the
 * windows after it still land on their exact frames.
 */
const JOIN_LEAD_SECONDS = 0.15;
/**
 * What a late FIRST window aims past now: only the start margin. Nothing sounds yet that a gap could break, and
 * a window that arrives later than this starts that much into itself, faded up, as any late start does: a press
 * is heard as soon as its window is decoded, not a fixed 150 ms on.
 */
export const FIRST_JOIN_LEAD_SECONDS = START_MARGIN_SECONDS;
const RETRY_SECONDS = 5;

export interface RunDeps {
  context: SoundContext;
  sources: SoundSources;
  output: SoundGainNode;
  onError: (key: string, error: unknown) => void;
}

export interface SoundRun {
  readonly span: TimelineSpan;
  /** No more is coming: it has been told to end, or has ended. */
  readonly finishing: boolean;
  /** Whether the bytes for this run have arrived yet. */
  readonly waiting: boolean;
  /** Called each tick; a run does whatever it has not done yet. */
  pump(): void;
  /** The next place at or after `nowFrame` where a restart cannot be heard much, in context frames. */
  boundaryFrame(nowFrame: number): number | null;
  /** Ends at a context frame, crossfading out over the time before it. */
  finishAt(ctxFrame: number, seconds: number): void;
  /** The same sound with another length or loudness, as a copy made while it played turned out. */
  follow(span: TimelineSpan, soundGain: number): void;
  dispose(): void;
}

/** How long a sound's gain takes to move to what its copy turned out to need. */
export const SOUND_GAIN_GLIDE_SECONDS = 2;

/** The span and its place on the context's clock, which both kinds of run share. */
abstract class RunBase implements SoundRun {
  protected readonly node: SoundGainNode;
  protected readonly gain: GainTrack;
  protected readonly ratio: number;
  protected soundGain: number;
  protected finishFrame: number | null = null;
  protected disposed = false;
  /** Takes over from a run that fades out, so it fades up even where it starts on its exact place. */
  protected readonly replacing: boolean;
  private problemUntil = 0;

  constructor(
    protected readonly deps: RunDeps,
    public span: TimelineSpan,
    /** Context frame of the play's frame 0. */
    protected readonly anchor: number,
    /** Nothing sounds before this context frame; a replacement crossfades in from here. */
    protected readonly notBefore: number,
    soundGain: number,
  ) {
    this.soundGain = soundGain;
    this.replacing = notBefore > Math.ceil(deps.context.currentTime * deps.context.sampleRate);
    this.ratio = deps.context.sampleRate / SOUND_RATE;
    this.node = deps.context.createGain();
    this.gain = new GainTrack(this.node.gain, soundGain);
    this.node.connect(deps.output);
  }

  abstract readonly waiting: boolean;
  abstract pump(): void;
  abstract boundaryFrame(nowFrame: number): number | null;

  get finishing(): boolean {
    return this.finishFrame !== null;
  }

  /**
   * The same sound told anew: a copy that played while it was made has its real length and loudness now.
   * Later windows read the new span, and the level glides to the new gain, slowly enough to go unheard.
   */
  follow(span: TimelineSpan, soundGain: number): void {
    this.span = span;
    if (soundGain === this.soundGain || this.finishing) return;
    this.soundGain = soundGain;
    this.gain.move(soundGain, this.deps.context.currentTime, SOUND_GAIN_GLIDE_SECONDS);
  }

  finishAt(ctxFrame: number, seconds: number): void {
    this.finishFrame = ctxFrame;
    this.gain.fade(0, Math.max(this.deps.context.currentTime, (ctxFrame - seconds * this.deps.context.sampleRate) / this.deps.context.sampleRate), seconds);
  }

  dispose(): void {
    this.disposed = true;
    this.node.disconnect();
  }

  protected ctxFrameOf(playFrame: number): number {
    return this.anchor + Math.round(playFrame * this.ratio);
  }

  protected playFrameOf(ctxFrame: number): number {
    return Math.floor((ctxFrame - this.anchor) / this.ratio);
  }

  protected nowFrame(margin = START_MARGIN_SECONDS): number {
    const { context } = this.deps;
    return Math.ceil((context.currentTime + margin) * context.sampleRate);
  }

  protected secondsOf(ctxFrame: number): number {
    return ctxFrame / this.deps.context.sampleRate;
  }

  /** The gain for a source that comes in at some point of its audio, not on its exact place. */
  protected fadeUp(startFrame: number): void {
    const seconds = this.replacing ? CROSSFADE_SECONDS : JOIN_SECONDS;
    this.gain.join(0, this.soundGain, this.secondsOf(startFrame), seconds, 0);
  }

  protected newSource(buffer: SoundBuffer): SoundSourceNode {
    const source = this.deps.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.node);
    return source;
  }

  protected failed(error: unknown): void {
    this.deps.sources.forget(this.span.sound.key);
    this.deps.onError(this.span.sound.key, error);
    this.problemUntil = this.deps.context.currentTime + RETRY_SECONDS;
  }

  /** True while a failure's wait lasts. A suspended context never reaches its end, nor needs to. */
  protected get backingOff(): boolean {
    return this.deps.context.currentTime < this.problemUntil;
  }
}

/** A sound up to 60 s: decoded once and looped by the source itself, which is sample-exact. */
export class BufferRun extends RunBase {
  private source: SoundSourceNode | null = null;
  /** Holds its buffer from the first pump to `dispose`, or until a failure says to ask again. */
  private retained = false;
  /** Its bytes came and no place was left to start in: nothing more will come of this run. */
  private tooLate = false;

  get waiting(): boolean {
    return this.source === null && !this.finishing && !this.tooLate;
  }

  pump(): void {
    if (this.retained || this.disposed || this.finishing || this.backingOff) return;
    const key = this.span.sound.key;
    this.retained = true;
    this.deps.sources.retain(key).then(
      (buffer) => this.start(buffer),
      (error: unknown) => {
        if (this.retained) this.deps.sources.release(key);
        this.retained = false;
        this.failed(error);
      },
    );
  }

  boundaryFrame(nowFrame: number): number | null {
    const { span } = this;
    const loop = span.loop;
    if (!loop) return span.endPlayFrame === null ? null : this.ctxFrameOf(span.endPlayFrame);
    const frame = frameInSpan(span, this.playFrameOf(nowFrame));
    return nowFrame + Math.round((loop.endFrame - frame) * this.ratio);
  }

  override finishAt(ctxFrame: number, seconds: number): void {
    super.finishAt(ctxFrame, seconds);
    this.source?.stop(this.secondsOf(ctxFrame));
  }

  override dispose(): void {
    if (this.retained) this.deps.sources.release(this.span.sound.key);
    this.retained = false;
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
    super.dispose();
  }

  private start(buffer: SoundBuffer): void {
    if (this.disposed || this.finishing) return;
    const { span } = this;
    const onTime = this.ctxFrameOf(span.startPlayFrame);
    const startFrame = Math.max(onTime, this.notBefore, this.nowFrame());
    const endFrame = span.endPlayFrame === null ? null : this.ctxFrameOf(span.endPlayFrame);
    if (endFrame !== null && startFrame >= endFrame) {
      this.tooLate = true;
      return;
    }
    const source = this.newSource(buffer);
    const loop = span.loop;
    if (loop) {
      source.loop = true;
      source.loopStart = loop.startFrame / SOUND_RATE;
      source.loopEnd = loop.endFrame / SOUND_RATE;
    }
    if (startFrame !== onTime || this.replacing) this.fadeUp(startFrame);
    source.start(this.secondsOf(startFrame), frameInSpan(span, this.playFrameOf(startFrame)) / SOUND_RATE);
    if (endFrame !== null) source.stop(this.secondsOf(endFrame));
    this.source = source;
  }
}

/**
 * A sound over 60 s: windows of 5 s decoded ahead and scheduled end to end, each on its exact frame of the
 * context's clock, also where the loop wraps from one window to the next. Holds about 20 s.
 */
export class WindowRun extends RunBase {
  /** The next play frame to decode. */
  private next: number;
  private busy = false;
  private placed = false;
  private readonly sources = new Set<SoundSourceNode>();
  private generation = 0;

  constructor(deps: RunDeps, span: TimelineSpan, anchor: number, notBefore: number, soundGain: number) {
    super(deps, span, anchor, notBefore, soundGain);
    this.next = Math.max(span.startPlayFrame, this.playFrameOf(notBefore));
  }

  get waiting(): boolean {
    return !this.placed && !this.finishing;
  }

  pump(): void {
    if (this.busy || this.disposed || this.finishFrame !== null || this.backingOff) return;
    const { span } = this;
    if (span.endPlayFrame !== null && this.next >= span.endPlayFrame) return;
    if (this.ctxFrameOf(this.next) > this.nowFrame(AHEAD_SECONDS)) return;
    // Late: what was to come is gone, so go on from where the table is now.
    const earliest = this.nowFrame();
    const lead = this.placed ? JOIN_LEAD_SECONDS : FIRST_JOIN_LEAD_SECONDS;
    if (this.ctxFrameOf(this.next) < earliest) this.next = Math.max(this.next, this.playFrameOf(this.nowFrame(lead)));
    if (span.endPlayFrame !== null && this.next >= span.endPlayFrame) return;
    const frame = frameInSpan(span, this.next);
    const toEnd = span.endPlayFrame === null ? Infinity : span.endPlayFrame - this.next;
    const count = Math.min(this.placed ? WINDOW_FRAMES : FIRST_WINDOW_FRAMES, framesToWrap(span, frame), toEnd);
    const playFrame = this.next;
    this.busy = true;
    const generation = this.generation;
    this.deps.sources.decodeWindow(span.sound.key, frame, count).then(
      (buffer) => {
        this.busy = false;
        if (generation !== this.generation || this.disposed) return;
        this.place(buffer, playFrame, count);
      },
      (error: unknown) => {
        this.busy = false;
        if (!this.disposed) this.failed(error);
      },
    );
    this.next = playFrame + count;
  }

  /** The start of the next window not yet scheduled, or the end of the span. */
  boundaryFrame(): number | null {
    return this.ctxFrameOf(this.next);
  }

  override dispose(): void {
    this.generation++;
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    super.dispose();
  }

  private place(buffer: SoundBuffer, playFrame: number, count: number): void {
    const onTime = this.ctxFrameOf(playFrame);
    const end = this.ctxFrameOf(playFrame + count);
    const startFrame = Math.max(onTime, this.notBefore, this.nowFrame());
    if (startFrame >= end) return;
    const source = this.newSource(buffer);
    source.onended = (): void => {
      this.sources.delete(source);
      source.disconnect();
    };
    if (startFrame !== onTime || (this.replacing && !this.placed)) this.fadeUp(startFrame);
    source.start(this.secondsOf(startFrame), (startFrame - onTime) / this.deps.context.sampleRate);
    this.sources.add(source);
    this.placed = true;
  }
}
