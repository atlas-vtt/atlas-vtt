import '../setup/obsidianDom';
import { EventEmitter } from 'events';
import { Application, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { Point } from '../../src/app/types/visionTypes';
import { showsMap } from '../../src/app/gameSystems/senseRules';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { captureBeforeRender } from '../../src/app/pixi/playerSafeFrame';
import { RenderScheduler, setBeforeRender } from '../../src/app/pixi/RenderScheduler';
import type { TokenRenderer } from '../../src/app/pixi/TokenRenderer';

vi.mock('events', async () => import('eventemitter3'));

const SIZE = 256;
const FLOOR = 0x8899aa;
const MAP = { width: SIZE, height: SIZE };

function token(id: string, x: number, y: number, range: number): TokenEntity {
  return { id, kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, vision: { enabled: true, range } };
}

function contains(polygon: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** What a frame the player window captured shows, against the sight the lighting holds. */
interface Shown {
  /** Sampled pixels with no sight polygon within two pixels that are anything but black. */
  outsideSight: number;
  /** Sampled pixels two pixels inside sight that are black. A hairline along a wall seen from both sides is not: it is grey. */
  hiddenInSight: number;
  black: number;
}

/**
 * The line-of-sight fallback as a map view runs it without WebGL: the real lighting controller
 * on PIXI's Canvas renderer, which renders only on change, and a player window that captures
 * its frames right before those renders. The GM's canvas stays in GM view throughout.
 */
describe('the player window behind the line-of-sight fallback, in GM view', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
  });

  async function open(lighting: Record<string, unknown>): Promise<{ store: ViewAtlasStore; frames: Uint8ClampedArray[]; displayFrames: (count: number) => void; shown: (frame: Uint8ClampedArray) => Shown }> {
    const app = new Application();
    await app.init({ width: SIZE, height: SIZE, preference: 'canvas', antialias: false, autoStart: false, backgroundColor: FLOOR });
    expect(app.renderer.name).toBe('canvas');
    const scheduler = new RenderScheduler(app);
    const viewport = new Viewport({ screenWidth: SIZE, screenHeight: SIZE, worldWidth: SIZE, worldHeight: SIZE, events: app.renderer.events });
    viewport.sortableChildren = true;
    viewport.addChild(new Graphics().rect(0, 0, SIZE, SIZE).fill(FLOOR));
    app.stage.addChild(viewport);
    const obsApp = createInMemoryApp().app;
    const store = createViewAtlasStore(obsApp, `fallback-frames-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/frames.atlasmap');
    // Party tokens and one the party sees, no doors, nothing selected, no token renderer: nothing but the lighting has a reason to draw.
    store.setState((state) => ({ objects: { ...state.objects, tokens: { ada: token('ada', 60, 70, 5), bo: token('bo', 180, 110, 5), cat: { ...token('cat', 70, 90, 5), vision: { enabled: false } } } } }));
    store.getState().addWall({ type: 'solid', p1: { x: 110, y: 20 }, p2: { x: 110, y: 160 } });
    store.getState().setSceneLighting({ enabled: true, ...lighting });
    const controller = new LightingController({ viewport, app, store, eventBus: new EventEmitter(), obsApp, viewId: 'frames', bounds: () => MAP, albedo: () => null });
    const ignore = (): void => undefined;
    controller.wire({
      setLightHandlers: ignore, setWallPointerDownHandler: ignore, setWallContextMenuHandler: ignore, setWallPointerMoveHandler: ignore,
      setWallPointerUpHandler: ignore, setWallDoubleClickHandler: ignore, setWallCursorProvider: ignore, setDoorMenuHandlers: ignore,
      setDoorClickHandler: ignore, setPlayerSightProvider: ignore, refreshPlayerSight: ignore, getSensedOutlineLayer: () => ({ visible: false }),
    } as unknown as TokenRenderer);
    cleanup.push(() => {
      controller.destroy();
      scheduler.destroy();
      app.destroy(true, { children: true });
    });

    const frames: Uint8ClampedArray[] = [];
    // As the player window mirrors a canvas that renders on change (`PlayerFrameMirror`, `captureBeforeRender`).
    setBeforeRender(app, () => captureBeforeRender(controller.playerLayers(), () => app.renderer.render(app.stage), () => {
      const copy = new OffscreenCanvas(SIZE, SIZE).getContext('2d')!;
      copy.drawImage(app.canvas, 0, 0);
      frames.push(copy.getImageData(0, 0, SIZE, SIZE).data);
    }));
    let time = 1000;
    const shown = (frame: Uint8ClampedArray): Shown => {
      const sight = controller.renderer.currentSight();
      const seen = sight.regions.filter((region) => showsMap(region.sense) && region.polygon).map((region) => region.polygon!);
      const inAny = (x: number, y: number): boolean => sight.all || seen.some((polygon) => contains(polygon, x, y));
      const tally: Shown = { outsideSight: 0, hiddenInSight: 0, black: 0 };
      for (let y = 4; y < SIZE - 4; y += 2) {
        for (let x = 4; x < SIZE - 4; x += 2) {
          const around = [[0, 0], [-2, -2], [2, -2], [-2, 2], [2, 2], [-2, 0], [2, 0], [0, -2], [0, 2]].map(([dx, dy]) => inAny(x + 0.5 + dx!, y + 0.5 + dy!));
          const i = (y * SIZE + x) * 4;
          const colour = (frame[i]! << 16) | (frame[i + 1]! << 8) | frame[i + 2]!;
          if (colour === 0) tally.black++;
          if (around.every((inside) => !inside) && colour !== 0) tally.outsideSight++;
          if (around.every((inside) => inside) && colour === 0) tally.hiddenInSight++;
        }
      }
      return tally;
    };
    return { store, frames, displayFrames: (count) => { for (let i = 0; i < count; i++) app.ticker.update(time += 16); }, shown };
  }

  it('captures a frame with the new sight when token vision is switched on, and nothing outside sight shows in it', async () => {
    const { store, frames, displayFrames, shown } = await open({ tokenVision: false });
    displayFrames(5);
    expect(shown(frames[frames.length - 1]!)).toEqual({ outsideSight: 0, hiddenInSight: 0, black: 0 });
    frames.length = 0;

    store.getState().setSceneLighting({ tokenVision: true });
    displayFrames(60);
    expect(frames).toHaveLength(1);
    const picture = shown(frames[0]!);
    expect({ outsideSight: picture.outsideSight, hiddenInSight: picture.hiddenInSight }).toEqual({ outsideSight: 0, hiddenInSight: 0 });
    expect(picture.black).toBeGreaterThan(5_000);
  });

  it('captures a frame when the vision of a token nobody selected changes, when token vision goes off and when lighting goes off', async () => {
    const { store, frames, displayFrames, shown } = await open({});
    displayFrames(5);
    const before = shown(frames[frames.length - 1]!);
    expect({ outsideSight: before.outsideSight, hiddenInSight: before.hiddenInSight }).toEqual({ outsideSight: 0, hiddenInSight: 0 });
    frames.length = 0;

    // Sight shrinks: what the players saw before must not stay on their screen.
    store.getState().updateToken('bo', { vision: { enabled: true, range: 2 } });
    displayFrames(60);
    expect(frames).toHaveLength(1);
    const narrowed = shown(frames[0]!);
    expect({ outsideSight: narrowed.outsideSight, hiddenInSight: narrowed.hiddenInSight }).toEqual({ outsideSight: 0, hiddenInSight: 0 });
    expect(narrowed.black).toBeGreaterThan(before.black);

    frames.length = 0;
    store.getState().setSceneLighting({ tokenVision: false });
    displayFrames(60);
    expect(frames).toHaveLength(1);
    expect(shown(frames[0]!).black).toBe(0);

    store.getState().setSceneLighting({ tokenVision: true });
    displayFrames(60);
    frames.length = 0;
    store.getState().setSceneLighting({ enabled: false });
    displayFrames(60);
    expect(frames).toHaveLength(1);
    expect(shown(frames[0]!).black).toBe(0);
  });

  it('asks for no frame while sight stays as it is', async () => {
    const { store, frames, displayFrames } = await open({});
    displayFrames(5);
    frames.length = 0;
    // A token without vision moves inside what the party sees: the darkness is the same.
    store.getState().updateToken('cat', { x: 80, y: 95 });
    displayFrames(60);
    expect(frames).toHaveLength(0);
  });
});
