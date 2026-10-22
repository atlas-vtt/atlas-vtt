// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { genericLight } from '../mocks/lights';
import { LightPopoverHost } from '../../src/app/pixi/lighting/LightPopover';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom lays nothing out: the view is 1200 × 800, the popover 272 × 340, and the map fills the view.
const VIEW = { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 };
const restore: (() => void)[] = [];

function stub<T extends object>(target: T, key: string, descriptor: PropertyDescriptor): void {
  const previous = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
  restore.push(() => (previous ? Object.defineProperty(target, key, previous) : delete (target as Record<string, unknown>)[key]));
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  stub(HTMLElement.prototype, 'offsetParent', { get(this: HTMLElement) { return this.parentElement; } });
  stub(HTMLElement.prototype, 'offsetWidth', { get: () => 272 });
  stub(HTMLElement.prototype, 'offsetHeight', { get: () => 340 });
  stub(HTMLElement.prototype, 'getBoundingClientRect', { value: () => VIEW });
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
  restore.forEach((undo) => undo());
});
afterEach(cleanup);

interface Setup {
  store: ViewAtlasStore;
  torch: string;
  lantern: string;
  camera: { x: number; y: number; zoom: number };
  ticks: Set<() => void>;
  pixiApp: { ticker: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } | null };
  frame: () => void;
  popover: () => HTMLElement;
  position: () => { x: number; y: number };
  unmount: () => void;
}

function setup(): Setup {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `light-popover-position-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setSceneLighting({ enabled: true });
  // A candle (bright 5 ft: 70 px) so the popover's place beyond the ring is easy to follow.
  const torch = store.getState().addLight({ x: 300, y: 400, emission: { ...genericLight('candle'), kind: 'candle' } });
  const lantern = store.getState().addLight({ x: 900, y: 400, emission: { ...genericLight('candle'), kind: 'candle' } });
  const camera = { x: 0, y: 0, zoom: 1 };
  const viewport = {
    scale: { get x() { return camera.zoom; } },
    toScreen: (x: number, y: number) => ({ x: x * camera.zoom + camera.x, y: y * camera.zoom + camera.y }),
  };
  const ticks = new Set<() => void>();
  const pixiApp: Setup['pixiApp'] = { ticker: { add: vi.fn((tick: () => void) => ticks.add(tick)), remove: vi.fn((tick: () => void) => ticks.delete(tick)) } };
  const ui: AtlasUIContextValue = {
    app,
    view: null,
    pixiApp: pixiApp as unknown as Application,
    renderer: { getViewportInstance: () => viewport, getCanvasElement: () => document.createElement('canvas') } as never,
  };
  const { unmount } = render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}><LightPopoverHost /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  const popover = (): HTMLElement => screen.getByRole('dialog', { name: 'Light' });
  return {
    store, torch, lantern, camera, ticks, pixiApp, popover, unmount,
    frame: () => act(() => ticks.forEach((tick) => tick())),
    position: () => {
      const [x, y] = popover().style.translate.split(' ').map((value) => Number.parseFloat(value));
      return { x: x!, y: y! };
    },
  };
}

describe('the light popover on the map', () => {
  it('sits beyond the light\'s bright ring when it opens, growing out of the light', () => {
    const { store, torch, popover, position } = setup();
    act(() => store.getState().openLightPopover(torch));
    // 300 + the 70 px ring + a 12 px gap
    expect(position()).toEqual({ x: 382, y: 230 });
    expect(popover().style.transformOrigin).toBe('-82px 170px');
  });

  it('follows the map on its frame clock while it is open, and leaves the clock once it has closed', async () => {
    const { store, torch, camera, ticks, pixiApp, frame, position } = setup();
    expect(ticks.size).toBe(0);
    act(() => store.getState().openLightPopover(torch));
    expect(ticks.size).toBe(1);

    camera.x = -120;
    camera.y = 40;
    frame();
    expect(position()).toEqual({ x: 262, y: 270 });

    camera.zoom = 2;
    frame();
    // The light is at 480, 840 on screen; the ring is 140 px there, and the view ends at 800.
    expect(position().x).toBe(480 + 140 + 12);
    expect(position().y).toBe(800 - 8 - 340);

    act(() => store.getState().closeLightPopover());
    await waitFor(() => expect(ticks.size).toBe(0));
    expect(pixiApp.ticker?.remove).toHaveBeenCalledTimes(1);
  });

  it('follows its light when the light is dragged', () => {
    const { store, torch, frame, position } = setup();
    act(() => store.getState().openLightPopover(torch));
    act(() => store.getState().updateLight(torch, { x: 340, y: 430 }));
    frame();
    expect(position()).toEqual({ x: 422, y: 260 });
  });

  it('stays where it is while its light\'s range is tuned', () => {
    const { store, torch, frame, position } = setup();
    act(() => store.getState().openLightPopover(torch));
    const before = position();
    act(() => store.getState().updateLight(torch, { emission: { ...genericLight('candle'), bright: 30, dim: 40 } }));
    frame();
    expect(position()).toEqual(before);
  });

  it('keeps clear of the handle that turns a beam when it opens, and stays there while the light is turned', () => {
    const { store, frame, position } = setup();
    // A candle shining to the right: its handle is 22 px beyond the 140 px dim arc, where the popover would sit.
    const beam = store.getState().addLight({ x: 600, y: 400, rotation: 90, emission: { ...genericLight('candle'), angle: 90 } });
    act(() => store.getState().openLightPopover(beam));
    expect(position()).toEqual({ x: 600 - 70 - 12 - 272, y: 230 });
    act(() => store.getState().updateLight(beam, { rotation: 265 }));
    frame();
    expect(position()).toEqual({ x: 246, y: 230 });
    // The slider is let go (here: a key on its thumb): the beam now points at the popover, which makes way.
    const direction = screen.getByRole('slider', { name: 'Direction' });
    act(() => direction.focus());
    fireEvent.keyDown(direction, { key: 'ArrowRight' });
    expect(store.getState().objects.lights[beam]!.rotation).toBe(270);
    expect(position()).toEqual({ x: 600 + 70 + 12, y: 230 });
  });

  it('travels to another light that is opened, as the same popover', () => {
    const animate = vi.fn();
    stub(HTMLElement.prototype, 'animate', { value: animate });
    const { store, torch, lantern, ticks, popover, position } = setup();
    act(() => store.getState().openLightPopover(torch));
    const element = popover();
    act(() => store.getState().openLightPopover(lantern));
    expect(popover()).toBe(element);
    // The lantern is right of the middle: the popover goes to its roomier, left side.
    expect(position()).toEqual({ x: 900 - 82 - 272, y: 230 });
    expect(animate).toHaveBeenCalledWith([{ translate: '382px 230px' }, { translate: '546px 230px' }], expect.objectContaining({ duration: 300 }));
    expect(ticks.size).toBe(1);
  });

  it('does not reach for a frame clock the map view has already destroyed', () => {
    const { store, torch, pixiApp, unmount } = setup();
    act(() => store.getState().openLightPopover(torch));
    const destroyed = pixiApp.ticker!;
    // `Application.destroy` takes the ticker off the app; removing a listener from it then throws.
    destroyed.remove.mockImplementation(() => { throw new TypeError("Cannot read properties of null (reading 'next')"); });
    pixiApp.ticker = null;
    expect(() => unmount()).not.toThrow();
    expect(destroyed.remove).not.toHaveBeenCalled();
  });
});
