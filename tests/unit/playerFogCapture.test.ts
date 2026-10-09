import { afterEach, expect, it, vi } from 'vitest';
import { Container, Sprite } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { createStore } from 'zustand/vanilla';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';

afterEach(() => vi.restoreAllMocks());

it('captures painted fog at full opacity and preserves the DM preview across repeated frames', () => {
  // jsdom has no Canvas 2D implementation; use the real fog renderer and Pixi display objects.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect() {}, save() {}, restore() {}, fillRect() {},
  } as unknown as CanvasRenderingContext2D);
  const store = createStore(() => ({
    isPlayerView: false, isGMView: true, isMapLoading: false, activeTool: 'select',
    objects: { fog: { painted: {
      id: 'painted', kind: 'fog', type: 'rectangle', timestamp: 1,
      x: 0, y: 0, width: 100, height: 100, isErasing: false,
    } } },
  }));
  const renderer = new FogOfWarRenderer(new Container() as any, { canvas: createEl('canvas') } as any, new EventEmitter(), store as any, () => null);
  try {
    const fog = renderer.getContainer().children.find(child => child instanceof Sprite && child.alpha > 0)!;
    expect(fog.visible).toBe(true);
    expect(fog.alpha).toBe(0.5);
    const renderedOpacity: number[] = [];
    for (let frame = 0; frame < 2; frame++) {
      captureWithLayerVisibility(renderer.getPlayerViewLayers(), () => {
        renderedOpacity.push(fog.alpha);
      }, () => {
        expect(fog.alpha).toBe(1);
        expect(fog.visible).toBe(true);
      });
      expect(fog.alpha).toBe(0.5);
    }
    expect(renderedOpacity).toEqual([1, 0.5, 1, 0.5]);
    expect(store.getState().isGMView).toBe(true);
  } finally {
    renderer.destroy();
  }
});
