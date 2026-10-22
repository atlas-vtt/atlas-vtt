// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { PlayerBadgeNumbers } from '../../src/app/pixi/token-renderer/PlayerInstanceBadges';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { attachFakePlayerWindow } from '../mocks/playerPopout';

vi.mock('../../src/app/resources/collectionResources', () => ({ mapResources: () => [] }));
vi.mock('../../src/app/services/mapInitiativeRules', () => ({ mapInitiativeRules: () => ({ mode: 'turn-order', roll: '1d20', firstSide: 'players' }) }));
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.restoreAllMocks(); });

const goblin = (id: string): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: 'goblin.png' });
const entryOf = (tokenId: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: `entry-${tokenId}`, tokenId, name: tokenId, initiative: 10 - order, initiativeModifier: 0, imagePath: 'goblin.png', isActive: false, isNPC: true, order, ...extra,
});

/** The players' badges as the players' frame numbered them last; `renumber` numbers them anew. */
function badgesOnTheMap(numbers: Record<string, number>): PlayerBadgeNumbers & { renumber(next: Record<string, number>): void } {
  let current = numbers;
  const listeners = new Set<() => void>();
  return {
    numberOf: (tokenId) => current[tokenId] ?? null,
    onNumbersChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    renumber(next) { current = next; listeners.forEach((listener) => listener()); },
  };
}

function setup(badgeNumbers: PlayerBadgeNumbers): { service: PlayerWindowService; doc: Document } {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const { app } = createInMemoryApp();
  const store = createStore(() => ({
    initiative: { ...createDefaultInitiativeState(), entries: [entryOf('g1', 0), entryOf('g2', 1), entryOf('g3', 2, { initiative: 0, awaitingInitiative: true })] },
    objects: { tokens: { g1: goblin('g1'), g2: goblin('g2'), g3: goblin('g3') } },
    initiativeTrackerOpen: true,
  })) as StoreApi<ViewAtlasState>;
  const service = new PlayerWindowService(app, store, new SettingsService(app));
  const doc = attachFakePlayerWindow(service, { canvas: createEl('canvas'), withPlayerSafeFrame: vi.fn(), store, badgeNumbers } as never);
  return { service, doc };
}

const badges = (doc: Document): (string | null)[] =>
  [...doc.querySelectorAll('.atlas-player-initiative__card')].map((card) => card.querySelector('.atlas-player-initiative__badge')?.textContent ?? null);

describe('look-alikes in the players\' initiative list', () => {
  it('carry the number their badge shows the players on the map, and none where it shows none', () => {
    const { doc } = setup(badgesOnTheMap({ g1: 2, g2: 1 }));
    expect(badges(doc)).toEqual(['2', '1', null]);
  });

  it('follow the players\' numbering once their frame numbers the tokens anew', async () => {
    const map = badgesOnTheMap({ g1: 2, g2: 1 });
    const { doc } = setup(map);

    map.renumber({ g1: 1, g3: 2 });
    await Promise.resolve();

    expect(badges(doc)).toEqual(['1', null, '2']);
  });

  it('keep the numbers they showed while the GM is on another scene', async () => {
    const map = badgesOnTheMap({ g1: 2, g2: 1 });
    const { service, doc } = setup(map);
    service.holdCurrentFrame();

    map.renumber({});
    await Promise.resolve();

    expect(badges(doc)).toEqual(['2', '1', null]);
  });

  it('show a dash for a combatant without a number yet', () => {
    const { doc } = setup(badgesOnTheMap({}));
    expect([...doc.querySelectorAll('.atlas-player-initiative__value')].map((value) => value.textContent)).toEqual(['10', '9', '–']);
  });
});
