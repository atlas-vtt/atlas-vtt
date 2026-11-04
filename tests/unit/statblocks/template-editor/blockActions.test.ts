import { describe, expect, it } from 'vitest';
import {
  deleteSelection, duplicateSelection, insertCatalogueBlock, pasteClip, toggleHeaderPartHidden,
} from '../../../../src/app/statblocks/editor/template-editor/blockActions';
import { clipOf, copyBlocks, rememberClip } from '../../../../src/app/statblocks/editor/template-editor/blockClipboard';
import { insertTarget, moveSelection } from '../../../../src/app/statblocks/editor/template-editor/blockMoves';
import { commitLabel } from '../../../../src/app/statblocks/editor/template-editor/labelCommit';
import { HEADER_MESSAGE } from '../../../../src/app/statblocks/editor/template-editor/sessionEdit';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { FakeSession, sampleTemplate, shape, template } from './editorKit';

const session = (): FakeSession => new FakeSession(sampleTemplate());
const layoutShape = (s: FakeSession): string => shape(s.template.layout.blocks);

describe('moving tiles without a drag', () => {
  it('steps a tile past its neighbour, and stops at the top of the rows', () => {
    const s = session();
    moveSelection(s, ['stat-hp1'], -1);
    expect(layoutShape(s)).toBe('title001 stat-hp1 stat-ac1 row00001(stat-sp1 stat-cr1) divider1');
    moveSelection(s, ['stat-hp1'], -1);
    expect(moveSelection(s, ['stat-hp1'], -1).announce).toBe('Already at the top.');
    expect(layoutShape(s)).toBe('stat-hp1 title001 stat-ac1 row00001(stat-sp1 stat-cr1) divider1');
    expect(s.steps).toBe(2);
  });

  it('leaves the header\'s parts where they are, and says so', () => {
    const s = session();
    for (const step of [1, -1] as const) expect(moveSelection(s, ['header-name'], step).announce).toBe(HEADER_MESSAGE);
    expect(layoutShape(s)).toBe(shape(sampleTemplate().layout.blocks));
    expect(s.steps).toBe(0);
  });

  it('steps a tile along its row, and out of it into a row of its own, the row left with one tile becoming that tile', () => {
    const s = session();
    moveSelection(s, ['stat-cr1'], -1);
    expect(layoutShape(s)).toBe('title001 stat-ac1 stat-hp1 row00001(stat-cr1 stat-sp1) divider1');
    moveSelection(s, ['stat-cr1'], -1);
    expect(layoutShape(s)).toBe('title001 stat-ac1 stat-hp1 stat-cr1 stat-sp1 divider1');
  });

  it('moves a run of siblings together and stops at the end of the list', () => {
    const s = session();
    moveSelection(s, ['stat-sp1', 'stat-cr1'], 1);
    expect(layoutShape(s)).toBe('title001 stat-ac1 stat-hp1 row00001(stat-sp1 stat-cr1) divider1');
    expect(moveSelection(s, ['divider1'], 1).announce).toBe('Already at the end.');
    expect(s.steps).toBe(0);
  });

  it('inserts after the anchor, or after the Row a Row would land in (the note panel\'s Add section)', () => {
    const { layout } = sampleTemplate();
    expect(insertTarget(layout, 'stat-ac1', 'stat')).toEqual({ parentId: null, index: 2 });
    expect(insertTarget(layout, 'stat-sp1', 'row')).toEqual({ parentId: null, index: 4 });
    expect(insertTarget(layout, null, 'stat')).toEqual({ parentId: null, index: 5 });
  });
});

describe('inserting', () => {
  it('inserts a new tile in a row of its own after the selection\'s row, selected, a step once it is kept', () => {
    const s = session();
    const outcome = insertCatalogueBlock(s, 'stat', { after: 'stat-sp1' });
    expect(outcome.toName).toBe(outcome.inserted);
    expect(outcome.select).toEqual([outcome.inserted]);
    expect(findBlock(s.template.layout.blocks, outcome.inserted ?? '')).toMatchObject({ parentId: null, index: 4 });
    expect(s.steps).toBe(0);
    outcome.placement?.keep();
    outcome.placement?.keep();
    expect(s.steps).toBe(1);
  });

  it('names a tile placed to be named in the same step: one undo takes the named tile away', () => {
    const s = session();
    const before = s.template;
    const outcome = insertCatalogueBlock(s, 'scores', { after: null });
    s.apply((template) => commitLabel(template, outcome.inserted ?? '', 'Stress').template);
    outcome.placement?.keep();
    expect(s.steps).toBe(1);
    expect(s.template.fields.find((field) => field.key === 'stress')).toMatchObject({ type: 'scores', slots: ['', '', ''], rows: [[], []] });
    s.undo();
    expect(s.template).toBe(before);
    s.redo();
    expect(findBlock(s.template.layout.blocks, outcome.inserted ?? '')?.block).toMatchObject({ field: 'stress' });
  });

  it('lets a tile go without a name: the template as before, no step, nothing for undo or redo to bring back', () => {
    const s = session();
    s.apply((template) => ({ ...template, layout: { ...template.layout, maxColumns: 2 } }));
    const before = s.template;
    const outcome = insertCatalogueBlock(s, 'stat', { after: null });
    outcome.placement?.drop();
    outcome.placement?.keep();
    expect(s.template).toBe(before);
    expect(s.steps).toBe(1);
    s.undo();
    expect(s.template.layout.maxColumns).toBe(1);
    s.redo();
    expect(s.template).toBe(before);
    expect(s.getSnapshot().canRedo).toBe(false);
  });

  it('puts a divider in as one step at once: it has nothing to name', () => {
    const s = session();
    const outcome = insertCatalogueBlock(s, 'divider', { after: null });
    expect(outcome.placement).toBeUndefined();
    expect(s.steps).toBe(1);
    expect(s.gestureOpen).toBe(false);
  });

  it('inserts after the header where the selection is part of it, and at the end without a selection', () => {
    const s = session();
    const afterName = insertCatalogueBlock(s, 'divider', { after: 'title001' });
    expect(findBlock(s.template.layout.blocks, afterName.inserted ?? '')).toMatchObject({ parentId: null, index: 1 });
    const atEnd = insertCatalogueBlock(s, 'divider', { after: null });
    expect(findBlock(s.template.layout.blocks, atEnd.inserted ?? '')?.index).toBe(s.template.layout.blocks.length - 1);
  });

  it('brings the name field along with a Title where the template lacks it', () => {
    const s = new FakeSession(template([]));
    insertCatalogueBlock(s, 'title', { after: null });
    expect(s.template.fields).toEqual([{ key: 'name', label: 'Name', type: 'text' }]);
  });

  it('inserts at the gap the + line named', () => {
    const s = session();
    const outcome = insertCatalogueBlock(s, 'divider', { at: { parentId: 'row00001', index: 1 } });
    expect(findBlock(s.template.layout.blocks, outcome.inserted ?? '')).toMatchObject({ parentId: 'row00001', index: 1 });
  });

  it('changes nothing in a template of a newer Atlas, and says so', () => {
    const s = new FakeSession(sampleTemplate(), { readOnly: true, readOnlyReason: 'newer' });
    expect(insertCatalogueBlock(s, 'stat', { after: null }).announce).toBe('Update Atlas to edit this template.');
    expect(deleteSelection(s, ['stat-ac1']).announce).toBe('Update Atlas to edit this template.');
    expect(s.steps).toBe(0);
  });
});

describe('the toolbar\'s edits', () => {
  it('deletes the selection in one step, names it, and moves focus to the next tile', () => {
    const s = session();
    const outcome = deleteSelection(s, ['stat-ac1']);
    expect(outcome).toMatchObject({ select: ['stat-hp1'], deleted: 'Armor class' });
    expect(outcome.announce).toMatch(/^Deleted Armor class\. Press (Cmd|Ctrl)\+Z to undo\.$/);
    s.undo();
    expect(layoutShape(s)).toBe(shape(sampleTemplate().layout.blocks));
  });

  it('hides a part of the header in one step and shows it again, saying so, and never deletes, copies or moves one', () => {
    const s = new FakeSession(template(sampleTemplate().layout.blocks, [
      ...sampleTemplate().fields, { key: 'level', label: 'Tier', type: 'rating', meaning: 'rating' },
    ]));
    expect(toggleHeaderPartHidden(s, 'header-level')).toEqual({ select: [], announce: 'Tier hidden. It stays in the template, off the card.' });
    expect(s.template.header).toEqual({ hidden: ['level'] });
    expect(s.steps).toBe(1);
    expect(toggleHeaderPartHidden(s, 'header-level')).toEqual({ select: ['header-level'], announce: 'Tier shown on the card.' });
    expect(s.template.header).toBeUndefined();
    expect(toggleHeaderPartHidden(s, 'header-name')).toEqual({ announce: 'Every statblock shows its name.' });
    expect(toggleHeaderPartHidden(s, 'stat-ac1')).toEqual({});
    const before = s.steps;
    expect(deleteSelection(s, ['header-level']).announce).toBe(HEADER_MESSAGE);
    expect(duplicateSelection(s, ['header-hp']).announce).toBe(HEADER_MESSAGE);
    expect(s.steps).toBe(before);
  });

  it('leaves the other tile of a row of two on its own row', () => {
    const s = session();
    deleteSelection(s, ['stat-sp1']);
    expect(layoutShape(s)).toBe('title001 stat-ac1 stat-hp1 stat-cr1 divider1');
  });

  it('duplicates each selected tile right after it and selects the copies', () => {
    const s = session();
    const outcome = duplicateSelection(s, ['stat-ac1', 'stat-hp1']);
    expect(s.steps).toBe(1);
    const ids = s.template.layout.blocks.map((block) => block.id);
    expect(ids).toHaveLength(7);
    expect(outcome.select).toEqual([ids[2], ids[4]]);
  });

  it('copies blocks with their fields and pastes them re-keyed, into another template too', () => {
    const owner = {};
    const clip = copyBlocks(sampleTemplate(), ['row00001']);
    expect(clip?.fields.map((field) => field.key)).toEqual(['speed', 'cr']);
    if (clip) rememberClip(owner, clip);
    const other = new FakeSession(template([{ id: 'only0001', type: 'divider' }], [{ key: 'speed', label: 'Pace', type: 'number' }]));
    const outcome = pasteClip(other, clipOf(owner) ?? clip!, 'only0001');
    const pasted = findBlock(other.template.layout.blocks, outcome.inserted ?? '')?.block;
    expect(pasted?.id).not.toBe('row00001');
    expect(pasted && 'blocks' in pasted ? pasted.blocks.map((block) => block.id) : []).not.toContain('stat-sp1');
    // The template's own Speed stays; Challenge comes along.
    expect(other.template.fields).toEqual([{ key: 'speed', label: 'Pace', type: 'number' }, { key: 'cr', label: 'Challenge', type: 'rating' }]);
    expect(other.steps).toBe(1);
  });
});
