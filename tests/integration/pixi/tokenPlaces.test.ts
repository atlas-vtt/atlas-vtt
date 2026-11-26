// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Point, Texture, type Application, type EventSystem, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from '../../../src/app/utils/typedEmitter';
import { TokenRenderer } from '../../../src/app/pixi/token-renderer';
import { MapPointer } from '../../../src/app/pixi/pointer/MapPointer';
import { listenToViewport } from '../../../src/app/pixi/pointer/viewportPointer';
import { TokenPlaces, type TokenHolder } from '../../../src/app/pixi/token-renderer/TokenPlaces';
import { UIManager } from '../../../src/app/pixi/token-renderer/UIManager';
import { InteractionController } from '../../../src/app/pixi/token-renderer/InteractionController';
import type { TokenGroupContainer } from '../../../src/app/pixi/token-renderer/types';
import { TOKEN_UI_Z_INDEX } from '../../../src/app/pixi/TokenControlsUI';
import { ShownPlaces } from '../../../src/app/lighting/shownPlaces';
import { holdTokens } from '../../../src/app/lighting/sightOnDrop';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import type { Character } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';
import { viewAudience } from '../../helpers/viewAudience';

// jsdom has no 2D canvas, so SVG icons cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/lucideIconTexture', () => ({
  createLucideIconTexture: vi.fn(async () => new Texture()),
}));

const GRID = 70;
const ART = 'tokens/hero.png';
/** The middle of the cell at column 1, row 1. */
const START = { x: 105, y: 105 };

type Step = (ticker: Pick<Ticker, 'deltaMS'>) => void;

/** Runs the steps added to it frame by frame, as the app's ticker would. */
class FrameTicker {
  readonly steps = new Set<Step>();
  lastTime = 0;
  add(step: Step): void {
    this.steps.add(step);
  }
  remove(step: Step): void {
    this.steps.delete(step);
  }
  advance(ms: number): void {
    this.lastTime += ms;
    for (const step of [...this.steps]) step({ deltaMS: ms });
  }
}

interface At {
  x: number;
  y: number;
}

/** A view drawing one character token, `hero`, and the ways its place on the canvas is changed. */
interface Rig {
  /** Where hero's sprite, and its UI (nameplate, bars, badges), are drawn. */
  sprite(): At;
  ui(): At;
  /** Where sight and light read hero (`ShownPlaces`); undefined while they read it where the store has it. */
  shown(): At | undefined;
  /** Hero moves to `(x, y)` and is drawn there at once. */
  place(x: number, y: number): void;
  /** Hero moves to `(x, y)` and is drawn on its way there. */
  glide(x: number, y: number): void;
  /** Someone else holds hero (a player dragging it online) and moves it to `(x, y)`. */
  follow(x: number, y: number): void;
  letGo(): void;
  /** This view's pointer: a press on hero, moves and a release, at world points. */
  press(at: At): void;
  move(at: At): void;
  release(at: At): void;
  /** A touch the system takes away mid-drag. */
  cancelTouch(): void;
  /** A frame of `ms`, on the ticker and the clock playouts run on. */
  frame(ms: number): void;
  /** Nothing moves on the ticker. */
  idle(): boolean;
}

const hero = (): Character => ({ id: 'hero', kind: 'character', name: 'Hero', showNameplate: true, ...START, size: 1, layer: 0, imagePath: ART, rotation: 0, isHidden: false });

const pointerAt = (at: At): FederatedPointerEvent =>
  ({ button: 0, pointerId: 1, pointerType: 'mouse', global: new Point(at.x, at.y), clientX: at.x, clientY: at.y, stopPropagation: vi.fn(), preventDefault: vi.fn() }) as unknown as FederatedPointerEvent;

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.restoreAllMocks();
});

/** What every rig shares: the store, the viewport, a square grid snapping to cell middles, the ticker and the clock. */
function scene(): { app: ReturnType<typeof createInMemoryApp>['app']; store: ReturnType<typeof createViewAtlasStore>; viewport: Viewport; grid: GridSystem; ticker: FrameTicker; clock: { now: number; start(): void } } {
  const restoreGraphics = stubJsdomGraphics();
  const { app } = createInMemoryApp({ files: { [ART]: 'hero-bytes' } });
  const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events });
  const store = createViewAtlasStore(app, `token-places-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/places.atlasmap');
  const snap = (x: number, y: number): At => ({ x: Math.floor(x / GRID) * GRID + GRID / 2, y: Math.floor(y / GRID) * GRID + GRID / 2 });
  const grid = { getOptions: () => ({ type: 'square', size: GRID, offsetX: 0, offsetY: 0 }), snapToCellCenter: snap, snapTokenCenter: snap } as unknown as GridSystem;
  // Started once the art is shown: the art's upload waits on frames of the shared ticker, which runs on the real clock.
  const clock = { now: 1_000, start: (): void => void vi.spyOn(performance, 'now').mockImplementation(() => clock.now) };
  cleanups.push(() => {
    viewport.destroy();
    restoreGraphics();
  });
  return { app, store, viewport, grid, ticker: new FrameTicker(), clock };
}

/** Hero drawn by the view's token renderer, which follows the store. */
async function rendererRig(): Promise<Rig> {
  const { app, store, viewport, grid, ticker, clock } = scene();
  const shown = new ShownPlaces();
  // Presses reach the tokens through the map's pointer, which listens before the renderer is built
  const pointer = new MapPointer({ store, gmView: () => true, placing: () => false });
  cleanups.push(listenToViewport(pointer, viewport, document.createElement('canvas')));
  const eventBus = new EventEmitter();
  const renderer = new TokenRenderer(app, viewport, grid, () => {}, store, eventBus, viewAudience(store, eventBus).audience, 'token-places', shown);
  pointer.attach('tokens', renderer.pointer);
  renderer.setPixiApp({ ticker, canvas: document.createElement('canvas'), renderer: { generateTexture: () => new Texture() } } as unknown as Application);
  // A lighting is attached, so on a lit scene a token the players may not have seen moves at once.
  renderer.setPlayerSightProvider(() => undefined, () => false);
  renderer.setHeldPlayout({ interval: 33, lag: () => null });
  cleanups.push(() => renderer.destroy());
  store.getState().addToken(hero());
  await vi.waitFor(() => expect(renderer.getTokenSprites().hero).toBeInstanceOf(Container));
  clock.start();
  const group = (): Container => renderer.getTokenSprites().hero as Container;
  const uiLayer = viewport.children.find((child) => child.zIndex === TOKEN_UI_Z_INDEX && child.isRenderGroup)!;
  const canvas = viewport.options.events.domElement;
  return {
    sprite: () => ({ x: group().x, y: group().y }),
    ui: () => ({ x: uiLayer.children[0]!.x, y: uiLayer.children[0]!.y }),
    shown: () => shown.get('hero'),
    place: (x, y) => {
      store.getState().setSceneLighting({ enabled: true });
      store.getState().moveToken('hero', x, y);
      store.getState().setSceneLighting({ enabled: false });
    },
    glide: (x, y) => store.getState().moveToken('hero', x, y),
    follow: (x, y) => {
      holdTokens(store, ['hero']);
      store.getState().moveToken('hero', x, y);
    },
    letGo: () => holdTokens(store, []),
    press: (at) => viewport.emit('pointerdown', pointerAt(at)),
    move: (at) => viewport.emit('pointermove', pointerAt(at)),
    release: (at) => viewport.emit('pointerup', pointerAt(at)),
    cancelTouch: () => canvas.dispatchEvent(Object.assign(new Event('pointercancel'), { pointerType: 'touch' })),
    frame: (ms) => {
      clock.now += ms;
      ticker.advance(ms);
    },
    idle: () => ticker.steps.size === 0,
  };
}

/** Hero drawn by its places alone (`TokenPlaces`), with its UI (`UIManager`) and the pointer's drags (`InteractionController`): no token renderer. */
async function placesRig(): Promise<Rig> {
  const { app, store, viewport, grid, ticker, clock } = scene();
  clock.start();
  store.getState().addToken(hero());
  const group: TokenGroupContainer = Object.assign(new Container(), { tokenId: 'hero', tokenData: hero(), tokenSize: GRID, artPath: ART, strokeWidth: 0 });
  group.position.set(START.x, START.y);
  const sprite = (id: string): TokenGroupContainer | null => (id === 'hero' ? group : null);
  const ui = new UIManager(viewport, store, 'token-places');
  ui.setTokenSpriteProvider(sprite);
  ui.createTokenUI('hero', group, hero());
  const pointer = new InteractionController(viewport, store, grid, new EventEmitter(), app);
  const shown = new ShownPlaces();
  const heldBy = (id: string): TokenHolder => (!store.getState().heldTokens[id] ? null : pointer.isDraggingTokens() ? 'pointer' : 'elsewhere');
  const places = new TokenPlaces({
    getTicker: () => ticker as unknown as Ticker,
    getSprite: sprite,
    ui,
    onMove: () => {},
    reducedMotion: () => false,
    shown,
    heldPlayout: () => ({ interval: 33, lag: () => null }),
    heldBy,
  });
  pointer.setTokenSpriteProvider(sprite);
  pointer.setTokenPlaces(places);
  cleanups.push(() => {
    places.destroy();
    pointer.destroyAll();
    ui.destroyAll();
  });
  const stored = (x: number, y: number, mayGlide: boolean): void => {
    store.getState().moveToken('hero', x, y);
    places.storeMoved('hero', x, y, { loading: false, mayGlide: () => mayGlide });
  };
  const canvas = viewport.options.events.domElement;
  return {
    sprite: () => ({ x: group.x, y: group.y }),
    ui: () => ({ x: ui.getTokenUIs().hero!.getContainer().x, y: ui.getTokenUIs().hero!.getContainer().y }),
    shown: () => shown.get('hero'),
    place: (x, y) => stored(x, y, false),
    glide: (x, y) => stored(x, y, true),
    follow: (x, y) => {
      holdTokens(store, ['hero']);
      stored(x, y, true);
    },
    letGo: () => holdTokens(store, []),
    press: (at) => pointer.handleViewportTokenPointerDown('hero', pointerAt(at)),
    move: (at) => viewport.emit('pointermove', pointerAt(at)),
    release: (at) => viewport.emit('pointerup', pointerAt(at)),
    cancelTouch: () => canvas.dispatchEvent(Object.assign(new Event('pointercancel'), { pointerType: 'touch' })),
    frame: (ms) => {
      clock.now += ms;
      ticker.advance(ms);
    },
    idle: () => ticker.steps.size === 0,
  };
}

const rigs: Array<[string, () => Promise<Rig>]> = [['through the token renderer', rendererRig], ['by its places alone', placesRig]];

/** Runs frames until nothing moves, at most two seconds of them. */
function settle(rig: Rig): void {
  for (let i = 0; i < 120 && !rig.idle(); i += 1) rig.frame(16);
}

describe.each(rigs)('where a token is drawn, %s', (_name, makeRig) => {
  it('draws a token placed at once there, its UI with it, and sight reads it where the store has it', async () => {
    const rig = await makeRig();
    rig.place(385, 245);
    expect(rig.sprite()).toEqual({ x: 385, y: 245 });
    expect(rig.ui()).toEqual({ x: 385, y: 245 });
    expect(rig.shown()).toBeUndefined();
    expect(rig.idle()).toBe(true);
  });

  it('draws a gliding token on its way, its UI with it, and tells sight where it is drawn until it arrives', async () => {
    const rig = await makeRig();
    rig.glide(385, 105);
    expect(rig.sprite()).toEqual(START);
    expect(rig.shown()).toEqual(START);
    rig.frame(16);
    const between = rig.sprite();
    expect(between.x).toBeGreaterThan(START.x);
    expect(between.x).toBeLessThan(385);
    expect(rig.ui()).toEqual(between);
    expect(rig.shown()).toEqual(between);
    settle(rig);
    expect(rig.sprite()).toEqual({ x: 385, y: 105 });
    expect(rig.ui()).toEqual({ x: 385, y: 105 });
    expect(rig.shown()).toBeUndefined();
    expect(rig.idle()).toBe(true);
  });

  it('draws a dragged token under the pointer, its UI with it, then glides it from there to the cell it snaps to', async () => {
    const rig = await makeRig();
    rig.press(START);
    rig.move({ x: 150, y: 120 });
    rig.move({ x: 180, y: 130 });
    expect(rig.sprite()).toEqual({ x: 180, y: 130 });
    expect(rig.ui()).toEqual({ x: 180, y: 130 });
    expect(rig.shown()).toBeUndefined();
    rig.release({ x: 180, y: 130 });
    expect(rig.sprite()).toEqual({ x: 180, y: 130 });
    expect(rig.shown()).toEqual({ x: 180, y: 130 });
    rig.frame(16);
    expect(rig.ui()).toEqual(rig.sprite());
    expect(rig.shown()).toEqual(rig.sprite());
    settle(rig);
    expect(rig.sprite()).toEqual({ x: 175, y: 105 });
    expect(rig.ui()).toEqual({ x: 175, y: 105 });
    expect(rig.shown()).toBeUndefined();
  });

  it('puts a token whose drag a touch lost back where it was taken from, its UI with it', async () => {
    const rig = await makeRig();
    rig.press(START);
    rig.move({ x: 200, y: 105 });
    expect(rig.ui()).toEqual({ x: 200, y: 105 });
    rig.cancelTouch();
    settle(rig);
    expect(rig.sprite()).toEqual(START);
    expect(rig.ui()).toEqual(START);
    expect(rig.shown()).toBeUndefined();
  });

  it('plays out a token someone else holds, its UI with it, and tells sight where it is drawn until it rests', async () => {
    const rig = await makeRig();
    rig.follow(245, 105);
    for (let i = 0; i < 20; i += 1) {
      rig.frame(16);
      expect(rig.ui()).toEqual(rig.sprite());
      expect(rig.shown()).toEqual(rig.sprite());
    }
    expect(rig.sprite()).toEqual({ x: 245, y: 105 });
    expect(rig.idle()).toBe(false);
    rig.letGo();
    settle(rig);
    expect(rig.sprite()).toEqual({ x: 245, y: 105 });
    expect(rig.ui()).toEqual({ x: 245, y: 105 });
    expect(rig.shown()).toBeUndefined();
    expect(rig.idle()).toBe(true);
  });
});
