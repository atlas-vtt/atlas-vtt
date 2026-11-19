import { describe, expect, it } from 'vitest';
import { BUILT_IN_DICE_SETS } from '../../src/app/gameSystems/builtInDiceSets';
import { advantageSidesFor, ruledSides } from '../../src/app/tools/diceAdvantage';
import { rollingWith } from '../../src/app/tools/DiceTool';
import { DiceTool } from '../../src/app/tools/DiceTool';
import { EventEmitter } from 'events';
import {
  advantageMoot, statusMessage, trayStatus, type TrayAdvantage,
} from '../../src/app/react/components/dice/diceTrayStatus';

const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d20')!;
const advantage: TrayAdvantage = { sides: ruledSides(d20), applies: (formula) => advantageSidesFor(formula, d20).length > 0, dice: 'd20' };
const tool = new DiceTool(new EventEmitter(), () => rollingWith(d20, undefined).rules, {
  random: () => 0.5, rollId: () => 'id', roller: () => 'GM', onFormulaError: () => undefined,
});
const check = (formula: string, side: 'advantage' | 'disadvantage' | null): ReturnType<DiceTool['checkRoll']> =>
  tool.checkRoll(formula, side ? { advantage: side } : undefined);

describe('dice tray status', () => {
  it('says what to do with an empty tray and with a modifier alone', () => {
    expect(trayStatus('', 'normal', advantage, check)).toEqual({ kind: 'empty' });
    const modifierOnly = trayStatus('+4', 'normal', advantage, check);
    expect(modifierOnly).toEqual({ kind: 'no-dice', modifier: 4 });
    expect(statusMessage(modifierOnly)).toBe('');
  });

  it('rolls a typed formula the parser takes, with the side where advantage changes it', () => {
    expect(trayStatus('4d6kh3', 'advantage', advantage, check)).toEqual({ kind: 'ready', formula: '4d6kh3', advantage: null });
    expect(trayStatus('1d20 − 2', 'advantage', advantage, check)).toEqual({ kind: 'ready', formula: '1d20 - 2', advantage: 'advantage' });
  });

  it('says why a formula cannot be rolled, before anything rolls', () => {
    const status = trayStatus('2d+banana', 'normal', advantage, check);
    expect(status).toEqual({ kind: 'invalid', formula: '2d+banana', code: 'syntax', byAdvantage: false });
    expect(statusMessage(status)).toBe('“2d” is not a die or a number');
    expect(statusMessage(trayStatus('2d1', 'normal', advantage, check))).toBe('“2d1”: dice have 2 to 1,000 faces');
    expect(statusMessage(trayStatus('4d6kh5', 'normal', advantage, check))).toBe('“4d6kh5” does not fit its dice');
    expect(trayStatus('101d6', 'normal', advantage, check)).toMatchObject({ kind: 'invalid', code: 'dice' });
  });

  it('counts the die advantage adds toward the limit', () => {
    const status = trayStatus('99d6 + 1d20', 'advantage', advantage, check);
    expect(status).toEqual({ kind: 'invalid', formula: '99d6 + 1d20', code: 'dice', byAdvantage: true });
    expect(statusMessage(status)).toBe('Advantage adds a die: take one away or roll Normal');
    expect(trayStatus('99d6 + 1d20', 'normal', advantage, check).kind).toBe('ready');
  });

  it('holds advantage moot only where dice stand that it does not change', () => {
    expect(advantageMoot('', advantage)).toBe(false);
    expect(advantageMoot('2d6', advantage)).toBe(true);
    expect(advantageMoot('1d20 + 2d6', advantage)).toBe(false);
    expect(advantageMoot('2d6', undefined)).toBe(false);
  });
});
