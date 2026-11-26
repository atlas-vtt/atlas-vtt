// @vitest-environment jsdom
import { useEffect } from 'react';
import { act } from 'react';
import type { App } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiceRollSubscription } from '../../src/app/react/components/dice/DiceRollDisplay';
import type { DiceRollResult } from '../../src/app/types/diceTypes';

const state = vi.hoisted(() => ({ shown: vi.fn(), collections: [] as Array<string | null> }));
vi.mock('../../src/app/services/AssetService', () => ({
  AssetService: { getInstance: () => ({ getDefaultCollectionId: () => 'campaign' }) },
}));
vi.mock('../../src/app/services/diceSets/collectionDiceSets', async () => {
  const { defaultDiceSet } = await import('../../src/app/gameSystems/diceSetResolution');
  return { diceSetOfCollection: (_app: App, id: string | null) => { state.collections.push(id); return defaultDiceSet(); } };
});
vi.mock('../../src/app/react/components/dice/DiceRollDisplay', () => ({
  DiceRollDisplay: ({ subscribe }: { subscribe: DiceRollSubscription }) => {
    useEffect(() => subscribe(state.shown), [subscribe]);
    return null;
  },
}));

import { NoteDiceDisplays } from '../../src/app/noteDice/NoteDiceDisplays';
import { releasePortalHosts } from '../../src/app/host/portalHost';

afterEach(() => {
  state.shown.mockReset();
  state.collections = [];
  releasePortalHosts();
});

describe('the rolls of a note\'s dice', () => {
  it('roll by the default collection\'s dice while no map is open, which have no advantage', () => {
    const displays = new NoteDiceDisplays({} as App);
    const rolls = displays.rollsIn(document);
    expect(rolls.document).toBe(document);
    const result = rolls.roll('+3', { type: 'statblock' }, { advantage: 'advantage' });
    expect(result).toMatchObject({ formula: '1d20+3', source: { type: 'statblock' } });
    expect(result?.advantage).toBeUndefined();
    expect(result?.rolls).toHaveLength(1);
    expect(rolls.rollingDice?.()).toMatchObject({ dice: [{ count: 1, sides: 20 }] });
    expect(state.collections).toEqual(['campaign', 'campaign']);
    displays.destroy();
  });

  it('mount one display per window with the first roll, and go with Atlas', async () => {
    const displays = new NoteDiceDisplays({} as App);
    expect(document.querySelector('.atlas-note-dice-rolls')).toBeNull();
    const first = { id: 'one' } as DiceRollResult;
    const second = { id: 'two' } as DiceRollResult;
    await act(async () => { displays.rollsIn(document).show(first, true); });
    await act(async () => { displays.rollsIn(document).show(second, false); });
    expect(document.querySelectorAll('.atlas-note-dice-rolls')).toHaveLength(1);
    expect(state.shown.mock.calls).toEqual([[first, { muted: true }], [second, { muted: false }]]);
    await act(async () => { displays.destroy(); });
    expect(document.querySelector('.atlas-note-dice-rolls')).toBeNull();
  });
});
