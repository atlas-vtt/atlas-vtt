// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';

import { RosterFeed } from '../../src/app/packages/components/asset-manager/encounter-builder/RosterFeed';
import { nextFeedIndex, type FeedBox } from '../../src/app/packages/components/asset-manager/encounter-builder/feedNavigation';
import type { TokenAsset } from '../../src/app/packages/components/asset-manager/types';

// jsdom has no scrolling; the feed scrolls to its top on every new search.
beforeAll(() => { Element.prototype.scrollTo = function scrollTo(): void {}; });
afterEach(() => { cleanup(); });

const key = (name: string, mods: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
  key: name, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods,
});

/**
 * Two feeds as masonry places them, in list order: 0 left (0–300), 1 right (0–100),
 * 2 right (110–400), 3 left (330–500), 4 right (410–600).
 */
const BOXES: FeedBox[] = [
  { left: 0, top: 0, bottom: 300 },
  { left: 320, top: 0, bottom: 100 },
  { left: 320, top: 110, bottom: 400 },
  { left: 0, top: 330, bottom: 500 },
  { left: 320, top: 410, bottom: 600 },
];

describe('nextFeedIndex', () => {
  it('moves up and down within a feed and stays at its ends', () => {
    expect(nextFeedIndex(BOXES, 0, key('ArrowDown'))).toBe(3);
    expect(nextFeedIndex(BOXES, 1, key('ArrowDown'))).toBe(2);
    expect(nextFeedIndex(BOXES, 2, key('ArrowDown'))).toBe(4);
    expect(nextFeedIndex(BOXES, 4, key('ArrowDown'))).toBe(4);
    expect(nextFeedIndex(BOXES, 3, key('ArrowUp'))).toBe(0);
    expect(nextFeedIndex(BOXES, 0, key('ArrowUp'))).toBe(0);
  });

  it('moves left and right to the card beside that shares most of its height', () => {
    expect(nextFeedIndex(BOXES, 0, key('ArrowRight'))).toBe(2);
    expect(nextFeedIndex(BOXES, 3, key('ArrowRight'))).toBe(4);
    expect(nextFeedIndex(BOXES, 1, key('ArrowLeft'))).toBe(0);
    expect(nextFeedIndex(BOXES, 4, key('ArrowLeft'))).toBe(3);
    expect(nextFeedIndex(BOXES, 4, key('ArrowRight'))).toBe(4);
    expect(nextFeedIndex(BOXES, 0, key('ArrowLeft'))).toBe(0);
  });

  it('steps through the list with Page Up and Down and goes to its ends with Home and End', () => {
    expect(nextFeedIndex(BOXES, 1, key('PageDown'))).toBe(2);
    expect(nextFeedIndex(BOXES, 4, key('PageDown'))).toBe(4);
    expect(nextFeedIndex(BOXES, 1, key('PageUp'))).toBe(0);
    expect(nextFeedIndex(BOXES, 2, key('Home'))).toBe(0);
    expect(nextFeedIndex(BOXES, 2, key('End'))).toBe(4);
  });

  it('leaves other keys and modified keys alone', () => {
    expect(nextFeedIndex(BOXES, 0, key('Enter'))).toBeNull();
    expect(nextFeedIndex(BOXES, 0, key('ArrowDown', { altKey: true }))).toBeNull();
    expect(nextFeedIndex(BOXES, 0, key('ArrowDown', { shiftKey: true }))).toBeNull();
    expect(nextFeedIndex(BOXES, 0, key('End', { metaKey: true }))).toBeNull();
  });
});

function token(id: string): TokenAsset {
  return { id, name: id, type: 'tokens', imagePath: `${id}.png` } as TokenAsset;
}

function renderFeed(onCountChange = vi.fn()): { cards: HTMLElement[]; onCountChange: ReturnType<typeof vi.fn> } {
  const creatures = ['Wolf', 'Goblin', 'Zombie'].map(token);
  render(
    <RosterFeed app={new App()} creatures={creatures} refinement="" countOf={() => 0} onCountChange={onCountChange} reveal={null} />,
  );
  const cards = screen.getAllByRole('article');
  // One feed, top to bottom: jsdom lays nothing out.
  cards.forEach((card, index) => {
    card.getBoundingClientRect = () => ({ left: 0, top: index * 200, bottom: index * 200 + 180 } as DOMRect);
  });
  return { cards, onCountChange };
}

describe('the encounter builder feed', () => {
  it('is a feed of creature articles, one of them the tab stop', () => {
    const { cards } = renderFeed();
    expect(screen.getByRole('feed')).toBeTruthy();
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['Wolf', 'Goblin', 'Zombie']);
    expect(cards.map((card) => card.tabIndex)).toEqual([0, -1, -1]);
    expect(cards[1]!.getAttribute('aria-posinset')).toBe('2');
    expect(cards[1]!.getAttribute('aria-setsize')).toBe('3');
  });

  it('moves focus with the arrows and keeps the tab stop where focus was', () => {
    const { cards } = renderFeed();
    cards[0]!.focus();
    fireEvent.keyDown(cards[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cards[1]);
    fireEvent.keyDown(cards[1]!, { key: 'End' });
    expect(document.activeElement).toBe(cards[2]);
    expect(cards.map((card) => card.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('adds the focused creature with Enter, and leaves Enter on a control inside it to that control', () => {
    const { cards, onCountChange } = renderFeed();
    cards[1]!.focus();
    fireEvent.keyDown(cards[1]!, { key: 'Enter' });
    expect(onCountChange).toHaveBeenCalledOnce();
    expect(onCountChange.mock.calls[0]![0].id).toBe('Goblin');
    expect(onCountChange.mock.calls[0]![1]).toBe(1);
    const add = screen.getByRole('button', { name: /Add Zombie/ });
    fireEvent.keyDown(add, { key: 'Enter' });
    expect(onCountChange).toHaveBeenCalledOnce();
  });
});
