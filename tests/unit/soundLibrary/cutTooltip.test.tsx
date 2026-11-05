// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CutTooltip } from '../../../src/app/react/components/dm-screen/sound/CutTooltip';

beforeEach(() => {
  vi.useFakeTimers();
  globalThis.ResizeObserver ??= class { observe(): void {} unobserve(): void {} disconnect(): void {} } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function hover(cut: boolean): HTMLElement {
  const { container } = render(<CutTooltip><span className="name">Ambush at the Crossroads Beneath the Ruined Watchtower</span></CutTooltip>);
  const name = container.querySelector<HTMLElement>('.name')!;
  Object.defineProperty(name, 'scrollWidth', { configurable: true, value: cut ? 400 : 100 });
  Object.defineProperty(name, 'clientWidth', { configurable: true, value: 100 });
  fireEvent.pointerEnter(name, { pointerType: 'mouse' });
  fireEvent.pointerMove(name, { pointerType: 'mouse', clientX: 5, clientY: 5 });
  act(() => { vi.advanceTimersByTime(400); });
  return name;
}

describe('a name its line cuts', () => {
  it('shows whole in a tooltip', () => {
    expect(hover(true).dataset.state).toBe('delayed-open');
    expect(document.querySelector('.tooltip-label')?.textContent).toBe('Ambush at the Crossroads Beneath the Ruined Watchtower');
  });

  it('shows again on the next hover, after it closed', () => {
    const name = hover(true);
    fireEvent.pointerLeave(name, { pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(400); });
    expect(name.dataset.state).toBe('closed');
    fireEvent.pointerEnter(name, { pointerType: 'mouse' });
    fireEvent.pointerMove(name, { pointerType: 'mouse', clientX: 6, clientY: 6 });
    act(() => { vi.advanceTimersByTime(400); });
    expect(name.dataset.state).toBe('delayed-open');
  });

  it('shows no tooltip while it fits', () => {
    expect(hover(false).dataset.state).toBe('closed');
    expect(document.querySelector('.tooltip-label')).toBeNull();
  });
});
