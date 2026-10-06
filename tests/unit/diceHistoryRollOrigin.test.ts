import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DICE_RULES } from '../../src/app/gameSystems/diceRules';
import { DiceTool } from '../../src/app/tools/DiceTool';
import { useDiceHistory } from '../../src/app/react/components/dice-log/useDiceHistory';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import { MAP_B, SCENE_B_TOKENS, WOLF_BITE, lastCard, sceneState, setupPlayerDice } from '../helpers/playerDiceRolls';

// jsdom has no WebGL: the player window shows result cards.
vi.mock('../../src/app/dice3d/stagePool', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/dice3d/stagePool')>(),
  canShowDice: (): boolean => true,
}));

afterEach(() => vi.restoreAllMocks());

describe('repeating a roll from the dice log', () => {
  it('names nobody in the player window, even beside a shown token with the same id, and keeps the GM log whole', () => {
    // The log holds a roll made on scene A; the view now shows B, whose token reuses the id.
    const player = setupPlayerDice();
    act(() => player.store.setState(sceneState(MAP_B, SCENE_B_TOKENS)));
    act(() => player.service.presentCanvas(player.sourceFor(), 'scene-b'));
    const tool = new DiceTool(player.bus, () => DEFAULT_DICE_RULES, { random: () => 0.5, rollId: () => 'repeat', roller: () => 'GM', onFormulaError: vi.fn() });
    const emitted = vi.fn();
    player.bus.on('dice-rolled', emitted);
    const saved: DiceRollResult = { id: 'saved', timestamp: 0, formula: '1d20+4', rolls: [{ die: 'd20', value: 3, max: 20 }], modifiers: 4, total: 7, source: WOLF_BITE };
    const addDiceLogEntry = vi.fn();
    const log = { diceLog: [saved], addDiceLogEntry, clearDiceLog: vi.fn() };
    const getDiceTool = (): DiceTool => tool;
    const { result } = renderHook(() => useDiceHistory(getDiceTool, log, player.bus));

    act(() => result.current.repeatRoll(saved.formula, saved.source));

    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({ source: WOLF_BITE }), undefined);
    expect(addDiceLogEntry).toHaveBeenCalledWith(expect.objectContaining({ source: WOLF_BITE, total: 15 }));
    expect(result.current.history[0]?.source).toEqual(WOLF_BITE);
    const card = lastCard(player.doc);
    expect(card?.textContent).toContain('15');
    expect(card?.textContent).not.toMatch(/Wolf|Bone Hound|Bite/);
    expect(card?.querySelector('img')).toBeNull();
    act(() => player.service.destroy());
  });
});
