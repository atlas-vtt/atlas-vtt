// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  setInitiativeConfig: vi.fn(),
  delayInitiativeTurn: vi.fn(),
  actNowInInitiative: vi.fn(),
}));
const collection = vi.hoisted(() => ({ rules: { mode: 'sides', roll: '1d20', firstSide: 'players' } as InitiativeRules }));
const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));

const confirm = vi.hoisted(() => ({ answer: true, asked: [] as string[] }));
vi.mock('../../src/app/ui/confirmDialog', () => ({
  confirmAction: (options: { title: string }) => { confirm.asked.push(options.title); return Promise.resolve(confirm.answer); },
}));

const scrolls = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../src/app/utils/scrollWithin', () => ({ scrollWithin: (...args: unknown[]) => { scrolls.calls.push(args); } }));
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
const layout = vi.hoisted(() => ({ fromTurn: false, dock: 'right' as 'left' | 'right', collapsed: false, set: vi.fn() }));
vi.mock('../../src/app/initiative/useInitiativeLayout', () => ({
  useInitiativeLayout: () => ({ layout: { fromTurn: layout.fromTurn, dock: layout.dock, collapsed: layout.collapsed }, setLayout: layout.set }),
}));
const resources = vi.hoisted(() => ({ definitions: [] as unknown[] }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => resources.definitions }));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));
vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null, notePath: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { HP_RESOURCE } from '../../src/app/resources/resourceDefinitions';

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
    entries: [entryOf('goblin', 0), entryOf('hero', 1), entryOf('rat', 2), entryOf('cleric', 3)], isActive: false, round: 0, config: { autoSort: true }, ...initiative,
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
  confirm.answer = true;
  confirm.asked = [];
  resources.definitions = [];
  scrolls.calls.length = 0;
  Object.assign(layout, { fromTurn: false, dock: 'right', collapsed: false });
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
    expect(state.startCombat).toHaveBeenCalledWith(collection.rules, new Set());
    unmount();

    scene({ isActive: true, round: 1, sides: { first: 'players', active: 'opponents' } });
    expect(groups(render(<InitiativeTracker />).container).map((group) => group.active)).toEqual([false, true]);
    expect(container).toBeDefined();
  });

  it('moves a combatant to the other side from its card; one moved to the players sees', () => {
    const { container } = render(<InitiativeTracker />);

    // Cards stand in their groups: hero, cleric, goblin, rat
    expect(menuOf(container, 2)).toContain('Move to Players');
    clickItem('Move to Players');
    expect(menuOf(container, 0)).toContain('Move to Opponents');
    clickItem('Move to Opponents');

    expect(state.updateTokens.mock.calls).toEqual([
      [[{ id: 'goblin', changes: { side: 'players', vision: { enabled: true } } }]],
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
    fireEvent.click(screen.getByRole('button', { name: 'Roll initiative' }));
    await waitFor(() => expect(state.rollAllInitiative).toHaveBeenCalledWith('1d10', new Map()));
    expect(menuOf(container, 0)).toEqual(expect.arrayContaining(['Roll Initiative', 'Edit Initiative']));
    expect(menuOf(container, 0)).not.toContain('Move to Players');
    clickItem('Roll Initiative');
    await waitFor(() => expect(state.rollEntryInitiative).toHaveBeenCalledWith('entry-goblin', '1d10', null));
  });
});

describe('clearing the initiative tracker', () => {
  const options = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Tracker options' })); };

  it('asks first, then removes every combatant, in either mode', async () => {
    render(<InitiativeTracker />);
    options();
    clickItem('Clear initiative');
    await waitFor(() => expect(state.resetInitiative).toHaveBeenCalledTimes(1));
    expect(confirm.asked).toEqual(['Clear initiative?']);
  });

  it('keeps the combatants when the GM cancels', async () => {
    confirm.answer = false;
    render(<InitiativeTracker />);
    options();
    clickItem('Clear initiative');
    await waitFor(() => expect(confirm.asked).toHaveLength(1));
    expect(state.resetInitiative).not.toHaveBeenCalled();
  });

  it('has nothing to clear in an empty tracker', () => {
    state.initiative = { entries: [], isActive: false, round: 0, config: { autoSort: true } } as unknown as InitiativeState;
    render(<InitiativeTracker />);
    options();
    const clear = opened.entries.find((entry) => entry.type === 'item' && entry.label === 'Clear initiative');
    expect(clear).toMatchObject({ disabled: true });
  });
});

describe('the auto sort switch', () => {
  it('shows the setting and switches it', () => {
    collection.rules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Tracker options' }));
    expect(opened.entries[0]).toMatchObject({ label: 'Auto sort', checked: true, disabled: false });
    clickItem('Auto sort');
    expect(state.setInitiativeConfig).toHaveBeenCalledWith({ autoSort: false });
  });

  it('stays in place, disabled, where the sides take turns', () => {
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Tracker options' }));
    expect(opened.entries[0]).toMatchObject({ label: 'Auto sort', disabled: true });
  });
});

describe('a fight in turn order', () => {
  beforeEach(() => {
    collection.rules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
    scene({ isActive: true, round: 1 });
    state.initiative.entries[0] = entryOf('goblin', 0, { isActive: true });
  });

  it('lets a combatant sit the round out or delay its turn while the fight runs', () => {
    const { container } = render(<InitiativeTracker />);
    expect(menuOf(container, 0)).toEqual(expect.arrayContaining(['Sit Out This Round', 'Delay Turn']));
    clickItem('Delay Turn');
    clickItem('Sit Out This Round');
    expect(state.delayInitiativeTurn).toHaveBeenCalledWith('entry-goblin', new Set());
    expect(state.setInitiativeSitsOut).toHaveBeenCalledWith('entry-goblin', true);
  });

  it('keeps delayed combatants below the order, and lets them act now', () => {
    state.initiative.entries[1] = entryOf('hero', 1, { delayed: true });
    const { container } = render(<InitiativeTracker />);
    expect(groups(container)).toEqual([{ label: 'Delayed', cards: 1, active: false }]);
    const cards = [...container.querySelectorAll('.atlas-initiative-card')];
    expect(cards.at(-1)!.classList.contains('atlas-initiative-card--delayed')).toBe(true);
    expect(menuOf(container, 3)).toContain('Act Now');
    clickItem('Act Now');
    expect(state.actNowInInitiative).toHaveBeenCalledWith('entry-hero');
  });

  it('passes the defeated combatants to the turn buttons', () => {
    resources.definitions = [{ ...HP_RESOURCE }];
    state.objects.tokens.rat = token('rat', { resources: { hp: { current: 0, max: 7 } } });
    const { container } = render(<InitiativeTracker />);
    const [previous, next] = container.querySelectorAll('.atlas-initiative-tracker__turn-controls button');
    fireEvent.click(next!);
    fireEvent.click(previous!);
    expect(state.nextTurn).toHaveBeenCalledWith(new Set(['entry-rat']));
    expect(state.previousTurn).toHaveBeenCalledWith(new Set(['entry-rat']));
  });
});

describe('the initiative tracker of a collection whose sides roll for their order', () => {
  it('heads each side with its roll, the highest first, and marks sides with equal rolls together', () => {
    collection.rules = { mode: 'sides', roll: '1d20', firstSide: 'players', sides: [{ id: 'players' }, { id: 'side-allies', name: 'Allies' }, { id: 'opponents' }], sideRoll: '1d6' };
    scene({
      isActive: true, round: 2,
      sides: { first: 'players', active: 'opponents', order: collection.rules.sides!, roll: '1d6', rolls: { 2: { players: 3, 'side-allies': 6, opponents: 6 } } },
    });
    state.objects.tokens.rat = token('rat', { side: 'side-allies' });
    const { container } = render(<InitiativeTracker />);
    expect(groups(container)).toEqual([
      { label: 'Allies6', cards: 1, active: true },
      { label: 'Opponents6', cards: 1, active: true },
      { label: 'Players3', cards: 2, active: false },
    ]);
    expect(menuOf(container, 0)).not.toContain('Move to Players');
    expect(opened.entries.some((entry) => entry.type === 'submenu' && entry.label === 'Move to Side')).toBe(true);
  });
});

describe('the initiative tracker of a collection that deals cards', () => {
  beforeEach(() => { collection.rules = { mode: 'cards', roll: '1d20', firstSide: 'players', deck: 3 }; });

  it('shows the card dealt where the number stands, and has nothing to roll', () => {
    scene({ isActive: true, round: 1, cards: { deck: 3 } });
    state.initiative.entries[0] = entryOf('goblin', 0, { card: 2 });
    const { container } = render(<InitiativeTracker />);
    expect([...container.querySelectorAll('.atlas-initiative-card__dealt')].map((card) => card.firstChild?.textContent)).toEqual(['2', '–', '–', '–']);
    expect(container.querySelector('.atlas-initiative-card__initiative')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Roll initiative' })).toBeNull();
  });

  it('starts no fight while the deck has too few cards for the combatants', () => {
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Start combat' }));
    expect(state.startCombat).not.toHaveBeenCalled();

    collection.rules = { ...collection.rules, deck: 4 };
    render(<InitiativeTracker />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start combat' }).at(-1)!);
    expect(state.startCombat).toHaveBeenCalledWith(collection.rules, new Set());
  });
});

describe('the initiative tracker keeps the turn in view', () => {
  const list = (container: HTMLElement): Element => container.querySelector('.atlas-initiative-tracker__content')!;

  it('scrolls its list to the combatant whose turn it is and the next two when the turn moves on', () => {
    collection.rules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
    scene({ isActive: true, round: 1, currentIndex: 0 });
    state.initiative.entries[0] = entryOf('goblin', 0, { isActive: true });
    const { container, rerender } = render(<InitiativeTracker />);
    scrolls.calls.length = 0;

    state.initiative = { ...state.initiative, currentIndex: 2, entries: state.initiative.entries.map((entry, index) => ({ ...entry, isActive: index === 2 })) };
    rerender(<InitiativeTracker />);

    expect(scrolls.calls).toEqual([[list(container), container.querySelectorAll('.atlas-initiative-card')[2], 'nearest', 2]]);
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
