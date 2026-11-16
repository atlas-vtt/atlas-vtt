import { describe, expect, it } from 'vitest';
import type { SoundBuffer, SoundCompressorNode, SoundContext, SoundGainNode, SoundNode, SoundSourceNode } from '@/app/sound/engine/audioNodes';
import { unlockInGesture } from '@/app/sound/engine/unlockInGesture';

function context(log: string[]): SoundContext & { resume(): Promise<void> } {
  const node: SoundNode = { connect: () => undefined, disconnect: () => undefined };
  const source: SoundSourceNode = {
    ...node,
    buffer: null,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    onended: null,
    start: () => log.push('start'),
    stop: () => undefined,
  };
  const buffer: SoundBuffer = { length: 1, duration: 1 / 48000, sampleRate: 48000, numberOfChannels: 1, copyToChannel: () => undefined };
  return {
    currentTime: 0,
    sampleRate: 48000,
    destination: node,
    createGain: (): SoundGainNode => {
      throw new Error('not used');
    },
    createDynamicsCompressor: (): SoundCompressorNode => {
      throw new Error('not used');
    },
    createBufferSource: () => source,
    createBuffer: (channels, length) => {
      log.push(`buffer ${channels} ${length}`);
      return buffer;
    },
    decodeAudioData: () => Promise.resolve(buffer),
    resume: () => {
      log.push('resume');
      return new Promise(() => undefined);
    },
  };
}

describe('unlocking in a gesture', () => {
  it('sets the session, resumes and starts one silent frame, all before it returns', () => {
    const log: string[] = [];
    const nav = { audioSession: { type: 'auto' } };
    unlockInGesture(context(log), nav);
    expect(nav.audioSession.type).toBe('playback');
    expect(log).toEqual(['resume', 'buffer 1 1', 'start']);
  });

  it('needs no audio session', () => {
    const log: string[] = [];
    unlockInGesture(context(log), {});
    expect(log).toContain('start');
  });
});
