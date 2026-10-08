import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Container } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { WallRenderer } from '../../src/app/pixi/vision/WallRenderer';
import { WallTool } from '../../src/app/tools/WallTool';
import { MeasureRenderer } from '../../src/app/pixi/MeasureRenderer';
import { FRAME, fakePlayerFrames } from '../mocks/playerFrameSource';

afterEach(() => vi.restoreAllMocks());

function createHarness(eventBus: EventEmitter) {
  const store = createStore(subscribeWithSelector(() => ({ activeTool: 'move' })));
  const viewport = Object.assign(new Container(), {
    plugins: { resume: vi.fn(), pause: vi.fn() },
  });
  const manager = {
    init: vi.fn(),
    getViewport: () => viewport,
    destroy: () => viewport.destroy({ children: true }),
  };
  const renderer = new PixiRendererOrchestrator({} as any, manager as any, eventBus, store as any, 'test');
  // Exercise real initialization and tool subscriptions without WebGL/audio setup.
  vi.spyOn(renderer as any, 'setupRenderersAndManagers').mockImplementation(() => {
    (renderer as any).wallRenderer = new WallRenderer(viewport as any, store as any);
    (renderer as any).wallTool = new WallTool(eventBus);
    (renderer as any).measureRenderer = new MeasureRenderer(viewport as any, eventBus, store as any, {} as any);
  });
  vi.spyOn(renderer as any, 'setupKeyboardHandlers').mockImplementation(() => {});
  return { renderer, store, viewport };
}

describe('renderer lifecycle across map switches', () => {
  it.each(['measure', 'measure-circle', 'measure-cone'])('can activate %s after destroying the previous renderer', async (tool) => {
    const eventBus = new EventEmitter();
    const old = createHarness(eventBus);
    await old.renderer.init(document.createElement('div'));
    old.renderer.destroy();

    const current = createHarness(eventBus);
    await current.renderer.init(document.createElement('div'));
    try {
      expect(() => current.store.setState({ activeTool: tool })).not.toThrow();
      const measure = (current.renderer as any).measureRenderer;
      expect(current.viewport.listeners('pointerdown')).toContain(measure.pointerDownHandler);
      expect(current.viewport.listeners('pointermove')).toContain(measure.pointerMoveHandler);
      expect(current.viewport.listeners('pointerup')).toContain(measure.pointerUpHandler);
    } finally {
      current.renderer.destroy();
    }
  });

  it('leaves the right-drag pan running in every tool', async () => {
    const { renderer, store, viewport } = createHarness(new EventEmitter());
    await renderer.init(document.createElement('div'));
    try {
      for (const tool of ['fog', 'eraser', 'wall', 'text', 'note-pin', 'audio', 'select', 'draw-line', 'move']) {
        store.setState({ activeTool: tool });
      }
      expect(viewport.plugins.pause).not.toHaveBeenCalledWith('drag');
    } finally {
      renderer.destroy();
    }
  });

  it('gives the players\' frame back when the view unloads, and renders none after', async () => {
    const { renderer } = createHarness(new EventEmitter());
    await renderer.init(document.createElement('div'));
    const frames = fakePlayerFrames();
    (renderer as any).playerFrames = frames;

    renderer.destroy();

    expect(frames.destroy).toHaveBeenCalledTimes(1);
    expect(renderer.canRenderPlayerFrame()).toBe(false);
    const copy = vi.fn();
    renderer.withPlayerSafeFrame(copy, {} as never, FRAME);
    expect(copy).not.toHaveBeenCalled();
    // The player window lets go of a view that is gone already
    expect(() => renderer.releasePlayerFrame()).not.toThrow();
  });

  it('removes its own event listeners while preserving other event bus subscribers', async () => {
    const eventBus = new EventEmitter();
    const externalListener = vi.fn();
    eventBus.on('wall-drawing-cancelled', externalListener);
    const { renderer } = createHarness(eventBus);
    await renderer.init(document.createElement('div'));
    renderer.destroy();
    renderer.destroy();

    expect(eventBus.eventNames()).toEqual(['wall-drawing-cancelled']);
    expect(() => eventBus.emit('wall-drawing-cancelled')).not.toThrow();
    expect(externalListener).toHaveBeenCalledTimes(1);
  });
});
