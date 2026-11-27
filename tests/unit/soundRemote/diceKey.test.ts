// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { BUILT_IN_DICE_SETS, D20_DICE_SET_ID } from '@/app/gameSystems/builtInDiceSets';
import { DEFAULT_DICE_RULES } from '@/app/gameSystems/diceRules';
import { remoteTableOf } from '@/app/plugin/soundRemoteTable';
import type { HoveredElement } from '@/app/soundRemote/hoveredElement';
import { parseRemoteCommand } from '@/app/soundRemote/remoteProtocol';
import { diceKeyRolls, runTableCommand } from '@/app/soundRemote/remoteTable';
import { DiceTool } from '@/app/tools/DiceTool';
import type { FormulaError } from '@/app/tools/parseFormula';
import type { DiceRules } from '@/app/types/diceRulesTypes';
import type { RollingDice } from '@/app/types/diceSetTypes';
import type { DiceRollResult } from '@/app/types/diceTypes';
import { EventEmitter } from '@/app/utils/typedEmitter';

interface RigTool {
  tool: DiceTool;
  rolled: DiceRollResult[];
  /** What the dice tool shows the GM as a notice. */
  formulaErrors: FormulaError[];
}

function diceTool(rules: DiceRules | RollingDice = DEFAULT_DICE_RULES): RigTool {
  const bus = new EventEmitter();
  const rolled: DiceRollResult[] = [];
  const formulaErrors: FormulaError[] = [];
  bus.on('dice-rolled', (result: DiceRollResult) => void rolled.push(result));
  const tool = new DiceTool(bus, () => rules, { random: () => 0.5, rollId: () => 'roll', roller: () => 'GM', onFormulaError: (error) => void formulaErrors.push(error) });
  return { tool, rolled, formulaErrors };
}

/** The d20 that rules advantage and disadvantage (5e's), and dice that rule neither. */
const WITH_SIDES = BUILT_IN_DICE_SETS.find((set) => set.id === D20_DICE_SET_ID)!;
const RULE_SETS: Array<[string, DiceRules | RollingDice]> = [['dice with advantage', WITH_SIDES], ['dice without advantage', DEFAULT_DICE_RULES]];

const PRESSED = [
  '1d20', '1d20 adv', '2d8 adv', '1d6 dis', '100d20 adv', '99d20+1d20 adv', `1d20 adv${' '.repeat(190)}`, `1d20${'\t'.repeat(190)}adv`,
  `1d20 adv${' '.repeat(92)}`, '1d20 ADV', '4d6kh3 adv', '1d20+5[fire] adv', '(1d20)[<img src=x onerror=alert(1)>]', '1d20 adv adv', '0d6+1d4', '1d20 dis\t',
];

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

  describe.each(RULE_SETS)('by %s', (_name, rules) => {
    it.each(PRESSED)('rolls %j once where the dice tray would and the dice grammar holds it, and otherwise refuses it with no notice for the GM', (formula) => {
      const { tool, rolled, formulaErrors } = diceTool(rules);
      const command = parseRemoteCommand({ type: 'dice', formula });
      const answer = command && runTableCommand(table(tool), command);
      const trayRolls = tool.checkRoll(formula) === null && formula.length <= 100 && /\d*d\d/.test(formula);
      expect(answer).toBe(trayRolls ? null : 'bad-formula');
      expect(rolled).toHaveLength(trayRolls ? 1 : 0);
      expect(formulaErrors).toEqual([]);
    });
  });

  it('places a formula exactly where it presses it: one check for both, by the dice of the map in front', () => {
    for (const [, rules] of RULE_SETS) {
      const { tool } = diceTool(rules);
      for (const formula of PRESSED) {
        const command = parseRemoteCommand({ type: 'dice', formula });
        expect(diceKeyRolls(table(tool), formula), formula).toBe(command !== null && runTableCommand(table(diceTool(rules).tool), command) === null);
      }
    }
  });

  it('rolls a side written last where the dice rule it, as the tray does', () => {
    const { tool, rolled } = diceTool(WITH_SIDES);
    expect(runTableCommand(table(tool), { type: 'dice', formula: '1d20+5 adv' })).toBeNull();
    expect(rolled[0]?.advantage).toBe('advantage');
    expect(runTableCommand(table(diceTool().tool), { type: 'dice', formula: '1d20+5 adv' })).toBe('bad-formula');
  });

  it('without a map refuses only what no dice would roll, and finds no scene for the rest', () => {
    expect(runTableCommand(table(null), { type: 'dice', formula: '1d20 adv' })).toBe('no-scene');
    expect(diceKeyRolls(table(null), '1d20 adv')).toBe(true);
    expect(diceKeyRolls(table(null), `1d20 adv${' '.repeat(93)}`)).toBe(false);
  });

  it('reads no dice command without a formula, or with one longer than the wire carries', () => {
    for (const body of [{ type: 'dice' }, { type: 'dice', formula: '' }, { type: 'dice', formula: 20 }, { type: 'dice', formula: '1'.repeat(201) }]) {
      expect(parseRemoteCommand(body), JSON.stringify(body).slice(0, 40)).toBeNull();
    }
  });
});
