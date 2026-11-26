import { Container, RenderTexture } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { LIGHTING_PEEK_EVENT } from '../../src/app/lighting/lightingPeek';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import type { DrawingStroke, TokenEntity } from '../../src/app/types';
import type { KeptMeasure } from '../../src/app/measure/measureTypes';
import type { PlayerFrame } from '../../src/app/types/playerFrame';
import type { EventEmitter } from '../../src/app/utils/typedEmitter';
import { fogRectangle } from '../helpers/fogOperations';
import { measureMotionDone } from '../helpers/litView';
import { openMapView } from '../helpers/mapView';

const SIZE = 256;
const FLOOR = 0x808080;
/** Where each part of the scene shows: a hidden token, a drawing only the GM sees, a ruler the GM keeps to themselves, and fog. */
const GHOST = { x: 60, y: 60 };
const SECRET_DRAWING = { x: 128, y: 130 };
const PRIVATE_RULER = { x: 128, y: 100 };
const FOGGED = { x: 128, y: 220 };
const FRAME: PlayerFrame = { width: SIZE, height: SIZE, resolution: 1, antialias: false, centerX: SIZE / 2, centerY: SIZE / 2, scale: 1 };

/** What the canvas, a players' frame or a picture of the scene shows of the parts that differ between the GM and the players. */
interface Look {
  /** The hidden token is drawn. */
  ghost: boolean;
  /** The drawing only the GM sees is drawn. */
  secretDrawing: boolean;
  /** The ruler the GM keeps to themselves is drawn. */
  privateRuler: boolean;
  /** The fog lets the map through, as the GM's view draws it. */
  fogSeeThrough: boolean;
}

interface View {
  view: PixiRendererOrchestrator;
  store: ViewAtlasStore;
  events: EventEmitter;
  /** What the GM's canvas shows now. */
  canvas(): Promise<Look>;
  /** What a players' frame shows, as the player window captures it, and what the canvas shows right after. */
  frame(): { frame: Look; after: Look };
  /** What a picture of the scene (a thumbnail) shows. */
  picture(): Look;
  /** Whether a right-click on the fog opens its menu. */
  fogMenu(): boolean;
  /** Whether the canvas shows the hidden token, so it may be selected. */
  showsGhost(): boolean;
}

const pen = (id: string, more: Partial<DrawingStroke>): DrawingStroke =>
  ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [], color: '#ffffff', width: 8, opacity: 1, ...more });
const ruler = (id: string, more: Partial<KeptMeasure>): KeptMeasure => ({ id, kind: 'measure', shape: 'ruler', points: [], ...more });

/**
 * A map view as Atlas builds it (`PixiRendererOrchestrator` on a real renderer and its own app
 * manager), with a scene whose hidden token, GM-only drawing, private ruler and fog show only to
 * the GM, and the inputs that decide whom the canvas is drawn for: session view, Table mode, the
 * command palette's player mode and the peek.
 */
describe('whom the map view\'s canvas is drawn for', () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function open(lit = false): Promise<View> {
    const { view, app, store, events, settings, destroy } = await openMapView({ size: SIZE, floor: FLOOR });
    store.setState((state) => ({
      lighting: lit ? { ...state.lighting, enabled: true, ambient: 1 } : state.lighting,
      objects: {
        ...state.objects,
        fog: { paint: fogRectangle({ x: 0, y: 180, width: SIZE, height: 76 }) },
        drawings: { secret: pen('secret', { hidden: true, points: [{ x: 20, y: SECRET_DRAWING.y }, { x: 236, y: SECRET_DRAWING.y }] }) },
        measures: { private: ruler('private', { hidden: true, points: [{ x: 20, y: PRIVATE_RULER.y }, { x: 236, y: PRIVATE_RULER.y }] }) },
      },
    }));
    const token = (id: string, more: Partial<TokenEntity>): TokenEntity =>
      ({ id, kind: 'token', imagePath: '', size: 1, x: 0, y: 0, ...more } as TokenEntity);
    store.getState().addToken(token('ghost', { ...GHOST, isHidden: true }));
    store.getState().addToken(token('hero', { x: 180, y: 60, vision: { enabled: true } } as Partial<TokenEntity>));
    await expect.poll(() => ['ghost', 'hero'].every((id) => view.getTokenRenderer()?.getTokenSprites()[id] instanceof Container)).toBe(true);
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    cleanup.push(() => {
      target.destroy(true);
      destroy();
    });
    const lookOf = (pixels: Uint8ClampedArray | Uint8Array, floorAt: (point: { x: number; y: number }) => number): Look => {
      const at = ({ x, y }: { x: number; y: number }): number => pixels[(y * SIZE + x) * 4]!;
      const floor = (point: { x: number; y: number }): boolean => Math.abs(at(point) - floorAt(point)) <= 2;
      return { ghost: !floor(GHOST), secretDrawing: !floor(SECRET_DRAWING), privateRuler: !floor(PRIVATE_RULER), fogSeeThrough: at(FOGGED) > 8 };
    };
    const floorShade = (): number => (FLOOR >> 16) & 0xff;
    const render = (): Uint8ClampedArray => {
      app.renderer.render({ container: app.stage, target, clear: true });
      return app.renderer.extract.pixels({ target }).pixels;
    };
    const settle = async (): Promise<void> => {
      for (let i = 0; i < 4; i++) app.ticker.update(performance.now() + i * 16);
      await measureMotionDone();
      for (let i = 0; i < 4; i++) app.ticker.update(performance.now() + i * 16);
    };
    const pointer = (view as unknown as { pointer: { menuAt(x: number, y: number): boolean } }).pointer;
    await settle();
    return {
      view, store, events,
      canvas: async () => {
        await settle();
        return lookOf(render(), floorShade);
      },
      frame: () => {
        const composed = document.createElement('canvas');
        composed.width = SIZE;
        composed.height = SIZE;
        const context = composed.getContext('2d')!;
        view.withPlayerSafeFrame((piece) => context.drawImage(piece.image, piece.x, piece.y, piece.width, piece.height, piece.left, piece.top, piece.width, piece.height), settings.getLocalPlayerViewSettings(), FRAME);
        const frame = lookOf(context.getImageData(0, 0, SIZE, SIZE).data, floorShade);
        return { frame, after: lookOf(render(), floorShade) };
      },
      picture: () => view.captureSceneFrame({ x: 0, y: 0, width: SIZE, height: SIZE } as never, () => lookOf(render(), floorShade)),
      fogMenu: () => pointer.menuAt(FOGGED.x, FOGGED.y),
      showsGhost: () => view.canvasShowsToken('ghost'),
    };
  }

  const GM: Look = { ghost: true, secretDrawing: true, privateRuler: true, fogSeeThrough: true };
  const PLAYERS: Look = { ghost: false, secretDrawing: false, privateRuler: false, fogSeeThrough: false };

  it('draws the GM\'s view until one of the players\' views is switched on, and again once it is switched off', async () => {
    const s = await open();
    expect(await s.canvas()).toEqual(GM);
    expect(s.fogMenu()).toBe(true);
    expect(s.showsGhost()).toBe(true);
    const views: Array<[string, () => void, () => void]> = [
      ['session view', () => s.store.getState().setGMView(false), () => s.store.getState().setGMView(true)],
      ['Table mode', () => s.store.getState().enterTableMode(), () => s.store.getState().leaveTableMode()],
      ['the command palette\'s player mode', () => s.events.emit('player-mode-changed', true), () => s.events.emit('player-mode-changed', false)],
    ];
    for (const [name, on, off] of views) {
      on();
      expect(await s.canvas(), name).toEqual(PLAYERS);
      expect(s.fogMenu(), name).toBe(false);
      expect(s.showsGhost(), name).toBe(false);
      off();
      expect(await s.canvas(), name).toEqual(GM);
      expect(s.fogMenu(), name).toBe(true);
      expect(s.showsGhost(), name).toBe(true);
    }
  });

  it('shows the players\' lighting, fog, drawings and measurements while the peek key is held, and leaves hidden tokens to their sight', async () => {
    const unlit = await open();
    unlit.events.emit(LIGHTING_PEEK_EVENT, true);
    // On an unlit scene the players' sight says nothing of the hidden token, which the GM's peek still shows.
    expect(await unlit.canvas()).toEqual({ ...PLAYERS, ghost: true });
    expect(unlit.fogMenu()).toBe(false);
    expect(unlit.showsGhost()).toBe(true);
    unlit.events.emit(LIGHTING_PEEK_EVENT, false);
    expect(await unlit.canvas()).toEqual(GM);
    expect(unlit.fogMenu()).toBe(true);
  });

  it('leaves a hidden token out of a peek at a lit scene, as the players\' sight does', async () => {
    const lit = await open(true);
    expect(lit.showsGhost()).toBe(true);
    lit.events.emit(LIGHTING_PEEK_EVENT, true);
    expect(lit.showsGhost()).toBe(false);
    expect(lit.fogMenu()).toBe(false);
    lit.events.emit(LIGHTING_PEEK_EVENT, false);
    expect(lit.showsGhost()).toBe(true);
    expect(lit.fogMenu()).toBe(true);
  });

  it('captures the players\' frame from the GM\'s view and from each players\' view, and leaves the canvas as it was', async () => {
    const s = await open();
    expect(s.frame()).toEqual({ frame: PLAYERS, after: GM });
    s.store.getState().setGMView(false);
    await s.canvas();
    expect(s.frame()).toEqual({ frame: PLAYERS, after: PLAYERS });
    s.store.getState().setGMView(true);
    s.events.emit(LIGHTING_PEEK_EVENT, true);
    await s.canvas();
    expect(s.frame()).toEqual({ frame: PLAYERS, after: { ...PLAYERS, ghost: true } });
  });

  it('takes a picture of the scene as the GM sees it, also in session view, Table mode and the palette\'s player mode', async () => {
    const s = await open();
    // A picture leaves out what the GM keeps from the players, as their frame does; the rest is the GM's.
    const picture: Look = { ghost: true, secretDrawing: false, privateRuler: true, fogSeeThrough: true };
    expect(s.picture()).toEqual(picture);
    expect(await s.canvas()).toEqual(GM);
    for (const [on, off] of [
      [() => s.store.getState().setGMView(false), () => s.store.getState().setGMView(true)],
      [() => s.store.getState().enterTableMode(), () => s.store.getState().leaveTableMode()],
      [() => s.events.emit('player-mode-changed', true), () => s.events.emit('player-mode-changed', false)],
    ] as const) {
      on();
      await s.canvas();
      expect(s.picture()).toEqual(picture);
      expect(await s.canvas()).toEqual(PLAYERS);
      off();
    }
  });
});
