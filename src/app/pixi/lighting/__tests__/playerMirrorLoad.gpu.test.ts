import { Sprite, Texture } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerFrameMirror, type PlayerFrameSource } from '../../../services/PlayerFrameMirror';
import type { AtlasSettings } from '../../../services/SettingsService';
import { captureWithLayerVisibility } from '../../playerSafeFrame';
import { playerLightingLayers } from '../playerLightingLayers';
import { SIZE } from './rendererHarness';
import { createScene, engineLayer, litScene, type SavedScene, type Scene } from './sceneLightingHarness';

vi.mock('obsidian', () => ({ Notice: class {}, getLanguage: () => 'en' }));

const CRYPT = 'maps/crypt.atlasmap';
/** A scene in daylight whose token at (60, 60) sees 70 px around it. */
const crypt = { ...litScene(60, 60), lighting: { enabled: true, ambient: 1 } } as SavedScene;
const IN_SIGHT = [60, 60] as const;
const OUT_OF_SIGHT = [240, 240] as const;
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const SETTINGS = { showTokenNameplates: true } as AtlasSettings['localPlayerView'];

/** The engine and line of sight are part of the frame being captured. */
interface Capture {
  loading: boolean;
  engineActive: boolean;
}

describe('the player window while a lit scene loads', () => {
  let scene: Scene;
  let target: HTMLCanvasElement;
  let mirror: PlayerFrameMirror;
  let source: PlayerFrameSource;
  let captures: Capture[];
  let now = 0;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    scene = await createScene({ enabled: true });
    const { renderer, viewport, host, store } = scene;
    const map = new Sprite(Texture.WHITE);
    map.setSize(SIZE, SIZE);
    viewport.addChildAt(map, 0);
    captures = [];
    const gmOverlay = { visible: true };
    // As the map view renders a player frame: the players' lighting, without the GM's overlays.
    source = {
      canvas: renderer.canvas as HTMLCanvasElement,
      store,
      withPlayerSafeFrame: (capture) => captureWithLayerVisibility(
        playerLightingLayers({ enabled: host.isEnabled(), modeLayer: host.modeLayer, gmOverlays: { wallEditor: gmOverlay, lightZones: gmOverlay, exploredMemory: gmOverlay, doorBadges: gmOverlay, lightMarkers: gmOverlay, rangeRings: gmOverlay, sightAids: gmOverlay } }),
        () => renderer.render({ container: viewport }),
        () => {
          const layer = engineLayer(viewport);
          captures.push({ loading: store.getState().isMapLoading, engineActive: layer?.visible === true && layer.filters?.length === 1 && renderer.backBuffer.useBackBuffer });
          capture();
        },
      ),
    };
    target = document.createElement('canvas');
    mirror = new PlayerFrameMirror(target, target.getContext('2d', { willReadFrequently: true })!, {
      source: () => source,
      heldFrame: () => null,
      frozenCamera: () => null,
      settings: () => SETTINGS,
      onFrame: () => undefined,
    }, () => now);
  });

  afterEach(() => {
    mirror.stop();
    scene.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function frame(time: number): void {
    now = time;
    mirror.frame();
  }

  function shown([x, y]: readonly [number, number]): number[] {
    return Array.from(target.getContext('2d')!.getImageData(x, y, 1, 1).data.slice(0, 3));
  }

  it('keeps the last frame during the load and then shows the scene lit, with line of sight', () => {
    frame(0);
    expect(captures).toEqual([{ loading: false, engineActive: true }]);
    const before = [shown(IN_SIGHT), shown(OUT_OF_SIGHT)];

    scene.startLoad(CRYPT, crypt, { width: SIZE, height: SIZE });
    // What a capture would give away now: the scene is in the store, and nothing lights or hides it yet.
    let halfBuilt: number[] = [];
    source.withPlayerSafeFrame(() => {
      const copy = new OffscreenCanvas(SIZE, SIZE).getContext('2d')!;
      copy.drawImage(source.canvas, 0, 0);
      halfBuilt = Array.from(copy.getImageData(...OUT_OF_SIGHT, 1, 1).data.slice(0, 3));
    }, SETTINGS);
    expect(halfBuilt).toEqual(WHITE);
    expect(captures.pop()).toEqual({ loading: true, engineActive: false });

    for (const time of [100, 108, 400, 900]) frame(time);
    expect(captures).toHaveLength(1);
    expect([shown(IN_SIGHT), shown(OUT_OF_SIGHT)]).toEqual(before);

    scene.finishLoad();
    frame(908);
    expect(captures).toEqual([{ loading: false, engineActive: true }, { loading: false, engineActive: true }]);
    expect(shown(OUT_OF_SIGHT)).toEqual(BLACK);
    expect(Math.min(...shown(IN_SIGHT))).toBeGreaterThan(200);
  });
});
