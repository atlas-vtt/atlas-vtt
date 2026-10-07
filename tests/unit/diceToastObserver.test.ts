import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiceToastObserver } from '../../src/app/services/DiceToastObserver';
import type { SoundEffectService } from '../../src/app/services/SoundEffectService';
import { rollFormula, type DiceRollResult } from '../../src/app/tools/diceRolling';

/** The view's bus, where its sound observer hears its rolls (#277). */
const bus = new EventEmitter();

function observe(display: 'card' | 'fast' | 'full'): { playDiceResult: ReturnType<typeof vi.fn>; observer: DiceToastObserver } {
  const playDiceResult = vi.fn();
  const observer = new DiceToastObserver({ playDiceResult } as unknown as SoundEffectService, { getDiceDisplay: () => display }, bus);
  return { playDiceResult, observer };
}

const roll = (extra: Partial<DiceRollResult> = {}): void => {
  bus.emit('dice-rolled', { ...rollFormula('1d20', () => 0.5, 1), ...extra });
};

describe('the sound of a roll shown as a card', () => {
  let observer: DiceToastObserver | null = null;
  afterEach(() => observer?.destroy());

  it('is left to the 3D dice when the GM rolls them', () => {
    const seen = observe('full');
    observer = seen.observer;
    roll();
    expect(seen.playDiceResult).not.toHaveBeenCalled();
  });

  it('plays for a roll by someone else even with 3D dice on, since it is never thrown', () => {
    const seen = observe('full');
    observer = seen.observer;
    roll({ rolledBy: 'Ana' });
    expect(seen.playDiceResult).toHaveBeenCalledTimes(1);
  });
});
