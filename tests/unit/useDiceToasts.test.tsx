import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiceToasts } from '../../src/app/react/components/dice/useDiceToasts';
import type { PreparedDiceRoll } from '../../src/app/react/components/dice/diceSourcePresentation';

const ROLL: PreparedDiceRoll = {
  result: { id: 'roll', timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 9, max: 20 }], modifiers: 0, total: 9 },
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useDiceToasts', () => {
  it('enters, stays, leaves and is removed on its own', () => {
    const { result } = renderHook(() => useDiceToasts());
    act(() => result.current.addToast(ROLL));
    expect(result.current.toasts.map((toast) => toast.phase)).toEqual(['entering']);

    act(() => { vi.advanceTimersByTime(350); });
    expect(result.current.toasts.map((toast) => toast.phase)).toEqual(['visible']);
    act(() => { vi.advanceTimersByTime(6650); });
    expect(result.current.toasts.map((toast) => toast.phase)).toEqual(['exiting']);
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.toasts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  // A timer that outlives its display writes state into a tree that is gone;
  // in a test file that finished, into a window that is gone too.
  it('leaves no timer behind when its display unmounts', () => {
    const { result, unmount } = renderHook(() => useDiceToasts());
    act(() => {
      result.current.addToast(ROLL);
      result.current.addToast(ROLL);
    });
    act(() => result.current.dismissToast(result.current.toasts[0]!.id));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops a dismissed card\'s own timers and removes it once', () => {
    const { result } = renderHook(() => useDiceToasts());
    act(() => result.current.addToast(ROLL));
    const { id } = result.current.toasts[0]!;

    act(() => {
      result.current.dismissToast(id);
      result.current.dismissToast(id);
    });
    expect(result.current.toasts.map((toast) => toast.phase)).toEqual(['exiting']);
    expect(vi.getTimerCount()).toBe(1);

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.toasts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dismisses every card at once and keeps none of their timers', () => {
    const { result } = renderHook(() => useDiceToasts());
    act(() => {
      result.current.addToast(ROLL);
      result.current.addToast(ROLL);
    });
    act(() => result.current.dismissAllToasts());
    expect(vi.getTimerCount()).toBe(2);

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.toasts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
