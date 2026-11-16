import type { SoundBuffer, SoundCompressorNode, SoundContext, SoundGainNode, SoundNode, SoundParam, SoundSourceNode } from '@/app/sound/engine/audioNodes';

/** Records what a player asks of a context: which sources start where, and every move of every gain. */
export interface FakeSource extends SoundSourceNode {
  started: { when: number; offset: number } | null;
  stoppedAt: number | null;
}

export type ParamEvent = { kind: 'set' | 'target' | 'curve' | 'hold' | 'cancel'; time: number; value?: number };

export interface FakeGain extends SoundGainNode {
  events: ParamEvent[];
}

function param(events: ParamEvent[]): SoundParam {
  return {
    value: 1,
    setValueAtTime: (value, time) => events.push({ kind: 'set', time, value }),
    setTargetAtTime: (value, time) => events.push({ kind: 'target', time, value }),
    setValueCurveAtTime: (values, time) => events.push({ kind: 'curve', time, value: values[values.length - 1] ?? 0 }),
    cancelScheduledValues: (time) => events.push({ kind: 'cancel', time }),
    cancelAndHoldAtTime: (time) => events.push({ kind: 'hold', time }),
  };
}

function node(): SoundNode {
  return { connect: () => undefined, disconnect: () => undefined };
}

export function fakeBuffer(length: number, sampleRate = 48000, channels = 2): SoundBuffer {
  return { length, duration: length / sampleRate, sampleRate, numberOfChannels: channels, copyToChannel: () => undefined };
}

export class FakeSoundContext implements SoundContext {
  currentTime = 0;
  readonly sampleRate = 48000;
  readonly destination = node();
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  decodeCalls = 0;
  /** What `decodeAudioData` gives: the file's frames are the test's to say. */
  decodedFrames = 48000 * 10;

  createGain(): FakeGain {
    const events: ParamEvent[] = [];
    const gain: FakeGain = { ...node(), gain: param(events), events };
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): FakeSource {
    const source: FakeSource = {
      ...node(),
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      onended: null,
      started: null,
      stoppedAt: null,
      start(when = 0, offset = 0) {
        source.started = { when, offset };
      },
      stop: (when = 0) => {
        source.stoppedAt = when === 0 ? this.currentTime : when;
      },
    };
    this.sources.push(source);
    return source;
  }

  createDynamicsCompressor(): SoundCompressorNode {
    return { ...node(), threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } };
  }

  createBuffer(channels: number, length: number, sampleRate: number): SoundBuffer {
    return fakeBuffer(length, sampleRate, channels);
  }

  decodeAudioData(): Promise<SoundBuffer> {
    this.decodeCalls++;
    return Promise.resolve(fakeBuffer(this.decodedFrames));
  }

  /** The sources that have started and not been told to stop before now. */
  playing(): FakeSource[] {
    return this.sources.filter((source) => source.started && (source.stoppedAt === null || source.stoppedAt > this.currentTime));
  }
}
