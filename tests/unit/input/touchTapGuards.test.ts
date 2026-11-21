import type { Viewport } from 'pixi-viewport';
import { describe, expect, it } from 'vitest';
import type { GestureEffects, GestureHost } from '../../../src/app/pixi/input/gestureTypes';
import { mapGestureHost } from '../../../src/app/pixi/input/mapGestureHost';
import { SETTLE_MS, TouchGestures } from '../../../src/app/pixi/input/touchGestures';
import { DOUBLE_TAP_MS } from '../../../src/app/pixi/input/touchTaps';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { beginHistoryTransaction, endHistoryTransaction, getHistoryStore } from '../../../src/app/stores/history';
import type { Character } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { FakeClock } from './fakeGestureClock';

interface Scene {
  clock: FakeClock;
  gestures: TouchGestures;
  log: string[];
}

function scene(): Scene {
  const clock = new FakeClock();
  const log: string[] = [];
  const say = (name: string) => (...args: unknown[]): void => { log.push(args.length ? `${name} ${args.join(' ')}` : name); };
  const effects: GestureEffects = {
    press: say('press'), cancelPress: say('cancelPress'), secondaryClick: say('secondaryClick'),
    beginNavigation: say('beginNavigation'), pan: say('pan'), pinch: say('pinch'), endNavigation: say('endNavigation'),
    zoomStep: say('zoomStep'), undo: say('undo'), redo: say('redo'), showRing: say('showRing'), hideRing: say('hideRing'),
  };
  const host: GestureHost = { fingerMode: () => 'tool', pressedEmptyMap: () => false, menuAt: () => false };
  return { clock, log, gestures: new TouchGestures(host, effects, clock) };
}

function tap(s: Scene, fingers: number, firstId = 1): void {
  for (let i = 0; i < fingers; i++) s.gestures.down(firstId + i, 100 * (i + 1), 100);
  s.clock.advance(80);
  for (let i = 0; i < fingers; i++) s.gestures.up(firstId + i, 100 * (i + 1), 100);
}

const travels = (s: Scene): string[] => s.log.filter((entry) => entry === 'undo' || entry === 'redo');

describe('a hand that rests beside the pen', () => {
  it('taps nothing: two contacts that lift together undo nothing, three redo nothing', () => {
    const s = scene();
    s.gestures.setPenDown(true);
    tap(s, 2);
    s.clock.advance(DOUBLE_TAP_MS * 2);
    tap(s, 3, 10);
    s.clock.advance(DOUBLE_TAP_MS * 2);
    expect(s.log).toEqual([]);
  });

  it('taps nothing either when the pen lands or lifts while the fingers are down', () => {
    const landing = scene();
    landing.gestures.down(1, 100, 100);
    landing.gestures.down(2, 200, 100);
    landing.gestures.setPenDown(true);
    landing.gestures.up(1, 100, 100);
    landing.gestures.up(2, 200, 100);
    landing.clock.advance(DOUBLE_TAP_MS * 2);
    expect(travels(landing)).toEqual([]);

    const lifting = scene();
    lifting.gestures.setPenDown(true);
    lifting.gestures.down(1, 100, 100);
    lifting.gestures.down(2, 200, 100);
    lifting.gestures.setPenDown(false);
    lifting.gestures.up(1, 100, 100);
    lifting.gestures.up(2, 200, 100);
    lifting.clock.advance(DOUBLE_TAP_MS * 2);
    expect(travels(lifting)).toEqual([]);
  });

  it('taps again once the pen is up and the fingers come down anew', () => {
    const s = scene();
    s.gestures.setPenDown(true);
    s.gestures.setPenDown(false);
    tap(s, 2);
    s.clock.advance(DOUBLE_TAP_MS);
    expect(travels(s)).toEqual(['undo']);
  });
});

describe('an undo that waits for a second tap', () => {
  it('is dropped by a finger that comes down before it ran: it never runs into what that finger begins', () => {
    const s = scene();
    tap(s, 2);
    s.clock.advance(100);
    s.gestures.down(5, 300, 300);
    s.clock.advance(SETTLE_MS);
    s.gestures.move(5, 400, 300);
    s.clock.advance(DOUBLE_TAP_MS * 2);
    expect(travels(s)).toEqual([]);
    expect(s.log).toContain('press 5');
    s.gestures.up(5, 400, 300);
    s.clock.advance(DOUBLE_TAP_MS * 2);
    expect(travels(s)).toEqual([]);
  });

  it('is dropped by the pen coming down', () => {
    const s = scene();
    tap(s, 2);
    s.clock.advance(100);
    s.gestures.setPenDown(true);
    s.clock.advance(DOUBLE_TAP_MS * 2);
    expect(travels(s)).toEqual([]);
  });

  it('still gives way to a second tap of two fingers, which zooms out', () => {
    const s = scene();
    tap(s, 2);
    s.clock.advance(100);
    tap(s, 2, 3);
    s.clock.advance(DOUBLE_TAP_MS * 2);
    expect(s.log.filter((entry) => entry.startsWith('zoomStep'))).toEqual(['zoomStep 150 100 -1']);
    expect(travels(s)).toEqual([]);
  });

  it('runs once nothing came down in its time, and a third tap of two is a first again', () => {
    const s = scene();
    tap(s, 2);
    s.clock.advance(100);
    tap(s, 2, 3);
    s.clock.advance(100);
    tap(s, 2, 5);
    s.clock.advance(DOUBLE_TAP_MS);
    expect(travels(s)).toEqual(['undo']);
  });
});

describe('undo and redo by a tap', () => {
  function view(): { store: ViewAtlasStore; undo: () => void; redo: () => void; x: () => number } {
    const store = createViewAtlasStore(createInMemoryApp().app, `taps-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    const host = mapGestureHost({
      store,
      viewport: { toWorld: (x: number, y: number) => ({ x, y }) } as unknown as Viewport,
      placing: () => false,
      marqueePending: () => false,
      menuAt: () => false,
      tapActsAt: () => false,
      fingers: { use: 'tool', notePen: () => undefined },
    });
    const token: Character = { id: 'token', x: 0, y: 0, size: 1, imagePath: '', kind: 'character', name: 'Token' };
    store.getState().addToken(token);
    getHistoryStore(store)?.getState().clear();
    return { store, undo: host.undo, redo: host.redo, x: () => store.getState().objects.tokens['token']!.x };
  }

  it('take a step back and forward while nothing is being written', () => {
    const { store, undo, redo, x } = view();
    store.getState().moveToken('token', 100, 0);
    undo();
    expect(x()).toBe(0);
    redo();
    expect(x()).toBe(100);
  });

  it('do nothing while a gesture has a step open: half a drag is never taken back', () => {
    const { store, undo, redo, x } = view();
    store.getState().moveToken('token', 100, 0);
    beginHistoryTransaction(store);
    store.getState().moveToken('token', 150, 0);
    undo();
    expect(x()).toBe(150);
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(1);
    redo();
    endHistoryTransaction(store);
    expect(getHistoryStore(store)?.getState().pastStates).toHaveLength(2);
    undo();
    expect(x()).toBe(100);
  });
});
