import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { updateInstanceBadge } from '../../src/app/pixi/token-renderer/InstanceBadge';

vi.mock('../../src/app/pixi/token-renderer/InstanceBadge', () => ({
  updateInstanceBadge: vi.fn(),
}));

describe('TokenRenderer ring updates', () => {
  it('delegates ring redraws to SpriteFactory so the new ring style is preserved', () => {
    const tokenGroup = new Container();
    const createdRing = new Graphics();
    const createTokenRing = vi.fn(() => createdRing);

    // Inherit the prototype so updateTokenRing reaches the badge helpers it delegates to
    const harness = Object.assign(Object.create(TokenRenderer.prototype) as object, {
      spriteFactory: { createTokenRing },
      downedTokenOverlay: { refresh: vi.fn() },
      store: {
        getState: () => ({
          tokenSettings: {
            showNameplates: false,
            hiddenResources: [],
            tokenRingSize: 1.4,
            showInstanceBadges: true,
          },
          objects: {
            tokens: {
              tokenA: { id: 'tokenA', imagePath: 'shared.png', instanceNumber: 2 },
              tokenB: { id: 'tokenB', imagePath: 'shared.png', instanceNumber: 1 },
            },
          },
        }),
      },
      tokenRings: {} as Record<string, Graphics>,
    });

    (TokenRenderer.prototype as any).updateTokenRing.call(
      harness,
      'tokenA',
      tokenGroup,
      120,
      '#00ff99'
    );

    expect(createTokenRing).toHaveBeenCalledWith(tokenGroup, '#00ff99', 168);
    expect(harness.tokenRings.tokenA).toBe(createdRing);
    expect(updateInstanceBadge).toHaveBeenCalledWith(tokenGroup, 2, 168, true);
  });

  it('refreshes default-color rings even when ringColor is undefined', () => {
    const tokenId = 'token-default-ring';
    const tokenGroup = new Container();
    const sprite = new Sprite(Texture.EMPTY);
    sprite.name = 'tokenSprite';
    tokenGroup.addChild(sprite);

    const updateTokenRing = vi.fn();
    const refreshInstanceBadges = vi.fn();
    const updateTokenSize = vi.fn();
    const syncUIScale = vi.fn();

    const harness = {
      store: {
        getState: () => ({
          objects: {
            tokens: {
              [tokenId]: {
                id: tokenId,
                kind: 'character',
                imagePath: 'atlas-vtt/assets/foo.webp',
                size: 1,
              },
            },
          },
        }),
      },
      tokenSprites: {
        [tokenId]: tokenGroup,
      },
      spriteFactory: {
        updateTokenSize,
      },
      gridSystem: {
        getOptions: () => ({
          size: 70,
          type: 'square',
        }),
      },
      uiManager: {
        syncUIScale,
      },
      updateTokenRing,
      refreshInstanceBadges,
    };

    (TokenRenderer.prototype as any).updateAllTokenSizes.call(harness);

    expect(updateTokenSize).toHaveBeenCalledTimes(1);
    expect(syncUIScale).toHaveBeenCalledTimes(1);
    expect(updateTokenRing).toHaveBeenCalledWith(tokenId, tokenGroup, expect.any(Number), undefined);
    expect(refreshInstanceBadges).toHaveBeenCalledTimes(1);
  });
});

describe('TokenRenderer and the collection of its map', () => {
  const harness = (isDestroyed: boolean) => ({
    isDestroyed,
    uiManager: { refreshConditions: vi.fn(), refreshResources: vi.fn() },
    turnMarkers: { refresh: vi.fn() },
    fillMissingResources: vi.fn(),
  });

  it('redraws conditions and resources and starts missing ones once the collection\'s rules are known or change', () => {
    const renderer = harness(false);
    (TokenRenderer.prototype as any).refreshCollectionRules.call(renderer);
    expect(renderer.uiManager.refreshConditions).toHaveBeenCalledOnce();
    expect(renderer.uiManager.refreshResources).toHaveBeenCalledOnce();
    expect(renderer.fillMissingResources).toHaveBeenCalledOnce();
    // Who is defeated follows the resources, and so who holds a side's turn
    expect(renderer.turnMarkers.refresh).toHaveBeenCalledOnce();
  });

  it('does nothing after the view closed', () => {
    const renderer = harness(true);
    (TokenRenderer.prototype as any).refreshCollectionRules.call(renderer);
    expect(renderer.uiManager.refreshResources).not.toHaveBeenCalled();
    expect(renderer.fillMissingResources).not.toHaveBeenCalled();
  });
});
