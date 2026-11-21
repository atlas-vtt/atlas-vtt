import { describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS, LongPress, TOUCH_SLOP_PX, movedPast } from '../../../src/app/input/longPress';
import { touchMenuPosition, noteTouchMenu, TOUCH_MENU_LIFT_PX } from '../../../src/app/input/touchMenuPoint';
import { FakeClock } from './fakeGestureClock';

function press(): { clock: FakeClock; fire: ReturnType<typeof vi.fn>; longPress: LongPress } {
  const clock = new FakeClock();
  const fire = vi.fn();
  return { clock, fire, longPress: new LongPress(clock, fire) };
}

describe('a long press whose time passes while the thread is held up', () => {
  it('is a tap when the release waited behind the frame: nothing fires', () => {
    const { clock, fire, longPress } = press();
    longPress.begin({ x: 10, y: 20 });
    clock.advance(40);
    // The finger lifted here, and a frame of half a second keeps the release from being heard until after the time
    clock.holdUp(500);
    longPress.cancel();
    clock.advance(LONG_PRESS_MS);
    expect(fire).not.toHaveBeenCalled();
  });

  it('still fires when no release waited', () => {
    const { clock, fire, longPress } = press();
    longPress.begin({ x: 10, y: 20 });
    clock.holdUp(500);
    expect(longPress.pending).toBe(true);
    clock.advance(1);
    expect(fire).toHaveBeenCalledExactlyOnceWith({ x: 10, y: 20 });
  });
});

describe('a long press', () => {
  it('fires once the finger has rested for its time, where it came down', () => {
    const { clock, fire, longPress } = press();
    longPress.begin({ x: 10, y: 20 });
    clock.advance(LONG_PRESS_MS - 1);
    expect(fire).not.toHaveBeenCalled();
    expect(longPress.pending).toBe(true);
    clock.advance(1);
    expect(fire).toHaveBeenCalledExactlyOnceWith({ x: 10, y: 20 });
    expect(longPress.pending).toBe(false);
  });

  it('still rests while the finger trembles within the tolerance', () => {
    const { clock, fire, longPress } = press();
    longPress.begin({ x: 10, y: 20 });
    expect(longPress.move({ x: 10 + TOUCH_SLOP_PX - 1, y: 20 })).toBe(true);
    clock.advance(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledOnce();
  });

  it('is a drag once the finger moved past the tolerance, also when it comes back', () => {
    const { clock, fire, longPress } = press();
    longPress.begin({ x: 10, y: 20 });
    expect(longPress.move({ x: 10, y: 20 + TOUCH_SLOP_PX })).toBe(false);
    longPress.move({ x: 10, y: 20 });
    clock.advance(LONG_PRESS_MS);
    expect(fire).not.toHaveBeenCalled();
  });

  it('never fires after it was cancelled, and a new press starts its own time', () => {
    const { clock, fire, longPress } = press();
    longPress.begin({ x: 0, y: 0 });
    clock.advance(300);
    longPress.cancel();
    clock.advance(LONG_PRESS_MS);
    expect(fire).not.toHaveBeenCalled();
    longPress.begin({ x: 5, y: 5 });
    clock.advance(300);
    longPress.begin({ x: 7, y: 7 });
    clock.advance(LONG_PRESS_MS - 1);
    expect(fire).not.toHaveBeenCalled();
    clock.advance(1);
    expect(fire).toHaveBeenCalledExactlyOnceWith({ x: 7, y: 7 });
  });

  it('measures movement as a distance, not per axis', () => {
    expect(movedPast({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(false);
    expect(movedPast({ x: 0, y: 0 }, { x: 6, y: 6 })).toBe(true);
  });
});

describe('the menu a long press asks for', () => {
  it('opens with its first row above the finger', () => {
    noteTouchMenu(200, 300, 1000);
    expect(touchMenuPosition({ x: 200, y: 300 }, 1100)).toEqual({ x: 200, y: 300 - TOUCH_MENU_LIFT_PX });
  });

  it('stays at the point where the window has no room above', () => {
    noteTouchMenu(200, 40, 1000);
    expect(touchMenuPosition({ x: 200, y: 40 }, 1100)).toEqual({ x: 200, y: 40 });
  });

  it('is only the menu opened there and then: a right-click elsewhere or later opens where it was clicked', () => {
    noteTouchMenu(200, 300, 1000);
    expect(touchMenuPosition({ x: 500, y: 300 }, 1100)).toEqual({ x: 500, y: 300 });
    expect(touchMenuPosition({ x: 200, y: 300 }, 2500)).toEqual({ x: 200, y: 300 });
    // The press is used up: the next menu at the same point is a mouse's
    noteTouchMenu(200, 300, 3000);
    touchMenuPosition({ x: 200, y: 300 }, 3010);
    expect(touchMenuPosition({ x: 200, y: 300 }, 3020)).toEqual({ x: 200, y: 300 });
  });
});
