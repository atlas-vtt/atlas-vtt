import { Container, Sprite, Texture, type Application } from 'pixi.js';
import type { App } from 'obsidian';
import { vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { PixiAppManager } from '../../src/app/pixi/PixiAppManager';
import type { MosaicCanvas } from '../../src/app/pixi/mosaicCanvas/MosaicCanvas';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeMapImageView } from './fakeMapImageView';

export interface MapViewOptions {
  /** The side of the pane and of the square map. */
  size: number;
  /** The colour of the map's floor. */
  floor: number;
  /** The side of the grid's cells; the grid itself is not drawn. */
  cell?: number;
}

/** A map view as Atlas builds it, with a scene loaded: its renderer, store and bus, and Atlas' settings. */
export interface MapView {
  view: PixiRendererOrchestrator;
  app: Application;
  store: ViewAtlasStore;
  events: EventEmitter;
  settings: SettingsService;
  obsidian: App;
  /** Takes the view down, its pane with it. */
  destroy(): void;
}

/**
 * Opens a map view the way the map view's renderer service does (`PixiRendererOrchestrator` with
 * its own `PixiAppManager`, on a real renderer in a pane of the page) and loads a scene whose map
 * image is a floor of one colour: what is drawn over the map is the view's own.
 */
export async function openMapView({ size, floor, cell = 40 }: MapViewOptions): Promise<MapView> {
  vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }));
  const pane = document.createElement('div');
  Object.assign(pane.style, { position: 'absolute', left: '0', top: '0', width: `${size}px`, height: `${size}px` });
  document.body.appendChild(pane);
  const obsidian = createInMemoryApp().app;
  const settings = new SettingsService(obsidian);
  const store = createViewAtlasStore(obsidian, `map-view-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const events = new EventEmitter();
  const manager = new PixiAppManager(size, size);
  const view = new PixiRendererOrchestrator(obsidian, manager, events, store, 'map-view');
  await view.init(pane);
  manager.getViewport()!.moveCenter(size / 2, size / 2);
  const sprite = new Sprite(Texture.WHITE);
  sprite.tint = floor;
  sprite.setSize(size, size);
  const layer = new Container({ label: 'map-image' });
  layer.addChild(sprite);
  const restore = (): (() => void) => () => undefined;
  const image = Object.assign(fakeMapImageView(size, size, { layer }), {
    mapStretch: { x: 1, y: 1, rotation: 0 },
    load: () => Promise.resolve(),
    setStretch: () => undefined,
    setVideoMode: () => undefined,
    drawFor: restore,
    hideVideoFor: restore,
    addDemandRegion: restore,
    albedoTexture: () => null,
    clear: () => undefined,
    destroy: () => undefined,
  });
  store.setState({ mapPath: 'maps/view.atlasmap', isMapLoading: false, mapLoaded: true, isGMView: true });
  view.initGrid({ size: cell, enabled: false, color: 0xffffff }, image as unknown as MosaicCanvas);
  return {
    view, app: manager.getApp(), store, events, settings, obsidian,
    destroy: () => {
      view.destroy();
      pane.remove();
      vi.unstubAllGlobals();
    },
  };
}
