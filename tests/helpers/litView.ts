import '../setup/obsidianDom';
import { EventEmitter } from 'events';
import { Application, Sprite, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { mapImageViewOf } from './fakeMapImageView';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { RenderScheduler } from '../../src/app/pixi/RenderScheduler';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { DEFAULT_LIGHTING_QUALITY, type LightingQuality } from '../../src/app/lighting/lightingQuality';

export interface LitViewOptions {
  /** The DM's pane. */
  pane: { width: number; height: number };
  /** The side of the map, which the camera is centred on at life size. */
  map: number;
  /** Colour of the map's floor. */
  floor?: number;
  /** A square grid of this cell size, drawn unlit by the lighting; none by default. */
  grid?: number;
  /** How much the lighting may ask of the graphics device; Atlas's full quality without one. */
  quality?: LightingQuality;
  /** Device pixels per point of the renderer; 1 by default. */
  resolution?: number;
}

export interface LitView {
  app: Application;
  viewport: Viewport;
  store: ViewAtlasStore;
  controller: LightingController;
  /** Switches the lighting to another quality, as a graphics tier change does. */
  setQuality(quality: LightingQuality): void;
  /** Display frames of the DM's window: its ticker runs, and with it the lighting's work and the renders it asks for. */
  displayFrames(count: number): void;
  dispose(): void;
}

/**
 * A map view as far as its lighting goes, on a real renderer: the app with its render schedule,
 * the viewport, the view's store and the real `LightingController`. No token renderer: nothing but the map,
 * the grid and the lighting draws.
 */
export async function openLitView({ pane, map, floor = 0x8899aa, grid, quality, resolution = 1 }: LitViewOptions): Promise<LitView> {
  const app = new Application();
  await app.init({ width: pane.width, height: pane.height, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x101820, resolution });
  const scheduler = new RenderScheduler(app);
  const viewport = new Viewport({ screenWidth: pane.width, screenHeight: pane.height, worldWidth: map, worldHeight: map, events: app.renderer.events });
  viewport.sortableChildren = true;
  const background = new Sprite(Texture.WHITE);
  background.tint = floor;
  background.setSize(map, map);
  viewport.addChild(background);
  app.stage.addChild(viewport);
  viewport.moveCenter(map / 2, map / 2);
  let current = quality ?? DEFAULT_LIGHTING_QUALITY;
  const qualityListeners = new Set<() => void>();
  const obsApp = createInMemoryApp().app;
  const store = createViewAtlasStore(obsApp, `lit-view-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/lit.atlasmap');
  const gridSystem = grid ? new GridSystem(app, viewport, mapImageViewOf(background), { size: grid, enabled: true, color: 0x000000 }) : null;
  const controller = new LightingController({
    viewport, app, store, eventBus: new EventEmitter(), obsApp, viewId: 'lit-view',
    bounds: () => ({ width: map, height: map }), albedo: () => null, grid: () => gridSystem,
    quality: { current: () => current, onChange: (listener) => { qualityListeners.add(listener); return () => qualityListeners.delete(listener); } },
  });
  const ignore = (): void => undefined;
  controller.wire({
    setLightHandlers: ignore, setWallPointerDownHandler: ignore, setWallContextMenuHandler: ignore, setWallPointerMoveHandler: ignore,
    setWallPointerUpHandler: ignore, setWallDoubleClickHandler: ignore, setWallCursorProvider: ignore, setDoorMenuHandlers: ignore,
    setDoorClickHandler: ignore, setPlayerSightProvider: ignore, setGlideWay: ignore, setArtFloors: ignore, refreshPlayerSight: ignore, getSensedOutlineLayer: () => ({ visible: false }),
  } as unknown as TokenRenderer);
  let time = 1000;
  return {
    app, viewport, store, controller,
    setQuality: (next) => {
      current = next;
      for (const listener of qualityListeners) listener();
    },
    displayFrames: (count) => { for (let i = 0; i < count; i++) app.ticker.update(time += 16); },
    dispose: () => {
      controller.destroy();
      gridSystem?.destroy();
      scheduler.destroy();
      app.destroy(true, { children: true });
    },
  };
}
