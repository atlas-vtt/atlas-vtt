// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StatblockFeeds } from '../../src/app/react/components/dm-screen/StatblockFeeds';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  // Each card is as tall as its `data-height`; the pane is one feed wide.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return Number(this.querySelector('[data-height]')?.getAttribute('data-height') ?? 0);
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(340);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const cards = (heights: Record<string, number>): React.JSX.Element[] =>
  Object.entries(heights).map(([key, height]) => <div key={key} data-height={height} />);

function tops(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.atlas-dm-statblock-feed-item'), (item) => item.style.top);
}

it('places cards that replace others of the same count by their own heights', () => {
  const { container, rerender } = render(<StatblockFeeds>{cards({ a: 100, b: 100 })}</StatblockFeeds>);
  expect(tops(container)).toEqual(['0px', '112px']);
  rerender(<StatblockFeeds>{cards({ c: 500, d: 100 })}</StatblockFeeds>);
  expect(tops(container)).toEqual(['0px', '512px']);
});
