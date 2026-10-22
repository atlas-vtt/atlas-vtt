// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { BUILT_IN_LINE, GESTURE_HINT } from '../../../../src/app/statblocks/editor/template-editor/shell/TemplateFooterLine';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, shape, template } from './editorKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom lays nothing out; the label input measures the label's text with a range.
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const host: TemplateEditorHost = { save: vi.fn(async () => null), close: vi.fn() };

function setup(session = new FakeSession(sampleTemplate())): { session: FakeSession; frame: (id: string) => HTMLElement } {
  render(
    <TooltipProvider>
      <TemplateEditor session={session} host={host} collectionId={null} />
    </TooltipProvider>,
  );
  const frame = (id: string): HTMLElement => {
    const element = document.querySelector<HTMLElement>(`.atlas-te-stage [data-block-id="${id}"]`);
    if (!element) throw new Error(`no frame ${id}`);
    return element;
  };
  return { session, frame };
}

const key = (target: Element, name: string, init: KeyboardEventInit = {}): void => {
  fireEvent.keyDown(target, { key: name, ...init });
};

describe('TemplateEditor', () => {
  it('selects the tile on click, the tile around what it hit, and adds siblings with Shift', () => {
    const header: TemplateBlock = { id: 'header01', type: 'row', blocks: [
      { id: 'headsec1', type: 'section', blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }] },
      { id: 'image001', type: 'image', field: 'image', shape: 'token' },
    ] };
    const stress: TemplateBlock = { id: 'stress01', type: 'section', heading: 'Stress', blocks: [{ id: 'scores01', type: 'scores', field: 'stress', orientation: 'row' }] };
    const { frame: inner } = setup(new FakeSession(template([header, stress], [{ key: 'name', label: 'Name', type: 'text' }, { key: 'stress', label: 'Stress', type: 'scores', slots: ['1'] }])));
    fireEvent.click(inner('scores01'));
    expect(inner('stress01').getAttribute('data-te-selected')).toBe('primary');
    expect(inner('scores01').hasAttribute('data-te-selected')).toBe(false);
    cleanup();

    const { frame } = setup();
    fireEvent.click(frame('stat-ac1'));
    expect(frame('stat-ac1').getAttribute('data-te-selected')).toBe('primary');
    fireEvent.click(frame('stat-hp1'), { shiftKey: true });
    expect(frame('stat-ac1').getAttribute('data-te-selected')).toBe('sibling');
    expect(frame('stat-hp1').getAttribute('data-te-selected')).toBe('primary');
  });

  it('walks tiles with the arrows, along a row too, and selects nothing with Escape', () => {
    const { frame } = setup();
    fireEvent.click(frame('stat-hp1'));
    act(() => frame('stat-hp1').focus());
    key(frame('stat-hp1'), 'ArrowDown');
    expect(frame('stat-sp1').getAttribute('data-te-selected')).toBe('primary');
    key(frame('stat-sp1'), 'ArrowRight');
    expect(frame('stat-cr1').getAttribute('data-te-selected')).toBe('primary');
    expect(document.activeElement).toBe(frame('stat-cr1'));
    key(frame('stat-cr1'), 'Escape');
    expect(document.querySelector('[data-te-selected]')).toBeNull();
  });

  it('deletes with the key, says so, and offers Undo in a toast', async () => {
    const { session, frame } = setup();
    fireEvent.click(frame('stat-ac1'));
    act(() => frame('stat-ac1').focus());
    key(frame('stat-ac1'), 'Delete');
    expect(findBlock(session.template.layout.blocks, 'stat-ac1')).toBeNull();
    expect(document.querySelector('.atlas-te-live')?.textContent).toMatch(/^Deleted Armor class\. Press Ctrl\+Z to undo\./);
    expect(frame('stat-hp1').getAttribute('data-te-selected')).toBe('primary');
    fireEvent.click(within(screen.getByText('Deleted Armor class.').parentElement!).getByRole('button', { name: 'Undo' }));
    expect(shape(session.template.layout.blocks)).toBe(shape(sampleTemplate().layout.blocks));
    await waitFor(() => expect(screen.queryByText('Deleted Armor class.')).toBeNull());
  });

  it('undoes the template with Mod+Z on a block, and leaves Mod+Z to a focused input', () => {
    const { session, frame } = setup();
    fireEvent.click(frame('stat-ac1'));
    act(() => frame('stat-ac1').focus());
    key(frame('stat-ac1'), 'd', { ctrlKey: true, code: 'KeyD' });
    expect(session.steps).toBe(1);
    key(document.activeElement ?? document.body, 'z', { ctrlKey: true, code: 'KeyZ' });
    expect(session.getSnapshot().canUndo).toBe(false);

    fireEvent.doubleClick(frame('stat-hp1'));
    const input = screen.getByRole('textbox', { name: 'Label' });
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(session.getSnapshot().canRedo).toBe(true);
  });

  it('edits a label in place: Enter commits, Escape reverts', () => {
    const { session, frame } = setup();
    fireEvent.doubleClick(frame('stat-ac1'));
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    expect(input.value).toBe('Armor class');
    fireEvent.change(input, { target: { value: 'Armour' } });
    key(input, 'Enter');
    expect(session.template.fields.find((field) => field.key === 'ac')?.label).toBe('Armour');
    expect(screen.queryByRole('textbox', { name: 'Label' })).toBeNull();

    fireEvent.doubleClick(frame('stat-hp1'));
    const again = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    fireEvent.change(again, { target: { value: 'Nope' } });
    key(again, 'Escape');
    expect(session.template.fields.find((field) => field.key === 'hp')?.label).toBe('Hit points');
    expect(session.steps).toBe(1);
  });

  it('moves on to the next label with Tab, committing the first', () => {
    const { session, frame } = setup();
    fireEvent.doubleClick(frame('stat-ac1'));
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' });
    fireEvent.change(input, { target: { value: 'AC' } });
    key(input, 'Tab');
    expect(session.template.fields.find((field) => field.key === 'ac')?.label).toBe('AC');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Label' }).value).toBe('Hit points');
  });

  it('opens the insert menu with /, inserts on Enter, selects the new block, and asks for its name', async () => {
    const { session, frame } = setup();
    fireEvent.click(frame('divider1'));
    act(() => frame('divider1').focus());
    key(frame('divider1'), '/');
    const search = screen.getByRole('combobox', { name: 'Find a kind' });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Value', 'Metric', 'Abilities', 'Table', 'Counters', 'Text', 'Divider']);
    fireEvent.change(search, { target: { value: 'value' } });
    expect(screen.getByRole('option', { selected: true }).textContent).toBe('Value');
    key(search, 'Enter');
    const added = session.template.layout.blocks.at(-1);
    expect(added?.type).toBe('stat');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add' })).toBeNull());
    expect(frame(added!.id).getAttribute('data-te-selected')).toBe('primary');
    // The label itself never opens (spec §6.1): the name is asked for in a popover under the tile.
    expect(screen.queryByRole('textbox', { name: 'Label' })).toBeNull();
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name component' });
    await waitFor(() => expect(document.activeElement).toBe(name));
    fireEvent.change(name, { target: { value: 'Initiative' } });
    key(name, 'Enter');
    expect(session.template.layout.blocks.at(-1)).toMatchObject({ type: 'stat', field: 'initiative' });
    expect(session.template.fields.at(-1)).toEqual({ key: 'initiative', label: 'Initiative', type: 'text' });
    // Placing and naming are one step.
    expect(session.steps).toBe(1);
    expect(document.querySelector('.atlas-te-live')?.textContent).toBe('Made a new property for it.');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Name' })).toBeNull());
    expect(document.activeElement?.getAttribute('data-block-id')).toBe(added?.id);
  });

  it('takes a block just inserted away again on Escape, focus back on the tile the menu opened from', async () => {
    const { session, frame } = setup();
    const before = session.template;
    fireEvent.click(frame('divider1'));
    act(() => frame('divider1').focus());
    key(frame('divider1'), '/');
    const search = screen.getByRole('combobox', { name: 'Find a kind' });
    fireEvent.change(search, { target: { value: 'abilities' } });
    key(search, 'Enter');
    expect(session.template.layout.blocks.at(-1)?.type).toBe('entries');
    key(screen.getByRole('textbox', { name: 'Name component' }), 'Escape');
    await waitFor(() => expect(document.activeElement).toBe(frame('divider1')));
    expect(session.template).toBe(before);
    expect(session.steps).toBe(0);
  });

  it('closes the insert menu with Escape, inserting nothing', async () => {
    const { session, frame } = setup();
    fireEvent.click(frame('title001'));
    act(() => frame('title001').focus());
    key(frame('title001'), '/');
    key(screen.getByRole('combobox', { name: 'Find a kind' }), 'Escape');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add' })).toBeNull());
    expect(document.activeElement).toBe(frame('title001'));
    expect(session.steps).toBe(0);
  });

  it('acts from the tile\'s toolbar: its kind\'s name, Kind of value and Options on a Value, Add below, Delete and More', () => {
    const { session, frame } = setup();
    fireEvent.click(frame('stat-ac1'));
    const toolbar = screen.getByRole('toolbar', { name: 'Value toolbar' });
    expect(within(toolbar).getAllByRole('button').map((button) => button.textContent)).toEqual(['Kind of value: Number', 'Options', 'Add below', 'Delete', 'More']);
    fireEvent.click(within(toolbar).getByText('Delete').closest('button')!);
    expect(shape(session.template.layout.blocks)).toBe('title001 stat-hp1 row00001(stat-sp1 stat-cr1) divider1');
    expect(session.steps).toBe(1);
  });

  it('gives a part of the header a toolbar of its own name: Rename, Hide from card where it may hide, and More', () => {
    const { session, frame } = setup();
    fireEvent.click(frame('header-name'));
    const name = screen.getByRole('toolbar', { name: 'Name toolbar' });
    expect(within(name).getAllByRole('button').map((button) => button.textContent)).toEqual(['Rename', 'More']);
    fireEvent.click(frame('header-hp'));
    const hp = screen.getByRole('toolbar', { name: 'Hit points toolbar' });
    expect(within(hp).getAllByRole('button').map((button) => button.textContent)).toEqual(['Rename', 'Hide from card', 'More']);
    fireEvent.click(within(hp).getByText('Hide from card').closest('button')!);
    expect(session.template.header).toEqual({ hidden: ['hp'] });
    expect(document.querySelector('.atlas-te-stage [data-block-id="header-hp"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hit points' }));
    expect(session.template.header).toBeUndefined();
    expect(session.steps).toBe(2);
  });

  it('renames a part of the header in place, keeping its key, and never deletes or moves one', () => {
    const { session, frame } = setup();
    fireEvent.click(frame('header-hp'));
    act(() => frame('header-hp').focus());
    key(frame('header-hp'), 'Delete');
    key(frame('header-hp'), 'ArrowUp', { altKey: true });
    expect(session.steps).toBe(0);
    fireEvent.doubleClick(frame('header-hp'));
    const input = screen.getByRole('textbox', { name: 'Label' });
    expect((input as HTMLInputElement).value).toBe('Hit points');
    fireEvent.change(input, { target: { value: 'Vigour' } });
    key(input, 'Enter');
    expect(session.template.fields.find((field) => field.key === 'hp')?.label).toBe('Vigour');
    expect(session.steps).toBe(1);
  });

  it('says under the card how to work it, and fills a blank template from its ghost rows', () => {
    const session = new FakeSession(template([]));
    setup(session);
    expect(screen.getByText(GESTURE_HINT)).toBeTruthy();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(expect.arrayContaining(['A value', 'Abilities', 'A table', 'Text']));
    expect(screen.queryByText('Start like…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abilities' }));
    expect(session.template.layout.blocks[0]?.type).toBe('entries');
  });

  it('edits a built-in like any template, saying that Save keeps the changes as a new template', () => {
    const session = new FakeSession(sampleTemplate(), { path: null, name: '5E (2014 rules)', builtIn: true });
    const { frame } = setup(session);
    expect(screen.getByText(BUILT_IN_LINE)).toBeTruthy();
    fireEvent.click(frame('stat-ac1'));
    act(() => frame('stat-ac1').focus());
    key(frame('stat-ac1'), 'Delete');
    expect(session.steps).toBe(1);
  });

  it('says why a save failed above the card', () => {
    const session = new FakeSession(sampleTemplate());
    setup(session);
    expect(screen.queryByText('Saving…')).toBeNull();
    act(() => session.patch({ saveState: 'error', saveProblem: 'Couldn\'t save: disk full.' }));
    expect(screen.getByText('Couldn\'t save: disk full.')).toBeTruthy();
  });

  it('offers the choices of a conflict', () => {
    const session = new FakeSession(sampleTemplate(), { conflict: 'changed', saveState: 'conflict' });
    setup(session);
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(session.resolutions).toEqual(['keep-mine']);
  });
});
