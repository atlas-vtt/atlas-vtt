import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry, InitiativeState } from '../../src/app/types/initiativeTypes';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { TokenEntity } from '../../src/app/types';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';

const state = vi.hoisted(() => ({
  initiativeTrackerOpen: true,
  initiative: { entries: [], isActive: false, round: 0 } as unknown as InitiativeState,
  objects: { tokens: {} as Record<string, unknown> },
  tokenSettings: { showInstanceBadges: true },
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
  setInitiativeSitsOut: vi.fn(),
  resetInitiative: vi.fn(),
}));
const collection = vi.hoisted(() => ({ rules: { mode: 'sides', roll: '1d20', firstSide: 'players' } as InitiativeRules }));
const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));

const scrolls = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../src/app/utils/scrollWithin', () => ({ scrollWithin: (...args: unknown[]) => { scrolls.calls.push(args); } }));
vi.mock('../../src/app/initiative/useMapInitiativeRules', () => ({ useMapInitiativeRules: () => collection.rules }));
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

const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: '', ...extra });
const entryOf = (tokenId: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: `entry-${tokenId}`, tokenId, name: tokenId, initiative: 7, initiativeModifier: 0,
  imagePath: '', isActive: false, isNPC: true, order, ...extra,
});

/** A goblin and a rat against a hero who sees and a cleric the GM put on the players' side. */
function scene(initiative: Partial<InitiativeState> = {}): void {
  state.objects.tokens = {
    goblin: token('goblin'), hero: token('hero', { vision: { enabled: true } }), rat: token('rat'), cleric: token('cleric', { side: 'players' }),
  };
  state.initiative = {
    entries: [entryOf('goblin', 0), entryOf('hero', 1), entryOf('rat', 2), entryOf('cleric', 3)], isActive: false, round: 0, ...initiative,
  } as InitiativeState;
}

const groups = (container: HTMLElement): Array<{ label: string; cards: number; active: boolean }> =>
  [...container.querySelectorAll('.atlas-initiative-side')].map((group) => ({
    label: group.querySelector('.atlas-initiative-side__label')?.textContent ?? '',
    cards: group.querySelectorAll('.atlas-initiative-card').length,
    active: group.classList.contains('atlas-initiative-side--active'),
  }));

function menuOf(container: HTMLElement, cardIndex: number): string[] {
  fireEvent.contextMenu(container.querySelectorAll('.atlas-initiative-card')[cardIndex]!);
  return opened.entries.flatMap((entry) => (entry.type === 'item' ? [entry.label] : []));
}

function clickItem(label: string): void {
  const item = opened.entries.find((entry) => entry.type === 'item' && entry.label === label);
  if (item?.type !== 'item') throw new Error(`no "${label}" item`);
  void item.onClick?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  opened.entries = [];
  scrolls.calls.length = 0;
  collection.rules = { mode: 'sides', roll: '1d20', firstSide: 'players' };
  scene();
});

describe('the initiative tracker of a collection that fights by sides', () => {
  it('lists the combatants under their side, the side that acts first on top, without numbers or a roll', () => {
    const { container } = render(<InitiativeTracker />);

    expect(groups(container)).toEqual([{ label: 'Players', cards: 2, active: false }, { label: 'Opponents', cards: 2, active: false }]);
    expect(container.querySelector('.atlas-initiative-card__initiative')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Roll initiative' })).toBeNull();
  });

  it('gives no single combatant the turn, whatever its entry says', () => {
    // The store marks the first entry that is added
    state.initiative.entries[0] = entryOf('goblin', 0, { isActive: true });

    expect(render(<InitiativeTracker />).container.querySelector('.atlas-initiative-card--active')).toBeNull();
  });

  it('puts the opponents on top where they act first', () => {
    collection.rules = { ...collection.rules, firstSide: 'opponents' };

    expect(groups(render(<InitiativeTracker />).container).map((group) => group.label)).toEqual(['Opponents', 'Players']);
  });

  it('starts the fight with the collection\'s rules and marks the side whose turn it is', () => {
    const { container, unmount } = render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Start combat' }));
    expect(state.startCombat).toHaveBeenCalledWith(collection.rules);
    unmount();

    scene({ isActive: true, round: 1, sides: { first: 'players', active: 'opponents' } });
    expect(groups(render(<InitiativeTracker />).container).map((group) => group.active)).toEqual([false, true]);
    expect(container).toBeDefined();
  });

  it('moves a combatant to the other side from its card', () => {
    const { container } = render(<InitiativeTracker />);

    // Cards stand in their groups: hero, cleric, goblin, rat
    expect(menuOf(container, 2)).toContain('Move to Players');
    clickItem('Move to Players');
    expect(menuOf(container, 0)).toContain('Move to Opponents');
    clickItem('Move to Opponents');

    expect(state.updateTokens.mock.calls).toEqual([
      [[{ id: 'goblin', changes: { side: 'players' } }]],
      [[{ id: 'hero', changes: { side: 'opponents' } }]],
    ]);
  });

  it('has nothing to roll or edit on a card, and lets a combatant sit a round out only while a fight runs', () => {
    const idle = menuOf(render(<InitiativeTracker />).container, 0);
    expect(idle).not.toContain('Roll Initiative');
    expect(idle).not.toContain('Edit Initiative');
    expect(idle).not.toContain('Sit Out This Round');
    expect(idle).toEqual(expect.arrayContaining(['Hide from Players', 'Remove from Initiative']));
  });

  it('lets a combatant sit the round out and act again', () => {
    scene({ isActive: true, round: 1, sides: { first: 'players', active: 'players' } });
    state.initiative.entries[3] = entryOf('cleric', 3, { sitsOut: true });
    const { container } = render(<InitiativeTracker />);

    expect([...container.querySelectorAll('.atlas-initiative-card')].map((card) => card.classList.contains('atlas-initiative-card--sitting-out'))).toEqual([false, true, false, false]);
    menuOf(container, 0);
    clickItem('Sit Out This Round');
    menuOf(container, 1);
    clickItem('Act This Round');
    expect(state.setInitiativeSitsOut.mock.calls).toEqual([['entry-hero', true], ['entry-cleric', false]]);
  });

  it('keeps a fight that was started in turn order in turn order', () => {
    scene({ isActive: true, round: 1 });
    const { container } = render(<InitiativeTracker />);

    expect(groups(container)).toEqual([]);
    expect(container.querySelectorAll('.atlas-initiative-card__initiative')).toHaveLength(4);
  });
});

describe('the initiative tracker in turn order', () => {
  beforeEach(() => { collection.rules = { mode: 'turn-order', roll: '1d10', firstSide: 'players' }; });

  it('lists the combatants in one order with their numbers and rolls the collection\'s dice', async () => {
    const { container } = render(<InitiativeTracker />);

    expect(groups(container)).toEqual([]);
    expect(container.querySelectorAll('.atlas-initiative-card__initiative')).toHaveLength(4);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' })));
    expect(state.rollAllInitiative).toHaveBeenCalledWith('1d10');
    expect(menuOf(container, 0)).toEqual(expect.arrayContaining(['Roll Initiative', 'Edit Initiative']));
    expect(menuOf(container, 0)).not.toContain('Move to Players');
    clickItem('Roll Initiative');
    expect(state.rollEntryInitiative).toHaveBeenCalledWith('entry-goblin', '1d10');
  });
});

describe('clearing the initiative tracker', () => {
  it('removes every combatant with one button, in either mode', () => {
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear initiative' }));
    expect(state.resetInitiative).toHaveBeenCalledTimes(1);
  });

  it('has nothing to clear in an empty tracker', () => {
    state.initiative = { entries: [], isActive: false, round: 0 } as unknown as InitiativeState;
    render(<InitiativeTracker />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Clear initiative' }).disabled).toBe(true);
  });
});

describe('the initiative tracker keeps the turn in view', () => {
  const list = (container: HTMLElement): Element => container.querySelector('.atlas-initiative-tracker__content')!;

  it('scrolls its list to the combatant whose turn it is when the turn moves on', () => {
    collection.rules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
    scene({ isActive: true, round: 1, currentIndex: 0 });
    state.initiative.entries[0] = entryOf('goblin', 0, { isActive: true });
    const { container, rerender } = render(<InitiativeTracker />);
    scrolls.calls.length = 0;

    state.initiative = { ...state.initiative, currentIndex: 2, entries: state.initiative.entries.map((entry, index) => ({ ...entry, isActive: index === 2 })) };
    rerender(<InitiativeTracker />);

    expect(scrolls.calls).toEqual([[list(container), container.querySelectorAll('.atlas-initiative-card')[2], 'nearest']]);
  });

  it('scrolls its list to the top of the side whose turn it is', () => {
    scene({ isActive: true, round: 1, sides: { first: 'players', active: 'players' } });
    const { container, rerender } = render(<InitiativeTracker />);
    scrolls.calls.length = 0;

    state.initiative = { ...state.initiative, sides: { first: 'players', active: 'opponents' } };
    rerender(<InitiativeTracker />);

    expect(scrolls.calls).toEqual([[list(container), container.querySelectorAll('.atlas-initiative-side')[1], 'start']]);
  });

  it('leaves the list alone while nothing about the turn changes, and without a fight', () => {
    scene({ isActive: true, round: 1, sides: { first: 'players', active: 'players' } });
    const { rerender, unmount } = render(<InitiativeTracker />);
    scrolls.calls.length = 0;

    state.objects = { tokens: { ...state.objects.tokens } };
    rerender(<InitiativeTracker />);
    expect(scrolls.calls).toEqual([]);

    unmount();
    scene();
    render(<InitiativeTracker />);
    expect(scrolls.calls).toEqual([]);
  });
});
