// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal, type FuzzyMatch } from 'obsidian';
import { pickSoundFile, type FolderChoice } from '../../../src/app/soundLibrary/SoundFolderPicker';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

/** The picker as Obsidian shows it: its items, how typing matches them, how a row looks, and its layer. */
interface ShownPicker {
  containerEl: HTMLElement;
  getItems(): FolderChoice[];
  getItemText(choice: FolderChoice): string;
  renderSuggestion(match: FuzzyMatch<FolderChoice>, el: HTMLElement): void;
}

/** Runs `open`, and hands back the picker it opened. */
function opened(open: () => void): ShownPicker {
  const spy = vi.spyOn(Modal.prototype, 'open');
  open();
  const picker = spy.mock.contexts.at(-1) as ShownPicker | undefined;
  spy.mockRestore();
  if (!picker) throw new Error('no picker opened');
  return picker;
}

/** A row of the picker, rendered for `choice`. */
function row(picker: ShownPicker, choice: FolderChoice): HTMLElement {
  const el = document.createElement('div');
  picker.renderSuggestion({ item: choice, match: { score: 0, matches: [] } }, el);
  return el;
}

const noop = (): void => undefined;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pickSoundFile', () => {
  it('looks as before for Relink: the label is what is shown and matched, with no note, under Atlas dialogs', () => {
    const { app } = createInMemoryApp({ files: {} });
    const choice: FolderChoice = { label: 'a/b.ogg', path: 'a/b.ogg' };
    const picker = opened(() => pickSoundFile(app, [choice], 'x', noop));

    expect(picker.getItemText(choice)).toBe('a/b.ogg');
    expect(row(picker, choice).querySelector('.suggestion-title')?.textContent).toBe('a/b.ogg');
    expect(row(picker, choice).querySelector('.suggestion-note')).toBeNull();
    expect(picker.containerEl.classList.contains('atlas-above-dialogs')).toBe(false);
  });

  it('shows a note, matches the search text, and stands above Atlas dialogs when asked', () => {
    const { app } = createInMemoryApp({ files: {} });
    const choice: FolderChoice = { label: 'wings', note: 'Sounds', search: 'Sounds/wings.ogg', path: 'Sounds/wings.ogg' };
    const picker = opened(() => pickSoundFile(app, [choice], 'x', noop, { aboveDialogs: true }));

    expect(picker.getItemText(choice)).toBe('Sounds/wings.ogg');
    expect(row(picker, choice).querySelector('.suggestion-title')?.textContent).toBe('wings');
    expect(row(picker, choice).querySelector('.suggestion-note')?.textContent).toBe('Sounds');
    expect(picker.containerEl.classList.contains('atlas-above-dialogs')).toBe(true);
  });
});
