import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { afterEach, vi } from 'vitest';
import type { EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { lightZoneList } from '../../src/app/lighting/lightZones';
import { LightZoneEditor } from '../../src/app/pixi/lighting/LightZoneEditor';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let cleanup: (() => void) | null = null;
/** Destroys the editor of the running test; every test ends with it. */
export function tearDown(): void {
  cleanup?.();
  cleanup = null;
}
afterEach(tearDown);

/** A zone editor in the lighting tool's zone mode, on a store of its own. */
export interface Setup {
  store: ViewAtlasStore;
  editor: LightZoneEditor;
  bus: EventEmitter;
  canvas: HTMLCanvasElement;
  /** Called when a zone is begun on a map that holds as many as it may. */
  full: ReturnType<typeof vi.fn>;
  click: (x: number, y: number, keys?: { alt?: boolean }) => boolean;
  zones: () => ReturnType<typeof lightZoneList>;
  steps: () => number;
  undo: () => void;
}

export function setup(ambient = 1): Setup {
  const restoreGraphics = stubJsdomGraphics();
  const canvas = document.createElement('canvas');
  const events = { domElement: canvas } as unknown as EventSystem;
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `light-zone-editor-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/zones.atlasmap');
  store.getState().setSceneLighting({ enabled: true, ambient });
  const bus = new EventEmitter();
  const full = vi.fn();
  const editor = new LightZoneEditor({ viewport, canvas, store, eventBus: bus, onActiveChange: () => undefined, onFull: full });
  bus.emit('wall-submode-changed', 'light-zone');
  const history = getHistoryStore(store)!;
  history.getState().clear();
  cleanup = () => {
    editor.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  return {
    store, editor, bus, canvas, full,
    click: (x, y, keys = {}) => {
      const taken = editor.pointerDown({ x, y }, { altKey: !!keys.alt });
      editor.pointerUp();
      return taken;
    },
    zones: () => lightZoneList(store.getState().objects.lightZones),
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
  };
}

/** Draws the square (100, 100) to (300, 300), corner by corner, without closing it. */
export function corners({ click }: Setup): void {
  for (const [x, y] of [[100, 100], [300, 100], [300, 300], [100, 300]] as const) click(x, y);
}
