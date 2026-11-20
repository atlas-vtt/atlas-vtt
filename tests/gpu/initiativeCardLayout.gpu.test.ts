import '../setup/obsidianDom';
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** Obsidian's theme as the tracker meets it: its sizes, and its own look of every button, which the cards' controls must undo. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: #2a2a2a; --background-modifier-form-field: #1a1a1a; --text-normal: #dadada; --text-muted: #b3b3b3;
    --text-faint: #777; --interactive-accent: #7f6df2; --interactive-normal: #333; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --mono-100: #fff; --mono-0: #000;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --input-height: 30px; --font-interface: sans-serif; }
  button { height: 30px; padding: 4px 12px; background-color: var(--interactive-normal); box-shadow: 0 1px 2px #000; border: 1px solid #555; }
  input[type='text'] { height: 30px; padding: 4px 8px; border: 1px solid #555; }
`;

const goblin = (id: string, name: string): Character => ({
  id, kind: 'character', name, imagePath: 'goblin.png', x: 0, y: 0, resources: { hp: { current: 4, max: 7 } },
});
const entryOf = (tokenId: string, order: number, initiative: number, awaiting = false): InitiativeEntry => ({
  id: `entry-${tokenId}`, tokenId, name: tokenId, initiative, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order,
  ...(awaiting ? { awaitingInitiative: true as const } : {}),
});

let store: ViewAtlasStore;
let settings: SettingsService;

async function show(names: boolean): Promise<HTMLElement> {
  await page.viewport(1200, 900);
  const { app } = createInMemoryApp({ files: {} });
  settings = new SettingsService(app);
  settings.setCompactInitiative(names);
  store = createViewAtlasStore(app, `initiative-layout-${Math.random()}`);
  store.setState({
    persistenceEnabled: false,
    initiativeTrackerOpen: true,
    objects: { ...store.getState().objects, tokens: { a: goblin('a', 'Goblin Archer of the Western Hills'), b: goblin('b', 'Rat') } },
    initiative: { ...createDefaultInitiativeState(), entries: [entryOf('a', 0, 18), entryOf('b', 1, 0, true)] },
  });
  const ui = { app, view: null, pixiApp: null, renderer: null } as never;
  const { container } = render(
    React.createElement(AtlasUIContext.Provider, { value: ui },
      React.createElement(ViewStoreProvider, { store }, React.createElement(InitiativeTracker))),
  );
  return container;
}

const box = (element: Element | null): DOMRect => element!.getBoundingClientRect();

describe('the GM\'s initiative cards', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => style.remove());

  it('keep the narrow tracker without names and widen it for the compact view\'s, every name inside its card in two lines at most', async () => {
    expect(box((await show(false)).querySelector('.atlas-initiative-tracker')).width).toBe(96);
    document.body.innerHTML = '';

    const container = await show(true);
    expect(box(container.querySelector('.atlas-initiative-tracker')).width).toBe(216);
    for (const card of container.querySelectorAll('.atlas-initiative-card')) {
      const name = card.querySelector<HTMLElement>('.atlas-initiative-card__name')!;
      const lineHeight = parseFloat(getComputedStyle(name).lineHeight);
      expect(box(name).height).toBeLessThanOrEqual(2 * lineHeight + 0.5);
      expect(box(name).left).toBeGreaterThanOrEqual(box(card).left);
      expect(box(name).right).toBeLessThanOrEqual(box(card).right);
    }
  });

  it('are one line in the compact view: the number a plate concentric with the card, the name beside it, the art behind', async () => {
    const container = await show(true);
    store.setState({ initiative: { ...store.getState().initiative, entries: store.getState().initiative.entries.map((entry) => ({ ...entry, imagePath: 'goblin.png' })) } });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    for (const card of container.querySelectorAll('.atlas-initiative-card')) {
      const frame = box(card);
      const border = parseFloat(getComputedStyle(card).borderTopWidth);
      const inner = parseFloat(getComputedStyle(card).borderTopLeftRadius) - border;
      const number = card.querySelector('.atlas-initiative-card__initiative')!;
      expect(box(number).left - frame.left - border).toBeCloseTo(4, 0);
      expect(box(number).top - frame.top - border).toBeCloseTo(4, 0);
      expect(parseFloat(getComputedStyle(number).borderTopLeftRadius)).toBeCloseTo(inner - 4, 1);
      const name = box(card.querySelector('.atlas-initiative-card__name'));
      expect(name.left).toBeGreaterThan(box(number).right);
      // The name in the number's height, so the line keeps one row; no bars and no conditions
      expect(name.top).toBeGreaterThanOrEqual(box(number).top - 0.5);
      expect(name.bottom).toBeLessThanOrEqual(box(number).bottom + 0.5);
      expect(card.querySelector('.atlas-initiative-card__hp-bar, .atlas-condition-badge')).toBeNull();
      // The art lies under the line, across the card's right end
      const backdrop = card.querySelector('.atlas-initiative-card__backdrop img')!;
      expect(box(backdrop).right).toBeCloseTo(frame.right - border, 0);
      expect(Number(getComputedStyle(card.querySelector('.atlas-initiative-card__name')!).zIndex)).toBeGreaterThan(Number(getComputedStyle(card.querySelector('.atlas-initiative-card__backdrop')!).zIndex));
    }
  });

  it('give every line of the compact view one height, with hit points or without, by numbers or by sides', async () => {
    const container = await show(true);
    const heights = (): number[] => [...container.querySelectorAll('.atlas-initiative-card')].map((card) => Math.round(box(card).height * 10) / 10);
    const withBar = heights();
    expect(new Set(withBar).size).toBe(1);

    const { a, b } = store.getState().objects.tokens;
    store.setState({ objects: { ...store.getState().objects, tokens: { a: { ...a!, resources: {} }, b: { ...b!, resources: { hp: { current: 4, max: 7 }, stress: { current: 1, max: 3 } } } } } });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(heights()).toEqual(withBar);

    store.setState({ initiative: { ...store.getState().initiative, isActive: true, sides: { first: 'players', active: 'players' } } });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(heights()).toEqual(withBar);
  });

  it('are square, the number inset inside the border, concentric with its corners', async () => {
    for (const card of (await show(false)).querySelectorAll('.atlas-initiative-card')) {
      const frame = box(card);
      expect(Math.abs(frame.width - frame.height)).toBeLessThan(0.5);
      const border = parseFloat(getComputedStyle(card).borderTopWidth);
      const inner = parseFloat(getComputedStyle(card).borderTopLeftRadius) - border;
      const number = card.querySelector('.atlas-initiative-card__initiative')!;
      expect(box(number).top - frame.top - border).toBeCloseTo(4, 0);
      expect(frame.right - border - box(number).right).toBeCloseTo(4, 0);
      expect(parseFloat(getComputedStyle(number).borderTopRightRadius)).toBeCloseTo(inner - 4, 1);
    }
  });

  it('show the number as a slot that turns into a field of the same size, an empty one framed, never Obsidian\'s button', async () => {
    const container = await show(false);
    const [number, empty] = [...container.querySelectorAll<HTMLElement>('.atlas-initiative-card__initiative')];
    expect(box(number!).height).toBe(24);
    expect(getComputedStyle(number!).boxShadow).toBe('none');
    // An empty slot is a field asking for a number, where a number is a plate on the art
    expect(getComputedStyle(empty!).backgroundColor).not.toBe(getComputedStyle(number!).backgroundColor);
    expect(getComputedStyle(empty!).color).not.toBe(getComputedStyle(number!).color);

    const before = box(number!);
    act(() => number!.click());
    const field = container.querySelector('.atlas-initiative-card__initiative-input')!;
    expect(box(field).height).toBe(before.height);
    expect(box(field).top).toBeCloseTo(before.top, 0);
  });

  it('fill the art with red from the bottom by the hit points lost, under the art\'s shade, in the tile and the compact line alike', async () => {
    for (const names of [false, true]) {
      const container = await show(names);
      store.setState({ initiative: { ...store.getState().initiative, entries: store.getState().initiative.entries.map((entry) => ({ ...entry, imagePath: 'goblin.png' })) } });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      for (const card of container.querySelectorAll('.atlas-initiative-card')) {
        const art = card.querySelector(names ? '.atlas-initiative-card__backdrop' : '.atlas-initiative-card__art')!;
        const wound = art.querySelector<HTMLElement>('.atlas-initiative-wound')!;
        wound.style.transition = 'none';
        // 4 of 7 left: three sevenths of the art, from its bottom edge up
        expect(box(art).bottom - box(wound).top).toBeCloseTo((box(art).height * 3) / 7, 0);
        expect(getComputedStyle(art).overflow).toBe('hidden');
      }
    }
  });
});
