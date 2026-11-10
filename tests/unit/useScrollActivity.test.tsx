// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useScrollActivity } from '../../src/app/packages/components/primitives/useScrollActivity';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Pane(): React.JSX.Element {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useScrollActivity(element);
  return <div ref={setElement} data-testid="pane" />;
}

it('marks an element while it scrolls and clears the mark once scrolling has stopped', () => {
  vi.useFakeTimers();
  render(<Pane />);
  const pane = screen.getByTestId('pane');
  expect(pane.hasAttribute('data-scrolling')).toBe(false);

  fireEvent.scroll(pane);
  expect(pane.hasAttribute('data-scrolling')).toBe(true);
  act(() => { vi.advanceTimersByTime(500); });
  fireEvent.scroll(pane);
  act(() => { vi.advanceTimersByTime(500); });
  expect(pane.hasAttribute('data-scrolling')).toBe(true);
  act(() => { vi.advanceTimersByTime(400); });
  expect(pane.hasAttribute('data-scrolling')).toBe(false);
});
