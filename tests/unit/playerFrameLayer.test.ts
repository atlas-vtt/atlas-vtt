// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Container } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import * as scheduler from '../../src/app/pixi/RenderScheduler';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { DEFAULT_MEASURE_TOOL } from '../../src/app/measure/measureTypes';
import { FRAME, fakePlayerFrames } from '../mocks/playerFrameSource';

afterEach(() => vi.restoreAllMocks());

/** A view's renderer without WebGL: a real orchestrator over a bare viewport and an app whose renderer draws nothing. */
async function view(): Promise<{ renderer: PixiRendererOrchestrator; viewport: Container }> {
  const store = createStore(subscribeWithSelector(() => ({ activeTool: 'move', objects: { tokens: {}, walls: {} }, measureTool: DEFAULT_MEASURE_TOOL, mapPath: null })));
  const viewport = Object.assign(new Container(), { plugins: { resume: vi.fn(), pause: vi.fn() } });
  const app = { renderer: { render: vi.fn() }, stage: new Container() };
  const manager = { init: vi.fn(), getViewport: () => viewport, getApp: () => app, app, getGestures: () => null, destroy: () => viewport.destroy({ children: true }) };
  const renderer = new PixiRendererOrchestrator({} as never, manager as never, new EventEmitter(), store as never, 'test');
  vi.spyOn(renderer as never, 'setupRenderersAndManagers').mockImplementation(() => undefined);
  vi.spyOn(renderer as never, 'setupKeyboardHandlers').mockImplementation(() => undefined);
  await renderer.init(document.createElement('div'));
  return { renderer, viewport };
}

describe('a layer shown to the players\' frame alone', () => {
  it('lies in the map hidden from the GM\'s canvas, shows while the players\' frame renders, and leaves with remove', async () => {
    const { renderer, viewport } = await view();
    const layer = new Container();
    const handle = renderer.addPlayerFrameLayer(layer);
    expect(layer.parent).toBe(viewport);
    expect(layer.visible).toBe(false);
    let shownInFrame: boolean | null = null;
    (renderer as unknown as { playerFrames: unknown }).playerFrames = fakePlayerFrames(() => void (shownInFrame = layer.visible));
    renderer.withPlayerSafeFrame(() => undefined, {} as never, FRAME, true);
    expect(shownInFrame).toBe(true);
    expect(layer.visible).toBe(false);
    handle.remove();
    expect(layer.parent).toBeNull();
    renderer.withPlayerSafeFrame(() => undefined, {} as never, FRAME, true);
    renderer.destroy();
  });

  it('asks for a render on a change only while a player window mirrors the view', async () => {
    const { renderer } = await view();
    const request = vi.spyOn(scheduler, 'requestRender').mockImplementation(() => undefined);
    const handle = renderer.addPlayerFrameLayer(new Container());
    const mirrors = vi.fn(() => false);
    vi.spyOn(PlayerWindowService, 'getInstance').mockReturnValue({ mirrors } as never);
    handle.changed();
    expect(request).not.toHaveBeenCalled();
    mirrors.mockReturnValue(true);
    handle.changed();
    expect(request).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });
});
