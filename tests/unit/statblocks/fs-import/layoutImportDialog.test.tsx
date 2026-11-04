// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { LayoutImportDialog } from '../../../../src/app/statblocks/editor/fs-import/LayoutImportDialog';
import {
  detailsLine, fsOnlyLine, moveExplanation, moveLabel, movedLine, readyLine, readyTitle,
} from '../../../../src/app/statblocks/editor/fs-import/importReportText';
import type { LayoutStatblocks } from '../../../../src/app/statblocks/fs/fsLayoutStatblocks';
import { importFsLayout, type FsLayoutImport } from '../../../../src/app/statblocks/fs/fsImport';
import type { FsImportReport } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { MARSH_LAYOUT } from './fsImportKit';

const MARSH = { id: 'marsh-layout', name: 'Marsh layout' };
const NOTES = ['Bestiary/Bog.md', 'Bestiary/Fen.md', 'Bestiary/Mire.md'];
const fsNote = (name: string): string => `---\nstatblock: true\nname: ${name}\nlayout: Marsh layout\n---\n`;
const HAG = 'Bestiary/Hag.md';
const HAG_TEXT = 'She waits.\n\n```statblock\nlayout: Marsh layout\nname: Hag\nhp: 9\n```\nThe end.\n';
const ALL: LayoutStatblocks = { frontmatter: NOTES, fences: [HAG] };

let vault: SessionVault;
let imported: FsLayoutImport;
let onClose: ReturnType<typeof vi.fn>;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(async () => {
  vault = sessionVault({ ...Object.fromEntries(NOTES.map((path) => [path, fsNote(path.slice(9, -3))])), [HAG]: HAG_TEXT });
  await vault.settled();
  imported = await importFsLayout(vault.app, MARSH_LAYOUT);
  onClose = vi.fn();
});

afterEach(async () => {
  cleanup();
  NoteFieldWriter.release(vault.app);
  await closeSessionVault(vault);
});

function show(statblocks: LayoutStatblocks = ALL, given: FsLayoutImport = imported): void {
  render(
    <TooltipProvider>
      <LayoutImportDialog app={vault.app} doc={document} layout={MARSH} imported={given} statblocks={statblocks} onClose={onClose} />
    </TooltipProvider>,
  );
}

const report = (dropped: string[], partial: string[]): FsImportReport => ({
  blocks: 11, fields: 9, scripts: [], dropped, partial, withoutCode: { total: 9, full: 9 },
});

describe('the dialog\'s words', () => {
  it('says what Atlas can show now and what of the look it cannot, without naming code', () => {
    expect(readyTitle('DaggerHeart Adversary')).toBe('DaggerHeart Adversary is ready');
    expect(readyLine('DaggerHeart Adversary')).toBe('Atlas can now show statblocks the way DaggerHeart Adversary does.');
    expect(fsOnlyLine(0)).toBeNull();
    expect(fsOnlyLine(1)).toBe('One part shows simpler than in Fantasy Statblocks.');
    expect(fsOnlyLine(2)).toBe('2 parts show simpler than in Fantasy Statblocks.');
    expect(detailsLine(null)).toBeNull();
    expect(detailsLine(report([], []))).toBeNull();
    expect(detailsLine(report(['a'], []))).toBe('Some details were left out.');
    expect(detailsLine(report([], ['a']))).toBe('Some details look simpler.');
    expect(detailsLine(report(['a'], ['b']))).toBe('Some details were left out or look simpler.');
  });

  it('says what moving does and did', () => {
    expect(moveLabel(214)).toBe('Move 214 statblocks to Atlas');
    expect(moveLabel(1)).toBe('Move 1 statblock to Atlas');
    expect(movedLine(214, 214)).toBe('Moved 214 statblocks.');
    expect(movedLine(12, 214)).toBe('Moved 12 of 214 statblocks.');
    expect(moveExplanation({ frontmatter: ['a'], fences: [] })).toBe('Moving your statblocks lets you open and edit them in Atlas; every value stays as it is.');
    expect(moveExplanation({ frontmatter: [], fences: ['a'] })).toBe(
      'Moving your statblocks lets you open and edit them in Atlas; every value stays as it is. A statblock written into a note\'s text moves out of the text and shows beside the note.',
    );
  });
});

describe('LayoutImportDialog', () => {
  it('says the layout is ready, with its tracks already Track blocks and nothing asked', () => {
    show({ frontmatter: [], fences: [] });
    expect(screen.getByRole('dialog', { name: 'Marsh layout is ready' })).toBeTruthy();
    expect(screen.getByText(/^Atlas can now show statblocks the way Marsh layout does\./).textContent).not.toMatch(/Fantasy Statblocks/);
    expect(screen.queryByText(/JavaScript|script|Track blocks/)).toBeNull();
    const saved = JSON.parse(vault.files.get(imported.path)!) as StatblockTemplate;
    expect(saved.layout.blocks.flatMap((block) => (block.type === 'track' ? [block.field] : []))).toEqual(['hp', 'stress']);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['', 'Show the detail', 'Done']);
    fireEvent.click(screen.getByRole('button', { name: 'Show the detail' }));
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([...imported.report!.dropped, ...imported.report!.partial]);
  });

  it('counts the parts that show simpler and lists what was left out, each in its own sentence', () => {
    const given = { ...imported, report: { ...report(['The key “layout” is reserved in Atlas, so the block that shows it was left out.'], ['Traits: the line under its heading is kept for export only.']), scripts: [{ blockId: 'a', summary: 'A button', suggestion: null }] } };
    show({ frontmatter: [], fences: [] }, given);
    expect(screen.getByText('Atlas can now show statblocks the way Marsh layout does. One part shows simpler than in Fantasy Statblocks. Some details were left out or look simpler.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show the 2 details' }));
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'The key “layout” is reserved in Atlas, so the block that shows it was left out.',
      'Traits: the line under its heading is kept for export only.',
    ]);
  });

  it('lists the statblocks folded away, then moves them with progress, and says what it did', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Show the 4 statblocks' }));
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Bog', 'Fen', 'Hag In the note\'s text', 'Mire']);

    fireEvent.click(screen.getByRole('button', { name: 'Move 4 statblocks to Atlas' }));
    expect(screen.getByRole('progressbar', { name: 'Moving statblocks' })).toBeTruthy();
    await screen.findByText('Moved 4 statblocks.');
    for (const path of NOTES) expect(vault.files.get(path)).toBe(fsNote(path.slice(9, -3)).replace(/---\n$/, `atlas-template: ${imported.id}\n---\n`));
    expect(vault.files.get(HAG)).toBe(`---\nstatblock: true\natlas-template: ${imported.id}\nname: Hag\nlayout: Marsh layout\nhp: 9\n---\nShe waits.\n\nThe end.\n`);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Not now without moving anything', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalled();
    for (const path of NOTES) expect(vault.files.get(path)).toBe(fsNote(path.slice(9, -3)));
  });

  it('stops at Cancel and lists the statblocks it left as they were, with why', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Move 4 statblocks to Atlas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByText(/^Moved [0-3] of 4 statblocks\.$/);
    expect(vault.files.get(NOTES[2]!)).toBe(fsNote('Mire'));
    fireEvent.click(screen.getByRole('button', { name: /^Show the (\d statblocks left as they were|statblock left as it was)$/ }));
    expect(screen.getAllByText('Not reached before Cancel.').length).toBeGreaterThan(0);
  });

  it('offers the move for a layout imported before, and closes on Escape', async () => {
    show({ frontmatter: NOTES.slice(0, 1), fences: [] }, { ...imported, report: null });
    expect(screen.getByRole('dialog', { name: 'Marsh layout is ready' })).toBeTruthy();
    expect(screen.getByText('Atlas can now show statblocks the way Marsh layout does.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move 1 statblock to Atlas' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
