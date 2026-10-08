import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const state = {
  initiativeTrackerOpen: true,
  initiative: {
    entries: [
      {
        id: 'entry-1',
        tokenId: 'token-1',
        name: 'Bandit Captain',
        initiative: 12,
        initiativeModifier: 2,
        isActive: false,
        isNPC: true,
        order: 0,
      },
    ],
    isActive: false,
    round: 0,
  },
  objects: {
    tokens: {
      'token-1': {
        id: 'token-1',
        kind: 'character',
        name: 'Bandit Captain',
        imagePath: 'tokens/bandit-captain.png',
        statblockPath: 'atlas-vtt/statblocks/Bandit Captain.md',
      },
    },
  },
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
};

vi.mock('../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    app: {},
    view: {},
  }),
}));

vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useViewStoreHook: () => ({ getState: () => state }),
  useAtlasStore: (selector: (storeState: typeof state) => unknown) => selector(state),
}));

vi.mock('../../src/app/initiative/useMapInitiativeRules', () => ({
  useMapInitiativeRules: () => ({ mode: 'turn-order', roll: '1d20', firstSide: 'players' }),
}));

vi.mock('../../src/app/react/components/InitiativeCard', () => ({
  InitiativeCard: () => <div data-testid="initiative-card" />,
}));

vi.mock('../../src/app/react/components/StatblockHoverPreview', () => ({
  StatblockHoverPreview: () => null,
  useStatblockHoverPreview: () => [
    {
      hoveredEntry: null,
      statblockData: null,
      statblockFile: null,
      isVisible: false,
      isClosing: false,
      position: null,
      anchorRect: null,
    },
    {
      showPreview: vi.fn(),
      closePreview: vi.fn(),
      clearPreview: vi.fn(),
    },
  ],
}));

import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';

describe('InitiativeTracker statblock sync', () => {
  it('backfills a statblockPath onto existing initiative entries when the token gains one', () => {
    render(<InitiativeTracker />);

    expect(state.updateInitiativeEntry).toHaveBeenCalledWith('entry-1', {
      imagePath: 'tokens/bandit-captain.png',
      statblockPath: 'atlas-vtt/statblocks/Bandit Captain.md',
    });
  });
});
