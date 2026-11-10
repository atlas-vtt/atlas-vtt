// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  useViewStoreHook: () => ({ getState: () => state }),
}));
vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn() }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [HP, STR, AMMO] }));

import { InitiativeCard } from '../../src/app/react/components/InitiativeCard';

const entry: InitiativeEntry = {
  id: 'entry-1', tokenId: 't1', name: 'Troll', initiative: 12, initiativeModifier: 0,
  imagePath: '', isActive: false, isNPC: true, order: 0,
};

function renderCard(resources: Record<string, { current: number; max: number }>): ReturnType<typeof render> {
  state.objects.tokens = { t1: { id: 't1', kind: 'character', name: 'Troll', imagePath: '', x: 0, y: 0, resources } };
  return render(
    <InitiativeCard entry={entry} index={0} isHoveredForPreview={false}
      onDragStart={vi.fn()} onDragOver={vi.fn()} onDragEnd={vi.fn()} onContextMenu={vi.fn()} onHover={vi.fn()} />,
  );
}

afterEach(() => vi.clearAllMocks());

describe('InitiativeCard resources', () => {
  it('shows the hit points of its token live, and no other resource, as the card always did', () => {
    renderCard({ str: { current: 12, max: 14 }, hp: { current: 3, max: 8 }, ammo: { current: 2, max: 6 } });
    const meters = screen.getAllByRole('meter');
    expect(meters.map((meter) => meter.getAttribute('aria-label'))).toEqual(['HP']);
    expect(meters.map((meter) => [meter.getAttribute('aria-valuenow'), meter.getAttribute('aria-valuemax')])).toEqual([['3', '8']]);
  });

  it('turns the bar yellow and red as hit points run low', () => {
    const fill = (current: number): string => {
      const { container, unmount } = renderCard({ hp: { current, max: 10 } });
      const color = container.querySelector<HTMLElement>('.atlas-initiative-card__hp-fill')!.style.getPropertyValue('--atlas-resource-color');
      unmount();
      return color;
    };
    expect([fill(10), fill(5), fill(1)]).toEqual(['#22c55e', '#eab308', '#ef4444']);
  });

  it('marks the card defeated when a defeating resource is spent', () => {
    const { container, unmount } = renderCard({ hp: { current: 3, max: 8 } });
    expect(container.querySelector('.atlas-initiative-card--defeated')).toBeNull();
    unmount();
    expect(renderCard({ hp: { current: 0, max: 8 } }).container.querySelector('.atlas-initiative-card--defeated')).not.toBeNull();
  });

  it('shows no bar for a token without resources', () => {
    renderCard({});
    expect(screen.queryAllByRole('meter')).toEqual([]);
  });

  it('opens the editor a bar on the map opens, and changes the token as the map does', () => {
    renderCard({ hp: { current: 8, max: 10 }, str: { current: 12, max: 14 } });

    fireEvent.click(screen.getByRole('button', { name: 'Edit HP' }));
    const editor = document.body.querySelector('.atlas-token-value-editor')!;
    const [current] = editor.querySelectorAll('input');
    fireEvent.input(current!, { target: { value: '-3' } });
    fireEvent.keyDown(current!, { key: 'Enter' });

    expect(state.updateToken.mock.calls).toEqual([['t1', { resources: { hp: { current: 5, max: 10 }, str: { current: 12, max: 14 } } }]]);
    expect(state.setSelection).not.toHaveBeenCalled();
    expect(document.body.querySelector('.atlas-token-value-editor')).toBeNull();
  });

  it('counts a maximum typed there as set by hand, as the map does', () => {
    renderCard({ hp: { current: 8, max: 10 } });

    fireEvent.click(screen.getByRole('button', { name: 'Edit HP' }));
    const [, max] = document.body.querySelectorAll('.atlas-token-value-editor input');
    fireEvent.input(max!, { target: { value: '20' } });
    fireEvent.keyDown(max!, { key: 'Enter' });

    expect(state.updateToken.mock.calls).toEqual([['t1', { resources: { hp: { current: 8, max: 20 } }, overriddenMax: ['hp'] }]]);
  });
});
