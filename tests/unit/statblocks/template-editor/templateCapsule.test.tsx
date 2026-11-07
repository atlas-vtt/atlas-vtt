// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { SurfaceMenuProvider } from '../../../../src/app/statblocks/editor/interaction/SurfaceMenuProvider';
import { capsuleMenuEntries } from '../../../../src/app/statblocks/editor/template-editor/shell/capsuleMenu';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import type { SaveRequest } from '../../../../src/app/statblocks/editor/template-editor/save/saveChoice';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, offered, sampleTemplate, template } from './editorKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

function setup(session: FakeSession, save: TemplateEditorHost['save'] = vi.fn(async () => null)): { host: TemplateEditorHost } {
  const host: TemplateEditorHost = { save, close: vi.fn() };
  render(
    <TooltipProvider>
      <SurfaceMenuProvider ownerId="test">
        <TemplateEditor session={session} host={host} collectionId={null} />
      </SurfaceMenuProvider>
    </TooltipProvider>,
  );
  return { host };
}

const capsule = (): HTMLElement => screen.getByRole('toolbar', { name: 'Template' });
const saveButton = (): HTMLButtonElement => within(capsule()).getByRole('button', { name: 'Save' });

async function menuRows(): Promise<string[]> {
  fireEvent.keyDown(screen.getByRole('button', { name: 'More template actions' }), { key: 'Enter' });
  const rows = await screen.findAllByRole('menuitem');
  return rows.map((row) => row.textContent ?? '');
}

describe('the template editor\'s capsule', () => {
  it('holds the template\'s name as plain text, Save and ⋯, and nothing else', () => {
    setup(new FakeSession(sampleTemplate(), { name: 'Marsh creature' }));
    expect(capsule().querySelector('.atlas-te-name')?.textContent).toBe('Marsh creature');
    expect(within(capsule()).queryByRole('textbox')).toBeNull();
    const [save, more] = within(capsule()).getAllByRole('button');
    expect(within(capsule()).getAllByRole('button')).toHaveLength(2);
    expect(save).toBe(saveButton());
    expect(more).toBe(within(capsule()).getByRole('button', { name: 'More template actions' }));
    const shown = capsule().cloneNode(true) as HTMLElement;
    for (const hidden of shown.querySelectorAll('[hidden]')) hidden.remove();
    expect(shown.textContent).not.toMatch(/statblock|Show with|built in/i);
  });

  it('offers Save only while there are changes to save, and always for a template never saved', () => {
    const session = new FakeSession(sampleTemplate());
    setup(session);
    expect(offered(saveButton())).toBe(false);
    act(() => session.apply((current) => ({ ...current, description: 'Changed' })));
    expect(offered(saveButton())).toBe(true);
    act(() => session.undo());
    expect(offered(saveButton())).toBe(false);
    cleanup();

    setup(new FakeSession(sampleTemplate(), { unsaved: true, path: null, name: 'New template' }));
    expect(offered(saveButton())).toBe(true);
  });

  it('keeps only Dice rolls…, Recovery actions (Back to the card while open), Edit as JSON (Close JSON while open) and Delete template… in ⋯', async () => {
    setup(new FakeSession(sampleTemplate()));
    expect(await menuRows()).toEqual(['Dice rolls…', 'Recovery actions', 'Edit as JSON', 'Delete template…']);
    expect(capsuleMenuEntries({ json: { open: true, toggle: vi.fn() } }).map((entry) => entry.type === 'item' && entry.label)).toEqual(['Close JSON', 'Delete template…']);
    expect(capsuleMenuEntries({ rests: { open: true, toggle: vi.fn() } }).map((entry) => entry.type === 'item' && entry.label)).toEqual(['Back to the card', 'Delete template…']);
    expect(capsuleMenuEntries({}).find((entry) => entry.type === 'item' && entry.label === 'Delete template…')).toMatchObject({ disabled: true });
  });
});

describe('the save dialog in the editor', () => {
  it('reads Update under the template\'s own name and Save as new under another, and hands the choice to the view', async () => {
    const session = new FakeSession(sampleTemplate(), { name: 'Marsh creature' });
    const save = vi.fn(async (_request: SaveRequest) => null);
    setup(session, save);
    act(() => session.apply((current) => ({ ...current, description: 'Changed' })));
    fireEvent.click(saveButton());
    const dialog = screen.getByRole('dialog', { name: 'Save Marsh creature' });
    const name = within(dialog).getByRole<HTMLInputElement>('textbox', { name: 'Name' });
    expect(name.value).toBe('Marsh creature');
    expect(document.activeElement).toBe(name);
    expect(within(dialog).getByRole('button', { name: 'Update' })).toBeTruthy();
    fireEvent.change(name, { target: { value: 'Fen creature' } });
    expect(within(dialog).queryByRole('button', { name: 'Update' })).toBeNull();
    await act(async () => { fireEvent.keyDown(name, { key: 'Enter' }); });
    expect(save).toHaveBeenCalledWith({ kind: 'new', name: 'Fen creature' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('stays open with the reason when saving failed', async () => {
    const session = new FakeSession(sampleTemplate(), { name: 'Marsh creature' });
    setup(session, vi.fn(async () => 'Couldn\'t save: disk full.'));
    act(() => session.apply((current) => ({ ...current, description: 'Changed' })));
    fireEvent.click(saveButton());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update' })); });
    expect(screen.getByRole('dialog', { name: 'Save Marsh creature' }).textContent).toContain('Couldn\'t save: disk full.');
  });
});

describe('the card in the template editor', () => {
  const FIELDS: TemplateField[] = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'speed', label: 'Speed', type: 'text' },
    { key: 'actions', label: 'Actions', type: 'entries' },
    { key: 'reactions', label: 'Reactions', type: 'entries' },
  ];
  const BLOCKS: TemplateBlock[] = [
    { id: 'title001', type: 'title', field: 'name', level: 1 },
    { id: 'stat-sp1', type: 'stat', field: 'speed', look: 'run-in' },
    { id: 'actions1', type: 'entries', field: 'actions', heading: 'Actions' },
    { id: 'reacts01', type: 'entries', field: 'reactions', heading: 'Reactions' },
  ];

  it('shows the template empty, with no sample values, and folds nothing', () => {
    const shaped: StatblockTemplate = { ...template(BLOCKS, FIELDS), sample: { speed: 'Forty paces' } };
    setup(new FakeSession(shaped));
    const stage = document.querySelector<HTMLElement>('.atlas-te-stage')!;
    for (const block of BLOCKS) expect(stage.querySelector(`[data-block-id="${block.id}"]`), block.id).not.toBeNull();
    expect(stage.textContent).not.toContain('Forty paces');
    expect(stage.textContent).toContain('Reactions');
    expect(document.querySelector('[aria-label="Sections this statblock has nothing in"]')).toBeNull();
  });
});
