import { EventEmitter } from 'events';
import { Application, CanvasSource, Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { imageWorldRect, NO_STRETCH, sameStretch, turnedBox, type MapStretch } from '../../src/app/grid/mapStretch';
import type { ArtAlpha, LevelArt } from '../../src/app/levels/artRaster';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { RenderScheduler } from '../../src/app/pixi/RenderScheduler';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import type { BelowMapImage } from '../../src/app/pixi/lighting/levels/BelowLevel';
import type { BelowLevelsHost } from '../../src/app/pixi/lighting/levels/LevelsBelow';
import type { TokenArt } from '../../src/app/pixi/lighting/levels/BelowTokens';
import type { FogCover } from '../../src/app/vision/throughSight';
import type { App } from 'obsidian';
import type { LightingQuality, LightingQualitySource } from '../../src/app/lighting/lightingQuality';
import type { MapBounds } from '../../src/app/vision/visibility';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { roofPieces } from '../../src/app/levels/roofs';
import type { RoofImageRead } from '../../src/app/pixi/lighting/levels/Roof';
import { ViewRoofs } from '../../src/app/pixi/roofs/ViewRoofs';

/** The scene's two floors: the view looks at the upper one and down into the ground floor. */
export const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'ground.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'upper.png' },
];

/** A canvas texture of `width` × `height` px, every pixel coloured by `paint`. */
export function paintedTexture(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Texture {
  return paintedRgbaTexture(width, height, (x, y) => [...paint(x, y), 255]);
}

/** A canvas texture of `width` × `height` px, every pixel coloured and made as opaque as `paint` says (straight alpha). */
export function paintedRgbaTexture(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      image.data.set(paint(x, y), o);
    }
  }
  context.putImageData(image, 0, 0);
  return new Texture({ source: new CanvasSource({ resource: canvas }) });
}

/** A map image of the fake vault: its picture, its size in pixels, and which pixels of it hold art (unset: all). */
export interface FakeMap {
  texture: Texture;
  width: number;
  height: number;
  alpha?: ArtAlpha | null;
  /** The alpha of every pixel, row by row, where the map is a roof: its pieces are worked out from it as the tile worker does. */
  roofAlpha?: Uint8Array;
}

/** Every pixel holds art. */
export const SOLID_ALPHA: ArtAlpha = { width: 1, height: 1, opaque: new Uint8Array([1]) };

/** A map as the level stack reads it from the fake vault. */
export function fakeLevelArt(map: FakeMap): LevelArt {
  return { width: map.width, height: map.height, alpha: map.alpha === undefined ? SOLID_ALPHA : map.alpha };
}

/**
 * A map image that shows the fake vault's map of the background it loads, placed as `MapImage`
 * places it (turned about its centre, stretched and moved by its placement): no tiles to wait for,
 * and a load that finishes at once, or when `loaded` resolves.
 */
export function fakeMapImage(maps: Record<string, FakeMap>, loaded: Promise<void> = Promise.resolve(), label = 'map-image-below'): BelowMapImage {
  const layer = new Container({ label });
  const turned = new Container();
  const sprite = new Sprite(Texture.EMPTY);
  turned.addChild(sprite);
  layer.addChild(turned);
  let shown: FakeMap | null = null;
  let stretch: MapStretch = NO_STRETCH;
  let destroyed = false;
  const place = (): void => {
    if (!shown || destroyed) return;
    const { width, height } = shown;
    const { corner } = turnedBox(width, height, stretch);
    sprite.texture = shown.texture;
    sprite.setSize(width, height);
    turned.pivot.set(width / 2, height / 2);
    turned.position.set(width / 2 - corner.x, height / 2 - corner.y);
    turned.rotation = (-(stretch.rotation ?? 0) * Math.PI) / 180;
    layer.position.set(stretch.offset?.x ?? 0, stretch.offset?.y ?? 0);
    layer.scale.set(stretch.x, stretch.y);
  };
  return {
    layer,
    get worldRect() { return shown ? { x: 0, y: 0, ...imageWorldRect(shown, stretch) } : null; },
    get imageSize() { return shown ? { width: shown.width, height: shown.height } : null; },
    get mapStretch() { return stretch; },
    load: async (background, _gridSize, placement) => {
      await loaded;
      shown = background === null ? null : maps[background] ?? null;
      if (placement) stretch = placement;
      place();
    },
    setStretch: (next) => {
      if (sameStretch(next, stretch)) return;
      stretch = next;
      place();
    },
    drawFor: () => () => undefined,
    addDemandRegion: () => () => undefined,
    destroy: () => {
      destroyed = true;
      layer.destroy({ children: true });
    },
  };
}

export interface LevelsViewOptions {
  /** The map's side in world pixels, the view's and the level below's alike. */
  map: number;
  /** The canvas' side in points (its width, where `paneHeight` is given). */
  pane: number;
  paneHeight?: number;
  resolution?: number;
  /** What the viewed level's map and the level below's look like; a white floor above and a magenta noise below by default. */
  viewed?: Texture;
  below?: Texture;
  /** The art of every token below; a cyan disc by default. */
  tokenArt?: Texture;
  /** The committed fog of the viewed level. */
  viewedFog?: () => FogCover;
  /** The lighting quality the view is lit at; the default one without it. */
  quality?: LightingQuality;
  /** Where the view reads its lighting quality, when it changes during the test (instead of `quality`). */
  qualitySource?: LightingQualitySource;
  /** The level below's map, where it is not the whole map (a level fitted elsewhere, smaller than the view's). */
  belowRect?: MapBounds;
  /** The level below's image loads only once `releaseBelowImage` is called. */
  holdBelowImage?: boolean;
  /** The scene's levels, bottom first; the upper one of `LEVELS` is viewed. */
  levels?: SceneLevel[];
  /** The fake vault's maps by path, over the ones `viewed`, `below` and `belowRect` make (`upper.png` and `ground.png`). */
  maps?: Record<string, FakeMap>;
  /** The level the view shows, and how its map is drawn; the store must place it alike. */
  viewedLevel?: string;
  viewedPlacement?: MapStretch;
  /** The viewed level's roof is drawn (`ViewRoofs`) from its `foreground`, its pieces fading at once. */
  roofs?: boolean;
}

export interface LevelsView {
  app: Application;
  obsApp: App;
  viewport: Viewport;
  store: ViewAtlasStore;
  controller: LightingController;
  /** The viewed level's roof, where the view was opened with `roofs`. */
  roofs: ViewRoofs | null;
  /** Runs `count` display frames: the lighting's work and the renders it asks for. */
  displayFrames(count: number): void;
  /** Lets what loads on its own come in (a level's map image, a decoded memory), then runs a few display frames. */
  settle(): Promise<void>;
  /**
   * The players' frame of the canvas' size through camera (`scale`, `x`, `y`), as the player
   * window's is drawn (`withPlayerSafeFrame`): players' layers, the levels below prepared for it,
   * one render into a texture, read back top row first.
   */
  playerFrame(scale: number, x: number, y: number): Uint8ClampedArray;
  /**
   * `playerFrame` once two in a row are the same: some passes finish over a few display frames
   * after a change (a program compiled anew, the bounce), and a picture compared with another must
   * not depend on the clock.
   */
  settledPlayerFrame(scale: number, x: number, y: number): Promise<Uint8ClampedArray>;
  /** Lets the level below's image finish loading, where it was held (`holdBelowImage`). */
  releaseBelowImage(): void;
  /** The fake vault's maps by path: a test may add maps (another scene's) at any time. */
  maps: Record<string, FakeMap>;
  /** Shows map `background` on the viewed level, placed by `placement` (as the store must place it), and lets the lighting follow its size. */
  showViewedMap(background: string, placement: MapStretch): Promise<void>;
  /** The GM's canvas through the camera, drawn as the render scheduler draws it, read back. */
  gmCanvas(scale: number, x: number, y: number): Uint8ClampedArray;
  dispose(): void;
}

/** Magenta noise: the level below's own hue, which nothing of the viewed level ever has. */
export function belowNoise(map: number): Texture {
  return paintedTexture(map, map, (x, y) => {
    const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const v = 140 + (n % 100);
    return [v, 30 + (n % 20), v];
  });
}

/**
 * A map view of the upper floor with its real `LightingController` (engine, levels below, eraser)
 * on a real renderer, as far as its lighting and its levels below go. The map images are
 * sprites, the tokens below take one art: nothing loads from the vault.
 */
export async function openLevelsView({ map, pane, paneHeight = pane, resolution = 1, viewed, below, tokenArt, viewedFog, quality, qualitySource, belowRect, holdBelowImage = false, levels = LEVELS, maps: extraMaps = {}, viewedLevel = 'upper', viewedPlacement = NO_STRETCH, roofs: withRoofs = false }: LevelsViewOptions): Promise<LevelsView> {
  const app = new Application();
  await app.init({ width: pane, height: paneHeight, resolution, preference: 'webgl', antialias: false, autoStart: false, backgroundColor: 0x000000, useBackBuffer: true });
  const scheduler = new RenderScheduler(app);
  const viewport = new Viewport({ screenWidth: pane, screenHeight: paneHeight, worldWidth: map, worldHeight: map, events: app.renderer.events });
  viewport.sortableChildren = true;
  const maps: Record<string, FakeMap> = {
    'upper.png': { texture: viewed ?? Texture.WHITE, width: map, height: map },
    'ground.png': { texture: below ?? belowNoise(map), width: belowRect?.width ?? map, height: belowRect?.height ?? map },
    ...extraMaps,
  };
  const viewedBackground = levels.find((level) => level.id === viewedLevel)?.background ?? 'upper.png';
  const floorImage = fakeMapImage(maps, Promise.resolve(), 'map-image');
  await floorImage.load(viewedBackground, undefined, viewedPlacement);
  const floor = floorImage.layer;
  viewport.addChild(floor);

  app.stage.addChild(viewport);
  const obsApp = createInMemoryApp().app;
  const store = createViewAtlasStore(obsApp, `levels-view-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/levels.atlasmap');
  // The first level's map is the scene's own.
  store.setState({ background: levels[0]?.background ?? null });
  const art = tokenArt ?? Texture.WHITE;
  const tokens: TokenArt = { acquire: () => Promise.resolve(art), release: () => undefined, destroyAll: () => undefined };
  let releaseBelowImage = (): void => undefined;
  const belowLoaded = holdBelowImage ? new Promise<void>((resolve) => { releaseBelowImage = resolve; }) : Promise.resolve();
  const readRoof = (path: string): Promise<RoofImageRead> => {
    const found = maps[path];
    if (!found?.roofAlpha) return Promise.reject(new Error(`No roof ${path} in the fake vault`));
    return Promise.resolve({ width: found.width, height: found.height, pieces: roofPieces(found.roofAlpha, found.width, found.height) });
  };
  let roofs: ViewRoofs | null = null;
  const host: BelowLevelsHost = {
    createMapImage: () => fakeMapImage(maps, belowLoaded),
    readRoof,
    viewedRoof: () => {
      const shown = roofs;
      return shown ? (point) => shown.covers(point) : null;
    },
    createArt: () => tokens,
    levelArt: (background) => {
      const found = background === null ? undefined : maps[background];
      return found ? Promise.resolve(fakeLevelArt(found)) : Promise.reject(new Error(`No map ${String(background)} in the fake vault`));
    },
    viewedFog: viewedFog ?? ((): FogCover => undefined),
    placeEraser: (eraser) => viewport.addChildAt(eraser, viewport.getChildIndex(floor) + 1),
  };
  const bounds = (): MapBounds => {
    const rect = floorImage.worldRect!;
    return { width: rect.width, height: rect.height };
  };
  // The controller is made after the roof, which reads its lighting.
  const made: { controller?: LightingController } = {};
  roofs = withRoofs ? new ViewRoofs({
    app, viewport, store, obsApp, mapSize: () => floorImage.imageSize, bounds, lighting: () => made.controller?.renderer,
    host: { createMapImage: () => fakeMapImage(maps, Promise.resolve(), 'roof-image'), readRoof }, fadeMs: 0,
  }) : null;
  const controller = new LightingController({
    viewport, app, store, eventBus: new EventEmitter(), obsApp, viewId: 'levels-view',
    bounds, albedo: () => null, below: host, roofFadeMs: 0, ...(roofs && { roofs }),
    ...(quality && { quality: { current: () => quality, onChange: () => () => undefined } }),
    ...(qualitySource && { quality: qualitySource }),
  });
  made.controller = controller;
  const ignore = (): void => undefined;
  controller.wire({
    setLightHandlers: ignore, setWallPointerDownHandler: ignore, setWallContextMenuHandler: ignore, setWallPointerMoveHandler: ignore,
    setWallPointerUpHandler: ignore, setWallDoubleClickHandler: ignore, setWallCursorProvider: ignore, setDoorMenuHandlers: ignore,
    setDoorClickHandler: ignore, setPlayerSightProvider: ignore, setGlideWay: ignore, setArtFloors: ignore, refreshPlayerSight: ignore, getSensedOutlineLayer: () => ({ visible: false }),
  } as unknown as TokenRenderer);
  let time = 1000;
  const renderer = app.renderer as WebGLRenderer;
  // The view `settledPlayerFrame` renders with: the one returned.
  let view!: LevelsView;
  const target = RenderTexture.create({ width: pane, height: paneHeight, resolution });
  const place = (scale: number, x: number, y: number): void => {
    viewport.scale.set(scale);
    viewport.position.set(x, y);
  };
  view = {
    app, obsApp, viewport, store, controller, roofs, maps,
    releaseBelowImage: () => releaseBelowImage(),
    showViewedMap: async (background, placement) => {
      await floorImage.load(background, undefined, placement);
      controller.renderer.refreshBounds();
    },
    displayFrames: (count) => { for (let i = 0; i < count; i++) app.ticker.update(time += 16); },
    settle: async () => {
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (let frame = 0; frame < 2; frame++) app.ticker.update(time += 16);
      }
    },
    playerFrame: (scale, x, y) => {
      place(scale, x, y);
      // The bounce still to build after a change belongs in the picture, which would otherwise depend on the clock.
      controller.renderer.renderForFrame({ x: 0, y: 0, resolution }, () => undefined);
      // The players' layers, as the player window's frame applies them: the players' view, no GM overlays.
      const layers = controller.playerLayers();
      const before = layers.map(({ layer }) => layer.visible);
      for (const { layer, visible } of layers) layer.visible = visible;
      try {
        controller.renderer.prepareBelow?.({ key: 'frame', width: pane, height: paneHeight, mode: 'player' });
        renderer.render({ container: app.stage, target, clear: true, clearColor: [0, 0, 0, 1] });
        return renderer.extract.pixels({ target }).pixels;
      } finally {
        layers.forEach(({ layer }, i) => { layer.visible = before[i]!; });
      }
    },
    settledPlayerFrame: async (scale, x, y) => {
      let last = view.playerFrame(scale, x, y).slice();
      for (let attempt = 0; attempt < 12; attempt++) {
        await view.settle();
        const next = view.playerFrame(scale, x, y).slice();
        if (next.every((value, i) => value === last[i])) return next;
        last = next;
      }
      throw new Error('The players\' frame did not settle');
    },
    gmCanvas: (scale, x, y) => {
      place(scale, x, y);
      controller.renderer.renderForFrame({ x: 0, y: 0, resolution }, () => undefined);
      controller.renderer.prepareBelow?.();
      renderer.render({ container: app.stage, target, clear: true, clearColor: [0, 0, 0, 1] });
      return renderer.extract.pixels({ target }).pixels;
    },
    dispose: () => {
      target.destroy(true);
      roofs?.destroy();
      controller.destroy();
      scheduler.destroy();
      app.destroy(true, { children: true });
    },
  };
  return view;
}

/** World point of device pixel (`sx`, `sy`) through camera (`scale`, `x`, `y`). */
export function worldOf(sx: number, sy: number, resolution: number, scale: number, x: number, y: number): { x: number; y: number } {
  return new Matrix(scale, 0, 0, scale, x, y).applyInverse({ x: (sx + 0.5) / resolution, y: (sy + 0.5) / resolution });
}
