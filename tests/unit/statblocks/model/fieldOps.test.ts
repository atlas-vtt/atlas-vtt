import { describe, expect, it } from 'vitest';
import {
  addField, blocksReadingField, fieldsNotShown, removeField, renameFieldKey, renameKeyProblem, updateField,
} from '../../../../src/app/statblocks/model/fieldOps';
import type { StatblockTemplate, TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';

const PROFICIENT: StatblockTemplate = {
  ...MARSH_CREATURE,
  fields: [
    ...MARSH_CREATURE.fields,
    { key: 'prof', label: 'Proficiency', type: 'number', formerKeys: ['proficiency_bonus'] },
    { key: 'saves', label: 'Saves', type: 'pairs' },
    { key: 'notes', label: 'Notes', type: 'markdown' },
  ],
  layout: {
    ...MARSH_CREATURE.layout,
    blocks: [
      { id: 'sec00001', type: 'section', headingField: 'prof', showWhen: { field: 'prof', is: 'present' }, blocks: [
        { id: 'lin00001', type: 'line', fields: ['size', 'prof', 'type'], pattern: '{size} {prof}[, {type}]' },
        { id: 'sta00001', type: 'stat', field: 'hp', look: 'run-in', rollFrom: 'prof', fallback: '{=prof * 2}' },
      ] },
      {
        id: 'sco00001', type: 'scores', field: 'stats', orientation: 'table',
        columns: [{ label: 'Save', field: 'saves' }, { label: 'Mod', formula: 'floor((value - 10) / 2) + prof', display: 'signed' }],
      },
      { id: 'ent00001', type: 'entries', field: 'traits', introField: 'prof' },
      { id: 'tit00001', type: 'title', field: 'name', level: 1, pattern: '{name} ({prof.0})' },
      { id: 'opq00001', type: 'opaque', raw: { type: 'future', field: 'prof' } },
    ],
  },
  sample: { ...MARSH_CREATURE.sample, prof: 2 },
};

const blockById = (template: StatblockTemplate, id: string): TemplateBlock | undefined => {
  const visit = (blocks: readonly TemplateBlock[]): TemplateBlock | undefined => {
    for (const block of blocks) {
      if (block.id === id) return block;
      if (block.type === 'section' || block.type === 'row') {
        const inner = visit(block.blocks);
        if (inner) return inner;
      }
    }
    return undefined;
  };
  return visit(template.layout.blocks);
};

describe('renameFieldKey', () => {
  const renamed = renameFieldKey(PROFICIENT, 'prof', 'bonus');

  it('keeps the old key first on formerKeys, newest first', () => {
    expect(renamed.fields.find((field) => field.key === 'bonus')?.formerKeys).toEqual(['prof', 'proficiency_bonus']);
    expect(renamed.fields.some((field) => field.key === 'prof')).toBe(false);
    const back = renameFieldKey(renamed, 'bonus', 'prof');
    expect(back.fields.find((field) => field.key === 'prof')?.formerKeys).toEqual(['bonus', 'proficiency_bonus']);
  });

  it('rewrites every reference: bound fields, Line fields, patterns, fallbacks, Scores columns, conditions', () => {
    expect(blockById(renamed, 'sec00001')).toMatchObject({ headingField: 'bonus', showWhen: { field: 'bonus', is: 'present' } });
    expect(blockById(renamed, 'lin00001')).toMatchObject({ fields: ['size', 'bonus', 'type'], pattern: '{size} {bonus}[, {type}]' });
    expect(blockById(renamed, 'sta00001')).toMatchObject({ field: 'hp', rollFrom: 'bonus', fallback: '{=bonus * 2}' });
    expect(blockById(renamed, 'sco00001')).toMatchObject({
      columns: [{ label: 'Save', field: 'saves' }, { label: 'Mod', formula: 'floor((value - 10) / 2) + bonus', display: 'signed' }],
    });
    expect(blockById(renamed, 'ent00001')).toMatchObject({ introField: 'bonus' });
    expect(blockById(renamed, 'tit00001')).toMatchObject({ pattern: '{name} ({bonus.0})' });
    expect(renamed.sample).toMatchObject({ bonus: 2 });
    expect(renamed.sample).not.toHaveProperty('prof');
  });

  it('renames a Scores column field and leaves script and unknown blocks as they were read', () => {
    const scores = renameFieldKey(PROFICIENT, 'saves', 'saving_throws');
    expect(blockById(scores, 'sco00001')).toMatchObject({ columns: [{ field: 'saving_throws' }, { formula: 'floor((value - 10) / 2) + prof' }] });
    expect(blockById(renamed, 'opq00001')).toBe(blockById(PROFICIENT, 'opq00001'));
  });

  it('shares every block that does not read the key', () => {
    const divider = MARSH_CREATURE.layout.blocks[1];
    const hp = renameFieldKey(MARSH_CREATURE, 'hp', 'health');
    expect(hp.layout.blocks[1]).toBe(divider);
    expect(hp.layout.blocks.find((block) => block.id === 'p8e1g6hu')).toMatchObject({ field: 'health', pattern: '{health}[ ({hit_dice})]' });
  });

  it('refuses a key that is taken, reserved, malformed, or that a formula cannot name', () => {
    for (const to of ['ac', 'AC', 'statblock', '1st', '']) {
      expect(renameFieldKey(PROFICIENT, 'prof', to)).toBe(PROFICIENT);
      expect(renameKeyProblem(PROFICIENT, 'prof', to)).not.toBeNull();
    }
    // Another field's former key still finds that field's values in older notes.
    expect(renameFieldKey(PROFICIENT, 'speed', 'proficiency_bonus')).toBe(PROFICIENT);
    // A field's own former key is a rename back.
    expect(renameFieldKey(PROFICIENT, 'prof', 'proficiency_bonus').fields.find((field) => field.key === 'proficiency_bonus')?.formerKeys).toEqual(['prof']);
    expect(renameKeyProblem(PROFICIENT, 'prof', 'prof-bonus')).toContain('formula');
    expect(renameFieldKey(PROFICIENT, 'prof', 'prof-bonus')).toBe(PROFICIENT);
    expect(renameFieldKey(PROFICIENT, 'speed', 'move-speed').fields.some((field) => field.key === 'move-speed')).toBe(true);
    expect(renameFieldKey(PROFICIENT, 'nowhere', 'x')).toBe(PROFICIENT);
    expect(renameFieldKey(PROFICIENT, 'prof', 'prof')).toBe(PROFICIENT);
  });
});

describe('removeField', () => {
  it('is refused while a block reads the field in any way', () => {
    expect(removeField(PROFICIENT, 'prof')).toBe(PROFICIENT);
    expect(blocksReadingField(PROFICIENT, 'prof').map((block) => block.id)).toEqual(['sec00001', 'lin00001', 'sta00001', 'sco00001', 'ent00001', 'tit00001']);
  });

  it('takes out a field no block reads, with its sample value, and never anything else', () => {
    const removed = removeField(PROFICIENT, 'notes');
    expect(removed.fields.map((field) => field.key)).not.toContain('notes');
    expect(removed.layout).toBe(PROFICIENT.layout);
    const withSample = { ...PROFICIENT, sample: { ...PROFICIENT.sample, notes: 'Some notes' } };
    expect(removeField(withSample, 'notes').sample).not.toHaveProperty('notes');
    expect(removeField(PROFICIENT, 'nowhere')).toBe(PROFICIENT);
  });
});

describe('fieldsNotShown', () => {
  it('lists the fields no block shows, column formulas counting as shown', () => {
    expect(fieldsNotShown(PROFICIENT).map((field) => field.key)).toEqual([
      'image', 'alignment', 'ac', 'hit_dice', 'speed', 'senses', 'languages', 'cr', 'actions', 'notes',
    ]);
    expect(fieldsNotShown(MARSH_CREATURE)).toEqual([]);
  });
});

describe('addField and updateField', () => {
  it('appends a field whose key no field holds or held', () => {
    const added = addField(PROFICIENT, { key: 'legendary', label: 'Legendary actions', type: 'entries' });
    expect(added.fields.at(-1)).toEqual({ key: 'legendary', label: 'Legendary actions', type: 'entries' });
    expect(addField(PROFICIENT, { key: 'proficiency_bonus', label: 'Bonus', type: 'number' })).toBe(PROFICIENT);
    expect(addField(PROFICIENT, { key: 'HP', label: 'HP', type: 'number' })).toBe(PROFICIENT);
  });

  it('changes settings, removes optional ones given as undefined, and never the key', () => {
    const updated = updateField(PROFICIENT, 'speed', { label: 'Movement', prompt: undefined, unit: 'ft.' });
    expect(updated.fields.find((field) => field.key === 'speed')).toEqual({ key: 'speed', label: 'Movement', type: 'text', unit: 'ft.' });
    expect(updateField(PROFICIENT, 'speed', { label: 'Speed' })).toBe(PROFICIENT);
    expect(updateField(PROFICIENT, 'speed', { unit: undefined })).toBe(PROFICIENT);
    expect(updateField(PROFICIENT, 'nowhere', { label: 'X' })).toBe(PROFICIENT);
  });
});
