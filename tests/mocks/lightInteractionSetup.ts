import { vi } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { LightInteraction } from '../../src/app/pixi/lighting/LightInteraction';
import { LightMarkers } from '../../src/app/pixi/lighting/LightMarkers';
import { LightRangeRings } from '../../src/app/pixi/lighting/LightRangeRings';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { createInMemoryApp } from './inMemoryVault';
import { stubJsdomGraphics } from './jsdomGraphics';
import { genericLight } from './lights';

/** A map with a torch, its markers, range rings and the pointer on them, as the light interaction tests press and drag it. */

const FEET = { mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] } as never;
let cleanup: (() => void) | null = null;

/** Takes down what `setup` built; every test file that uses it runs this after each test. */
export function teardown(): void {
  cleanup?.();
  cleanup = null;
}

export interface Setup {
  store: ViewAtlasStore;
  lights: LightInteraction;
  markers: LightMarkers;
  rings: LightRangeRings;
  canvas: HTMLCanvasElement;
  /** A torch at (400, 300): bright 20 ft is 280 px, dim 40 ft is 560 px on the 70 px grid. */
  torch: string;
  tool: { active: boolean; moves: boolean };
  select: ReturnType<typeof vi.fn>;
  press: (x: number, y: number, keys?: { ctrl?: boolean; blocked?: boolean }) => boolean;
  move: (x: number, y: number, alt?: boolean) => void;
  up: () => void;
  steps: () => number;
  undo: () => void;
}

export function setup(doc: Document = document): Setup {
  const restoreGraphics = stubJsdomGraphics();
  window.matchMedia = (() => ({ matches: true })) as never;
  const canvas = doc.body.appendChild(doc.createElement('canvas'));
  const events = { domElement: canvas } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `light-interaction-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/lights.atlasmap');
  store.getState().setSceneLighting({ enabled: true });
  const torch = store.getState().addLight({ x: 400, y: 300, emission: { ...genericLight('torch'), kind: 'torch' } });
  const markers = new LightMarkers(viewport, store);
  const rings = new LightRangeRings(viewport, store, () => FEET);
  /** `active`: the lighting tool; `moves`: the select or move tool. */
  const tool = { active: false, moves: false };
  const select = vi.fn();
  const lights = new LightInteraction({ viewport, canvas, store, markers, rings, canMove: () => tool.active, movesThings: () => tool.moves, select });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  cleanup = () => {
    lights.destroy();
    rings.destroy();
    markers.destroy();
    viewport.destroy();
    canvas.remove();
    restoreGraphics();
  };
  return {
    store, lights, markers, rings, canvas, torch, tool, select,
    press: (x, y, keys = {}) => lights.pointerDown({ x, y }, { global: { x, y }, ctrlKey: !!keys.ctrl, metaKey: false } as never, keys.blocked),
    move: (x, y, alt = false) => { viewport.emit('pointermove', { global: { x, y }, altKey: alt } as never); },
    up: () => { viewport.emit('pointerup', {} as never); },
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
  };
}
