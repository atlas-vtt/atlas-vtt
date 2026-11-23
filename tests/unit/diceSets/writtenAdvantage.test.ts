import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_DICE_SETS } from '../../../src/app/gameSystems/builtInDiceSets';
import { codeRoll } from '../../../src/app/noteDice/noteDiceLinks';
import { trayStatus, type TrayAdvantage } from '../../../src/app/react/components/dice/diceTrayStatus';
import { slotAlone } from '../../../src/app/react/components/dice/diceTraySlots';
import { modifierOf, presetCount, withDie, withModifier, withPreset } from '../../../src/app/react/components/dice/diceTrayText';
import { advantageSidesFor, ruledSides } from '../../../src/app/tools/diceAdvantage';
import { DiceTool, rollDiceFormula, type DiceRollInputs } from '../../../src/app/tools/DiceTool';
import { combinedSide, writtenSide } from '../../../src/app/tools/writtenAdvantage';
import type { DiceSet } from '../../../src/app/types/diceSetTypes';
import { EventEmitter } from '../../../src/app/utils/typedEmitter';

const builtIn = (id: string): DiceSet => BUILT_IN_DICE_SETS.find((set) => set.id === id)!;
const d20 = builtIn('builtin:d20');
const powerRoll = builtIn('builtin:power-roll');
const plainD20: DiceSet = { id: 'plain', name: 'Plain', builtIn: false, crit: 'natural', dice: [{ count: 1, sides: 20 }] };

/** Inputs whose dice show `faces` in turn (each a face of a d`sides`), counting every random number drawn. */
function inputs(...faces: Array<[number, number]>): DiceRollInputs & { drawn: () => number } {
  const queue = [...faces];
  let drawn = 0;
  return {
    random: () => {
      drawn += 1;
      const [face, sides] = queue.shift() ?? [1, 2];
      return (face - 0.5) / sides;
    },
    rollId: () => 'roll',
    roller: () => 'GM',
    onFormulaError: vi.fn(),
    drawn: () => drawn,
  };
}

const values = (rolls: ReadonlyArray<{ value: number; dropped?: true }>): Array<number | string> =>
  rolls.map((roll) => (roll.dropped ? `(${roll.value})` : roll.value));

describe('reading the side a formula writes', () => {
  it('reads adv and dis as the last word, in any case, and the word alone', () => {
    expect(writtenSide('1d20+5 adv')).toEqual({ formula: '1d20+5', side: 'advantage', word: 'adv' });
    expect(writtenSide('+3  DIS ')).toEqual({ formula: '+3', side: 'disadvantage', word: 'DIS' });
    expect(writtenSide('adv')).toEqual({ formula: '', side: 'advantage', word: 'adv' });
  });

  it('leaves everything else to the parser', () => {
    for (const formula of ['1d20+5', '1d20+5adv', '1d20[dis]', '1d20 adv + 2', '1d20 advantage']) {
      expect(writtenSide(formula)).toEqual({ formula, side: null, word: '' });
    }
  });

  it('cancels a written side against the opposite one asked for', () => {
    expect(combinedSide('advantage', null)).toBe('advantage');
    expect(combinedSide(null, 'disadvantage')).toBe('disadvantage');
    expect(combinedSide('advantage', 'advantage')).toBe('advantage');
    expect(combinedSide('advantage', 'disadvantage')).toBeNull();
  });
});

describe('rolling a formula that writes its side', () => {
  it('rolls by the set rule: 2d20 keeping the best, the worst for dis', () => {
    const up = rollDiceFormula('1d20+5 adv', d20, inputs([4, 20], [17, 20]))!;
    expect(values(up.rolls)).toEqual(['(4)', 17]);
    expect(up.total).toBe(22);
    expect(up.advantage).toBe('advantage');
    expect(up.formula).toBe('1d20+5');

    const down = rollDiceFormula('+3 dis', d20, inputs([4, 20], [17, 20]))!;
    expect(values(down.rolls)).toEqual([4, '(17)']);
    expect(down.advantage).toBe('disadvantage');
  });

  it('rolls the set dice for the word alone', () => {
    expect(values(rollDiceFormula('adv', d20, inputs([9, 20], [3, 20]))!.rolls)).toEqual([9, '(3)']);
  });

  it('follows the set rule where it is no extra die: the power roll edge adds 2', () => {
    const edged = rollDiceFormula('+1 adv', powerRoll, inputs([5, 10], [6, 10]))!;
    expect(edged.total).toBe(5 + 6 + 1 + 2);
  });

  it('rolls plain where a click asks for the other side', () => {
    const cancelled = rollDiceFormula('1d20+5 adv', d20, inputs([12, 20]), undefined, 'disadvantage')!;
    expect(values(cancelled.rolls)).toEqual([12]);
    expect(cancelled.advantage).toBeUndefined();
  });

  it('refuses a written side that changes nothing, before any dice are drawn', () => {
    for (const [formula, set] of [['1d20 adv', plainD20], ['2d8 dis', d20]] as const) {
      const rolls = inputs();
      expect(rollDiceFormula(formula, set, rolls)).toBeNull();
      expect(rolls.onFormulaError).toHaveBeenCalledWith({ ok: false, code: 'advantage' });
      expect(rolls.drawn()).toBe(0);
    }
  });
});

describe('the dice tray with a written side', () => {
  const tray: TrayAdvantage = { sides: ruledSides(d20), applies: (formula) => advantageSidesFor(formula, d20).length > 0, dice: 'd20' };
  const tool = new DiceTool(new EventEmitter(), () => d20, inputs());
  const check = (formula: string, side: 'advantage' | 'disadvantage' | null): ReturnType<DiceTool['checkRoll']> =>
    tool.checkRoll(formula, side ? { advantage: side } : undefined);

  it('is ready to roll, the word included, and leaves the other side to cancel it', () => {
    expect(trayStatus('1d20 + 5 adv', 'normal', tray, check)).toEqual({ kind: 'ready', formula: '1d20 + 5 adv', advantage: null });
    expect(trayStatus('+5 adv', 'disadvantage', tray, check)).toEqual({ kind: 'ready', formula: '+5 adv', advantage: 'disadvantage' });
    expect(trayStatus('2d8 adv', 'normal', tray, check)).toMatchObject({ kind: 'invalid', code: 'advantage' });
  });

  it('keeps the word last when clicks change the dice or the modifier', () => {
    expect(withDie('1d20 + 5 adv', 6, 1)).toBe('1d6 + 1d20 + 5 adv');
    expect(withDie('adv', 20, 1)).toBe('1d20 adv');
    expect(withDie('1d20 dis', 20, -1)).toBe('dis');
    expect(modifierOf('1d20 + 5 adv')).toBe(5);
    expect(withModifier('1d20 + 5 adv', 6)).toBe('1d20 + 6 adv');
  });
});

describe('dice in notes with a written side', () => {
  it('links inline code that writes its side', () => {
    expect(codeRoll('dice: 1d20+5 adv')).toBe('1d20+5 adv');
    expect(codeRoll('1d20 dis')).toBe('1d20 dis');
  });
});

describe('a saved roll that writes its side', () => {
  const stealth = { id: 'stealth', name: 'Stealth', formula: '1d20+5 adv' };

  it('joins the tray as its bracketed roll with the side written last, and takes the side with its last copy', () => {
    const one = withPreset('', stealth.formula, 1);
    expect(one).toBe('(1d20+5) adv');
    expect(withPreset('1d6 + 2', stealth.formula, 1)).toBe('1d6 + (1d20+5) + 2 adv');
    const two = withPreset(one, stealth.formula, 1);
    expect(two).toBe('(1d20+5) + (1d20+5) adv');
    expect(presetCount(two, stealth.formula)).toBe(2);
    expect(withPreset(two, stealth.formula, -1)).toBe('(1d20+5) adv');
    expect(withPreset(withPreset('1d6', stealth.formula, 1), stealth.formula, -1)).toBe('1d6');
    // A side the formula already writes stays: opposite words would not read
    expect(withPreset('1d20 dis', stealth.formula, 1)).toBe('1d20 + (1d20+5) dis');
  });

  it('rolls alone with the tray\'s modifier and its side', () => {
    expect(slotAlone('2d6 + 3', { kind: 'preset', id: 'stealth' }, [stealth])).toBe('(1d20+5) + 3 adv');
  });

  it('rolls with the set\'s rule for its side', () => {
    const roll = rollDiceFormula(withPreset('', stealth.formula, 1), d20, inputs([4, 20], [17, 20]))!;
    expect(roll.advantage).toBe('advantage');
    expect(values(roll.rolls)).toEqual(['(4)', 17]);
    expect(roll.total).toBe(22);
  });
});
