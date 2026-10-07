import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { diceApi } from '../../src/api/dice';
import { DisposerSet } from '../../src/api/disposers';
import { DEFAULT_DICE_RULES } from '../../src/app/gameSystems/diceRules';
import { DiceTool, type DiceRollInputs } from '../../src/app/tools/DiceTool';
import { rollFormula, type DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeView, trackerWith, type FakeView } from './apiFakes';

/**
 * #277 keeps Atlas's own rolls in the map view that made them: each view's log, toasts, sounds and the player
 * window hear its `dice-rolled` bus event. The API keeps its contract on top of that: `roll` and `publish` reach every
 * open GM map view, and `onRolled` hears every roll Atlas logs once.
 */

/** A fake map view with its own event bus, as `AtlasView.serviceManager.getEventBus()` gives it. */
function viewWithBus(viewId: string): { view: FakeView; bus: EventEmitter; heard: DiceRollResult[] } {
  const view = fakeView(viewId);
  const bus = new EventEmitter();
  const heard: DiceRollResult[] = [];
  bus.on('dice-rolled', (result: DiceRollResult) => heard.push(result));
  Object.assign(view, { serviceManager: { getEventBus: () => bus } });
  return { view, bus, heard };
}

const inputs = (): DiceRollInputs => ({
  random: () => 0.5, rollId: () => `roll_${Math.random()}`, roller: () => 'Player', onFormulaError: vi.fn(),
});

afterEach(() => vi.restoreAllMocks());

describe('dice and the map views that show them', () => {
  it('publish reaches the bus of every open GM map view, and onRolled hears it once', () => {
    const a = viewWithBus('a');
    const b = viewWithBus('b');
    const { tracker } = trackerWith([a.view, b.view]);
    const dice = diceApi(createInMemoryApp().app, new DisposerSet(), tracker);
    const heard = vi.fn();
    dice.onRolled(heard);
    const made = rollFormula('1d20', () => 0.5, 1);
    dice.publish(made);
    expect(a.heard).toEqual([made]);
    expect(b.heard).toEqual([made]);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('a view whose bus throws is logged and does not keep the roll from the others', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = viewWithBus('broken');
    broken.bus.on('dice-rolled', () => { throw new Error('boom'); });
    const fine = viewWithBus('fine');
    const { tracker } = trackerWith([broken.view, fine.view]);
    const dice = diceApi(createInMemoryApp().app, new DisposerSet(), tracker);
    const heard = vi.fn();
    dice.onRolled(heard);
    dice.publish(rollFormula('1d4', () => 0, 1));
    expect(fine.heard).toHaveLength(1);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('[Atlas API] A map view could not show a roll:', expect.any(Error));
  });

  it("a tray roll stays in its own view's log, and onRolled hears it once", () => {
    const a = viewWithBus('a');
    const b = viewWithBus('b');
    const { tracker } = trackerWith([a.view, b.view]);
    const dice = diceApi(createInMemoryApp().app, new DisposerSet(), tracker);
    const heard = vi.fn();
    dice.onRolled(heard);
    const tool = new DiceTool(a.bus, () => DEFAULT_DICE_RULES, inputs());
    const result = tool.rollDice('2d6');
    expect(a.heard).toEqual([result]);
    expect(b.heard).toEqual([]);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0]![0]).toEqual(result);
  });

  it('a formula the tray refuses is refused by roll too: nothing rolled, nothing logged, nothing heard', () => {
    const a = viewWithBus('a');
    const { tracker } = trackerWith([a.view]);
    const dice = diceApi(createInMemoryApp().app, new DisposerSet(), tracker);
    const heard = vi.fn();
    dice.onRolled(heard);
    const random = vi.spyOn(Math, 'random');
    for (const formula of ['1d20 + rm -rf', '101d6', '1d1001', '1d6+1d6+1d6+1d6+1d6+1d6+1d6+1d6+1d6+1d6+1', '1d0', 'x'.repeat(65)]) {
      expect(() => dice.roll({ formula })).toThrow(/^\[Atlas API\] dice\.roll: Atlas does not roll/);
    }
    // A bare bonus is checked as given, so completing it cannot slip text past the check.
    expect(() => dice.roll({ formula: '+3 oops' })).toThrow('[Atlas API] dice.roll:');
    expect(random).not.toHaveBeenCalled();
    expect(a.heard).toEqual([]);
    expect(heard).not.toHaveBeenCalled();
  });

  it('an empty formula and a bare bonus roll the default roll, as the tray does', () => {
    const dice = diceApi(createInMemoryApp().app, new DisposerSet());
    expect(dice.roll({ formula: '' }).formula).toBe(DEFAULT_DICE_RULES.defaultRoll);
    expect(dice.roll({ formula: '+3' }).formula).toBe(`${DEFAULT_DICE_RULES.defaultRoll}+3`);
    expect(dice.roll({ formula: '2' }).formula).toBe(`${DEFAULT_DICE_RULES.defaultRoll}+2`);
  });
});
