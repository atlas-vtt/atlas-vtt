import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', async () => import('./fakeAtlasView'));

import { diceApi } from '../../src/api/dice';
import { DisposerSet } from '../../src/api/disposers';
import { onGivenThrow } from '../../src/app/dice3d/givenThrows';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeView, loadMap, trackerWith } from './apiFakes';

const roll = (id: string, overrides: Partial<DiceRollResult> = {}): DiceRollResult => ({
  id, timestamp: 0, formula: '1d20+2', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 2, total: 15, crit: null,
  ...overrides,
});

/** `dice` over one GM map view `v1`, with what that view's dice display is handed. */
function gmSetup(): { dice: ReturnType<typeof diceApi>; view: ReturnType<typeof fakeView>; thrown: DiceRollResult[] } {
  const view = fakeView('v1');
  const { tracker } = trackerWith([view]);
  const thrown: DiceRollResult[] = [];
  onGivenThrow(view.atlasStore, (given) => thrown.push(given));
  return { dice: diceApi(createInMemoryApp().app, new DisposerSet(), tracker), view, thrown };
}

afterEach(() => vi.restoreAllMocks());

describe('dice.throw', () => {
  it('throws a given roll once per id in a loaded GM map view, as a frozen copy', () => {
    const { dice, view, thrown } = gmSetup();
    const given = roll('r1');
    expect(dice.throw?.('v1', given)).toBe(false);
    loadMap(view);
    expect(dice.throw?.('v1', given)).toBe(true);
    expect(thrown).toEqual([given]);
    expect(thrown[0]).not.toBe(given);
    expect(Object.isFrozen(thrown[0]!.rolls[0])).toBe(true);
    // Handed again (another total, the same id): nothing is thrown, and it still counts as shown.
    expect(dice.throw?.('v1', { ...given, total: 99 })).toBe(true);
    expect(dice.throw?.('v1', roll('r2'))).toBe(true);
    expect(thrown.map((result) => result.id)).toEqual(['r1', 'r2']);
  });

  it('answers false, leaving the id free, while no dice display listens in a GM view', () => {
    const view = fakeView('v1');
    loadMap(view);
    const dice = diceApi(createInMemoryApp().app, new DisposerSet(), trackerWith([view]).tracker);
    expect(dice.throw?.('v1', roll('r1'))).toBe(false);
    const thrown: DiceRollResult[] = [];
    const stop = onGivenThrow(view.atlasStore, (given) => thrown.push(given));
    expect(dice.throw?.('v1', roll('r1'))).toBe(true);
    expect(thrown.map((result) => result.id)).toEqual(['r1']);
    stop();
  });

  it('refuses an unknown view, and a view that closed', () => {
    const { dice, view, thrown } = gmSetup();
    loadMap(view);
    expect(dice.throw?.('nope', roll('r1'))).toBe(false);
    expect(dice.throw?.(42 as never, roll('r1'))).toBe(false);
    view.close();
    expect(dice.throw?.('v1', roll('r1'))).toBe(false);
    expect(thrown).toEqual([]);
  });

  it('refuses a malformed roll, and one that is not plain data', () => {
    const { dice, view, thrown } = gmSetup();
    loadMap(view);
    for (const bad of [null, 'r1', { id: 'r1' }, roll('r1', { rolls: [{ die: 'd20', value: Number.NaN, max: 20 }] }),
      roll('r1', { total: '15' as never }), { ...roll('r1'), extra: () => undefined },
      roll('r1', { rolls: [{ die: 'd20', value: 25, max: 20 }] }), roll('r1', { rolls: [{ die: 'd20', value: 0, max: 20 }] }),
      roll('r1', { rolls: [{ die: 'd6', value: 2.5, max: 6 }] })]) {
      expect(dice.throw?.('v1', bad as never)).toBe(false);
    }
    expect(thrown).toEqual([]);
    // A refused roll leaves its id free.
    expect(dice.throw?.('v1', roll('r1'))).toBe(true);
  });

  it('refuses while the user shows dice as result cards', () => {
    const view = fakeView('v1');
    loadMap(view);
    const { app } = createInMemoryApp();
    new SettingsService(app).setDiceDisplay('card');
    const dice = diceApi(app, new DisposerSet(), trackerWith([view]).tracker);
    const thrown = vi.fn();
    onGivenThrow(view.atlasStore, thrown);
    expect(dice.throw?.('v1', roll('r1'))).toBe(false);
    expect(thrown).not.toHaveBeenCalled();
  });

});
