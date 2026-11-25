import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { DICE_COLOUR_OPTIONS } from '../../src/app/dice3d/diceLook';
import { cachedDicePreviews, fillDicePreviews } from '../../src/app/dice3d/dicePreviews';

async function pixelsOf(url: string): Promise<{ data: Uint8ClampedArray; size: number }> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, size: canvas.width };
}

describe('the ring round the chosen dice colour', () => {
  it('is smooth, closed all round the die, and leaves the die itself uncovered', async () => {
    await fillDicePreviews('medieval', 'shown');
    const previews = cachedDicePreviews('medieval');
    expect(Object.keys(previews?.images ?? {})).toEqual(DICE_COLOUR_OPTIONS.map((option) => option.value));
    const { data, size } = await pixelsOf(previews!.ring);
    const alpha = (x: number, y: number): number => data[(Math.round(y) * size + Math.round(x)) * 4 + 3]!;

    let partial = 0;
    let solid = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = alpha(x, y);
        if (a > 0 && a < 255) partial++;
        if (a > 128) { solid++; sumX += x; sumY += y; }
      }
    }
    // A ring cut from a thresholded mask has hard, stepped edges; a smooth one fades over its inner and outer edge.
    expect(partial, 'pixels on the ring\'s smoothed edges').toBeGreaterThan(solid * 0.3);

    const cx = sumX / solid;
    const cy = sumY / solid;
    expect(alpha(cx, cy), 'the die inside the ring').toBe(0);
    // Every ray from the die's centre crosses the ring: no gap at the die's points, top and bottom included.
    const gaps: number[] = [];
    for (let step = 0; step < 120; step++) {
      const angle = (step / 120) * Math.PI * 2;
      let crossed = false;
      for (let r = 0; r < size / 2 && !crossed; r += 0.5) {
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (x < 0 || y < 0 || x >= size || y >= size) break;
        crossed = alpha(x, y) > 128;
      }
      if (!crossed) gaps.push(step * 3);
    }
    expect(gaps, 'directions (degrees) in which the ring has a gap').toEqual([]);
  });
});
