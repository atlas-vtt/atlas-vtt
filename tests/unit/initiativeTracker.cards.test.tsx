// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../src/app/types';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';

const state = vi.hoisted(() => ({
  initiativeTrackerOpen: true,
  initiative: { entries: [] as unknown[], isActive: false, round: 0, config: { autoSort: true } },
  setInitiativeConfig: vi.fn(),
  resetInitiative: vi.fn(),
  objects: { tokens: {} as Record<string, unknown> },
  tokenSettings: { showInstanceBadges: true },
  selectedIds: [] as string[],
  grid: { size: 70 },
  setSelection: vi.fn(),
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
const settings = vi.hoisted(() => ({ names: false, setInitiativeNames: vi.fn() }));

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
}));
const canvas = vi.hoisted(() => ({ shows: (_id: string): boolean => true }));
vi.mock('../../src/app/react/root/AtlasUIContext', async () => ({
  AtlasUIContext: (await import('react')).createContext(null),
  useAtlasUI: () => ({ app: null, view: { renderer: { canvasShowsToken: (id: string) => canvas.shows(id), getViewportInstance: () => null } } }),
}));
vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({
  useAtlasSettings: () => ({
    showsInitiativeNames: () => settings.names, setInitiativeNames: settings.setInitiativeNames,
    initiativeLayout: () => ({ fromTurn: false, dock: 'right', collapsed: false }), setInitiativeLayout: vi.fn(),
    initiativeTurnOptions: () => ({ banner: true, followTurn: false, movesOnTurn: false }), setInitiativeTurnOptions: vi.fn(), isExperimentalOn: () => false,
  }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (storeState: typeof state) => unknown) => selector(state),
  useViewStoreHook: () => ({ getState: () => state }),
}));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null, notePath: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';

const token = (id: string, name?: string): TokenEntity => ({ id, kind: name ? 'character' : 'token', x: 0, y: 0, imagePath: `tokens/${id}.png`, ...(name ? { name } : {}) } as TokenEntity);
const entryOf = (tokenId: string, order: number, initiative: number, awaiting = false): InitiativeEntry => ({
  id: `entry-${tokenId}`, tokenId, name: tokenId, initiative, initiativeModifier: 0,
  imagePath: `tokens/${tokenId}.png`, isActive: false, isNPC: true, order,
  ...(awaiting ? { awaitingInitiative: true as const } : {}),
});

function table(): HTMLElement {
  state.objects.tokens = { goblin: token('goblin'), rat: token('rat'), troll: token('troll') };
  state.initiative.entries = [entryOf('goblin', 0, 18), entryOf('rat', 1, 12), entryOf('troll', 2, 0, true)];
  return render(<InitiativeTracker />).container;
}

const numberOf = (container: HTMLElement, index: number): HTMLElement =>
  container.querySelectorAll<HTMLElement>('.atlas-initiative-card')[index]!.querySelector<HTMLElement>('.atlas-initiative-card__initiative, .atlas-initiative-card__initiative-input')!;
const field = (container: HTMLElement): HTMLInputElement | null => container.querySelector('.atlas-initiative-card__initiative-input');

beforeEach(() => {
  vi.clearAllMocks();
  opened.entries = [];
  state.selectedIds = [];
  settings.names = false;
  canvas.shows = () => true;
});

describe('typing initiative on the cards', () => {
  it('shows an empty slot where no number was rolled or typed yet', () => {
    const container = table();

    expect(numberOf(container, 0).textContent).toBe('18');
    expect(numberOf(container, 2).textContent).toBe('–');
    expect(numberOf(container, 2).classList).toContain('atlas-initiative-card__initiative--empty');
  });

  it('turns the number into a field on a click and writes what Enter keeps', () => {
    const container = table();
    fireEvent.click(numberOf(container, 1));

    const input = field(container)!;
    expect(input.value).toBe('12');
    expect(document.activeElement).toBe(input);
    expect(state.setSelection).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '15' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(state.updateInitiativeEntry.mock.calls).toEqual([['entry-rat', { initiative: 15 }]]);
    expect(field(container)).toBeNull();
  });

  it('goes on to the next card with Tab and back with Shift+Tab, so a table is typed in a row', () => {
    const container = table();
    fireEvent.click(numberOf(container, 0));

    fireEvent.change(field(container)!, { target: { value: '7' } });
    fireEvent.keyDown(field(container)!, { key: 'Tab' });
    expect(field(container)?.closest('.atlas-initiative-card')?.getAttribute('aria-label')).toBe('rat');

    fireEvent.keyDown(field(container)!, { key: 'Tab' });
    // The empty slot opens an empty field
    expect(field(container)!.value).toBe('');
    fireEvent.change(field(container)!, { target: { value: '3' } });
    fireEvent.keyDown(field(container)!, { key: 'Tab', shiftKey: true });
    expect(field(container)?.closest('.atlas-initiative-card')?.getAttribute('aria-label')).toBe('rat');

    // Past the last card the typing ends
    fireEvent.keyDown(field(container)!, { key: 'Tab' });
    fireEvent.keyDown(field(container)!, { key: 'Tab' });
    expect(field(container)).toBeNull();

    expect(state.updateInitiativeEntry.mock.calls).toEqual([
      ['entry-goblin', { initiative: 7 }],
      ['entry-rat', { initiative: 12 }],
      ['entry-troll', { initiative: 3 }],
      ['entry-rat', { initiative: 12 }],
    ]);
  });

  it('drops what was typed on Escape, and writes nothing that is no number', () => {
    const container = table();
    fireEvent.click(numberOf(container, 0));
    fireEvent.change(field(container)!, { target: { value: '9' } });
    fireEvent.keyDown(field(container)!, { key: 'Escape' });
    expect(field(container)).toBeNull();

    fireEvent.click(numberOf(container, 0));
    fireEvent.change(field(container)!, { target: { value: 'soon' } });
    fireEvent.blur(field(container)!);

    expect(state.updateInitiativeEntry).not.toHaveBeenCalled();
  });

  it('keeps the keys typed in the field from the map', () => {
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    const container = table();
    fireEvent.click(numberOf(container, 0));

    fireEvent.keyDown(field(container)!, { key: 'd' });
    fireEvent.keyDown(field(container)!, { key: 'Escape' });

    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener('keydown', heard);
  });
});

describe('a click on a card', () => {
  it('selects its token as a click on the map does, Shift adding to the selection', () => {
    const container = table();
    const cards = container.querySelectorAll('.atlas-initiative-card');

    fireEvent.click(cards[1]!);
    expect(state.setSelection).toHaveBeenLastCalledWith(['rat']);

    state.selectedIds = ['goblin'];
    fireEvent.click(cards[1]!, { shiftKey: true });
    expect(state.setSelection).toHaveBeenLastCalledWith(['goblin', 'rat']);
  });

  it('selects no token the canvas hides, as in the players\' view', () => {
    canvas.shows = (id) => id !== 'rat';
    const cards = table().querySelectorAll('.atlas-initiative-card');

    fireEvent.click(cards[1]!);

    expect(state.setSelection).not.toHaveBeenCalled();
  });
});

describe('names on the GM\'s cards', () => {
  it('shows none until the GM switches them on in the tracker\'s options', () => {
    const container = table();
    expect(container.querySelector('.atlas-initiative-card__name')).toBeNull();
    expect(container.querySelector('.atlas-initiative-tracker--named')).toBeNull();

    fireEvent.click(container.querySelector('[aria-haspopup="menu"]')!);
    const item = opened.entries.find((entry) => entry.type === 'item' && entry.label === 'Show names');
    if (item?.type !== 'item') throw new Error('no names switch');
    expect(item.checked).toBe(false);
    void item.onClick();

    expect(settings.setInitiativeNames).toHaveBeenCalledWith(true);
  });

  it('names each combatant as the map names its token, in a wider tracker', () => {
    settings.names = true;
    state.objects.tokens = { a: token('a', 'Bandit Captain'), b: token('b') };
    state.initiative.entries = [entryOf('a', 0, 10), entryOf('b', 1, 8)];

    const { container } = render(<InitiativeTracker />);

    expect(container.querySelector('.atlas-initiative-tracker--named')).not.toBeNull();
    expect([...container.querySelectorAll('.atlas-initiative-card__name')].map((name) => name.textContent)).toEqual(['Bandit Captain', 'b']);
  });
});
