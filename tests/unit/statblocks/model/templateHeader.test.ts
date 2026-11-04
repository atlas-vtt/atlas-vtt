import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import {
  headerKey, headerPartOf, headerParts, hiddenHeaderParts, isHeaderBlockId, setHeaderPartHidden, shownHeaderParts, templateBlock,
  withHeaderFields,
} from '../../../../src/app/statblocks/model/templateHeader';
import { removeBlock } from '../../../../src/app/statblocks/model/treeOps';
import { turnInto } from '../../../../src/app/statblocks/model/turnInto';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { template } from '../template-editor/editorKit';

const AC: TemplateBlock = { id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' };
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Portrait', type: 'image' },
  { key: 'cr', label: 'Challenge', type: 'rating', meaning: 'rating' },
  { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
  { key: 'stamina', label: 'Stamina', type: 'number', meaning: 'hit-points' },
  { key: 'description', label: 'Description', type: 'markdown' },
  { key: 'ac', label: 'Armor class', type: 'number' },
];

describe('the header every statblock has', () => {
  it('has six parts in a fixed order, each bound to the template\'s own key for it', () => {
    const whole = template([AC], FIELDS);
    expect(headerParts(whole).map((part) => [part.id, part.key, part.label])).toEqual([
      ['name', 'name', 'Name'], ['token', 'image', 'Portrait'], ['level', 'cr', 'Challenge'], ['type', 'type', 'Type'],
      ['hp', 'stamina', 'Stamina'], ['description', 'description', 'Description'],
    ]);
    expect(headerParts(whole)).toBe(headerParts(whole));
    expect(headerKey([], 'level')).toBe('level');
    expect(headerKey([], 'hp')).toBe('hp');
    expect(headerKey(FIELDS, 'level')).toBe('cr');
  });

  it('draws each part with a block of its own that stands in no layout', () => {
    const whole = template([AC], FIELDS);
    const blocks = headerParts(whole).map((part) => part.block);
    expect(blocks.map((block) => [block.id, block.type])).toEqual([
      ['header-name', 'title'], ['header-token', 'image'], ['header-level', 'stat'], ['header-type', 'stat'], ['header-hp', 'stat'],
      ['header-description', 'text'],
    ]);
    for (const block of blocks) {
      expect(isHeaderBlockId(block.id)).toBe(true);
      expect(templateBlock(whole, block.id)).toBe(block);
    }
    expect(templateBlock(whole, 'stat-ac1')).toBe(AC);
    expect(isHeaderBlockId('stat-ac1')).toBe(false);
    expect(headerPartOf(whole, 'stat-ac1')).toBeNull();
  });

  it('shows the hit points with the template\'s hit dice beside them, which roll them', () => {
    const dice = template([], [...FIELDS, { key: 'hit_dice', label: 'Hit Dice', type: 'dice' }]);
    expect(headerPartOf(dice, 'header-hp')?.block).toEqual({
      id: 'header-hp', type: 'stat', field: 'stamina', look: 'run-in', pattern: '{stamina}[ ({hit_dice})]', rollFrom: 'hit_dice',
    });
    const rating = template([], [...FIELDS, { key: 'hit_dice', label: 'Hit Dice', type: 'rating' }]);
    expect(headerPartOf(rating, 'header-hp')?.block).toEqual({ id: 'header-hp', type: 'stat', field: 'stamina', look: 'run-in' });
  });

  it('cannot be deleted, moved or turned into another block, since no tree edit finds its parts', () => {
    const { layout, fields } = template([AC], FIELDS);
    expect(removeBlock(layout, 'header-name')).toMatchObject({ ok: false, layout });
    expect(turnInto(layout, 'header-level', 'tags', fields)).toMatchObject({ ok: false, layout });
  });

  it('hides and shows the level, type, hit points and description, never the name or the token art', () => {
    const whole = template([AC], FIELDS);
    const hidden = setHeaderPartHidden(setHeaderPartHidden(whole, 'description', true), 'level', true);
    expect(hidden.header).toEqual({ hidden: ['level', 'description'] });
    expect(hiddenHeaderParts(hidden).map((part) => part.id)).toEqual(['level', 'description']);
    expect(shownHeaderParts(hidden).map((part) => part.id)).toEqual(['name', 'token', 'type', 'hp']);
    expect(setHeaderPartHidden(hidden, 'level', true)).toBe(hidden);
    expect(setHeaderPartHidden(whole, 'name', true)).toBe(whole);
    expect(setHeaderPartHidden(whole, 'token', true)).toBe(whole);
    const shown = setHeaderPartHidden(setHeaderPartHidden(hidden, 'level', false), 'description', false);
    expect(shown).toEqual(whole);
    expect('header' in shown).toBe(false);
  });

  it('gives a template a field for every part it lacks, and leaves one that has them all as it is', () => {
    const bare = withHeaderFields(template([AC], [{ key: 'ac', label: 'Armor class', type: 'number' }]));
    expect(bare.fields.map((field) => [field.key, field.label, field.meaning])).toEqual([
      ['ac', 'Armor class', undefined], ['name', 'Name', undefined], ['image', 'Token art', undefined], ['level', 'Level', 'rating'],
      ['type', 'Type', 'creature-type'], ['hp', 'HP', 'hit-points'], ['description', 'Description', 'description'],
    ]);
    const whole = template([AC], FIELDS);
    expect(withHeaderFields(whole)).toBe(whole);
    expect(withHeaderFields(bare)).toBe(bare);
  });

  it('round-trips through the file: the hidden parts, never a part that always shows', () => {
    const hidden = setHeaderPartHidden(template([{ ...AC, id: 'statac01' }], FIELDS), 'type', true);
    const text = serializeTemplate(hidden);
    expect(JSON.parse(text)).toMatchObject({ header: { hidden: ['type'] } });
    const read = parseTemplate(text);
    expect(read).toMatchObject({ status: 'ok', problems: [] });
    expect(read.template?.header).toEqual({ hidden: ['type'] });
    expect(serializeTemplate(read.template!)).toBe(text);
    const named = parseTemplate(text.replace('"type"\n', '"name",\n      "type"\n'));
    expect(named.template?.header?.hidden).toEqual(['type']);
    expect(headerPartOf(named.template!, 'header-name')?.hidden).toBe(false);
    expect(named.problems.join(' ')).toContain('header parts a template may hide');
  });
});
