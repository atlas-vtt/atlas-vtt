// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoodPlayersTag } from '../../../src/app/react/components/dm-screen/sound/PlayersRow';
import type { PlayersCopy } from '../../../src/app/soundDirector/tableClock';

const tag = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('.atlas-sound-mood__players')!;
const pointer = (type: 'pointerMove' | 'pointerLeave', element: HTMLElement): void => {
  fireEvent[type](element, { pointerType: 'mouse', clientX: 10, clientY: 10 });
};

beforeEach(() => {
  vi.useFakeTimers();
  // Radix measures the content's side; jsdom has no layout.
  globalThis.ResizeObserver ??= class { observe(): void {} unobserve(): void {} disconnect(): void {} } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a mood\'s players tag', () => {
  it('lets its tooltip go when the pointer leaves, also after its words changed while it showed', () => {
    const nowhere: PlayersCopy = { state: 'nowhere' };
    const uploading: PlayersCopy = { state: 'uploading', share: 0.41 };
    const { container, rerender } = render(<MoodPlayersTag copy={nowhere} />);
    pointer('pointerMove', tag(container));
    act(() => { vi.advanceTimersByTime(400); });
    expect(tag(container).dataset.state).toBe('delayed-open');
    // The upload began while the tooltip showed: same tag, other words.
    rerender(<MoodPlayersTag copy={uploading} />);
    expect(tag(container).textContent).toContain('41');
    pointer('pointerLeave', tag(container));
    act(() => { vi.advanceTimersByTime(400); });
    expect(tag(container).dataset.state).toBe('closed');
  });
});
