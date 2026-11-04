import { describe, expect, it } from 'vitest';
import { commitLabel } from '../../../../src/app/statblocks/editor/template-editor/labelCommit';
import { bindHeaderPart, fieldNamedBy } from '../../../../src/app/statblocks/model/headerBinding';
import { headerParts } from '../../../../src/app/statblocks/model/templateHeader';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { template } from '../template-editor/editorKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'rank', label: 'Rank', type: 'text' },
  { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
  { key: 'hp', label: 'HP', type: 'number', meaning: 'hit-points' },
  { key: 'description', label: 'Description', type: 'markdown', meaning: 'description' },
  { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
  { key: 'feats', label: 'Features', type: 'entries' },
];
const RANK: TemplateBlock = { id: 'stat-rnk', type: 'stat', field: 'rank', look: 'run-in' };
const FEATS: TemplateBlock = { id: 'ent-feat', type: 'entries', field: 'feats' };

const levelOf = (source: StatblockTemplate): [string, string] => {
  const part = headerParts(source).find((each) => each.id === 'level')!;
  return [part.key, part.label];
};

describe('a header part pointed at another field', () => {
  it('shows a field of the system\'s own as the level, and drops what repeated it', () => {
    const bound = bindHeaderPart(template([RANK, FEATS], FIELDS), 'level', 'rank');
    expect(levelOf(bound)).toEqual(['rank', 'Rank']);
    expect(bound.fields.find((field) => field.key === 'rank')?.meaning).toBe('rating');
    expect(bound.fields.some((field) => field.key === 'level')).toBe(false);
    expect(bound.layout.blocks.map((block) => block.id)).toEqual(['ent-feat']);
  });

  it('drops a block that only strung the new level and the type together, and hides neither part', () => {
    const joined: TemplateBlock = { id: 'stat-jnd', type: 'stat', field: 'rank', look: 'run-in', pattern: '{rank} {type}' };
    const bound = bindHeaderPart(template([joined, FEATS], FIELDS), 'level', 'rank');
    expect(bound.layout.blocks.map((block) => block.id)).toEqual(['ent-feat']);
    expect(bound.header?.hidden ?? []).toEqual([]);
  });

  it('keeps a block that writes words of its own between the values', () => {
    const worded: TemplateBlock = { id: 'stat-wrd', type: 'stat', field: 'rank', look: 'run-in', pattern: 'Rank {rank} of the {type}' };
    const bound = bindHeaderPart(template([worded, FEATS], FIELDS), 'level', 'rank');
    expect(bound.layout.blocks.map((block) => block.id)).toEqual(['stat-wrd', 'ent-feat']);
  });

  it('keeps the part\'s former field where a block still shows it, as an ordinary field', () => {
    const levelLine: TemplateBlock = { id: 'line-lvl', type: 'line', fields: ['level', 'rank'] };
    const bound = bindHeaderPart(template([levelLine, FEATS], FIELDS), 'level', 'rank');
    expect(levelOf(bound)[0]).toBe('rank');
    expect(bound.fields.find((field) => field.key === 'level')?.meaning).toBeUndefined();
  });

  it('refuses the name, a field another part shows, and a field the part cannot show', () => {
    const source = template([RANK, FEATS], FIELDS);
    expect(bindHeaderPart(source, 'name', 'rank')).toBe(source);
    expect(bindHeaderPart(source, 'level', 'type')).toBe(source);
    expect(bindHeaderPart(source, 'level', 'feats')).toBe(source);
    expect(bindHeaderPart(source, 'level', 'missing')).toBe(source);
  });

  it('finds the field a label names by its label, ignoring case, else by its key', () => {
    expect(fieldNamedBy(FIELDS, ' rank ', 'level')?.key).toBe('rank');
    expect(fieldNamedBy(FIELDS, 'Level', 'level')).toBeUndefined();
    expect(fieldNamedBy([{ key: 'rank', label: 'Stufe', type: 'text' }], 'Rank', 'level')?.key).toBe('rank');
  });
});

describe('renaming a header part in the template editor', () => {
  it('points the level at the field named so', () => {
    const { template: renamed } = commitLabel(template([RANK, FEATS], FIELDS), 'header-level', 'Rank');
    expect(levelOf(renamed)).toEqual(['rank', 'Rank']);
  });

  it('only relabels where no other field has the name', () => {
    const { template: renamed } = commitLabel(template([RANK, FEATS], FIELDS), 'header-level', 'Circle');
    expect(levelOf(renamed)).toEqual(['level', 'Circle']);
    expect(renamed.fields.find((field) => field.key === 'rank')?.meaning).toBeUndefined();
  });
});
