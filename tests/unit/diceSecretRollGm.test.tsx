import { act, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiceRollDisplay } from '../../src/app/react/components/dice/DiceRollDisplay';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { DiceToastObserver } from '../../src/app/services/DiceToastObserver';
import type { SoundEffectService } from '../../src/app/services/SoundEffectService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { DiceRollResult } from '../../src/app/tools/DiceTool';

function secretRoll(): DiceRollResult {
  return {
    id: 'roll', timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 13, max: 20 }],
    modifiers: 0, total: 13, secret: true,
  };
}

describe('the GM hears and sees secret rolls', () => {
  it('plays the result sound for a secret roll', () => {
    const playDiceResult = vi.fn();
    const observer = new DiceToastObserver(
      { playDiceResult } as unknown as SoundEffectService,
      { getDiceDisplay: () => 'card' }
    );
    document.dispatchEvent(new CustomEvent('atlas-dice-rolled', { detail: secretRoll() }));
    observer.destroy();
    expect(playDiceResult).toHaveBeenCalledTimes(1);
  });

  it('shows a secret roll in the GM display', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { app } = createInMemoryApp({ files: {} });
    const { container } = render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <DiceRollDisplay />
      </AtlasUIContext.Provider>
    );
    act(() => { document.dispatchEvent(new CustomEvent('atlas-dice-rolled', { detail: secretRoll() })); });
    expect(container.querySelector('.atlas-dice-rolls')).not.toBeNull();
  });
});
