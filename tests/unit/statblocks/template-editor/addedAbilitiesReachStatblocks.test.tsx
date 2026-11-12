// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { SurfaceMenuProvider } from '../../../../src/app/statblocks/editor/interaction/SurfaceMenuProvider';
import { StatblockPane } from '../../../../src/app/statblocks/editor/statblock-pane/StatblockPane';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { StatblockSheet } from '../../../../src/app/statblocks/render/StatblockSheet';
import { TEMPLATE_KEY } from '../../../../src/app/statblocks/notes/statblockSource';
import { FakeSource, FakeWriter, NOTE_PATH } from '../editor/paneKit';
import { closeSessionVault, openSession, sessionVault, type SessionVault } from '../library/sessionVault';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const host: TemplateEditorHost = { save: vi.fn(async () => null), close: vi.fn() };
const NOTE = { statblock: true, [TEMPLATE_KEY]: MARSH_ID, name: 'Marsh Warden' };

let vault: SessionVault;
const opened: TemplateSession[] = [];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
beforeEach(() => {
  vault = sessionVault({ [MARSH_PATH]: marshText(), [NOTE_PATH]: '---\nstatblock: true\n---\n' });
});
afterEach(async () => {
  cleanup();
  for (const session of opened.splice(0)) session.release();
  await closeSessionVault(vault);
});

/** The statblock beside its note, as the note view draws it, over the vault the template editor writes to. */
async function renderPane(source: FakeSource, writer: FakeWriter): Promise<HTMLElement> {
  const pane = document.createElement('div');
  document.body.append(pane);
  await act(async () => {
    render(
      <TooltipProvider>
        <SurfaceMenuProvider ownerId="pane">
          <StatblockPane
            app={vault.app}
            services={{ source, writer }}
            notePath={NOTE_PATH}
            collectionId="campaign"
            propertiesShown={false}
            announcement=""
            focusRequest={0}
            pendingCommit={{ current: null }}
            actions={{ showProperties: vi.fn(), changeCollection: vi.fn() }}
          />
        </SurfaceMenuProvider>
      </TooltipProvider>,
      { container: pane },
    );
  });
  await act(async () => { await Promise.resolve(); });
  return pane;
}

/** The dock's Abilities kind, clicked and named, as a GM adds a list to a template. */
function addAbilities(name: string): void {
  const button = document.querySelector<HTMLButtonElement>('.atlas-te-dock [data-item="block:entries"] button');
  if (!button) throw new Error('The dock offers no Abilities');
  fireEvent.click(button);
  const input = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Name component' }).at(-1)!;
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('an Abilities list added to a template', () => {
  it('can be filled in on a statblock of the template beside its note, and shows on cards once it holds an ability', async () => {
    const source = new FakeSource();
    const writer = new FakeWriter();
    source.set(NOTE_PATH, NOTE);
    const session = await openSession(vault, opened);
    const pane = await renderPane(source, writer);
    expect(pane.textContent).toContain('Add an action');
    expect(pane.textContent).not.toContain('Reactions');

    // The dock's Abilities kind, named: a list bound to a property of its own.
    const editor = document.createElement('div');
    document.body.append(editor);
    render(<TooltipProvider><TemplateEditor session={session} host={host} collectionId={null} /></TooltipProvider>, { container: editor });
    addAbilities('Reactions');
    const added = session.getSnapshot().template.layout.blocks.at(-1)!;
    expect(added).toMatchObject({ type: 'entries', field: 'reactions', heading: 'Reactions' });
    expect(session.getSnapshot().template.fields.at(-1)).toEqual({ key: 'reactions', label: 'Reactions', type: 'entries' });

    // Update writes the template, and the library reads the file again.
    await act(async () => { expect(await session.save()).toEqual({ ok: true }); });
    expect(vault.files.get(MARSH_PATH)).toContain('"reactions"');
    await act(async () => { await vault.settled(); });
    expect(TemplateLibrary.forApp(vault.app).get(MARSH_ID)?.template.layout.blocks.at(-1)).toMatchObject({ id: added.id, field: 'reactions' });

    // The pane, open all the while, offers the empty list under its card: only the template's main list keeps its prompt on it.
    const chip = await waitFor(() => {
      const found = pane.querySelector<HTMLElement>(`[data-block-id-chip="${added.id}"]`);
      if (!found) throw new Error('No way to the new list');
      return found;
    });
    expect(chip.textContent).toBe('Reactions');
    fireEvent.click(chip);
    const block = await waitFor(() => {
      const found = pane.querySelector<HTMLElement>(`[data-block-id="${added.id}"]`);
      if (!found) throw new Error('The list did not unfold');
      return found;
    });
    // The chip opens the list with its first ability being typed, which goes into the note under the list's key.
    const name = within(block).getByRole<HTMLInputElement>('textbox', { name: 'Reaction name' });
    expect(document.activeElement).toBe(name);
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: 'Parry' } });
    await act(async () => { fireEvent.blur(name); });
    expect(writer.patches()).toEqual([{ op: 'insert', list: 'reactions', after: null, item: { name: 'Parry' } }]);

    // A read-only card (hover preview, DM screen) shows the list once the note holds an ability of it.
    const template = TemplateLibrary.forApp(vault.app).get(MARSH_ID)!.template;
    const empty = render(<StatblockSheet template={template} name="Marsh creature" fields={NOTE} variant="full" />);
    expect(empty.container.querySelector(`[data-block-id="${added.id}"]`)).toBeNull();
    const filled = render(
      <StatblockSheet template={template} name="Marsh creature" fields={{ ...NOTE, reactions: [{ name: 'Parry', desc: 'It parries.' }] }} variant="full" />,
    );
    expect(filled.container.querySelector(`[data-block-id="${added.id}"]`)?.textContent).toContain('Parry');
  });
});
