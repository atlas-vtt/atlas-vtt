import { describe, expect, it, vi } from 'vitest';
import { DiceToastObserver } from '../../src/app/services/DiceToastObserver';
import type { SoundEffectService } from '../../src/app/services/SoundEffectService';
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
});
