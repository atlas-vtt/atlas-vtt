import '../setup/obsidianDom';
import { EventEmitter } from 'events';
import { Application, Sprite, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { RenderScheduler } from '../../src/app/pixi/RenderScheduler';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

export interface LitViewOptions {
  preference: 'webgl' | 'canvas';
  /** The DM's pane. */
  pane: { width: number; height: number };
  /** The side of the map, which the camera is centred on at life size. */
  map: number;
  /** Colour of the map's floor. */
  floor?: number;
  /** A square grid of this cell size, drawn unlit by the lighting; none by default. */
  grid?: number;
}

export interface LitView {
  app: Application;
  viewport: Viewport;
  store: ViewAtlasStore;
  controller: LightingController;
  /** Display frames of the DM's window: its ticker runs, and with it the lighting's work and the renders it asks for. */
  displayFrames(count: number): void;
  dispose(): void;
}

/**
 * A map view as far as its lighting goes, on a real renderer: the app with its render schedule,
 * the viewport, the view's store and the real `LightingController` (engine on WebGL, the
 * line-of-sight fallback on PIXI's Canvas renderer). No token renderer: nothing but the map,
 * the grid and the lighting draws.
 */
export async function openLitView({ preference, pane, map, floor = 0x8899aa, grid }: LitViewOptions): Promise<LitView> {
  const app = new Application();
  await app.init({ width: pane.width, height: pane.height, preference, antialias: false, autoStart: false, backgroundColor: 0x101820 });
  const scheduler = new RenderScheduler(app);
  const viewport = new Viewport({ screenWidth: pane.width, screenHeight: pane.height, worldWidth: map, worldHeight: map, events: app.renderer.events });
  viewport.sortableChildren = true;
  const background = new Sprite(Texture.WHITE);
  background.tint = floor;
  background.setSize(map, map);
  viewport.addChild(background);
  app.stage.addChild(viewport);
  viewport.moveCenter(map / 2, map / 2);
  const obsApp = createInMemoryApp().app;
  const store = createViewAtlasStore(obsApp, `lit-view-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/lit.atlasmap');
  const gridSystem = grid ? new GridSystem(app, viewport, background, { size: grid, enabled: true, color: 0x000000 }) : null;
  const controller = new LightingController({
    viewport, app, store, eventBus: new EventEmitter(), obsApp, viewId: 'lit-view',
    bounds: () => ({ width: map, height: map }), albedo: () => null, grid: () => gridSystem,
  });
  const ignore = (): void => undefined;
  controller.wire({
    setLightHandlers: ignore, setWallPointerDownHandler: ignore, setWallContextMenuHandler: ignore, setWallPointerMoveHandler: ignore,
    setWallPointerUpHandler: ignore, setWallDoubleClickHandler: ignore, setWallCursorProvider: ignore, setDoorMenuHandlers: ignore,
    setDoorClickHandler: ignore, setPlayerSightProvider: ignore, refreshPlayerSight: ignore, getSensedOutlineLayer: () => ({ visible: false }),
  } as unknown as TokenRenderer);
  let time = 1000;
  return {
    app, viewport, store, controller,
    displayFrames: (count) => { for (let i = 0; i < count; i++) app.ticker.update(time += 16); },
    dispose: () => {
      controller.destroy();
      gridSystem?.destroy();
      scheduler.destroy();
      app.destroy(true, { children: true });
    },
  };
}
