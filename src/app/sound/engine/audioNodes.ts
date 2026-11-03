/**
 * The part of Web Audio the engine uses, kept narrow so that `AudioContext`, `OfflineAudioContext` and a
 * test's recording context all fit.
 */
export interface SoundParam {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, time: number, timeConstant: number): unknown;
  setValueCurveAtTime(values: Float32Array<ArrayBuffer>, time: number, duration: number): unknown;
  cancelScheduledValues(time: number): unknown;
  /** Missing on Firefox. */
  cancelAndHoldAtTime?(time: number): unknown;
}

export interface SoundNode {
  connect(destination: SoundNode): unknown;
  /** From one destination, or from all of them. */
  disconnect(destination?: SoundNode): void;
}

/** Reads what passes it; hangs off a node and has no output of its own. */
export interface SoundAnalyser extends SoundNode {
  fftSize: number;
  getFloatTimeDomainData(into: Float32Array<ArrayBuffer>): void;
}

export interface SoundGainNode extends SoundNode {
  readonly gain: SoundParam;
}

export interface SoundBuffer {
  readonly length: number;
  readonly duration: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  copyToChannel(source: Float32Array<ArrayBuffer>, channel: number): void;
}

export interface SoundSourceNode extends SoundNode {
  buffer: SoundBuffer | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onended: ((event: Event) => unknown) | null;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
}

export interface SoundCompressorNode extends SoundNode {
  readonly threshold: { value: number };
  readonly knee: { value: number };
  readonly ratio: { value: number };
  readonly attack: { value: number };
  readonly release: { value: number };
}

/** Rings a sound through a room's impulse response. */
export interface SoundConvolverNode extends SoundNode {
  buffer: SoundBuffer | null;
  normalize: boolean;
}

export interface SoundContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: SoundNode;
  createGain(): SoundGainNode;
  createBufferSource(): SoundSourceNode;
  createDynamicsCompressor(): SoundCompressorNode;
  /** Only what shows meters asks for it. */
  createAnalyser?(): SoundAnalyser;
  /** Without it the mix plays dry. */
  createConvolver?(): SoundConvolverNode;
  createBuffer(channels: number, length: number, sampleRate: number): SoundBuffer;
  decodeAudioData(bytes: ArrayBuffer): Promise<SoundBuffer>;
}
