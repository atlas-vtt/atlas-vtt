import type { App } from 'obsidian';
import { Container, RenderTexture, Sprite, Texture, type Application, type WebGLRenderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { createSceneLighting } from '../../pixi/lighting/createSceneLighting';
import { createTestRenderer, readRgba } from '../../pixi/lighting/engine/__tests__/gpuTestUtils';
import type { LightingViewHost } from '../../pixi/lighting/LightingViewHost';
import type { GmOverlays } from '../../pixi/lighting/playerLightingLayers';
import { captureSceneFrame, type SceneFrameCapture } from '../../pixi/sceneFrameCapture';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { TokenEntity } from '../../types';
import type { SceneLighting } from '../../types/lightingTypes';
import type { ThumbnailSize } from '../MapThumbnailService';

/** The map: 800 × 600 world pixels. A scene card (400 × 300) frames all of it, a snapshot card (640 × 360) rows 75 to 525. */
export const MAP = { width: 800, height: 600 };
/** The map image's world rect, which a thumbnail frames. */
export const MAP_RECT = { x: 0, y: 0, ...MAP };
/** A torch, bright to 70 px and dim to 140 px. */
export const LIGHT_AT = { x: 200, y: 300 };
/** Floor far beyond the torch's reach. */
export const DARK_AT = { x: 680, y: 300 };
/** A wall stands 60 px right of the torch: floor 100 px right of it lies in the wall's shadow, 100 px left of it in the light. */
export const SHADOW_AT = { x: 300, y: 300 };
export const OPEN_AT = { x: 100, y: 300 };

/** Where a thumbnail of `size` shows a point of the map: the centred crop `MapThumbnailService` frames. */
export function inThumbnail(point: { x: number; y: number }, size: ThumbnailSize): { x: number; y: number } {
  const { x, y, scale } = frameOf(size);
  return { x: Math.round((point.x - x) * scale), y: Math.round((point.y - y) * scale) };
}

function frameOf(size: ThumbnailSize): { x: number; y: number; scale: number } {
  const aspect = size.width / size.height;
  const width = Math.min(MAP.width, MAP.height * aspect);
  const height = Math.min(MAP.height, MAP.width / aspect);
  return { x: (MAP.width - width) / 2, y: (MAP.height - height) / 2, scale: size.width / width };
}

/** An image as rows of RGBA bytes, top row first. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** A map view as far as a thumbnail reads it: the viewport with the map image and the scene's lighting. */
export interface ThumbnailScene {
  renderer: WebGLRenderer;
  app: Application;
  viewport: Container;
  background: Sprite;
  lighting: LightingViewHost;
  store: ViewAtlasStore;
  /** A store write, e.g. `{ isGMView: false }` for session view. */
  write: (patch: Partial<ViewAtlasState>) => void;
  /** The GM's overlays, as the map view lists them. */
  overlays: { pins: Container; hexLinks: Container; gmOverlays: GmOverlays };
  /** The map view's capture of a thumbnail's frame (`PixiRendererOrchestrator.captureSceneFrame`). */
  capture: SceneFrameCapture;
  /** A frame of the app's ticker, which builds the light's bounce. */
  tick: () => void;
  /** What the canvas shows of the scene, the GM's overlays aside, with the camera on the frame of a thumbnail of `size`. */
  onScreen: (size: ThumbnailSize) => Pixels;
  dispose: () => void;
}

export async function createThumbnailScene(lighting: SceneLighting, antialias: boolean, tokens: Record<string, TokenEntity> = {}): Promise<ThumbnailScene> {
  const renderer = await createTestRenderer(512, 1, antialias);
  const stage = new Container();
  const viewport = new Container();
  viewport.sortableChildren = true;
  const background = new Sprite(Texture.WHITE);
  background.setSize(MAP.width, MAP.height);
  background.tint = 0xa9bfd6;
  viewport.addChild(background);
  stage.addChild(viewport);
  // The GM looks somewhere else, closer: a thumbnail must not depend on it.
  viewport.scale.set(2.3);
  viewport.position.set(-500, 77);

  const listeners = new Set<(state: ViewAtlasState, previous: ViewAtlasState) => void>();
  let state = {
    mapPath: 'maps/cave.atlasmap',
    isMapLoading: false,
    isGMView: true,
    activeTool: 'select',
    lightPopover: null,
    heldTokens: {},
    grid: null,
    exploredMask: null,
    setExploredMask: (): void => undefined,
    exploredEdits: 0,
    setExploredEdits: (exploredEdits: number): void => write({ exploredEdits }),
    lighting,
    objects: {
      // Its shadow and its lit face must fall where the canvas shows them.
      walls: { w: { id: 'w', kind: 'wall', type: 'solid', p1: { x: 260, y: 230 }, p2: { x: 260, y: 370 } } },
      tokens,
      lights: { torch: { id: 'torch', kind: 'light', ...LIGHT_AT, emission: { bright: 5, dim: 10, color: '#ffffff', intensity: 1, animation: 'none' } } },
    },
  } as unknown as ViewAtlasState;
  const store = {
    getState: () => state,
    subscribe: (listener: (state: ViewAtlasState, previous: ViewAtlasState) => void) => (listeners.add(listener), () => listeners.delete(listener)),
  } as unknown as ViewAtlasStore;
  const write = (patch: Partial<ViewAtlasState>): void => {
    const previous = state;
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state, previous));
  };
  const storage = new Map<string, unknown>();
  const obsApp = {
    loadLocalStorage: (key: string): unknown => storage.get(key) ?? null,
    saveLocalStorage: (key: string, data: unknown): void => void storage.set(key, data),
  } as unknown as App;
  const ticks: (() => void)[] = [];
  const app = { renderer, stage, ticker: { add: (tick: () => void) => ticks.push(tick), remove: (tick: () => void) => ticks.splice(ticks.indexOf(tick), 1) } } as unknown as Application;
  const host = createSceneLighting({
    viewport: viewport as unknown as Viewport,
    app,
    store,
    obsApp,
    measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
    bounds: () => MAP,
    albedo: () => null,
  });

  // Each overlay covers the map in a colour no lit floor has: one that reaches a picture shows in it.
  const overlay = (zIndex: number): Sprite => {
    const sprite = new Sprite(Texture.WHITE);
    sprite.setSize(MAP.width, MAP.height);
    sprite.tint = 0xff00ff;
    sprite.zIndex = zIndex;
    return viewport.addChild(sprite);
  };
  const overlays = {
    pins: overlay(95),
    hexLinks: overlay(40),
    gmOverlays: { wallEditor: overlay(96), lightZones: overlay(96), exploredMemory: overlay(91), doorBadges: overlay(97), lightMarkers: overlay(98), rangeRings: overlay(99), sightAids: overlay(99) },
  };
  const markerLayers = [{ layer: overlays.pins, visible: false }, { layer: overlays.hexLinks, visible: false }];
  const capture: SceneFrameCapture = (frame, render) =>
    captureSceneFrame({ gmViewLayers: [], markerLayers, lighting: { gmOverlays: () => overlays.gmOverlays, renderer: host } }, frame, render);

  return {
    renderer,
    app,
    viewport,
    background,
    lighting: host,
    store,
    write,
    overlays,
    capture,
    tick: () => [...ticks].forEach((tick) => tick()),
    onScreen: (size) => {
      const { x, y } = viewport.position;
      const scale = viewport.scale.x;
      const frame = frameOf(size);
      const layers = overlayLayers(overlays).filter((layer) => layer.visible);
      viewport.scale.set(frame.scale);
      viewport.position.set(-frame.x * frame.scale, -frame.y * frame.scale);
      layers.forEach((layer) => (layer.visible = false));
      const target = RenderTexture.create({ ...size, antialias });
      renderer.render({ container: stage, target, clear: true });
      const data = readRgba(renderer, target);
      target.destroy(true);
      layers.forEach((layer) => (layer.visible = true));
      viewport.scale.set(scale);
      viewport.position.set(x, y);
      return { ...size, data };
    },
    dispose: () => {
      host.destroy();
      stage.destroy({ children: true });
      renderer.destroy();
    },
  };
}

export function overlayLayers({ pins, hexLinks, gmOverlays }: ThumbnailScene['overlays']): Container[] {
  return [pins, hexLinks, ...Object.values(gmOverlays)] as Container[];
}

/** A JPEG or PNG data URL as pixels. */
export async function decodeImage(dataUrl: string): Promise<Pixels> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = createEl('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}

/** Mean brightness (0–255) of the 9 × 9 pixels around (x, y): JPEG noise averages out. */
export function brightnessAt({ width, data }: Pixels, x: number, y: number): number {
  let sum = 0;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const i = ((y + dy) * width + x + dx) * 4;
      sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    }
  }
  return sum / 81;
}

/** The largest difference in brightness between two images of one size, over a grid of 9 × 9 pixel patches. */
export function largestDifference(a: Pixels, b: Pixels): number {
  let largest = 0;
  for (let y = 8; y < a.height - 8; y += 12) {
    for (let x = 8; x < a.width - 8; x += 12) largest = Math.max(largest, Math.abs(brightnessAt(a, x, y) - brightnessAt(b, x, y)));
  }
  return largest;
}
