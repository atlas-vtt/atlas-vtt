// @vitest-environment jsdom
import React from 'react';
import { Platform } from 'obsidian';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, template } from './editorKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const host: TemplateEditorHost = { save: vi.fn(async () => null), close: vi.fn() };

function setup(session = new FakeSession(sampleTemplate())): FakeSession {
  render(
    <TooltipProvider>
      <TemplateEditor session={session} host={host} collectionId={null} />
    </TooltipProvider>,
  );
  return session;
}

const frame = (id: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`.atlas-te-stage [data-block-id="${id}"]`);
  if (!element) throw new Error(`no frame ${id}`);
  return element;
};

const key = (target: Element, name: string, init: KeyboardEventInit = {}): void => {
  fireEvent.keyDown(target, { key: name, ...init });
};

/** A click on one of the dock's kinds, as `Add value`. */
function addFromDock(type: string): void {
  const button = document.querySelector<HTMLButtonElement>(`.atlas-te-dock [data-item="block:${type}"] button`);
  if (!button) throw new Error(`no dock button for ${type}`);
  fireEvent.click(button);
}

const nameDialog = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'Name' });
const lastBlock = (session: FakeSession): TemplateBlock => session.template.layout.blocks.at(-1)!;

describe('the name a tile just placed asks for', () => {
  it('asks for a value\'s name from the dock, names it with Tab as its label would, placing and naming in one step', async () => {
    const session = setup();
    const before = session.template;
    fireEvent.click(frame('divider1'));
    addFromDock('stat');
    const added = lastBlock(session);
    expect(added).toMatchObject({ type: 'stat', field: '' });
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name component' });
    expect(input.placeholder).toBe('Name component');
    expect(input.value).toBe('');
    await waitFor(() => expect(document.activeElement).toBe(input));
    // The toolbar steps aside while the name is asked for.
    expect(screen.queryByRole('toolbar', { name: 'Value toolbar' })).toBeNull();
    expect(session.steps).toBe(0);

    fireEvent.change(input, { target: { value: 'Speed bonus' } });
    key(input, 'Tab');
    expect(lastBlock(session)).toMatchObject({ id: added.id, type: 'stat', field: 'speed_bonus' });
    expect(session.template.fields.at(-1)).toEqual({ key: 'speed_bonus', label: 'Speed bonus', type: 'text' });
    expect(session.steps).toBe(1);
    await waitFor(() => expect(nameDialog()).toBeNull());
    expect(document.activeElement).toBe(frame(added.id));
    expect(screen.getByRole('toolbar', { name: 'Value toolbar' })).toBeTruthy();

    act(() => session.undo());
    expect(session.template).toBe(before);
    expect(nameDialog()).toBeNull();
    act(() => session.redo());
    expect(lastBlock(session)).toMatchObject({ id: added.id, field: 'speed_bonus' });
    expect(nameDialog()).toBeNull();
  });

  it('asks every kind the same way, and a Metric names its one number', () => {
    const session = setup();
    addFromDock('metric');
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name component' });
    fireEvent.change(input, { target: { value: 'Major' } });
    key(input, 'Enter');
    expect(lastBlock(session)).toMatchObject({ type: 'metric', fields: ['major'] });
    expect(session.template.fields.at(-1)).toEqual({ key: 'major', label: 'Major', type: 'number' });
  });

  it('names a table, a list of abilities and a text as their labels would', () => {
    const session = setup();
    addFromDock('scores');
    let input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name component' });
    fireEvent.change(input, { target: { value: 'Stress' } });
    key(input, 'Enter');
    expect(lastBlock(session)).toMatchObject({ type: 'scores', field: 'stress' });
    expect(session.template.fields.at(-1)).toMatchObject({ key: 'stress', label: 'Stress', type: 'scores' });

    addFromDock('entries');
    input = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Name component' }).at(-1)!;
    fireEvent.change(input, { target: { value: 'Actions' } });
    key(input, 'Enter');
    expect(lastBlock(session)).toMatchObject({ type: 'entries', field: 'actions', heading: 'Actions' });

    addFromDock('text');
    input = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Name component' }).at(-1)!;
    fireEvent.change(input, { target: { value: 'Lore' } });
    key(input, 'Enter');
    expect(lastBlock(session)).toMatchObject({ type: 'text', field: 'lore', heading: 'Lore' });
  });

  it('asks nothing of a divider, which has no name', () => {
    const session = setup();
    addFromDock('divider');
    expect(lastBlock(session).type).toBe('divider');
    expect(nameDialog()).toBeNull();
  });

  it('takes the tile away on Escape, with no step, focus back on the tile the insert came from', async () => {
    const session = setup();
    const before = session.template;
    fireEvent.click(frame('stat-ac1'));
    await waitFor(() => expect(document.activeElement).toBe(frame('stat-ac1')));
    addFromDock('stat');
    const added = session.template.layout.blocks[2]!;
    expect(added).toMatchObject({ type: 'stat', field: '' });
    key(screen.getByRole('textbox', { name: 'Name component' }), 'Escape');
    await waitFor(() => expect(nameDialog()).toBeNull());
    expect(findBlock(session.template.layout.blocks, added.id)).toBeNull();
    expect(session.template).toBe(before);
    expect(session.steps).toBe(0);
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(document.activeElement).toBe(frame('stat-ac1'));
    expect(frame('stat-ac1').getAttribute('data-te-selected')).toBe('primary');
  });

  it('takes the tile away on Enter with no name, or only spaces, and on Mod+Z before anything is typed', async () => {
    const session = setup();
    const before = session.template;
    for (const answer of ['', '   ']) {
      addFromDock('scores');
      const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name component' });
      fireEvent.change(input, { target: { value: answer } });
      key(input, 'Enter');
      await waitFor(() => expect(nameDialog()).toBeNull());
      expect(session.template).toBe(before);
    }
    addFromDock('entries');
    key(screen.getByRole('textbox', { name: 'Name component' }), 'z', { ctrlKey: true });
    await waitFor(() => expect(nameDialog()).toBeNull());
    expect(session.template).toBe(before);
    expect(session.steps).toBe(0);
  });

  it('takes the tile away on a press elsewhere, which goes on to do what it does there', async () => {
    const session = setup();
    const before = session.template;
    addFromDock('stat');
    const added = lastBlock(session);
    expect(nameDialog()).toBeTruthy();
    fireEvent.pointerDown(frame('stat-ac1'));
    fireEvent.click(frame('stat-ac1'));
    await waitFor(() => expect(nameDialog()).toBeNull());
    expect(findBlock(session.template.layout.blocks, added.id)).toBeNull();
    expect(session.template).toBe(before);
    expect(frame('stat-ac1').getAttribute('data-te-selected')).toBe('primary');
    expect(session.steps).toBe(0);
  });

  it('keeps asking when the tile itself is pressed', () => {
    const session = setup();
    addFromDock('scores');
    const added = lastBlock(session);
    fireEvent.pointerDown(frame(added.id));
    fireEvent.mouseDown(frame(added.id));
    fireEvent.click(frame(added.id));
    expect(nameDialog()).toBeTruthy();
    expect(findBlock(session.template.layout.blocks, added.id)).not.toBeNull();
  });

  it('takes the tile away with the dock\'s Undo, undoing nothing before it', async () => {
    const session = setup();
    act(() => session.apply((now) => ({ ...now, layout: { ...now.layout, maxColumns: 2 } })));
    const before = session.template;
    addFromDock('metric');
    const undo = screen.getByRole('button', { name: 'Undo' });
    fireEvent.pointerDown(undo);
    expect(nameDialog()).toBeTruthy();
    fireEvent.click(undo);
    await waitFor(() => expect(nameDialog()).toBeNull());
    expect(session.template).toBe(before);
    expect(session.steps).toBe(1);
  });

  it('takes the tile away before the template is saved with Mod+S, so no unnamed tile is ever written', async () => {
    const session = setup();
    const before = session.template;
    addFromDock('stat');
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name component' });
    key(input, 's', { code: 'KeyS', ctrlKey: !Platform.isMacOS, metaKey: Platform.isMacOS });
    await waitFor(() => expect(nameDialog()).toBeNull());
    expect(session.template).toBe(before);
  });

  it('takes the tile away when the editor closes while it asks', () => {
    const session = setup();
    const before = session.template;
    addFromDock('text');
    cleanup();
    expect(session.template).toBe(before);
    expect(session.gestureOpen).toBe(false);
  });

  it('asks from a blank template\'s ghost rows and from the toolbar\'s Add below', async () => {
    const blank = setup(new FakeSession(template([])));
    fireEvent.click(screen.getByRole('button', { name: 'A value' }));
    expect(blank.template.layout.blocks[0]?.type).toBe('stat');
    expect(screen.getByRole('textbox', { name: 'Name component' })).toBeTruthy();
    cleanup();

    const session = setup();
    fireEvent.click(frame('stat-ac1'));
    const toolbar = screen.getByRole('toolbar', { name: 'Value toolbar' });
    fireEvent.click(within(toolbar).getByText('Add below').closest('button')!);
    const search = screen.getByRole('combobox', { name: 'Find a kind' });
    fireEvent.change(search, { target: { value: 'table' } });
    key(search, 'Enter');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add' })).toBeNull());
    expect(session.template.layout.blocks[2]?.type).toBe('scores');
    expect(screen.getByRole('textbox', { name: 'Name component' })).toBeTruthy();
  });

  it('asks nothing of a tile pasted, duplicated, moved, written as JSON or brought back by undo and redo', async () => {
    const unnamed: TemplateBlock = { id: 'stat-new1', type: 'stat', field: '', look: 'run-in' };
    const base = sampleTemplate();
    const session = setup(new FakeSession({ ...base, layout: { ...base.layout, blocks: [...base.layout.blocks, unnamed] } }));
    fireEvent.click(frame('stat-new1'));
    act(() => frame('stat-new1').focus());
    key(frame('stat-new1'), 'c', { ctrlKey: true });
    key(frame('stat-new1'), 'v', { ctrlKey: true });
    key(frame('stat-new1'), 'd', { ctrlKey: true });
    key(frame('stat-new1'), 'ArrowUp', { altKey: true });
    expect(session.steps).toBe(3);
    expect(session.template.layout.blocks.filter((block) => block.type === 'stat' && block.field === '')).toHaveLength(3);
    expect(nameDialog()).toBeNull();

    // Edit as JSON takes its text into the session as a plain edit.
    act(() => session.apply((now) => ({ ...now, layout: { ...now.layout, blocks: [...now.layout.blocks, { ...unnamed, id: 'stat-json' }] } })));
    expect(nameDialog()).toBeNull();

    addFromDock('stat');
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name component' });
    fireEvent.change(input, { target: { value: 'Morale' } });
    key(input, 'Enter');
    await waitFor(() => expect(nameDialog()).toBeNull());
    act(() => session.undo());
    expect(session.template.fields.some((field) => field.key === 'morale')).toBe(false);
    act(() => session.redo());
    expect(session.template.layout.blocks.some((block) => block.type === 'stat' && block.field === 'morale')).toBe(true);
    expect(nameDialog()).toBeNull();
  });
});
