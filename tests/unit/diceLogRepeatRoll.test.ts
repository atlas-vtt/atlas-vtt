import { act, renderHook } from '@testing-library/react';
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it } from 'vitest';
import { useDiceHistory } from '../../src/app/react/components/dice-log/useDiceHistory';
import { DiceTool, type DiceRollResult } from '../../src/app/tools/DiceTool';

const undoers: Array<() => void> = [];
afterEach(() => undoers.splice(0).forEach((undo) => undo()));

function collectRolls(): DiceRollResult[] {
  const rolls: DiceRollResult[] = [];
  const listener = (event: Event): void => { rolls.push((event as CustomEvent<DiceRollResult>).detail); };
  document.addEventListener('atlas-dice-rolled', listener);
  undoers.push(() => document.removeEventListener('atlas-dice-rolled', listener));
  return rolls;
}

describe('repeating a roll from the dice log', () => {
  it('is never secret, even while the tray switch is on', () => {
    const diceTool = new DiceTool(new EventEmitter());
    diceTool.setSecretRoll(true);
    const rolls = collectRolls();
    const { result } = renderHook(() => useDiceHistory(() => diceTool));
    act(() => result.current.repeatRoll('1d20'));
    expect(rolls[0] && 'secret' in rolls[0]).toBe(false);
  });
});
