// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRememberedScroll, type ScrollMemory } from '../../src/app/packages/components/asset-manager/hooks/useRememberedScroll';

/** A pane whose content height the test controls; jsdom does no layout. */
function pane(contentHeight: number): HTMLDivElement & { grow: (height: number) => void } {
  const element = document.createElement('div');
  let height = contentHeight;
  Object.defineProperty(element, 'clientHeight', { value: 500 });
  Object.defineProperty(element, 'scrollHeight', { get: () => height });
  let top = 0;
  Object.defineProperty(element, 'scrollTop', {
    get: () => top,
    set: (value: number) => { top = Math.max(0, Math.min(value, height - 500)); },
  });
  return Object.assign(element, { grow: (next: number) => { height = next; } });
}

function memoryWith(entries: Record<string, number>): ScrollMemory & { saved: Map<string, number> } {
  const saved = new Map(Object.entries(entries));
  return { saved, scrollTopOf: (key) => saved.get(key) ?? 0, setScrollTop: (key, top) => saved.set(key, top) };
}

afterEach(() => vi.useRealTimers());

describe('useRememberedScroll', () => {
  it('scrolls back once the content is tall enough and records later scrolling', () => {
    vi.useFakeTimers();
    const element = pane(600);
    const memory = memoryWith({ 'tokens/': 1200 });
    renderHook(() => useRememberedScroll(element, 'tokens/', memory));
    expect(element.scrollTop).toBe(100);

    element.grow(3000);
    vi.advanceTimersToNextFrame();
    expect(element.scrollTop).toBe(1200);

    element.scrollTop = 400;
    element.dispatchEvent(new Event('scroll'));
    expect(memory.saved.get('tokens/')).toBe(400);
  });

  it('stops restoring when the user scrolls first', () => {
    vi.useFakeTimers();
    const element = pane(600);
    renderHook(() => useRememberedScroll(element, 'maps/', memoryWith({ 'maps/': 1200 })));
    element.dispatchEvent(new Event('wheel'));
    element.grow(3000);
    vi.advanceTimersToNextFrame();
    expect(element.scrollTop).toBe(100);
  });

  it('does not record the partial position of a restore in progress', () => {
    vi.useFakeTimers();
    const element = pane(600);
    const memory = memoryWith({ 'scenes/': 1200 });
    renderHook(() => useRememberedScroll(element, 'scenes/', memory));
    element.dispatchEvent(new Event('scroll'));
    expect(memory.saved.get('scenes/')).toBe(1200);
  });
});
