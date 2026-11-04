// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { ResourceStack } from '../../../src/app/pixi/token-renderer/resources/ResourceStack';
import { HP_RESOURCE } from '../../../src/app/resources/resourceDefinitions';
import { ARMOR } from '../../mocks/resourceFixtures';

const STR = { ...HP_RESOURCE, key: 'str', name: 'STR', color: '#dc2626', defeatedWhenSpent: false };

describe('ResourceStack', () => {
  // jsdom has no canvas: bar fills paint a gradient and badge text is measured on one.
  let restoreGraphics: () => void;
  beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
  afterEach(() => restoreGraphics());

  it('lays out the bars top to bottom', () => {
    const stack = new ResourceStack(null);
    stack.update([
      { definition: HP_RESOURCE, value: { current: 3, max: 8 }, slot: 0 },
      { definition: STR, value: { current: 12, max: 14 }, slot: 1 },
    ], 2, false);
    const slots = stack.layout();
    expect(slots.map((s) => [s.key, s.kind])).toEqual([['hp', 'bar'], ['str', 'bar']]);
    expect(slots[1]!.top).toBeGreaterThan(slots[0]!.top);
  });

  it('draws the text of views created later at the resolution set before', () => {
    const stack = new ResourceStack(null);
    stack.setResolution(6);
    stack.update([{ definition: HP_RESOURCE, value: { current: 3, max: 8 }, slot: 0 }, { definition: STR, value: { current: 4, max: 6 }, slot: 1 }], 2, false);
    const texts = (node: Container): Text[] => node.children.flatMap((child) => (child instanceof Text ? [child] : texts(child as Container)));
    expect(texts(stack.view).length).toBeGreaterThan(0);
    expect(texts(stack.view).map((text) => text.resolution)).not.toContain(3);
  });

  it('keeps a view per key and destroys only what disappeared', () => {
    const stack = new ResourceStack(null);
    stack.update([{ definition: HP_RESOURCE, value: { current: 3, max: 8 }, slot: 0 }, { definition: STR, value: { current: 1, max: 1 }, slot: 1 }], 0, false);
    const hpView = stack.view.children[0];
    stack.update([{ definition: HP_RESOURCE, value: { current: 2, max: 8 }, slot: 0 }], 0, false);
    expect(stack.view.children).toHaveLength(1);
    expect(stack.view.children[0]).toBe(hpView);
  });

  it('writes a static value as one number, not as "current / maximum"', () => {
    const stack = new ResourceStack(null);
    stack.update([{ definition: ARMOR, value: { current: 15, max: 15 }, slot: 0 }], 2, false);
    const texts = (node: Container): Text[] => node.children.flatMap((child) => (child instanceof Text ? [child] : texts(child as Container)));
    expect(texts(stack.view).filter((text) => text.visible).map((text) => text.text)).toEqual(['15']);
    stack.update([{ definition: HP_RESOURCE, value: { current: 3, max: 8 }, slot: 0 }], 2, false);
    expect(texts(stack.view).filter((text) => text.visible).map((text) => text.text)).toEqual(['3', '/', '8']);
    stack.destroy();
  });
});
