import { describe, expect, it } from 'vitest';
import { commitLabel } from '../../../../src/app/statblocks/editor/template-editor/labelCommit';
import { labelTargetOf } from '../../../../src/app/statblocks/editor/template-editor/labelTargets';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { StatblockTemplate, TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { sampleTemplate, template } from './editorKit';

function blockOf(source: StatblockTemplate, id: string): TemplateBlock {
  const found = findBlock(source.layout.blocks, id);
  if (!found) throw new Error(`no block ${id}`);
  return found.block;
}

/** The sample with a section headed Defenses, as the grid shows a compound tile. */
const withSection = (): StatblockTemplate => {
  const sample = sampleTemplate();
  const section: TemplateBlock = { id: 'section1', type: 'section', heading: 'Defenses', blocks: [{ id: 'divider2', type: 'divider' }] };
  return { ...sample, layout: { ...sample.layout, blocks: [...sample.layout.blocks, section] } };
};

const unbound = (): StatblockTemplate => template(
  [{ id: 'newstat1', type: 'stat', field: '', look: 'run-in' }, { id: 'newline1', type: 'line', fields: [] }, { id: 'newent01', type: 'entries', field: '' }],
  [{ key: 'name', label: 'Name', type: 'text' }],
);

describe('labelTargetOf', () => {
  it('offers the label of labelled blocks, headings, and a new field for unbound blocks', () => {
    const source = withSection();
    expect(labelTargetOf(blockOf(source, 'stat-ac1'), source.fields)).toEqual({ kind: 'label', text: 'Armor class' });
    expect(labelTargetOf(blockOf(source, 'section1'), source.fields)).toEqual({ kind: 'heading', text: 'Defenses' });
    expect(labelTargetOf(blockOf(source, 'row00001'), source.fields)).toBeNull();
    expect(labelTargetOf(blockOf(source, 'title001'), source.fields)).toBeNull();
    expect(labelTargetOf(blockOf(unbound(), 'newstat1'), [])).toEqual({ kind: 'new-field', text: 'Value' });
  });
});

describe('commitLabel', () => {
  it('gives an unbound block a new field whose key comes from the label ("Armor Class" → ac)', () => {
    const result = commitLabel(unbound(), 'newstat1', 'Armor Class');
    expect(result.bound).toEqual({ key: 'ac', created: true, fromCollection: false });
    expect(result.template.fields.at(-1)).toEqual({ key: 'ac', label: 'Armor Class', type: 'text' });
    expect(blockOf(result.template, 'newstat1')).toMatchObject({ field: 'ac' });
  });

  it('binds to the template\'s own field of that key, and to a collection key in any case', () => {
    const taken = { ...unbound(), fields: [...unbound().fields, { key: 'speed', label: 'Pace', type: 'number' as const }] };
    const result = commitLabel(taken, 'newstat1', 'Speed', ['speed_2']);
    // The template's own field of that key binds instead of a second one.
    expect(result.bound).toEqual({ key: 'speed', created: false, fromCollection: false });
    expect(blockOf(result.template, 'newstat1')).toMatchObject({ field: 'speed', label: 'Speed' });

    const clash = commitLabel(unbound(), 'newstat1', 'Hit dice', ['hit_dice_x', 'Hit_Dice']);
    expect(clash.bound).toEqual({ key: 'Hit_Dice', created: true, fromCollection: true });
  });

  it('binds to a key the collection\'s notes use, in their spelling', () => {
    const result = commitLabel(unbound(), 'newstat1', 'Speed', ['speed', 'hp']);
    expect(result.bound).toEqual({ key: 'speed', created: true, fromCollection: true });
    expect(result.template.fields.map((field) => field.key)).toContain('speed');
  });

  it('numbers a key that another field has', () => {
    const base = { ...unbound(), fields: [...unbound().fields, { key: 'speed', label: 'Speed', type: 'list' as const }] };
    const result = commitLabel(base, 'newstat1', 'Speed');
    expect(result.bound?.key).toBe('speed_2');
  });

  it('binds a Line and heads an Entries block with the label', () => {
    const line = commitLabel(unbound(), 'newline1', 'Type');
    expect(blockOf(line.template, 'newline1')).toMatchObject({ fields: ['type'] });
    const entries = commitLabel(unbound(), 'newent01', 'Actions');
    expect(blockOf(entries.template, 'newent01')).toMatchObject({ field: 'actions', heading: 'Actions' });
    expect(entries.template.fields.at(-1)).toMatchObject({ key: 'actions', type: 'entries' });
  });

  it('renames a bound block\'s field label, or its own label where it has one', () => {
    const source = sampleTemplate();
    const renamed = commitLabel(source, 'stat-ac1', 'Armour');
    expect(renamed.template.fields.find((field) => field.key === 'ac')?.label).toBe('Armour');
    expect(blockOf(renamed.template, 'stat-ac1')).not.toHaveProperty('label');

    const own = commitLabel(commitLabel(source, 'stat-ac1', 'AC').template, 'stat-ac1', 'Defense');
    expect(own.template.fields.find((field) => field.key === 'ac')?.label).toBe('Defense');
  });

  it('sets and removes a heading', () => {
    const source = withSection();
    expect(blockOf(commitLabel(source, 'section1', 'Guard').template, 'section1')).toMatchObject({ heading: 'Guard' });
    expect(blockOf(commitLabel(source, 'section1', '').template, 'section1')).not.toHaveProperty('heading');
  });

  it('names an Abilities component split into tabs by the Tabs block\'s heading, and removes it', () => {
    const tabs: TemplateBlock = { id: 'tabs0001', type: 'tabs', blocks: [
      { id: 'tab00001', type: 'section', heading: 'Cantrips', blocks: [{ id: 'spells01', type: 'entries', field: 'spells' }] },
    ] };
    const source = template([tabs], [{ key: 'spells', label: 'Spells', type: 'entries' }]);
    expect(labelTargetOf(tabs, source.fields)).toEqual({ kind: 'heading', text: '' });
    const named = commitLabel(source, 'tabs0001', ' Spellbook ').template;
    expect(blockOf(named, 'tabs0001')).toMatchObject({ heading: 'Spellbook' });
    expect(blockOf(named, 'tab00001')).toMatchObject({ heading: 'Cantrips' });
    expect(labelTargetOf(blockOf(named, 'tabs0001'), named.fields)).toEqual({ kind: 'heading', text: 'Spellbook' });
    expect(blockOf(commitLabel(named, 'tabs0001', '').template, 'tabs0001')).not.toHaveProperty('heading');
  });

  it('changes nothing for an empty label, the same label, or a block without one', () => {
    const source = sampleTemplate();
    expect(commitLabel(source, 'stat-ac1', '   ').template).toBe(source);
    expect(commitLabel(source, 'stat-ac1', 'Armor class').template).toBe(source);
    expect(commitLabel(source, 'row00001', 'Anything').template).toBe(source);
    expect(commitLabel(unbound(), 'newstat1', '').template.fields).toHaveLength(1);
  });
});
