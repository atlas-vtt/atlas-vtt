// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatblockFeeds } from '../../src/app/react/components/dm-screen/StatblockFeeds';
import { FEED_GAP } from '../../src/app/react/components/dm-screen/feedLayout';

// jsdom has no layout: the pane reports the width under test and each item the height of its card.
let paneWidth = 0;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('atlas-dm-statblock-feeds') ? paneWidth : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return Number(this.querySelector<HTMLElement>('[data-height]')?.dataset.height ?? 0);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function showCards(heights: number[]): HTMLElement[] {
  const { container } = render(
    <StatblockFeeds>
      {heights.map((height, index) => <div key={index} data-height={height}>Card {index}</div>)}
    </StatblockFeeds>,
  );
  return Array.from(container.querySelectorAll<HTMLElement>('.atlas-dm-statblock-feed-item'));
}

describe('StatblockFeeds', () => {
  it('shows two feeds beside each other in the pane of a 1440 px window', () => {
    paneWidth = 774;
    const [first, second, third] = showCards([400, 200, 300]);

    expect(first?.style.left).toBe('0px');
    expect(second?.style.left).toBe(`${381 + FEED_GAP}px`);
    expect(second?.style.top).toBe('0px');
    // The second feed is shorter, so the third statblock goes below the second one.
    expect(third?.style.left).toBe(`${381 + FEED_GAP}px`);
    expect(third?.style.top).toBe(`${200 + FEED_GAP}px`);
    expect([first, second, third].map((item) => item?.style.width)).toEqual(['381px', '381px', '381px']);
  });

  it('is as tall as its tallest feed, so the pane can scroll', () => {
    paneWidth = 774;
    const items = showCards([400, 200, 300]);
    expect(items[0]?.parentElement?.style.height).toBe(`${200 + FEED_GAP + 300}px`);
  });

  it('stacks the statblocks in one feed when only one fits', () => {
    paneWidth = 500;
    const [first, second] = showCards([400, 200]);
    expect(first?.style.left).toBe('0px');
    expect(second?.style.left).toBe('0px');
    expect(second?.style.top).toBe(`${400 + FEED_GAP}px`);
  });
});
