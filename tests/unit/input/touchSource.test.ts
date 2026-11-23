// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GestureEffects, GestureHost } from '../../../src/app/pixi/input/gestureTypes';
import { SETTLE_MS, TouchGestures } from '../../../src/app/pixi/input/touchGestures';
import { TouchSource } from '../../../src/app/pixi/input/touchSource';
import { FakeClock } from './fakeGestureClock';

type PointerInit = { pointerId?: number; pointerType?: string; clientX?: number; clientY?: number; isPrimary?: boolean };

/** jsdom has no PointerEvent: an event that carries what a pointer event does. */
function pointerEvent(type: string, init: PointerInit = {}): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX ?? 100, clientY: init.clientY ?? 100 });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'touch' });
  Object.defineProperty(event, 'isPrimary', { value: init.isPrimary ?? true });
  return event;
}

interface Scene {
  clock: FakeClock;
  canvas: HTMLCanvasElement;
  source: TouchSource;
  gestures: TouchGestures;
  /** What the gestures did, in order. */
  log: string[];
  /** The fingers the gate was told are gone, with whether the tools get their release. */
  lifted: string[];
  /** Sends an event of a pointer to the canvas; returns whether the map's tools get it. */
  send(type: string, init?: PointerInit): boolean;
}

const cleanups: Array<() => void> = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

function scene(): Scene {
  const clock = new FakeClock();
  const log: string[] = [];
  const lifted: string[] = [];
  const say = (name: string) => (...args: unknown[]): void => { log.push(args.length ? `${name} ${args.join(' ')}` : name); };
  const effects: GestureEffects = {
    press: say('press'), cancelPress: say('cancelPress'), secondaryClick: say('secondaryClick'),
    beginNavigation: say('beginNavigation'), pan: say('pan'), pinch: say('pinch'), endNavigation: say('endNavigation'),
    zoomStep: say('zoomStep'), undo: say('undo'), redo: say('redo'), showRing: say('showRing'), hideRing: say('hideRing'),
  };
  const host: GestureHost = { fingerMode: () => 'tool', pressedEmptyMap: () => false, menuAt: () => false };
  const gestures = new TouchGestures(host, effects, clock);
  const canvas = document.body.appendChild(document.createElement('canvas'));
  const source = new TouchSource(
    canvas,
    (out, x, y) => { out.x = x; out.y = y; },
    gestures,
    () => undefined,
    (id, released) => { lifted.push(`${id} ${released}`); },
  );
  cleanups.push(() => {
    source.destroy();
    canvas.remove();
  });
  const send = (type: string, init?: PointerInit): boolean => {
    const event = pointerEvent(type, init);
    canvas.dispatchEvent(event);
    return source.admits(event);
  };
  return { clock, canvas, source, gestures, log, lifted, send };
}

describe('the window losing focus while a finger is down', () => {
  it('tells the tools that the press they were handed is lost, as for a touch the browser never took back itself', () => {
    const s = scene();
    s.send('pointerdown');
    s.clock.advance(SETTLE_MS);
    s.send('pointermove', { clientX: 150 });
    window.dispatchEvent(new Event('blur'));
    expect(s.log).toEqual(['press 1', 'cancelPress 1 false']);
  });

  it('forgets the finger\'s press at the gate', () => {
    const s = scene();
    s.send('pointerdown');
    s.clock.advance(SETTLE_MS);
    window.dispatchEvent(new Event('blur'));
    expect(s.lifted).toEqual(['1 false']);
  });

  it('leaves a finger that is still down nothing more to do: its moves and its release reach no one', () => {
    const s = scene();
    s.send('pointerdown');
    s.clock.advance(SETTLE_MS);
    window.dispatchEvent(new Event('blur'));
    expect(s.send('pointermove', { clientX: 180 })).toBe(false);
    expect(s.send('pointerup', { clientX: 180 })).toBe(false);
    expect(s.log).toEqual(['press 1', 'cancelPress 1 false']);
    // Lifted, it is forgotten for good: an event of that id is no one's to hold back
    expect(s.send('pointermove', { clientX: 190 })).toBe(true);
  });

  it('takes the next touch as a touch again, also when the lost finger\'s release was never heard', () => {
    const s = scene();
    s.send('pointerdown');
    s.clock.advance(SETTLE_MS);
    window.dispatchEvent(new Event('blur'));
    s.send('pointerdown', { pointerId: 2 });
    s.clock.advance(SETTLE_MS);
    expect(s.send('pointermove', { pointerId: 2, clientX: 160 })).toBe(true);
    expect(s.log.slice(-1)).toEqual(['press 2']);
  });

  it('lets go of a pen whose release was lost with the focus: fingers are gestures again', () => {
    const s = scene();
    s.send('pointerdown', { pointerType: 'pen', pointerId: 7 });
    window.dispatchEvent(new Event('blur'));
    s.send('pointerdown', { pointerId: 2 });
    s.clock.advance(SETTLE_MS);
    expect(s.log).toEqual(['press 2']);
  });
});

describe('what says where a finger is over', () => {
  it.each(['pointerover', 'pointerout', 'pointerleave'])('%s lifts no finger and is no one\'s to hold back', (type) => {
    const s = scene();
    s.send('pointerdown');
    s.clock.advance(SETTLE_MS);
    expect(s.send(type)).toBe(true);
    expect(s.lifted).toEqual([]);
    expect(s.gestures.tracks(1)).toBe(true);
    // The finger still drags, and still lifts
    expect(s.send('pointermove', { clientX: 150 })).toBe(true);
    expect(s.send('pointerup', { clientX: 150 })).toBe(true);
    expect(s.lifted).toEqual(['1 true']);
  });

  it('a release and a cancel still lift it, and say whether the tools get the release', () => {
    const s = scene();
    s.send('pointerdown');
    s.clock.advance(SETTLE_MS);
    expect(s.send('pointercancel')).toBe(true);
    expect(s.lifted).toEqual(['1 false']);
    expect(s.gestures.tracks(1)).toBe(false);
  });
});

describe('a finger\'s own times', () => {
  it('reach the gestures with its press and its release', () => {
    const s = scene();
    const down = vi.spyOn(s.gestures, 'down');
    const up = vi.spyOn(s.gestures, 'up');
    const press = pointerEvent('pointerdown');
    s.canvas.dispatchEvent(press);
    const release = pointerEvent('pointerup');
    s.canvas.dispatchEvent(release);
    expect(down).toHaveBeenCalledWith(1, 100, 100, press.timeStamp);
    expect(up).toHaveBeenCalledWith(1, 100, 100, release.timeStamp);
  });
});
