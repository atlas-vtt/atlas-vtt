// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { AssetService } from '../../../../src/app/services/AssetService';
import { LayoutAdoptionList } from '../../../../src/app/statblocks/editor/fs-import/LayoutAdoptionList';
import { importFsLayout } from '../../../../src/app/statblocks/fs/fsImport';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { MARSH_LAYOUT, withFsPlugin, withoutFsPlugin } from './fsImportKit';

const NOTES: Record<string, Record<string, unknown>> = {
  'Bestiary/Bog.md': { statblock: true, name: 'Bog', layout: 'Marsh layout' },
  'Bestiary/Fen.md': { statblock: true, name: 'Fen', layout: 'Marsh layout' },
  'Bestiary/Mire.md': { statblock: true, name: 'Mire' },
  // Another collection's statblock, and one the collection's tokens do not link.
  'Bestiary/Elsewhere.md': { statblock: true, name: 'Elsewhere', layout: 'Marsh layout' },
};
const HAG = 'Bestiary/Hag.md';
const HAG_TEXT = 'She waits.\n```statblock\nlayout: Marsh layout\nname: Hag\n```\n';
const LINKED = ['Bestiary/Bog.md', 'Bestiary/Fen.md', 'Bestiary/Mire.md', HAG];
const text = (values: Record<string, unknown>): string => `---\n${Object.entries(values).map(([key, value]) => `${key}: ${String(value)}`).join('\n')}\n---\n`;

let vault: SessionVault;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(async () => {
  vault = sessionVault({ ...Object.fromEntries(Object.entries(NOTES).map(([path, values]) => [path, text(values)])), [HAG]: HAG_TEXT });
  Object.assign(vault.frontmatter, NOTES);
  await vault.settled();
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getAssets: async (collection: string) => (collection === 'marsh'
      ? LINKED.map((statblockPath, index) => ({ id: `t${index}`, type: 'token', name: `Token ${index}`, imagePath: `art/${index}.webp`, statblockPath }))
      : []),
  } as unknown as AssetService);
});

afterEach(async () => {
  cleanup();
  withoutFsPlugin(vault.app);
  NoteFieldWriter.release(vault.app);
  await closeSessionVault(vault);
  vi.restoreAllMocks();
});

function show(collectionId = 'marsh'): void {
  render(<TooltipProvider><LayoutAdoptionList app={vault.app} collectionId={collectionId} /></TooltipProvider>);
}

const rows = (): string[][] => within(screen.getByRole('list', { name: 'Fantasy Statblocks layouts' })).getAllByRole('listitem')
  .map((row) => ['name', 'detail', 'usage'].map((part) => row.querySelector(`.atlas-sb-templates__${part}`)?.textContent ?? ''));

describe('the Statblocks tab\'s Fantasy Statblocks layouts', () => {
  it('lists each layout that draws statblocks of the collection, code blocks among them, imports the one chosen and moves them', async () => {
    withFsPlugin(vault.app);
    show();
    await waitFor(() => expect(rows()).toEqual([
      ['Marsh layout', 'Not imported yet', '3 statblocks'],
      ['Plain layout', 'Not imported yet', '1 statblock'],
    ]));

    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Move to Atlas…' })[0]!); });
    const dialog = await screen.findByRole('dialog', { name: 'Marsh layout is ready' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move 3 statblocks to Atlas' }));
    await screen.findByText('Moved 3 statblocks.');
    const id = JSON.parse(vault.files.get('atlas-vtt/statblock-templates/Marsh layout.atlastemplate')!) as { id: string };
    expect(vault.files.get('Bestiary/Bog.md')).toContain(`atlas-template: ${id.id}`);
    expect(vault.files.get(HAG)).toBe(`---\nstatblock: true\natlas-template: ${id.id}\nname: Hag\nlayout: Marsh layout\n---\nShe waits.\n`);
    expect(vault.files.get('Bestiary/Elsewhere.md')).toBe(text(NOTES['Bestiary/Elsewhere.md']!));
  });

  it('names the template a layout gave before, and offers no import without the plugin', async () => {
    show();
    await waitFor(() => expect(rows()).toEqual([['Marsh layout', 'Not imported yet', '3 statblocks']]));
    const button = screen.getByRole('button', { name: 'Move to Atlas…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Turn on Fantasy Statblocks to import this layout')).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();

    await importFsLayout(vault.app, MARSH_LAYOUT);
    show();
    await waitFor(() => expect(rows()).toEqual([['Marsh layout', 'Template: Marsh layout', '3 statblocks']]));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Move to Atlas…' })); });
    expect(await screen.findByRole('dialog', { name: 'Marsh layout is ready' })).toBeTruthy();
  });

  it('shows nothing for a collection whose statblocks no layout draws', async () => {
    show('empty');
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('list')).toBeNull();
  });
});
