import { describe, expect, it, vi } from 'vitest';
import { Sprite, Texture } from 'pixi.js';
import { BelowTokens } from '../../../src/app/pixi/lighting/levels/BelowTokens';
import { computeTokenPixelSize, computeTokenStrokeWidth } from '../../../src/app/pixi/token-renderer/tokenSizing';
import { getTokenRingOuterDiameter } from '../../../src/app/pixi/token-renderer/tokenRingMetrics';
import type { TokenEntity } from '../../../src/app/types';

vi.mock('../../../src/app/pixi/token-renderer/tokenRingTexture', () => ({
  loadedTokenRingTexture: (): Texture => Texture.WHITE,
  loadTokenRingTexture: (): Promise<Texture> => Promise.resolve(Texture.WHITE),
}));

const art = { acquire: (): Promise<Texture> => Promise.resolve(Texture.WHITE), release: (): void => {}, destroyAll: (): void => {} };

function token(changes: Partial<TokenEntity>): TokenEntity {
  return { id: 't', x: 100, y: 100, size: 1, imagePath: 'goblin.png', ...changes } as TokenEntity;
}

function ringOf(tokens: BelowTokens): Sprite | undefined {
  return tokens.view.children[0]?.children.find((child): child is Sprite => child.label === 'token-below-ring');
}

describe('Tokens of a level below', () => {
  it('wear their ring in its colour, at the size the map draws it', () => {
    const tokens = new BelowTokens(art, () => {});
    tokens.sync({ t: token({ ringColor: '#ff0000' }) }, 70, 1.2);

    const ring = ringOf(tokens);
    expect(ring?.visible).toBe(true);
    expect(ring?.tint).toBe(0xff0000);
    expect(ring?.width).toBeCloseTo(getTokenRingOuterDiameter(computeTokenPixelSize(70, 1) * 1.2, computeTokenStrokeWidth(70), 1.2));
  });

  it('wear a white ring without a colour, and none where the token shows none', () => {
    const tokens = new BelowTokens(art, () => {});
    tokens.sync({ t: token({}) }, 70, 1);
    expect(ringOf(tokens)?.tint).toBe(0xffffff);

    tokens.sync({ t: token({ showRing: false }) }, 70, 1);
    expect(ringOf(tokens)?.visible).toBe(false);
  });
});
