import { Container, Sprite } from 'pixi.js';
import { expect, it, vi } from 'vitest';
import { TokenYassify } from '../../src/app/pixi/token-renderer/TokenYassify';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';

const PROPS = ['tokenBow', 'tokenNails', 'tokenCup'];

function tokenGroup(size: number): TokenGroupContainer {
  return Object.assign(new Container(), { tokenId: 't', tokenData: {} as TokenGroupContainer['tokenData'], tokenSize: size, artPath: '', strokeWidth: 4 }) as TokenGroupContainer;
}

it('dresses every token while on (bow top right, nails bottom left, tumbler bottom right), sized by its ring, and undresses it', async () => {
  const requestRender = vi.fn();
  const yassify = new TokenYassify(requestRender);
  const small = tokenGroup(70);
  const large = tokenGroup(210);
  yassify.update(small, true);
  yassify.update(large, true);
  await vi.waitFor(() => expect(requestRender).toHaveBeenCalled());

  const prop = (group: Container, label: string): Sprite => group.getChildByLabel(label) as Sprite;
  for (const group of [small, large]) {
    const bow = prop(group, 'tokenBow');
    expect(bow.x).toBeGreaterThan(0);
    expect(bow.y).toBeLessThan(0);
    expect(prop(group, 'tokenNails').x).toBeLessThan(0);
    expect(prop(group, 'tokenNails').y).toBeGreaterThan(0);
    expect(prop(group, 'tokenCup').x).toBeGreaterThan(0);
    expect(prop(group, 'tokenCup').y).toBeGreaterThan(0);
  }
  for (const label of PROPS) expect(prop(large, label).width).toBeCloseTo(prop(small, label).width * (218 / 78));

  yassify.update(small, true);
  expect(small.children.filter((child) => PROPS.includes(child.label))).toHaveLength(3);
  yassify.update(small, false);
  for (const label of PROPS) expect(prop(small, label)).toBeNull();
});
