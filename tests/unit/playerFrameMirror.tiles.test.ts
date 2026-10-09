import { Ticker } from 'pixi.js';
import { TFile } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapImage, type MapImageOpener } from '../../src/app/pixi/mapImage/MapImage';
import type { TileView } from '../../src/app/pixi/mapImage/levelOfDetail';
import { pyramidOf, tileKey, tileSourceRect, type TileRef } from '../../src/app/pixi/mapImage/pyramid';
import { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { frameView } from '../../src/app/services/playerFrameDemand';
import { MIRRORED, SETTINGS, setupMirror, type MirrorHarness } from '../mocks/mirrorHarness';
import { FRAME, fakePlayerFrames, fakeViewport } from '../mocks/playerFrameSource';

class Bitmap {
  readonly close = vi.fn();
  constructor(readonly width: number, readonly height: number) {}
}

interface Pending {
  ref: TileRef;
  signal: AbortSignal;
  resolve: (bitmap: ImageBitmap) => void;
}

// 6000 × 4000: level 0 is 12 × 8 tiles of 510 px. The GM looks at its top left corner, 800 × 600 at 100 %.
const pyramid = pyramidOf(6000, 4000);
/** Players frozen on the bottom right corner, 400 × 300 of the world: four device pixels per world pixel in the window. */
const FROZEN = { centerX: 5000, centerY: 3500, scale: 2, width: 400, height: 300 };
/** The level 0 tiles the frozen frame shows (world 4800 to 5200 by 3350 to 3650). */
const FROZEN_TILES = ['0/9/6', '0/10/6', '0/9/7', '0/10/7'];

const images: MapImage[] = [];

afterEach(() => {
  for (const image of images.splice(0)) image.destroy();
  vi.restoreAllMocks();
});

/** A mirror whose presented view draws a real map image, its tiles served by hand. */
async function setup(): Promise<MirrorHarness & {
  pending: Pending[];
  requested: string[];
  regions: Array<{ view: TileView; release: ReturnType<typeof vi.fn> }>;
  /** Frames of the map image's ticker, serving every open request whose tile `accept`s, until none is left. */
  serve: (accept?: (ref: TileRef) => boolean) => Promise<void>;
}> {
  const harness = setupMirror();
  const pending: Pending[] = [];
  const requested: string[] = [];
  const service = {
    open: vi.fn(async () => ({ handle: 1, hash: 'world', pyramid })),
    tile: vi.fn((_handle: number, ref: TileRef, signal: AbortSignal) => new Promise<ImageBitmap>((resolve, reject) => {
      requested.push(tileKey(ref));
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      pending.push({ ref, signal, resolve });
    })),
    overview: vi.fn(),
    close: vi.fn(),
    reportUnshown: vi.fn(),
  };
  const ticker = new Ticker();
  const viewport = { left: 0, top: 0, worldScreenWidth: 800, worldScreenHeight: 600, scale: { x: 1 }, worldWidth: 0, worldHeight: 0 };
  const mapImage = new MapImage({
    service: service as unknown as MapImageOpener,
    viewport,
    ticker,
    renderer: null,
    requestRender: () => harness.dm.source.beforeRender!.requestRender(),
    reducedMotion: () => true,
  });
  images.push(mapImage);
  await mapImage.load({ kind: 'file', file: Object.assign(new TFile('maps/world.webp'), { stat: { ctime: 0, mtime: 1, size: 2 } }) });

  const regions: Array<{ view: TileView; release: ReturnType<typeof vi.fn> }> = [];
  harness.dm.source.addDemandRegion = (view) => {
    const release = vi.fn(mapImage.addDemandRegion(view));
    regions.push({ view, release });
    return release;
  };
  let time = 0;
  const serve = async (accept: (ref: TileRef) => boolean = () => true): Promise<void> => {
    for (let round = 0; round < 60; round++) {
      ticker.update((time += 16));
      const due = pending.filter(p => !p.signal.aborted && accept(p.ref));
      if (due.length === 0) return;
      pending.splice(0, pending.length, ...pending.filter(p => !due.includes(p)));
      for (const { ref, resolve } of due) {
        const rect = tileSourceRect(pyramid, ref);
        resolve(new Bitmap(rect.width, rect.height) as unknown as ImageBitmap);
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };
  return { ...harness, pending, requested, regions, serve };
}

describe('PlayerFrameMirror and the map image', () => {
  it('has the tiles of a frozen camera on a part the GM does not look at loaded, at the window\'s detail', async () => {
    const { frame, state, serve, requested, regions } = await setup();
    state.frozen = FROZEN;
    await serve();
    expect(requested).toContain('0/0/0');
    expect(requested.filter(key => FROZEN_TILES.includes(key))).toEqual([]);

    frame(0);
    await serve();

    expect(regions).toHaveLength(1);
    expect(regions[0]!.view).toEqual({ rect: { x: 4800, y: 3350, width: 400, height: 300 }, worldPerScreenPixel: 0.25 });
    expect(requested).toEqual(expect.arrayContaining(FROZEN_TILES));
  });

  it('replaces the region only when the frame changes', async () => {
    const { frame, state, regions, pending, serve } = await setup();
    state.frozen = FROZEN;
    frame(0);
    frame(16);
    expect(regions).toHaveLength(1);

    await serve(ref => ref.level !== 0);
    state.frozen = { ...FROZEN, centerX: 1000, centerY: 3500 };
    frame(32);
    expect(regions).toHaveLength(2);
    expect(regions[0]!.release).toHaveBeenCalledOnce();
    expect(regions[1]!.view.rect).toEqual({ x: 800, y: 3350, width: 400, height: 300 });

    await serve(() => false);
    const open = pending.filter(p => !p.signal.aborted).map(p => tileKey(p.ref));
    expect(open.filter(key => FROZEN_TILES.includes(key))).toEqual([]);
  });

  it('lets go of the region while the window holds a still frame, sleeps or closes', async () => {
    const { mirror, frame, dm, state, regions } = await setup();
    state.frozen = FROZEN;
    frame(0);
    dm.tick(1);

    state.held = document.createElement('canvas');
    frame(100);
    expect(regions[0]!.release).toHaveBeenCalledOnce();
    state.held = null;
    frame(200);
    expect(regions).toHaveLength(2);

    // No display frame of the player window for a while: it is hidden
    dm.change();
    dm.tick(1000);
    expect(regions[1]!.release).toHaveBeenCalledOnce();
    frame(1010);
    expect(regions).toHaveLength(3);

    mirror.stop();
    expect(regions[2]!.release).toHaveBeenCalledOnce();
  });

  it('shows players a new frame once a tile only their frame shows arrives', async () => {
    const { frame, dm, state, events, serve } = await setup();
    state.frozen = FROZEN;
    frame(0);
    dm.tick(1);
    await serve(ref => !FROZEN_TILES.includes(tileKey(ref)));
    frame(500);
    dm.tick(501);
    events.length = 0;

    frame(600);
    await serve(ref => tileKey(ref) === '0/9/6');
    dm.tick(601);

    expect(events).toEqual(MIRRORED);
  });
});

describe('a players\' frame of a map view', () => {
  /** The orchestrator with only what a players' frame reads; its map image notes what it draws for. */
  function view(events: string[]): { renderer: PixiRendererOrchestrator; drawFor: ReturnType<typeof vi.fn> } {
    const drawFor = vi.fn((_view: TileView) => {
      events.push('draw:players');
      return (): void => { events.push('draw:dm'); };
    });
    const renderer = Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
      pixiAppManager: { getApp: () => ({ renderer: { render: () => events.push('render:dm') }, stage: {} }), getViewport: fakeViewport },
      playerFrames: fakePlayerFrames(() => events.push('render:player')),
      mapImage: { drawFor },
      dmScreenOverlays: new Set(),
    });
    return { renderer, drawFor };
  }

  it('draws the map image at the frame\'s own detail, and the DM\'s again before the DM\'s render', () => {
    const events: string[] = [];
    const { renderer, drawFor } = view(events);
    renderer.withPlayerSafeFrame(() => events.push('copy'), SETTINGS, FRAME);
    expect(drawFor).toHaveBeenCalledWith(frameView(FRAME));
    expect(events).toEqual(['draw:players', 'render:player', 'copy', 'draw:dm', 'render:dm']);
  });

  it('puts the DM\'s picture back when the DM\'s own render follows', () => {
    const events: string[] = [];
    const { renderer } = view(events);
    renderer.withPlayerSafeFrame(() => events.push('copy'), SETTINGS, FRAME, true);
    expect(events).toEqual(['draw:players', 'render:player', 'copy', 'draw:dm']);
  });
});

describe('frameView', () => {
  it('is the world a frame\'s pixels cover around its centre, and the world units per device pixel', () => {
    const view = frameView({ width: 1200, height: 800, resolution: 2, antialias: false, centerX: 100, centerY: 50, scale: 0.5 });
    expect(view).toEqual({ rect: { x: -500, y: -350, width: 1200, height: 800 }, worldPerScreenPixel: 1 });
  });
});
