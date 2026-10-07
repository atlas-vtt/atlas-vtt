import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { DragRulerView } from '../../src/app/pixi/token-renderer/DragRulerView';
import { pathMidpoint } from '../../src/app/pixi/utils/measureGeometry';

function makeScene(): { viewport: Container; background: Graphics; tokens: Container; view: DragRulerView } {
  const viewport = new Container();
  viewport.sortableChildren = true;
  const background = new Graphics();
  const tokens = new Container();
  viewport.addChild(background, tokens);
  const view = new DragRulerView(viewport as unknown as Viewport, tokens);
  return { viewport, background, tokens, view };
}

describe('DragRulerView', () => {
  it('draws the path between the map and the tokens and the label above them', () => {
    const { viewport, background, tokens, view } = makeScene();
    const [path, label] = view.layers as Container[];
    viewport.sortChildren();

    expect(viewport.getChildIndex(path!)).toBeGreaterThan(viewport.getChildIndex(background));
    expect(viewport.getChildIndex(path!)).toBeLessThan(viewport.getChildIndex(tokens));
    expect(label!.zIndex).toBeGreaterThan(tokens.zIndex);
  });

  it('stays hidden until a drag draws it', () => {
    const { view } = makeScene();
    expect(view.layers.every(layer => !layer.visible)).toBe(true);
  });
});

describe('pathMidpoint', () => {
  it('is the middle of a straight line', () => {
    expect(pathMidpoint([{ x: 0, y: 0 }, { x: 200, y: 100 }])).toEqual({ x: 100, y: 50 });
  });

  it('is halfway along the whole path, not between its ends', () => {
    // 300 px along x, then 100 px down: the middle is 200 px in, on the first segment.
    expect(pathMidpoint([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }])).toEqual({ x: 200, y: 0 });
  });

  it('falls back to the start of a path without length', () => {
    expect(pathMidpoint([{ x: 5, y: 5 }, { x: 5, y: 5 }])).toEqual({ x: 5, y: 5 });
    expect(pathMidpoint([])).toBeNull();
  });
});
