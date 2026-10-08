import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../src/app/types';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';

const state = vi.hoisted(() => ({
  initiativeTrackerOpen: true,
  initiative: { entries: [] as unknown[], isActive: false, round: 0 },
  objects: { tokens: {} as Record<string, unknown> },
  tokenSettings: { showInstanceBadges: true },
  addToInitiative: vi.fn(),
  removeFromInitiative: vi.fn(),
  rollAllInitiative: vi.fn(),
  rollEntryInitiative: vi.fn(),
  nextTurn: vi.fn(),
  previousTurn: vi.fn(),
  reorderInitiative: vi.fn(),
  moveToFront: vi.fn(),
  moveToBack: vi.fn(),
  startCombat: vi.fn(),
  endCombat: vi.fn(),
  updateInitiativeEntry: vi.fn(),
  updateTokens: vi.fn(),
}));

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
}));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ({ app: null, view: null }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useViewStoreHook: () => ({ getState: () => state }),
  useAtlasStore: (selector: (storeState: typeof state) => unknown) => selector(state),
}));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));
vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null, notePath: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';

const token = (id: string, isHidden = false): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: `tokens/${id}.png`, isHidden });
const entryOf = (tokenId: string, order = 0): InitiativeEntry => ({
  id: `entry-${tokenId}`, tokenId, name: tokenId, initiative: 0, initiativeModifier: 0,
  imagePath: `tokens/${tokenId}.png`, isActive: false, isNPC: true, order,
});

function clickItem(label: string): void {
  const item = opened.entries.find((entry) => entry.type === 'item' && entry.label === label);
  if (item?.type !== 'item') throw new Error(`no "${label}" item`);
  void item.onClick?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  opened.entries = [];
  state.initiative.entries = [];
  state.objects.tokens = {};
});

describe('the combatants of the initiative tracker', () => {
  it('adds no token of the map by itself and says how the GM adds one', () => {
    state.objects.tokens = { goblin: token('goblin'), rat: token('rat') };

    const { container } = render(<InitiativeTracker />);

    expect(state.addToInitiative).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.atlas-initiative-card')).toHaveLength(0);
    expect(container.querySelector('.atlas-initiative-tracker__empty')?.textContent).toMatch(/right-click/i);
  });

  it('keeps the hint away once there is a combatant', () => {
    state.objects.tokens = { goblin: token('goblin') };
    state.initiative.entries = [entryOf('goblin')];

    expect(render(<InitiativeTracker />).container.querySelector('.atlas-initiative-tracker__empty')).toBeNull();
  });

  it('removes the entry of a token that was deleted', () => {
    state.objects.tokens = { goblin: token('goblin') };
    state.initiative.entries = [entryOf('goblin'), entryOf('rat', 1)];

    render(<InitiativeTracker />);

    expect(state.removeFromInitiative.mock.calls).toEqual([['entry-rat']]);
  });

  it('marks the combatants the players do not see: those whose token is hidden', () => {
    state.objects.tokens = { goblin: token('goblin'), rat: token('rat', true) };
    state.initiative.entries = [entryOf('goblin'), entryOf('rat', 1)];

    const cards = [...render(<InitiativeTracker />).container.querySelectorAll('.atlas-initiative-card')];

    expect(cards.map((card) => card.classList.contains('atlas-initiative-card--hidden'))).toEqual([false, true]);
    expect(cards.map((card) => card.textContent?.includes('Hidden from players'))).toEqual([false, true]);
  });

  it('hides a combatant from the players and shows it again from its card', () => {
    state.objects.tokens = { goblin: token('goblin'), rat: token('rat', true) };
    state.initiative.entries = [entryOf('goblin'), entryOf('rat', 1)];
    const cards = render(<InitiativeTracker />).container.querySelectorAll('.atlas-initiative-card');

    fireEvent.contextMenu(cards[0]!);
    clickItem('Hide from Players');
    fireEvent.contextMenu(cards[1]!);
    clickItem('Show to Players');

    expect(state.updateTokens.mock.calls).toEqual([
      [[{ id: 'goblin', changes: { isHidden: true } }]],
      [[{ id: 'rat', changes: { isHidden: false } }]],
    ]);
  });
});
