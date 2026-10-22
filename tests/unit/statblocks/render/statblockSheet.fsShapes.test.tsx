// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';


import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockEl, blockText, renderSheet, templateOf, valueOf } from './sheetTestKit';

/** Values as Fantasy Statblocks notes write them, on the blocks an import makes of its layouts. */
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'speed', label: 'Speed', type: 'number', unit: 'ft.' },
  { key: 'senses', label: 'Senses', type: 'choice', options: ['darkvision', 'blindsight'], several: true, numbered: true, unit: 'ft.' },
  { key: 'size', label: 'Size', type: 'text' },
  { key: 'saves', label: 'Saving Throws', type: 'pairs' },
  { key: 'actions', label: 'Actions', type: 'entries' },
  { key: 'ac', label: 'Armor Class', type: 'number' },
];

const BLOCKS: TemplateBlock[] = [
  { id: 'speed000', type: 'stat', field: 'speed', look: 'run-in' },
  { id: 'senses00', type: 'stat', field: 'senses', look: 'run-in' },
  { id: 'line0000', type: 'line', fields: ['size', 'speed'], separator: ', ' },
  { id: 'saves000', type: 'pairs', field: 'saves', display: 'signed' },
  { id: 'actions0', type: 'entries', field: 'actions', heading: 'Actions' },
  { id: 'ac000000', type: 'stat', field: 'ac', look: 'run-in' },
  {
    id: 'script01', type: 'script', summary: 'JavaScript reading ac, pd and md',
    fs: { type: 'javascript', code: 'const el = createDiv(); el.setText(`${monster.ac} ${monster.pd} ${monster["md"]} ${monster.statblock}`); return el;' },
  },
  { id: 'script02', type: 'script', summary: 'One of 2 parts, chosen by JavaScript', fs: {
    type: 'ifelse',
    conditions: [{ condition: 'return monster.mook', nested: [{ type: 'group', nested: [{ type: 'property', properties: ['mook_note', 'pd'] }] }] }],
  } },
];

const TEMPLATE = templateOf(FIELDS, BLOCKS);

/** A block's labelled lines as label and value. */
function lines(container: HTMLElement, id: string): string[][] {
  return [...blockEl(container, id)!.querySelectorAll('.atlas-sb-labelled')].map((line) => [
    line.querySelector('.atlas-sb-label')?.textContent ?? '',
    line.querySelector('.atlas-sb-value')?.textContent?.trim() ?? '',
  ]);
}

describe('StatblockSheet: values written as Fantasy Statblocks writes them', () => {
  it('writes a number field\'s unit, on a Stat and in a Line, and a numbered choice\'s units once', () => {
    const { container } = renderSheet(TEMPLATE, { speed: 30, size: 'Medium', senses: 'darkvision 60 ft., blindsight 10 ft.' });
    expect(valueOf(container, 'speed000')).toBe('30 ft.');
    expect(blockText(container, 'line0000')).toBe('Medium, 30 ft.');
    expect(valueOf(container, 'senses00')).toBe('darkvision 60 ft., blindsight 10 ft.');
  });

  it('reads a save with a description as one pair, and leaves out a name starting with an underscore', () => {
    const { container } = renderSheet(TEMPLATE, { saves: [{ name: 'Dex', desc: '+5' }, { name: '_hidden', desc: 'advantage vs. fear' }, { con: 3 }] });
    expect(valueOf(container, 'saves000')).toBe('Dex +5, advantage vs. fear, Con +3');
  });

  it('reads an action written as a list as its name and its text', () => {
    const { container } = renderSheet(TEMPLATE, { actions: [['Bite', 'Melee ', '1d6 piercing.'], { name: 'Claw', desc: 'It claws.' }] });
    const entries = blockEl(container, 'actions0')!;
    expect(entries.textContent).toContain('Bite');
    expect(entries.textContent).toContain('Melee 1d6 piercing.');
    expect(entries.textContent).not.toContain('Bite, Melee');
  });
});

describe('StatblockSheet: script blocks', () => {
  it('show the values their code and nested blocks read that no other part of the card shows, each once', () => {
    const { container } = renderSheet(TEMPLATE, { ac: 15, pd: 12, md: 11, mook_note: 'Kill one for every 6 damage.' });
    // `ac` has a block of its own and `statblock` is no value of the creature: neither shows again.
    expect(lines(container, 'script01')).toEqual([['Pd', '12'], ['Md', '11']]);
    // `pd` shows with the first script that reads it.
    expect(lines(container, 'script02')).toEqual([['Mook note', 'Kill one for every 6 damage.']]);
    expect(container.textContent).not.toContain('createDiv');
  });

  it('show nothing on a card where none of their values is set, and say where they are drawn while edited', () => {
    const view = renderSheet(TEMPLATE, { ac: 15 });
    expect(blockEl(view.container, 'script01')).toBeNull();
    view.unmount();
    const editing = renderSheet(TEMPLATE, { ac: 15 }, { mode: 'editing' });
    expect(blockText(editing.container, 'script01')).toBe('Shown by Fantasy Statblocks');
  });

  it('show a value in the block its field\'s type has, its unit and pairs included', () => {
    const template = templateOf(FIELDS, [{ id: 'script03', type: 'script', summary: 'JavaScript reading speed and saves', fs: {
      type: 'javascript', code: 'return createDiv({ text: monster.speed + " " + JSON.stringify(monster.saves) });',
    } }]);
    const { container } = renderSheet(template, { speed: 30, saves: [{ name: 'Dex', desc: '+5' }] });
    expect(lines(container, 'script03')).toEqual([['Speed', '30 ft.'], ['Saving Throws', 'Dex +5']]);
  });

  it('show a value another block shows only where that block does not show for this statblock', () => {
    const template = templateOf([...FIELDS, { key: 'mook', label: 'Mook', type: 'text' }, { key: 'wounds', label: 'Wounds', type: 'number' }], [
      { id: 'mookline', type: 'stat', field: 'mook', look: 'run-in', pattern: 'Kill one for every {wounds} wounds', showWhen: { field: 'mook', is: 'present' } },
      { id: 'script04', type: 'script', summary: 'JavaScript reading wounds', fs: { type: 'javascript', code: 'return monster.wounds;' } },
    ]);
    const grunt = renderSheet(template, { wounds: 22 });
    expect(lines(grunt.container, 'script04')).toEqual([['Wounds', '22']]);
    grunt.unmount();
    const mook = renderSheet(template, { wounds: 6, mook: 'yes' });
    expect(blockEl(mook.container, 'script04')).toBeNull();
    expect(valueOf(mook.container, 'mookline')).toBe('Kill one for every 6 wounds');
  });
});
