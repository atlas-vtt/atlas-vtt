import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerRemoteControls } from '../../src/app/remote-view/remoteControls';
import { RemoteViewDice, rollDiceCount, rollOfResult } from '../../src/app/remote-view/RemoteViewDice';
import { DiceRollLog } from '../../src/app/react/components/dice-log/DiceRollLog';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { EventEmitter } from 'events';
import type { DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';

Element.prototype.scrollTo = vi.fn();
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const roll = (id: string, overrides: Partial<DiceRollResult> = {}): DiceRollResult => ({
  id, timestamp: 0, formula: '2d6+1', rolls: [{ die: 'd6', value: 3, max: 6 }, { die: 'd6', value: 5, max: 6 }], modifiers: 1, total: 9, crit: null, rolledBy: 'Anna',
  ...overrides,
});

function setup() {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'remote-log', undefined, false, { remote: true });
  const dice = new RemoteViewDice(store);
  const bus = new EventEmitter();
  const view = { viewId: 'remote-log', serviceManager: { getEventBus: () => bus } } as never;
  const roller = vi.fn((): string | null => 'Not connected');
  const stop = registerRemoteControls('remote-log', { owner: 'ext', fitMap: () => undefined, roll: roller });
  const shown = render(
    <AtlasUIContext.Provider value={{ app, view, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store as never}><DiceRollLog isOpen onClose={() => undefined} /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { store, dice, roller, stop, shown, bus };
}

describe("a remote view's dice log", () => {
  it('shows the shared log as it changes, hides Clear, and never takes Atlas\'s own rolls', () => {
    const { dice, stop, shown, bus } = setup();
    act(() => dice.setDiceLog([roll('a')]));
    expect(shown.container.textContent).toContain('2d6+1');
    act(() => dice.setDiceLog([roll('b', { formula: '1d20', rolls: [{ die: 'd20', value: 7, max: 20 }], modifiers: 0, total: 7 }), roll('a')]));
    expect(shown.container.textContent).toContain('1d20');
    expect(screen.queryByLabelText('Clear history')).toBeNull();
    // Even a roll on the view's own bus: a remote view's log is its owner's alone.
    act(() => { bus.emit('dice-rolled', roll('mine', { formula: '9d9' })); });
    expect(bus.listenerCount('dice-rolled')).toBe(0);
    expect(shown.container.textContent).not.toContain('9d9');
    stop();
  });

  it('sends Roll again to the owner, with the roll\'s own dice', () => {
    const { dice, roller, stop } = setup();
    act(() => dice.setDiceLog([roll('a')]));
    const again = document.querySelector<HTMLElement>('.dice-log-entry__repeat');
    expect(again).not.toBeNull();
    fireEvent.click(again!);
    expect(roller).toHaveBeenCalledWith({ d6: 2 }, 1);
    stop();
  });

  it('turns a logged roll back into the dice to roll, leaving out exploded dice, refusing what the tray cannot roll', () => {
    expect(rollOfResult(roll('a', { rolls: [{ die: 'd6', value: 6, max: 6 }, { die: 'd6', value: 2, max: 6, exploded: true }] }))).toEqual({ dice: { d6: 1 }, modifier: 1 });
    expect(rollOfResult(roll('a', { unlistedDice: 3 }))).toBeNull();
    expect(rollOfResult(roll('a', { rolls: [{ die: 'd6', value: 2, max: 6, negative: true }] }))).toBeNull();
    expect(rollOfResult(roll('a', { rolls: [] }))).toBeNull();
  });

  it('asks the roll listeners in turn until one sends it, and refuses too many dice', () => {
    const { store } = setup();
    const dice = new RemoteViewDice(store);
    expect(dice.roll({ d20: 1 }, 0)).toBe('The roll could not be sent.');
    const first = vi.fn((): string | null => 'Not connected');
    const second = vi.fn((): string | null => null);
    const third = vi.fn((): string | null => null);
    dice.rolls.add(first);
    dice.rolls.add(second);
    dice.rolls.add(third);
    expect(dice.roll({ d20: 1, nonsense: 3 }, 2)).toBeNull();
    expect(second).toHaveBeenCalledWith({ d20: 1 }, 2);
    expect(third).not.toHaveBeenCalled();
    expect(dice.roll({ d6: 101 }, 0)).toBe(rollDiceCount(100));
    // An owner's own limit: an extension may offer fewer dice, here 20.
    const twenty = new RemoteViewDice(store, 20);
    twenty.rolls.add(() => null);
    expect(twenty.roll({ d6: 21 }, 0)).toBe('Roll 1 to 20 dice.');
    expect(twenty.roll({ d6: 20 }, 0)).toBeNull();
    expect(store.getState().remoteView?.maxDice).toBe(20);
  });
});
