// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, shape, template } from './editorKit';
import { mountEditor, tileOptions, typeAndLeave } from './sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(async () => {
  cleanup();
  // Radix's focus scope hands focus back in a timer once a Select's list unmounts: it runs while this test's window stands.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.restoreAllMocks();
});

const blockOf = (session: FakeSession, id: string): TemplateBlock | undefined => findBlock(session.template.layout.blocks, id)?.block;
const fieldOf = (session: FakeSession, key: string): TemplateField | undefined => session.template.fields.find((field) => field.key === key);

/** Picks an option of the Atlas Select named `name` inside `container`. */
function choose(container: HTMLElement, name: string, option: string): void {
  fireEvent.click(within(container).getByRole('combobox', { name }));
  fireEvent.click(within(container).getByRole('option', { name: option }));
}

const NAME: TemplateBlock = { id: 'title001', type: 'title', field: 'name', level: 1 };
const NAME_FIELD: TemplateField = { key: 'name', label: 'Name', type: 'text' };

describe('a Value tile\'s Options', () => {
  it('show only what the kind has: a number its unit, sign and where the label stands', () => {
    const { session, frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    const options = tileOptions();
    expect(within(options).getByRole('combobox', { name: 'Kind' }).textContent).toContain('Number');
    typeAndLeave(within(options).getByRole('textbox', { name: 'Unit' }), 'ft.');
    fireEvent.click(within(options).getByRole('radio', { name: '+3' }));
    fireEvent.click(within(options).getByRole('radio', { name: 'Above' }));
    expect(fieldOf(session, 'ac')).toMatchObject({ unit: 'ft.' });
    expect(blockOf(session, 'stat-ac1')).toMatchObject({ display: 'signed', look: 'stacked' });
    expect(within(options).queryByRole('textbox', { name: 'Choices' })).toBeNull();
  });

  it('turn a value into a choice with its list, several picks and a number with each', () => {
    const { session, frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    choose(tileOptions(), 'Kind', 'One of a list');
    expect(fieldOf(session, 'ac')).toMatchObject({ type: 'choice' });
    const options = tileOptions();
    typeAndLeave(within(options).getByRole('textbox', { name: 'Choices' }), 'Light, Heavy');
    fireEvent.click(within(options).getByRole('switch', { name: 'Pick several' }));
    fireEvent.click(within(options).getByRole('switch', { name: 'Each with a number' }));
    typeAndLeave(within(tileOptions()).getByRole('textbox', { name: 'Unit' }), 'ft.');
    expect(fieldOf(session, 'ac')).toMatchObject({ options: ['Light', 'Heavy'], several: true, numbered: true, unit: 'ft.' });
    expect(tileOptions().textContent).toContain('A statblock reads “Light 60 ft., Heavy 30 ft.”.');
  });

  it('turn a value into words, a block of its own, and back, in one step each', () => {
    const { session, frame } = mountEditor();
    fireEvent.click(frame('stat-hp1'));
    const steps = session.steps;
    choose(tileOptions(), 'Kind', 'Words');
    expect(blockOf(session, 'stat-hp1')).toMatchObject({ type: 'tags', field: 'hp' });
    expect(fieldOf(session, 'hp')).toMatchObject({ type: 'list' });
    choose(tileOptions(), 'Style', 'Chips');
    expect(blockOf(session, 'stat-hp1')).toMatchObject({ look: 'chips' });
    choose(tileOptions(), 'Kind', 'Text');
    expect(blockOf(session, 'stat-hp1')).toMatchObject({ type: 'stat', field: 'hp' });
    expect(session.steps).toBe(steps + 3);
  });

  it('close on Escape, keeping the tile selected', async () => {
    const { frame } = mountEditor();
    fireEvent.click(frame('stat-ac1'));
    const options = tileOptions();
    act(() => { fireEvent.keyDown(within(options).getByRole('combobox', { name: 'Kind' }), { key: 'Escape' }); });
    await waitFor(() => expect(document.querySelector('.atlas-te-options')).toBeNull());
    expect(screen.getByRole('toolbar', { name: 'Value toolbar' })).toBeTruthy();
  });
});

describe('an Abilities tile\'s Options', () => {
  const actions: TemplateField = { key: 'actions', label: 'Actions', type: 'entries' };
  const list: TemplateBlock = { id: 'actions1', type: 'entries', field: 'actions', heading: 'Actions' };

  it('add parts every ability has, from the common ones or typed', () => {
    const { session, frame } = mountEditor(new FakeSession(template([NAME, list], [NAME_FIELD, actions])));
    fireEvent.click(frame('actions1'));
    fireEvent.click(within(tileOptions()).getByRole('button', { name: '+ Range' }));
    typeAndLeave(within(tileOptions()).getByRole('textbox', { name: 'Each item also has' }), 'Recharge');
    expect(fieldOf(session, 'actions')?.entry?.extras?.map((extra) => extra.label)).toEqual(['Range', 'Recharge']);
    expect(within(tileOptions()).queryByRole('button', { name: '+ Range' })).toBeNull();
  });

  it('split the list into tabs, each with a list of its own, add one, and join back when one is left', () => {
    const { session, frame } = mountEditor(new FakeSession(template([NAME, list], [NAME_FIELD, actions])));
    fireEvent.click(frame('actions1'));
    fireEvent.click(within(tileOptions()).getByRole('button', { name: 'Split into tabs' }));
    const tabs = session.template.layout.blocks[1];
    expect(tabs).toMatchObject({ type: 'tabs', heading: 'Actions' });
    expect(frame(tabs!.id).querySelector('.atlas-sb-section-heading')?.textContent).toBe('Actions');
    expect(session.template.fields.map((field) => field.key)).toEqual(['name', 'actions', 'tab_2']);
    expect(fieldOf(session, 'tab_2')).toMatchObject({ label: 'Tab 2', type: 'entries' });

    fireEvent.click(frame(tabs!.id));
    fireEvent.click(within(tileOptions()).getByRole('button', { name: 'Add tab' }));
    expect(session.template.layout.blocks[1]?.type === 'tabs' && session.template.layout.blocks[1].blocks).toHaveLength(3);
    const names = within(tileOptions()).getAllByRole('textbox', { name: 'Tab name' });
    expect(names.map((input) => (input as HTMLInputElement).value)).toEqual(['Tab 1', 'Tab 2', 'Tab 3']);
    typeAndLeave(names[0]!, 'Cantrips');
    expect(within(tileOptions()).getAllByRole('textbox', { name: 'Tab name' })[0]).toHaveProperty('value', 'Cantrips');

    fireEvent.click(within(tileOptions()).getByRole('button', { name: 'Remove Tab 3' }));
    fireEvent.click(within(tileOptions()).getByRole('button', { name: 'Remove Tab 2' }));
    expect(session.template.layout.blocks[1]).toMatchObject({ type: 'entries', field: 'actions', heading: 'Actions' });
  });

  it('give a part that is one of a list its options and Pick several, and take them away with the type', () => {
    const { session, frame } = mountEditor(new FakeSession(template([NAME, list], [NAME_FIELD, actions])));
    fireEvent.click(frame('actions1'));
    fireEvent.click(within(tileOptions()).getByRole('button', { name: '+ Range' }));
    expect(within(tileOptions()).queryByRole('textbox', { name: 'Choices' })).toBeNull();
    fireEvent.click(within(tileOptions()).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(tileOptions()).getByRole('button', { name: '+ Type' }));
    expect(fieldOf(session, 'actions')?.entry?.extras).toEqual([{ key: 'type', label: 'Type', type: 'choice' }]);
    choose(tileOptions(), 'Type of Type', 'Text');
    expect(within(tileOptions()).queryByRole('textbox', { name: 'Choices' })).toBeNull();
    const steps = session.steps;
    choose(tileOptions(), 'Type of Type', 'One of a list');
    const choices = within(tileOptions()).getByRole('textbox', { name: 'Choices' });
    expect(choices.getAttribute('placeholder')).toBe('Main action, Reaction, Passive');
    typeAndLeave(choices, 'Main', 'Main action, Reaction', 'Main action, Reaction, Passive');
    fireEvent.click(within(tileOptions()).getByRole('switch', { name: 'Pick several' }));
    expect(fieldOf(session, 'actions')?.entry?.extras).toEqual([
      { key: 'type', label: 'Type', type: 'choice', options: ['Main action', 'Reaction', 'Passive'], several: true },
    ]);
    expect(session.steps).toBe(steps + 3);

    choose(tileOptions(), 'Type of Type', 'Text');
    expect(fieldOf(session, 'actions')?.entry?.extras).toEqual([{ key: 'type', label: 'Type', type: 'text' }]);
    expect(within(tileOptions()).queryByRole('switch', { name: 'Pick several' })).toBeNull();
  });

  it('edit the parts of every tab\'s list at once, in one step', () => {
    const level1: TemplateField = { key: 'level_1', label: 'Level 1', type: 'entries' };
    const tabs: TemplateBlock = { id: 'tabs0001', type: 'tabs', heading: 'Spellbook', blocks: [
      { id: 'tab00001', type: 'section', heading: 'Cantrips', blocks: [{ id: 'actions1', type: 'entries', field: 'actions' }] },
      { id: 'tab00002', type: 'section', heading: 'Level 1', blocks: [{ id: 'level101', type: 'entries', field: 'level_1' }] },
    ] };
    const { session, frame } = mountEditor(new FakeSession(template([NAME, tabs], [NAME_FIELD, actions, level1])));
    fireEvent.click(frame('tabs0001'));
    const steps = session.steps;
    fireEvent.click(within(tileOptions()).getByRole('button', { name: '+ Range' }));
    expect(session.steps).toBe(steps + 1);
    choose(tileOptions(), 'Type of Range', 'Number');
    for (const key of ['actions', 'level_1']) expect(fieldOf(session, key)?.entry?.extras).toEqual([{ key: 'range', label: 'Range', type: 'number' }]);
    fireEvent.click(within(tileOptions()).getByRole('button', { name: 'Remove' }));
    for (const key of ['actions', 'level_1']) expect(fieldOf(session, key)).not.toHaveProperty('entry');
  });

  it('keep the name of a list split into tabs above the strip, renamed with a double click', () => {
    const { session, frame } = mountEditor(new FakeSession(template([NAME, list], [NAME_FIELD, actions])));
    fireEvent.click(frame('actions1'));
    fireEvent.click(within(tileOptions()).getByRole('button', { name: 'Split into tabs' }));
    const id = session.template.layout.blocks[1]!.id;
    fireEvent.doubleClick(frame(id).querySelector('.atlas-sb-section-heading')!);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    expect(input.value).toBe('Actions');
    fireEvent.change(input, { target: { value: 'Spellbook' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(session.template.layout.blocks[1]).toMatchObject({ type: 'tabs', heading: 'Spellbook', blocks: [{ heading: 'Tab 1' }, { heading: 'Tab 2' }] });
    expect(frame(id).querySelector('.atlas-sb-section-heading')?.textContent).toBe('Spellbook');
  });

  it('have no tabs for a list that stands beside another', () => {
    const row: TemplateBlock = { id: 'row00001', type: 'row', blocks: [list, { id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' }] };
    const { frame } = mountEditor(new FakeSession(template([NAME, row], [NAME_FIELD, actions, { key: 'ac', label: 'AC', type: 'number' }])));
    fireEvent.click(frame('actions1'));
    expect(within(tileOptions()).getByRole('button', { name: 'Split into tabs' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('a Table tile\'s Options', () => {
  it('hold its name, its header row, what statblocks may change and whether numbers show their sign; its cells are typed on the card', () => {
    const scores: TemplateBlock = { id: 'scores01', type: 'scores', field: 'stats', orientation: 'row' };
    const { session, frame } = mountEditor(new FakeSession(template([NAME, scores], [NAME_FIELD, { key: 'stats', label: 'Stats', type: 'scores', slots: ['A'] }])));
    fireEvent.click(frame('scores01'));
    const options = tileOptions();
    typeAndLeave(within(options).getByRole('textbox', { name: 'Name' }), 'Abilities');
    expect(fieldOf(session, 'stats')).toMatchObject({ key: 'stats', label: 'Abilities' });
    const toggle = (name: string): void => { fireEvent.click(within(tileOptions()).getByRole('switch', { name })); };
    expect(within(options).getByRole('switch', { name: 'Header row' }).getAttribute('aria-checked')).toBe('true');
    toggle('Header row');
    expect(fieldOf(session, 'stats')).toMatchObject({ header: false });
    expect(within(options).getByRole('switch', { name: 'Statblocks can add and remove rows' }).getAttribute('aria-checked')).toBe('true');
    toggle('Statblocks can add and remove rows');
    toggle('Statblocks can add and remove columns');
    expect(fieldOf(session, 'stats')).toMatchObject({ addRows: false, addColumns: false });
    toggle('Statblocks can add and remove rows');
    expect(fieldOf(session, 'stats')).not.toHaveProperty('addRows');
    fireEvent.click(within(tileOptions()).getByRole('radio', { name: '+3' }));
    expect(blockOf(session, 'scores01')).toMatchObject({ display: 'signed' });
    expect(fieldOf(session, 'stats')).toMatchObject({ slots: ['A'] });
  });
});

describe('Kind of value on the toolbar', () => {
  it('turns a value into a choice and opens its Options at the choices, then takes several with a number each', async () => {
    const { session, frame } = mountEditor(new FakeSession(sampleTemplate()), { menus: true });
    fireEvent.click(frame('stat-ac1'));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Kind of value: Number' })); });
    act(() => { fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'One of a list' })); });
    expect(fieldOf(session, 'ac')).toMatchObject({ type: 'choice' });
    await waitFor(() => expect(document.activeElement).toBe(within(tileOptions()).getByRole('textbox', { name: 'Choices' })));
    typeAndLeave(within(tileOptions()).getByRole('textbox', { name: 'Choices' }), 'darkvision, blindsight');

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Kind of value: One of a list' })); });
    act(() => { fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Pick several' })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Kind of value: One of a list' })); });
    act(() => { fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Each with a number' })); });
    expect(fieldOf(session, 'ac')).toMatchObject({ options: ['darkvision', 'blindsight'], several: true, numbered: true });
  });

  it('is offered on Values only, never on the Name', () => {
    const { frame } = mountEditor(new FakeSession(sampleTemplate()), { menus: true });
    fireEvent.click(frame('title001'));
    expect(document.querySelector('.atlas-te-toolbar')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^Kind of value/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Options' })).toBeNull();
    fireEvent.click(frame('divider1'));
    expect(screen.queryByRole('button', { name: /^Kind of value/ })).toBeNull();
  });
});

describe('a line of values', () => {
  it('lists its values in its Options', () => {
    const line: TemplateBlock = { id: 'line0001', type: 'line', fields: ['size'] };
    const fields: TemplateField[] = [NAME_FIELD, { key: 'size', label: 'Size', type: 'text' }];
    const { session, frame } = mountEditor(new FakeSession(template([line], fields)));
    fireEvent.click(frame('line0001'));
    expect(within(tileOptions()).getByRole('combobox')).toHaveProperty('value', 'Size');
    expect(shape(session.template.layout.blocks)).toBe('line0001');
  });
});
