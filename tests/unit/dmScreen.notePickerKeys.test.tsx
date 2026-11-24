// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app, view: {} }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

import DMScreen from '../../src/app/react/components/DMScreen';

const NOTE = 'notes/session.md';
/** Newest first, as the picker lists them. */
const NOTES = ['Ash', 'Birch', 'Cedar', 'Dogwood', 'Elm'].map((name, index) => {
  const file = new TFile(`${name}.md`);
  file.stat = { ctime: 0, mtime: 1000 - index, size: 10 };
  return file;
});
const app = {
  workspace: { on: vi.fn(), offref: vi.fn(), getActiveViewOfType: (): null => null },
  vault: {
    getMarkdownFiles: (): TFile[] => NOTES,
    getAbstractFileByPath: (): null => null,
  },
};
const state = {
  objects: { tokens: {} },
  dmScreenPage: 'statblocks',
  setDMScreenPage: vi.fn(),
  initiative: { entries: [], isActive: false, round: 0 },
  dmNotePath: null as string | null,
  setDMNotePath: vi.fn(),
  updateToken: vi.fn(),
};

/** What a listener behind the screen hears, as the map's hotkeys would. */
function keysBehind(): string[] {
  const heard: string[] = [];
  const hear = (event: KeyboardEvent): void => { heard.push(event.key); };
  window.addEventListener('keydown', hear);
  stopHearing = () => window.removeEventListener('keydown', hear);
  return heard;
}
let stopHearing = (): void => undefined;

afterEach(() => {
  stopHearing();
  cleanup();
  state.dmNotePath = null;
  state.setDMNotePath.mockClear();
});

describe('the note picker on the DM screen, after a click in it', () => {
  const open = (): { field: HTMLInputElement; highlighted: () => number; screen: HTMLElement } => {
    const { container } = render(<DMScreen isOpen onClose={vi.fn()} />);
    const field = container.querySelector<HTMLInputElement>('.atlas-linked-note-search input')!;
    const highlighted = (): number => [...container.querySelectorAll('.atlas-linked-note-item')].findIndex((row) => row.classList.contains('atlas-focused'));
    return { field, highlighted, screen: container.querySelector<HTMLElement>('.atlas-dm-screen-wrapper')! };
  };

  it('moves its highlight with the arrows and links the highlighted note on Enter', () => {
    const { field, highlighted } = open();
    fireEvent.click(field);
    expect(highlighted()).toBe(0);

    for (let press = 0; press < 3; press++) fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(highlighted()).toBe(3);
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    expect(highlighted()).toBe(2);

    fireEvent.keyDown(field, { key: 'Enter' });
    expect(state.setDMNotePath).toHaveBeenCalledWith('Cedar.md');
  });

  it('still gives the keys back to the screen on Escape, which nothing behind the screen hears', async () => {
    const { field, screen } = open();
    fireEvent.click(field);
    field.focus();
    const heard = keysBehind();

    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(screen));
    expect(heard).toEqual([]);
  });
});

describe('a linked note on the DM screen', () => {
  it('keeps its keys from everything behind it once it is clicked', () => {
    state.dmNotePath = NOTE;
    const { container } = render(<DMScreen isOpen onClose={vi.fn()} />);
    const note = container.querySelector<HTMLElement>('.atlas-dm-note-content')!;
    const heard = keysBehind();

    fireEvent.keyDown(note, { key: 'g' });
    expect(heard).toEqual(['g']);

    fireEvent.click(note);
    fireEvent.keyDown(note, { key: 'g' });
    fireEvent.keyDown(note, { key: 'ArrowDown' });
    expect(heard).toEqual(['g']);
  });
});
