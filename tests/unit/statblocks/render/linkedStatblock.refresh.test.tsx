// @vitest-environment jsdom
import { act, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { HP_RESOURCE } from '../../../../src/app/resources/resourceDefinitions';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { TokenVitals } from '../../../../src/app/services/statblockVitalsSync';
import { addNote, creatureVault, forbidWrites, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_PATH, TEMPLATE_FOLDER, marshText } from '../library/templateTexts';
import {
  NATIVE, WARDEN, barOf, captionOf, fantasyCardOf, loadFantasyStatblocks, renderLinked, sheetOf, unloadFantasyStatblocks,
} from './linkedStatblockKit';

let current: CreatureVault;

beforeEach(() => {
  current = creatureVault();
});

afterEach(() => {
  cleanup();
  TemplateLibrary.release(current.app);
  unloadFantasyStatblocks();
});

const skeletonOf = (container: HTMLElement): Element | null => container.querySelector('.atlas-statblock-skeleton');

describe('LinkedStatblock: loading', () => {
  it('shows the skeleton from the first frame of a note read at mount', async () => {
    current.files.set(MARSH_PATH, marshText());
    addNote(current, WARDEN, NATIVE);
    const { container } = renderLinked(current, { path: WARDEN });
    expect(skeletonOf(container)).not.toBeNull();
    await waitFor(() => expect(sheetOf(container)).not.toBeNull());
    expect(skeletonOf(container)).toBeNull();
  });

  it('waits for the library\'s first read instead of flashing "Template not found"', async () => {
    let ready: () => void = () => undefined;
    current.app.workspace.onLayoutReady = vi.fn((callback: () => void) => { ready = callback; });
    current.files.set(MARSH_PATH, marshText());
    addNote(current, WARDEN, NATIVE);
    const { container } = renderLinked(current, { path: WARDEN });

    // Long enough for the note to be read and a skeleton to leave; the library has not started yet.
    for (let turn = 0; turn < 3; turn++) await act(async () => { await new Promise((done) => setTimeout(done, 10)); });
    expect(skeletonOf(container)).not.toBeNull();
    expect(barOf(container)).toBeNull();

    act(() => ready());
    await waitFor(() => expect(sheetOf(container)?.dataset.template).toBe('marsh-creature'));
    expect(barOf(container)).toBeNull();
  });
});

describe('LinkedStatblock: following changes', () => {
  it('reads a native note again when the metadata cache reads it anew', async () => {
    current.files.set(MARSH_PATH, marshText());
    addNote(current, WARDEN, NATIVE);
    const { container } = renderLinked(current, { path: WARDEN });
    await waitFor(() => expect(sheetOf(container)?.textContent).toContain('Marsh Warden'));

    addNote(current, WARDEN, { ...NATIVE, name: 'Bog Warden' });
    act(() => current.metadata.trigger('changed', new TFile(WARDEN)));
    await waitFor(() => expect(sheetOf(container)?.textContent).toContain('Bog Warden'));
  });

  it('ignores changes of other notes', async () => {
    current.files.set(MARSH_PATH, marshText());
    addNote(current, WARDEN, NATIVE);
    const { container } = renderLinked(current, { path: WARDEN });
    await waitFor(() => expect(sheetOf(container)).not.toBeNull());
    const reads = vi.mocked(current.app.vault.getAbstractFileByPath).mock.calls.length;

    act(() => current.metadata.trigger('changed', new TFile('Notes/Plain.md')));
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(current.app.vault.getAbstractFileByPath).mock.calls.length).toBe(reads);
  });

  it('draws the note with its template once the template file appears', async () => {
    addNote(current, WARDEN, NATIVE);
    const { container } = renderLinked(current, { path: WARDEN });
    await waitFor(() => expect(barOf(container)).toBe('Template not found'));

    current.files.set(MARSH_PATH, marshText());
    act(() => current.vault.trigger('create', new TFile(MARSH_PATH)));
    await waitFor(() => expect(sheetOf(container)?.dataset.template).toBe('marsh-creature'));
    expect(barOf(container)).toBeNull();
  });

  it('follows the template a note is switched to, also through a later rename of that template', async () => {
    const bogPath = `${TEMPLATE_FOLDER}/Bog creature.atlastemplate`;
    const fenPath = `${TEMPLATE_FOLDER}/Fen creature.atlastemplate`;
    current.files.set(MARSH_PATH, marshText());
    current.files.set(bogPath, marshText({ id: 'bog-creature-p4q8rs' }));
    addNote(current, WARDEN, NATIVE);
    const { container } = renderLinked(current, { path: WARDEN });
    await waitFor(() => expect(sheetOf(container)?.dataset.template).toBe('marsh-creature'));

    addNote(current, WARDEN, { ...NATIVE, 'atlas-template': 'bog-creature-p4q8rs' });
    act(() => current.metadata.trigger('changed', new TFile(WARDEN)));
    await waitFor(() => expect(sheetOf(container)?.dataset.template).toBe('bog-creature'));

    current.files.set(fenPath, current.files.get(bogPath)!);
    current.files.delete(bogPath);
    act(() => current.vault.trigger('rename', new TFile(fenPath), bogPath));
    await waitFor(() => expect(sheetOf(container)?.dataset.template).toBe('fen-creature'));
  });

  it('draws a note adopted as a native statblock with its template while Fantasy Statblocks is loaded', async () => {
    loadFantasyStatblocks(current);
    current.files.set(MARSH_PATH, marshText());
    addNote(current, WARDEN, { statblock: true, name: 'Marsh Warden' });
    current.bestiary.push({ name: 'Marsh Warden', path: WARDEN });
    const { container } = renderLinked(current, { path: WARDEN });
    await waitFor(() => expect(fantasyCardOf(container)?.textContent).toContain('Marsh Warden'));

    addNote(current, WARDEN, NATIVE);
    act(() => current.metadata.trigger('changed', new TFile(WARDEN)));
    await waitFor(() => expect(sheetOf(container)?.dataset.template).toBe('marsh-creature'));
    expect(fantasyCardOf(container)).toBeNull();
  });

  it('hands a frontmatter statblock to Fantasy Statblocks once the plugin loads after mount', async () => {
    unloadFantasyStatblocks();
    const { container } = renderLinked(current, { path: 'Bestiary/Goblin.md' });
    await waitFor(() => expect(captionOf(container)).toBe('Shown with Atlas\' field layout'));

    loadFantasyStatblocks(current);
    current.bestiary.push({ name: 'Goblin', path: 'Bestiary/Goblin.md' });
    act(() => current.workspace.trigger('fantasy-statblocks:loaded'));
    await waitFor(() => expect(fantasyCardOf(container)?.textContent).toContain('Goblin'));
    expect(sheetOf(container)).toBeNull();
  });
});

describe('LinkedStatblock: tokens', () => {
  const TOKEN: TokenVitals = { id: 'warden-1', name: 'Warden', imagePath: 'art/warden.webp', resources: { hp: { current: 12, max: 30 } } };

  it('shows the token\'s art in place of the statblock\'s image', async () => {
    current.files.set(MARSH_PATH, marshText());
    current.files.set('art/warden.webp', '');
    addNote(current, WARDEN, { ...NATIVE, image: 'art/old.webp' });
    const { container } = renderLinked(current, { path: WARDEN, variant: 'hover', tokens: [TOKEN] });
    await waitFor(() => expect(sheetOf(container)).not.toBeNull());
    expect(sheetOf(container)?.dataset.variant).toBe('hover');
    expect(container.querySelector('.atlas-sb-token-image img')?.getAttribute('src')).toBe('app://vault/art/warden.webp');
  });

  it('lists the DM screen\'s token resources under a native statblock', async () => {
    current.files.set(MARSH_PATH, marshText());
    addNote(current, WARDEN, NATIVE);
    const tokenActions = { definitions: [HP_RESOURCE], onLocateToken: vi.fn(), onUpdateToken: vi.fn() };
    const { container } = renderLinked(current, { path: WARDEN, variant: 'feed', tokens: [TOKEN, { ...TOKEN, id: 'warden-2' }], tokenActions });
    await waitFor(() => expect(container.querySelectorAll('.atlas-sb-token-entry')).toHaveLength(2));
    expect(container.querySelector('.atlas-sb-token-list')?.closest('.atlas-sb-sheet')).not.toBeNull();
  });
});

describe('LinkedStatblock: viewing never writes', () => {
  it.each([
    ['a native note', WARDEN],
    ['a native note whose template is missing', 'Bestiary/Lost.md'],
    ['a frontmatter statblock without Fantasy Statblocks', 'Bestiary/Goblin.md'],
    ['a fence without Fantasy Statblocks', 'Bestiary/Orc.md'],
  ])('%s', async (_kind, path) => {
    unloadFantasyStatblocks();
    current.files.set(MARSH_PATH, marshText());
    addNote(current, WARDEN, NATIVE);
    addNote(current, 'Bestiary/Lost.md', { ...NATIVE, 'atlas-template': 'gone-abc123' });
    const refusals = forbidWrites(current.app);
    const { container } = renderLinked(current, { path });
    await waitFor(() => expect(sheetOf(container)).not.toBeNull());
    for (const refusal of refusals) expect(refusal).not.toHaveBeenCalled();
  });
});
