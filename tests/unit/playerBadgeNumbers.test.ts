import { describe, expect, it, vi } from 'vitest';
import { ShownBadgeNumbers, type PlayerBadgeState } from '../../src/app/pixi/token-renderer/PlayerBadgeNumbers';
import type { TokenEntity } from '../../src/app/types';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';

const goblin = (id: string, instanceNumber: number, extra: Partial<TokenEntity> = {}): TokenEntity =>
  ({ id, kind: 'token', x: 0, y: 0, imagePath: 'goblin.png', instanceNumber, ...extra }) as TokenEntity;

/** Goblins A, B and C (GM numbers 1, 2, 3) and an orc. */
function table(): { state: PlayerBadgeState & { tokenSettings: { showInstanceBadges: boolean } }; numbers: ShownBadgeNumbers } {
  const state = {
    levels: undefined,
    viewedLevel: undefined,
    objects: { tokens: { A: goblin('A', 1), B: goblin('B', 2), C: goblin('C', 3), O: { ...goblin('O', 1), imagePath: 'orc.png' } } },
    tokenSettings: { showInstanceBadges: true },
  } as unknown as PlayerBadgeState & { tokenSettings: { showInstanceBadges: boolean } };
  return { state, numbers: new ShownBadgeNumbers(() => state) };
}

const seeing = (...ids: string[]) => (id: string): boolean => ids.includes(id);
const shown = (numbers: ShownBadgeNumbers, ...ids: string[]): (number | null)[] => ids.map((id) => numbers.numberOf(id));

describe('the numbers the players are shown on look-alikes', () => {
  it('are the GM\'s numbers of the tokens they see, gaps and all', () => {
    const { numbers } = table();
    numbers.pass(seeing('A', 'C', 'O'));
    expect(shown(numbers, 'A', 'B', 'C', 'O')).toEqual([1, null, 3, null]);
  });

  it('keep the GM\'s number on a token they see alone among its look-alikes', () => {
    const { numbers } = table();
    numbers.pass(seeing('B'));
    expect(shown(numbers, 'A', 'B', 'C')).toEqual([null, 2, null]);
  });

  it('are none while badges are off', () => {
    const { state, numbers } = table();
    state.tokenSettings.showInstanceBadges = false;
    numbers.pass(seeing('A', 'B', 'C'));
    expect(shown(numbers, 'A', 'B', 'C')).toEqual([null, null, null]);
  });

  it('count a combatant beside the map their initiative list shows, and never one that is hidden', () => {
    const { state, numbers } = table();
    state.objects.tokens.B = goblin('B', 2, { offMap: true } as Partial<TokenEntity>);
    state.objects.tokens.C = goblin('C', 3, { offMap: true, isHidden: true } as Partial<TokenEntity>);
    numbers.pass(seeing());
    expect(shown(numbers, 'A', 'B', 'C')).toEqual([null, 2, null]);
  });

  it('count the look-alikes on the level shown, as the GM\'s map does', () => {
    const { state, numbers } = table();
    const levels = [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 } },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 } },
    ] as SceneLevel[];
    Object.assign(state, { levels, viewedLevel: 'ground' });
    state.objects.tokens.A = goblin('A', 1, { level: 'ground' } as Partial<TokenEntity>);
    state.objects.tokens.B = goblin('B', 2, { level: 'upper' } as Partial<TokenEntity>);
    state.objects.tokens.C = goblin('C', 3, { level: 'upper' } as Partial<TokenEntity>);
    numbers.pass(seeing('A', 'B', 'C'));
    expect(shown(numbers, 'A', 'B', 'C')).toEqual([null, null, null]);
    state.viewedLevel = 'upper';
    numbers.pass(seeing('A', 'B', 'C'));
    expect(shown(numbers, 'A', 'B', 'C')).toEqual([null, 2, 3]);
  });

  it('say when they change, and only then', () => {
    const { state, numbers } = table();
    const changed = vi.fn();
    numbers.onNumbersChange(changed);

    numbers.pass(seeing('B', 'C'));
    numbers.pass(seeing('B', 'C'));
    expect(changed).toHaveBeenCalledTimes(1);

    state.tokenSettings.showInstanceBadges = false;
    numbers.pass(seeing('B', 'C'));
    expect(changed).toHaveBeenCalledTimes(2);
    expect(numbers.numberOf('B')).toBeNull();

    numbers.reset();
    expect(changed).toHaveBeenCalledTimes(2);
    state.tokenSettings.showInstanceBadges = true;
    numbers.pass(seeing('B'));
    numbers.reset();
    expect(changed).toHaveBeenCalledTimes(4);
    expect(numbers.numberOf('B')).toBeNull();
  });
});
