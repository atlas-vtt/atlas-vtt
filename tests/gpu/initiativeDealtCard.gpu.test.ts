import '../setup/obsidianDom';
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** Obsidian's theme as the tracker meets it (as in `initiativeCardLayout.gpu.test.ts`). */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: #2a2a2a; --background-modifier-form-field: #1a1a1a; --text-normal: #dadada; --text-muted: #b3b3b3;
    --text-faint: #777; --interactive-accent: #7f6df2; --interactive-normal: #333; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --mono-100: #fff; --mono-0: #000;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --input-height: 30px; --font-interface: sans-serif; }
  button { height: 30px; padding: 4px 12px; background-color: var(--interactive-normal); box-shadow: 0 1px 2px #000; border: 1px solid #555; }
`;

const goblin = (id: string, name: string): Character => ({
  id, kind: 'character', name, imagePath: 'goblin.png', x: 0, y: 0, resources: { hp: { current: 4, max: 7 } },
});
const entryOf = (tokenId: string, order: number, card?: number): InitiativeEntry => ({
  id: `entry-${tokenId}`, tokenId, name: tokenId, initiative: 0, initiativeModifier: 0, imagePath: '', isActive: order === 0, isNPC: true, order,
  ...(card === undefined ? {} : { card }),
});

/** A fight by cards from a deck of fifty: two digits on the widest card, one combatant still without a card. */
async function show(names: boolean): Promise<HTMLElement> {
  await page.viewport(1200, 900);
  const { app } = createInMemoryApp({ files: {} });
  new SettingsService(app).setInitiativeNames(names);
  const store = createViewAtlasStore(app, `dealt-card-${Math.random()}`);
  store.setState({
    persistenceEnabled: false,
    initiativeTrackerOpen: true,
    objects: { ...store.getState().objects, tokens: { a: goblin('a', 'Goblin Archer of the Western Hills'), b: goblin('b', 'Rat'), c: goblin('c', 'Wolf') } },
    initiative: { ...createDefaultInitiativeState(), isActive: true, round: 1, cards: { deck: 50 }, entries: [entryOf('a', 0, 48), entryOf('b', 1, 7), entryOf('c', 2)] },
  });
  const ui = { app, view: null, pixiApp: null, renderer: null } as never;
  const { container } = render(
    React.createElement(AtlasUIContext.Provider, { value: ui },
      React.createElement(ViewStoreProvider, { store }, React.createElement(InitiativeTracker))),
  );
  return container;
}

const box = (element: Element | null): DOMRect => element!.getBoundingClientRect();

describe('the card a combatant was dealt, on the GM\'s initiative cards', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => { style.remove(); document.body.innerHTML = ''; });

  for (const names of [false, true]) {
    it(`keeps every card's padding and gaps equal and nothing outside it ${names ? 'with names' : 'at 96 px'}`, async () => {
      const container = await show(names);
      expect(box(container.querySelector('.atlas-initiative-tracker')).width).toBe(names ? 168 : 96);
      const cards = [...container.querySelectorAll('.atlas-initiative-card')];
      expect(cards).toHaveLength(3);
      for (const card of cards) {
        const frame = box(card);
        const border = parseFloat(getComputedStyle(card).borderTopWidth);
        const parts = [...card.children].filter((child) => getComputedStyle(child).display !== 'none' && getComputedStyle(child).position !== 'absolute').map(box);
        expect(parts[0]!.top - frame.top - border).toBeCloseTo(8, 0);
        expect(frame.bottom - parts[parts.length - 1]!.bottom - border).toBeCloseTo(8, 0);
        for (let i = 1; i < parts.length; i++) expect(parts[i]!.top - parts[i - 1]!.bottom).toBeCloseTo(8, 0);
        for (const part of parts) {
          expect(part.left).toBeGreaterThanOrEqual(frame.left);
          expect(part.right).toBeLessThanOrEqual(frame.right);
        }
      }
    });
  }

  it('stands where the number does, as tall as the number slot, its number inside its face', async () => {
    const container = await show(false);
    const faces = [...container.querySelectorAll<HTMLElement>('.atlas-initiative-card__dealt')];
    expect(faces.map((face) => face.firstChild?.textContent)).toEqual(['48', '7', '–']);
    expect(container.querySelector('.atlas-initiative-card__initiative')).toBeNull();
    for (const face of faces) {
      expect(box(face).height).toBe(24);
      expect(face.scrollWidth).toBeLessThanOrEqual(face.clientWidth);
      const digits = box(face.firstElementChild);
      expect(digits.left).toBeGreaterThanOrEqual(box(face).left);
      expect(digits.right).toBeLessThanOrEqual(box(face).right);
      // The label for screen readers takes no room
      expect(box(face.querySelector('.atlas-initiative-card__dealt-label')).width).toBeLessThanOrEqual(1);
    }
  });
});
