import { describe, expect, it } from 'vitest';
import { cdp, userEvent } from 'vitest/browser';
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

type Captured = Awaited<ReturnType<typeof capturedContext>>;

/** A captured context started by a press, as a player's page starts one; null where this browser never runs it. */
async function runningContext(): Promise<Captured | null> {
  const captured = await capturedContext();
  let unlocked = false;
  const button = document.body.appendChild(document.createElement('button'));
  button.textContent = 'join';
  button.onclick = (): void => {
    unlockInGesture(captured.context);
    unlocked = true;
  };
  await userEvent.click(button);
  button.remove();
  expect(unlocked).toBe(true);
  await wait(1500);
  if (captured.context.currentTime > 0) return captured;
  // A headless engine may have no audio output to run on; only a real window can say more.
  console.log('real time: this browser never starts a context here');
  await captured.context.close().catch(() => undefined);
  return null;
}

/**
 * A page redrawn every frame, as the Sound page's meters redraw it: boxes whose transform moves each frame, so
 * styles and layers are worked out again every frame. A long sound's windows decode between its frames.
 */
function redrawnEveryFrame(boxes: number): () => void {
  const host = document.body.appendChild(document.createElement('div'));
  host.style.cssText = 'position: fixed; inset: 0; overflow: hidden; pointer-events: none';
  const moving = Array.from({ length: boxes }, (_, index) => {
    const box = host.appendChild(document.createElement('div'));
    box.style.cssText = `position: absolute; left: ${(index * 7) % 1200}px; top: ${(index * 13) % 800}px; width: 30px; height: 30px; border-radius: 6px; background: linear-gradient(red, blue); box-shadow: 0 2px 8px black`;
    return box;
  });
  let frame = 0;
  let count = 0;
  const draw = (): void => {
    count++;
    moving.forEach((box, index) => {
      box.style.transform = `scaleY(${(0.5 + 0.5 * Math.sin(count / 10 + index)).toFixed(3)})`;
    });
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(frame);
    host.remove();
  };
}

describe('in real time', () => {
  it('keeps window joins and the wrap as clean as in a render, and the watchdog says playing', async ({ skip }) => {
    const fixtures = await loadFixtures();
    const running = await runningContext();
    if (!running) return skip();
    const { context, through, samples } = running;
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

  it('plays a long sound on without a hole beside a page redrawn every frame on a slow machine', async ({ skip }) => {
    const fixtures = await loadFixtures();
    const running = await runningContext();
    if (!running) return skip();
    const { context, through, samples } = running;
    const session = cdp();
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const stopDrawing = redrawnEveryFrame(3000);
    const started = performance.now();
    const player = new SoundPlayer({
      context: through,
      // From the start: windows join at 2, 7, 12 ... s, each decoded while the frames take the thread.
      tableNow: () => performance.now() - started,
      resolve: (key) => memoryBytes(fixtures.files.get(key) ?? new Uint8Array()),
    });
    player.setState(tableOf({ layers: [layerOf(fixtures.long)] }));
    const end = started + 25_000;
    while (performance.now() < end) {
      await wait(250);
      player.tick();
    }
    stopDrawing();
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    player.dispose();
    await context.close();
    const captured = samples();
    // From a second after the first sound: nothing sounds before the first window is decoded.
    const first = captured.findIndex((sample) => sample !== 0);
    const from = Math.max(0, first) + 48_000;
    const silence = longestSilence(captured, from, captured.length);
    console.log(`real time beside a redrawn page: ${(captured.length / 48000).toFixed(1)} s captured, first sound at ${first < 0 ? 'never' : `${(first / 48000).toFixed(2)} s`}, longest silence after it ${silence} frames`);
    expect(captured.length - from).toBeGreaterThan(15 * 48000);
    expect(silence).toBeLessThanOrEqual(1);
  });
});
