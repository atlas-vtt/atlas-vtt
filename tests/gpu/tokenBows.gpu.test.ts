import { Container, Sprite } from 'pixi.js';
import { expect, it, vi } from 'vitest';
import { TokenBows } from '../../src/app/pixi/token-renderer/TokenBows';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';

function tokenGroup(size: number): TokenGroupContainer {
  return Object.assign(new Container(), { tokenId: 't', tokenData: {} as TokenGroupContainer['tokenData'], tokenSize: size, artPath: '', strokeWidth: 4 }) as TokenGroupContainer;
}

it('pins a bow on the top right of every token while on, sized by its ring, and takes it off again', async () => {
  const requestRender = vi.fn();
  const bows = new TokenBows(requestRender);
  const small = tokenGroup(70);
  const large = tokenGroup(210);
  bows.update(small, true);
  bows.update(large, true);
  await vi.waitFor(() => expect(requestRender).toHaveBeenCalled());

  const bowOf = (group: Container): Sprite => group.getChildByLabel('tokenBow') as Sprite;
  for (const group of [small, large]) {
    const bow = bowOf(group);
    expect(bow).toBeTruthy();
    // On the ring's top right, upright whichever way the token turns.
    expect(bow.x).toBeGreaterThan(0);
    expect(bow.y).toBeLessThan(0);
    expect(bow.x).toBeCloseTo(-bow.y);
  }
  expect(bowOf(large).width).toBeCloseTo(bowOf(small).width * (218 / 78));

  bows.update(small, true);
  expect(small.children.filter((child) => child.label === 'tokenBow')).toHaveLength(1);
  bows.update(small, false);
  expect(bowOf(small)).toBeNull();
});
