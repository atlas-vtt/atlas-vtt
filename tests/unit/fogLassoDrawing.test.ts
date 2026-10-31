// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createStore } from 'zustand/vanilla';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';

afterEach(() => vi.restoreAllMocks());

it.each(['fog', 'eraser'])('places snapped corners by click for %s and keeps freehand drawing when off', (activeTool) => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect() {}, save() {}, restore() {}, fillRect() {},
  } as unknown as CanvasRenderingContext2D);
  const addFogOperation = vi.fn();
  const store = createStore(() => ({
    isPlayerView: false, isGMView: true, isMapLoading: false, activeTool,
    objects: { fog: {} }, addFogOperation,
    grid: { enabled: true, size: 50, offsetX: 10, offsetY: 20 },
  }));
  const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }) => point });
  const events = new EventEmitter();
  const renderer = new FogOfWarRenderer(viewport as any, { canvas: document.createElement('canvas') } as any, events, store as any, () => null);
  const draw = (): void => {
    viewport.emit('pointerdown', { button: 0, global: { x: 13, y: 24 } });
    viewport.emit('pointermove', { global: { x: 14, y: 25 } });
    viewport.emit('pointermove', { global: { x: 63, y: 24 } });
    viewport.emit('pointermove', { global: { x: 63, y: 74 } });
    viewport.emit('pointerup');
  };
  try {
    events.emit('fog-mode-changed', 'lasso');
    events.emit('fog-lasso-snap-changed', true);
    viewport.emit('pointerdown', { button: 0, global: { x: 13, y: 24 } });
    viewport.emit('pointerup');
    viewport.emit('pointermove', { global: { x: 200, y: 200 } });
    viewport.emit('pointerdown', { button: 0, global: { x: 63, y: 24 } });
    viewport.emit('pointerup');
    viewport.emit('pointerdown', { button: 0, global: { x: 63, y: 74 } });
    viewport.emit('pointerup');
    expect(addFogOperation).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(addFogOperation).toHaveBeenLastCalledWith({
      type: 'lasso', isErasing: activeTool === 'eraser',
      points: [{ x: 10, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 70 }],
    });
    events.emit('fog-lasso-snap-changed', false);
    draw();
    expect(addFogOperation.mock.lastCall![0].points).toEqual([
      { x: 13, y: 24 }, { x: 14, y: 25 }, { x: 63, y: 24 }, { x: 63, y: 74 },
    ]);
  } finally {
    renderer.destroy();
  }
  expect(events.listenerCount('fog-lasso-snap-changed')).toBe(0);
});
