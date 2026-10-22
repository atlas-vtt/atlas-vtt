// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Container, EventSystem, Graphics, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { genericLight } from '../mocks/lights';
import type { LightMarkerTheme } from '../../src/app/pixi/lighting/lightMarker';
import { LightMarkers, lightMarkersShown } from '../../src/app/pixi/lighting/LightMarkers';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { LightKind } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const THEME: LightMarkerTheme = { background: 0x2a2a2a, stroke: 0xffffff, accent: 0x8a5cf5 };
let cleanup: (() => void) | null = null;

function setup(readTheme: () => LightMarkerTheme = () => THEME): { markers: LightMarkers; store: ViewAtlasStore; viewport: Viewport } {
  const restoreGraphics = stubJsdomGraphics();
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `light-markers-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/lights.atlasmap');
  const markers = new LightMarkers(viewport, store, readTheme);
  cleanup = () => {
    markers.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  return { markers, store, viewport };
}

function addLight(store: ViewAtlasStore, x: number, y: number, kind: LightKind = 'torch', hidden?: boolean): string {
  const emission = kind === 'custom' ? { ...genericLight('torch'), kind } : { ...genericLight(kind), kind };
  return store.getState().addLight({ x, y, emission, ...(hidden ? { hidden } : {}) });
}

/** A marker's badge, glyph and how often its badge strokes a ring. */
function parts(marker: Container): { badge: Graphics; glyph: Sprite; rings: number } {
  const [badge, glyph] = marker.children as [Graphics, Sprite];
  return { badge, glyph, rings: badge.context.instructions.filter((instruction) => instruction.action === 'stroke').length };
}

describe('lightMarkersShown', () => {
  it('shows markers in a lit scene, and with the lighting tool in any scene', () => {
    expect(lightMarkersShown({ lighting: { enabled: true, ambient: 0 }, activeTool: 'select' })).toBe(true);
    expect(lightMarkersShown({ lighting: { enabled: false, ambient: 0 }, activeTool: 'select' })).toBe(false);
    expect(lightMarkersShown({ lighting: { enabled: true, ambient: 0 }, activeTool: 'wall' })).toBe(true);
    expect(lightMarkersShown({ lighting: { enabled: false, ambient: 0 }, activeTool: 'wall' })).toBe(true);
  });
});

describe('LightMarkers', () => {
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('draws nothing while the scene has no lighting and the lighting tool is not in use', () => {
    const { markers, store } = setup();
    addLight(store, 100, 200);
    expect(markers.view.visible).toBe(false);
    expect(markers.view.children).toHaveLength(0);
    expect(markers.hitTest(100, 200)).toBeNull();
  });

  it('marks every placed light once the scene is lit: a badge with the glyph of its kind', () => {
    const { markers, store, viewport } = setup();
    addLight(store, 100, 200, 'torch');
    addLight(store, 300, 200, 'lantern');
    store.getState().setSceneLighting({ enabled: true });
    expect(markers.view.parent).toBe(viewport);
    expect(markers.view.visible).toBe(true);
    expect(markers.view.children).toHaveLength(2);
    expect(markers.view.children[0]!.position).toMatchObject({ x: 100, y: 200 });
    const torch = parts(markers.view.children[0]!);
    const lantern = parts(markers.view.children[1]!);
    expect(torch.glyph.texture).not.toBe(lantern.glyph.texture);
    expect(torch.glyph.tint).toBe(0xff9a3c);
    expect(lantern.glyph.tint).toBe(0xffd28a);
  });

  it('is the lighting tool\'s marker too, in a scene without lighting', () => {
    const { markers, store } = setup();
    addLight(store, 100, 200);
    store.getState().setActiveTool('wall');
    expect(markers.view.visible).toBe(true);
    expect(markers.hitTest(104, 203)).not.toBeNull();
    store.getState().setActiveTool('select');
    expect(markers.view.visible).toBe(false);
  });

  it('hides while the canvas shows the players\' view, and is not hit there', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    markers.setSuppressed(true);
    const id = addLight(store, 100, 200);
    expect(markers.view.visible).toBe(false);
    expect(markers.hitTest(100, 200)).toBeNull();
    markers.setSuppressed(false);
    expect(markers.view.visible).toBe(true);
    expect(markers.view.children).toHaveLength(1);
    expect(markers.hitTest(100, 200)).toBe(id);
  });

  it('moves a marker in place and drops the markers of deleted lights', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const id = addLight(store, 100, 200);
    const marker = markers.view.children[0]!;
    const { badge } = parts(marker);
    const drawn = badge.context.instructions.length;
    store.getState().updateLight(id, { x: 300, y: 50 });
    expect(markers.view.children[0]).toBe(marker);
    expect(marker.position).toMatchObject({ x: 300, y: 50 });
    expect(badge.context.instructions).toHaveLength(drawn);
    store.getState().deleteLight(id);
    expect(markers.view.children).toHaveLength(0);
    expect(marker.destroyed).toBe(true);
  });

  it('follows the light\'s kind and colour', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const id = addLight(store, 100, 200, 'torch');
    const { glyph } = parts(markers.view.children[0]!);
    const torch = glyph.texture;
    store.getState().updateLight(id, { emission: { ...genericLight('magical'), kind: 'magical' } });
    expect(glyph.texture).not.toBe(torch);
    expect(glyph.tint).toBe(0x8fb8ff);
  });

  it('shows a light whose stored kind this version does not know as the preset it equals, else as custom', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    addLight(store, 100, 200, 'lantern');
    addLight(store, 200, 200, 'custom');
    const unknown = 'brazier' as LightKind;
    store.getState().addLight({ x: 300, y: 200, emission: { ...genericLight('lantern'), kind: unknown } });
    store.getState().addLight({ x: 400, y: 200, emission: { ...genericLight('lantern'), bright: 12, kind: unknown } });
    const [lantern, custom, equalsLantern, edited] = markers.view.children.map((marker) => parts(marker).glyph);
    expect(equalsLantern!.texture).toBe(lantern!.texture);
    expect(edited!.texture).toBe(custom!.texture);
  });

  it('redraws every badge when the theme changes, also one whose glyph keeps its colour', async () => {
    let theme = THEME;
    const { markers, store } = setup(() => theme);
    store.getState().setSceneLighting({ enabled: true });
    addLight(store, 100, 200);
    const fill = (): unknown => {
      const { badge } = parts(markers.view.children[0]!);
      const instruction = badge.context.instructions.find((entry) => entry.action === 'fill') as { data: { style: { color: number } } };
      return instruction.data.style.color;
    };
    expect(fill()).toBe(0x2a2a2a);
    const tint = parts(markers.view.children[0]!).glyph.tint;

    theme = { ...THEME, background: 0x1e1e1e };
    document.body.classList.toggle('theme-light');
    await vi.waitFor(() => expect(fill()).toBe(0x1e1e1e));
    expect(parts(markers.view.children[0]!).glyph.tint).toBe(tint);
    document.body.classList.remove('theme-light');
  });

  it('takes a theme that changed while the markers were hidden once they show again', async () => {
    let theme = THEME;
    const { markers, store } = setup(() => theme);
    store.getState().setSceneLighting({ enabled: true });
    addLight(store, 100, 200);
    markers.setSuppressed(true);
    theme = { ...THEME, background: 0x1e1e1e };
    document.body.classList.toggle('theme-light');
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.body.classList.remove('theme-light');
    markers.setSuppressed(false);
    const { badge } = parts(markers.view.children[0]!);
    const instruction = badge.context.instructions.find((entry) => entry.action === 'fill') as { data: { style: { color: number } } };
    expect(instruction.data.style.color).toBe(0x1e1e1e);
  });

  it('dims a switched-off light', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const id = addLight(store, 100, 200, 'torch', true);
    const { glyph } = parts(markers.view.children[0]!);
    expect(glyph.alpha).toBeLessThan(0.5);
    expect(glyph.tint).toBe(THEME.stroke);
    store.getState().updateLight(id, { hidden: false });
    expect(glyph.alpha).toBe(1);
    expect(glyph.tint).toBe(0xff9a3c);
  });

  it('dims a light that follows the ambient light while the scene is too bright for it, and wakes it when the scene darkens', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true, ambient: 1 });
    const id = addLight(store, 100, 200);
    const { glyph, badge } = parts(markers.view.children[0]!);
    const fills = (): number => badge.context.instructions.filter((instruction) => instruction.action === 'fill').length;
    const plain = fills();
    store.getState().updateLight(id, { activeBelowAmbient: 0.5 });
    expect(glyph.alpha).toBeLessThan(0.5);
    // The moon: a disc on the badge's edge with a crescent in it.
    expect(fills()).toBeGreaterThan(plain);
    store.getState().setSceneLighting({ ambient: 0.15 });
    expect(glyph.alpha).toBe(1);
    expect(fills()).toBeGreaterThan(plain);
  });

  it('goes by the ambient light where the light stands: a lamp in a dark zone shines by day, and follows the zone as it changes', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true, ambient: 1 });
    const id = addLight(store, 100, 200);
    store.getState().updateLight(id, { activeBelowAmbient: 0.5 });
    const { glyph } = parts(markers.view.children[0]!);
    expect(glyph.alpha).toBeLessThan(0.5);
    // A cave around the lamp: dark while the sun shines outside.
    const cave = store.getState().addLightZone({ polygon: [{ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 300 }, { x: 0, y: 300 }], ambient: 0 });
    expect(glyph.alpha).toBe(1);
    store.getState().updateLightZone(cave, { ambient: 0.8 });
    expect(glyph.alpha).toBeLessThan(0.5);
    store.getState().updateLightZone(cave, { ambient: 0.2 });
    expect(glyph.alpha).toBe(1);
    // Moved off the lamp, the zone no longer counts for it.
    store.getState().updateLightZone(cave, { polygon: [{ x: 500, y: 100 }, { x: 700, y: 100 }, { x: 700, y: 300 }, { x: 500, y: 300 }] });
    expect(glyph.alpha).toBeLessThan(0.5);
    store.getState().updateLightZone(cave, { polygon: [{ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 300 }, { x: 0, y: 300 }] });
    store.getState().deleteLightZone(cave);
    expect(glyph.alpha).toBeLessThan(0.5);
  });

  it('rings a selected light and the light whose popover is open in the accent', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const a = addLight(store, 100, 200);
    const b = addLight(store, 300, 200);
    const rest = parts(markers.view.children[0]!).rings;
    markers.setSelected([a]);
    expect(parts(markers.view.children[0]!).rings).toBe(rest + 1);
    expect(parts(markers.view.children[1]!).rings).toBe(rest);
    store.getState().openLightPopover(b);
    expect(parts(markers.view.children[1]!).rings).toBe(rest + 1);
    markers.setSelected([]);
    store.getState().closeLightPopover();
    expect(parts(markers.view.children[0]!).rings).toBe(rest);
    expect(parts(markers.view.children[1]!).rings).toBe(rest);
  });

  it('keeps the same size on screen at any zoom, and is hit at that size', () => {
    const { markers, store, viewport } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const id = addLight(store, 100, 200);
    viewport.scale.set(2);
    viewport.emit('zoomed', { viewport, type: 'wheel' });
    expect(markers.view.children[0]!.scale.x).toBeCloseTo(0.5);
    expect(markers.hitTest(107, 200)).toBe(id);
    expect(markers.hitTest(109, 200)).toBeNull();
    // A light added later takes the current zoom's size.
    addLight(store, 300, 200);
    expect(markers.view.children[1]!.scale.x).toBeCloseTo(0.5);
  });

  it('lifts the hovered and the dragged marker', () => {
    const { markers, store } = setup();
    store.getState().setSceneLighting({ enabled: true });
    const id = addLight(store, 100, 200);
    const marker = markers.view.children[0]!;
    window.matchMedia = (() => ({ matches: true })) as never;
    markers.setHovered(id);
    const hovered = marker.scale.x;
    expect(hovered).toBeGreaterThan(1);
    markers.setDragging(id);
    expect(marker.scale.x).toBeGreaterThan(hovered);
    markers.setDragging(null);
    markers.setHovered(null);
    expect(marker.scale.x).toBe(1);
  });
});
