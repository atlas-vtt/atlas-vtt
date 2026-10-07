import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { DiceToast } from '../../src/app/react/components/dice/DiceToast';
import { useDiceAvatar } from '../../src/app/react/components/dice/useDiceAvatar';
import { DiceRollEntry } from '../../src/app/react/components/dice-log/DiceRollEntry';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import type { DiceRollResult } from '../../src/app/tools/diceRolling';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const roll: DiceRollResult = {
  id: 'r', timestamp: Date.now(), formula: '2d6', modifiers: 0, total: 7, rolledBy: 'Anna',
  rolls: [{ die: 'd6', value: 3, max: 6 }, { die: 'd6', value: 4, max: 6 }],
};

function inAtlas(element: React.ReactElement): HTMLElement {
  const { app } = createInMemoryApp();
  return render(<AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>{element}</AtlasUIContext.Provider>).container;
}

describe("a roll by someone else in Atlas's dice log", () => {
  it('names who rolled it in the log entry and the toast', () => {
    expect(inAtlas(<DiceRollEntry result={roll} onRepeat={() => {}} />).querySelector('.dice-log-entry__token-name')?.textContent).toBe('Anna');
    expect(inAtlas(<DiceToast result={roll} phase="visible" onDismiss={() => {}} useAvatar={useDiceAvatar} />).querySelector('.atlas-dice-toast__name')?.textContent).toBe('Anna');
  });

  it("names nobody for the GM's own roll from the tray", () => {
    const { rolledBy: _rolledBy, ...gmRoll } = roll;
    expect(inAtlas(<DiceRollEntry result={gmRoll} onRepeat={() => {}} />).querySelector('.dice-log-entry__token-name')).toBeNull();
  });
});
