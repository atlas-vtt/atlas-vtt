import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { DiceGpu } from '../../src/app/dice3d/DiceGpu';
import { DiceRenderer, type StageDie } from '../../src/app/dice3d/DiceRenderer';
import { loadDiceArtwork } from '../../src/app/dice3d/dieArtwork';
import type { DieSides } from '../../src/app/dice3d/dieGeometry';
import { dieGeometry, faceIndexForValue, lyingHeight, restingQuaternion } from '../../src/app/dice3d/dieGeometry';
import { makeDie, restImmediately } from '../../src/app/dice3d/dieMotion';
import { seededRandom } from '../../src/app/dice3d/atlasCell';

interface Stage {
  canvas: HTMLCanvasElement;
  draw: () => Uint8ClampedArray;
}

/** A stage on `gpu` with one die of `sides` lying still, the same die every time. */
function stage(gpu: DiceGpu, sides: DieSides, width: number, height: number, dpr = 1): Stage {
  const canvas = document.createElement('canvas');
  const renderer = new DiceRenderer(gpu, canvas);
  renderer.setSize(width, height, dpr);
  renderer.setPlan([{ sides }]);
  const geometry = dieGeometry(sides);
  const anim = makeDie(seededRandom(7), [0, 0], 0.92, renderer.stage(), lyingHeight(geometry));
  restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, sides), 0.3));
  const dice: StageDie[] = [{ anim, sides }];
  const shown = canvas.getContext('2d')!;
  return {
    canvas,
    draw: (): Uint8ClampedArray => {
      renderer.render(dice, 1, null);
      return shown.getImageData(0, 0, canvas.width, canvas.height).data;
    },
  };
}

function covered(pixels: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) count++;
  return count;
}

describe('dice stages sharing one context', () => {
  it('show exactly what the context drew', async () => {
    await loadDiceArtwork();
    const context = document.createElement('canvas');
    const gpu = new DiceGpu(context);
    const width = 320;
    const height = 260;
    const { draw } = stage(gpu, 20, width, height);
    const shown = draw();
    // Read in the same task as the frame: the drawing buffer is not kept.
    const gl = context.getContext('webgl2')!;
    const drawn = new Uint8Array(width * height * 4);
    gl.readPixels(0, context.height - height, width, height, gl.RGBA, gl.UNSIGNED_BYTE, drawn);

    expect(covered(shown)).toBeGreaterThan(5000);
    let worst = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // WebGL counts rows from the bottom, a canvas from the top; the context keeps colour
        // premultiplied, `getImageData` gives it back divided by alpha.
        const gi = ((height - 1 - y) * width + x) * 4;
        const si = (y * width + x) * 4;
        const alpha = shown[si + 3]!;
        worst = Math.max(worst, Math.abs(alpha - drawn[gi + 3]!));
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(Math.round((shown[si + c]! * alpha) / 255) - drawn[gi + c]!));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('draw what a context of their own would, and never into each other', async () => {
    await loadDiceArtwork();
    const shared = new DiceGpu(document.createElement('canvas'));
    const big = stage(shared, 20, 336, 380, 2);
    const small = stage(shared, 6, 200, 120, 2);
    const alone = stage(new DiceGpu(document.createElement('canvas')), 6, 200, 120, 2);

    const first = big.draw();
    const smallFrame = small.draw();
    const again = big.draw();

    expect(again).toEqual(first);
    expect(smallFrame).toEqual(alone.draw());
    expect(covered(smallFrame)).toBeGreaterThan(1000);
  });
});
