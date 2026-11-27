import '../setup/obsidianDom';
import { afterAll, expect, it } from 'vitest';
import { DiceGpu } from '../../src/app/dice3d/DiceGpu';
import { DiceRenderer } from '../../src/app/dice3d/DiceRenderer';
import { seededRandom } from '../../src/app/dice3d/atlasCell';
import type { DiceColour, DiceFont } from '../../src/app/dice3d/diceLook';
import { loadDiceArtwork } from '../../src/app/dice3d/dieArtwork';
import { dieGeometry, faceIndexForValue, lyingHeight, restingQuaternion } from '../../src/app/dice3d/dieGeometry';
import { refreshDieArtwork } from '../../src/app/dice3d/dieMesh';
import { makeDie, restImmediately } from '../../src/app/dice3d/dieMotion';
import { resolveLook, setActiveLook } from '../../src/app/dice3d/dieSkin';
import { watchGpuProcess } from './gpuProcessDeath';

/**
 * After Obsidian's GPU process died, the next roll shows its dice as before: their numerals, their
 * card and their light, on the pooled stage that showed the rolls before.
 */

// Before anything draws: the canvases made from here on are the ones the GPU process can take.
const gpuProcess = watchGpuProcess();
afterAll(() => gpuProcess.stop());

const WIDTH = 240;
const HEIGHT = 200;

/** A pooled stage on its own context that throws a d20 of the dice look, which comes to rest with its 20 up. */
function stage(): { gpu: DiceGpu; roll: () => Uint8ClampedArray } {
  const gpu = new DiceGpu(document.createElement('canvas'));
  const canvas = document.createElement('canvas');
  const renderer = new DiceRenderer(gpu, canvas);
  const shown = canvas.getContext('2d')!;
  return {
    gpu,
    roll: () => {
      renderer.setSize(WIDTH, HEIGHT, 1);
      renderer.setPlan([{ sides: 20 }]);
      const geometry = dieGeometry(20);
      const anim = makeDie(seededRandom(7), [0, 0], 0.92, renderer.stage(), lyingHeight(geometry));
      restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, 20), 0.3));
      renderer.render([{ anim, sides: 20 }], 1, null);
      const pixels = shown.getImageData(0, 0, WIDTH, HEIGHT).data;
      renderer.reset();
      return pixels;
    },
  };
}

async function useLook(colour: DiceColour, font: DiceFont): Promise<void> {
  await loadDiceArtwork(font);
  setActiveLook(resolveLook({ colour, font }, null));
  refreshDieArtwork();
}

/** How many pixels of `after` differ from `before` by more than rounding in any channel. */
function changedPixels(before: Uint8ClampedArray, after: Uint8ClampedArray): number {
  let changed = 0;
  for (let i = 0; i < before.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      if (Math.abs(before[i + c]! - after[i + c]!) > 2) {
        changed++;
        break;
      }
    }
  }
  return changed;
}

function inked(pixels: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) count++;
  return count;
}

// First: its look's numeral sheet is the one a later death would take with it.
it('a look chosen after the GPU process died has its numerals', async () => {
  await useLook('teal', 'scifi');
  const { gpu, roll } = stage();
  const teal = roll();
  await useLook('light', 'medieval');
  roll();
  await gpuProcess.die(gpu.renderer.getContext());
  await useLook('teal', 'scifi');
  expect(changedPixels(teal, roll())).toBe(0);
  gpu.dispose();
});

it.each<[string, DiceColour, DiceFont]>([
  ['pencil numerals on card', 'light', 'medieval'],
  ['Sci-fi numerals on crimson', 'crimson', 'scifi'],
])('a d20 with %s rolls as it did before the GPU process died', async (_name, colour, font) => {
  await useLook(colour, font);
  const { gpu, roll } = stage();
  const before = roll();
  await gpuProcess.die(gpu.renderer.getContext());
  const after = roll();
  expect(inked(before)).toBeGreaterThan(3000);
  expect(changedPixels(before, after)).toBe(0);
  gpu.dispose();
});
