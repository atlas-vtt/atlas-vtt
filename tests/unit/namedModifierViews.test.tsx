// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { sceneFromRolls } from '../../src/app/dice3d/diceScene';
import { DiceRollEntry } from '../../src/app/react/components/dice-log/DiceRollEntry';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { DiceToast } from '../../src/app/react/components/dice/DiceToast';
import { hasBreakdown, rollBreakdown } from '../../src/app/react/components/dice3d/diceRollText';
import type { DiceRollResult } from '../../src/app/types/diceTypes';

afterEach(cleanup);

const d20 = (value: number, more: object = {}): DiceRollResult['rolls'][number] => ({ die: 'd20', value, max: 20, ...more });

/** "Dexterity: d20 + 3 + 2 Stealth", as a statblock rolls it with Stealth armed. */
const stealthy: DiceRollResult = {
  id: 's', timestamp: 0, formula: '1d20+3+2[Stealth]', rolls: [d20(14)], modifiers: 5, total: 19,
  namedModifiers: [{ label: 'Stealth', value: 2 }], source: { type: 'statblock', abilityName: 'Dexterity' },
};

const UI = { app: {}, view: null, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;

function logEntry(result: DiceRollResult): HTMLElement {
  return render(<AtlasUIContext.Provider value={UI}><DiceRollEntry result={result} onRepeat={() => undefined} /></AtlasUIContext.Provider>).container;
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/ /g, ' ');

describe('a roll with a labelled modifier', () => {
  it('shows it as a term of its own on the result card', () => {
    const { container } = render(<DiceToast result={stealthy} phase="visible" onDismiss={() => undefined} useAvatar={() => null} />);
    expect(text(container.querySelector('.atlas-dice-toast__ability'))).toBe('Dexterity');
    expect(text(container.querySelector('.atlas-dice-toast__formula'))).toBe('1d20+3 + 2 Stealth');
  });

  it('shows it after the dice a roll with advantage lists', () => {
    const advantaged = { ...stealthy, advantage: 'advantage' as const, rolls: [d20(4, { dropped: true }), d20(14)] };
    const { container } = render(<DiceToast result={advantaged} phase="visible" onDismiss={() => undefined} useAvatar={() => null} />);
    expect(text(container.querySelector('.atlas-rolled-dice'))).toBe('4 (dropped) · 14 + 3 + 2 Stealth');
  });

  it('shows it in the dice log', () => {
    const container = logEntry(stealthy);
    expect(text(container.querySelector('.dice-log-entry__formula'))).toBe('1d20+3 + 2 Stealth');
    expect(text(container.querySelector('.dice-log-entry__total'))).toBe('19');
  });

  it('shows it in the 3D panel\'s breakdown', () => {
    const scene = sceneFromRolls(stealthy.rolls)!;
    expect(rollBreakdown(stealthy, scene)).toBe('14 + 3 + 2 Stealth');
    const alone = { ...stealthy, formula: '1d20+0[Luck]', modifiers: 0, total: 14, namedModifiers: [{ label: 'Luck', value: 0 }] };
    expect(hasBreakdown(alone, scene)).toBe(true);
    expect(rollBreakdown(alone, scene)).toBe('14 + 0 Luck');
  });

  it('reads a roll logged before labelled modifiers as before', () => {
    const older: DiceRollResult = { id: 'o', timestamp: 0, formula: '1d20+5', rolls: [d20(12)], modifiers: 5, total: 17 };
    const container = logEntry(older);
    expect(text(container.querySelector('.dice-log-entry__formula'))).toBe('1d20+5');
    expect(rollBreakdown(older, sceneFromRolls(older.rolls)!)).toBe('12 + 5');
  });
});
