// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LootDraw } from '../../src/app/loot/lootRoller';

const playerWindow: { current: Window | null } = { current: null };
vi.mock('../../src/app/services/PlayerWindowService', () => ({
  PlayerWindowService: { getInstance: () => ({ getWindow: () => playerWindow.current }) },
}));

import { PlayerLootDisplay } from '../../src/app/services/PlayerLootDisplay';

function draw(id: string, name: string): LootDraw {
  return {
    id,
    notePath: 'Loot.md',
    source: [],
    name,
    price: '1 bag',
    description: 'Glows **softly**.',
    properties: [{ label: 'Trait', value: 'Agility' }],
  };
}

const names = (): string[] => [...document.querySelectorAll('.atlas-player-loot .atlas-loot-card__name')].map((el) => el.textContent ?? '');

describe('PlayerLootDisplay', () => {
  const display = PlayerLootDisplay.get();

  beforeEach(() => {
    // jsdom has no Web Animations or scrolling; the fade resolves at once.
    HTMLElement.prototype.animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);
    Element.prototype.scrollIntoView = vi.fn();
    playerWindow.current = window;
  });

  afterEach(() => {
    act(() => display.close());
    playerWindow.current = null;
  });

  it('needs an open player window', () => {
    playerWindow.current = null;
    act(() => display.toggle(draw('a', 'Rope')));
    expect(display.shownIds().size).toBe(0);
    expect(document.querySelector('.atlas-player-loot')).toBeNull();
  });

  it('stacks handed-out items in one loot window and takes one back on a second click', () => {
    const seen: number[] = [];
    const unsubscribe = display.subscribe((ids) => seen.push(ids.size));
    act(() => display.toggle(draw('a', 'Rope')));
    act(() => display.toggle(draw('b', 'Lantern')));
    expect(names()).toEqual(['Rope', 'Lantern']);
    expect(document.querySelector('.atlas-player-loot__title')?.textContent).toBe('Loot received');
    expect([...document.querySelectorAll('.atlas-player-loot .atlas-loot-card__price')].map((el) => el.textContent)).toEqual(['1 bag', '1 bag']);

    act(() => display.toggle(draw('a', 'Rope')));
    expect(names()).toEqual(['Lantern']);
    expect(seen).toEqual([1, 2, 1]);
    unsubscribe();
  });

  it('keeps one loot window while items come and go', () => {
    act(() => display.toggle(draw('a', 'Rope')));
    act(() => display.toggle(draw('a', 'Rope')));
    act(() => display.toggle(draw('b', 'Lantern')));
    expect(document.querySelectorAll('.atlas-player-loot-host:not(.atlas-panel-leaving)')).toHaveLength(1);
    expect(names().filter((name) => name === 'Lantern')).toHaveLength(1);
  });

  it('removes the loot window when the plugin unloads', () => {
    act(() => display.toggle(draw('a', 'Rope')));
    act(() => display.dispose());
    expect(document.querySelector('.atlas-player-loot-host')).toBeNull();
    expect(display.shownIds().size).toBe(0);
  });

  it('shows each item with its rarity and type', () => {
    act(() => display.toggle({ ...draw('a', 'Blessed Anlace'), type: 'Primary Weapon', rarity: 'Epic' }));
    const item = document.querySelector('.atlas-player-loot .atlas-loot-card');
    expect(item?.getAttribute('data-rarity')).toBe('epic');
    expect(item?.querySelector('.atlas-loot-card__kind')?.textContent).toBe('Epic · Primary Weapon');
  });

  it('closes with its close button', async () => {
    act(() => display.toggle(draw('a', 'Rope')));
    act(() => { document.querySelector<HTMLElement>('.atlas-player-loot__header .atlas-close-btn')?.click(); });
    expect(display.shownIds().size).toBe(0);
    await vi.waitFor(() => expect(document.querySelector('.atlas-player-loot')).toBeNull());
  });

  it('closes on Escape in the player window', async () => {
    act(() => display.toggle(draw('a', 'Rope')));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(display.shownIds().size).toBe(0);
    await vi.waitFor(() => expect(document.querySelector('.atlas-player-loot')).toBeNull());
  });

  it('closes on a click outside the loot window', async () => {
    act(() => display.toggle(draw('a', 'Rope')));
    act(() => { document.querySelector<HTMLElement>('.atlas-player-loot__window')?.click(); });
    expect(display.shownIds().size).toBe(1);
    act(() => { document.querySelector<HTMLElement>('.atlas-player-loot__scrim')?.click(); });
    expect(display.shownIds().size).toBe(0);
    await vi.waitFor(() => expect(document.querySelector('.atlas-player-loot')).toBeNull());
  });
});

describe('PlayerLootDisplay with an outlet', () => {
  const display = PlayerLootDisplay.get();

  afterEach(() => {
    act(() => display.setOutlet(null));
    act(() => display.close());
    playerWindow.current = null;
  });

  it('hands an item out through the outlet without a player window, and takes it back on a second click', () => {
    const handed: string[] = [];
    display.setOutlet((item) => (handed.push(item.name), true));
    act(() => display.toggle(draw('a', 'Rope')));
    expect(handed).toEqual(['Rope']);
    expect([...display.shownIds()]).toEqual(['a']);
    act(() => display.toggle(draw('a', 'Rope')));
    expect(display.shownIds().size).toBe(0);
    expect(handed).toEqual(['Rope']);
  });

  it('shows the item in an open player window too, and forgets what it handed out once the outlet goes', () => {
    playerWindow.current = window;
    HTMLElement.prototype.animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);
    Element.prototype.scrollIntoView = vi.fn();
    display.setOutlet(() => true);
    act(() => display.toggle(draw('b', 'Lantern')));
    expect(names()).toEqual(['Lantern']);
    playerWindow.current = null;
    act(() => display.toggle(draw('c', 'Map')));
    act(() => display.setOutlet(null));
    expect([...display.shownIds()]).toEqual(['b']);
  });
});
