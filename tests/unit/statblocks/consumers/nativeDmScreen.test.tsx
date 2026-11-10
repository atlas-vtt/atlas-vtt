// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('../../../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn(), addTokenHighlight: vi.fn() }));
vi.mock('../../../../src/app/react/components/LinkedNotePicker', () => ({ default: () => null }));
vi.mock('../../../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));
vi.mock('../../../../src/app/react/root/AtlasUIContext', async () => ({
  useAtlasUI: () => ({ app, view: {} }),
  AtlasUIContext: (await import('react')).createContext(null),
}));
vi.mock('../../../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
// Which notes get a card is the predicate's answer; how a card draws its statblock is another test's.
vi.mock('../../../../src/app/statblocks/render/LinkedStatblock', () => ({
  LinkedStatblock: ({ path }: { path: string }) => <div data-testid="statblock-card">{path}</div>,
}));

import DMScreen from '../../../../src/app/react/components/DMScreen';

const NATIVE = 'Bestiary/Iron Guard.md';
const FENCE = 'Bestiary/Orc.md';
const FRONTMATTER = 'Bestiary/Lich.md';
const LEGACY = 'statblocks/New Creature 32.md';

const notes: Record<string, { text: string; frontmatter?: Record<string, unknown> }> = {
  [NATIVE]: { text: '---\nstatblock: true\n---', frontmatter: { statblock: true, 'atlas-template': 'builtin:draw-steel-monster', name: 'Iron Guard' } },
  [FENCE]: { text: '# Orc\n\n```statblock\nname: Orc\n```' },
  [FRONTMATTER]: { text: '---\nstatblock: true\n---', frontmatter: { statblock: true, name: 'Lich' } },
  [LEGACY]: { text: '## Notes', frontmatter: { 'atlas-type': 'statblock', name: 'New Creature 32' } },
};
const files = Object.keys(notes).map((path) => new TFile(path));
const app = {
  workspace: { on: vi.fn(), offref: vi.fn() },
  vault: {
    getAbstractFileByPath: (path: string) => files.find((file) => file.path === path) ?? null,
    cachedRead: async (file: TFile) => notes[file.path]?.text ?? '',
  },
  metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: notes[file.path]?.frontmatter }) },
};
const state = {
  objects: { tokens: {} as Record<string, unknown> },
  initiative: { entries: [], isActive: false, round: 0 },
  dmNotePath: null,
  setDMNotePath: vi.fn(),
  updateToken: vi.fn(),
};

afterEach(cleanup);

describe('DM screen cards: the statblock predicate decides', () => {
  it('gives native, fence and frontmatter statblocks a card without Fantasy Statblocks, and a note without a statblock none', async () => {
    state.objects.tokens = Object.fromEntries([NATIVE, FENCE, FRONTMATTER, LEGACY].map((statblockPath, index) => [String(index), {
      id: String(index), kind: 'character', x: 0, y: 0, instanceNumber: 1, name: `Token ${index}`, statblockPath,
    }]));
    render(<DMScreen isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId('statblock-card')).toHaveLength(3));
    expect(screen.getAllByTestId('statblock-card').map((card) => card.textContent)).toEqual([NATIVE, FENCE, FRONTMATTER]);
  });
});
