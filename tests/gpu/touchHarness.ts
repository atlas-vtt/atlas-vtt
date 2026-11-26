/**
 * A map view for the touch tests: the real app manager with its gesture layer, the token
 * renderer's dispatch and the selection, on a canvas in the page, driven by the browser's own
 * touch and mouse input (`Input.dispatchTouchEvent`), never by synthetic pointer events.
 */
import '../setup/obsidianDom';
import type { App } from 'obsidian';
import { Container, Sprite, Texture, type Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { cdp, page } from 'vitest/browser';
import { afterEach, expect } from "vitest";
import { GridSystem } from '../../src/app/grid/GridSystem';
import { watchInput } from '../../src/app/packages/components/primitives/lastInput';
import { PixiAppManager } from '../../src/app/pixi/PixiAppManager';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';
import { TokenRenderer } from '../../src/app/pixi/TokenRenderer';
import { mapGestureHost } from '../../src/app/pixi/input/mapGestureHost';
import { pressActsOnCanvas } from '../../src/app/pixi/input/pressTargets';
import { applyNavigationMode } from '../../src/app/pixi/viewportNavigation';
import { openEmptyMapMenu } from '../../src/app/selection/emptyMapMenu';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { Character } from '../../src/app/types';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import type { TapPlacing } from '../../src/app/types/tapPlacing';
import type { FingerUse } from '../../src/app/services/deviceSettings';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { mapImageViewOf } from './../helpers/fakeMapImageView';

export const VIEW = { width: 800, height: 500 };
export const GRID = 80;
/** The token of every scene: a cell wide, its centre here. */
export const TOKEN = { x: 200, y: 200 };

export interface Point { x: number; y: number }

export interface TouchMap {
  store: ViewAtlasStore;
  viewport: Viewport;
  tokens: TokenRenderer;
  selection: SelectionManager;
  /** The PIXI application, whose ticker is the map's frame clock. */
  app: Application;
  /** The vault the view's store was made for. */
  obsidian: App;
  canvas: HTMLCanvasElement;
  /** What fingers do in a drawing tool; the test's to change. */
  fingers: { use: FingerUse; penSeen: boolean };
  /** What a tap places with the lighting tool, for a test that has one; null until it says. */
  taps: { lighting: (() => TapPlacing | null) | null };
  /** Where the token stands in the store. */
  tokenAt(): Point;
  /** The undo steps the scene holds. */
  steps(): number;
  /** The gesture layer's ring, as the viewport holds it. */
  ring(): Container;
}

function inRunnerPage({ x, y }: Point): Point {
  const host = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  return { x: host.left + x * host.width / window.innerWidth, y: host.top + y * host.height / window.innerHeight };
}

/** Real fingers: every call says where each finger that is down now is. */
export const touch = {
  async send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', fingers: Point[]): Promise<void> {
    await cdp().send('Input.dispatchTouchEvent', { type, touchPoints: fingers.map((finger, id) => ({ ...inRunnerPage(finger), id })) });
  },
  down: (...fingers: Point[]): Promise<void> => touch.send('touchStart', fingers),
  move: (...fingers: Point[]): Promise<void> => touch.send('touchMove', fingers),
  /** Lifts fingers: those given stay down. */
  up: (...staying: Point[]): Promise<void> => touch.send('touchEnd', staying),
  /** Moves the fingers from where they are to where they go in `steps` moves, a frame apart. */
  async glide(from: Point[], to: Point[], steps = 8): Promise<void> {
    for (let step = 1; step <= steps; step++) {
      await touch.move(...from.map((start, index) => ({
        x: start.x + ((to[index]!.x - start.x) * step) / steps,
        y: start.y + ((to[index]!.y - start.y) * step) / steps,
      })));
      await frame();
    }
  },
};

export const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function touchMaps(): { map: (view?: { width: number; height: number }) => Promise<TouchMap> } {
  const cleanups: Array<() => void> = [];
  afterEach(async () => {
    // No finger of one test is down in the next
    await touch.send('touchCancel', []).catch(() => undefined);
    while (cleanups.length) cleanups.pop()!();
  });

  async function map(view: { width: number; height: number } = VIEW): Promise<TouchMap> {
    await page.viewport(view.width + 100, view.height + 100);
    const host = document.body.appendChild(document.createElement('div'));
    Object.assign(host.style, { position: 'fixed', left: '0', top: '0', width: `${view.width}px`, height: `${view.height}px` });
    document.body.style.margin = '0';
    const manager = new PixiAppManager(view.width, view.height);
    await manager.init(host);
    const viewport = manager.getViewport()!;
    const app = manager.getApp();
    applyNavigationMode(viewport, 'mouse');

    const floor = new Sprite(Texture.WHITE);
    floor.tint = 0x303030;
    floor.setSize(view.width, view.height);
    viewport.addChild(floor);

    const obsidian = createInMemoryApp().app;
    const store = createViewAtlasStore(obsidian, `touch-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState((state) => ({ mapPath: 'maps/touch.atlasmap', isMapLoading: false, isGMView: true, activeTool: 'move', grid: { ...state.grid, size: GRID, snapToGrid: false } }));
    const events = new EventEmitter();
    const grid = new GridSystem(app, viewport, mapImageViewOf(floor), { size: GRID, enabled: false, color: 0xffffff });
    const selection: { manager?: SelectionManager } = {};
    const tokens = new TokenRenderer(obsidian, viewport, grid, () => selection.manager?.updateSelectionOverlay(), store, events, 'touch-test');
    tokens.setPixiApp(app);
    selection.manager = new SelectionManager(viewport, () => tokens.getTokenSprites(), store, events);
    selection.manager.setHitTestTokensProvider((x, y) => tokens.hitTestTokens(x, y));
    tokens.setGroupFrameHitTest((x, y) => selection.manager?.groupFrameContains(x, y) ?? false);
    selection.manager.reorderViewportListeners();

    const fingers = { use: 'tool' as FingerUse, penSeen: false, notePen: (): void => { fingers.penSeen = true; } };
    const taps: TouchMap['taps'] = { lighting: null };
    manager.getGestures()!.setHost(mapGestureHost({
      store, viewport, fingers,
      lightingTapPlacing: () => taps.lighting?.() ?? null,
      placing: () => false,
      marqueePending: () => selection.manager?.marqueePending ?? false,
      menuAt: (x, y) => tokens.menuAt(x, y),
      tapActsAt: (x, y) => tokens.tapActsAt(x, y),
      pressActs: { onCanvas: (x, y) => pressActsOnCanvas(app.renderer.events, x, y), onMap: (x, y) => tokens.pressActsAt(x, y) },
      emptyMapMenu: (world, at) => openEmptyMapMenu(store, tokens, world, at),
    }));
    // What the plugin does for every window: hit areas and drags go by the pointer in use
    const stopWatchingInput = watchInput(document);

    const token: Character = { id: 'token', x: TOKEN.x, y: TOKEN.y, size: 1, imagePath: '', kind: 'character', name: 'Token' };
    store.getState().addToken(token);
    await expect.poll(() => Object.values(tokens.getTokenSprites()).filter((sprite) => sprite instanceof Container).length).toBe(1);
    getHistoryStore(store)?.getState().clear();
    await frame();

    cleanups.push(() => {
      stopWatchingInput();
      selection.manager?.destroy();
      tokens.destroy();
      grid.destroy();
      manager.destroy();
      host.remove();
    });

    return {
      store, viewport, tokens, fingers, taps, app, obsidian,
      selection: selection.manager,
      canvas: manager.getCanvasElement(),
      tokenAt: () => {
        const { x, y } = store.getState().objects.tokens['token']!;
        return { x, y };
      },
      steps: () => getHistoryStore(store)?.getState().pastStates.length ?? 0,
      ring: () => viewport.children.find((child) => child.label === 'long-press-ring')!,
    };
  }
  return { map };
}

