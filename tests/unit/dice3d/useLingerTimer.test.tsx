// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLingerTimer } from '../../../src/app/react/components/dice3d/useLingerTimer';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('a result\'s linger timer', () => {
  it('ends after its time, holds while paused and goes on with the time left', () => {
    const onEnd = vi.fn();
    const { rerender } = renderHook(({ paused }) => useLingerTimer(10000, onEnd, paused), { initialProps: { paused: false } });
    act(() => { vi.advanceTimersByTime(6000); });
    rerender({ paused: true });
    act(() => { vi.advanceTimersByTime(30000); });
    expect(onEnd).not.toHaveBeenCalled();
    rerender({ paused: false });
    act(() => { vi.advanceTimersByTime(3900); });
    expect(onEnd).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('starts afresh on a new time and stops on none', () => {
    const onEnd = vi.fn();
    const { rerender } = renderHook(({ ms }) => useLingerTimer(ms, onEnd, false), { initialProps: { ms: 9000 as number | null } });
    act(() => { vi.advanceTimersByTime(8000); });
    rerender({ ms: 10000 });
    act(() => { vi.advanceTimersByTime(9000); });
    expect(onEnd).not.toHaveBeenCalled();
    rerender({ ms: null });
    act(() => { vi.advanceTimersByTime(60000); });
    expect(onEnd).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
