import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Application, Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { PlayerViewFramePreview } from '../../src/app/pixi/playerViewFramePreview';

vi.mock('../../src/app/pixi/RenderScheduler', () => ({ requestRender: vi.fn() }));

describe('outline of the player view on the GM map', () => {
  it('surrounds the pointer with the players area at the map zoom, and leaves no trace', () => {
    // Twice as large on screen as in the world, shifted by (100, 50)
    const viewport = Object.assign(new EventEmitter(), {
      toScreen: (x: number, y: number) => ({ x: x * 2 + 100, y: y * 2 + 50 }),
    }) as unknown as Viewport;
    let overlay: Container | null = null;
    const remove = vi.fn();
    const preview = new PlayerViewFramePreview({} as Application, viewport, { width: 40, height: 20 }, (added) => {
      overlay = added;
      return remove;
    });

    preview.moveTo(10, 10);
    // World (-10, 0)–(30, 20): screen (80, 50)–(160, 90), plus the outline's own width
    const bounds = overlay!.getLocalBounds();
    expect([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]).toEqual([78, 48, 162, 92]);

    preview.destroy();
    expect(remove).toHaveBeenCalledTimes(1);
    expect((viewport as unknown as EventEmitter).listenerCount('moved')).toBe(0);
    expect((viewport as unknown as EventEmitter).listenerCount('zoomed')).toBe(0);
  });

  it('dots the area players see now, at once and following them, beside the frame being placed', () => {
    const viewport = Object.assign(new EventEmitter(), {
      toScreen: (x: number, y: number) => ({ x: x * 2 + 100, y: y * 2 + 50 }),
    }) as unknown as Viewport;
    let overlay: Container | null = null;
    let now: { centerX: number; centerY: number; width: number; height: number } | null = { centerX: 100, centerY: 100, width: 40, height: 20 };
    const preview = new PlayerViewFramePreview({} as Application, viewport, { width: 40, height: 20 }, (added) => {
      overlay = added;
      return vi.fn();
    }, () => now);

    // Before the pointer reaches the map: world (80, 90)–(120, 110) is screen (260, 230)–(340, 270)
    let bounds = overlay!.getLocalBounds();
    expect([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]).toEqual([258, 228, 342, 272]);

    // Players followed the GM's camera: the next redraw shows where they are now
    now = { centerX: 10, centerY: 10, width: 40, height: 20 };
    (viewport as unknown as EventEmitter).emit('moved');
    bounds = overlay!.getLocalBounds();
    expect([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]).toEqual([78, 48, 162, 92]);

    // Players see another map: only the frame being placed
    now = null;
    preview.moveTo(100, 100);
    bounds = overlay!.getLocalBounds();
    expect([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]).toEqual([258, 228, 342, 272]);
    preview.destroy();
  });
});
