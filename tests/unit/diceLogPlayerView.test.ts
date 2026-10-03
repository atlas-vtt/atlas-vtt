import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDiceHistory } from '../../src/app/react/components/dice-log/useDiceHistory';
import type { DiceRollResult } from '../../src/app/tools/DiceTool';

function entry(id: string, secret?: true): DiceRollResult {
  return {
    id, timestamp: 1, formula: '1d20', rolls: [{ die: 'd20', value: 13, max: 20 }],
    modifiers: 0, total: 13, ...(secret ? { secret } : {}),
  };
}

function roll(result: DiceRollResult): void {
  act(() => { document.dispatchEvent(new CustomEvent('atlas-dice-rolled', { detail: result })); });
}

describe('the dice log in a player view', () => {
  it('leaves a secret roll out of the history', () => {
    const { result } = renderHook(() => useDiceHistory(() => null, undefined, { hideSecret: true }));
    roll(entry('secret', true));
    expect(result.current.history).toEqual([]);
  });

  it('still lists a normal roll', () => {
    const { result } = renderHook(() => useDiceHistory(() => null, undefined, { hideSecret: true }));
    roll(entry('normal'));
    expect(result.current.history.map((item) => item.id)).toEqual(['normal']);
  });

  it('does not store a secret roll in the dice log', () => {
    const addDiceLogEntry = vi.fn();
    const storeActions = { diceLog: [], addDiceLogEntry, clearDiceLog: vi.fn() };
    renderHook(() => useDiceHistory(() => null, storeActions, { hideSecret: true }));
    roll(entry('secret', true));
    expect(addDiceLogEntry).not.toHaveBeenCalled();
  });
});

describe('a dice log that already holds secret rolls', () => {
  const seeded = { diceLog: [entry('secret', true), entry('normal')], addDiceLogEntry: vi.fn(), clearDiceLog: vi.fn() };

  it('leaves them out of a player view', () => {
    const { result } = renderHook(() => useDiceHistory(() => null, seeded, { hideSecret: true }));
    expect(result.current.history.map((item) => item.id)).toEqual(['normal']);
  });

  it('keeps them in the GM view', () => {
    const { result } = renderHook(() => useDiceHistory(() => null, seeded));
    expect(result.current.history.map((item) => item.id)).toEqual(['secret', 'normal']);
  });
});

describe('the dice log in the GM view', () => {
  it('lists a secret roll', () => {
    const { result } = renderHook(() => useDiceHistory(() => null));
    roll(entry('secret', true));
    expect(result.current.history.map((item) => item.id)).toEqual(['secret']);
  });
});
