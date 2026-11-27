import '../setup/obsidianDom';
import { afterAll, expect, it, vi } from 'vitest';
import { cachedDicePreviews, fillDicePreviews, subscribeDicePreviews } from '../../src/app/dice3d/dicePreviews';
import { watchGpuProcess } from './gpuProcessDeath';

/**
 * The dice settings render their colour previews one die per frame and keep each for the session:
 * a die rendered while the GPU process is dead would stay blank in the panel until Obsidian restarts.
 */

// Before anything draws: the canvases made from here on are the ones the GPU process can take.
const gpuProcess = watchGpuProcess();
const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
afterAll(() => {
  getContext.mockRestore();
  gpuProcess.stop();
});

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

it('keep no blank die of a set they were rendering when the GPU process died', async () => {
  let dying: Promise<void> | null = null;
  const unsubscribe = subscribeDicePreviews(() => {
    // After the first die: the next ones would be rendered while the context is lost.
    dying ??= gpuProcess.die(diceContext());
  });
  await fillDicePreviews('medieval', 'shown');
  unsubscribe();
  expect(dying).not.toBeNull();
  await dying;
  // The panel asks again, as it does whenever it opens.
  await fillDicePreviews('medieval', 'shown');
  const previews = cachedDicePreviews('medieval');
  expect(previews).not.toBeNull();
  const shown = await Promise.all(Object.entries(previews!.images).map(async ([colour, url]) => [colour, await showsDie(url)] as const));
  expect(shown.filter(([, die]) => !die).map(([colour]) => colour)).toEqual([]);
});
