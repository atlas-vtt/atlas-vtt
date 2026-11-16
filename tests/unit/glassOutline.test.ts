// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Application, Container, Graphics, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { GlassOutline } from '../../src/app/pixi/glassOutline';
import { requestRender } from '../../src/app/pixi/RenderScheduler';
import { canvasBadgeTheme } from '../../src/app/pixi/utils/canvasBadgeColors';

vi.mock('../../src/app/pixi/RenderScheduler', () => ({ requestRender: vi.fn() }));
vi.mock('../../src/app/pixi/utils/canvasBadgeColors', () => ({ canvasBadgeTheme: vi.fn(() => ({ background: 0x2a2a2a, stroke: 0xffffff, accent: 0x7f6df2 })) }));

const ACCENT = 0x7f6df2;

interface Drawn {
  action: string;
  color: number;
  alpha: number;
  width?: number;
}

/** What the overlay was told to fill and stroke, in order. */
function drawn(overlay: Container): Drawn[] {
  const { instructions } = (overlay.children[0] as Graphics).context;
  return instructions.map(({ action, data }) => {
    const style = (data as { style: { color: number; alpha: number; width?: number } }).style;
    return { action, color: style.color, alpha: style.alpha, ...(action === 'stroke' ? { width: style.width } : {}) };
  });
}

function bounds(overlay: Container): number[] {
  const box = overlay.children[0]!.getLocalBounds();
  return [box.minX, box.minY, box.maxX, box.maxY];
}

/** The drawing covers the screen rect `[left, top, right, bottom]` and reaches past it by the width of its lines alone. */
function expectAround(overlay: Container, [left, top, right, bottom]: number[]): void {
  const [minX, minY, maxX, maxY] = bounds(overlay);
  for (const gap of [left - minX, top - minY, maxX - right, maxY - bottom]) {
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(5);
  }
}

/** Twice as large on screen as in the world, shifted by (100, 50). */
function setup(): { outline: GlassOutline; overlay: () => Container; viewport: EventEmitter; remove: ReturnType<typeof vi.fn>; zoom(scale: number): void } {
  let scale = 2;
  const viewport = Object.assign(new EventEmitter(), {
    toScreen: (x: number, y: number) => ({ x: x * scale + 100, y: y * scale + 50 }),
  });
  let added: Container | null = null;
  const remove = vi.fn();
  const outline = new GlassOutline({} as Application, viewport as unknown as Viewport, (overlay) => {
    added = overlay;
    return remove;
  });
  return { outline, overlay: () => added!, viewport, remove, zoom: (next) => { scale = next; } };
}

afterEach(() => vi.mocked(requestRender).mockClear());

describe('the glass on the GM map', () => {
  it('draws the live glass in the accent over a dark line, leaves the map inside untinted, and asks for a render', () => {
    const { outline, overlay } = setup();
    outline.setGlass({ centerX: 10, centerY: 10, width: 40, height: 20 }, 'live');

    // World (-10, 0)–(30, 20): screen (80, 50)–(160, 90)
    expectAround(overlay(), [80, 50, 160, 90]);
    const ink = drawn(overlay());
    expect(ink.filter(({ action }) => action === 'fill')).toEqual([]);
    expect(ink).toContainEqual({ action: 'stroke', color: 0x000000, alpha: 0.35, width: 4 });
    expect(ink).toContainEqual({ action: 'stroke', color: ACCENT, alpha: 1, width: 2 });
    // Only the theme's accent and the dark line: no gold, no white
    expect(new Set(ink.map(({ color }) => color))).toEqual(new Set([ACCENT, 0x000000]));
    expect(requestRender).toHaveBeenCalled();
  });

  it('draws the ghost at half the strength', () => {
    const { outline, overlay } = setup();
    outline.setGlass({ centerX: 10, centerY: 10, width: 40, height: 20 }, 'ghost');
    const ink = drawn(overlay());
    expect(ink.filter(({ action }) => action === 'fill')).toEqual([]);
    expect(ink).toContainEqual({ action: 'stroke', color: ACCENT, alpha: 0.5, width: 2 });
    expect(ink.every(({ alpha }) => alpha <= 0.5)).toBe(true);
  });

  it('dots where players see now, alone and beside the glass, and takes it away', () => {
    const { outline, overlay } = setup();
    outline.setOrigin({ centerX: 10, centerY: 10, width: 40, height: 20 });
    // Dashes only
    expect(drawn(overlay()).map(({ action }) => action)).toEqual(['stroke', 'stroke']);
    expectAround(overlay(), [80, 50, 160, 90]);

    outline.setGlass({ centerX: 100, centerY: 100, width: 40, height: 20 });
    expect(drawn(overlay()).filter(({ action }) => action === 'stroke').length).toBeGreaterThan(2);
    outline.setOrigin(null);
    expect(bounds(overlay())[0]).toBeGreaterThan(200);
    outline.setGlass(null);
    expect(drawn(overlay())).toEqual([]);
  });

  it('follows the zoom, reads the accent again when the theme changes and leaves no trace', async () => {
    const { outline, overlay, viewport, remove, zoom } = setup();
    outline.setGlass({ centerX: 10, centerY: 10, width: 40, height: 20 });
    zoom(1);
    viewport.emit('zoomed');
    // World (-10, 0)–(30, 20): screen (90, 50)–(130, 70)
    expectAround(overlay(), [90, 50, 130, 70]);

    vi.mocked(canvasBadgeTheme).mockReturnValue({ background: 0xe3e3e3, stroke: 0x000000, accent: 0x00aa55 });
    document.body.classList.toggle('theme-dark');
    await Promise.resolve();
    expect(drawn(overlay())).toContainEqual({ action: 'stroke', color: 0x00aa55, alpha: 1, width: 2 });

    outline.destroy();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(viewport.listenerCount('moved')).toBe(0);
    expect(viewport.listenerCount('zoomed')).toBe(0);
  });

  describe('saved frames', () => {
    const FRAMES = [
      { centerX: 10, centerY: 10, width: 40, height: 20 },
      { centerX: 20, centerY: 15, width: 40, height: 20 },
    ];
    const numbers = (overlay: Container): Text[] => (overlay.children[1] as Container).children as Text[];
    beforeEach(() => vi.mocked(canvasBadgeTheme).mockReturnValue({ background: 0x2a2a2a, stroke: 0xffffff, accent: ACCENT }));

    it('draws them thinner than the glass, without fill or ticks, each with its number in a badge on its top-left corner', () => {
      const { outline, overlay } = setup();
      outline.setSaved([FRAMES[0]!]);
      const ink = drawn(overlay());
      // Outline: a dark line under a thin accent at lower strength; badge: the theme's background and stroke
      expect(ink).toEqual([
        { action: 'stroke', color: 0x000000, alpha: 0.35 * 0.6, width: 3.5 },
        { action: 'stroke', color: ACCENT, alpha: 0.6, width: 1.5 },
        { action: 'fill', color: 0x2a2a2a, alpha: 1 },
        { action: 'stroke', color: 0xffffff, alpha: 1, width: 1 },
      ]);
      // World (-10, 0): screen (80, 50), where the badge's number stands, in the stroke colour
      const [number] = numbers(overlay());
      expect(number!.text).toBe('1');
      expect([number!.x, number!.y]).toEqual([80, 50]);
      expect(number!.style.fill).toBe(0xffffff);
    });

    it('numbers them in order under the glass, and hides the numbers of frames that went', () => {
      const { outline, overlay } = setup();
      outline.setSaved(FRAMES);
      outline.setGlass({ centerX: 100, centerY: 100, width: 40, height: 20 }, 'live');
      expect(numbers(overlay()).map(({ text, visible }) => [text, visible])).toEqual([['1', true], ['2', true]]);
      // The glass is drawn last, over the saved frames
      expect(drawn(overlay()).at(-1)).toMatchObject({ color: ACCENT, alpha: 1 });

      outline.setSaved([FRAMES[1]!]);
      expect(numbers(overlay()).map(({ text, visible }) => [text, visible])).toEqual([['1', true], ['2', false]]);
    });

    it('finds the frame under a screen point, the later one where they overlap, by the rectangles of the last draw', () => {
      const { outline, viewport, zoom } = setup();
      outline.setSaved(FRAMES);
      // Frame 1 on screen (80, 50)–(160, 90), frame 2 (100, 60)–(180, 100)
      expect(outline.savedAt(85, 55)).toBe(0);
      expect(outline.savedAt(120, 70)).toBe(1);
      expect(outline.savedAt(170, 95)).toBe(1);
      expect(outline.savedAt(10, 10)).toBe(-1);
      expect(outline.savedRect(1)).toEqual({ x: 100, y: 60, width: 80, height: 40 });

      zoom(1);
      viewport.emit('zoomed');
      // Frame 1 on screen (90, 50)–(130, 70)
      expect(outline.savedAt(150, 85)).toBe(-1);
      expect(outline.savedAt(95, 55)).toBe(0);
    });

    it('finds a frame inside a larger one that was saved after it', () => {
      const { outline } = setup();
      outline.setSaved([FRAMES[0]!, { centerX: 10, centerY: 10, width: 200, height: 100 }]);
      // The small one on screen (80, 50)–(160, 90), the large one around it
      expect(outline.savedAt(120, 70)).toBe(0);
      expect(outline.savedAt(200, 120)).toBe(1);
    });
  });
});
