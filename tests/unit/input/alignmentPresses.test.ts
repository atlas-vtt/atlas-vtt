import 'pixi.js/events';
import { Container, EventBoundary, FederatedPointerEvent, Rectangle, type EventSystem } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { Viewport } from 'pixi-viewport';
import { LookOnlyPointer } from '../../../src/app/pixi/input/lookOnlyPointer';
import { mapGestureHost } from '../../../src/app/pixi/input/mapGestureHost';
import { PointerGate } from '../../../src/app/pixi/input/pointerGate';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import type { ViewState } from '../../../src/app/types/viewState';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

interface Scene {
  view: ViewAtlasStore;
  /** What the map's tools heard, in order. */
  tools: string[];
  /** What the camera was told, in order. */
  camera: string[];
  /** A mouse's event as PIXI makes it of the browser's, sent the way PIXI sends it. */
  mouse(type: string, x: number, y: number, button?: number): void;
}

/** A map behind the gate as `installTouchGestures` sets it up, asking the view's own store what the map is for. */
function scene(): Scene {
  const view = createViewAtlasStore(createInMemoryApp().app, `alignment-presses-${Math.random()}`);
  const host = mapGestureHost({
    store: view,
    viewport: { toWorld: (x: number, y: number) => ({ x, y }) } as unknown as Viewport,
    placing: () => false,
    marqueePending: () => false,
    menuAt: () => false,
    tapActsAt: () => false,
    fingers: { use: 'tool', notePen: () => undefined },
  });
  const root = new Container();
  const map = new Container();
  map.eventMode = 'static';
  map.hitArea = new Rectangle(0, 0, 800, 600);
  root.addChild(map);
  const boundary = new EventBoundary(root);
  const tools: string[] = [];
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointertap', 'rightdown', 'rightclick']) map.on(type, () => tools.push(type));
  const camera: string[] = [];
  const lookOnly = new LookOnlyPointer({
    begin: () => { camera.push('begin'); },
    pan: (dx, dy) => { camera.push(`pan ${dx} ${dy}`); },
    end: () => { camera.push('end'); },
  });
  new PointerGate({ rootBoundary: boundary } as unknown as EventSystem, map, () => true, {
    active: () => host.fingerMode() === 'look',
    hear: (event) => lookOnly.hear(event),
  });
  const mouse = (type: string, x: number, y: number, button = 0): void => {
    const event = new FederatedPointerEvent(boundary);
    event.nativeEvent = {} as PointerEvent;
    event.type = type;
    event.pointerType = 'mouse';
    event.pointerId = 1;
    event.button = button;
    event.buttons = type === 'pointerdown' ? (button === 2 ? 2 : 1) : 0;
    event.global.set(x, y);
    boundary.mapEvent(event);
  };
  return { view, tools, camera, mouse };
}

const TOOLS: readonly ViewState['activeTool'][] = ['move', 'select', 'note-pin', 'fog', 'eraser', 'draw', 'measure', 'wall', 'stairs', 'laser-pointer'];

describe('the map while its grid is being aligned', () => {
  it.each(TOOLS)('gives a click to the alignment alone with the %s tool in hand, and has the tool back afterwards', (tool) => {
    const { view, tools, mouse } = scene();
    view.getState().setActiveTool(tool);
    view.getState().setGridAlignmentOpen(true);

    mouse('pointerdown', 100, 100);
    mouse('pointerup', 100, 100);
    mouse('pointerdown', 100, 100, 2);
    mouse('pointerup', 100, 100, 2);
    expect(tools).toEqual([]);

    view.getState().setGridAlignmentOpen(false);
    mouse('pointerdown', 100, 100);
    mouse('pointerup', 100, 100);
    expect(tools).toEqual(['pointerdown', 'pointerup', 'pointertap']);
  });

  it('pans by a drag, which no tool hears either', () => {
    const { view, tools, camera, mouse } = scene();
    view.getState().setActiveTool('fog');
    view.getState().setGridAlignmentOpen(true);

    mouse('pointerdown', 100, 100);
    mouse('pointermove', 130, 120);
    mouse('pointerup', 130, 120);
    expect(camera).toEqual(['begin', 'pan 30 20', 'end']);
    expect(tools).toEqual([]);
  });
});
