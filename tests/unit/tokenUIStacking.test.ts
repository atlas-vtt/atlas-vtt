// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

describe('token UI stacking', () => {
  let restoreGraphics: () => void = () => {};
  beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
  afterEach(() => { restoreGraphics(); });

  /** The names of two tokens' UI from the lowest to the topmost, in a layer that got `first` before `second`. */
  function layerOf(first: TokenUIRenderer, second: TokenUIRenderer): { order: () => string[] } {
    const layer = new Container({ sortableChildren: true });
    layer.addChild(first.getContainer(), second.getContainer());
    return {
      order: () => {
        layer.sortChildren();
        return layer.children.map((child) => (child === first.getContainer() ? 'first' : 'second'));
      },
    };
  }

  it('draws a selected token\'s bars and wheels above those of every other token', () => {
    const first = new TokenUIRenderer();
    const second = new TokenUIRenderer();
    const layer = layerOf(first, second);
    expect(layer.order()).toEqual(['first', 'second']);

    first.setSelectionState(true);
    expect(layer.order()).toEqual(['second', 'first']);

    first.setSelectionState(false);
    second.setSelectionState(true);
    expect(layer.order()).toEqual(['first', 'second']);
  });
});
