// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { sceneFromRolls } from '../../src/app/dice3d/diceScene';
import { DiceRollEntry } from '../../src/app/react/components/dice-log/DiceRollEntry';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { DiceToast } from '../../src/app/react/components/dice/DiceToast';
import { hasBreakdown, rollBreakdown, rollFormula, rollLabel, titledByFormula } from '../../src/app/react/components/dice3d/diceRollText';
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
  it('names it in the result card\'s title and writes only numbers below', () => {
    const { container } = render(<DiceToast result={stealthy} phase="visible" onDismiss={() => undefined} useAvatar={() => null} />);
    expect(text(container.querySelector('.atlas-dice-toast__ability'))).toBe('Dexterity + Stealth');
    expect(text(container.querySelector('.atlas-dice-toast__formula'))).toBe('1d20+3+2');
  });

  it('adds the whole sum after the dice a roll with advantage lists', () => {
    const advantaged = { ...stealthy, advantage: 'advantage' as const, rolls: [d20(4, { dropped: true }), d20(14)] };
    const { container } = render(<DiceToast result={advantaged} phase="visible" onDismiss={() => undefined} useAvatar={() => null} />);
    expect(text(container.querySelector('.atlas-rolled-dice'))).toBe('(4) (dropped) · 14 + 5');
  });

  it('names it in the dice log and writes only numbers there', () => {
    const container = logEntry(stealthy);
    expect(text(container.querySelector('.dice-log-entry__ability-name'))).toBe('Dexterity + Stealth');
    expect(text(container.querySelector('.dice-log-entry__formula'))).toBe('1d20+3+2');
    expect(text(container.querySelector('.dice-log-entry__total'))).toBe('19');
  });

  it('titles the 3D panel by it and leaves it out of the formula and the breakdown', () => {
    const scene = sceneFromRolls(stealthy.rolls)!;
    expect(rollLabel(stealthy)).toBe('Dexterity + Stealth');
    expect(rollFormula(stealthy)).toBe('1d20+3+2');
    expect(rollBreakdown(stealthy, scene)).toBe('14 + 5');
    const alone = { ...stealthy, formula: '1d20+0[Luck]', modifiers: 0, total: 14, namedModifiers: [{ label: 'Luck', value: 0 }] };
    expect(hasBreakdown(alone, scene)).toBe(false);
  });

  it('names a statblock\'s bare bonus once, by what it was rolled for', () => {
    const pickpocket = { ...stealthy, formula: '+2[Pickpocket]', modifiers: 2, total: 16, namedModifiers: [{ label: 'Pickpocket', value: 2 }], source: { type: 'statblock' as const, abilityName: 'Pickpocket' } };
    expect(rollLabel(pickpocket)).toBe('Pickpocket');
    expect(rollFormula(pickpocket)).toBe('+2');
    const punctuated = { ...pickpocket, formula: '+2[Sneak Attack Rogue]', namedModifiers: [{ label: 'Sneak Attack Rogue', value: 2 }], source: { type: 'statblock' as const, abilityName: 'Sneak Attack (Rogue)' } };
    expect(rollLabel(punctuated)).toBe('Sneak Attack (Rogue)');
  });

  it('titles a typed formula by its label', () => {
    const typed: DiceRollResult = { ...stealthy, source: { type: 'toolbar' } };
    expect(rollLabel(typed)).toBe('Stealth');
    expect(titledByFormula(typed)).toBe(false);
  });

  it('reads a roll logged before labelled modifiers as before', () => {
    const older: DiceRollResult = { id: 'o', timestamp: 0, formula: '1d20+5', rolls: [d20(12)], modifiers: 5, total: 17 };
    const container = logEntry(older);
    expect(text(container.querySelector('.dice-log-entry__formula'))).toBe('1d20+5');
    expect(rollBreakdown(older, sceneFromRolls(older.rolls)!)).toBe('12 + 5');
  });
});
