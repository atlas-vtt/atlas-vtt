import { Container, type EventSystem } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS } from '../../../src/app/input/longPress';
import type { FingerMode, GestureEffects, GestureHost } from '../../../src/app/pixi/input/gestureTypes';
import { fingerModeOf, tapPlacingOf, type TapPlacingState } from '../../../src/app/pixi/input/mapGestureHost';
import { actsOnPress, pressActsOnCanvas } from '../../../src/app/pixi/input/pressTargets';
import { SETTLE_MS, TouchGestures } from '../../../src/app/pixi/input/touchGestures';
import { FakeClock } from './fakeGestureClock';

interface Scene {
  clock: FakeClock;
  gestures: TouchGestures;
  log: string[];
}

/** A view whose press at any point acts at once (a door's badge, a bar's + and -), with the tool of `mode` in hand. */
function onWhatActs(mode: FingerMode, menu = false): Scene {
  const clock = new FakeClock();
  const log: string[] = [];
  const say = (name: string) => (...args: unknown[]): void => { log.push(args.length ? `${name} ${args.join(' ')}` : name); };
  const effects: GestureEffects = {
    press: say('press'), cancelPress: say('cancelPress'), secondaryClick: say('secondaryClick'),
    beginNavigation: say('beginNavigation'), pan: say('pan'), pinch: say('pinch'), endNavigation: say('endNavigation'),
    zoomStep: say('zoomStep'), undo: say('undo'), redo: say('redo'), showRing: say('showRing'), hideRing: say('hideRing'),
  };
  const host: GestureHost = { fingerMode: () => mode, pressedEmptyMap: () => false, menuAt: () => menu, pressActsAt: () => true };
  return { clock, log, gestures: new TouchGestures(host, effects, clock) };
}

const pressed = (s: Scene): string[] => s.log.filter((entry) => entry.startsWith('press') || entry.startsWith('cancelPress'));

describe.each(['objects', 'tool', 'place'] as const)('a finger on what acts as it is pressed, with a tool whose finger is %s', (mode) => {
  it('presses nothing while it rests: a second finger that lands late finds nothing done, and the two navigate', () => {
    const s = onWhatActs(mode);
    s.gestures.down(1, 100, 100);
    s.clock.advance(120);
    expect(s.log).toEqual([]);
    s.gestures.down(2, 300, 100);
    s.gestures.move(1, 80, 100);
    s.gestures.move(2, 340, 100);
    expect(s.gestures.up(1, 80, 100)).toBe(false);
    expect(s.gestures.up(2, 340, 100)).toBe(false);
    expect(pressed(s)).toEqual([]);
    expect(s.log[0]).toBe('beginNavigation');
  });

  it('presses it by a tap: the tools get the press and the release together', () => {
    const s = onWhatActs(mode);
    s.gestures.down(1, 100, 100);
    s.clock.advance(SETTLE_MS + 70);
    expect(s.gestures.up(1, 101, 100)).toBe(true);
    expect(s.log).toEqual(['press 1']);
  });

  it('pans once it has left its place, and never presses', () => {
    const s = onWhatActs(mode);
    s.gestures.down(1, 100, 100);
    s.clock.advance(SETTLE_MS);
    expect(s.gestures.move(1, 120, 100)).toBe(false);
    expect(s.gestures.move(1, 150, 100)).toBe(false);
    expect(s.gestures.up(1, 150, 100)).toBe(false);
    expect(s.log).toEqual(['beginNavigation', 'pan 30 0', 'endNavigation true']);
  });

  it('opens its menu by a long press, without ever pressing it', () => {
    const s = onWhatActs(mode, true);
    s.gestures.down(1, 100, 100);
    s.clock.advance(LONG_PRESS_MS);
    expect(pressed(s)).toEqual([]);
    expect(s.log).toContain('secondaryClick 1');
  });
});

describe('a finger on what acts as it is pressed', () => {
  it('is never asked about while tokens are placed by hand or the map is only looked at', () => {
    for (const mode of ['direct', 'look'] as const) {
      const clock = new FakeClock();
      let asked = 0;
      const nothing = (): void => undefined;
      const effects: GestureEffects = {
        press: nothing, cancelPress: nothing, secondaryClick: nothing, beginNavigation: nothing, pan: nothing, pinch: nothing,
        endNavigation: nothing, zoomStep: nothing, undo: nothing, redo: nothing, showRing: nothing, hideRing: nothing,
      };
      const gestures = new TouchGestures({ fingerMode: () => mode, pressedEmptyMap: () => false, menuAt: () => false, pressActsAt: () => { asked++; return true; } }, effects, clock);
      gestures.down(1, 100, 100);
      clock.advance(SETTLE_MS);
      gestures.up(1, 100, 100);
      expect(asked).toBe(0);
    }
  });

  it('elsewhere is the tool at once, as before: a host that says no changes nothing', () => {
    const clock = new FakeClock();
    const log: string[] = [];
    const nothing = (): void => undefined;
    const effects: GestureEffects = {
      press: (id) => { log.push(`press ${id}`); }, cancelPress: nothing, secondaryClick: nothing, beginNavigation: nothing, pan: nothing, pinch: nothing,
      endNavigation: nothing, zoomStep: nothing, undo: nothing, redo: nothing, showRing: nothing, hideRing: nothing,
    };
    const gestures = new TouchGestures({ fingerMode: () => 'tool', pressedEmptyMap: () => false, menuAt: () => false, pressActsAt: () => false }, effects, clock);
    gestures.down(1, 100, 100);
    clock.advance(SETTLE_MS);
    expect(log).toEqual(['press 1']);
    expect(gestures.move(1, 150, 100)).toBe(true);
  });
});

describe('what the canvas draws that acts as it is pressed', () => {
  /** PIXI's events as far as the question goes: a press at x < 100 goes to `left`, any other to `right`. */
  const events = (left: Container, right: Container): EventSystem => (
    { rootBoundary: { rootTarget: new Container(), hitTest: (x: number) => (x < 100 ? left : right) } } as unknown as EventSystem
  );

  it('is what was marked, asked of the display object PIXI sends the press to', () => {
    const stepper = actsOnPress(new Container());
    const handle = new Container();
    expect(pressActsOnCanvas(events(stepper, handle), 50, 50)).toBe(true);
    expect(pressActsOnCanvas(events(stepper, handle), 150, 50)).toBe(false);
  });

  it('is nothing before PIXI has drawn anything to hit', () => {
    const none = { rootBoundary: { rootTarget: null, hitTest: () => { throw new Error('no root'); } } } as unknown as EventSystem;
    expect(pressActsOnCanvas(none, 50, 50)).toBe(false);
  });
});

describe('tools whose press places at once', () => {
  const state = (activeTool: string, mode: TapPlacingState['drawTool']['mode'] = 'pen'): TapPlacingState => ({ activeTool, fogTool: { shape: 'brush', brushSize: 50 }, drawTool: { mode } });

  it('hold a finger\'s press back until it lifts or leaves its place: note pins and the Draw tool\'s stamps, which are dragged too', () => {
    expect(tapPlacingOf(state('note-pin'))).toBe('press');
    expect(tapPlacingOf(state('draw', 'stamp'))).toBe('press');
    expect(fingerModeOf('note-pin', false, 'tool', tapPlacingOf(state('note-pin')))).toBe('place');
  });

  it('place by a tap alone where nothing is dragged: a sound', () => {
    expect(tapPlacingOf(state('audio'))).toBe('taps');
    expect(fingerModeOf('audio', false, 'tool', tapPlacingOf(state('audio')))).toBe('navigate');
  });

  it('leave the Draw tool\'s strokes and every other tool as they were', () => {
    for (const mode of ['pen', 'line', 'text', 'select'] as const) expect(tapPlacingOf(state('draw', mode))).toBeNull();
    for (const tool of ['move', 'select', 'measure', 'laser-pointer', 'stairs']) expect(tapPlacingOf(state(tool))).toBeNull();
  });
});
