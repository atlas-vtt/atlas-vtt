// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';

const state = vi.hoisted(() => ({
  objects: { tokens: {} as Record<string, unknown> },
  tokenSettings: { showInstanceBadges: true },
  levels: undefined as unknown,
}));

vi.mock('../../src/app/react/root/AtlasUIContext', async () => ({
  AtlasUIContext: (await import('react')).createContext(null),
  useAtlasUI: () => ({ app: { vault: { adapter: { getResourcePath: (path: string) => `app://${path}` } } }, view: null }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (s: typeof state) => unknown) => selector(state),
  useViewStoreHook: () => ({ getState: () => state }),
}));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/react/hooks/useMapConditions', () => ({ useMapConditions: () => [] }));

import { InitiativeCard } from '../../src/app/react/components/InitiativeCard';

const entry: InitiativeEntry = {
  id: 'entry-1', tokenId: 't1', name: 'Troll', initiative: 12, initiativeModifier: 0,
  imagePath: 'tokens/troll.webp', isActive: false, isNPC: true, order: 0,
};

function renderCard(token: Record<string, unknown>, shown: InitiativeEntry = entry): HTMLElement {
  state.objects.tokens = { t1: { id: 't1', kind: 'character', name: 'Troll', imagePath: 'tokens/troll.webp', x: 0, y: 0, ...token } };
  return render(
    <InitiativeCard entry={shown} index={0} isHoveredForPreview={false}
      onDragStart={vi.fn()} onDragOver={vi.fn()} onDragEnd={vi.fn()} onContextMenu={vi.fn()} onHover={vi.fn()} />,
  ).container;
}

describe('InitiativeCard portrait', () => {
  it('shows a token as the map does: its art inside its ring, in the ring\'s colour', () => {
    const card = renderCard({ ringColor: '#c0392b' });

    expect(card.querySelector('.atlas-token-portrait')?.classList.contains('atlas-token-portrait--unframed')).toBe(false);
    expect(card.querySelector<HTMLImageElement>('.atlas-token-portrait img')?.src).toBe('app://tokens/troll.webp');
    expect(card.querySelector<HTMLElement>('.atlas-token-ring')?.style.getPropertyValue('--atlas-token-ring-color')).toBe('#c0392b');
  });

  it('shows a token without a ring unframed, with its whole art', () => {
    const card = renderCard({ showRing: false });

    expect(card.querySelector('.atlas-token-portrait--unframed')).not.toBeNull();
    expect(card.querySelector('.atlas-token-ring')).toBeNull();
  });

  it('keeps the icon for an entry without art', () => {
    const card = renderCard({}, { ...entry, imagePath: '' });

    expect(card.querySelector('.atlas-token-portrait')).toBeNull();
    expect(card.querySelector('.atlas-initiative-card__avatar svg')).not.toBeNull();
  });

  it('numbers a token among the look-alikes on its own level, as the map does', () => {
    state.levels = [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
    ];
    const twin = (level: string): Record<string, unknown> => ({ t2: { id: 't2', kind: 'character', name: 'Troll', imagePath: 'tokens/troll.webp', x: 0, y: 0, instanceNumber: 2, level } });
    const badge = (): string | null | undefined => {
      const card = render(
        <InitiativeCard entry={entry} index={0} isHoveredForPreview={false}
          onDragStart={vi.fn()} onDragOver={vi.fn()} onDragEnd={vi.fn()} onContextMenu={vi.fn()} onHover={vi.fn()} />,
      ).container;
      return card.querySelector('.atlas-initiative-card__instance-badge')?.textContent;
    };
    const troll = { id: 't1', kind: 'character', name: 'Troll', imagePath: 'tokens/troll.webp', x: 0, y: 0, instanceNumber: 1 };

    state.objects.tokens = { t1: troll, ...twin('upper') };
    expect(badge()).toBeUndefined();
    state.objects.tokens = { t1: troll, ...twin('ground') };
    expect(badge()).toBe('1');
    state.levels = undefined;
  });
});
