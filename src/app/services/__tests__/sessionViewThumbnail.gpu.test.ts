import type { App } from 'obsidian';
import type { Viewport } from 'pixi-viewport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { visionToken } from '../../pixi/lighting/__tests__/rendererHarness';
import { LightMarkers } from '../../pixi/lighting/LightMarkers';
import { LightRangeRings } from '../../pixi/lighting/LightRangeRings';
import { playerLightingLayers, type GmOverlays } from '../../pixi/lighting/playerLightingLayers';
import { SessionLighting } from '../../pixi/lighting/SessionLighting';
import { captureSceneFrame, type SceneFrameCapture } from '../../pixi/sceneFrameCapture';
import { MapThumbnailService, type ThumbnailSize } from '../MapThumbnailService';
import { LIGHT_AT, MAP_RECT, brightnessAt, createThumbnailScene, decodeImage, inThumbnail, largestDifference, overlayLayers, type Pixels, type ThumbnailScene } from './thumbnailScene';

const SCENE_CARD: ThumbnailSize = { width: 400, height: 300 };
const THEME = { background: 0x2a2a2a, stroke: 0xffffff, accent: 0x8a5cf5 };
const FEET = { unitDistance: 5 } as unknown as MeasurementSettings;

/**
 * The thumbnail scene with the real light markers and range rings as its GM overlays, and the
 * real session view holding the players' lighting on the canvas: the one seam a thumbnail and
 * session view share (`GmOverlays`, `modeLayer`).
 */
describe('thumbnail of a scene while the canvas shows the players\' view', () => {
  let scene: ThumbnailScene | null = null;
  let disposeOverlays: (() => void) | null = null;

  beforeEach(() => {
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    // Obsidian's `node.win`, and reduced motion, so the rings and marker lifts settle at once.
    Object.defineProperty(Node.prototype, 'win', { configurable: true, get: () => window });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
  });

  afterEach(() => {
    disposeOverlays?.();
    disposeOverlays = null;
    scene?.dispose();
    scene = null;
    vi.unstubAllGlobals();
    delete (Node.prototype as { win?: Window }).win;
  });

  async function setup(): Promise<{ gmOverlays: GmOverlays; session: SessionLighting; thumbnail: (capture?: SceneFrameCapture) => Promise<Pixels> }> {
    // The token sees 5 ft around itself: the players' view of the torch is black.
    scene = await createThumbnailScene({ enabled: true, ambient: 0 }, false, { t: visionToken(680, 300, 5) });
    const { viewport, store, lighting, app } = scene;
    // The harness's stand-in overlays cover the map; this scene has the real ones.
    overlayLayers(scene.overlays).forEach((layer) => (layer.visible = false));
    const markers = new LightMarkers(viewport as unknown as Viewport, store, () => THEME);
    const rings = new LightRangeRings(viewport as unknown as Viewport, store, () => FEET);
    const gmOverlays: GmOverlays = { ...scene.overlays.gmOverlays, lightMarkers: markers.view, rangeRings: rings.view };
    const session: SessionLighting = new SessionLighting({
      store,
      playerLayers: () => playerLightingLayers({ enabled: true, modeLayer: lighting.modeLayer, gmOverlays }),
      gmLayers: () => [{ layer: lighting.modeLayer, visible: false }],
      onChange: () => {
        markers.setSuppressed(session.active);
        rings.setSuppressed(session.active);
      },
    });
    disposeOverlays = () => {
      session.destroy();
      rings.destroy();
      markers.destroy();
    };
    const mapViewCapture: SceneFrameCapture = (frame, render) =>
      captureSceneFrame({ gmViewLayers: [], markerLayers: [], lighting: { gmOverlays: () => gmOverlays, renderer: lighting } }, frame, render);
    const thumbnail = (capture: SceneFrameCapture = mapViewCapture): Promise<Pixels> =>
      decodeImage(new MapThumbnailService({} as App).renderThumbnail(app, viewport, MAP_RECT, SCENE_CARD, capture)!);
    scene.tick();
    return { gmOverlays, session, thumbnail };
  }

  it('leaves the light markers and the open light\'s range rings out of the picture', async () => {
    const { gmOverlays, thumbnail } = await setup();
    scene!.write({ lightPopover: 'torch' });
    expect(gmOverlays.lightMarkers.visible).toBe(true);
    expect(gmOverlays.rangeRings.visible).toBe(true);
    const picture = await thumbnail();

    // The same scene with markers and rings switched off by hand is the same picture…
    gmOverlays.lightMarkers.visible = false;
    gmOverlays.rangeRings.visible = false;
    const without = await thumbnail();
    expect(largestDifference(picture, without)).toBe(0);
    gmOverlays.lightMarkers.visible = true;
    gmOverlays.rangeRings.visible = true;

    // …and a capture that does not hide them shows the marker's badge on the lit floor.
    const unhidden = await thumbnail((frame, render) => scene!.lighting.renderForFrame(frame, render));
    const at = inThumbnail(LIGHT_AT, SCENE_CARD);
    expect(brightnessAt(picture, at.x, at.y) - brightnessAt(unhidden, at.x, at.y)).toBeGreaterThan(30);
  });

  it('is the GM view\'s picture in session view, and leaves the canvas in session view', async () => {
    const { gmOverlays, session, thumbnail } = await setup();
    scene!.write({ lightPopover: 'torch' });
    const inGmView = await thumbnail();
    const lit = inThumbnail(LIGHT_AT, SCENE_CARD);
    expect(brightnessAt(inGmView, lit.x, lit.y)).toBeGreaterThan(150);

    scene!.write({ isGMView: false, lightPopover: null });
    expect(session.active).toBe(true);
    const players = scene!.onScreen(SCENE_CARD);
    expect(brightnessAt(players, lit.x, lit.y)).toBeLessThan(5);

    expect(largestDifference(await thumbnail(), inGmView)).toBeLessThan(2);

    // Nothing the players must not see is left on the canvas.
    expect(scene!.lighting.modeLayer.visible).toBe(true);
    expect(gmOverlays.lightMarkers.visible).toBe(false);
    expect(gmOverlays.rangeRings.visible).toBe(false);
    expect(largestDifference(scene!.onScreen(SCENE_CARD), players)).toBe(0);
  });

  it('is the GM view\'s picture during a peek', async () => {
    const { gmOverlays, session, thumbnail } = await setup();
    const inGmView = await thumbnail();
    session.setPeeking(true);
    expect(largestDifference(await thumbnail(), inGmView)).toBeLessThan(2);
    expect(scene!.lighting.modeLayer.visible).toBe(true);
    expect(gmOverlays.lightMarkers.visible).toBe(false);
    session.setPeeking(false);
    expect(gmOverlays.lightMarkers.visible).toBe(true);
  });
});
