import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { RemoteViewScene } from '../../src/app/remote-view/RemoteViewScene';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { remoteScene } from './remoteSceneFixtures';

// The player's own vault groups by turn order and shows no HP: the remote view must not read either.
vi.mock('../../src/app/services/mapInitiativeRules', () => ({ mapInitiativeRules: (): InitiativeRules => ({ mode: 'turn-order', roll: '1d20', firstSide: 'players' }) }));
vi.mock('../../src/app/resources/collectionResources', () => ({ mapResources: () => [] }));
vi.mock('../../src/app/utils/scrollWithin', () => ({ scrollWithin: () => undefined }));
afterEach(() => { document.body.replaceChildren(); });

const token = (id: string, side: Character['side']): Character => ({ id, kind: 'character', x: 70, y: 70, imagePath: '', name: id, side });
const entry = (tokenId: string, initiative: number, order: number): InitiativeEntry => ({
  id: `e-${tokenId}`, tokenId, name: tokenId, initiative, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: false, order,
});

function shown(rules: InitiativeRules | null, health: Record<string, { value: number; max: number }>): HTMLElement {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'remote-initiative', undefined, false, { remote: true });
  const parent = document.body.appendChild(document.createElement('div'));
  const scene = new RemoteViewScene({ app, viewId: 'remote-initiative', atlasStore: store, containerEl: parent, renderer: null });
  scene.setScene(remoteScene({
    objects: { tokens: { hero: token('hero', 'players'), orc: token('orc', 'opponents') }, texts: {}, drawings: {}, fog: {} },
    initiative: { ...createDefaultInitiativeState(), entries: [entry('orc', 21, 0), entry('hero', 17, 1)] },
  }));
  scene.setPlayer({
    movableTokenIds: [], measurement: resolveMeasurementSettings(undefined, null),
    tokenUi: { conditions: [], resources: {} }, initiative: { rules, health },
  });
  return parent;
}

const labels = (parent: HTMLElement): string[] => [...parent.querySelectorAll('.atlas-player-initiative__side-label')].map((el) => el.textContent ?? '');

describe("the remote view's initiative list", () => {
  it("groups by the rules its owner feeds, not by the player's own collection", () => {
    expect(labels(shown({ mode: 'sides', roll: '1d20', firstSide: 'opponents' }, {}))).toEqual(['Opponents', 'Players']);
    document.body.replaceChildren();
    expect(labels(shown(null, {}))).toEqual([]);
  });

  it('shows the HP bar its owner feeds, at its share, and none for a combatant without one', () => {
    const parent = shown(null, { hero: { value: 3, max: 4 } });
    const bars = parent.querySelectorAll<HTMLProgressElement>('progress.atlas-player-initiative__hp');
    expect(bars).toHaveLength(1);
    expect(bars[0]!.value / bars[0]!.max).toBeCloseTo(0.75);
  });
});
