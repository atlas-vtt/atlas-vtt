import { describe, expect, it } from 'vitest';
import { differingPixels, playerViewScenes, samePixels } from '../helpers/playerViewScene';

const { scene } = playerViewScenes();

describe('the pin beside a measurement that fades', () => {
  it('is drawn for the GM once the measurement is released, and never into a players\' frame', async () => {
    const s = await scene();
    s.measureFrom(40, 60, 160, 60, true);
    await s.settle();
    const held = s.canvas();
    const heldFrame = s.frame();
    expect(samePixels(heldFrame, held)).toBe(true);
    s.pointer('pointerup', 160, 60);
    // The pin's glyph is rasterised once, a moment after it is first shown.
    await s.settle();
    expect(differingPixels(s.canvas(), held)).toBeGreaterThan(100);
    expect(samePixels(s.frame(), heldFrame)).toBe(true);
    // A capture leaves the pin on the GM's canvas.
    const fading = s.canvas();
    s.frame();
    expect(samePixels(s.canvas(), fading)).toBe(true);
  });
});
