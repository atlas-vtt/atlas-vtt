import { Container, Sprite } from 'pixi.js';
import { expect, it, vi } from 'vitest';
import { OVERLAY_SPAN, TokenYassify, YASSIFY_LABEL } from '../../src/app/pixi/token-renderer/TokenYassify';
import { SpriteFactory } from '../../src/app/pixi/token-renderer/SpriteFactory';
import type { GridSystem } from '../../src/app/pixi/GridSystem';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';

function tokenGroup(size: number, turned = 0): TokenGroupContainer {
  const group = Object.assign(new Container(), { tokenId: 't', tokenData: {} as TokenGroupContainer['tokenData'], tokenSize: size, artPath: '', strokeWidth: 4 }) as TokenGroupContainer;
  group.addChild(new Sprite({ label: 'tokenSprite', rotation: turned }));
  return group;
}

it('dresses every token with one overlay sized by its ring, turned with its art, and undresses it', async () => {
  const requestRender = vi.fn();
  const yassify = new TokenYassify(requestRender);
  const small = tokenGroup(70);
  const large = tokenGroup(210, 1.2);
  yassify.update(small, true);
  yassify.update(large, true);
  await vi.waitFor(() => expect(requestRender).toHaveBeenCalled());

  const overlay = (group: Container): Sprite => group.getChildByLabel(YASSIFY_LABEL) as Sprite;
  // Ring of a 70 px token: 70 + 2 × 4 px of stroke.
  expect(overlay(small).width).toBeCloseTo(78 * OVERLAY_SPAN);
  expect(overlay(large).width).toBeCloseTo(218 * OVERLAY_SPAN);
  // A token placed turned wears it turned.
  expect(overlay(large).rotation).toBeCloseTo(1.2);
  // Turning the token turns it with the ring.
  new SpriteFactory({} as GridSystem).updateTokenRotation(small, 90);
  expect(overlay(small).rotation).toBeCloseTo(Math.PI / 2);

  yassify.update(small, true);
  expect(small.children.filter((child) => child.label === YASSIFY_LABEL)).toHaveLength(1);
  yassify.update(small, false);
  expect(overlay(small)).toBeNull();
});
