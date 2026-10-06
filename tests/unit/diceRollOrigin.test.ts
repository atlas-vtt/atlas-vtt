import { EventEmitter } from 'events';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiceTool } from '../../src/app/tools/DiceTool';
import { DEFAULT_DICE_RULES } from '../../src/app/gameSystems/diceRules';
import { captureRollContext, rollOrigin } from '../../src/app/tools/diceRollOrigins';
import { useDiceHistory } from '../../src/app/react/components/dice-log/useDiceHistory';
import { PlayerRollScene } from '../../src/app/services/PlayerRollScene';
import { rollForPlayers, type ShownRollToken } from '../../src/app/services/playerRollSource';
import type { DiceRollOrigin } from '../../src/app/types/diceRollOrigin';
import type { DiceRollResult } from '../../src/app/types/diceTypes';

const MAP_A = 'maps/a.atlasmap';
const SOURCE: NonNullable<DiceRollResult['source']> = { type: 'statblock', tokenId: 'wolf', tokenName: 'Wolf', abilityName: 'Bite' };
const ORIGIN: DiceRollOrigin = { viewId: 'view-1', mapPath: MAP_A, tokenId: 'wolf' };

function diceTool(): { tool: DiceTool; bus: EventEmitter } {
  const bus = new EventEmitter();
  const inputs = { random: () => 0.5, rollId: () => 'roll-1', roller: () => 'GM', onFormulaError: vi.fn() };
  return { tool: new DiceTool(bus, () => DEFAULT_DICE_RULES, inputs), bus };
}

describe('a roll origin on the dice tool', () => {
  it('travels with the event only, never with the result, the history or the dice log', () => {
    const { tool, bus } = diceTool();
    const listener = vi.fn();
    bus.on('dice-rolled', listener);
    const addDiceLogEntry = vi.fn();
    const log = { diceLog: [], addDiceLogEntry, clearDiceLog: vi.fn() };
    const getDiceTool = (): DiceTool => tool;
    renderHook(() => useDiceHistory(getDiceTool, log, bus));

    const result = tool.rollDice('1d20', SOURCE, ORIGIN)!;
    expect(listener).toHaveBeenCalledWith(result, ORIGIN);
    expect(result.source).toEqual(SOURCE);
    for (const kept of [result, tool.state.rollHistory[0], addDiceLogEntry.mock.calls[0]?.[0]]) {
      expect(kept).toBe(result);
      expect(JSON.stringify(kept)).not.toContain(MAP_A);
      expect(JSON.stringify(kept)).not.toContain('view-1');
    }
  });

  it('is absent from a roll made without one', () => {
    const { tool, bus } = diceTool();
    const listener = vi.fn();
    bus.on('dice-rolled', listener);
    const result = tool.rollDice('1d20', SOURCE);
    expect(listener).toHaveBeenCalledWith(result, undefined);
  });
});

describe('taking a roll context', () => {
  const loaded = { mapPath: MAP_A, mapLoaded: true, isMapLoading: false, objects: { tokens: { wolf: {}, bear: {} } } };

  it('takes the view, the scene and the tokens that stand in it, as a copy', () => {
    const ids = ['wolf', 'ghost', 'bear', 'wolf'];
    const context = captureRollContext('view-1', loaded, ids)!;
    expect(context).toEqual({ viewId: 'view-1', mapPath: MAP_A, tokenIds: ['wolf', 'bear'] });
    ids.splice(0, ids.length, 'ghost');
    expect(context.tokenIds).toEqual(['wolf', 'bear']);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.tokenIds)).toBe(true);
  });

  it.each([
    ['without a view', undefined, loaded],
    ['without a scene', 'view-1', { ...loaded, mapPath: null }],
    ['while a scene loads', 'view-1', { ...loaded, isMapLoading: true }],
    ['after a scene failed to load', 'view-1', { ...loaded, mapLoaded: false }],
    ['for tokens not in the scene', 'view-1', { ...loaded, objects: { tokens: {} } }],
  ])('takes none %s', (_, viewId, state) => {
    expect(captureRollContext(viewId, state, ['wolf'])).toBeUndefined();
  });

  it('gives an origin only for a token the context was taken for', () => {
    const context = captureRollContext('view-1', loaded, ['wolf'])!;
    expect(rollOrigin(context, 'wolf')).toEqual(ORIGIN);
    expect(rollOrigin(context, 'bear')).toBeUndefined();
    expect(rollOrigin(context, undefined)).toBeUndefined();
    expect(rollOrigin(undefined, 'wolf')).toBeUndefined();
  });
});

describe('an origin that does not match the presented scene', () => {
  const wolf: ShownRollToken = { name: 'Wolf', imagePath: undefined, showRing: true, ringColor: undefined };
  const scene = new PlayerRollScene();
  scene.present({ viewId: 'view-1', mapPath: MAP_A, shownTokens: (ids) => new Map(ids?.includes('wolf') !== false ? [['wolf', wolf]] : []) });
  const result: DiceRollResult = { id: 'r', timestamp: 0, formula: '1d20', rolls: [{ die: 'd20', value: 7, max: 20 }], modifiers: 0, total: 7, source: SOURCE };
  const view = { showNames: true, imageSrc: (): null => null };

  it.each([
    ['another view', { ...ORIGIN, viewId: 'view-2' }],
    ['another scene', { ...ORIGIN, mapPath: 'maps/b.atlasmap' }],
    ['another token than the roll names', { ...ORIGIN, tokenId: 'bear' }],
  ])('names nobody for %s', (_, origin) => {
    const prepared = rollForPlayers(result, origin, scene, view);
    expect(prepared.sourcePresentation).toBeNull();
    expect(prepared.result.source).toEqual({ type: 'statblock' });
  });

  it('names the token for the matching origin', () => {
    expect(rollForPlayers(result, ORIGIN, scene, view).sourcePresentation).toEqual({ name: 'Wolf', avatar: null });
  });
});
