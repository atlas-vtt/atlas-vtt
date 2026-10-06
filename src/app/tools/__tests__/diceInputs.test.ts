import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiceTool } from '../DiceTool';
import { DEFAULT_DICE_RULES } from '../../gameSystems/diceRules';

function setup(defaultRoll = '1d20') {
  const inputs = { random: vi.fn(() => 0.5), rollId: vi.fn(() => 'caller-roll'), roller: vi.fn(() => 'Mira'), onFormulaError: vi.fn() };
  const bus = new EventEmitter();
  const tool = new DiceTool(bus, () => ({ ...DEFAULT_DICE_RULES, defaultRoll }), inputs);
  return { tool, inputs, bus };
}

afterEach(() => vi.restoreAllMocks());

describe('DiceTool roll inputs', () => {
  it('uses only the supplied random source, id and roller', () => {
    const { tool, inputs } = setup();
    const ambient = vi.spyOn(Math, 'random');
    expect(tool.rollDice('2d6+3')).toMatchObject({ id: 'caller-roll', player: 'Mira', total: 11 });
    expect(inputs.random).toHaveBeenCalledTimes(2);
    expect(inputs.rollId).toHaveBeenCalledTimes(1);
    expect(ambient).not.toHaveBeenCalled();
  });

  it.each(['d20 garbage', '101d6', 'd1001', `+3${' '.repeat(63)}`, 'd20\n'])('rejects %j before randomness, history or events', (formula) => {
    const { tool, inputs, bus } = setup();
    const emit = vi.spyOn(bus, 'emit');
    const dispatch = vi.spyOn(document, 'dispatchEvent');
    expect(tool.rollDice(formula)).toBeNull();
    expect(inputs.onFormulaError).toHaveBeenCalledOnce();
    expect(inputs.random).not.toHaveBeenCalled();
    expect(inputs.rollId).not.toHaveBeenCalled();
    expect(inputs.roller).not.toHaveBeenCalled();
    expect(tool.getState().rollHistory).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('validates the completed default roll before rolling', () => {
    const { tool, inputs } = setup('101d6');
    expect(tool.rollDice('+3')).toBeNull();
    expect(inputs.random).not.toHaveBeenCalled();
    expect(inputs.onFormulaError).toHaveBeenCalledWith({ ok: false, code: 'dice' });
  });

  it.each([
    ['d20' + ' '.repeat(61), '+1', 'length'],
    [Array(10).fill('d6').join('+'), '+1', 'terms'],
  ])('rejects default-roll completion beyond the %s budget', (defaultRoll, bonus, code) => {
    const { tool, inputs } = setup(defaultRoll);
    expect(tool.rollDice(bonus)).toBeNull();
    expect(inputs.random).not.toHaveBeenCalled();
    expect(inputs.onFormulaError).toHaveBeenCalledWith({ ok: false, code });
  });

  it('preserves default rolls for the empty quick-roll input', () => {
    expect(setup('2d12').tool.rollDice('')).toMatchObject({ formula: '2d12', total: 14 });
  });

  it('keeps bare bonuses and critical rules', () => {
    expect(setup('2d12').tool.rollDice('-3')).toMatchObject({ formula: '2d12-3', total: 11 });
  });
});
