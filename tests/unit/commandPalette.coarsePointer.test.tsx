// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';

const pointer = vi.hoisted(() => ({ coarse: true }));

vi.mock('../../src/app/platform/useCoarsePointer', () => ({ useCoarsePointer: () => pointer.coarse }));
vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ view: {}, app: {} }),
}));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn(), openPlayerWindow: vi.fn() }));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isShortcutScopeActive: () => true }));

import { CommandPalette } from '../../src/app/react/components/CommandPalette';
import { PALETTE_VIEW_MARGIN } from '../../src/app/react/components/command-palette/palettePlacement';

function openPalette(): { input: HTMLElement; anchor: HTMLElement } {
  const store = create(() => ({}));
  render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={vi.fn()} /></ViewStoreProvider>);
  act(() => vi.advanceTimersByTime(100));
  const input = screen.getByPlaceholderText('Search commands…');
  const anchor = input.closest<HTMLElement>('.atlas-command-palette-anchor');
  if (!anchor) throw new Error('the palette has no anchor');
  return { input, anchor };
}

describe('the command palette under a finger', () => {
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    pointer.coarse = true;
    if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('opens at the top of its view and leaves the search field unfocused, so no keyboard rises', () => {
    const { input, anchor } = openPalette();
    expect(document.activeElement).not.toBe(input);
    expect(anchor.classList.contains('atlas-command-palette-anchor--top')).toBe(true);
    expect(anchor.style.top).toBe(`${PALETTE_VIEW_MARGIN}px`);
    expect(anchor.style.bottom).toBe('');
  });

  // A scrolling focus or `scrollIntoView` while the palette rose into place scrolled Obsidian's containers around the map, shifting it aside.
  it('with a mouse focuses its search field and highlights a command without scrolling anything around it', () => {
    pointer.coarse = false;
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { input } = openPalette();
    const onField = focus.mock.calls.filter((_, call) => focus.mock.contexts[call] === input);
    expect(onField.length).toBeGreaterThan(0);
    for (const [options] of onField) expect(options).toEqual({ preventScroll: true });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    focus.mockRestore();
  });

  it('with a mouse opens above the toolbar with its search field focused, as ever', () => {
    pointer.coarse = false;
    const { input, anchor } = openPalette();
    expect(document.activeElement).toBe(input);
    expect(anchor.classList.contains('atlas-command-palette-anchor--top')).toBe(false);
    expect(anchor.style.top).toBe('');
    expect(anchor.style.bottom).toBe('100px');
  });
});
