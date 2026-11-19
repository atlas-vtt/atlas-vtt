import { describe, expect, it } from 'vitest';
import { commitLabel } from '../../../../src/app/statblocks/editor/template-editor/labelCommit';
import { bindHeaderPart, fieldNamedBy, rekeyHeaderPart } from '../../../../src/app/statblocks/model/headerBinding';
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

describe('a header part kept under the statblocks\' own key', () => {
  it('moves the part\'s field to the key, with its meaning, and keeps the key it had readable', () => {
    const rekeyed = rekeyHeaderPart(template([FEATS], FIELDS), 'level', 'tier');
    expect(levelOf(rekeyed)).toEqual(['tier', 'Level']);
    expect(rekeyed.fields.find((field) => field.key === 'tier')).toEqual({ key: 'tier', label: 'Level', type: 'rating', meaning: 'rating', formerKeys: ['level'] });
    expect(rekeyed.fields.some((field) => field.key === 'level')).toBe(false);
  });

  it('gives a field found by its own key the part\'s meaning, so the part still finds it', () => {
    const plain = FIELDS.map((field) => (field.key === 'level' ? { key: 'level', label: 'Level', type: 'rating' as const } : field));
    expect(levelOf(rekeyHeaderPart(template([FEATS], plain), 'level', 'tier'))).toEqual(['tier', 'Level']);
  });

  it('refuses the name, the key the part has, and a key another field has or had', () => {
    const source = template([RANK, FEATS], FIELDS);
    expect(rekeyHeaderPart(source, 'name', 'title')).toBe(source);
    expect(rekeyHeaderPart(source, 'level', 'level')).toBe(source);
    expect(rekeyHeaderPart(source, 'level', 'rank')).toBe(source);
    const renamed = template([FEATS], [...FIELDS.filter((field) => field.key !== 'rank'), { key: 'grade', label: 'Grade', type: 'text', formerKeys: ['rank'] }]);
    expect(rekeyHeaderPart(renamed, 'level', 'rank')).toBe(renamed);
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

  it('takes the key the collection\'s statblocks hold under that name, in their spelling, and says so', () => {
    const result = commitLabel(template([FEATS], FIELDS), 'header-level', 'Tier', ['feats', 'Tier', 'stress']);
    expect(levelOf(result.template)).toEqual(['Tier', 'Tier']);
    expect(result.bound).toEqual({ key: 'Tier', created: false, fromCollection: true });
    expect(result.template.fields.find((field) => field.key === 'Tier')?.formerKeys).toEqual(['level']);
  });

  it('keeps its key where the statblocks hold none of that name, and prefers a field of the template to their key', () => {
    const relabelled = commitLabel(template([FEATS], FIELDS), 'header-level', 'Tier', ['feats', 'stress']);
    expect(levelOf(relabelled.template)).toEqual(['level', 'Tier']);
    expect(relabelled.bound).toBeUndefined();
    const own = commitLabel(template([RANK, FEATS], FIELDS), 'header-level', 'Rank', ['rank']);
    expect(levelOf(own.template)).toEqual(['rank', 'Rank']);
    expect(own.template.fields.some((field) => field.formerKeys?.includes('level'))).toBe(false);
  });
});
