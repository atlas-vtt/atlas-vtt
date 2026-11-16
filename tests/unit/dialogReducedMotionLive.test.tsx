// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDialogWindowVariants, usePrefersReducedMotion } from '../../src/app/packages/components/primitives/dialogMotion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A `prefers-reduced-motion` query whose answer the test changes, telling its listeners as a browser does. */
function reducedMotionQuery(initial: boolean): { set: (reduce: boolean) => void } {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation((media: string) => ({
    get matches() { return media.includes('reduce') && matches; },
    media,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList);
  return { set: (reduce) => { matches = reduce; listeners.forEach((listener) => listener()); } };
}

it('follows the reduced-motion setting while the window stays mounted', () => {
  const query = reducedMotionQuery(false);
  const { result } = renderHook(() => ({ reduce: usePrefersReducedMotion(), variants: useDialogWindowVariants() }));
  expect(result.current.reduce).toBe(false);
  expect(result.current.variants.hidden).toHaveProperty('transform');

  act(() => query.set(true));
  expect(result.current.reduce).toBe(true);
  // Opacity only: nothing in the variants moves or scales the window.
  for (const name of ['hidden', 'visible', 'exit']) expect(result.current.variants[name]).not.toHaveProperty('transform');

  act(() => query.set(false));
  expect(result.current.variants.visible).toHaveProperty('transform');
});
