import { describe, expect, it, vi } from 'vitest';


import { rollStatblockDice, type OffMapRolls } from '../../src/app/services/statblockRolls';
import type { DiceRollResult } from '../../src/app/tools/DiceTool';

const result = (formula: string): DiceRollResult => ({ id: formula, timestamp: 0, formula, rolls: [], modifiers: 0, total: 7 });

/** An open map view whose dice tool records rolls; `shown` is what its container's `isShown` says. */
function mapView(shown: boolean) {
  const rolls: Array<{ formula: string; source: unknown }> = [];
  const view = {
    containerEl: { isShown: () => shown },
    serviceManager: { getToolController: () => ({ getDiceTool: () => ({
      rollDice: (formula: string, source: unknown) => {
        rolls.push({ formula, source });
        return result(formula);
      },
    }) }) },
  };
  return { view, rolls };
}

const appWith = (...views: unknown[]) => ({
  workspace: { getLeavesOfType: () => views.map((view) => ({ view })) },
  vault: { getFileByPath: () => null },
}) as never;

function offMap(): OffMapRolls & { shown: Array<[string, boolean]>; rolled: string[] } {
  const shown: Array<[string, boolean]> = [];
  const rolled: string[] = [];
  return {
    shown,
    rolled,
    roll: (formula, source) => {
      rolled.push(formula);
      return { ...result(formula), source };
    },
    show: (roll, muted) => { shown.push([roll.formula, muted]); },
  };
}

describe('where a statblock\'s roll goes', () => {
  it('goes to the map on screen, which shows it: the note shows nothing', () => {
    const map = mapView(true);
    const note = offMap();
    rollStatblockDice(appWith(map.view), '1d20+9', { statblockPath: 'Aboleth.md', abilityName: 'Tentacle' }, note);
    expect(map.rolls).toEqual([{ formula: '1d20+9', source: { type: 'statblock', statblockPath: 'Aboleth.md', abilityName: 'Tentacle' } }]);
    expect(note.shown).toEqual([]);
  });

  it('prefers a map on screen to one in a tab behind', () => {
    const hidden = mapView(false);
    const shown = mapView(true);
    rollStatblockDice(appWith(hidden.view, shown.view), '1d4', {}, offMap());
    expect(hidden.rolls).toEqual([]);
    expect(shown.rolls).toHaveLength(1);
  });

  it('goes to a map behind another tab, which logs it, and shows on the note without its own sound', () => {
    const map = mapView(false);
    const note = offMap();
    rollStatblockDice(appWith(map.view), '18d10+36', {}, note);
    expect(map.rolls).toHaveLength(1);
    expect(note.rolled).toEqual([]);
    expect(note.shown).toEqual([['18d10+36', true]]);
  });

  it('shows a map\'s roll on a surface over that map, and not on one the map\'s own display stands above', () => {
    const map = mapView(true);
    const over = { ...offMap(), covers: (mapEl: HTMLElement) => mapEl === (map.view.containerEl as unknown) };
    rollStatblockDice(appWith(map.view), '1d6', {}, over);
    expect(over.shown).toEqual([['1d6', true]]);
    const inside = { ...offMap(), covers: () => false };
    rollStatblockDice(appWith(map.view), '1d6', {}, inside);
    expect(inside.shown).toEqual([]);
    expect(map.rolls).toHaveLength(2);
  });

  it('is rolled and shown by the note, with sound, while no map is open', () => {
    const note = offMap();
    const roll = rollStatblockDice(appWith(), '+6', { statblockPath: 'Aboleth.md' }, note);
    expect(note.rolled).toEqual(['+6']);
    expect(note.shown).toEqual([['+6', false]]);
    expect(roll?.source).toEqual({ type: 'statblock', statblockPath: 'Aboleth.md' });
  });

  it('is not rolled where no map is open and nothing shows rolls (a hover preview)', () => {
    expect(rollStatblockDice(appWith(), '1d6', {})).toBeNull();
  });
});
