// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry, InitiativeState } from '../../src/app/types/initiativeTypes';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { TokenEntity } from '../../src/app/types';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';

const state = vi.hoisted(() => ({
  initiativeTrackerOpen: true,
  isDiceLogOpen: false,
  initiative: { entries: [], isActive: false, round: 0 } as unknown as InitiativeState,
  objects: { tokens: {} as Record<string, unknown> },
  tokenSettings: { showInstanceBadges: true },
  selectedIds: [] as string[],
  nextTurn: vi.fn(), previousTurn: vi.fn(), reorderInitiative: vi.fn(), startCombat: vi.fn(), endCombat: vi.fn(),
  updateInitiativeEntry: vi.fn(), resetInitiative: vi.fn(),
}));
const collection = vi.hoisted(() => ({ rules: { mode: 'turn-order', roll: '1d20', firstSide: 'players' } as InitiativeRules }));
const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
const layout = vi.hoisted(() => ({ fromTurn: true, edges: ['right'] as ('right' | 'top' | 'bottom')[], set: vi.fn() }));
const conditions = vi.hoisted(() => ({ definitions: [] as ConditionDefinition[] }));

vi.mock('../../src/app/utils/scrollWithin', () => ({ scrollWithin: vi.fn() }));
vi.mock('../../src/app/initiative/useMapInitiativeRules', () => ({ useMapInitiativeRules: () => collection.rules }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
}));
vi.mock('../../src/app/react/root/AtlasUIContext', async () => ({
  AtlasUIContext: (await import('react')).createContext(null), useAtlasUI: () => ({ app: null, view: null }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (storeState: typeof state) => unknown) => selector(state),
  useViewStoreHook: () => ({ getState: () => state, subscribe: () => () => undefined }),
}));
vi.mock('../../src/app/initiative/useInitiativeLayout', () => ({
  useInitiativeLayout: () => ({ layout: { fromTurn: layout.fromTurn, dock: layout.edges[0]!, edges: layout.edges, facesPlayers: layout.edges[0] !== 'right' }, setLayout: layout.set }),
}));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/react/hooks/useMapConditions', () => ({ useMapConditions: () => conditions.definitions }));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));
vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null, notePath: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';

const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: id, x: 0, y: 0, imagePath: '', ...extra } as TokenEntity);
const entryOf = (tokenId: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: `entry-${tokenId}`, tokenId, name: tokenId, initiative: 20 - order, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...extra,
});

/** A fight of five in round 2, the third with the turn. */
function fight(turn = 2): void {
  const names = ['ogre', 'hero', 'rat', 'cleric', 'bat'];
  state.objects.tokens = Object.fromEntries(names.map((name) => [name, token(name)]));
  state.initiative = {
    entries: names.map((name, index) => entryOf(name, index, { isActive: index === turn })),
    isActive: true, round: 2, currentIndex: turn,
  } as InitiativeState;
}

/** The list as words: each card's token, `|label|` for a divider. */
const words = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('.atlas-initiative-card, .atlas-initiative-round')].map((element) =>
    element.classList.contains('atlas-initiative-round') ? `|${element.getAttribute('aria-label') ?? ''}|` : element.getAttribute('aria-label') ?? '');

beforeEach(() => {
  vi.clearAllMocks();
  opened.entries = [];
  conditions.definitions = [];
  state.isDiceLogOpen = false;
  Object.assign(layout, { fromTurn: true, edges: ['right'] });
  collection.rules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
  fight();
});

describe('a tracker that starts at the turn', () => {
  it('runs from the combatant whose turn it is on into the next round, below a divider', () => {
    expect(words(render(<InitiativeTracker />).container)).toEqual(['rat', 'cleric', 'bat', '|Round 3|', 'ogre', 'hero']);
  });

  it('shows the order as it is without the GM\'s choice, and with no fight', () => {
    layout.fromTurn = false;
    expect(words(render(<InitiativeTracker />).container)).toEqual(['ogre', 'hero', 'rat', 'cleric', 'bat']);
  });

  it('goes by sides as groups, the side whose turn it is first', () => {
    collection.rules = { mode: 'sides', roll: '1d20', firstSide: 'players' };
    state.objects.tokens.hero = token('hero', { side: 'players' });
    state.initiative = { ...state.initiative, sides: { first: 'players', active: 'opponents' } };
    const { container } = render(<InitiativeTracker />);
    const order = [...container.querySelectorAll('.atlas-initiative-side__label, .atlas-initiative-round')].map((element) => element.textContent);
    expect(order).toEqual(['Opponents', 'Round 3', 'Players']);
  });


});

describe('the tracker\'s controls', () => {
  it('float above it, and the turn buttons below it only during a fight', () => {
    state.initiative = { ...state.initiative, isActive: false };
    const { container, rerender } = render(<InitiativeTracker />);
    expect(container.querySelector('.atlas-initiative-tracker__float--top')).not.toBeNull();
    expect(container.querySelector('.atlas-initiative-tracker__float--bottom')).toBeNull();
    expect(container.querySelector('.atlas-initiative-tracker__round')).toBeNull();
    fight();
    rerender(<InitiativeTracker />);
    expect(container.querySelectorAll('.atlas-initiative-tracker__float--bottom button')).toHaveLength(2);
  });

  it('shows the round at the list\'s foot in the players\' words', () => {
    fight();
    const { container } = render(<InitiativeTracker />);
    expect(container.querySelector('.atlas-initiative-tracker__round')?.textContent).toBe('Round 2');
  });
});

describe('where the lists stand', () => {
  it('keeps the tracker at the right edge, beside the dice log', () => {
    state.isDiceLogOpen = true;
    const { container } = render(<InitiativeTracker />);
    expect(container.querySelector('.atlas-initiative-tracker--left')).toBeNull();
    expect(container.querySelector('.atlas-initiative-tracker--beside-log')).toBeNull();
    state.isDiceLogOpen = false;
  });
});

describe('what the cards leave to the tokens', () => {
  it('shows no conditions: the token shows them on the map', () => {
    conditions.definitions = [{ id: 'poisoned', name: 'Poisoned', color: '#22aa22', icon: 'skull' }];
    state.objects.tokens.rat = token('rat', { conditions: ['poisoned'] });
    const { container } = render(<InitiativeTracker />);
    expect(container.querySelector('[aria-label="rat"] .atlas-condition-badge')).toBeNull();
  });
});

