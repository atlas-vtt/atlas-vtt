import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, WorkspaceLeaf } from 'obsidian';

vi.mock('../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../src/app/react/components/LinkedNotePicker', () => ({ default: () => null }));
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
  vault: { getAbstractFileByPath: (path: string) => (path === NOTE ? new TFile(path) : null) },
};
const state = {
  objects: { tokens: {} },
  dmNotePath: NOTE,
  setDMNotePath: vi.fn(),
  updateToken: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
});
