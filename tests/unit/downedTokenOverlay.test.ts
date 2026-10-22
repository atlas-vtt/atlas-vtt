// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ColorMatrixFilter, Container, Sprite, Texture } from 'pixi.js';
import { manualTicker } from '../mocks/manualTicker';
import { DownedTokenOverlay } from '../../src/app/pixi/token-renderer/DownedTokenOverlay';
import { isTokenDowned } from '../../src/app/pixi/token-renderer/isTokenDowned';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import type { Character, TokenEntity } from '../../src/app/types';
import { HP } from '../mocks/resourceFixtures';

// jsdom has no 2D canvas, so the emblem cannot be drawn here.
vi.mock('../../src/app/pixi/token-renderer/downedEmblemTexture', () => ({
  DOWNED_EMBLEM_TEXTURE_SIZE: 384,
  createDownedEmblemTexture: vi.fn(() => new Texture()),
}));

function tokenGroup(): TokenGroupContainer {
  const group = Object.assign(new Container(), { tokenId: 't1', tokenSize: 70, strokeWidth: 4 });
  group.addChild(new Sprite({ texture: Texture.WHITE, label: 'tokenSprite' }));
  group.addChild(new Sprite({ texture: Texture.WHITE, label: 'tokenRing' }));
  return group;
}

const marker = (group: Container): Container | null => group.getChildByLabel('downedMarker');
const greyFilters = (group: Container, label: string): unknown[] =>
  [group.getChildByLabel(label)?.filters ?? []].flat().filter((filter) => filter instanceof ColorMatrixFilter);

function character(hp: { current: number; max: number }): TokenEntity {
  return { id: 't1', kind: 'character', x: 0, y: 0, imagePath: 'a.png', resources: { hp } } satisfies Character;
}

describe('isTokenDowned', () => {
  it('is true only for creatures whose defeating resource is spent', () => {
    expect(isTokenDowned(character({ current: 0, max: 12 }), [HP])).toBe(true);
    expect(isTokenDowned(character({ current: -3, max: 12 }), [HP])).toBe(true);
    expect(isTokenDowned(character({ current: 1, max: 12 }), [HP])).toBe(false);
    // Spent, but nothing says it defeats the token
    expect(isTokenDowned(character({ current: 0, max: 12 }), [{ ...HP, defeatedWhenSpent: false }])).toBe(false);
  });

  it('ignores tokens without hit points', () => {
    expect(isTokenDowned(character({ current: 0, max: 0 }), [HP])).toBe(false);
    expect(isTokenDowned({ id: 'm', kind: 'token', x: 0, y: 0, imagePath: 'a.png' } as TokenEntity, [HP])).toBe(false);
  });
});

describe('DownedTokenOverlay', () => {
  // PIXI probes a WebGL context when compiling the filter; jsdom has none and would log for each.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('greys the art and ring and shows the skull while downed', () => {
    const overlay = new DownedTokenOverlay(() => undefined, () => null);
    const group = tokenGroup();

    overlay.update(group, true, false);

    expect(marker(group)?.alpha).toBeGreaterThan(0);
    expect(greyFilters(group, 'tokenSprite')).toHaveLength(1);
    expect(greyFilters(group, 'tokenRing')).toHaveLength(1);
  });

  it('never stacks a second skull or filter when updates repeat', () => {
    const overlay = new DownedTokenOverlay(() => undefined, () => null);
    const group = tokenGroup();

    overlay.update(group, true, false);
    overlay.update(group, true, false);

    expect(group.children.filter((child) => child.label === 'downedMarker')).toHaveLength(1);
    expect(greyFilters(group, 'tokenSprite')).toHaveLength(1);
  });

  it('greys a ring rebuilt while downed', () => {
    const overlay = new DownedTokenOverlay(() => undefined, () => null);
    const group = tokenGroup();
    overlay.update(group, true, false);

    group.getChildByLabel('tokenRing')!.destroy();
    group.addChild(new Sprite({ texture: Texture.WHITE, label: 'tokenRing' }));
    overlay.refresh(group);

    expect(greyFilters(group, 'tokenRing')).toHaveLength(1);
  });

  it('removes the skull and the grey once healed', () => {
    const overlay = new DownedTokenOverlay(() => undefined, () => null);
    const group = tokenGroup();
    overlay.update(group, true, false);
    const shown = marker(group)!;

    overlay.update(group, false, false);

    expect(marker(group)).toBeNull();
    expect(shown.destroyed).toBe(true);
    expect(greyFilters(group, 'tokenSprite')).toHaveLength(0);
    expect(greyFilters(group, 'tokenRing')).toHaveLength(0);
  });

  it('fades the skull in and out on the ticker, removing it once the heal finished', () => {
    const { ticker, advance } = manualTicker();
    const requestRender = vi.fn();
    const overlay = new DownedTokenOverlay(requestRender, () => ticker);
    const group = tokenGroup();

    overlay.update(group, true, true);
    advance(100);
    const midway = marker(group)!.alpha;
    expect(midway).toBeGreaterThan(0);
    advance(600);
    expect(marker(group)!.alpha).toBeGreaterThan(midway);
    expect(marker(group)!.scale.x).toBeCloseTo(1);

    overlay.update(group, false, true);
    expect(marker(group)).not.toBeNull();
    advance(600);
    expect(marker(group)).toBeNull();
    expect(greyFilters(group, 'tokenSprite')).toHaveLength(0);
    expect(requestRender).toHaveBeenCalled();
  });

  it('keeps the token downed when killed again while the heal fades out', () => {
    const { ticker, advance } = manualTicker();
    const overlay = new DownedTokenOverlay(() => undefined, () => ticker);
    const group = tokenGroup();
    overlay.update(group, true, false);
    const fullAlpha = marker(group)!.alpha;

    overlay.update(group, false, true);
    advance(100);
    overlay.update(group, true, true);
    advance(700);

    expect(marker(group)?.alpha).toBeCloseTo(fullAlpha);
    expect(greyFilters(group, 'tokenSprite')).toHaveLength(1);
  });
});
