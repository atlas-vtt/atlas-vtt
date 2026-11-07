// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SKELETON_DELAY_MS, SKELETON_MIN_VISIBLE_MS, useLoadingReveal,
} from '../../src/app/packages/components/primitives/useLoadingReveal';

function advance(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms); });
}

/** A component that is showing content when a load begins. */
function loadFromContent(): { result: { current: boolean }; rerender: (props: { loading: boolean }) => void } {
  const hook = renderHook(({ loading }) => useLoadingReveal(loading), { initialProps: { loading: false } });
  hook.rerender({ loading: true });
  return hook;
}

describe('useLoadingReveal', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows no skeleton for a load that ends within the delay', () => {
    const { result, rerender } = loadFromContent();
    advance(SKELETON_DELAY_MS - 1);
    expect(result.current).toBe(false);

    rerender({ loading: false });
    advance(SKELETON_DELAY_MS + SKELETON_MIN_VISIBLE_MS);
    expect(result.current).toBe(false);
  });

  it('shows the skeleton once the load has lasted the delay', () => {
    const { result } = loadFromContent();
    advance(SKELETON_DELAY_MS);
    expect(result.current).toBe(true);
  });

  it('keeps a skeleton that has shown for its minimum time, however soon the load ends', () => {
    const { result, rerender } = loadFromContent();
    advance(SKELETON_DELAY_MS);
    advance(50);
    rerender({ loading: false });

    advance(SKELETON_MIN_VISIBLE_MS - 51);
    expect(result.current).toBe(true);
    advance(1);
    expect(result.current).toBe(false);
  });

  it('drops the skeleton at once when the load ends after the minimum time', () => {
    const { result, rerender } = loadFromContent();
    advance(SKELETON_DELAY_MS + SKELETON_MIN_VISIBLE_MS + 200);
    rerender({ loading: false });
    advance(0);
    expect(result.current).toBe(false);
  });

  it('stays through a second load that begins while it shows', () => {
    const { result, rerender } = loadFromContent();
    advance(SKELETON_DELAY_MS);
    rerender({ loading: false });
    advance(100);
    rerender({ loading: true });
    advance(SKELETON_MIN_VISIBLE_MS);
    expect(result.current).toBe(true);
  });

  it('shows the skeleton of a load that runs at mount from the first render, and drops it when the load ends', () => {
    const { result, rerender } = renderHook(({ loading }) => useLoadingReveal(loading), { initialProps: { loading: true } });
    expect(result.current).toBe(true);

    advance(10);
    rerender({ loading: false });
    advance(0);
    expect(result.current).toBe(false);
  });
});
