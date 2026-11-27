import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterAll, expect, it, vi } from 'vitest';
import { dieImage, type DieImageRequest } from '../../src/app/dice3d/dieImages';
import { canShowDice } from '../../src/app/dice3d/stagePool';
import { SetDice, setDiceRequests } from '../../src/app/react/components/collection-settings/dice-lab/SetDice';
import { useDieImages } from '../../src/app/react/components/collection-settings/dice-lab/useDieImages';
import type { DiceSet } from '../../src/app/types/diceSetTypes';
import { watchGpuProcess } from './gpuProcessDeath';

/**
 * The dice lab's set picker, open while Obsidian's GPU process dies: the lab draws its dice in one
 * task and keeps each image for the session, and the process can die in the middle of that task,
 * before the page hears of it.
 */

// Before anything draws: the canvases made from here on are the ones the GPU process can take.
const gpuProcess = watchGpuProcess();
const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
const readBack = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
afterAll(() => {
  getContext.mockRestore();
  readBack.mockRestore();
  gpuProcess.stop();
});

const h = React.createElement;
/** How long the context stays lost, as measured in Obsidian. */
const DOWN_FOR_MS = 1000;

/** A d100 is two d10s side by side, with nothing drawn between them. */
const SETS: DiceSet[] = [
  { id: 'a', name: 'A', builtIn: false, crit: 'natural', dice: [{ count: 1, sides: 4 }, { count: 1, sides: 6, colour: '#b91c1c' }, { count: 1, sides: 8 }, { count: 1, sides: 100 }] },
  { id: 'b', name: 'B', builtIn: false, crit: 'natural', dice: [{ count: 1, sides: 10 }, { count: 1, sides: 12, colour: '#7e22ce' }, { count: 1, sides: 20 }] },
];
const REQUESTS: DieImageRequest[] = SETS.flatMap(setDiceRequests);

function Picker(): React.ReactElement {
  const image = useDieImages(REQUESTS, document);
  return h('div', null, SETS.map((set) => h(SetDice, { key: set.id, set, image })));
}

/** The context the document's dice draw with. */
function diceContext(): WebGL2RenderingContext {
  const made = getContext.mock.results.map((result) => result.value as unknown).find((value) => value instanceof WebGL2RenderingContext);
  if (!(made instanceof WebGL2RenderingContext)) throw new Error('No dice context was made');
  return made;
}

/** Whether `url` shows its dice: nothing in its corner, and a sixteenth of it drawn (a d4 lying on a face covers an eighth). */
async function showsDice(url: string): Promise<boolean> {
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
  return data[3] === 0 && drawn > (image.width * image.height) / 16;
}

/** How many dice the picker shows as a drawn image. */
async function diceShown(picker: HTMLElement): Promise<number> {
  const images = [...picker.querySelectorAll<HTMLImageElement>('img.atlas-die-still__image')];
  const shown = await Promise.all(images.map((image) => showsDice(image.src)));
  return shown.filter(Boolean).length;
}

/** The kinds of die whose kept image is missing or blank. */
async function blankKept(): Promise<string[]> {
  const kept = await Promise.all(REQUESTS.map(async (die) => {
    const image = dieImage(die);
    return [`d${die.sides}${die.colour ?? ''}`, image ? await showsDice(image.url) : false] as const;
  }));
  return kept.filter(([, shown]) => !shown).map(([kind]) => kind);
}

it('draws every die again once the context is back, in the open lab and after it opens again', async () => {
  // Made before the lab opens, so the process can be killed while the lab's one drawing task runs.
  expect(canShowDice(document)).toBe(true);
  const gl = diceContext();
  let died: (dying: Promise<void>) => void = () => undefined;
  // Settles once the restored context was handled.
  const dying = new Promise<void>((resolve) => { died = resolve; });
  const clear = gl.clear.bind(gl);
  Reflect.set(gl, 'clear', (mask: number) => {
    // Two dice are read back: the GPU process dies as the third is drawn.
    if (readBack.mock.calls.length >= 2) {
      Reflect.deleteProperty(gl, 'clear');
      died(gpuProcess.die(gl, DOWN_FOR_MS));
    }
    clear(mask);
  });
  const open = render(h(Picker));
  await dying;

  // Left open: nothing asks again but the context coming back.
  await expect.poll(() => diceShown(open.container), { timeout: 30_000 }).toBe(REQUESTS.length);
  expect(await blankKept()).toEqual([]);
  cleanup();

  const reopened = render(h(Picker));
  await expect.poll(() => diceShown(reopened.container), { timeout: 30_000 }).toBe(REQUESTS.length);
});
