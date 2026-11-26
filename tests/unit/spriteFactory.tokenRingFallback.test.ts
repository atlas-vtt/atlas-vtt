import { describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Texture } from 'pixi.js';
import { SpriteFactory } from '../../src/app/pixi/token-renderer/SpriteFactory';

describe('SpriteFactory token ring fallback', () => {
  it('draws a fallback graphics ring when the textured ring is unavailable', () => {
    const gridSystem = {
      getOptions: () => ({ size: 70, type: 'square' }),
    } as any;

    const factory = new SpriteFactory(gridSystem, false);
    const container = new Container();
    (container as any).tokenSize = 70;

    vi.spyOn(factory as any, 'getTokenRingTexture').mockReturnValue(Texture.EMPTY);

    const ring = factory.createTokenRing(container, '#ffffff', 70);

    expect(ring).toBeInstanceOf(Graphics);
    expect(ring?.name).toBe('tokenRing');
    expect(container.getChildByLabel('tokenRing')).toBe(ring);
  });
});

it('never adds a ring to a token whose ring is disabled', () => {
  const factory = new SpriteFactory({ getOptions: () => ({ size: 70, type: 'square' }) } as never);
  const container = Object.assign(new Container(), { tokenSize: 70, tokenData: { showRing: false } });
  vi.spyOn(factory as never, 'getTokenRingTexture').mockReturnValue(Texture.EMPTY);
  expect(factory.createTokenRing(container as never, '#ffffff', 70)).toBeNull();
  expect(container.getChildByLabel('tokenRing')).toBeNull();
});

it('turns the ring with the art, also a ring drawn anew on a turned token', () => {
  const factory = new SpriteFactory({ getOptions: () => ({ size: 70, type: 'square' }) } as never);
  const art = Object.assign(new Container(), { label: 'tokenSprite' });
  const container = Object.assign(new Container(), { tokenSize: 70 });
  container.addChild(art);
  vi.spyOn(factory as never, 'getTokenRingTexture').mockReturnValue(Texture.WHITE);
  factory.createTokenRing(container as never, '#ffffff', 70);
  factory.updateTokenRotation(container, 90);
  expect(container.getChildByLabel('tokenRing')?.rotation).toBeCloseTo(Math.PI / 2);
  expect(factory.createTokenRing(container as never, '#ff0000', 70)?.rotation).toBeCloseTo(Math.PI / 2);
});
