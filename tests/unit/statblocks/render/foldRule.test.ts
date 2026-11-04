import { describe, expect, it } from 'vitest';
import { blockDisplay } from '../../../../src/app/statblocks/render/blockDisplay';
import { foldedBlocks, foldedIds } from '../../../../src/app/statblocks/render/foldRule';
import { sheetState } from '../../../../src/app/statblocks/render/sheetState';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { FIVE_E_2014_MONSTER } from '../../../../src/app/statblocks/presets/fiveE2014';
import { FIVE_E_2024_MONSTER } from '../../../../src/app/statblocks/presets/fiveE2024';
import type { StatblockTemplate, TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';

const FIVE_E = FIVE_E_2014_MONSTER.template;
const headings = (template: StatblockTemplate, record: Record<string, unknown>, unfolded?: Set<string>): string[] =>
  foldedBlocks(template, record, unfolded).map((block) => block.heading);

function withBlocks(template: StatblockTemplate, blocks: TemplateBlock[]): StatblockTemplate {
  return { ...template, layout: { ...template.layout, blocks: [...template.layout.blocks, ...blocks] } };
}

/** Empty headed sections fold into chips under the card (spec §8.2, J6). */
describe('foldedBlocks', () => {
  it('folds the empty headed sections of a new 5E statblock, and keeps its main list of actions', () => {
    expect(headings(FIVE_E, { name: 'Aboleth' })).toEqual(['Spellcasting', 'Bonus Actions', 'Reactions', 'Legendary Actions']);
    expect(headings(FIVE_E_2024_MONSTER.template, { name: 'Aboleth' })).toEqual(['Traits', 'Spellcasting', 'Bonus Actions', 'Reactions', 'Legendary Actions']);
  });

  it('never folds a section with a value, one unfolded on this card, or one with a fallback', () => {
    expect(headings(FIVE_E, { spells: ['Cantrips: light'] })).not.toContain('Spellcasting');
    expect(headings(FIVE_E, {}, new Set(['e4spell0']))).not.toContain('Spellcasting');
    const withFallback = withBlocks(FIVE_E, [{ id: 'lair0000', type: 'entries', field: 'lair', heading: 'Lair', whenEmpty: 'fallback', fallback: 'None' }]);
    expect(headings({ ...withFallback, fields: [...withFallback.fields, { key: 'lair', label: 'Lair', type: 'entries' }] }, {})).not.toContain('Lair');
  });

  it('neither draws nor chips a section whose condition fails, as at runtime', () => {
    const conditional = withBlocks(FIVE_E, [{ id: 'mythic00', type: 'entries', field: 'mythic', heading: 'Mythic', showWhen: { field: 'legendary_actions', is: 'present' } }]);
    expect(headings(conditional, {})).not.toContain('Mythic');
    expect(headings(conditional, { legendary_actions: [{ name: 'Detect', desc: 'It looks.' }] })).toContain('Mythic');
  });

  it('folds a headed Section whose blocks are all empty, once, and never a single stat', () => {
    const section = withBlocks(FIVE_E, [{ id: 'sect0000', type: 'section', heading: 'Lair', blocks: [
      { id: 'stat0000', type: 'stat', field: 'lair_ac', look: 'run-in' },
      { id: 'divi0000', type: 'divider' },
    ] }]);
    expect(foldedBlocks(section, {}).filter((block) => block.blockId === 'sect0000' || block.blockId === 'stat0000')).toEqual([{ blockId: 'sect0000', heading: 'Lair' }]);
    expect(headings(section, { lair_ac: 12 })).not.toContain('Lair');
  });

  it('hides a folded block from the card and its values from editing', () => {
    const folded = foldedIds(foldedBlocks(FIVE_E, {}));
    const sheet = sheetState({ template: FIVE_E, record: {}, mode: 'editing', folded });
    const spells = findBlock(FIVE_E.layout.blocks, 'e4spell0')!.block;
    expect(blockDisplay(spells, sheet)).toBeNull();
    expect(blockDisplay(spells, sheetState({ template: FIVE_E, record: {}, mode: 'editing' }))).not.toBeNull();
  });

  it('leaves a 5E statblock without spells as it was at runtime: the empty Spellcasting block is not drawn', () => {
    const spells = findBlock(FIVE_E.layout.blocks, 'e4spell0')!.block;
    expect(blockDisplay(spells, sheetState({ template: FIVE_E, record: { name: 'Aboleth' }, mode: 'view' }))).toBeNull();
  });
});

/** Blocks that say they fold while empty (`whenEmpty: 'fold'`, Fantasy Statblocks' `conditioned`): any kind, named by its label. */
describe('blocks that fold while empty', () => {
  const FOLDING: StatblockTemplate = {
    ...FIVE_E,
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'fage_stats', label: 'Fantasy AGE Stats', type: 'scores', slots: ['Accuracy', 'Fighting'] },
      { key: 'resist', label: 'Damage Resistances', type: 'text' },
      { key: 'difficulty', label: 'Difficulty', type: 'number' },
      { key: 'speed', label: 'Speed', type: 'text' },
      { key: 'ac', label: 'Armor Class', type: 'number' },
      { key: 'actions', label: 'Actions', type: 'entries' },
    ],
    layout: { maxColumns: 1, blocks: [
      { id: 'fage0000', type: 'scores', field: 'fage_stats', orientation: 'row', whenEmpty: 'fold' },
      { id: 'resist00', type: 'stat', field: 'resist', look: 'run-in', whenEmpty: 'fold' },
      { id: 'diffc000', type: 'stat', field: 'difficulty', label: 'Difficulty:', look: 'run-in', whenEmpty: 'fold' },
      { id: 'group000', type: 'section', whenEmpty: 'fold', blocks: [{ id: 'speed000', type: 'stat', field: 'speed', look: 'run-in', whenEmpty: 'fold' }] },
      { id: 'lore0000', type: 'heading', text: 'Lore', level: 'section', whenEmpty: 'fold' },
      { id: 'acplain0', type: 'stat', field: 'ac', look: 'run-in' },
      { id: 'actions0', type: 'entries', field: 'actions', heading: 'Actions', whenEmpty: 'fold' },
    ] },
  };
  const fage = findBlock(FOLDING.layout.blocks, 'fage0000')!.block;

  it('folds a table, a value and a list of any kind while empty, each named by its own label, else its field\'s', () => {
    expect(foldedBlocks(FOLDING, {})).toEqual([
      { blockId: 'fage0000', heading: 'Fantasy AGE Stats' },
      { blockId: 'resist00', heading: 'Damage Resistances' },
      { blockId: 'diffc000', heading: 'Difficulty' },
      { blockId: 'speed000', heading: 'Speed' },
    ]);
  });

  it('never folds one with a value, a container without a heading, a block that holds none, a block that does not say so, or the main list', () => {
    expect(headings(FOLDING, { fage_stats: [[12, 3]], speed: '30 ft.' })).toEqual(['Damage Resistances', 'Difficulty']);
    expect(headings(FOLDING, {}, new Set(['fage0000']))).not.toContain('Fantasy AGE Stats');
  });

  it('is not drawn where the statblock is read, shows its prompt in the template editor, and leaves the card where it folds', () => {
    expect(blockDisplay(fage, sheetState({ template: FOLDING, record: {}, mode: 'view' }))).toBeNull();
    expect(blockDisplay(fage, sheetState({ template: FOLDING, record: {}, mode: 'editing' }))).toEqual({ state: 'prompt', prompt: 'Add fantasy AGE stats' });
    const folded = foldedIds(foldedBlocks(FOLDING, {}));
    expect(blockDisplay(fage, sheetState({ template: FOLDING, record: {}, mode: 'editing', folded }))).toBeNull();
    expect(blockDisplay(fage, sheetState({ template: FOLDING, record: { fage_stats: [[12, 3]] }, mode: 'view' }))).not.toBeNull();
  });
});
