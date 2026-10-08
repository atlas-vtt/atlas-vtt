import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../src/app/types';

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
}));

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({ app: null, view: null }),
}));

vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useViewStoreHook: () => ({ getState: () => state }),
  useAtlasStore: (selector: (storeState: typeof state) => unknown) => selector(state),
}));

vi.mock('../../src/app/resources/useMapResources', async () => {
  const definitions = [(await import('../../src/app/resources/resourceDefinitions')).HP_RESOURCE];
  return { useMapResources: () => definitions };
});

vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));

vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    { hoveredEntry: null, isVisible: false, isClosing: false, position: null, anchorRect: null, notePath: null },
    { showPreview: vi.fn(), closePreview: vi.fn(), clearPreview: vi.fn() },
  ],
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { initiativeEntryForToken } from '../../src/app/stores/initiativeEntries';

/** An entry as the tracker holds it: no hit points, which are read from the token. */
function entryOf(tokenId: string): InitiativeEntry {
  return {
    id: `entry-${tokenId}`, tokenId, name: 'Crate', initiative: 0, initiativeModifier: 0,
    imagePath: 'tokens/crate.png', isActive: false, isNPC: true, order: 0,
  };
}

const crate: TokenEntity = { id: 'crate', kind: 'token', x: 0, y: 0, imagePath: 'tokens/crate.png' };
const orc = (hp?: { current: number; max: number }): TokenEntity =>
  ({ ...crate, id: 'orc', kind: 'character', name: 'Crate', ...(hp ? { resources: { hp } } : {}) });

beforeEach(() => {
  vi.clearAllMocks();
  state.initiative.entries = [];
  state.objects.tokens = {};
});

describe('initiative entries of tokens without hit points', () => {
  it('shows the card of a token without hit points, without an HP bar', () => {
    state.initiative.entries = [entryOf('crate')];
    state.objects.tokens = { crate };

    const { container } = render(<InitiativeTracker />);

    expect(container.querySelectorAll('.atlas-initiative-card')).toHaveLength(1);
    expect(container.querySelector('.atlas-initiative-card__hp-bar')).toBeNull();
  });

  it('still shows the HP bar of a token with hit points', () => {
    state.initiative.entries = [entryOf('orc')];
    state.objects.tokens = { orc: orc({ current: 5, max: 10 }) };

    const { container } = render(<InitiativeTracker />);

    expect(container.querySelector<HTMLElement>('.atlas-initiative-card__hp-fill')?.style.width).toBe('50%');
  });

  it.each<[string, TokenEntity]>([
    ['a plain token', crate],
    ['a creature without a statblock', { ...crate, kind: 'character', name: 'Stranger' }],
  ])('makes the entry of %s without inventing hit points', (_label, token) => {
    const entry = initiativeEntryForToken(token);

    expect(entry).not.toHaveProperty('hp');
    expect(entry).toMatchObject({ tokenId: 'crate' });
  });

  it('reads hit points from the token, whatever an entry from an older scene file still holds', () => {
    state.initiative.entries = [{ ...entryOf('orc'), hp: { current: 7, max: 7 }, isDefeated: false }];
    state.objects.tokens = { orc: orc({ current: 0, max: 7 }) };

    const { container } = render(<InitiativeTracker />);

    expect(container.querySelector<HTMLElement>('.atlas-initiative-card__hp-fill')?.style.width).toBe('0%');
    expect(container.querySelector('.atlas-initiative-card--defeated')).not.toBeNull();
    expect(state.updateInitiativeEntry).not.toHaveBeenCalled();
  });

  it('shows no bar and no defeat once the token has no hit points any more', () => {
    state.initiative.entries = [{ ...entryOf('orc'), hp: { current: 0, max: 7 }, isDefeated: true }];
    state.objects.tokens = { orc: orc() };

    const { container } = render(<InitiativeTracker />);

    expect(container.querySelector('.atlas-initiative-card__hp-bar')).toBeNull();
    expect(container.querySelector('.atlas-initiative-card--defeated')).toBeNull();
  });

  it('shows a killed creature as defeated with an empty bar', () => {
    state.initiative.entries = [entryOf('orc')];
    // What the store's killTokens leaves on a token whose hit points defeat it
    state.objects.tokens = { orc: orc({ current: 0, max: 12 }) };

    const { container } = render(<InitiativeTracker />);

    expect(container.querySelector<HTMLElement>('.atlas-initiative-card__hp-fill')?.style.width).toBe('0%');
    expect(container.querySelector('.atlas-initiative-card--defeated')).not.toBeNull();
  });
});
