// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';


import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockEl, renderSheet, templateOf, valueOf } from './sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'saves', label: 'Saving Throws', type: 'pairs' },
  { key: 'languages', label: 'Languages', type: 'list' },
  { key: 'traits', label: 'Traits', type: 'list' },
  { key: 'spells', label: 'Spells', type: 'spells' },
  { key: 'image', label: 'Portrait', type: 'image' },
];

const BLOCKS: TemplateBlock[] = [
  { id: 'row00000', type: 'row', align: 'spread', blocks: [
    { id: 'title000', type: 'title', field: 'name', level: 1 },
    { id: 'image000', type: 'image', field: 'image', shape: 'token' },
  ] },
  { id: 'saves000', type: 'pairs', field: 'saves', display: 'signed' },
  { id: 'langs000', type: 'tags', field: 'languages', look: 'comma' },
  { id: 'traits00', type: 'tags', field: 'traits', look: 'chips' },
  { id: 'spells00', type: 'spells', field: 'spells' },
];

const TEMPLATE = templateOf(FIELDS, BLOCKS);

describe('StatblockSheet: lists and rows', () => {
  it('writes pairs from a record, signed', () => {
    const { container } = renderSheet(TEMPLATE, { saves: { dex: 5, con: 3 } });
    expect(valueOf(container, 'saves000')).toBe('Dex +5, Con +3');
    expect(blockEl(container, 'saves000')!.querySelector('.atlas-sb-label')?.textContent).toBe('Saving Throws');
  });

  it('runs a list in after its label, whether the note holds a list or a line of text', () => {
    const list = renderSheet(TEMPLATE, { languages: ['Common', 'Elvish'] });
    expect(valueOf(list.container, 'langs000')).toBe('Common, Elvish');
    list.unmount();

    const line = renderSheet(TEMPLATE, { languages: 'Common, Elvish (reads only)' });
    expect(valueOf(line.container, 'langs000')).toBe('Common, Elvish (reads only)');
  });

  it('shows chips without a label unless the template names one', () => {
    const { container } = renderSheet(TEMPLATE, { traits: 'Undead, Swarm' });
    const tags = blockEl(container, 'traits00')!;
    expect([...tags.querySelectorAll('.atlas-sb-chip')].map((chip) => chip.textContent)).toEqual(['Undead', 'Swarm']);
    expect(tags.querySelector('.atlas-sb-label')).toBeNull();
  });

  it('writes words one per line, bulleted or numbered, labelled only where the template names a label', () => {
    for (const look of ['bullets', 'numbered'] as const) {
      const blocks: TemplateBlock[] = [{ id: 'traits00', type: 'tags', field: 'traits', look }];
      const { container, unmount } = renderSheet(templateOf(FIELDS, blocks), { traits: ['Undead', 'Swarm'] });
      const tags = blockEl(container, 'traits00')!;
      const list = tags.querySelector(look === 'bullets' ? 'ul.atlas-sb-word-list--bullets' : 'ol.atlas-sb-word-list--numbered');
      expect([...(list?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual(['Undead', 'Swarm']);
      expect(tags.querySelector('.atlas-sb-label')).toBeNull();
      expect(tags.dataset.look).toBe(look);
      unmount();
    }
  });

  it('reads spells written as a record of levels', () => {
    const { container } = renderSheet(TEMPLATE, { name: 'Hag', spells: { 'At will': 'mage hand', '1/day': 'curse' } });
    const items = [...blockEl(container, 'spells00')!.querySelectorAll('li')].map((item) => item.textContent);
    expect(items).toEqual(['At will: mage hand', '1/day: curse']);
    expect(blockEl(container, 'spells00')!.textContent).toContain('Hag knows the following spells:');
  });

  it('sizes the children of a row by their type unless they say otherwise', () => {
    const { container } = renderSheet(TEMPLATE, { name: 'Hag', image: 'art/hag.png' });
    expect(blockEl(container, 'row00000')!.querySelector('.atlas-sb-row')?.getAttribute('data-align')).toBe('spread');
    expect(blockEl(container, 'title000')!.classList.contains('atlas-sb-item--fill')).toBe(true);
    expect(blockEl(container, 'image000')!.classList.contains('atlas-sb-item--fit')).toBe(true);
    expect(blockEl(container, 'image000')!.dataset.look).toBe('token');
  });

  it('flows the top-level blocks into the template’s columns', () => {
    const { container } = renderSheet({ ...TEMPLATE, layout: { ...TEMPLATE.layout, maxColumns: 3, columnWidth: 18 } }, { name: 'Hag' });
    const columns = container.querySelector<HTMLElement>('.atlas-sb-columns')!;
    expect(columns.style.getPropertyValue('--atlas-sb-column-width')).toBe('18em');
    expect(columns.style.getPropertyValue('--atlas-sb-max-columns')).toBe('3');
  });
});
