// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followPointer, releaseImplicitCapture } from '../../src/app/utils/pointerDrag';
import { installPointerEvents, pointerEvent } from '../helpers/pointerEvents';

beforeEach(() => { installPointerEvents(); });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.empty();
});

describe('followPointer', () => {
  it('tells of the pressing pointer\'s moves and its release, for a mouse and for a finger alike', () => {
    for (const pointerType of ['mouse', 'touch'] as const) {
      const handle = document.body.createDiv();
      const moves: number[] = [];
      const end = vi.fn();
      followPointer(handle, pointerEvent('pointerdown', { pointerId: 4, pointerType }), { move: (event) => moves.push(event.clientX), end });
      document.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, pointerType, clientX: 10 }));
      document.dispatchEvent(pointerEvent('pointermove', { pointerId: 9, pointerType, clientX: 500 }));
      document.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, pointerType, clientX: 25 }));
      document.dispatchEvent(pointerEvent('pointerup', { pointerId: 9, pointerType }));
      expect(end).not.toHaveBeenCalled();
      document.dispatchEvent(pointerEvent('pointerup', { pointerId: 4, pointerType }));
      document.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, pointerType, clientX: 90 }));
      expect(moves).toEqual([10, 25]);
      expect(end).toHaveBeenCalledTimes(1);
      expect(end.mock.calls[0]![1]).toBe(false);
    }
  });

  it('ends a pointer the browser took away as lost, and lets go of the handle', () => {
    const handle = document.body.createDiv();
    const end = vi.fn();
    const follow = followPointer(handle, pointerEvent('pointerdown', { pointerId: 4, pointerType: 'touch' }), { move: vi.fn(), end });
    follow.capture();
    expect(handle.hasPointerCapture(4)).toBe(true);
    document.dispatchEvent(pointerEvent('pointercancel', { pointerId: 4, pointerType: 'touch' }));
    expect(end.mock.calls[0]![1]).toBe(true);
    expect(handle.hasPointerCapture(4)).toBe(false);
  });

  it('stops without a word when its handle goes away', () => {
    const handle = document.body.createDiv();
    const steps = { move: vi.fn(), end: vi.fn() };
    const follow = followPointer(handle, pointerEvent('pointerdown', { pointerId: 4 }), steps);
    follow.stop();
    follow.capture();
    document.dispatchEvent(pointerEvent('pointermove', { pointerId: 4 }));
    document.dispatchEvent(pointerEvent('pointerup', { pointerId: 4 }));
    expect(steps.move).not.toHaveBeenCalled();
    expect(steps.end).not.toHaveBeenCalled();
    expect(handle.hasPointerCapture(4)).toBe(false);
  });
});

describe('releaseImplicitCapture', () => {
  it('lets go of the finger the pressed element holds, so what it moves onto hears it enter', () => {
    const die = document.body.createDiv();
    die.setPointerCapture(7);
    releaseImplicitCapture({ pointerId: 7, target: die });
    expect(die.hasPointerCapture(7)).toBe(false);
  });

  it('changes nothing for a mouse, which no element holds', () => {
    const die = document.body.createDiv();
    const release = vi.spyOn(die, 'releasePointerCapture');
    releaseImplicitCapture({ pointerId: 1, target: die });
    releaseImplicitCapture({ pointerId: 1, target: null });
    expect(release).not.toHaveBeenCalled();
  });
});
