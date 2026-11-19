import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import { syncTokenArtwork } from '../../src/app/pixi/token-renderer/tokenArtwork';
import { getTokenRingOuterDiameter, tokenArtBox } from '../../src/app/pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, computeTokenStrokeWidth } from '../../src/app/pixi/token-renderer/tokenSizing';
import { BelowTokens } from '../../src/app/pixi/lighting/levels/BelowTokens';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { TokenEntity } from '../../src/app/types';

vi.mock('../../src/app/pixi/token-renderer/tokenRingTexture', () => ({
  loadedTokenRingTexture: (): Texture => Texture.WHITE,
  loadTokenRingTexture: (): Promise<Texture> => Promise.resolve(Texture.WHITE),
}));

function artOf(width: number, height: number): Texture {
  return new Texture({ source: new TextureSource({ width, height }) });
}

function tokenGroup(showRing: boolean, gridSize: number, size: number, texture: Texture): { group: TokenGroupContainer; art: Sprite } {
  const tokenSize = computeTokenPixelSize(gridSize, size);
  const group = Object.assign(new Container(), {
    tokenData: { showRing } as TokenEntity, tokenSize, strokeWidth: computeTokenStrokeWidth(gridSize),
  }) as TokenGroupContainer;
  const art = new Sprite(texture);
  art.label = 'tokenSprite';
  const mask = new Graphics();
  mask.label = 'tokenArtMask';
  group.addChild(mask, art);
  syncTokenArtwork(group, tokenSize);
  return { group, art };
}

describe('token art size with and without a ring', () => {
  it('draws unframed art as large as a ringed token reaches, which fills the cell', () => {
    for (const gridSize of [50, 70, 100, 140]) {
      for (const size of [1, 1.5, 2]) {
        const tokenSize = computeTokenPixelSize(gridSize, size);
        const ringOuter = getTokenRingOuterDiameter(tokenSize, computeTokenStrokeWidth(gridSize));
        const framed = tokenGroup(true, gridSize, size, artOf(256, 256));
        const unframed = tokenGroup(false, gridSize, size, artOf(256, 256));
        expect(framed.art.width).toBeCloseTo(tokenSize);
        expect(unframed.art.width).toBeCloseTo(ringOuter);
        expect(unframed.art.height).toBeCloseTo(ringOuter);
      }
    }
    // A medium token on a 70 px grid: the ring's outer edge is the cell
    expect(tokenGroup(false, 70, 1, artOf(64, 64)).art.width).toBeCloseTo(70);
  });

  it('keeps unframed art in its proportions, its longer side across the ring\'s outer diameter', () => {
    expect(tokenArtBox(62, 4, false, 200, 100)).toEqual({ width: 70, height: 35 });
    expect(tokenArtBox(62, 4, false, 100, 200)).toEqual({ width: 35, height: 70 });
    expect(tokenArtBox(62, 4, true, 100, 200)).toEqual({ width: 62, height: 62 });
  });

  it('draws the tokens of a level below at the same size as the map: framed in their circle, unframed whole', async () => {
    const texture = artOf(200, 100);
    const shared = { acquire: (): Promise<Texture> => Promise.resolve(texture), release: (): void => {}, destroyAll: (): void => {} };
    let loaded = 0;
    const below = new BelowTokens(shared, () => { loaded++; });
    const token = (id: string, showRing: boolean): TokenEntity => ({ id, x: 0, y: 0, size: 1, imagePath: `${id}.png`, showRing } as TokenEntity);
    below.sync({ a: token('a', true), b: token('b', false) }, 70, 1);
    await Promise.resolve();
    await Promise.resolve();
    expect(loaded).toBe(2);
    const [framed, unframed] = below.view.children.map((group) => group.children.find((child): child is Sprite => child instanceof Sprite && child.label !== 'token-below-ring')!);
    expect([framed!.width, framed!.height]).toEqual([62, 62]);
    expect(framed!.mask).toBeTruthy();
    expect([unframed!.width, unframed!.height]).toEqual([70, 35]);
    expect(unframed!.mask).toBeFalsy();
    below.destroy();
  });
});
