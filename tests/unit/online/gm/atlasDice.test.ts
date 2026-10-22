import { EventEmitter } from 'node:events';
import type { WorkspaceLeaf } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { diceSourceOf } from '../../../../src/app/online/gm/atlasDice.ts';
import { setStatblockGate } from '../../../../src/app/online/gm/book/statblockGate.ts';
import { token } from './shareHarness.ts';

afterEach(() => { setStatblockGate(null); vi.clearAllMocks(); });

describe('character dice in the map adapter', () => {
  it('reads the current linked sheet before the library sheet and forwards roll options to the tool', () => {
    const bus = new EventEmitter();
    const tool = { rollDice: vi.fn(() => null), getDiceRules: () => ({ defaultRoll: '1d20', crit: 'natural' }) };
    const leaf = { view: { viewId: 'map', serviceManager: { getToolController: () => ({ getDiceTool: () => tool }), getEventBus: () => bus } } } as unknown as WorkspaceLeaf;
    const diceSet = vi.fn();
    const library = vi.fn(() => 'Sheets/Library.md');
    setStatblockGate({ libraryStatblock: library, diceSet, read: async () => null, write: async () => ({ applied: [], conflicts: [], problem: null }), onChange: () => () => undefined });
    const dice = diceSourceOf(leaf);
    const own = { ...token('hero'), kind: 'character' as const, statblockPath: 'Sheets/Hero.md' };
    dice?.setFor?.(own);
    expect(diceSet).toHaveBeenLastCalledWith('Sheets/Hero.md');
    expect(library).not.toHaveBeenCalled();
    dice?.setFor?.(token('from-library'));
    expect(diceSet).toHaveBeenLastCalledWith('Sheets/Library.md');
    const set = { id: 'my-dice', name: 'My dice', builtIn: false, crit: 'natural' as const, dice: [{ count: 2, sides: 12 }] };
    diceSet.mockReturnValue(set);
    expect(dice?.setFor?.(own)).toBe(set);
    dice?.rollDice('+2', undefined, undefined, { set });
    expect(tool.rollDice).toHaveBeenLastCalledWith('+2', undefined, undefined, { set });
  });
});
