// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fieldChoiceGroups, newFieldKey, withChosenField } from '../../../../src/app/statblocks/editor/template-editor/inspector/fieldChoices';
import { LineFields } from '../../../../src/app/statblocks/editor/template-editor/inspector/LineFields';
import { useTemplateEditor } from '../../../../src/app/statblocks/editor/template-editor/editorContext';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, template } from './editorKit';
import { key, renderInEditor } from './sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const USED = new Map([['speed', 41], ['senses', 12], ['ac', 30], ['languages', 7]]);

describe('the field picker\'s choices', () => {
  const base = sampleTemplate();

  it('offers this template\'s fields of the types the place takes, the collection\'s other keys, and a new field', () => {
    const groups = fieldChoiceGroups(base, '', ['number'], USED, true);
    expect(groups.map((group) => group.label)).toEqual(['This template', 'Used in this collection']);
    expect(groups[0]?.choices.map((choice) => choice.key)).toEqual(['ac', 'hp']);
    // `speed` and `ac` are the template's already; the most used first.
    expect(groups[1]?.choices.map((choice) => choice.key)).toEqual(['senses', 'languages']);
    const typed = fieldChoiceGroups(base, 'Swim speed', null, USED, true);
    expect(typed.map((group) => group.id)).toEqual(['new']);
    expect(typed[0]?.choices[0]).toEqual({ kind: 'new', key: 'swim_speed', label: 'Swim speed' });
  });

  it('finds by label or key, and offers no new field for a label the template has', () => {
    // A new field named "armor" would take the conventional `ac`, which is taken.
    expect(fieldChoiceGroups(base, 'armor', null, USED, true).flatMap((group) => group.choices).map((choice) => choice.key)).toEqual(['ac', 'ac_2']);
    expect(fieldChoiceGroups(base, 'hit points', null, USED, true).map((group) => group.id)).toEqual(['template']);
    expect(fieldChoiceGroups(base, 'sen', null, USED, false).map((group) => group.id)).toEqual([]);
  });

  it('gives a new field the collection\'s key where its label names one', () => {
    expect(newFieldKey(base, 'Senses', USED)).toBe('senses');
    expect(newFieldKey(template([], [{ key: 'senses', label: 'Senses', type: 'text' }]), 'Senses', USED)).toBe('senses_2');
    expect(newFieldKey(base, 'Armor Class', USED)).toBe('ac_2');
  });

  it('adds the field a choice names, once', () => {
    const chosen = withChosenField(base, { kind: 'collection', key: 'senses', label: 'Senses', count: 12 }, 'text');
    expect(chosen?.key).toBe('senses');
    expect(chosen?.template.fields.at(-1)).toEqual({ key: 'senses', label: 'Senses', type: 'text' });
    expect(withChosenField(base, { kind: 'collection', key: 'speed', label: 'Speed', count: 41 }, 'text')).toEqual({ template: base, key: 'speed' });
    expect(withChosenField(base, { kind: 'field', key: 'ac', label: 'Armor class', type: 'number' }, 'text')?.template).toBe(base);
    expect(withChosenField(base, { kind: 'new', key: 'tags', label: 'Tags' }, 'text')).toBeNull();
  });
});

/** The sample with an empty line under the name, whose values the picker chooses. */
function withLine(fields: string[] = []): StatblockTemplate {
  const base = sampleTemplate();
  return { ...base, layout: { ...base.layout, blocks: [base.layout.blocks[0]!, { id: 'line0001', type: 'line', fields }, ...base.layout.blocks.slice(1)] } };
}

function mountLine(session: FakeSession): void {
  function Content(): React.JSX.Element | null {
    const current = useTemplateEditor().snapshot.template;
    const block = findBlock(current.layout.blocks, 'line0001')?.block;
    return block?.type === 'line' ? <LineFields block={block} template={current} session={session} readOnly={false} parent={null} /> : null;
  }
  renderInEditor(session, <Content />, { collectionKeys: USED });
}

describe('the property picker of the line under the name', () => {
  it('opens its three groups and adds a key the collection uses, in one step', () => {
    const session = new FakeSession(withLine());
    mountLine(session);
    const picker = screen.getByRole('combobox', { name: 'Values in this line Value 1' });
    fireEvent.change(picker, { target: { value: 's' } });
    const list = screen.getByRole('listbox', { name: 'Properties' });
    expect(within(list).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['This template', 'Used in this collection', 'New property']);
    expect(within(list).getByText('Speed', { selector: '.atlas-te-choices__label' }).closest('[role="group"]')?.getAttribute('aria-label')).toBe('This template');
    expect(within(list).getByText('Senses', { selector: '.atlas-te-choices__label' }).closest('[role="group"]')?.getAttribute('aria-label')).toBe('Used in this collection');
    fireEvent.change(picker, { target: { value: 'sen' } });
    key(picker, 'Enter');
    expect(findBlock(session.template.layout.blocks, 'line0001')?.block).toMatchObject({ fields: ['senses'] });
    expect(session.template.fields.at(-1)).toEqual({ key: 'senses', label: 'Senses', type: 'text' });
    expect(session.steps).toBe(1);
  });

  it('makes a new property as typed', () => {
    const session = new FakeSession(withLine());
    mountLine(session);
    fireEvent.change(screen.getByRole('combobox', { name: 'Values in this line Value 1' }), { target: { value: 'Swim speed' } });
    fireEvent.click(screen.getByText('New property “Swim speed”'));
    expect(findBlock(session.template.layout.blocks, 'line0001')?.block).toMatchObject({ fields: ['swim_speed'] });
    expect(session.template.fields.at(-1)).toEqual({ key: 'swim_speed', label: 'Swim speed', type: 'text' });
  });

  it('closes with Escape and shows the chosen property again', () => {
    const session = new FakeSession(withLine(['ac']));
    mountLine(session);
    const picker = screen.getByRole<HTMLInputElement>('combobox', { name: 'Values in this line Value 1' });
    expect(picker.value).toBe('Armor class');
    key(picker, 'ArrowDown');
    expect(screen.getByRole('listbox', { name: 'Properties' })).toBeTruthy();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { picker.dispatchEvent(escape); });
    expect(escape.defaultPrevented).toBe(true);
    expect(screen.queryByRole('listbox', { name: 'Properties' })).toBeNull();
    expect(picker.value).toBe('Armor class');
    expect(session.steps).toBe(0);
  });
});
