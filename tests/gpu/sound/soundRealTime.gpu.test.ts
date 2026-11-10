import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { SoundContext } from '@/app/sound/engine/audioNodes';
import { SOUND_CONTEXT_OPTIONS } from '@/app/sound/engine/soundMath';
import { SoundPlayer } from '@/app/sound/engine/soundPlayer';
import { SoundWatchdog } from '@/app/sound/engine/soundWatchdog';
import { unlockInGesture } from '@/app/sound/engine/unlockInGesture';
import { largestStep, layerOf, loadFixtures, longestSilence, memoryBytes, tableOf } from './soundHarness';

const NORMAL_STEP = 0.25 * Math.sin((2 * Math.PI * 220) / 48000);

const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor('atlas-capture', Capture);
`;

/** A real context whose output the test reads, block by block, as the listener would hear it. */
async function capturedContext(): Promise<{ context: AudioContext; through: SoundContext; samples: () => Float32Array }> {
  const context = new AudioContext(SOUND_CONTEXT_OPTIONS);
  const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }));
  await context.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const capture = new AudioWorkletNode(context, 'atlas-capture', { numberOfOutputs: 0 });
  const blocks: Float32Array[] = [];
  capture.port.onmessage = (event: MessageEvent<Float32Array>): void => {
    blocks.push(event.data);
  };
  const through: SoundContext = {
    get currentTime() {
      return context.currentTime;
    },
    sampleRate: context.sampleRate,
    destination: capture,
    createGain: () => context.createGain(),
    createBufferSource: () => context.createBufferSource(),
    createDynamicsCompressor: () => context.createDynamicsCompressor(),
    createBuffer: (channels, length, rate) => context.createBuffer(channels, length, rate),
    decodeAudioData: (bytes) => context.decodeAudioData(bytes),
  };
  return {
    context,
    through,
    samples: () => {
      const out = new Float32Array(blocks.reduce((sum, block) => sum + block.length, 0));
      let at = 0;
      for (const block of blocks) {
        out.set(block, at);
        at += block.length;
      }
      return out;
    },
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

describe('in real time', () => {
  it('keeps window joins and the wrap as clean as in a render, and the watchdog says playing', async ({ skip }) => {
    const fixtures = await loadFixtures();
    const { context, through, samples } = await capturedContext();
    // Needs a press to run in a browser, as a player's page does.
    let unlocked = false;
    const button = document.body.appendChild(document.createElement('button'));
    button.textContent = 'join';
    button.onclick = (): void => {
      unlockInGesture(context);
      unlocked = true;
    };
    await userEvent.click(button);
    button.remove();
    expect(unlocked).toBe(true);
    await wait(1500);
    if (context.currentTime === 0) {
      // A headless engine may have no audio output to run on; only a real window can say more.
      console.log('real time: this browser never starts a context here');
      await context.close().catch(() => undefined);
      skip();
    }
    const dog = new SoundWatchdog({ context: () => context, rebuild: () => undefined, wait });
    dog.start();
    const started = performance.now();
    const player = new SoundPlayer({
      context: through,
      // 48 s in: a window join at 53 and 58 s, the wrap at 61 s, and a join at 66 s.
      tableNow: () => performance.now() - started + 48_000,
      resolve: (key) => memoryBytes(fixtures.files.get(key) ?? new Uint8Array()),
    });
    player.setState(tableOf({ layers: [layerOf(fixtures.long)] }));
    const end = started + 20_000;
    let stood = 0;
    while (performance.now() < end) {
      const before = context.currentTime;
      await wait(250);
      player.tick();
      await dog.check();
      if (context.currentTime === before) stood++;
    }
    const state = dog.state;
    player.dispose();
    await context.close();
    const captured = samples();
    // Past the join's own fade up, and the compressor's settling.
    const from = 48_000;
    const silence = longestSilence(captured, from, captured.length);
    const step = largestStep(captured, from, captured.length);
    console.log(`real time: ${(captured.length / 48000).toFixed(1)} s captured, longest silence ${silence} frames, largest step ${(step / NORMAL_STEP).toFixed(2)} x normal, clock stood ${stood} times, watchdog ${state}`);
    expect(captured.length).toBeGreaterThan(18 * 48000);
    expect(silence).toBeLessThanOrEqual(1);
    expect(step).toBeLessThanOrEqual(2 * NORMAL_STEP);
    expect(state).toBe('playing');
  });
});
