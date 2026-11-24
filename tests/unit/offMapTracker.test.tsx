// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import type { TokenEntity } from '../../src/app/types';

const state = vi.hoisted(() => ({
  objects: { tokens: {} as Record<string, unknown> },
  tokenSettings: { showInstanceBadges: true },
  selectedIds: [] as string[],
}));

vi.mock('../../src/app/react/root/AtlasUIContext', async () => ({
  AtlasUIContext: (await import('react')).createContext(null),
  useAtlasUI: () => ({ app: { vault: { adapter: { getResourcePath: (path: string) => `app://${path}` }, getAbstractFileByPath: () => null, on: () => ({}), offref: () => undefined } }, view: null }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (s: typeof state) => unknown) => selector(state),
  useViewStoreHook: () => ({ getState: () => state, subscribe: () => () => undefined }),
}));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/react/hooks/useMapConditions', () => ({ useMapConditions: () => [] }));

import { InitiativeCard } from '../../src/app/react/components/InitiativeCard';
import { initiativeCardMenu } from '../../src/app/react/components/initiativeCardMenu';

const entry: InitiativeEntry = {
  id: 'entry-1', tokenId: 't1', name: 'Goblin', initiative: 12, initiativeModifier: 0,
  imagePath: 'tokens/goblin.webp', isActive: false, isNPC: true, order: 0,
};
const goblin = (extra: Partial<TokenEntity> = {}): TokenEntity => ({ id: 't1', kind: 'character', name: 'Goblin', imagePath: 'tokens/goblin.webp', x: 0, y: 0, ...extra } as TokenEntity);

function renderCard(token: TokenEntity): HTMLElement {
  state.objects.tokens = { t1: token };
  return render(
    <InitiativeCard entry={entry} isHoveredForPreview={false}
      onContextMenu={vi.fn()} onHover={vi.fn()} />,
  ).container;
}

const labels = (entries: ContextMenuEntry[]): string[] => entries.flatMap((item) => (item.type === 'item' ? [item.label] : []));
const noop = (): void => undefined;
const MODE = { bySides: false, sides: [], cards: false, fightRuns: false, swapTargets: [] };
const actions = { swapCard: noop, roll: noop, moveToFront: noop, moveToBack: noop, edit: noop, updateToken: noop, setSitsOut: noop, delay: noop, actNow: noop, remove: noop };

describe('a combatant kept beside the map, in the tracker', () => {
  it('is drawn with a grey stroke and described as not on the map, which a token on the map is not', () => {
    const beside = renderCard(goblin({ offMap: true })).querySelector('.atlas-initiative-card')!;
    expect(beside.classList.contains('atlas-initiative-card--off-map')).toBe(true);
    expect(beside.getAttribute('aria-description')).toBe('Not on the map');
    const onMap = renderCard(goblin()).querySelector('.atlas-initiative-card')!;
    expect(onMap.classList.contains('atlas-initiative-card--off-map')).toBe(false);
    expect(onMap.hasAttribute('aria-description')).toBe(false);
  });

  it('is placed on the map from its card\'s menu, which a token on the map does not offer', () => {
    const placeOnMap = vi.fn();
    const beside = initiativeCardMenu(entry, goblin({ offMap: true }), MODE, { ...actions, placeOnMap });
    expect(labels(beside)).toContain('Place on Map');
    const item = beside.find((candidate): candidate is Extract<ContextMenuEntry, { type: 'item' }> => candidate.type === 'item' && candidate.label === 'Place on Map');
    void item?.onClick();
    expect(placeOnMap).toHaveBeenCalledTimes(1);
    expect(labels(initiativeCardMenu(entry, goblin(), MODE, { ...actions, placeOnMap }))).not.toContain('Place on Map');
  });

});
