import React from 'react';
import { EventEmitter } from 'events';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no WebGL; these cases are about which rolls are thrown, not about the device.
vi.mock('../../src/app/dice3d/stagePool', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/dice3d/stagePool')>(),
  canShowDice: (): boolean => true,
}));

import { diceApi } from '../../src/api/dice';
import { DisposerSet } from '../../src/api/disposers';
import { DiceRollDisplay } from '../../src/app/react/components/dice/DiceRollDisplay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { DiceToastObserver } from '../../src/app/services/DiceToastObserver';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeView, trackerWith } from './apiFakes';

const roll = (id: string): DiceRollResult => ({
  id, timestamp: 0, formula: '1d20+2', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 2, total: 15, crit: null,
});

/** One GM map view with its bus, its dice display, its sound observer and its log listener, and `dice` over it. */
function setup(): { dice: ReturnType<typeof diceApi>; container: HTMLElement; logged: DiceRollResult[]; cardSounds: ReturnType<typeof vi.fn> } {
  const { app } = createInMemoryApp({ files: {} });
  new SettingsService(app).setDiceDisplay('full');
  const bus = new EventEmitter();
  const logged: DiceRollResult[] = [];
  bus.on('dice-rolled', (result: DiceRollResult) => logged.push(result));
  const cardSounds = vi.fn();
  new DiceToastObserver({ playDiceResult: cardSounds }, { getDiceDisplay: () => 'full' }, bus);
  const map = fakeView('v1');
  Object.assign(map, { serviceManager: { getEventBus: () => bus } });
  const dice = diceApi(app, new DisposerSet(), trackerWith([map]).tracker);
  const view = { viewId: 'v1', atlasStore: {}, containerEl: { doc: document, win: window } };
  const { container } = render(
    <AtlasUIContext.Provider value={{ app, view: view as never, pixiApp: null, renderer: null }}>
      <DiceRollDisplay eventBus={bus} />
    </AtlasUIContext.Provider>,
  );
  return { dice, container, logged, cardSounds };
}

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('dice.publish and the 3D throw', () => {
  it("throws a GM roll in 3D by default, as before (also with { throw: true })", () => {
    const { dice, container, logged, cardSounds } = setup();
    act(() => dice.publish(roll('a')));
    act(() => dice.publish(roll('b'), { throw: true }));
    expect(container.querySelectorAll('.atlas-dice-roll').length).toBeGreaterThan(0);
    expect(container.querySelector('.atlas-dice-toast')).toBeNull();
    expect(logged.map((result) => result.id)).toEqual(['a', 'b']);
    expect(cardSounds).not.toHaveBeenCalled();
  });

  it('with { throw: false } logs and toasts the roll as a result card, with its sound, and throws nothing', () => {
    const { dice, container, logged, cardSounds } = setup();
    const heard = vi.fn();
    dice.onRolled(heard);
    act(() => dice.publish(roll('c'), { throw: false }));
    expect(container.querySelector('.atlas-dice-roll')).toBeNull();
    expect(container.querySelector('.atlas-dice-toast')?.textContent).toContain('15');
    expect(logged.map((result) => result.id)).toEqual(['c']);
    expect(heard).toHaveBeenCalledOnce();
    expect(cardSounds).toHaveBeenCalledOnce();
    // The mark is on that publish only: the same roll data published again is thrown.
    act(() => dice.publish(roll('d')));
    expect(container.querySelector('.atlas-dice-roll')).not.toBeNull();
  });

  it('refuses options that are not { throw?: boolean }, logging nothing', () => {
    const { dice, logged } = setup();
    for (const bad of [null, 'no', { throw: 'no' }]) expect(() => dice.publish(roll('x'), bad as never)).toThrow(/dice.publish: the options/);
    expect(logged).toEqual([]);
  });
});
