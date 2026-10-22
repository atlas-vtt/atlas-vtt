// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Bounds, Container, Graphics, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { DragRulerView } from '../../src/app/pixi/token-renderer/DragRulerView';
import { shortenPathEnd } from '../../src/app/pixi/utils/measureDrawing';
import { labelScale, pathMiddle } from '../../src/app/pixi/utils/measureLabelLayout';
import { NAMEPLATE_HEIGHT } from '../../src/app/pixi/token-renderer/tokenSizing';

const pathMidpoint = (points: { x: number; y: number }[]): { x: number; y: number } | null => pathMiddle(points)?.point ?? null;

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

  it('keeps its label beside the path and off the dragged token, at its size on screen as the zoom changes', () => {
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 16));
    const { viewport, view } = makeScene();
    const [, label] = view.layers as Container[];
    view.draw([{ x: 0, y: 0 }, { x: 70, y: 0 }], '5 ft', 35, 70);
    const clearOfToken = (): number => {
      const { x, y } = label!.position;
      // A pill of the nameplate's height, a mocked text 40 wide at the nameplate's text scale and its padding.
      const half = { w: label!.scale.x * (40 * 0.333 + 12) / 2, h: label!.scale.x * NAMEPLATE_HEIGHT / 2 };
      return Math.hypot(Math.max(Math.abs(x - 70) - half.w, 0), Math.max(Math.abs(y) - half.h, 0));
    };
    expect(clearOfToken()).toBeGreaterThan(35);
    viewport.scale.set(4);
    viewport.emit('zoomed', {});
    expect(label!.scale.x).toBe(labelScale(70, 4));
    expect(clearOfToken()).toBeGreaterThan(35);
    vi.restoreAllMocks();
  });

  it('stays hidden until a drag draws it', () => {
    const { view } = makeScene();
    expect(view.layers.every(layer => !layer.visible)).toBe(true);
  });
});

describe('shortenPathEnd', () => {
  it('ends the last segment that far before its end', () => {
    expect(shortenPathEnd([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }], 35)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 65, y: 100 }]);
  });

  it('drops a last segment shorter than the gap', () => {
    expect(shortenPathEnd([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 120, y: 0 }], 35)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });
});

describe('pathMiddle', () => {
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
