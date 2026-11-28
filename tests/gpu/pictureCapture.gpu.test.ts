import { Container, RenderTexture, Ticker, type ContainerChild } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { LIGHTING_PEEK_EVENT } from '../../src/app/lighting/lightingPeek';
import { MosaicCanvasService } from '../../src/app/pixi/mosaicCanvas/MosaicCanvasService';
import { TesseraDecoderClient } from '../../src/app/pixi/mosaicCanvas/TesseraDecoderClient';
import type { DrawingStroke, TokenEntity } from '../../src/app/types';
import type { PlayerFrame } from '../../src/app/types/playerFrame';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { fogRectangle } from '../helpers/fogOperations';
import { measureMotionDone } from '../helpers/litView';
import { openMapView, type MapView } from '../helpers/mapView';

vi.mock('events', async () => import('eventemitter3'));

const SIZE = 256;
const FLOOR = 0x808080;
/** Where each part shows: a hidden token, a drawing only the GM sees, fog, and a roof away from the party. */
const GHOST = { x: 60, y: 60 };
const SECRET_DRAWING = { x: 128, y: 130 };
const FOGGED = { x: 128, y: 220 };
const ROOFED = { x: 215, y: 135 };
const ROOF_BOX = [185, 105, 245, 165] as const;
const ROOF = 'roof.png';
const LEVELS: SceneLevel[] = [{ id: 'floor', name: 'Floor', elevation: { bottom: 0, top: 10 }, background: 'floor.png', foreground: ROOF }];
const FRAME: PlayerFrame = { width: SIZE, height: SIZE, resolution: 1, antialias: false, centerX: SIZE / 2, centerY: SIZE / 2, scale: 1 };

/** How the roof shows over the map: not at all, see-through as the GM sees it, or whole. */
type RoofLook = 'none' | 'translucent' | 'whole';

/** What a picture shows of the parts that differ between the GM, the players and a picture of the scene. */
interface Look {
  ghost: boolean;
  secretDrawing: boolean;
  /** The fog lets the map through, as the GM's view draws it. */
  fogSeeThrough: boolean;
  roof: RoofLook;
}

/** Every display object of the stage, in order, with what decides whether and where it is drawn. */
type StageState = Array<[string, boolean, number, boolean, number, number, number, number]>;

function stageState(stage: Container): StageState {
  const state: StageState = [];
  const walk = (node: ContainerChild, path: string): void => {
    state.push([path, node.visible, node.alpha, node.renderable, node.position.x, node.position.y, node.scale.x, node.scale.y]);
    node.children.forEach((child, index) => walk(child, `${path}/${child.label || index}`));
  };
  walk(stage, 'stage');
  return state;
}

async function roofPng(): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#00d000';
  const [x0, y0, x1, y1] = ROOF_BOX;
  context.fillRect(x0, y0, x1 - x0, y1 - y0);
  return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
}

const pen = (id: string, more: Partial<DrawingStroke>): DrawingStroke =>
  ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [], color: '#ffffff', width: 8, opacity: 1, ...more });
const token = (id: string, more: Partial<TokenEntity>): TokenEntity =>
  ({ id, kind: 'token', imagePath: '', size: 1, x: 0, y: 0, ...more } as TokenEntity);

interface Scene {
  view: PixiRendererOrchestrator;
  map: MapView;
  canvas(): Promise<Look>;
  /** What a players' frame shows; `fail` makes its copy throw, as a render that fails does. */
  frame(options?: { renderFollows?: boolean; fail?: boolean }): Look | null;
  /** What a picture of the scene shows; `fail` makes its render throw. */
  picture(options?: { fail?: boolean }): Look | null;
  state(): StageState;
}

/**
 * A map view as Atlas builds it, with a hidden token, a drawing only the GM sees, fog and a roof read
 * from the vault through the tessera worker. Pins what each picture shows and that every part of the
 * view is back as it was after each capture, also when the render throws.
 */
describe('a picture of a map view', () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function open(lit: boolean): Promise<Scene> {
    const map = await openMapView({ size: SIZE, floor: FLOOR });
    const { view, app, store, settings, obsidian } = map;
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    cleanup.push(() => {
      target.destroy(true);
      MosaicCanvasService.release(obsidian);
      TesseraDecoderClient.release(obsidian);
      map.destroy();
    });
    const bytes = await roofPng();
    obsidian.vault.readBinary = vi.fn(() => Promise.resolve(bytes.slice(0)));
    await obsidian.vault.create(ROOF, 'x');
    store.setState((state) => ({
      levels: LEVELS,
      viewedLevel: 'floor',
      lighting: lit ? { ...state.lighting, enabled: true, ambient: 1 } : state.lighting,
      objects: {
        ...state.objects,
        fog: { paint: fogRectangle({ x: 0, y: 180, width: SIZE, height: 76 }) },
        drawings: { secret: pen('secret', { hidden: true, points: [{ x: 20, y: SECRET_DRAWING.y }, { x: 236, y: SECRET_DRAWING.y }] }) },
      },
    }));
    store.getState().addTokens([token('ghost', { ...GHOST, isHidden: true })]);
    store.getState().addTokens([token('hero', { x: 180, y: 60, vision: { enabled: true } } as Partial<TokenEntity>)]);
    await expect.poll(() => ['ghost', 'hero'].every((id) => view.getTokenRenderer()?.getTokenSprites()[id] instanceof Container)).toBe(true);
    const tick = (): void => {
      for (let i = 0; i < 4; i++) app.ticker.update(performance.now() + i * 16);
      Ticker.shared.update();
    };
    const render = (): Uint8ClampedArray => {
      app.renderer.render({ container: app.stage, target, clear: true });
      return app.renderer.extract.pixels({ target }).pixels;
    };
    const lookOf = (pixels: Uint8ClampedArray | Uint8Array): Look => {
      const at = ({ x, y }: { x: number; y: number }): [number, number, number] => {
        const o = (y * SIZE + x) * 4;
        return [pixels[o]!, pixels[o + 1]!, pixels[o + 2]!];
      };
      const floor = (point: { x: number; y: number }): boolean => Math.abs(at(point)[0] - ((FLOOR >> 16) & 0xff)) <= 2;
      const [red, green, blue] = at(ROOFED);
      const roof: RoofLook = green <= Math.max(red, blue) + 15 ? 'none' : red <= 8 && blue <= 8 ? 'whole' : 'translucent';
      return { ghost: !floor(GHOST), secretDrawing: !floor(SECRET_DRAWING), fogSeeThrough: at(FOGGED)[0] > 8, roof };
    };
    const settle = async (): Promise<void> => {
      tick();
      await measureMotionDone();
      tick();
    };
    // The roof is read and cut into pieces by the worker before it is drawn.
    await vi.waitFor(async () => {
      await settle();
      expect(lookOf(render()).roof).not.toBe('none');
    }, { timeout: 30_000, interval: 100 });
    const failure = new Error('render failed');
    const rethrowing = <T,>(capture: () => T): T | null => {
      try {
        return capture();
      } catch (error) {
        if (error !== failure) throw error;
        return null;
      }
    };
    return {
      view, map,
      canvas: async () => {
        await settle();
        return lookOf(render());
      },
      frame: ({ renderFollows = false, fail = false } = {}) => rethrowing(() => {
        const composed = document.createElement('canvas');
        composed.width = SIZE;
        composed.height = SIZE;
        const context = composed.getContext('2d')!;
        view.withPlayerSafeFrame((piece) => {
          if (fail) throw failure;
          context.drawImage(piece.image, piece.x, piece.y, piece.width, piece.height, piece.left, piece.top, piece.width, piece.height);
        }, settings.get('localPlayerView'), FRAME, renderFollows);
        return lookOf(context.getImageData(0, 0, SIZE, SIZE).data);
      }),
      picture: ({ fail = false } = {}) => rethrowing(() => view.captureSceneFrame({ x: 0, y: 0, width: SIZE, height: SIZE, resolution: 1 }, () => {
        const look = lookOf(render());
        if (fail) throw failure;
        return look;
      })),
      state: () => stageState(app.stage),
    };
  }

  const GM: Look = { ghost: true, secretDrawing: true, fogSeeThrough: true, roof: 'translucent' };
  const PLAYERS: Look = { ghost: false, secretDrawing: false, fogSeeThrough: false, roof: 'whole' };
  /** A picture of the scene is the GM's, without what the GM keeps from the players, and the roof whole. */
  const PICTURE: Look = { ghost: true, secretDrawing: false, fogSeeThrough: true, roof: 'whole' };

  /** The views of the canvas: the GM's, and those that draw it for the players. */
  const audiences = (s: Scene): Array<[string, () => void, () => void, Look]> => {
    const { store, events } = s.map;
    return [
      ['the GM view', () => undefined, () => undefined, GM],
      ['session view', () => store.getState().setGMView(false), () => store.getState().setGMView(true), PLAYERS],
      ['Table mode', () => store.getState().enterTableMode(), () => store.getState().leaveTableMode(), PLAYERS],
      ['the peek', () => events.emit(LIGHTING_PEEK_EVENT, true), () => events.emit(LIGHTING_PEEK_EVENT, false), PLAYERS],
    ];
  };

  for (const lit of [false, true]) {
    it(`shows players and a picture of the scene what each is for, from every view of the canvas${lit ? ', lit' : ''}`, async () => {
      const s = await open(lit);
      for (const [name, on, off, canvas] of audiences(s)) {
        on();
        // An unlit scene's peek leaves the hidden token to the GM: the players' sight says nothing of it.
        const onCanvas = name === 'the peek' && !lit ? { ...canvas, ghost: true } : canvas;
        expect(await s.canvas(), name).toEqual(onCanvas);
        expect(s.frame(), name).toEqual(PLAYERS);
        expect(await s.canvas(), name).toEqual(onCanvas);
        expect(s.picture(), name).toEqual(PICTURE);
        expect(await s.canvas(), name).toEqual(onCanvas);
        off();
      }
      expect(await s.canvas()).toEqual(GM);
    });

    it(`leaves every part of the view as it was after each capture, also when the render throws${lit ? ', lit' : ''}`, async () => {
      const s = await open(lit);
      for (const [name, on, off] of audiences(s)) {
        on();
        const onCanvas = await s.canvas();
        // The first capture builds what only captures draw (the players' pins, their frame); then nothing may change.
        s.frame();
        s.picture();
        const before = s.state();
        const captures: Array<[string, () => unknown]> = [
          ['a players\' frame', () => s.frame()],
          ['a players\' frame before the GM\'s own render', () => s.frame({ renderFollows: true })],
          ['a players\' frame that fails', () => expect(s.frame({ fail: true })).toBeNull()],
          ['a picture of the scene', () => s.picture()],
          ['a picture of the scene that fails', () => expect(s.picture({ fail: true })).toBeNull()],
        ];
        for (const [capture, run] of captures) {
          run();
          expect(s.state(), `${name}: ${capture}`).toEqual(before);
          expect(await s.canvas(), `${name}: ${capture}`).toEqual(onCanvas);
        }
        off();
      }
    });
  }
});
