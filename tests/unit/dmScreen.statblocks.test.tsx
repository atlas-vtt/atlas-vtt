import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';

vi.mock('../../src/app/pixi/utils/tokenHighlight', () => ({ zoomToTokenWithHighlight: vi.fn(), addTokenHighlight: vi.fn() }));
import { zoomToTokenWithHighlight } from '../../src/app/pixi/utils/tokenHighlight';

vi.mock('../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../src/app/react/components/LinkedNotePicker', () => ({ default: () => null }));
vi.mock('../../src/app/resources/useMapResources', async () => {
  const definitions = [(await import('../../src/app/resources/resourceDefinitions')).HP_RESOURCE];
  return { useMapResources: () => definitions };
});
vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ app, view }),
}));
vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useAtlasStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

import DMScreen from '../../src/app/react/components/DMScreen';

const view = {};
const legacyPath = 'statblocks/New Creature 32.md';
const creaturePath = 'statblocks/Acid Burrower.md';
const fencePath = 'statblocks/Inline Creature.md';
const files = [legacyPath, creaturePath, fencePath].map((path) => new TFile(path));
const creature = { name: 'Acid Burrower', path: creaturePath, hp: 8, stress: 3 };
const app = {
  workspace: { on: vi.fn(), offref: vi.fn() },
  vault: {
    getAbstractFileByPath: (path: string) => files.find((file) => file.path === path),
    cachedRead: async (file: TFile) => file.path === fencePath
      ? '```statblock\nname: Inline Creature\n```'
      : '## Notes\nAn old Atlas creature note.',
  },
  metadataCache: {
    getFileCache: (file: TFile) => ({ frontmatter: file.path === creaturePath
      ? { statblock: true, name: creature.name }
      : { 'atlas-type': 'statblock', 'template-id': 'old-template', name: 'New Creature 32' } }),
  },
  plugins: { plugins: { 'obsidian-5e-statblocks': { manager: {
    getAllLayouts: () => [],
    getDefaultLayout: () => ({
      name: 'Basic', id: 'basic',
      blocks: [{ type: 'heading', id: 'heading', properties: ['name'], size: 1 }],
    }),
  } } } },
};
const state = {
  objects: { tokens: {} as Record<string, { id: string; name: string; statblockPath: string }> },
  dmNotePath: null,
  setDMNotePath: vi.fn(),
  updateToken: vi.fn(),
};

function showDMScreen(paths: string[], onClose = vi.fn()) {
  state.objects.tokens = Object.fromEntries(paths.map((statblockPath, index) => [index, {
    id: String(index), kind: 'character', x: index * 100, y: 50, instanceNumber: index, name: index === 0 ? 'Sunborne Beacon' : 'Acid Burrower', statblockPath,
    resources: { hp: { current: 8, max: 8 } },
  }]));
  Object.assign(window, { FantasyStatblocks: {
    getBestiaryCreatures: () => [creature],
    hasCreature: () => false,
    isResolved: () => true,
  } });
  return render(<DMScreen isOpen onClose={onClose} />);
}

afterEach(() => {
  cleanup();
  delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks;
});

describe('DM screen statblock selection', () => {
  it('does not render an unsupported legacy note beside valid map creatures', async () => {
    const { container } = showDMScreen([legacyPath, creaturePath, creaturePath]);
    await waitFor(() => expect(container.querySelector('.atlas-statblock')).not.toBeNull());
    expect(container.textContent).toContain('Acid Burrower');
    expect(container.textContent).not.toContain('No Fantasy Statblocks creature found');
    expect(container.querySelectorAll('.atlas-fantasy-statblock')).toHaveLength(1);
  });

  it('keeps creatures defined in code fences even though they are not in the bestiary', async () => {
    const { container } = showDMScreen([legacyPath, fencePath]);
    // The note is read before its statblock shows: until then the pane says that it is loading.
    await waitFor(() => expect(container.textContent).toContain('Inline Creature'));
    expect(container.querySelector('.atlas-statblock')).not.toBeNull();
    expect(container.textContent).not.toContain('No Fantasy Statblocks creature found');
  });

  it('leaves the statblock pane empty when all linked notes use an unsupported format', async () => {
    const { container } = showDMScreen([legacyPath]);
    await waitFor(() => expect(container.querySelector('.atlas-dm-statblocks-grid')).not.toBeNull());
    expect(container.querySelector('.atlas-dm-statblocks-grid')?.childElementCount).toBe(0);
    expect(container.querySelector('.atlas-dm-statblocks-section')).not.toBeNull();
    expect(container.textContent).not.toContain('No Fantasy Statblocks creature found');
  });
});


describe('DM screen token actions', () => {
  it('persists an independent resource update through the map store', async () => {
    showDMScreen([legacyPath, creaturePath, creaturePath]);
    const entry = await screen.findByRole('group', { name: 'Acid Burrower #2' });
    // A basic layout draws no tracks, so hit points are a gauge
    fireEvent.click(within(entry).getByRole('button', { name: 'Decrease HP' }));
    expect(state.updateToken).toHaveBeenLastCalledWith('2', { resources: { hp: { current: 7, max: 8 } } });
    expect(screen.getAllByRole('group')).toHaveLength(2);
  });

  it('zooms to the selected token and closes the overlay', async () => {
    const onClose = vi.fn();
    showDMScreen([legacyPath, creaturePath, creaturePath], onClose);
    fireEvent.click(await screen.findByRole('button', { name: 'Locate Acid Burrower #2 on map' }));
    expect(zoomToTokenWithHighlight).toHaveBeenCalledWith(view, '2', { x: 200, y: 50 });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
