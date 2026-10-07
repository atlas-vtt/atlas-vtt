import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../src/app/dice3d/atlasCell';
import { addCustomLook } from '../../src/app/dice3d/customLooks';
import { DiceGpu } from '../../src/app/dice3d/DiceGpu';
import { DiceRenderer } from '../../src/app/dice3d/DiceRenderer';
import { loadDiceArtwork } from '../../src/app/dice3d/dieArtwork';
import { dieGeometry, faceIndexForValue, lyingHeight, restingQuaternion } from '../../src/app/dice3d/dieGeometry';
import { makeDie, restImmediately } from '../../src/app/dice3d/dieMotion';
import { renderLookPreviews } from '../../src/app/dice3d/lookPreviews';

/** The mean colour of a 2D canvas's non-transparent pixels. */
function meanColour(canvas: HTMLCanvasElement): [number, number, number] {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 200) continue;
    r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
  }
  return [r / n, g / n, b / n];
}

describe('dice in another look or colour, drawn by WebGL', () => {
  it('throws a tagged die in its colour beside an untagged one', async () => {
    await loadDiceArtwork();
    const gpu = new DiceGpu(document.createElement('canvas'));
    const draw = (tint: string | null): [number, number, number] => {
      const canvas = document.createElement('canvas');
      const renderer = new DiceRenderer(gpu, canvas);
      renderer.setSize(160, 160, 1, 0.5, 1.4);
      renderer.setPlan([20], { tints: [tint] });
      const geometry = dieGeometry(20);
      const anim = makeDie(seededRandom(3), [0, 0], 0.92, renderer.stage(), lyingHeight(geometry));
      restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, 20), 0.3));
      renderer.render([{ anim, sides: 20 }], 1, null);
      return meanColour(canvas);
    };
    const plain = draw(null);
    const red = draw('#dd2222');
    expect(red[0] - red[2]).toBeGreaterThan(plain[0] - plain[2] + 20);
    gpu.dispose();
  });

  it("previews an extension look without a picture from its own faces, apart from Atlas's dice", async () => {
    const art = document.createElement('canvas');
    art.width = 32;
    art.height = 32;
    const ctx = art.getContext('2d')!;
    ctx.fillStyle = '#00cc00';
    ctx.fillRect(0, 0, 32, 32);
    const faces = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, art]));
    const remove = addCustomLook({ id: 'ext:green', name: 'Green', faces: () => Promise.resolve(faces), body: '#222244', ink: null, preview: null });
    const previews = await renderLookPreviews(document);
    remove();
    expect(previews['ext:green']).toMatch(/^data:image\/png/);
    expect(previews['']).toMatch(/^data:image\/png/);
    expect(previews['ext:green']).not.toBe(previews['']);
  });
});
