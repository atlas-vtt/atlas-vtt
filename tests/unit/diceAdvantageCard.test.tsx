// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DiceToast } from '../../src/app/react/components/dice/DiceToast';
import type { DiceRollResult } from '../../src/app/types/diceTypes';

afterEach(cleanup);

const noAvatar = (): null => null;

function card(result: DiceRollResult): HTMLElement {
  const { container } = render(<DiceToast result={result} phase="visible" onDismiss={() => undefined} useAvatar={noAvatar} />);
  return container;
}

const advantaged: DiceRollResult = {
  id: 'r', timestamp: 0, formula: '1d20+5', modifiers: 5, total: 22, advantage: 'advantage',
  rolls: [{ die: 'd20', value: 4, max: 20, dropped: true }, { die: 'd20', value: 17, max: 20 }],
};

describe('a roll made with advantage, on its card', () => {
  it('names the side and lists its dice, the kept one in bold and the dropped one struck through', () => {
    const el = card(advantaged);
    expect(screen.getByText('Advantage')).toBeTruthy();
    expect(el.querySelector('.atlas-rolled-dice__die--kept')?.textContent).toBe('17');
    expect(el.querySelector('s.atlas-rolled-dice__die--dropped')?.textContent).toBe('4 (dropped)');
    expect(el.querySelector('.atlas-rolled-dice')?.textContent?.replace(/\u00a0/g, ' ')).toBe('4 (dropped) · 17 + 5');
  });

  it('marks the dropped die among the details', () => {
    const el = card(advantaged);
    fireEvent.click(screen.getByText('Details'));
    const badges = [...el.querySelectorAll('.atlas-dice-toast__die-badge')];
    expect(badges.map((badge) => [badge.textContent, badge.classList.contains('atlas-dice-toast__die-badge--dropped')])).toEqual([['d20: (4)', true], ['d20: 17', false]]);
    expect(badges[1]?.classList.contains('atlas-die-badge--kept')).toBe(true);
  });

  it('shows a roll without advantage as before', () => {
    const el = card({ id: 'p', timestamp: 0, formula: '1d20+5', modifiers: 5, total: 17, rolls: [{ die: 'd20', value: 12, max: 20 }] });
    expect(el.querySelector('.atlas-roll-advantage')).toBeNull();
    expect(el.querySelector('.atlas-dice-toast__formula')?.textContent).toBe('1d20+5');
  });
});
