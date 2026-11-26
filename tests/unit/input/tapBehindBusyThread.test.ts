import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS } from '../../../src/app/input/longPress';
import type { GestureEffects, GestureHost } from '../../../src/app/pixi/input/gestureTypes';
import { SETTLE_MS, TouchGestures } from '../../../src/app/pixi/input/touchGestures';
import { FakeClock } from './fakeGestureClock';

interface Scene {
  clock: FakeClock;
  gestures: TouchGestures;
  log: string[];
}

/** The move tool: `empty` says the finger is on the empty map, `menu` that what it is on has a menu. */
function scene(empty: boolean, menu: boolean): Scene {
  const clock = new FakeClock();
  const log: string[] = [];
  const say = (name: string) => (...args: unknown[]): void => { log.push(args.length ? `${name} ${args.join(' ')}` : name); };
  const effects: GestureEffects = {
    press: say('press'), cancelPress: say('cancelPress'), secondaryClick: say('secondaryClick'), heldEmptyMap: say('heldEmptyMap'),
    beginNavigation: say('beginNavigation'), pan: say('pan'), pinch: say('pinch'), endNavigation: say('endNavigation'),
    zoomStep: say('zoomStep'), undo: say('undo'), redo: say('redo'), showRing: say('showRing'), hideRing: say('hideRing'),
  };
  const host: GestureHost = { fingerMode: () => 'objects', pressedEmptyMap: () => empty, menuAt: () => menu };
  return { clock, log, gestures: new TouchGestures(host, effects, clock) };
}

/** When the finger came down and lifted, by its events' own times: 40 ms apart. */
const DOWN_AT = 1000;
const UP_AT = 1040;

describe('a tap of 40 ms whose release is heard late, behind a frame that held the thread up', () => {
  it('on a token is a tap: its menu does not open', () => {
    const s = scene(false, true);
    s.gestures.down(1, 100, 100, DOWN_AT);
    s.clock.advance(SETTLE_MS);
    // The frame ends after the long press was due; the timers that fell due run before the release is heard
    s.clock.holdUp(LONG_PRESS_MS + 100);
    expect(s.gestures.up(1, 100, 100, UP_AT)).toBe(true);
    s.clock.advance(LONG_PRESS_MS);
    expect(s.log.filter((entry) => entry.startsWith('secondaryClick') || entry.startsWith('cancelPress'))).toEqual([]);
  });

  it('on the empty map is a tap, whatever the timer said: no menu of the empty map opens, and a second tap zooms', () => {
    const s = scene(true, false);
    s.gestures.down(1, 100, 100, DOWN_AT);
    // Here the timer has run its whole course before the release is heard
    s.clock.advance(LONG_PRESS_MS + 100);
    expect(s.gestures.up(1, 100, 100, UP_AT)).toBe(true);
    expect(s.log.some((entry) => entry.startsWith('heldEmptyMap'))).toBe(false);

    s.clock.advance(50);
    s.gestures.down(2, 102, 100);
    s.clock.advance(SETTLE_MS);
    s.gestures.up(2, 102, 100);
    expect(s.log.filter((entry) => entry.startsWith('zoomStep'))).toEqual(['zoomStep 102 100 1']);
  });

  it('a finger that did rest that long on the empty map still opens its menu', () => {
    const s = scene(true, false);
    s.gestures.down(1, 100, 100, DOWN_AT);
    s.clock.advance(LONG_PRESS_MS + 100);
    s.gestures.up(1, 100, 100, DOWN_AT + LONG_PRESS_MS + 100);
    expect(s.log.filter((entry) => entry.startsWith('heldEmptyMap'))).toEqual(['heldEmptyMap 1']);
  });
});
