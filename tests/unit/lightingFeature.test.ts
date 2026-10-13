// The harness first: it mocks what the controller imports.
import { sceneLightingDeps, setup } from './lightingControllerHarness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from 'pixi.js';
import { LightingFeature } from '../../src/app/pixi/lighting/LightingFeature';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LIGHTING_QUALITY } from '../../src/app/lighting/lightingQuality';

/** A view's lighting feature on the harness' scene, with the token renderer it is wired to. */
async function feature(on: boolean): Promise<{ lighting: LightingFeature; settings: SettingsService; tokens: Record<string, ReturnType<typeof vi.fn>> } & Pick<ReturnType<typeof setup>, 'store' | 'viewport'>> {
  const { store, obsApp, eventBus, viewport } = setup();
  const settings = new SettingsService(obsApp);
  await settings.initialize();
  settings.setExperimental('dynamicLighting', on);
  const lighting = new LightingFeature({
    viewport, app: { canvas: viewport.options.events.domElement } as unknown as Application, store, eventBus, obsApp, viewId: 'feature-view',
    bounds: () => ({ width: 1000, height: 1000 }), albedo: () => null,
  });
  const tokens = new Proxy<Record<string, ReturnType<typeof vi.fn>>>({}, {
    get: (spies, name: string) => (spies[name] ??= vi.fn(name === 'getSensedOutlineLayer' ? () => ({ visible: false }) : undefined)),
  });
  lighting.wire(tokens as unknown as TokenRenderer);
  destroy = () => lighting.destroy();
  return { lighting, settings, tokens, store, viewport };
}

let destroy: (() => void) | null = null;
// A switched feature schedules a save; the tests end before it runs.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  destroy?.();
  destroy = null;
  vi.useRealTimers();
});

describe('a map view\'s lighting', () => {
  it('is not there while dynamic lighting is off', async () => {
    const { lighting, tokens } = await feature(false);
    expect(lighting.controller).toBeUndefined();
    expect(tokens.setLightHandlers).not.toHaveBeenCalled();
  });

  it('lights at the quality chosen on this device, and hears when it changes', async () => {
    const { settings } = await feature(true);
    const quality = sceneLightingDeps.last!.quality!;
    expect(quality.current()).toBe(LIGHTING_QUALITY.high);
    const listener = vi.fn();
    const unsubscribe = quality.onChange(listener);
    settings.setLightingQuality('saver');
    expect(listener).toHaveBeenCalledOnce();
    expect(quality.current()).toBe(LIGHTING_QUALITY.saver);
    unsubscribe();
  });

  it('is built on the open map when the GM switches the feature on, and takes the pointer', async () => {
    const { lighting, settings, tokens, viewport } = await feature(false);
    const before = viewport.children.length;
    settings.setExperimental('dynamicLighting', true);
    expect(lighting.controller).toBeDefined();
    expect(viewport.children.length).toBeGreaterThan(before);
    expect(tokens.setLightHandlers).toHaveBeenCalledOnce();
    expect(tokens.setWallPointerDownHandler).toHaveBeenCalledOnce();
  });

  it('is taken off the open map when the GM switches the feature off: nothing of it stays on the canvas', async () => {
    const { lighting, settings, tokens, viewport, store } = await feature(false);
    const before = viewport.children.length;
    settings.setExperimental('dynamicLighting', true);
    const { renderer } = lighting.controller!;
    store.getState().openLightPopover(Object.keys(store.getState().objects.lights)[0]!);
    store.getState().setSceneLightingPanelOpen(true);

    settings.setExperimental('dynamicLighting', false);
    expect(lighting.controller).toBeUndefined();
    expect(viewport.children.length).toBe(before);
    expect(renderer.beforeMapUnload).toHaveBeenCalledOnce();
    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(tokens.clearLighting).toHaveBeenCalledOnce();
    expect(store.getState().lightPopover).toBeNull();
    expect(store.getState().isSceneLightingPanelOpen).toBe(false);
  });

  it('keeps the scene\'s walls, lights and lighting settings while it is off', async () => {
    const { settings, store } = await feature(true);
    const { lights, walls } = store.getState().objects;
    settings.setExperimental('dynamicLighting', false);
    expect(store.getState().objects.lights).toBe(lights);
    expect(store.getState().objects.walls).toBe(walls);
    expect(store.getState().lighting.enabled).toBe(true);
  });

  it('gives the lighting tool up for the move tool while it is off', async () => {
    const { settings, store } = await feature(true);
    store.getState().setActiveTool('wall');
    expect(store.getState().activeTool).toBe('wall');
    settings.setExperimental('dynamicLighting', false);
    expect(store.getState().activeTool).toBe('move');
    store.getState().setActiveTool('wall');
    expect(store.getState().activeTool).toBe('move');
    store.getState().setActiveTool('fog');
    expect(store.getState().activeTool).toBe('fog');
  });

  it('follows other settings changes without building anything anew', async () => {
    const { lighting, settings } = await feature(true);
    const { controller } = lighting;
    settings.setDiceDisplay('card');
    expect(lighting.controller).toBe(controller);
  });
});
