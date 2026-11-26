// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { DEFAULT_DICE_RULES } from '@/app/gameSystems/diceRules';
import { remoteTableOf } from '@/app/plugin/soundRemoteTable';
import type { HoveredElement } from '@/app/soundRemote/hoveredElement';
import { parseRemoteCommand } from '@/app/soundRemote/remoteProtocol';
import { runTableCommand } from '@/app/soundRemote/remoteTable';
import { DiceTool } from '@/app/tools/DiceTool';
import type { DiceRollResult } from '@/app/types/diceTypes';
import { EventEmitter } from '@/app/utils/typedEmitter';

function diceTool(): { tool: DiceTool; rolled: DiceRollResult[] } {
  const bus = new EventEmitter();
  const rolled: DiceRollResult[] = [];
  bus.on('dice-rolled', (result: DiceRollResult) => void rolled.push(result));
  const tool = new DiceTool(bus, () => DEFAULT_DICE_RULES, { random: () => 0.5, rollId: () => 'roll', roller: () => 'GM', onFormulaError: vi.fn() });
  return { tool, rolled };
}

/** An Atlas map view in front, with a loaded scene and its own dice tool: what the remote's map reads and rolls with. */
function workspaceWith(tool: DiceTool | null): App['workspace'] {
  const state = { mapPath: 'Maps/Cave.atlasmap', mapLoaded: true, isMapLoading: false };
  const view = tool && {
    getViewType: () => 'atlas-vtt',
    atlasStore: {},
    getStore: () => ({ getState: () => state }),
    tabMetaStore: { getState: () => ({ activeTabId: null }) },
    serviceManager: { getToolController: () => ({ getDiceTool: () => tool }) },
  };
  return { getActiveViewOfType: () => view, getLeavesOfType: () => [] } as unknown as App['workspace'];
}

const table = (tool: DiceTool | null) => remoteTableOf({ workspace: workspaceWith(tool) } as App, { element: () => null } as unknown as HoveredElement);
/** A result as it shows, without what each roll makes anew. */
const shown = ({ timestamp: _at, ...result }: DiceRollResult): Omit<DiceRollResult, 'timestamp'> => result;

describe('the dice key of a remote', () => {
  it('rolls a formula on the map in front as the dice tray rolls it: the same result, in the history and to everyone who listens', () => {
    const tray = diceTool();
    tray.tool.rollDice('2d6+3');
    const remote = diceTool();
    const command = parseRemoteCommand({ type: 'dice', formula: '2d6+3' });
    expect(command).toEqual({ type: 'dice', formula: '2d6+3' });
    expect(command && runTableCommand(table(remote.tool), command)).toBeNull();
    expect(remote.rolled.map(shown)).toEqual(tray.rolled.map(shown));
    expect(remote.tool.state.rollHistory.map(shown)).toEqual(tray.tool.state.rollHistory.map(shown));
    expect(remote.rolled[0]?.total).toBe(11);
  });

  it('is refused, rolling nothing, for a formula the dice tool would not roll, map or not, and like a saved roll without a map', () => {
    const { tool, rolled } = diceTool();
    for (const formula of ['101d6', '1d6'.repeat(40), '+3', 'fireball', '1d0']) {
      const command = parseRemoteCommand({ type: 'dice', formula });
      expect(command && runTableCommand(table(tool), command), formula).toBe('bad-formula');
      expect(command && runTableCommand(table(null), command), formula).toBe('bad-formula');
    }
    expect(runTableCommand(table(null), { type: 'dice', formula: '1d20' })).toBe('no-scene');
    expect(runTableCommand(table(null), { type: 'roll', id: 'attack' })).toBe('no-scene');
    expect(rolled).toEqual([]);
    expect(tool.state.rollHistory).toEqual([]);
  });

  it('reads no dice command without a formula, or with one longer than the wire carries', () => {
    for (const body of [{ type: 'dice' }, { type: 'dice', formula: '' }, { type: 'dice', formula: 20 }, { type: 'dice', formula: '1'.repeat(201) }]) {
      expect(parseRemoteCommand(body), JSON.stringify(body).slice(0, 40)).toBeNull();
    }
  });
});
