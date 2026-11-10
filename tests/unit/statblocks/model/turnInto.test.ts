import { describe, expect, it } from 'vitest';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { turnInto } from '../../../../src/app/statblocks/model/turnInto';
import type { TemplateBlock, TemplateField, TemplateLayout } from '../../../../src/app/statblocks/model/templateTypes';
import { deepFreeze } from './treeFixtures';

const fields: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'speed', label: 'Speed', type: 'text' },
  { key: 'ac', label: 'AC', type: 'number' },
  { key: 'languages', label: 'Languages', type: 'list' },
  { key: 'description', label: 'Description', type: 'markdown' },
  { key: 'hp', label: 'HP', type: 'number', formerKeys: ['hit_points'] },
  { key: 'actions', label: 'Actions', type: 'entries' },
];

function layoutOf(...blocks: TemplateBlock[]): TemplateLayout {
  return deepFreeze({ maxColumns: 2, blocks });
}

function turned(layout: TemplateLayout, id: string): TemplateBlock | undefined {
  return findBlock(layout.blocks, id)?.block;
}

describe('turnInto', () => {
  it('keeps the id, the place and a field the new type binds', () => {
    const layout = layoutOf(
      { id: 'one', type: 'divider' },
      { id: 'spd', type: 'stat', field: 'speed', look: 'run-in', label: 'Movement', pattern: '{speed} ft.', className: 'x', whenEmpty: 'hide' },
    );
    const edit = turnInto(layout, 'spd', 'title', fields);
    expect(edit).toMatchObject({ ok: true, focus: 'spd' });
    expect(edit.layout.blocks[1]).toStrictEqual({ id: 'spd', type: 'title', field: 'speed', level: 1, pattern: '{speed} ft.', className: 'x', whenEmpty: 'hide' });
  });

  it('leaves a field the new type cannot bind and carries the label it shares', () => {
    const layout = layoutOf({ id: 'spd', type: 'stat', field: 'speed', look: 'run-in', label: 'Movement', pattern: '{speed}' });
    expect(turned(turnInto(layout, 'spd', 'tags', fields).layout, 'spd')).toStrictEqual({ id: 'spd', type: 'tags', field: '', look: 'comma', label: 'Movement' });
    expect(turned(turnInto(layout, 'spd', 'image', fields).layout, 'spd')).toStrictEqual({ id: 'spd', type: 'image', field: 'image', shape: 'token' });
  });

  it('reads a field by a former key', () => {
    const layout = layoutOf({ id: 'h', type: 'stat', field: 'hit_points', look: 'run-in' });
    expect(turned(turnInto(layout, 'h', 'track', fields).layout, 'h')).toMatchObject({ type: 'track', field: 'hit_points' });
  });

  it('moves between a Line and a Stat by the first field', () => {
    const line = layoutOf({ id: 'l', type: 'line', fields: ['speed', 'ac'] });
    expect(turned(turnInto(line, 'l', 'stat', fields).layout, 'l')).toStrictEqual({ id: 'l', type: 'stat', field: 'speed', look: 'run-in' });
    const stat = layoutOf({ id: 's', type: 'stat', field: 'ac', look: 'stacked' });
    expect(turned(turnInto(stat, 's', 'line', fields).layout, 's')).toStrictEqual({ id: 's', type: 'line', fields: ['ac'] });
  });

  it('turns a Heading into static text and static text into a Heading', () => {
    const heading = layoutOf({ id: 'h', type: 'heading', text: 'Lair', level: 'minor' });
    expect(turned(turnInto(heading, 'h', 'text', fields).layout, 'h')).toStrictEqual({ id: 'h', type: 'text', text: 'Lair' });
    const text = layoutOf({ id: 't', type: 'text', field: 'description', heading: 'About' });
    expect(turned(turnInto(text, 't', 'heading', fields).layout, 't')).toStrictEqual({ id: 't', type: 'heading', text: 'About', level: 'section' });
    expect(turned(turnInto(text, 't', 'entries', fields).layout, 't')).toStrictEqual({ id: 't', type: 'entries', field: '', heading: 'About' });
  });

  it('switches a Heading between typed and from a property, keeping its words and its size', () => {
    const typed = layoutOf({ id: 'h', type: 'heading', text: 'Speed', level: 'minor' });
    expect(turned(turnInto(typed, 'h', 'title', fields).layout, 'h')).toStrictEqual({ id: 'h', type: 'title', field: 'speed', level: 3 });
    const unnamed = layoutOf({ id: 'h', type: 'heading', text: 'Lair', level: 'section' });
    expect(turned(turnInto(unnamed, 'h', 'title', fields).layout, 'h')).toStrictEqual({ id: 'h', type: 'title', field: '', level: 2 });
    const bound = layoutOf({ id: 't', type: 'title', field: 'speed', level: 1 });
    expect(turned(turnInto(bound, 't', 'heading', fields).layout, 't')).toStrictEqual({ id: 't', type: 'heading', text: 'Speed', level: 'section' });
  });

  it('changes what a List\'s items are, keeping the words over them and leaving a property the new kind cannot show', () => {
    const entries = layoutOf({ id: 'l', type: 'entries', field: 'actions', heading: 'Actions', whenEmpty: 'hide' });
    expect(turned(turnInto(entries, 'l', 'tags', fields).layout, 'l')).toStrictEqual({ id: 'l', type: 'tags', field: '', look: 'comma', label: 'Actions', whenEmpty: 'hide' });
    const words = layoutOf({ id: 'w', type: 'tags', field: 'languages', look: 'chips', label: 'Tongues' });
    expect(turned(turnInto(words, 'w', 'spells', fields).layout, 'w')).toStrictEqual({ id: 'w', type: 'spells', field: '', heading: 'Tongues' });
    expect(turned(turnInto(words, 'w', 'pairs', fields).layout, 'w')).toStrictEqual({ id: 'w', type: 'pairs', field: '', label: 'Tongues' });
  });

  it('turns Sections and Rows into each other with their children', () => {
    const child: TemplateBlock = { id: 'c', type: 'divider' };
    const layout = layoutOf({ id: 's', type: 'section', heading: 'Gone', size: 'fill', blocks: [child] });
    const edit = turnInto(layout, 's', 'row', fields);
    expect(edit.layout.blocks[0]).toStrictEqual({ id: 's', type: 'row', size: 'fill', blocks: [child] });
    expect(turned(turnInto(edit.layout, 's', 'section', fields).layout, 's')).toStrictEqual({ id: 's', type: 'section', size: 'fill', blocks: [child] });
  });

  it('turns a script or an unknown block into an authorable one', () => {
    const layout = layoutOf({ id: 'js', type: 'script', summary: 'Stress track', fs: { code: 'x' }, fsExtras: { cls: 'a' } });
    expect(turned(turnInto(layout, 'js', 'track', fields).layout, 'js')).toStrictEqual({ id: 'js', type: 'track', field: '', look: 'boxes', counts: 'down' });
  });

  it.each([
    ['a leaf into a container', layoutOf({ id: 'b', type: 'divider' }), 'section', 'cannot-turn-into'],
    ['a container into a leaf', layoutOf({ id: 'b', type: 'section', blocks: [] }), 'stat', 'cannot-turn-into'],
    ['into a script', layoutOf({ id: 'b', type: 'divider' }), 'script', 'cannot-turn-into'],
    ['a Section holding a Row into a Row', layoutOf({ id: 'b', type: 'section', blocks: [{ id: 'r', type: 'row', blocks: [] }] }), 'row', 'not-allowed-here'],
    ['a Section inside a Row into a Row', layoutOf({ id: 'r', type: 'row', blocks: [{ id: 'b', type: 'section', blocks: [] }] }), 'row', 'not-allowed-here'],
    ['an unknown block', layoutOf({ id: 'x', type: 'divider' }), 'stat', 'block-not-found'],
  ] as const)('refuses %s', (_, layout, type, reason) => {
    const edit = turnInto(layout, 'b', type as 'stat', fields);
    expect(edit).toEqual({ ok: false, layout, reason });
  });

  it('returns the same layout for the type the block has', () => {
    const layout = layoutOf({ id: 'b', type: 'divider' });
    expect(turnInto(layout, 'b', 'divider', fields)).toEqual({ ok: true, layout, focus: 'b' });
  });
});
