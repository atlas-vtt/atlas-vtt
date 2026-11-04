import { describe, expect, it } from 'vitest';
import { cancelledText, pickedUpText, targetText } from '../../../../src/app/statblocks/editor/dnd/announcements';
import { subjectOf } from '../../../../src/app/statblocks/editor/dnd/dragSources';
import { applyDrop, treeTargetOf } from '../../../../src/app/statblocks/editor/dnd/dropEdits';
import type { DropLine } from '../../../../src/app/statblocks/editor/dnd/dropGeometry';
import { siblingShifts } from '../../../../src/app/statblocks/editor/dnd/siblingShifts';
import { FakeSession, sampleTemplate, shape } from '../template-editor/editorKit';
import { insertItemFor } from '../../../../src/app/statblocks/editor/template-editor/insertItems';

const LINE: DropLine = { orientation: 'horizontal', x: 0, y: 0, length: 10 };
const box = (top: number, bottom: number): { left: number; top: number; right: number; bottom: number } => ({ left: 0, top, right: 100, bottom });

describe('applyDrop', () => {
  it('moves a tile into a row as one undo step, keeping its id and selecting it', () => {
    const session = new FakeSession(sampleTemplate());
    const outcome = applyDrop(session, { kind: 'block', id: 'divider1' }, { kind: 'between', parentId: 'row00001', index: 1, line: LINE });
    expect(shape(session.template.layout.blocks)).toBe('title001 stat-ac1 stat-hp1 row00001(stat-sp1 divider1 stat-cr1)');
    expect(session.steps).toBe(1);
    expect(outcome).toMatchObject({ select: ['divider1'], landed: 'divider1' });
    session.undo();
    expect(shape(session.template.layout.blocks)).toBe(shape(sampleTemplate().layout.blocks));
  });

  it('takes a tile out of a row of two into a row of its own, the other tile left on its own row', () => {
    const session = new FakeSession(sampleTemplate());
    applyDrop(session, { kind: 'block', id: 'stat-cr1' }, { kind: 'between', parentId: null, index: 1, line: LINE });
    expect(shape(session.template.layout.blocks)).toBe('title001 stat-cr1 stat-ac1 stat-hp1 stat-sp1 divider1');
    expect(session.steps).toBe(1);
  });

  it('sets a tile beside another in a new row, on the side dropped, as one undo step', () => {
    const session = new FakeSession(sampleTemplate());
    const beside = (side: 'start' | 'end') => ({ kind: 'beside' as const, targetId: 'stat-ac1', side, line: { ...LINE, orientation: 'vertical' as const } });
    const outcome = applyDrop(session, { kind: 'block', id: 'divider1' }, beside('end'));
    expect(session.template.layout.blocks[1]).toMatchObject({ type: 'row', blocks: [{ id: 'stat-ac1' }, { id: 'divider1' }] });
    expect(session.steps).toBe(1);
    expect(outcome).toMatchObject({ select: ['divider1'], landed: 'divider1', announce: 'Put Divider beside Armor class, side by side.' });
    session.undo();
    const placed = applyDrop(session, { kind: 'item', item: insertItemFor('stat') }, beside('start'));
    expect(session.template.layout.blocks[1]).toMatchObject({ type: 'row', blocks: [{ type: 'stat' }, { id: 'stat-ac1' }] });
    placed.placement?.keep();
    expect(session.steps).toBe(2);
  });

  it('has a kind dropped from the dock ask for its name, between rows and beside a tile, and never a tile moved or a divider', () => {
    const session = new FakeSession(sampleTemplate());
    const between = { kind: 'between' as const, parentId: null, index: 1, line: LINE };
    const value = applyDrop(session, { kind: 'item', item: insertItemFor('stat') }, between);
    expect(value.toName).toBe(value.inserted);
    value.placement?.keep();
    const beside = { kind: 'beside' as const, targetId: 'stat-ac1', side: 'end' as const, line: { ...LINE, orientation: 'vertical' as const } };
    const table = applyDrop(session, { kind: 'item', item: insertItemFor('scores') }, beside);
    expect(table.toName).toBe(table.landed);
    table.placement?.keep();
    const divider = applyDrop(session, { kind: 'item', item: insertItemFor('divider') }, between);
    expect(divider.toName).toBeUndefined();
    expect(divider.placement).toBeUndefined();
    expect(applyDrop(session, { kind: 'block', id: 'stat-hp1' }, between).toName).toBeUndefined();
  });

  it('counts a later place in the same list once the tile has left it', () => {
    const session = new FakeSession(sampleTemplate());
    applyDrop(session, { kind: 'block', id: 'stat-ac1' }, { kind: 'between', parentId: null, index: 4, line: LINE });
    expect(shape(session.template.layout.blocks)).toBe('title001 stat-hp1 row00001(stat-sp1 stat-cr1) stat-ac1 divider1');
    expect(treeTargetOf(sampleTemplate().layout, { kind: 'between', parentId: null, index: 4, line: LINE }, 'stat-ac1')).toEqual({ parentId: null, index: 3 });
  });

  it('inserts a kind from the dock where it is dropped, a step only once it is kept', () => {
    const session = new FakeSession(sampleTemplate());
    const outcome = applyDrop(session, { kind: 'item', item: insertItemFor('stat') }, { kind: 'into', parentId: null, outline: box(0, 1) });
    expect(session.template.layout.blocks[0]).toMatchObject({ type: 'stat', field: '' });
    expect(outcome.inserted).toBe(session.template.layout.blocks[0]?.id);
    expect(session.steps).toBe(0);
    outcome.placement?.keep();
    expect(session.steps).toBe(1);
  });

  it('takes a dropped kind away again without a step when it is let go', () => {
    const before = sampleTemplate();
    const session = new FakeSession(before);
    const outcome = applyDrop(session, { kind: 'item', item: insertItemFor('scores') }, { kind: 'between', parentId: null, index: 1, line: LINE });
    outcome.placement?.drop();
    expect(session.template).toBe(before);
    expect(session.steps).toBe(0);
  });

  it('changes nothing in a template of a newer Atlas, and says why', () => {
    const session = new FakeSession(sampleTemplate(), { readOnly: true, readOnlyReason: 'newer' });
    const outcome = applyDrop(session, { kind: 'block', id: 'divider1' }, { kind: 'between', parentId: null, index: 1, line: LINE });
    expect(outcome.announce).toBe('Update Atlas to edit this template.');
    expect(session.steps).toBe(0);
  });

  it('knows what each source puts in', () => {
    const template = sampleTemplate();
    expect(subjectOf(template, { kind: 'block', id: 'row00001' })).toEqual({ types: ['row'], movingId: 'row00001' });
    expect(subjectOf(template, { kind: 'item', item: insertItemFor('entries') })).toEqual({ types: ['entries'], movingId: null });
    expect(subjectOf(template, { kind: 'block', id: 'missing' })).toBeNull();
  });
});

describe('siblingShifts', () => {
  const list = [{ id: 'a', box: box(0, 20) }, { id: 'b', box: box(28, 48) }, { id: 'c', box: box(56, 86) }];

  it('slides the blocks passed over by the moved block\'s size and gap, and stands it where it lands', () => {
    const down = siblingShifts(list, 0, 3, 'stack');
    expect(Object.fromEntries(down?.shifts ?? [])).toEqual({ b: { x: 0, y: -28 }, c: { x: 0, y: -28 }, a: { x: 0, y: 66 } });
    expect(down?.landing).toEqual(box(66, 86));
    expect(down?.line).toMatchObject({ orientation: 'horizontal', y: 62 });
    const up = siblingShifts(list, 2, 0, 'stack');
    expect(Object.fromEntries(up?.shifts ?? [])).toEqual({ a: { x: 0, y: 38 }, b: { x: 0, y: 38 }, c: { x: 0, y: -56 } });
  });

  it('slides nothing for the block\'s own place or a list in several columns', () => {
    expect(siblingShifts(list, 1, 1, 'stack')).toBeNull();
    expect(siblingShifts(list, 1, 2, 'stack')).toBeNull();
    const columns = [{ id: 'a', box: box(0, 20) }, { id: 'b', box: { left: 120, top: 0, right: 220, bottom: 20 } }];
    expect(siblingShifts(columns, 0, 2, 'stack')).toBeNull();
  });
});

describe('drag announcements', () => {
  const { layout, fields } = sampleTemplate();

  it('says where the block would go', () => {
    expect(targetText(layout, fields, { kind: 'between', parentId: 'row00001', index: 1, line: LINE }, 'divider1')).toBe('In a row, place 2 of 3.');
    expect(targetText(layout, fields, { kind: 'between', parentId: null, index: 3, line: LINE }, 'stat-ac1')).toBe('A row of its own, row 3 of 5.');
    expect(targetText(layout, fields, { kind: 'refused' }, null)).toBe("Can't go here.");
  });

  it('says what was picked up and that a cancel left it', () => {
    expect(pickedUpText('Speed', false)).toBe('Picked up Speed.');
    expect(pickedUpText('Speed', true)).toMatch(/^Picked up Speed\. Choose a place with the arrow keys/);
    expect(cancelledText('Speed')).toBe('Cancelled. Speed stays where it was.');
  });
});
