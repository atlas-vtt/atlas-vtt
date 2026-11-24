import { Container, Sprite } from 'pixi.js';
import { afterEach, expect, it, vi } from 'vitest';
import { tokenOverlays } from '../../src/app/api/extensionPoints';
import { OVERLAYS_LABEL, TokenOverlays } from '../../src/app/pixi/token-renderer/TokenOverlays';
import { SpriteFactory } from '../../src/app/pixi/token-renderer/SpriteFactory';
import type { GridSystem } from '../../src/app/pixi/GridSystem';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';

function tokenGroup(size: number, turned = 0): TokenGroupContainer {
  const group = Object.assign(new Container(), { tokenId: 't', tokenData: {} as TokenGroupContainer['tokenData'], tokenSize: size, artPath: '', strokeWidth: 4 }) as TokenGroupContainer;
  group.addChild(new Sprite({ label: 'tokenSprite', rotation: turned }));
  return group;
}

function picture(width: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = width;
  return canvas.toDataURL('image/png');
}

afterEach(() => tokenOverlays.clear());

it('draws every overlay on every token, sized by its ring, turned with its art, and takes it off again', async () => {
  const groups: TokenGroupContainer[] = [];
  const overlays = new TokenOverlays(() => groups.forEach((group) => overlays.update(group)));
  const small = tokenGroup(70);
  const large = tokenGroup(210, 1.2);
  groups.push(small, large);
  const remove = tokenOverlays.add({ image: picture(256), span: 1.3 });
  overlays.update(small);
  overlays.update(large);
  const layer = (group: Container): Container | null => group.getChildByLabel(OVERLAYS_LABEL);
  await vi.waitFor(() => expect(layer(small)?.children).toHaveLength(1));

  // Ring of a 70 px token: 70 + 2 × 4 px of stroke.
  expect(layer(small)!.width).toBeCloseTo(78 * 1.3);
  expect(layer(large)!.width).toBeCloseTo(218 * 1.3);
  // A token placed turned wears it turned; turning the token turns it with the ring.
  expect(layer(large)!.rotation).toBeCloseTo(1.2);
  new SpriteFactory({} as GridSystem).updateTokenRotation(small, 90);
  expect(layer(small)!.rotation).toBeCloseTo(Math.PI / 2);

  // An update with the same overlays keeps the layer it has.
  const kept = layer(small);
  overlays.update(small);
  expect(layer(small)).toBe(kept);

  remove();
  overlays.update(small);
  expect(layer(small)).toBeNull();
});
