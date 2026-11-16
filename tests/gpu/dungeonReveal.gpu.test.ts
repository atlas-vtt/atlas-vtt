import '../setup/obsidianDom';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { DEFAULT_DUNGEON_GENERATOR_SETTINGS } from '../../src/app/dungeons/generatorSettings';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { DungeonWorkerClient } from '../../src/app/dungeons/worker/DungeonWorkerClient';
import { revealPlan } from '../../src/app/dungeons/reveal/revealPlan';
import { playReveal } from '../../src/app/dungeons/reveal/revealPlayer';

const app = {} as App;
const { view, style } = DEFAULT_DUNGEON_GENERATOR_SETTINGS;

/** A preview of a fortress as the wizard draws one, at the size of a large preview on a Retina screen. */
async function drawn(): Promise<{ bitmap: ImageBitmap; plan: ReturnType<typeof revealPlan> }> {
  const result = await DungeonWorkerClient.forApp(app).render({
    request: { seed: 7, tags: ['medium'], theme: 'fortress' },
    style: dungeonStyle(style),
    view,
    output: { kind: 'preview', width: 2400, height: 1800 },
  });
  if (result.image.type !== 'bitmap') throw new Error('no bitmap');
  const { bitmap } = result.image;
  return { bitmap, plan: revealPlan(result.model, view, result.map, 0, bitmap) };
}

const pixel = (canvas: HTMLCanvasElement, x: number, y: number): number[] => [...canvas.getContext('2d')!.getImageData(Math.round(x), Math.round(y), 1, 1).data];

describe('a new dungeon growing into being', () => {
  afterEach(() => DungeonWorkerClient.release(app));

  it('grows from the entrance first, the far corner last, and ends exactly as drawn, within a frame’s budget', async () => {
    const { bitmap, plan } = await drawn();
    const canvas = document.body.createEl('canvas');
    const entrance = plan.seeds[0]!;
    const frames: number[] = [];
    let last = performance.now();
    let ticking = true;
    const tick = (): void => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (ticking) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const done = new Promise<void>((resolve) => playReveal(canvas, bitmap, plan, resolve));
    // Early on, the entrance has come into being and the far corner is still haze
    await new Promise((resolve) => setTimeout(resolve, plan.durationMs * 0.3));
    const reference = document.body.createEl('canvas', { attr: { width: bitmap.width, height: bitmap.height } });
    reference.getContext('2d')!.drawImage(bitmap, 0, 0);
    expect(pixel(canvas, entrance.x, entrance.y)).toEqual(pixel(reference, entrance.x, entrance.y));
    const corner = { x: entrance.x < bitmap.width / 2 ? bitmap.width - 2 : 2, y: entrance.y < bitmap.height / 2 ? bitmap.height - 2 : 2 };
    expect(pixel(canvas, corner.x, corner.y)[3]).toBeLessThan(200);

    await done;
    ticking = false;
    const drawnPixels = canvas.getContext('2d')!.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const referencePixels = reference.getContext('2d')!.getImageData(0, 0, bitmap.width, bitmap.height).data;
    expect(drawnPixels.every((value, i) => value === referencePixels[i])).toBe(true);

    const sorted = frames.slice(2).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    console.log(`[reveal] ${bitmap.width}×${bitmap.height}: median frame ${median.toFixed(1)} ms, slowest ${sorted.at(-1)!.toFixed(1)} ms over ${sorted.length} frames`);
    if (import.meta.env.VITE_PERF_STRICT) expect(median).toBeLessThan(18);
    canvas.remove();
    reference.remove();
  }, 60_000);
});
