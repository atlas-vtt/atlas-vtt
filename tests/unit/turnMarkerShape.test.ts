import { describe, expect, it } from 'vitest';
import {
  FLASH, TURN_LOOK, flashAppearance, poolAlphaAt, poolRadius, poolSpread, poolTexel, rimRadius,
} from '../../src/app/pixi/token-renderer/turnMarker/turnMarkerShape';
import { paintDisc, paintPool } from '../../src/app/pixi/token-renderer/turnMarker/turnTextures';

describe('the turn spotlight', () => {
  it('is brightest in the middle and falls through its stops to nothing at its edge', () => {
    expect(poolAlphaAt(0)).toBeCloseTo(0.42);
    expect(poolAlphaAt(0.62)).toBeCloseTo(0.3);
    expect(poolAlphaAt(0.8)).toBeCloseTo(0.14);
    expect(poolAlphaAt(1)).toBe(0);
    expect(poolAlphaAt(1.2)).toBe(0);
    let previous = poolAlphaAt(0);
    for (let share = 0.05; share <= 1; share += 0.05) {
      expect(poolAlphaAt(share)).toBeLessThan(previous);
      previous = poolAlphaAt(share);
    }
  });

  it('covers the floor with part of the pool and adds a little light on top, never past white', () => {
    const middle = poolTexel(0);
    expect(middle.alpha).toBeCloseTo(0.42 * TURN_LOOK.poolCover);
    expect(middle.light).toBeCloseTo(0.42 * (TURN_LOOK.poolCover + TURN_LOOK.poolLight));
    expect(middle.light).toBeGreaterThan(middle.alpha);
    expect(middle.light).toBeLessThanOrEqual(1);
  });

  it('reaches a little beyond the token, further around a larger one', () => {
    expect(poolSpread(35)).toBe(1);
    expect(poolSpread(140)).toBe(2);
    expect(poolRadius(35, 1)).toBe(35 + TURN_LOOK.poolReach);
    expect(poolRadius(70, 2)).toBe(70 + 2 * TURN_LOOK.poolReach);
    expect(poolRadius(140, 1)).toBe(140 + 2 * TURN_LOOK.poolReach);
  });

  it('keeps its rim a few screen pixels outside the token at any zoom', () => {
    expect(rimRadius(35, 1)).toBe(35 + TURN_LOOK.rimGap);
    expect(rimRadius(35, 4)).toBe(140 + TURN_LOOK.rimGap);
  });

  it('paints the pool premultiplied, its light above its cover, and a white disc for framed tokens', () => {
    const pool = paintPool(64);
    const data = pool.source.resource as Uint8Array;
    const middle = 4 * (32 * 64 + 32);
    expect(data[middle + 3]).toBeGreaterThan(55);
    expect(data[middle]).toBeGreaterThan(data[middle + 3]!);
    // The corners lie outside the pool
    expect(data[3]).toBe(0);
    pool.destroy(true);
    const disc = paintDisc(32);
    const texels = disc.source.resource as Uint8Array;
    expect(texels[4 * (16 * 32 + 16) + 3]).toBe(255);
    expect(texels[3]).toBe(0);
    disc.destroy(true);
  });
});

describe('the turn flash', () => {
  const { enter, hold, exit, from } = FLASH.full;

  it('swells in, holds, fades out and is done', () => {
    expect(flashAppearance(0, FLASH.full)).toEqual({ alpha: 0, scale: from, done: false });
    const swelling = flashAppearance(enter / 2, FLASH.full);
    expect(swelling.alpha).toBeGreaterThan(0.5);
    expect(swelling.scale).toBeGreaterThan(from);
    expect(swelling.scale).toBeLessThan(1);
    expect(flashAppearance(enter + hold / 2, FLASH.full)).toEqual({ alpha: 1, scale: 1, done: false });
    const fading = flashAppearance(enter + hold + exit / 2, FLASH.full);
    expect(fading.alpha).toBeCloseTo(0.5);
    expect(fading.done).toBe(false);
    expect(flashAppearance(enter + hold + exit, FLASH.full)).toEqual({ alpha: 0, scale: 1, done: true });
  });

  it('only fades in and out with reduced motion, quicker and without the swell', () => {
    const { enter: plainIn, hold: plainHold, exit: plainOut } = FLASH.reduced;
    expect(plainIn + plainHold + plainOut).toBeLessThan(enter + hold + exit);
    expect(flashAppearance(plainIn / 2, FLASH.reduced)).toEqual({ alpha: 0.5, scale: 1, done: false });
    expect(flashAppearance(plainIn + plainHold + plainOut, FLASH.reduced).done).toBe(true);
  });
});
