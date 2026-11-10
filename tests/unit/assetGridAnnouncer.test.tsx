// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GridAnnouncer } from '../../src/app/packages/components/asset-manager/components/GridAnnouncer';
import { RESULTS_SETTLE_MS } from '../../src/app/packages/components/asset-manager/hooks/useGridAnnouncement';
import { resultsMessage, type GridResults } from '../../src/app/packages/components/asset-manager/utils/gridAnnouncement';

const tokens = (shown: number, narrowed = true): GridResults => ({ tab: 'tokens', shown, narrowed });

describe('the results message', () => {
  it('counts what a search or filters leave, as the section header does, and says when nothing matches', () => {
    expect(resultsMessage(tokens(33))).toBe('33 tokens');
    expect(resultsMessage(tokens(0))).toBe('No tokens match');
    expect(resultsMessage({ tab: 'scenes', shown: 1, narrowed: true })).toBe('1 scene');
    expect(resultsMessage({ tab: 'party', shown: 2, narrowed: true })).toBe('2 player characters');
  });

  it('says nothing while nothing narrows the list', () => {
    expect(resultsMessage(tokens(336, false))).toBe('');
  });
});

describe('the grid announcer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const region = (): HTMLElement => screen.getByRole('status');

  it('is a polite live region that stays mounted and reads a new selection at once', () => {
    const { rerender } = render(<GridAnnouncer selectionCount={0} results={tokens(336, false)} />);
    const live = region();
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    rerender(<GridAnnouncer selectionCount={3} results={tokens(336, false)} />);
    expect(region()).toBe(live);
    expect(live.textContent).toBe('3 items selected');
    rerender(<GridAnnouncer selectionCount={1} results={tokens(336, false)} />);
    expect(live.textContent).toBe('1 item selected');
    rerender(<GridAnnouncer selectionCount={0} results={tokens(336, false)} />);
    expect(live.textContent).toBe('');
  });

  it('reads the results once they stood, so a search being typed does not chatter', () => {
    const { rerender } = render(<GridAnnouncer selectionCount={0} results={tokens(336, false)} />);
    rerender(<GridAnnouncer selectionCount={0} results={tokens(120)} />);
    act(() => { vi.advanceTimersByTime(RESULTS_SETTLE_MS - 100); });
    rerender(<GridAnnouncer selectionCount={0} results={tokens(33)} />);
    act(() => { vi.advanceTimersByTime(RESULTS_SETTLE_MS - 100); });
    expect(region().textContent).toBe('');
    act(() => { vi.advanceTimersByTime(100); });
    expect(region().textContent).toBe('33 tokens');

    rerender(<GridAnnouncer selectionCount={0} results={tokens(0)} />);
    act(() => { vi.advanceTimersByTime(RESULTS_SETTLE_MS); });
    expect(region().textContent).toBe('No tokens match');
  });

  it('says nothing for the list it mounts on, nor while the grid holds another place, and falls silent once cleared', () => {
    const { rerender } = render(<GridAnnouncer selectionCount={0} results={tokens(33)} />);
    act(() => { vi.advanceTimersByTime(RESULTS_SETTLE_MS); });
    expect(region().textContent).toBe('');
    rerender(<GridAnnouncer selectionCount={0} results={null} />);
    act(() => { vi.advanceTimersByTime(RESULTS_SETTLE_MS); });
    expect(region().textContent).toBe('');
    rerender(<GridAnnouncer selectionCount={0} results={tokens(12)} />);
    act(() => { vi.advanceTimersByTime(RESULTS_SETTLE_MS); });
    expect(region().textContent).toBe('12 tokens');
    rerender(<GridAnnouncer selectionCount={0} results={tokens(336, false)} />);
    act(() => { vi.advanceTimersByTime(RESULTS_SETTLE_MS); });
    expect(region().textContent).toBe('');
  });
});
