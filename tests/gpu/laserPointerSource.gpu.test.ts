import { Application, FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneSource } from '../../src/app/host/sceneSource';
import type { ViewState } from '../../src/app/types/viewState';
import { LaserPointerRenderer } from '../../src/app/pixi/LaserPointerRenderer';
import { LASER_FADE_TIME } from '../../src/app/tools/laserPointerSettings';
import { copiedPixel } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';

type Tool = ViewState['activeTool'];
type PointerEventName = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerupoutside';
interface Harness {
  app: Application;
  viewport: Viewport;
  laser: LaserPointerRenderer;
  setTool(tool: Tool): void;
  listeners(): number;
  pointer(name: PointerEventName, button?: number): void;
  frame(elapsed?: number): void;
  red(): boolean;
  baselineTicker: number;
  baselineListeners: number[];
}
const EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside', 'moved'] as const;
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0).reverse()) stop();
  vi.restoreAllMocks();
});

async function setup(initialTool: Tool): Promise<Harness> {
  const app = new Application();
  await app.init({ width: 160, height: 160, preference: 'webgl', autoStart: false, antialias: false, backgroundColor: 0x000000 });
  cleanup.push(() => app.destroy(true, { children: true }));
  const viewport = new Viewport({ screenWidth: 160, screenHeight: 160, worldWidth: 160, worldHeight: 160, events: app.renderer.events, noTicker: true });
  app.stage.addChild(viewport);
  let tool = initialTool;
  const listeners = new Set<(next: Tool, previous: Tool) => void>();
  const source: SceneSource<Tool> = {
    get: () => tool,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  let now = 1000;
  let frameTime = performance.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const baselineTicker = app.ticker.count;
  const baselineListeners = EVENTS.map(event => viewport.listenerCount(event));
  const laser = new LaserPointerRenderer(viewport, app, source, app.canvas, () => ({ color: '#ff0000', size: 16 }));
  viewport.addChild(laser.getContainer());
  cleanup.push(() => { if (!laser.getContainer().destroyed) laser.destroy(); });
  return {
    app, viewport, laser, baselineTicker, baselineListeners,
    setTool(next) { const previous = tool; tool = next; for (const listener of listeners) listener(next, previous); },
    listeners: () => listeners.size,
    pointer(name, button = 0) {
      const event = new FederatedPointerEvent(app.renderer.events.rootBoundary);
      event.global.set(80, 80);
      event.button = button;
      viewport.emit(name, event);
    },
    frame(elapsed = 16) { now += elapsed; frameTime += elapsed; app.ticker.update(frameTime); app.render(); },
    red() { const [r, g, b] = copiedPixel(app.canvas, 75, 80); return r! > 150 && g! < 60 && b! < 60; },
  };
}

describe('laser with a read-only tool source', () => {
  it('starts active and keeps its dot under a stationary pointer when the viewport moves', async () => {
    const scene = await setup('laser-pointer');
    expect(scene.app.canvas.style.cursor).toBe('none');
    scene.pointer('pointermove');
    scene.frame();
    expect(scene.red()).toBe(true);
    scene.viewport.position.set(20, 30);
    scene.viewport.emit('moved', { viewport: scene.viewport, type: 'drag' });
    scene.frame();
    expect(scene.red()).toBe(true);
  });

  it('follows tool changes and leaves no dot when the laser is disabled', async () => {
    const scene = await setup('move');
    scene.pointer('pointermove');
    scene.frame();
    expect(scene.red()).toBe(false);
    scene.setTool('laser-pointer');
    scene.pointer('pointerdown');
    scene.frame();
    expect(scene.red()).toBe(true);
    scene.pointer('pointerup');
    scene.setTool('move');
    scene.frame(LASER_FADE_TIME + 1);
    expect(scene.app.canvas.style.cursor).toBe('auto');
    expect(scene.red()).toBe(false);
  });

  it('allows middle-button pointing with another tool and fades on release outside', async () => {
    const scene = await setup('move');
    scene.pointer('pointerdown', 1);
    scene.frame();
    expect(scene.red()).toBe(true);
    expect(scene.app.canvas.style.cursor).toBe('none');
    scene.pointer('pointerupoutside', 1);
    expect(scene.app.canvas.style.cursor).toBe('auto');
    scene.frame(LASER_FADE_TIME + 1);
    expect(scene.red()).toBe(false);
    expect(scene.app.ticker.count).toBe(scene.baselineTicker);
  });

  it('releases its subscription, pointer listeners and ticker on destruction', async () => {
    const scene = await setup('laser-pointer');
    scene.pointer('pointerdown');
    expect(scene.listeners()).toBe(1);
    expect(scene.app.ticker.count).toBeGreaterThan(scene.baselineTicker);
    scene.laser.destroy();
    expect(scene.listeners()).toBe(0);
    expect(EVENTS.map(event => scene.viewport.listenerCount(event))).toEqual(scene.baselineListeners);
    expect(scene.app.ticker.count).toBe(scene.baselineTicker);
    scene.setTool('move');
    scene.setTool('laser-pointer');
    scene.app.canvas.dispatchEvent(new MouseEvent('mouseleave'));
    scene.pointer('pointerdown', 1);
    expect(scene.app.ticker.count).toBe(scene.baselineTicker);
  });
});
