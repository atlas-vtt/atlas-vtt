import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterAll, expect, it, vi } from 'vitest';
import { subscribeDicePreviews } from '../../src/app/dice3d/dicePreviews';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DiceColourStrip } from '../../src/app/react/components/command-palette/DiceColourStrip';
import { useDicePreviews } from '../../src/app/react/hooks/useDicePreviews';
import { DICE_COLOUR_OPTIONS } from '../../src/app/dice3d/diceLook';
import { watchGpuProcess } from './gpuProcessDeath';

/**
 * The dice settings' colour strip, open while Obsidian's GPU process dies: the process can die in
 * the middle of a die, before the page hears of it, and the panel stays open while the context is lost.
 */

// Before anything draws: the canvases made from here on are the ones the GPU process can take.
const gpuProcess = watchGpuProcess();
const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
afterAll(() => {
  getContext.mockRestore();
  gpuProcess.stop();
});

const h = React.createElement;
/** How long the context stays lost, as measured in Obsidian: the panel's next die finds it lost. */
const DOWN_FOR_MS = 1000;

function Strip(): React.ReactElement {
  const previews = useDicePreviews(undefined, 'medieval');
  return h(TooltipProvider, null, h(DiceColourStrip, { value: 'light', previews, onChange: () => undefined }));
}

/** The context the document's dice draw with: the first stage made it. */
function diceContext(): WebGL2RenderingContext {
  const made = getContext.mock.results.map((result) => result.value as unknown).find((value) => value instanceof WebGL2RenderingContext);
  if (!(made instanceof WebGL2RenderingContext)) throw new Error('No dice stage was made');
  return made;
}

/** Whether `url` shows a die: drawn in its middle, nothing in its corners. */
async function showsDie(url: string): Promise<boolean> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  let drawn = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) drawn++;
  return data[3] === 0 && drawn > (image.width * image.height) / 8;
}

/** How many of the strip's colours show a die. */
async function diceShown(strip: HTMLElement): Promise<number> {
  const images = [...strip.querySelectorAll<HTMLImageElement>('img.atlas-dice-colour-strip__die')];
  const shown = await Promise.all(images.map((image) => showsDie(image.src)));
  return shown.filter(Boolean).length;
}

it('draw every colour again once the context is back, in the open panel and after it opens again', async () => {
  let died: (dying: Promise<void>) => void = () => undefined;
  // Settles once the restored context was handled.
  const dying = new Promise<void>((resolve) => { died = resolve; });
  let rendered = 0;
  const unsubscribe = subscribeDicePreviews(() => {
    if (++rendered !== 2) return;
    // The GPU process dies in the middle of the next die: its first call already goes to a lost context.
    const gl = diceContext();
    const clear = gl.clear.bind(gl);
    Reflect.set(gl, 'clear', (mask: number) => {
      Reflect.deleteProperty(gl, 'clear');
      died(gpuProcess.die(gl, DOWN_FOR_MS));
      clear(mask);
    });
  });
  const open = render(h(Strip));
  await dying;
  unsubscribe();

  // Left open: nothing asks again but the context coming back.
  await expect.poll(() => diceShown(open.container), { timeout: 30_000 }).toBe(DICE_COLOUR_OPTIONS.length);
  cleanup();

  const reopened = render(h(Strip));
  await expect.poll(() => diceShown(reopened.container), { timeout: 30_000 }).toBe(DICE_COLOUR_OPTIONS.length);
});
