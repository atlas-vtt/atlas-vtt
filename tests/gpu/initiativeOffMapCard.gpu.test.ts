import '../setup/obsidianDom';
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';

const CONDITIONS: ConditionDefinition[] = [
  { id: 'frightened', name: 'Frightened', color: '#c0392b', icon: 'skull', valued: true },
  { id: 'prone', name: 'Prone', color: '#e8e0c8' },
  { id: 'poisoned', name: 'Poisoned', color: '#27ae60' },
];
vi.mock('../../src/app/react/hooks/useMapConditions', () => ({ useMapConditions: () => CONDITIONS }));

import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** Obsidian's theme as the tracker meets it (as in `initiativeListsLayout.gpu.test.ts`). */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #3a3f36; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: #2a2a2a; --background-modifier-active-hover: #303030; --background-modifier-form-field: #1a1a1a;
    --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777; --interactive-accent: #7f6df2; --interactive-normal: #333; --color-green: #44cf6e; --color-red: #fb464c;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --mono-100: #fff; --mono-0: #000;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --input-height: 30px; --font-interface: sans-serif; }
  button { height: 30px; padding: 4px 12px; background-color: var(--interactive-normal); box-shadow: 0 1px 2px #000; border: 1px solid #555; }
  .clickable-icon { background-color: transparent; box-shadow: none; border: none; color: var(--text-muted); }
`;
// Copied to /tmp/init-offmap-shots for review after a run
const SHOTS = '__screenshots__/init-offmap';

function portrait(fill: string, letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${fill}"/><text x="48" y="62" font-size="44" text-anchor="middle" fill="#fff" font-family="sans-serif">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const GOBLIN = portrait('#5b7a3a', 'G');
/** Two look-alike goblins beside the map (one hidden, with conditions) and a hero on it. */
const tokens: Record<string, Character> = {
  g1: { id: 'g1', kind: 'character', name: 'Goblin', imagePath: GOBLIN, x: -105, y: 35, instanceNumber: 1, offMap: true, isHidden: true,
    conditions: ['frightened', 'prone', 'poisoned'], conditionValues: { frightened: 2 }, resources: { hp: { current: 4, max: 7 } } },
  g2: { id: 'g2', kind: 'character', name: 'Goblin', imagePath: GOBLIN, x: -105, y: 122, instanceNumber: 2, offMap: true, resources: { hp: { current: 7, max: 7 } } },
  hero: { id: 'hero', kind: 'character', name: 'Mira', imagePath: portrait('#3a5b7a', 'M'), x: 300, y: 300, vision: { enabled: true } },
};
const entryOf = (tokenId: string, order: number, card?: number): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: tokens[tokenId]!.name, initiative: 15 - order, initiativeModifier: 0, imagePath: tokens[tokenId]!.imagePath,
  isActive: order === 0, isNPC: true, order, ...(card === undefined ? {} : { card }),
});

interface View { names: boolean; dock: 'left' | 'right'; cards: boolean }

async function show({ names, dock, cards }: View): Promise<HTMLElement> {
  document.body.innerHTML = '';
  await page.viewport(1200, 900);
  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app);
  settings.setInitiativeNames(names);
  settings.setInitiativeLayout({ fromTurn: true, dock, collapsed: false });
  const store = createViewAtlasStore(app, `off-map-card-${Math.random()}`);
  store.setState({
    persistenceEnabled: false,
    initiativeTrackerOpen: true,
    objects: { ...store.getState().objects, tokens },
    initiative: {
      ...createDefaultInitiativeState(), isActive: true, round: 1, currentIndex: 0,
      entries: [entryOf('g1', 0, cards ? 3 : undefined), entryOf('hero', 1, cards ? 7 : undefined), entryOf('g2', 2, cards ? 12 : undefined)],
      ...(cards ? { cards: { deck: 20 } } : {}),
    },
  });
  const ui = { app, view: null, pixiApp: null, renderer: null } as never;
  render(React.createElement(AtlasUIContext.Provider, { value: ui }, React.createElement(ViewStoreProvider, { store }, React.createElement(InitiativeTracker))));
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  return document.querySelector<HTMLElement>('.atlas-initiative-tracker')!;
}

const box = (element: Element | null): DOMRect => element!.getBoundingClientRect();
const overlaps = (a: DOMRect, b: DOMRect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('the card of a combatant kept beside the map', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => { style.remove(); document.body.innerHTML = ''; });

  const views: View[] = [
    { names: false, dock: 'right', cards: false },
    { names: true, dock: 'right', cards: false },
    { names: true, dock: 'left', cards: true },
    { names: false, dock: 'left', cards: true },
  ];
  for (const view of views) {
    const label = `${view.names ? 'names' : 'plain'}-${view.dock}${view.cards ? '-cards' : ''}`;
    it(`marks it in a free corner of its portrait, clear of the other badges, conditions and its number (${label})`, async () => {
      const tracker = await show(view);
      const cards = [...tracker.querySelectorAll('.atlas-initiative-card')];
      const marked = cards.filter((card) => card.querySelector('.atlas-initiative-card__off-map-badge'));
      // Only the two goblins beside the map carry it, the hero on the map does not
      expect(marked).toHaveLength(2);
      for (const card of marked) {
        const badge = box(card.querySelector('.atlas-initiative-card__off-map-badge'));
        const frame = box(card);
        expect(badge.width).toBe(18);
        expect(badge.left).toBeGreaterThanOrEqual(frame.left);
        expect(badge.right).toBeLessThanOrEqual(frame.right);
        expect(badge.top).toBeGreaterThanOrEqual(frame.top);
        const others = ['.atlas-initiative-card__instance-badge', '.atlas-initiative-card__hidden-badge', '.atlas-initiative-card__conditions',
          '.atlas-initiative-card__dealt', '.atlas-initiative-card__initiative', '.atlas-initiative-card__name'];
        for (const selector of others) {
          const other = card.querySelector(selector);
          if (other) expect(overlaps(badge, box(other)), selector).toBe(false);
        }
      }
      await page.screenshot({ path: `${SHOTS}/tracker-${label}.png`, element: tracker });
    });
  }
});
