import { describe, expect, it } from 'vitest';
import { DEFAULT_DICE_RULES } from '../../../../src/app/gameSystems/diceRules';
import { rollingRules } from '../../../../src/app/gameSystems/diceSets';
import { splitDiceSegments, toRollFormula } from '../../../../src/app/services/statblockDiceText';
import { rollStatblockDice, type OffMapRolls } from '../../../../src/app/services/statblockRolls';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { sheetState } from '../../../../src/app/statblocks/render/sheetState';
import { valueText } from '../../../../src/app/statblocks/values/valueText';
import { namedReferenceRolls, referenceLabel, referenceRolls } from '../../../../src/app/statblocks/values/referenceRolls';
import { rollDiceFormula } from '../../../../src/app/tools/DiceTool';
import { FORMULA_LIMITS } from '../../../../src/app/tools/parseFormula';
import { templateOf } from '../render/sheetTestKit';

const VALUES: Record<string, number> = { agility: -1, agi: 2, 'str.mod': 3, 'int.mod': -1, level: 3, 'hit-dice': 2, str: 3 };
const lookup = (path: string): number | undefined => VALUES[path];
const rolls = (text: string): ReturnType<typeof referenceRolls> => referenceRolls(text, lookup);

const roll = (formula: string): ReturnType<typeof rollDiceFormula> =>
  rollDiceFormula(formula, DEFAULT_DICE_RULES, { random: () => 0.5, rollId: () => 'r', roller: () => 'GM', onFormulaError: () => undefined });

describe('the rolls of a text with references', () => {
  it('names a reference added to the roll by its path, made readable', () => {
    expect(rolls('2d8 + @agility')).toEqual([{ formula: '2d8-1', named: '2d8-1[Agility]' }]);
    expect(rolls('+4+@agi')).toEqual([{ formula: '+4+2', named: '+4+2[Agi]' }]);
    expect(rolls('1d20 + @str.mod')).toEqual([{ formula: '1d20+3', named: '1d20+3[Str mod]' }]);
    expect(referenceLabel('hit-dice')).toBe('Hit dice');
    expect(referenceLabel('stats.dex_save')).toBe('Stats dex save');
  });

  it('keeps the sign of a negative number, the minus it took over included', () => {
    expect(rolls('1d20 + @int.mod')).toEqual([{ formula: '1d20-1', named: '1d20-1[Int mod]' }]);
    expect(rolls('1d20 - @int.mod')).toEqual([{ formula: '1d20+1', named: '1d20+1[Int mod]' }]);
    expect(roll('1d20-1[Int mod]')?.namedModifiers).toEqual([{ label: 'Int mod', value: -1 }]);
  });

  it('names a reference that opens the roll, and two of one name as two terms', () => {
    expect(rolls('@agi + 1d20')).toEqual([{ formula: '2+1d20', named: '2[Agi]+1d20' }]);
    expect(rolls('1d20 + @str + @str')).toEqual([{ formula: '1d20+3+3', named: '1d20+3[Str]+3[Str]' }]);
    expect(roll('1d20+3[Str]+3[Str]')?.namedModifiers).toEqual([{ label: 'Str', value: 3 }, { label: 'Str', value: 3 }]);
  });

  it('leaves a dice count, a factor, a number labelled already and every number of a formula that is no plain sum unnamed', () => {
    expect(rolls('@level d6')).toEqual([{ formula: '3d6', named: null }]);
    expect(rolls('@level d6 + @str')).toEqual([{ formula: '3d6+3', named: '3d6+3[Str]' }]);
    expect(rolls('1d4 * @str')).toEqual([{ formula: '1d4*3', named: null }]);
    expect(rolls('(1d8 + @str) * 2')).toEqual([{ formula: '(1d8+3)*2', named: null }]);
    expect(rolls('5d10cs>=8 + @str')).toEqual([{ formula: '5d10cs>=8+3', named: null }]);
    expect(rolls('1d20 + @str[Might] + @agi')).toEqual([{ formula: '1d20+3[Might]+2', named: '1d20+3[Might]+2[Agi]' }]);
  });

  it('rolls plain where the names would take the formula past the length limit', () => {
    const dice = '+1d100'.repeat(15);
    const plain = `1d20${dice}+3`;
    expect(plain.length).toBeLessThanOrEqual(FORMULA_LIMITS.characters);
    expect(`${plain}[Str mod]`.length).toBeGreaterThan(FORMULA_LIMITS.characters);
    expect(rolls(`1d20${dice} + @str.mod`)).toEqual([{ formula: plain, named: null }]);
  });

  it('names the references of a roll in running text, which then rolls them as terms of their own', () => {
    const [found] = rolls('Hits for 2d8 + @agility slashing damage.');
    expect(found).toEqual({ formula: '2d8-1', named: '2d8-1[Agility]' });
    expect(roll(found!.named!)).toMatchObject({ modifiers: -1, namedModifiers: [{ label: 'Agility', value: -1 }] });
  });

  it('leaves out a roll another value makes without the name', () => {
    expect(namedReferenceRolls(['2d8 + @agility', 'Bite: 1d6 + @str'], lookup)).toEqual(new Map([['2d8-1', '2d8-1[Agility]'], ['1d6+3', '1d6+3[Str]']]));
    expect(namedReferenceRolls(['2d8 + @agility', { desc: 'Claw: 2d8-1' }], lookup)).toEqual(new Map());
    expect(namedReferenceRolls(['2d8 + @agility', '2d8 + @int.mod'], lookup)).toEqual(new Map());
    expect(namedReferenceRolls(['2d8-1'], lookup).size).toBe(0);
  });
});

describe('a card\'s roll of a value with references', () => {
  const fields: TemplateField[] = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'agility', label: 'Agility', type: 'number' },
    { key: 'damage', label: 'Damage', type: 'dice' },
  ];
  const template: StatblockTemplate = templateOf(fields, [{ id: 'damage01', type: 'stat', field: 'damage', look: 'run-in' }]);
  const offMap: OffMapRolls = {
    roll: (formula, source) => { const result = roll(formula); return result && { ...result, source }; },
    show: () => undefined,
    rollingDice: () => rollingRules(DEFAULT_DICE_RULES),
  };
  const app = { workspace: { getLeavesOfType: () => [] }, vault: { getFileByPath: () => null } } as never;

  it('shows the plain number and rolls it named', () => {
    const state = sheetState({ template, record: { name: 'Kestrel', agility: -1, damage: '2d8 + @agility' }, mode: 'view' });
    const shown = valueText(state.reader('damage'));
    expect(shown).toBe('2d8 - 1');
    const [link] = splitDiceSegments(shown).filter((segment) => segment.dice);
    const formula = toRollFormula(link!.text);
    const result = rollStatblockDice(app, formula, { namedRolls: state.namedRolls }, offMap);
    expect(result).toMatchObject({ formula: '2d8-1[Agility]', modifiers: -1, namedModifiers: [{ label: 'Agility', value: -1 }] });
  });

  it('keeps the names of a bonus that fills a formula\'s length once it is completed, and rolls plain where they would not roll', () => {
    const long = `+1[${'A'.repeat(24)}]`.repeat(3) + '+1'.repeat(8);
    expect(long.length).toBe(FORMULA_LIMITS.characters);
    expect(rollStatblockDice(app, '+1', { namedRolls: new Map([['+1', long]]) }, offMap)?.formula).toBe(`1d20${long}`);
    expect(rollStatblockDice(app, '+1', { namedRolls: new Map([['+1', `${long}+1`]]) }, offMap)?.formula).toBe('1d20+1');
  });
});
