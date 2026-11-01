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
  disconnect(): void;
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
  onended: (() => void) | null;
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

export interface SoundContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: SoundNode;
  createGain(): SoundGainNode;
  createBufferSource(): SoundSourceNode;
  createDynamicsCompressor(): SoundCompressorNode;
  createBuffer(channels: number, length: number, sampleRate: number): SoundBuffer;
  decodeAudioData(bytes: ArrayBuffer): Promise<SoundBuffer>;
}
