// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { resolvedOf } from '../../online/gm/statblockSheet/sheetKit';
import { statblockTexts } from '../../online/gm/statblockSheet/sheetKit';
import { blockEl, renderSheet, templateOf } from './sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX'] },
  { key: 'ac', label: 'AC', type: 'number' },
  { key: 'attack', label: 'Attack', type: 'text' },
  { key: 'secret', label: 'Secret', type: 'number' },
];
const TEMPLATE: StatblockTemplate = {
  ...templateOf(FIELDS, [
    { id: 'stats001', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)', display: 'signed' }] },
    { id: 'statac01', type: 'stat', field: 'ac', look: 'run-in' },
    { id: 'attack01', type: 'text', field: 'attack' },
  ]),
  players: { secret: 'hidden' },
};
const NOTE = { name: 'Mira', stats: [16, 14], ac: '10 + @dex.mod', attack: 'Hit: 1d8 + @str.mod slashing, plus @secret cold.', secret: 4 };

describe('StatblockSheet: references', () => {
  it('shows the numbers they name, rolls them, and totals a Number field', () => {
    const { container } = renderSheet(TEMPLATE, NOTE);
    expect(blockEl(container, 'statac01')?.textContent).toContain('12');
    const attack = blockEl(container, 'attack01')!;
    expect(attack.textContent).toContain('Hit: 1d8 + 3 slashing, plus 4 cold.');
    expect([...attack.querySelectorAll<HTMLElement>('[data-formula]')].map((link) => link.dataset.formula)).toEqual(['1d8+3']);
  });

  it('flags one that names nothing and rolls nothing it is added to', () => {
    const { container } = renderSheet(TEMPLATE, { ...NOTE, attack: 'Hit: 1d8 + @luck' }, { mode: 'editing' });
    const attack = blockEl(container, 'attack01')!;
    expect(attack.textContent).toContain('1d8 + @luck');
    expect(attack.querySelector('[data-formula]')).toBeNull();
    expect(attack.querySelector('.atlas-sb-misfit')?.textContent).toBe('Unknown reference');
  });

  it('never fills in for a player a number they may not see', () => {
    const statblock = statblockSheet({ resolved: resolvedOf(TEMPLATE, NOTE), definitions: [], resources: undefined })!;
    const texts = statblockTexts(statblock).join('\n');
    expect(texts).toContain('Hit: 1d8 + 3 slashing, plus @secret cold.');
    expect(texts).not.toContain('plus 4 cold');
  });
});

describe('StatblockSheet: dice with references', () => {
  const fields: TemplateField[] = [...FIELDS, { key: 'dmg', label: 'Damage', type: 'dice' }];
  const template: StatblockTemplate = { ...TEMPLATE, fields, layout: { ...TEMPLATE.layout, blocks: [...TEMPLATE.layout.blocks, { id: 'dmg00001', type: 'stat', field: 'dmg', look: 'run-in' }] } };
  const misfit = (dmg: string): string | null => {
    const { container } = renderSheet(template, { ...NOTE, dmg }, { mode: 'editing' });
    return blockEl(container, 'dmg00001')?.querySelector('.atlas-sb-misfit')?.textContent ?? null;
  };

  it('fit a Dice field where every reference names a number, as a roll or a bonus', () => {
    for (const dmg of ['1d8+@str', '2d8 + @str.mod', '+4+@dex.mod']) expect(misfit(dmg), dmg).toBeNull();
  });

  it('are flagged where a reference names nothing', () => {
    expect(misfit('1d8+@nope')).toBe('Unknown reference');
  });
});
