// @vitest-environment jsdom
import type { App, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlasViewType', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

import { noteDiceProcessor, type NoteDice } from '../../src/app/noteDice/registerNoteDiceRolling';
import { attachDiceRolling, type RollChoice } from '../../src/app/services/statblockDiceLinks';
import type { OffMapRolls } from '../../src/app/services/statblockRolls';
import { rollDiceFormula } from '../../src/app/tools/DiceTool';
import { DEFAULT_DICE_RULES } from '../../src/app/gameSystems/diceRules';
import { BUILT_IN_DICE_SETS } from '../../src/app/gameSystems/builtInDiceSets';
import type { DiceRollResult } from '../../src/app/types/diceTypes';

const d20 = BUILT_IN_DICE_SETS.find((set) => set.id === 'builtin:d20')!;

/** An app with one open map, on screen in `doc`, whose dice tool records every roll with its arguments; none without a map. */
function appWith(map: { doc: Document; shown: boolean } | null): { app: App; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const diceTool = {
    rollDice: (...args: unknown[]): DiceRollResult => { calls.push(args); return { formula: args[0] } as DiceRollResult; },
    rollingDice: () => d20,
  };
  const leaves = map ? [{
    view: {
      containerEl: Object.assign(map.doc.createElement('div'), { isShown: () => map.shown }),
      serviceManager: { getToolController: () => ({ getDiceTool: () => diceTool }) },
    },
  }] : [];
  return { app: { workspace: { getLeavesOfType: () => leaves }, vault: { getFileByPath: () => null } } as unknown as App, calls };
}

/** What a note's rolls show off the map, recording what it shows. */
function offMapIn(doc: Document, roll: OffMapRolls['roll'] = () => null): OffMapRolls & { shown: Array<[DiceRollResult, boolean]> } {
  const shown: Array<[DiceRollResult, boolean]> = [];
  return { roll, rollingDice: () => d20, show: (result, muted) => shown.push([result, muted]), document: doc, shown };
}

const children: MarkdownRenderChild[] = [];

/** Renders `html` as a note section through the processor. */
function note(html: string, dice: NoteDice, within?: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  (within ?? document.body).append(el);
  const ctx = { addChild: (child: MarkdownRenderChild) => { children.push(child); child.onload(); } } as unknown as MarkdownPostProcessorContext;
  noteDiceProcessor(dice)(el, ctx);
  return el;
}

const menus = (): NoteDice['menus'] => ({ open: vi.fn(), closeWithin: vi.fn() });

afterEach(() => {
  for (const child of children.splice(0)) child.unload();
  document.body.replaceChildren();
});

describe('rolling the dice in a note', () => {
  it('rolls into the map on screen, Shift with advantage and Alt with disadvantage, and stops with its section', () => {
    const { app, calls } = appWith({ doc: document, shown: true });
    const offMap = offMapIn(document);
    const el = note('<p>Attack 1d20+2 and +3</p>', { app, displays: { rollsIn: () => offMap }, menus: menus() });
    const [attack, bonus] = el.querySelectorAll<HTMLElement>('.atlas-dice-link');
    attack!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    attack!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', altKey: true }));
    bonus!.click();
    expect(calls.map(([formula, , , options]) => [formula, options])).toEqual([
      ['1d20+2', { advantage: 'advantage' }],
      ['1d20+2', { advantage: 'disadvantage' }],
      ['+3', undefined],
    ]);
    // Seen on the map, so shown nowhere else.
    expect(offMap.shown).toEqual([]);
    children.splice(0).forEach((child) => child.unload());
    attack!.click();
    expect(calls).toHaveLength(3);
  });

  it('names the roll by the bold label it stands under', () => {
    const { app, calls } = appWith({ doc: document, shown: true });
    const el = note('<p><strong>Longsword.</strong> Hit: 1d8+3 slashing</p>', { app, displays: { rollsIn: () => offMapIn(document) }, menus: menus() });
    el.querySelector<HTMLElement>('.atlas-dice-link')!.click();
    expect(calls[0]?.[1]).toEqual({ type: 'statblock', abilityName: 'Longsword' });
  });

  it('shows a roll where the map on screen is in another window, muted, as for a map in another tab', () => {
    const other = document.implementation.createHTMLDocument();
    const offMap = offMapIn(document);
    for (const map of [{ doc: other, shown: true }, { doc: document, shown: false }]) {
      const { app } = appWith(map);
      note('<p>2d6</p>', { app, displays: { rollsIn: () => offMap }, menus: menus() }).querySelector<HTMLElement>('.atlas-dice-link')!.click();
    }
    expect(offMap.shown.map(([result, muted]) => [result.formula, muted])).toEqual([['2d6', true], ['2d6', true]]);
  });

  it('rolls the whole formula with the note\'s own dice and shows it with sound while no map is open', () => {
    const faces = [3, 1, 6, 4];
    const inputs = { random: (): number => (faces.shift()! - 0.5) / 6, rollId: () => 'roll', roller: () => 'GM', onFormulaError: vi.fn() };
    const offMap = offMapIn(document, (formula, source) => {
      const result = rollDiceFormula(formula, DEFAULT_DICE_RULES, inputs);
      return result && { ...result, source };
    });
    const { app } = appWith(null);
    note('<code>dice: 4d6kh3</code>', { app, displays: { rollsIn: () => offMap }, menus: menus() })
      .querySelector<HTMLElement>('.atlas-dice-link')!.click();
    expect(offMap.shown).toHaveLength(1);
    expect(offMap.shown[0]).toMatchObject([{
      formula: '4d6kh3', total: 13,
      rolls: [{ value: 3 }, { value: 1, dropped: true }, { value: 6 }, { value: 4 }],
    }, false]);
    expect(inputs.onFormulaError).not.toHaveBeenCalled();
  });

  it('opens the roll menu with the sides the dice have a rule for, and closes it with its section', () => {
    const { app, calls } = appWith({ doc: document, shown: true });
    const menu = menus();
    const el = note('<p>Check +3 and damage 2d6</p>', { app, displays: { rollsIn: () => offMapIn(document) }, menus: menu });
    const [bonus, damage] = el.querySelectorAll<HTMLElement>('.atlas-dice-link');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 123, clientY: 45 });
    bonus!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(menu.open).toHaveBeenCalledWith(expect.any(Array), { x: 123, y: 45 }, bonus);
    const choices = vi.mocked(menu.open).mock.calls[0]![0] as RollChoice[];
    expect(choices.map((choice) => choice.label)).toEqual(['Roll', 'Roll with advantage', 'Roll with disadvantage']);
    choices[1]!.roll();
    expect(calls.at(-1)?.[3]).toEqual({ advantage: 'advantage' });
    damage!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    expect(vi.mocked(menu.open).mock.calls[1]![0]).toHaveLength(1);
    children.splice(0).forEach((child) => child.unload());
    expect(menu.closeWithin).toHaveBeenCalledWith(el);
  });

  it('leaves a link inside a statblock to the statblock, which rolls it as its own', () => {
    const { app, calls } = appWith({ doc: document, shown: true });
    const statblock = document.body.createDiv({ cls: 'atlas-statblock' });
    const markdown = statblock.createSpan({ cls: 'atlas-sb-markdown' });
    const stop = attachDiceRolling(statblock, app, () => ({ tokenName: 'Wolf' }));
    // A section rendered inside the statblock: the note links nothing there, and its links are the statblock's.
    const section = note('<span class="atlas-dice-link" data-formula="2d4+2">2d4+2</span> 1d6', { app, displays: { rollsIn: () => offMapIn(document) }, menus: menus() }, markdown);
    expect(section.querySelectorAll('.atlas-dice-link')).toHaveLength(1);
    section.querySelector<HTMLElement>('.atlas-dice-link')!.click();
    expect(calls.map(([formula, source]) => [formula, source])).toEqual([['2d4+2', { type: 'statblock', tokenName: 'Wolf' }]]);
    stop();
  });
});
