import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { Container, Sprite, Texture, type Rectangle } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import type { SceneFrame } from '../../src/app/pixi/lighting/engine/types';
import type { TileView } from '../../src/app/pixi/mapImage/levelOfDetail';
import { MapThumbnailService } from '../../src/app/services/MapThumbnailService';
import { ServiceManager } from '../../src/app/services/ServiceManager';

afterEach(() => vi.restoreAllMocks());

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/**
 * A map view's own `ServiceManager.renderMapThumbnail` over its real renderer orchestrator and
 * thumbnail service; only PIXI's renderer and the orchestrator's parts are stand-ins.
 */
function setup(contextLost = false) {
  const viewport = new Container();
  const background = new Sprite(Texture.WHITE);
  background.setSize(800, 600);
  viewport.addChild(background);

  const layer = (visible = true) => ({ visible, alpha: 1 });
  const pins = layer();
  const hexLinks = layer();
  const gmOverlays = { wallEditor: layer(), doorBadges: layer(), lightMarkers: layer(), rangeRings: layer(), sightAids: layer() };
  // Session view took the hidden token off the canvas
  const hiddenToken = layer(false);
  const fog = layer();
  const shown = () => ({
    pins: pins.visible, hexLinks: hexLinks.visible, wallEditor: gmOverlays.wallEditor.visible, doorBadges: gmOverlays.doorBadges.visible,
    lightMarkers: gmOverlays.lightMarkers.visible, rangeRings: gmOverlays.rangeRings.visible, sightAids: gmOverlays.sightAids.visible, hiddenToken: hiddenToken.visible, hiddenTokenAlpha: hiddenToken.alpha, fogAlpha: fog.alpha,
  });

  const rendered: Array<{ frame: Rectangle; resolution: number; shown: ReturnType<typeof shown>; lit: boolean; picture: TileView | null }> = [];
  let lighting = false;
  // The map image's tiles of the picture it draws for, until restored
  let picture: TileView | null = null;
  const restoreMapImage = vi.fn(() => { picture = null; });
  const drawFor = vi.fn((view: TileView) => {
    picture = view;
    return restoreMapImage;
  });
  const generateTexture = vi.fn((options: { frame: Rectangle; resolution: number }) => {
    rendered.push({ frame: options.frame.clone(), resolution: options.resolution, shown: shown(), lit: lighting, picture });
    return { destroy: vi.fn() };
  });
  const source = document.createElement('canvas');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,SlBH');
  const pixiRenderer = { name: 'webgl', gl: { isContextLost: () => contextLost }, generateTexture, extract: { canvas: () => source } };

  const store = createStore(subscribeWithSelector(() => ({ activeTool: 'move' })));
  const manager = { getApp: () => ({ renderer: pixiRenderer }), getViewport: () => viewport };
  const orchestrator = new PixiRendererOrchestrator({} as any, manager as any, new EventEmitter(), store as any, 'test');
  const frames: SceneFrame[] = [];
  const drawn = deferred();
  const whenReady = vi.fn((_rect: Rectangle, _worldPerScreenPixel: number, _timeoutMs: number) => drawn.promise);
  Object.assign(orchestrator as any, {
    mapImage: { layer: background, worldRect: { x: 0, y: 0, width: 800, height: 600 }, whenReady, drawFor },
    pinRenderer: { getPinContainer: () => pins },
    hexLinkRenderer: { container: hexLinks },
    tokenRenderer: { getGmViewLayers: () => [{ layer: hiddenToken, visible: true, alpha: 0.5 }] },
    fogRenderer: { getGmViewLayers: () => [{ layer: fog, visible: true, alpha: 0.5 }] },
    lightingFeature: { controller: {
      gmOverlays: () => gmOverlays,
      renderer: {
        renderForFrame: <T,>(frame: SceneFrame, render: () => T): T => {
          frames.push(frame);
          lighting = true;
          try { return render(); } finally { lighting = false; }
        },
      },
    } },
  });
  // Session view shows the fog opaque
  fog.alpha = 1;

  const view = { mapPath: 'maps/cave.atlasmap' };
  const services = Object.assign(Object.create(ServiceManager.prototype) as ServiceManager, {
    rendererService: { getRenderer: () => orchestrator },
    mapThumbnailService: new MapThumbnailService({} as any),
    store: { getState: () => view },
  });
  return { services, viewport, rendered, frames, shown, generateTexture, whenReady, drawn, view, restoreMapImage };
}

describe('a map view\'s thumbnail render', () => {
  it('is rendered inside the lighting, for the frame it renders', () => {
    const { services, rendered, frames } = setup();
    const bytes = services.renderMapThumbnail();
    expect(new TextDecoder().decode(bytes!)).toBe('JPG');
    expect(rendered).toHaveLength(1);
    expect(rendered[0]!.lit).toBe(true);
    expect(frames).toEqual([{ x: rendered[0]!.frame.x, y: rendered[0]!.frame.y, resolution: rendered[0]!.resolution }]);
    expect(frames[0]).toEqual({ x: 0, y: 0, resolution: 0.5 });
  });

  it('draws the map image\'s tiles at the thumbnail\'s own detail, and the canvas\' again afterwards', () => {
    const { services, rendered, restoreMapImage } = setup();
    services.renderMapThumbnail({ width: 640, height: 360 });
    expect(rendered[0]!.picture).toEqual({ rect: { x: 0, y: 75, width: 800, height: 450 }, worldPerScreenPixel: 1.25 });
    expect(restoreMapImage).toHaveBeenCalledOnce();
  });

  it('shows the GM picture without the GM overlays, and leaves the canvas as it was', () => {
    const { services, rendered, shown } = setup();
    const onCanvas = shown();
    services.renderMapThumbnail({ width: 640, height: 360 });
    expect(rendered[0]!.shown).toEqual({
      pins: false, hexLinks: false, wallEditor: false, doorBadges: false, lightMarkers: false, rangeRings: false, sightAids: false,
      hiddenToken: true, hiddenTokenAlpha: 0.5, fogAlpha: 0.5,
    });
    expect(shown()).toEqual(onCanvas);
    expect(rendered[0]!.frame.y).toBe(75);
  });

  it('gives no thumbnail while the WebGL context is lost, instead of a blank one', () => {
    const { services, generateTexture } = setup(true);
    expect(services.renderMapThumbnail()).toBeNull();
    expect(generateTexture).not.toHaveBeenCalled();
  });

  it('frames the map image\'s world rect, whatever else lies on the viewport', () => {
    const { services, viewport, rendered } = setup();
    // The grid, fog and editor overlays reach far beyond the map.
    viewport.addChild(new Sprite({ texture: Texture.WHITE, x: -5000, y: -5000, width: 20000, height: 20000 }));
    services.renderMapThumbnail();
    expect(rendered[0]!.frame).toMatchObject({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('renders a snapshot once the map image is drawn at the detail of its frame', async () => {
    const { services, rendered, whenReady, drawn } = setup();
    const bytes = services.renderMapThumbnailWhenDrawn({ width: 640, height: 360 });
    await Promise.resolve();
    expect(rendered).toHaveLength(0);
    // 800 × 450 of the map at 0.8 output pixels per world pixel
    expect(whenReady).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 75, width: 800, height: 450 }), 1.25, 500);
    drawn.resolve();
    expect(new TextDecoder().decode((await bytes)!)).toBe('JPG');
    expect(rendered).toHaveLength(1);
  });

  it('renders no snapshot of a scene the view left while it waited', async () => {
    const { services, rendered, drawn, view } = setup();
    const bytes = services.renderMapThumbnailWhenDrawn({ width: 640, height: 360 });
    view.mapPath = 'maps/tower.atlasmap';
    drawn.resolve();
    expect(await bytes).toBeNull();
    expect(rendered).toHaveLength(0);
  });
});
