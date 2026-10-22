// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/app/atlasViewType', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

import { attachDiceRolling } from '../../../../src/app/services/statblockDiceLinks';
import { ArmedBonuses } from '../../../../src/app/statblocks/rollBonuses/armedBonuses';
import { namedBareBonus } from '../../../../src/app/statblocks/rollBonuses/bonusFormula';
import { completeFormula } from '../../../../src/app/tools/completeFormula';
import { rollDiceFormula } from '../../../../src/app/tools/DiceTool';
import type { DiceRollResult } from '../../../../src/app/types/diceTypes';
import type { RollingDice } from '../../../../src/app/types/diceSetTypes';

const HOPE_FEAR: RollingDice = { dice: [{ count: 1, sides: 12, name: 'Hope' }, { count: 1, sides: 12, name: 'Fear' }], crit: 'none' };
const MIRA = 'note:Mira.md';

/** An app whose open map rolls by the Hope and Fear dice, keeping every roll it makes. */
function mapRolling(): { app: never; rolls: DiceRollResult[] } {
  const rolls: DiceRollResult[] = [];
  const tool = {
    rollDice: (formula: string): DiceRollResult | null => {
      const result = rollDiceFormula(formula, HOPE_FEAR, { random: () => 0.5, rollId: () => 'r', roller: () => 'GM', onFormulaError: () => undefined });
      if (result) rolls.push(result);
      return result;
    },
    rollingDice: (): RollingDice => HOPE_FEAR,
  };
  const leaf = { view: { serviceManager: { getToolController: () => ({ getDiceTool: () => tool }) } } };
  return { app: { workspace: { getLeavesOfType: () => [leaf] }, vault: { getFileByPath: () => null } } as never, rolls };
}

/** Clicks the first roll link of `html` on a card of Mira's, whose values `armable` add to rolls. */
function click(app: never, html: string, armable = new Map<string, { label: string; value: number }>()): void {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  const dispose = attachDiceRolling(el, app, () => ({ bonuses: { key: MIRA, armable } }));
  el.querySelector<HTMLElement>('.atlas-dice-link')!.click();
  dispose();
  el.remove();
}

const link = (formula: string): string => `<span class="atlas-dice-link" data-formula="${formula}">${formula}</span>`;

describe('a value that rolls its own bonus', () => {
  it('names it after its column in a table of traits, the set\'s dice left as they are', () => {
    const { app, rolls } = mapRolling();
    click(app, `<table><tbody><tr><td data-roll-name="Agility">${link('+4')}</td></tr></tbody></table>`);
    expect(rolls[0]).toMatchObject({ formula: '1d12+1d12+4[Agility]', modifiers: 4, namedModifiers: [{ label: 'Agility', value: 4 }] });
    expect(rolls[0]?.rolls.map((die) => die.name)).toEqual(['Hope', 'Fear']);
  });

  it('names it after the label of a single value', () => {
    const { app, rolls } = mapRolling();
    click(app, `<div class="atlas-sb-labelled"><span class="atlas-sb-label">Finesse:</span> ${link('-1')}</div>`);
    expect(rolls[0]).toMatchObject({ formula: '1d12+1d12-1[Finesse]', namedModifiers: [{ label: 'Finesse', value: -1 }] });
  });

  it('stays plain where nothing names the roll', () => {
    const { app, rolls } = mapRolling();
    click(app, `<div>${link('+4')}</div>`);
    expect(rolls[0]?.formula).toBe('1d12+1d12+4');
    expect(rolls[0]).not.toHaveProperty('namedModifiers');
  });

  it('is in the roll once where it is armed too, the other armed values after it', () => {
    const { app, rolls } = mapRolling();
    const store = ArmedBonuses.forApp(app);
    store.toggle(MIRA, 'agility');
    store.toggle(MIRA, 'proficiency');
    const armable = new Map([['agility', { label: 'Agility', value: 4 }], ['proficiency', { label: 'Proficiency', value: 2 }]]);
    click(app, `<div class="atlas-sb-labelled" data-bonus-id="agility"><span class="atlas-sb-label">Agility</span> ${link('+4')}</div>`, armable);
    expect(rolls[0]).toMatchObject({
      formula: '1d12+1d12+4[Agility]+2[Proficiency]',
      modifiers: 6,
      namedModifiers: [{ label: 'Agility', value: 4 }, { label: 'Proficiency', value: 2 }],
    });
    expect(store.armed(MIRA)).toEqual([]);
  });

  it('rolls plain, not refused, where the name would take the roll past a limit', () => {
    const { app, rolls } = mapRolling();
    const store = ArmedBonuses.forApp(app);
    const armable = new Map(Array.from({ length: 3 }, (_, i) => [`v${i}`, { label: 'L'.repeat(24), value: 1 }] as const));
    for (const id of armable.keys()) store.toggle(MIRA, id);
    // Three armed values write 84 characters: with `+4` they fit a formula's 100, with `+4[` and a name of 24 they do not.
    click(app, `<div class="atlas-sb-labelled"><span class="atlas-sb-label">${'A'.repeat(24)}</span> ${link('+4')}</div>`, armable);
    expect(rolls[0]?.formula).toBe(`1d12+1d12+4${`+1[${'L'.repeat(24)}]`.repeat(3)}`);
  });
});

describe('namedBareBonus', () => {
  it('names a whole number and nothing else', () => {
    expect(namedBareBonus('+4', 'Agility')).toBe('+4[Agility]');
    expect(namedBareBonus('-2', 'Str mod.')).toBe('-2[Str mod]');
    expect(namedBareBonus('3', 'Might')).toBe('+3[Might]');
    expect(namedBareBonus('1d20+4', 'Agility')).toBeNull();
    expect(namedBareBonus('+4[Agility]', 'Agility')).toBeNull();
    expect(namedBareBonus('+4', '…')).toBeNull();
    expect(namedBareBonus('+4', undefined)).toBeNull();
  });
});

describe('completing a named bonus', () => {
  it('rolls a bonus whose names fill a formula\'s length once the set\'s dice are put before it', () => {
    const bonus = `+4[${'A'.repeat(24)}]`.repeat(3) + '+1'.repeat(8);
    expect(bonus).toHaveLength(100);
    expect(completeFormula(bonus, HOPE_FEAR)).toMatchObject({ ok: true, formula: `1d12+1d12${bonus}` });
    expect(completeFormula(`${bonus}+1`, HOPE_FEAR)).toEqual({ ok: false, code: 'length' });
    expect(completeFormula(`1d20${bonus.slice(4)}+1`, HOPE_FEAR)).toEqual({ ok: false, code: 'length' });
  });
});
