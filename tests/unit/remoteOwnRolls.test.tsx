import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { initialRemoteViewState } from '../../src/app/remote-view/remoteViewState';
import { RemoteOwnRolls } from '../../src/app/remote-view/RemoteOwnRolls';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { DiceRollResult } from '../../src/app/tools/diceRolling';
import { followRolls } from '../../src/app/tools/diceRollFeed';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom has no WebGL; these cases are about which rolls are thrown, not about the device.
const { webgl } = vi.hoisted(() => ({ webgl: { on: true } }));
vi.mock('../../src/app/dice3d/stagePool', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/dice3d/stagePool')>(),
  canShowDice: (): boolean => webgl.on,
}));

const roll = (id: string, overrides: Partial<DiceRollResult> = {}): DiceRollResult => ({
  id, timestamp: 0, formula: '1d20+2', rolls: [{ die: 'd20', value: 13, max: 20 }], modifiers: 2, total: 15, crit: null, rolledBy: 'Anna',
  ...overrides,
});

function setup(display: 'card' | 'fast' | 'full', ownRoll: DiceRollResult | null = null) {
  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app);
  settings.setDiceDisplay(display);
  const store = createStore(() => ({ remoteView: { ...initialRemoteViewState(), ownRoll } })) as unknown as StoreApi<ViewAtlasState>;
  const view = render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store as never}><RemoteOwnRolls /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  const throwRoll = (result: DiceRollResult): void => {
    act(() => store.setState({ remoteView: { ...store.getState().remoteView!, ownRoll: result } }));
  };
  return { ...view, throwRoll };
}

describe("the remote view's own rolls", () => {
  beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
  afterEach(() => { vi.restoreAllMocks(); webgl.on = true; });

  it("throws the player's own roll as dice with their display setting", () => {
    const { container, throwRoll } = setup('full');
    expect(container.querySelector('.atlas-dice-roll')).toBeNull();
    throwRoll(roll('r1'));
    expect(container.querySelector('.atlas-dice-roll')?.textContent).toContain('1d20+2');
    expect(container.querySelector('.atlas-dice-toast')).toBeNull();
  });

  it('shows it as a result card when cards are chosen, or when the log left dice unlisted', () => {
    const cards = setup('card');
    cards.throwRoll(roll('r1'));
    expect(cards.container.querySelector('.atlas-dice-toast')?.textContent).toContain('15');
    expect(cards.container.querySelector('.atlas-dice-roll')).toBeNull();
    cards.unmount();
    const clipped = setup('full');
    clipped.throwRoll(roll('r2', { unlistedDice: 30 }));
    expect(clipped.container.querySelector('.atlas-dice-roll')).toBeNull();
    expect(clipped.container.querySelector('.atlas-dice-toast')).not.toBeNull();
  });

  it('shows it as a result card where the window cannot show 3D dice (no WebGL, a lost context)', () => {
    webgl.on = false;
    const { container, throwRoll } = setup('full');
    throwRoll(roll('r1'));
    expect(container.querySelector('.atlas-dice-roll')).toBeNull();
    expect(container.querySelector('.atlas-dice-toast')?.textContent).toContain('15');
  });

  it('throws a roll once, and none that was in the store before it mounted', () => {
    const { container, throwRoll } = setup('full', roll('old'));
    expect(container.querySelector('.atlas-dice-roll')).toBeNull();
    throwRoll(roll('old'));
    expect(container.querySelector('.atlas-dice-roll')).toBeNull();
    throwRoll(roll('new'));
    expect(container.querySelectorAll('.atlas-dice-roll')).toHaveLength(1);
  });

  it("dispatches no dice event: the player's other maps never hear the roll", () => {
    const heard = vi.fn();
    const unfollow = followRolls(heard);
    const { throwRoll } = setup('full');
    throwRoll(roll('r1'));
    unfollow();
    expect(heard).not.toHaveBeenCalled();
  });
});
