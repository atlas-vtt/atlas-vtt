// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { addNote, creatureVault, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_ID, MARSH_PATH, libraryEntry, marshText } from '../library/templateTexts';
import {
  NATIVE, WARDEN, barOf, captionOf, fantasyCardOf, hintOf, loadFantasyStatblocks, noteText, renderLinked, sheetOf, unloadFantasyStatblocks,
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

/** Waits until the native card shows and returns it. */
async function sheet(container: HTMLElement): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const found = sheetOf(container);
    if (!found) throw new Error('No statblock sheet yet');
    return found;
  });
}

describe('LinkedStatblock: native statblocks (§6.1)', () => {
  it('draws a native note with its template from the library', async () => {
    current.files.set(MARSH_PATH, marshText());
    addNote(current, WARDEN, NATIVE);
    const { container } = renderLinked(current, { path: WARDEN });
    const card = await sheet(container);
    expect(card.dataset.template).toBe('marsh-creature');
    // The template can be drawn a moment before the note's values reach it.
    await waitFor(() => expect(card.textContent).toContain('Marsh Warden'));
    expect(card.textContent).toContain('Large plant');
    expect(barOf(container)).toBeNull();
    expect(captionOf(container)).toBeNull();
  });

  it('draws a native note with its template while Fantasy Statblocks is loaded too', async () => {
    loadFantasyStatblocks(current);
    current.files.set(MARSH_PATH, marshText());
    addNote(current, WARDEN, NATIVE);
    current.bestiary.push({ name: 'Marsh Warden', path: WARDEN });
    const { container } = renderLinked(current, { path: WARDEN });
    expect((await sheet(container)).dataset.template).toBe('marsh-creature');
    expect(fantasyCardOf(container)).toBeNull();
  });

  it('draws a note whose template is missing with the auto template under "Template not found"', async () => {
    addNote(current, WARDEN, { ...NATIVE, 'atlas-template': 'gone-abc123' });
    const { container } = renderLinked(current, { path: WARDEN });
    const card = await sheet(container);
    expect(card.dataset.template).toBe('auto');
    expect(card.textContent).toContain('Marsh Warden');
    expect(barOf(container)).toBe('Template not found');
    expect(screen.queryByRole('button', { name: 'Choose a template' })).toBeNull();
  });

  it('offers Choose a template where the mount can act on it', async () => {
    const onChooseTemplate = vi.fn();
    addNote(current, WARDEN, { ...NATIVE, 'atlas-template': 'gone-abc123' });
    const { container } = renderLinked(current, { path: WARDEN, onChooseTemplate });
    await sheet(container);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a template' }));
    expect(onChooseTemplate).toHaveBeenCalledWith(WARDEN);
  });

  it('draws a template of a newer Atlas under "Made with a newer Atlas"', async () => {
    current.files.set(MARSH_PATH, marshText({ version: 2 }));
    addNote(current, WARDEN, NATIVE);
    const { container } = renderLinked(current, { path: WARDEN });
    expect((await sheet(container)).dataset.template).toBe('marsh-creature');
    expect(barOf(container)).toBe('Made with a newer Atlas');
  });
});

describe('LinkedStatblock: Fantasy Statblocks statblocks (§6.1)', () => {
  it('leaves a frontmatter statblock to today\'s renderer while the plugin is loaded', async () => {
    loadFantasyStatblocks(current);
    current.bestiary.push({ name: 'Goblin', path: 'Bestiary/Goblin.md', cr: '1/4' });
    const { container } = renderLinked(current, { path: 'Bestiary/Goblin.md' });
    await waitFor(() => expect(fantasyCardOf(container)?.textContent).toContain('Goblin'));
    expect(sheetOf(container)).toBeNull();
  });

  it('draws a frontmatter statblock with the auto template while the plugin is missing', async () => {
    unloadFantasyStatblocks();
    const { container } = renderLinked(current, { path: 'Bestiary/Goblin.md' });
    const card = await sheet(container);
    expect(card.dataset.template).toBe('auto');
    expect(card.textContent).toContain('Goblin');
    expect(captionOf(container)).toBe('Shown with Atlas\' field layout');
    expect(barOf(container)).toBeNull();
  });

  it('draws an inline fence with the auto template while the plugin is missing', async () => {
    unloadFantasyStatblocks();
    const { container } = renderLinked(current, { path: 'Bestiary/Orc.md' });
    const card = await sheet(container);
    expect(card.textContent).toContain('Orc');
    expect(card.textContent).toContain('1/2');
    expect(captionOf(container)).toBe('Shown with Atlas\' field layout');
  });

  it('asks for Fantasy Statblocks only for a fence that names a bestiary creature', async () => {
    unloadFantasyStatblocks();
    current.files.set('Bestiary/Named.md', '```statblock\ncreature: Goblin\n```');
    const { container } = renderLinked(current, { path: 'Bestiary/Named.md' });
    await waitFor(() => expect(hintOf(container)).toBe('Install and enable the Fantasy Statblocks plugin to preview statblocks.'));
    expect(sheetOf(container)).toBeNull();
  });

  it('says that a plain note has no statblock, without asking for the plugin', async () => {
    unloadFantasyStatblocks();
    const { container } = renderLinked(current, { path: 'Notes/Plain.md' });
    await waitFor(() => expect(hintOf(container)).toBe('This note has no statblock.'));
  });
});

describe('LinkedStatblock: notes of a bundle under review (§6.1)', () => {
  const BUNDLE_NOTE = 'Bundle/Bestiary/Marsh Warden.md';

  it('draws a native note with a template that is only in the bundle', async () => {
    const bundleTemplates = [libraryEntry(MARSH_CREATURE, 'Marsh creature')];
    const { container } = renderLinked(current, { path: BUNDLE_NOTE, noteText: noteText(NATIVE), bundleTemplates });
    const card = await sheet(container);
    expect(card.dataset.template).toBe('marsh-creature');
    expect(card.textContent).toContain('Marsh Warden');
    expect(barOf(container)).toBeNull();
  });

  it('shows the missing-template state for a template that is neither in the bundle nor in the library', async () => {
    const { container } = renderLinked(current, { path: BUNDLE_NOTE, noteText: noteText(NATIVE) });
    expect((await sheet(container)).dataset.template).toBe('auto');
    expect(barOf(container)).toBe('Template not found');
    expect(TemplateLibrary.forApp(current.app).get(MARSH_ID)).toBeNull();
  });

  it('leaves a bundle\'s Fantasy Statblocks note to today\'s renderer, read from its text', async () => {
    loadFantasyStatblocks(current);
    const text = noteText({ statblock: true, name: 'Bundle Bat' });
    const { container } = renderLinked(current, { path: 'Bundle/Bestiary/Bat.md', noteText: text });
    await waitFor(() => expect(fantasyCardOf(container)?.textContent).toContain('Bundle Bat'));
    expect(sheetOf(container)).toBeNull();
  });

  it('draws a bundle\'s Fantasy Statblocks note with the auto template while the plugin is missing', async () => {
    unloadFantasyStatblocks();
    const text = noteText({ statblock: true, name: 'Bundle Bat' });
    const { container } = renderLinked(current, { path: 'Bundle/Bestiary/Bat.md', noteText: text });
    expect((await sheet(container)).textContent).toContain('Bundle Bat');
    expect(captionOf(container)).toBe('Shown with Atlas\' field layout');
  });
});
