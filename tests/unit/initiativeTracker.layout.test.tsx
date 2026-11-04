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
  nextTurn: vi.fn(), previousTurn: vi.fn(), reorderInitiative: vi.fn(), startCombat: vi.fn(), endCombat: vi.fn(),
  updateInitiativeEntry: vi.fn(), resetInitiative: vi.fn(), setInitiativeConfig: vi.fn(),
}));
const collection = vi.hoisted(() => ({ rules: { mode: 'turn-order', roll: '1d20', firstSide: 'players' } as InitiativeRules }));
const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
const layout = vi.hoisted(() => ({ fromTurn: true, dock: 'right' as 'left' | 'right', collapsed: false, set: vi.fn() }));
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
  useViewStoreHook: () => ({ getState: () => state }),
}));
vi.mock('../../src/app/initiative/useInitiativeLayout', () => ({
  useInitiativeLayout: () => ({ layout: { fromTurn: layout.fromTurn, dock: layout.dock, collapsed: layout.collapsed }, setLayout: layout.set }),
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
    isActive: true, round: 2, currentIndex: turn, config: { autoSort: true },
  } as InitiativeState;
}

/** The list as words: each card's token, `|label|` for a divider. */
const words = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('.atlas-initiative-card, .atlas-initiative-round')].map((element) =>
    element.classList.contains('atlas-initiative-round') ? `|${element.getAttribute('aria-label') ?? ''}|` : element.getAttribute('aria-label') ?? '');

function option(label: string): ContextMenuEntry & { type: 'item' } {
  fireEvent.click(screen.getByRole('button', { name: 'Tracker options' }));
  const item = opened.entries.find((entry) => entry.type === 'item' && entry.label === label);
  if (item?.type !== 'item') throw new Error(`no "${label}" option`);
  return item;
}

beforeEach(() => {
  vi.clearAllMocks();
  opened.entries = [];
  conditions.definitions = [];
  state.isDiceLogOpen = false;
  Object.assign(layout, { fromTurn: true, dock: 'right', collapsed: false });
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

  it('is switched in the tracker\'s options', () => {
    render(<InitiativeTracker />);
    const item = option('Turn on top');
    expect(item.checked).toBe(true);
    void item.onClick?.();
    expect(layout.set).toHaveBeenCalledWith({ fromTurn: false });
  });
});

describe('a collapsed tracker', () => {
  it('shows the turn and the next two, across the round\'s end, and how many it leaves out', () => {
    layout.collapsed = true;
    fight(4);
    const { container } = render(<InitiativeTracker />);
    expect(words(container)).toEqual(['bat', '|Round 3|', 'ogre', 'hero']);
    expect(container.querySelector('.atlas-initiative-tracker--collapsed')).not.toBeNull();
    expect(container.querySelector('.atlas-initiative-tracker__left-out')?.textContent).toBe('+2');
  });

  it('keeps the side whose turn it is in a fight by sides, while nobody in it is tracked', () => {
    layout.collapsed = true;
    collection.rules = { mode: 'sides', roll: '1d20', firstSide: 'opponents' };
    state.initiative = { ...state.initiative, entries: state.initiative.entries.map((entry) => ({ ...entry, isActive: false })), sides: { first: 'opponents', active: 'players' } };
    const { container } = render(<InitiativeTracker />);
    const order = [...container.querySelectorAll('.atlas-initiative-side__label, .atlas-initiative-round')].map((element) => element.textContent);
    expect(order).toEqual(['Players', 'Round 3', 'Opponents']);
    expect(container.querySelector('.atlas-initiative-side--active .atlas-initiative-side__label')?.textContent).toBe('Players');
    expect(container.querySelectorAll('.atlas-initiative-card')).toHaveLength(3);
  });

  it('is collapsed and expanded with the toggle at its head', () => {
    const { container, rerender } = render(<InitiativeTracker />);
    const toggle = container.querySelector<HTMLButtonElement>('.atlas-initiative-tracker__collapse')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(layout.set).toHaveBeenCalledWith({ collapsed: true });
    layout.collapsed = true;
    rerender(<InitiativeTracker />);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('where the tracker stands', () => {
  it('docks at the left edge from its options', () => {
    const { container, rerender } = render(<InitiativeTracker />);
    expect(container.querySelector('.atlas-initiative-tracker--left')).toBeNull();
    const item = option('Dock on the left');
    expect(item.checked).toBe(false);
    void item.onClick?.();
    expect(layout.set).toHaveBeenCalledWith({ dock: 'left' });
    layout.dock = 'left';
    rerender(<InitiativeTracker />);
    expect(container.querySelector('.atlas-initiative-tracker--left')).not.toBeNull();
  });

  it('moves beside the dice log while it is open at the same edge, and only there', () => {
    state.isDiceLogOpen = true;
    const { container, rerender } = render(<InitiativeTracker />);
    expect(container.querySelector('.atlas-initiative-tracker--beside-log')).toBeNull();
    layout.dock = 'left';
    rerender(<InitiativeTracker />);
    expect(container.querySelector('.atlas-initiative-tracker--beside-log')).not.toBeNull();
    state.isDiceLogOpen = false;
    rerender(<InitiativeTracker />);
    expect(container.querySelector('.atlas-initiative-tracker--beside-log')).toBeNull();
  });
});

describe('conditions on the cards', () => {
  it('shows the conditions the token shows on the map, a valued one with its number', () => {
    conditions.definitions = [
      { id: 'poisoned', name: 'Poisoned', color: '#22aa22', icon: 'skull' },
      { id: 'frightened', name: 'Frightened', color: '#aa2222', valued: true },
    ];
    state.objects.tokens.rat = token('rat', { conditions: ['frightened', 'poisoned', 'unknown'], conditionValues: { frightened: 3 } });
    const { container } = render(<InitiativeTracker />);
    const card = container.querySelector('[aria-label="rat"]')!;
    const badges = [...card.querySelectorAll('.atlas-initiative-card__condition')];
    expect(badges).toHaveLength(2);
    expect(badges[0]!.querySelector('.atlas-condition-badge__value')?.textContent).toBe('3');
    expect(badges[1]!.querySelector('svg')).not.toBeNull();
    // Each badge is named by its tooltip's label, as the map's hover card names it
    expect(badges.map((badge) => document.getElementById(badge.getAttribute('aria-labelledby') ?? '')?.textContent)).toEqual(['Frightened 3', 'Poisoned']);
    expect(container.querySelector('[aria-label="ogre"] .atlas-initiative-card__conditions')).toBeNull();
  });
});
