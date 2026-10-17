/**
 * Web Audio as far as one-shot playback reaches it, for jsdom, which has none: decoding,
 * buffer sources, gain nodes and the context's own state. Install it with
 * `vi.stubGlobal('AudioContext', FakeAudioContext)`; every context made since is in `instances`.
 *
 * A file decodes when its text starts with `audio:<frames>` (stereo, at the context's rate; the
 * rest of the text is ignored, so a file can be padded to any size) and fails otherwise, as
 * `decodeAudioData` rejects bytes that are no audio. Like a real source, a stopped one reports
 * `ended` a moment later; `finish` ends one that played out.
 */

export interface FakeAudioBuffer {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly duration: number;
  /** The text of the file it was decoded from. */
  readonly decodedFrom: string;
}

class FakeNode {
  readonly outputs = new Set<FakeNode | FakeDestination>();
  connect(target: FakeNode | FakeDestination): FakeNode | FakeDestination {
    this.outputs.add(target);
    return target;
  }
  disconnect(): void {
    this.outputs.clear();
  }
}

class FakeDestination {}

class FakeAudioParam {
  constructor(public value: number) {}
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

export class FakeGainNode extends FakeNode {
  readonly gain = new FakeAudioParam(1);
}

export class FakeBufferSource extends FakeNode {
  buffer: FakeAudioBuffer | null = null;
  started = false;
  stopped = false;
  ended = false;
  onended: (() => void) | null = null;

  start(): void {
    if (this.started) throw new Error('InvalidStateError: a source starts once');
    this.started = true;
  }

  stop(): void {
    if (!this.started) throw new Error('InvalidStateError: the source has not started');
    if (this.stopped) return;
    this.stopped = true;
    queueMicrotask(() => this.end());
  }

  /** The sound played to its end. */
  finish(): void {
    this.end();
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.onended?.();
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  /** The state a new context starts in; browsers start one suspended without a user gesture. */
  static initialState: AudioContextState = 'running';

  state: AudioContextState = FakeAudioContext.initialState;
  currentTime = 0;
  readonly sampleRate = 48000;
  readonly destination = new FakeDestination();
  readonly sources: FakeBufferSource[] = [];
  decodeCount = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  static reset(): void {
    FakeAudioContext.instances = [];
    FakeAudioContext.initialState = 'running';
  }

  resume(): Promise<void> {
    if (this.state !== 'closed') this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  decodeAudioData(bytes: ArrayBuffer): Promise<FakeAudioBuffer> {
    this.decodeCount += 1;
    const text = new TextDecoder().decode(bytes);
    const frames = /^audio:(\d+)/.exec(text)?.[1];
    if (frames === undefined) return Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
    const length = Number(frames);
    return Promise.resolve({ length, numberOfChannels: 2, sampleRate: this.sampleRate, duration: length / this.sampleRate, decodedFrom: text });
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  }

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }

  /** Sources started and neither stopped nor ended: what is heard now. */
  playing(): FakeBufferSource[] {
    return this.sources.filter((source) => source.started && !source.stopped && !source.ended);
  }

  /** The gain node `source` plays through and whether that reaches the speakers. */
  route(source: FakeBufferSource): { gain: number; audible: boolean } {
    const gain = [...source.outputs].find((node): node is FakeGainNode => node instanceof FakeGainNode);
    return { gain: gain?.gain.value ?? 1, audible: gain !== undefined && gain.outputs.has(this.destination) };
  }
}
