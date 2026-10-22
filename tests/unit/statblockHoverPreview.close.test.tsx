// @vitest-environment jsdom
import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { useStatblockHoverPreview } from '../../src/app/react/components/StatblockHoverPreview';

beforeEach(() => {
  Platform.isMacOS = true;
  vi.useFakeTimers();
});
afterEach(() => {
  Platform.isMacOS = false;
  vi.useRealTimers();
});

function openPreview(): { current: ReturnType<typeof useStatblockHoverPreview<string>> } {
  const { result } = renderHook(() => useStatblockHoverPreview<string>({ app: null }));
  act(() => result.current[1].showPreview('goblin', 'statblocks/Goblin.md'));
  expect(result.current[0].isVisible).toBe(true);
  return result;
}

function settle(): void {
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

describe('the statblock preview of an initiative card, which lives while Mod is held', () => {
  it('closes when Mod is released inside a pinned note, which keeps every key to itself (#501)', () => {
    const result = openPreview();
    const pinnedNote = document.body.createDiv();
    pinnedNote.addEventListener('keyup', (e) => e.stopPropagation());

    act(() => {
      fireEvent.keyUp(pinnedNote, { key: 'Meta' });
    });
    settle();

    expect(result.current[0].isVisible).toBe(false);
    pinnedNote.remove();
  });

  it('closes when the pointer moves without Mod, should the release never have been heard', () => {
    const result = openPreview();

    act(() => {
      // jsdom has no PointerEvent: a mouse event of that type carries the keys held
      window.dispatchEvent(new MouseEvent('pointermove', { metaKey: true }));
    });
    settle();
    expect(result.current[0].isVisible).toBe(true);

    act(() => {
      fireEvent.pointerMove(window);
    });
    settle();
    expect(result.current[0].isVisible).toBe(false);
  });

  it('starts one fade however long the pointer goes on moving', () => {
    const result = openPreview();
    const timeouts = vi.spyOn(window, 'setTimeout');

    act(() => {
      fireEvent.pointerMove(window);
      fireEvent.pointerMove(window);
      fireEvent.pointerMove(window);
    });

    expect(timeouts).toHaveBeenCalledTimes(1);
    settle();
    expect(result.current[0].isVisible).toBe(false);
  });
});
