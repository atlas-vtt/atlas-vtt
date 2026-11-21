import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { marqueeSelection, picksMore, selectMoreAfter, toolSelects } from '../../../src/app/annotations/selectMore';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import type { GestureEffects, GestureHost } from '../../../src/app/pixi/input/gestureTypes';
import { SETTLE_MS, TouchGestures } from '../../../src/app/pixi/input/touchGestures';
import { LONG_PRESS_MS } from '../../../src/app/input/longPress';
import { InteractionController } from '../../../src/app/pixi/token-renderer/InteractionController';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import type { Token } from '../../../src/app/types';
import type { EventEmitter } from '../../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { FakeClock } from '../input/fakeGestureClock';

describe('Select more', () => {
  it('stays on while something is selected with a tool that selects', () => {
    expect(selectMoreAfter(true, { tool: 'move', had: 1, has: 2 })).toBe(true);
    expect(selectMoreAfter(true, { tool: 'select', had: 2, has: 1 })).toBe(true);
    // Switched on from the tool's menu before anything is selected
    expect(selectMoreAfter(true, { tool: 'move', had: 0, has: 0 })).toBe(true);
    expect(selectMoreAfter(true, { tool: 'move', had: 0, has: 1 })).toBe(true);
  });

  it('switches itself off when the selection is cleared, and with another tool', () => {
    expect(selectMoreAfter(true, { tool: 'move', had: 2, has: 0 })).toBe(false);
    expect(selectMoreAfter(true, { tool: 'fog', had: 2, has: 2 })).toBe(false);
    expect(selectMoreAfter(false, { tool: 'move', had: 1, has: 2 })).toBe(false);
    expect(toolSelects('move') && toolSelects('select')).toBe(true);
    expect(toolSelects('draw') || toolSelects('laser-pointer')).toBe(false);
  });

  it('makes a press pick more, as Shift does on its own', () => {
    expect(picksMore({ selectMore: true }, {})).toBe(true);
    expect(picksMore({ selectMore: false }, { shiftKey: true })).toBe(true);
    expect(picksMore({}, { shiftKey: false })).toBe(false);
  });

  it('makes a marquee add what it takes, and a tap on the empty map still clear the selection', () => {
    expect(marqueeSelection(['a'], ['b', 'c'], false, false)).toEqual(['b', 'c']);
    expect(marqueeSelection(['a', 'b'], ['b', 'c'], true, false)).toEqual(['a', 'b', 'c']);
    // A marquee that caught nothing keeps what was gathered; a tap lets go of it
    expect(marqueeSelection(['a'], [], true, false)).toEqual(['a']);
    expect(marqueeSelection(['a'], [], true, true)).toEqual([]);
    expect(marqueeSelection(['a'], [], false, true)).toEqual([]);
  });
});

describe('a press on a token while Select more is on', () => {
  const token = (id: string): Token => ({ id, kind: 'token', imagePath: `${id}.png`, x: 0, y: 0 });

  function setup(selectedIds: string[]): { store: ViewAtlasStore; press: (id: string) => void; release: () => void } {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `select-more-${Math.random()}`);
    const tokens = Object.fromEntries(['a', 'b', 'c'].map((id) => [id, token(id)]));
    store.setState({ persistenceEnabled: false, activeTool: 'move', selectedIds, selectMore: true, objects: { ...store.getState().objects, tokens } });
    const on = vi.fn();
    const viewport = { on, off: vi.fn(), toWorld: () => ({ x: 0, y: 0 }), plugins: { pause: vi.fn(), resume: vi.fn() } } as unknown as Viewport;
    const controller = new InteractionController(viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App);
    controller.setTokenSpriteProvider(() => null);
    const press = (id: string): void => controller.handleViewportTokenPointerDown(
      id, { button: 0, shiftKey: false, global: { x: 0, y: 0 }, stopPropagation: () => {} } as unknown as FederatedPointerEvent,
    );
    /** Lifts the pointer where it came down. */
    const release = (): void => {
      const heard = on.mock.calls.filter(([name]) => name === 'pointerup').pop();
      (heard?.[1] as ((event: { global: { x: number; y: number } }) => void) | undefined)?.({ global: { x: 0, y: 0 } });
    };
    return { store, press, release };
  }

  it('adds the token to the selection without Shift', () => {
    const { store, press } = setup(['a']);
    press('b');
    expect(store.getState().selectedIds).toEqual(['a', 'b']);
  });

  it('takes a selected token out again once the press is released in place: until then it may drag the selection', () => {
    const { store, press, release } = setup(['a', 'b']);
    press('a');
    expect(store.getState().selectedIds).toEqual(['a', 'b']);
    release();
    expect(store.getState().selectedIds).toEqual(['b']);
  });
});

describe('a finger held on the empty map', () => {
  function gestures(): { clock: FakeClock; touch: TouchGestures; log: string[] } {
    const clock = new FakeClock();
    const log: string[] = [];
    const say = (name: string) => (): void => { log.push(name); };
    const effects: GestureEffects = {
      press: say('press'), cancelPress: say('cancelPress'), secondaryClick: say('secondaryClick'), heldEmptyMap: say('heldEmptyMap'),
      beginNavigation: say('beginNavigation'), pan: say('pan'), pinch: say('pinch'), endNavigation: say('endNavigation'),
      zoomStep: say('zoomStep'), undo: say('undo'), redo: say('redo'), showRing: say('showRing'), hideRing: say('hideRing'),
    };
    const host: GestureHost = { fingerMode: () => 'objects', pressedEmptyMap: () => true, menuAt: () => false };
    return { clock, log, touch: new TouchGestures(host, effects, clock) };
  }

  it('opens the empty map\'s menu when it is lifted where it came down, and the tools still get the release', () => {
    const { clock, touch, log } = gestures();
    touch.down(1, 100, 100);
    clock.advance(SETTLE_MS);
    clock.advance(LONG_PRESS_MS);
    expect(touch.up(1, 101, 100)).toBe(true);
    expect(log).toContain('heldEmptyMap');
  });

  it('draws a marquee instead when it moves after the long press, and a tap opens nothing', () => {
    const dragged = gestures();
    dragged.touch.down(1, 100, 100);
    dragged.clock.advance(SETTLE_MS);
    dragged.clock.advance(LONG_PRESS_MS);
    expect(dragged.touch.move(1, 160, 140)).toBe(true);
    expect(dragged.touch.up(1, 160, 140)).toBe(true);
    expect(dragged.log).not.toContain('heldEmptyMap');

    const tapped = gestures();
    tapped.touch.down(1, 100, 100);
    tapped.clock.advance(SETTLE_MS);
    expect(tapped.touch.up(1, 100, 100)).toBe(true);
    expect(tapped.log).not.toContain('heldEmptyMap');
  });
});
