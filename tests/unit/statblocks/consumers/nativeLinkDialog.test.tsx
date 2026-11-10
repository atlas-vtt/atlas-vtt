// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('../../../../src/app/packages/components/asset-manager/statblock-link/StatblockPreviewPane', () => ({
  StatblockPreviewPane: ({ path }: { path: string | null }) => <div data-testid="preview">{path}</div>,
}));

import StatblockLinkModal from '../../../../src/app/packages/components/asset-manager/StatblockLinkModal';
import { describeCreature } from '../../../../src/app/packages/components/asset-manager/statblock-link/statblockEntries';
import { statblockNoteEntries } from '../../../../src/app/packages/components/asset-manager/statblock-link/statblockNoteEntries';
import { bestiaryLookup } from '../../../../src/app/creatures/linkedCreature';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { addNote, creatureVault, forbidWrites, type CreatureVault } from '../../../mocks/creatureVault';

const GUARD = 'Bestiary/Iron Guard.md';
const IRON_GUARD = { statblock: true, 'atlas-template': 'builtin:draw-steel-monster', name: 'Iron Guard', size: '1L', level: 3 };

let current: CreatureVault;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  current = creatureVault();
  addNote(current, GUARD, IRON_GUARD);
  current.app.vault.getMarkdownFiles = () => [...current.files.keys()].filter((path) => path.endsWith('.md')).sort().map((path) => new TFile(path));
});
afterEach(() => {
  cleanup();
  TemplateLibrary.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
});

const optionNames = (): string[] =>
  screen.queryAllByRole('option').map((option) => option.querySelector('.atlas-statblock-link__option-name')?.textContent ?? '');

function open(): void {
  render(<StatblockLinkModal isOpen onClose={vi.fn()} asset={{ name: 'Token' }} onLink={vi.fn()} app={current.app} />);
}

describe('the link dialog with native statblocks', () => {
  it('describes a creature by the fields its template means', () => {
    expect(describeCreature({ bulk: 'Huge', kind: 'Dragon', threat: 4, cr: 9 }, { size: 'bulk', 'creature-type': 'kind', rating: 'threat' })).toBe('Huge Dragon · Threat 4');
    expect(describeCreature({ size: '1L', level: 3 }, { size: 'size', rating: 'level' })).toBe('1L · Level 3');
  });

  it('lists native, frontmatter and inline fence statblocks without Fantasy Statblocks', async () => {
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    const refusals = forbidWrites(current.app);
    open();
    expect(await screen.findByText('Iron Guard')).toBeTruthy();
    expect(optionNames()).toEqual(['Goblin', 'Iron Guard', 'Orc']);
    expect(screen.getByText('1L · Level 3')).toBeTruthy();
    expect(screen.queryByText(/Install and enable the Fantasy Statblocks plugin/)).toBeNull();
    expect(refusals.every((refusal) => refusal.mock.calls.length === 0)).toBe(true);
  });

  it('reads a native statblock from its note, not from the bestiary\'s stale copy of it', async () => {
    current.bestiary.push({ name: 'Old Guard', path: GUARD, statblock: true, 'atlas-template': 'builtin:draw-steel-monster', level: 1 });
    current.bestiary.push({ name: 'Goblin', path: 'Bestiary/Goblin.md', cr: '1/4' });
    open();
    expect(await screen.findByText('Iron Guard')).toBeTruthy();
    expect(optionNames()).toEqual(['Goblin', 'Iron Guard', 'Orc']);
    expect(screen.queryByText('Old Guard')).toBeNull();
  });

  it('marks which entries it read from native notes', async () => {
    const entries = await statblockNoteEntries(current.app, bestiaryLookup());
    expect(entries.map(({ path, native, detail }) => [path, native, detail])).toEqual([
      ['Bestiary/Goblin.md', false, 'CR 1/4'],
      [GUARD, true, '1L · Level 3'],
      ['Bestiary/Orc.md', false, 'CR 1/2'],
    ]);
  });
});
