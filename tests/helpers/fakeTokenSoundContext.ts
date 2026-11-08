import { vi } from 'vitest';
import type { SoundBuffer, SoundNode } from '@/app/sound/engine/audioNodes';
import { FakeSoundContext, fakeBuffer, type FakeGain, type FakeSource } from './fakeSoundContext';

/**
 * The engine's recording context as token sounds use it, for jsdom, which has no Web Audio: what
 * `TokenSoundPlayer` asks of a context beyond `SoundContext` (its state, waking and closing), every
 * context made since `reset` in `instances`, and which node each one is connected to. Install it
 * with `vi.stubGlobal('AudioContext', FakeTokenSoundContext)`.
 *
 * A file decodes when its text starts with `audio:<frames>` (the rest is ignored, so a file can be
 * padded to any size) and fails otherwise, as `decodeAudioData` rejects bytes that are no audio.
 * Nothing ends by itself: a test sends a source's `ended` with `onended`.
 */
export class FakeTokenSoundContext extends FakeSoundContext {
  static instances: FakeTokenSoundContext[] = [];
  /** The state a new context starts in; browsers start one suspended without a user gesture. */
  static initialState: AudioContextState = 'running';

  state: AudioContextState = FakeTokenSoundContext.initialState;
  readonly resume = vi.fn((): Promise<void> => {
    if (this.state !== 'closed') this.state = 'running';
    return Promise.resolve();
  });
  readonly close = vi.fn((): Promise<void> => {
    this.state = 'closed';
    return Promise.resolve();
  });
  /** What each node is connected to now. */
  private readonly outputs = new Map<SoundNode, Set<SoundNode>>();

  constructor() {
    super();
    FakeTokenSoundContext.instances.push(this);
  }

  static reset(): void {
    FakeTokenSoundContext.instances = [];
    FakeTokenSoundContext.initialState = 'running';
  }

  override decodeAudioData(bytes?: ArrayBuffer): Promise<SoundBuffer> {
    this.decodeCalls++;
    const frames = /^audio:(\d+)/.exec(new TextDecoder().decode(bytes))?.[1];
    if (frames === undefined) return Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
    return Promise.resolve(fakeBuffer(Number(frames), this.sampleRate));
  }

  override createGain(): FakeGain {
    return this.tracked(super.createGain());
  }

  override createBufferSource(): FakeSource {
    return this.tracked(super.createBufferSource());
  }

  /** The started sources not told to stop: what is still to be heard once fades are over. */
  unstopped(): FakeSource[] {
    return this.sources.filter((source) => source.started && source.stoppedAt === null);
  }

  /** The gain `source` plays through, and whether that reaches the speakers. */
  route(source: FakeSource): { gain: number; audible: boolean } {
    const gain = this.gains.find((node) => this.outputs.get(source)?.has(node));
    return { gain: gain?.gain.value ?? 1, audible: gain !== undefined && (this.outputs.get(gain)?.has(this.destination) ?? false) };
  }

  private tracked<N extends SoundNode>(node: N): N {
    const outputs = new Set<SoundNode>();
    this.outputs.set(node, outputs);
    node.connect = (destination: SoundNode): SoundNode => {
      outputs.add(destination);
      return destination;
    };
    node.disconnect = (destination?: SoundNode): void => {
      if (destination) outputs.delete(destination);
      else outputs.clear();
    };
    return node;
  }
}
