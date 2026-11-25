// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Container, Graphics, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { DragRulerView } from '../../src/app/pixi/token-renderer/DragRulerView';
import { BEYOND_SPEED } from '../../src/app/measure/dragMovement';
import { LIVE_DISSOLVE_MS, MEASURE_MOTION } from '../../src/app/pixi/measure/measurePresence';
import { forgetObsidianAccentColor } from '../../src/app/pixi/utils/colorUtils';
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
    const label = (view.layers[1] as Container).getChildByLabel('measure-label');
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

  it('draws its path in the colour of the movement step, in the theme\'s warning red past the last one, and in the accent without one', () => {
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 16));
    forgetObsidianAccentColor();
    document.body.style.setProperty('--interactive-accent', 'rgb(10, 20, 30)');
    document.body.style.setProperty('--text-error', 'rgb(200, 0, 0)');
    const { view } = makeScene();
    const accent = (view.layers[0] as Container).getChildByLabel('measure-accent', true) as Graphics;
    /** The colours the path was drawn in: its stroke and its dots. */
    const colors = (): number[] => [...new Set(accent.context.instructions.flatMap((instruction) =>
      instruction.action === 'texture' ? [] : [(instruction.data.style as { color: number }).color]))];
    const WHITE = 0xffffff;
    const points = [{ x: 0, y: 0 }, { x: 70, y: 0 }];

    view.draw(points, '5ft', 35, 70);
    expect(colors()).toEqual([0x0a141e, WHITE]);
    view.draw(points, '5 / 30ft', 35, 70, '#22c55e');
    expect(colors()).toEqual([0x22c55e, WHITE]);
    view.draw(points, '65 / 30ft', 35, 70, BEYOND_SPEED);
    expect(colors()).toEqual([0xc80000, WHITE]);
    // A theme with another red: the next draw (a zoom, a theme switch) takes it.
    document.body.style.setProperty('--text-error', 'rgb(255, 80, 80)');
    view.draw(points, '65 / 30ft', 35, 70, BEYOND_SPEED);
    expect(colors()).toEqual([0xff5050, WHITE]);
    // The next drag without a step is the accent's again.
    view.draw(points, '5ft', 35, 70);
    expect(colors()).toEqual([0x0a141e, WHITE]);

    document.body.style.removeProperty('--interactive-accent');
    document.body.style.removeProperty('--text-error');
    forgetObsidianAccentColor();
    vi.restoreAllMocks();
  });

  it('stays hidden until a drag draws it', () => {
    const { view } = makeScene();
    expect(view.layers.every(layer => !layer.visible)).toBe(true);
  });

  describe('coming and going', () => {
    const POINTS = [{ x: 140, y: 70 }, { x: 350, y: 70 }];
    /** How far the ruler is on the map: the opacity of its path and of its label, and the label's growth about the drag's start. */
    const presence = (view: DragRulerView): { path: number; label: number; grow: number; about: { x: number; y: number } } => {
      const [path, label] = view.layers as Container[];
      const line = path!.getChildByLabel('measure-line', true)!;
      return { path: line.alpha, label: label!.alpha, grow: label!.scale.x, about: { x: label!.pivot.x, y: label!.pivot.y } };
    };
    const scene = (): ReturnType<typeof makeScene> => {
      vi.useFakeTimers();
      vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 16));
      return makeScene();
    };

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('fades its first drawing in as a measurement being made does, and not the drawings that follow', () => {
      const { view } = scene();
      view.draw(POINTS, '15 ft', 35, 70);
      expect(presence(view)).toMatchObject({ path: 0, label: 0 });
      vi.advanceTimersByTime(MEASURE_MOTION.live.ms / 2);
      const midway = presence(view).path;
      expect(midway).toBeGreaterThan(0);
      expect(midway).toBeLessThan(1);
      view.draw([POINTS[0]!, { x: 420, y: 70 }], '20 ft', 35, 70);
      expect(presence(view).path).toBe(midway);
      vi.advanceTimersByTime(MEASURE_MOTION.live.ms);
      expect(presence(view)).toMatchObject({ path: 1, label: 1, grow: 1 });
      view.draw(POINTS, '15 ft', 35, 70);
      expect(presence(view)).toMatchObject({ path: 1, label: 1 });
      view.destroy();
    });

    it('dissolves where it lies once the drag is over, shrinking about its start, and is gone only then', () => {
      const { view } = scene();
      const gone = vi.fn();
      view.draw(POINTS, '15 ft', 35, 70);
      vi.advanceTimersByTime(MEASURE_MOTION.live.ms + 50);
      view.dissolve(gone);
      expect(view.layers.every((layer) => layer.visible)).toBe(true);
      vi.advanceTimersByTime(LIVE_DISSOLVE_MS / 2);
      const leaving = presence(view);
      expect(leaving.path).toBeGreaterThan(0);
      expect(leaving.path).toBeLessThan(1);
      expect(leaving.label).toBe(leaving.path);
      expect(leaving.grow).toBeLessThan(1);
      expect(leaving.about).toEqual(POINTS[0]);
      expect(gone).not.toHaveBeenCalled();
      vi.advanceTimersByTime(LIVE_DISSOLVE_MS);
      expect(gone).toHaveBeenCalledTimes(1);
      expect(view.layers.every((layer) => !layer.visible)).toBe(true);
      // Ready for the next drag, drawn in full.
      expect(presence(view)).toMatchObject({ path: 1, label: 1, grow: 1 });
      view.destroy();
    });

    it('is gone at once where no ruler was drawn', () => {
      const { view } = scene();
      const gone = vi.fn();
      view.dissolve(gone);
      expect(gone).toHaveBeenCalledTimes(1);
      view.destroy();
    });

    it('fades the next drag in over one that still dissolves, which never ends it', () => {
      const { view } = scene();
      const gone = vi.fn();
      view.draw(POINTS, '15 ft', 35, 70);
      vi.advanceTimersByTime(MEASURE_MOTION.live.ms + 50);
      view.dissolve(gone);
      vi.advanceTimersByTime(LIVE_DISSOLVE_MS / 2);
      view.draw([{ x: 70, y: 70 }, { x: 70, y: 280 }], '15 ft', 35, 70);
      expect(presence(view)).toMatchObject({ path: 0, grow: 1 });
      vi.advanceTimersByTime(LIVE_DISSOLVE_MS + 50);
      expect(gone).not.toHaveBeenCalled();
      expect(presence(view)).toMatchObject({ path: 1, label: 1, grow: 1 });
      expect(view.layers.every((layer) => layer.visible)).toBe(true);
      view.destroy();
    });

    it('keeps the fade and drops the growth where reduced motion is asked for', () => {
      const { view } = scene();
      vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
      view.draw(POINTS, '15 ft', 35, 70);
      vi.advanceTimersByTime(MEASURE_MOTION.live.ms + 50);
      view.dissolve(() => undefined);
      vi.advanceTimersByTime(LIVE_DISSOLVE_MS / 2);
      const leaving = presence(view);
      expect(leaving.path).toBeLessThan(1);
      expect(leaving.grow).toBe(1);
      view.destroy();
    });
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
