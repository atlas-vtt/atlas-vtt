import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiceTool } from '../../src/app/tools/DiceTool';
import { offlineDiceInputs } from '../../src/app/services/offlineDiceInputs';
import { DEFAULT_DICE_RULES } from '../../src/app/gameSystems/diceRules';
import { t } from '../../src/app/i18n';
import { Notice } from 'obsidian';

vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  return { ...actual, Notice: vi.fn() };
});
afterEach(() => vi.restoreAllMocks());

describe('offline dice inputs', () => {
  it('keeps offline random call order, id format and translated player label', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.25);
    vi.spyOn(Date, 'now').mockReturnValue(123);
    const tool = new DiceTool(new EventEmitter(), () => DEFAULT_DICE_RULES, offlineDiceInputs());
    expect(tool.rollDice('d6')).toMatchObject({ id: `roll_123_${(0.25).toString(36).slice(2, 11)}`, total: 4, timestamp: 123, player: t('dice.player') });
    expect(random).toHaveBeenCalledTimes(2);
  });
  it.each(['syntax', 'length', 'terms', 'dice', 'faces'] as const)('shows a readable notice for %s', (code) => {
    offlineDiceInputs().onFormulaError({ ok: false, code });
    expect(Notice).toHaveBeenCalledWith(t(`dice.formulaError.${code}`));
  });
});
