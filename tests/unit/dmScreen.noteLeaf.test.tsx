// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, WorkspaceLeaf } from 'obsidian';

vi.mock('../../src/app/react/components/LinkedNotePicker', () => ({ default: () => null }));
vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app, view: {} }),
}));
const pointer = vi.hoisted(() => ({ coarse: false }));
vi.mock('../../src/app/platform/useCoarsePointer', () => ({ useCoarsePointer: () => pointer.coarse }));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

import DMScreen from '../../src/app/react/components/DMScreen';

const NOTE = 'notes/session.md';
const activated: WorkspaceLeaf[] = [];
const app = {
  workspace: {
    on: vi.fn(),
    offref: vi.fn(),
    getActiveViewOfType: (): null => null,
    getLeaf: vi.fn((): never => {
      throw new Error('No tab group found.');
    }),
    setActiveLeaf: (leaf: WorkspaceLeaf): void => {
      activated.push(leaf);
    },
  },
  vault: {
    getAbstractFileByPath: (path: string) => (path === NOTE ? new TFile(path) : null),
    read: (): Promise<string> => Promise.resolve('The road to Greywater'),
  },
};
const state = {
  objects: { tokens: {} },
  dmScreenPage: 'statblocks',
  setDMScreenPage: vi.fn(),
  initiative: { entries: [], isActive: false, round: 0 },
  dmNotePath: NOTE,
  setDMNotePath: vi.fn(),
  updateToken: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  pointer.coarse = false;
});

describe('DM screen note', () => {
  it('leaves Obsidian able to activate tabs when the workspace fails to give the note its leaf', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<DMScreen isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(app.workspace.getLeaf).toHaveBeenCalled());
    await waitFor(() => expect(logged).toHaveBeenCalledWith('[NoteContent] Failed to load note with leaf:', expect.any(Error)));

    const leaf = new WorkspaceLeaf();
    app.workspace.setActiveLeaf(leaf);

    expect(activated).toEqual([leaf]);
  });

  it('shows the note rendered when the workspace gives it no leaf, so the pane is never empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<DMScreen isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('.atlas-dm-note-rendered')?.textContent).toBe('The road to Greywater'));
  });

  it('has a close button under a finger, which has no Escape and no backdrop to press', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pointer.coarse = true;
    const onClose = vi.fn();
    render(<DMScreen isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close DM screen' }));
    vi.advanceTimersByTime(250);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('has no close button under a mouse, as ever', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<DMScreen isOpen onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Close DM screen' })).toBeNull();
  });
});
