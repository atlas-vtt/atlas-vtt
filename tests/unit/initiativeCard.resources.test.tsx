// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import { AMMO, HP, STR } from '../mocks/resourceFixtures';

const state = vi.hoisted(() => ({
  objects: { tokens: {} as Record<string, unknown> },
  tokenSettings: { showInstanceBadges: true },
  selectedIds: [] as string[],
  setSelection: vi.fn(),
  updateToken: vi.fn(),
}));

vi.mock('../../src/app/react/root/AtlasUIContext', async () => ({
  AtlasUIContext: (await import('react')).createContext(null), useAtlasUI: () => ({ app: null, view: null }) }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (s: typeof state) => unknown) => selector(state),
  useViewStoreHook: () => ({ getState: () => state, subscribe: () => () => undefined }),
}));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [HP, STR, AMMO] }));

import { InitiativeCard } from '../../src/app/react/components/InitiativeCard';

const entry: InitiativeEntry = {
  id: 'entry-1', tokenId: 't1', name: 'Troll', initiative: 12, initiativeModifier: 0,
  imagePath: 'data:image/png;base64,', isActive: false, isNPC: true, order: 0,
};

function renderCard(resources: Record<string, { current: number; max: number }>): ReturnType<typeof render> {
  state.objects.tokens = { t1: { id: 't1', kind: 'character', name: 'Troll', imagePath: '', x: 0, y: 0, resources } };
  return render(
    <InitiativeCard entry={entry} isHoveredForPreview={false}
      onContextMenu={vi.fn()} onHover={vi.fn()} />,
  );
}

afterEach(() => vi.clearAllMocks());

/** The share of its life the card shows lost, red rising in its art; null where it shows none. */
const wound = (container: HTMLElement): string | null =>
  container.querySelector<HTMLElement>('.atlas-initiative-card__art .atlas-initiative-wound')?.style.getPropertyValue('--atlas-wound') ?? null;

describe('InitiativeCard resources', () => {
  it('fills its art with red from the bottom by the hit points its token lost, read live, and shows no bar or other resource', () => {
    const { container } = renderCard({ str: { current: 2, max: 14 }, hp: { current: 6, max: 8 }, ammo: { current: 0, max: 6 } });
    expect(wound(container)).toBe('0.25');
    expect(container.querySelector('[role="meter"], .atlas-initiative-card__resources')).toBeNull();
  });

  it('shows no red on an unhurt token, and all of it on a spent one, which it marks defeated', () => {
    const { container, unmount } = renderCard({ hp: { current: 8, max: 8 } });
    expect(wound(container)).toBe('0');
    expect(container.querySelector('.atlas-initiative-card--defeated')).toBeNull();
    unmount();
    const spent = renderCard({ hp: { current: 0, max: 8 } }).container;
    expect(wound(spent)).toBe('1');
    expect(spent.querySelector('.atlas-initiative-card--defeated')).not.toBeNull();
  });

  it('shows no red for a token without hit points', () => {
    expect(wound(renderCard({}).container)).toBeNull();
  });
});
