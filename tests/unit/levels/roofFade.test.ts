import { describe, expect, it } from 'vitest';
import { RoofFade } from '../../../src/app/pixi/lighting/levels/roofFade';

/** How far piece `id` shows in the fade's table, 0–255. */
const shown = (fade: RoofFade, id: number): number => (fade.texture.source.resource as Uint8Array)[id]!;

describe('a roof\'s pieces fading', () => {
  it('fade over the time given, one frame after another, and come back the same way', () => {
    const fade = new RoofFade(300);
    fade.reset(3);
    expect(fade.setFaded(new Set([2]))).toBe(true);
    expect(shown(fade, 2)).toBe(255);
    // The first frame after a change only starts the clock, however long the roof stood still.
    expect(fade.animate(10_000)).toBe(false);
    expect(fade.animate(10_150)).toBe(true);
    expect(shown(fade, 2)).toBe(128);
    expect(shown(fade, 1)).toBe(255);
    fade.animate(10_400);
    expect(shown(fade, 2)).toBe(0);
    expect(fade.busy()).toBe(false);
    expect(fade.animate(10_500)).toBe(false);
    fade.setFaded(new Set());
    fade.animate(20_000);
    fade.animate(20_300);
    expect(shown(fade, 2)).toBe(255);
  });

  it('is there at once without a duration, and a table of thousands of pieces has a row for each 256', () => {
    const fade = new RoofFade(0);
    fade.reset(1000);
    expect(fade.texture.source.pixelHeight).toBe(4);
    expect(fade.setFaded(new Set([999]))).toBe(true);
    expect(shown(fade, 999)).toBe(0);
    expect(fade.busy()).toBe(false);
    expect(fade.setFaded(new Set([999]))).toBe(false);
  });
});
