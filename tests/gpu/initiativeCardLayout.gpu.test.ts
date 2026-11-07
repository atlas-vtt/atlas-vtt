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
  settings.setInitiativeNames(names);
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

  it('keep the narrow tracker without names and widen it for them, every name inside its card in two lines at most', async () => {
    expect(box((await show(false)).querySelector('.atlas-initiative-tracker')).width).toBe(96);
    document.body.innerHTML = '';

    const container = await show(true);
    expect(box(container.querySelector('.atlas-initiative-tracker')).width).toBe(168);
    for (const card of container.querySelectorAll('.atlas-initiative-card')) {
      const name = card.querySelector<HTMLElement>('.atlas-initiative-card__name')!;
      const lineHeight = parseFloat(getComputedStyle(name).lineHeight);
      expect(box(name).height).toBeLessThanOrEqual(2 * lineHeight + 0.5);
      expect(box(name).left).toBeGreaterThanOrEqual(box(card).left);
      expect(box(name).right).toBeLessThanOrEqual(box(card).right);
    }
  });

  it('keep the padding of a card and the gaps between its parts equal', async () => {
    const card = (await show(true)).querySelector('.atlas-initiative-card')!;
    const parts = [...card.children].filter((child) => getComputedStyle(child).display !== 'none').map(box);
    const frame = box(card);
    const border = parseFloat(getComputedStyle(card).borderTopWidth);
    expect(parts[0]!.top - frame.top - border).toBeCloseTo(8, 0);
    expect(frame.bottom - parts[parts.length - 1]!.bottom - border).toBeCloseTo(8, 0);
    for (let i = 1; i < parts.length; i++) expect(parts[i]!.top - parts[i - 1]!.bottom).toBeCloseTo(8, 0);
  });

  it('show the number as a slot that turns into a field of the same size, an empty one framed, never Obsidian\'s button', async () => {
    const container = await show(false);
    const [number, empty] = [...container.querySelectorAll<HTMLElement>('.atlas-initiative-card__initiative')];
    expect(box(number!).height).toBe(24);
    expect(getComputedStyle(number!).boxShadow).toBe('none');
    // An empty slot is framed like a field, where a number only shows its frame under the pointer
    expect(getComputedStyle(empty!).borderTopColor).not.toBe(getComputedStyle(number!).borderTopColor);
    expect(getComputedStyle(empty!).backgroundColor).not.toBe(getComputedStyle(number!).backgroundColor);

    const before = box(number!);
    act(() => number!.click());
    const field = container.querySelector('.atlas-initiative-card__initiative-input')!;
    expect(box(field).height).toBe(before.height);
    expect(box(field).top).toBeCloseTo(before.top, 0);
  });

  it('draw the hit point bar 4px high in a taller target, centred', async () => {
    const bar = (await show(false)).querySelector('.atlas-initiative-card__hp-bar')!;
    const meter = bar.querySelector('.atlas-initiative-card__hp-meter')!;
    expect(box(bar).height).toBe(10);
    expect(box(meter).height).toBe(4);
    expect(box(meter).top - box(bar).top).toBeCloseTo(box(bar).bottom - box(meter).bottom, 1);
    expect(getComputedStyle(bar).boxShadow).toBe('none');
  });
});
