import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { installParsingBestiary, type ParsingBestiary } from '../mocks/parsingBestiary';

const view = {};
const legacyPath = 'statblocks/New Creature 32.md';
const creaturePath = 'statblocks/Acid Burrower.md';
const fencePath = 'statblocks/Inline Creature.md';
/** A statblock note of the GM's own that shares its file name with an SRD creature. */
const goblinPath = 'statblocks/Goblin.md';
/** A note without a statblock, which shows the bestiary creature of its name. */
const orcPath = 'statblocks/Orc.md';
const unreadablePath = 'statblocks/Unreadable.md';
const files = [legacyPath, creaturePath, fencePath, goblinPath, orcPath, unreadablePath].map((path) => new TFile(path));
const creature = { name: 'Acid Burrower', path: creaturePath, hp: 8, stress: 3 };
const statblockFrontmatter: Record<string, Record<string, unknown>> = {
  [creaturePath]: { statblock: true, name: creature.name },
  [goblinPath]: { statblock: true, name: 'Goblin Chief' },
};
const bestiaryEvents = new Map<string, Array<() => void>>();
const app = {
  workspace: {
    on: (event: string, handler: () => void) => {
      bestiaryEvents.set(event, [...(bestiaryEvents.get(event) ?? []), handler]);
      return { event, handler };
    },
    offref: vi.fn(),
  },
  vault: {
    getAbstractFileByPath: (path: string) => files.find((file) => file.path === path),
    cachedRead: async (file: TFile) => {
      if (file.path === unreadablePath) throw new Error('The file is not on this device.');
      return file.path === fencePath
        ? '```statblock\nname: Inline Creature\n```'
        : '## Notes\nAn old Atlas creature note.';
    },
  },
  metadataCache: {
    getFileCache: (file: TFile) => ({ frontmatter: statblockFrontmatter[file.path]
      ?? { 'atlas-type': 'statblock', 'template-id': 'old-template', name: 'New Creature 32' } }),
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

function placeTokens(paths: string[]): void {
  state.objects.tokens = Object.fromEntries(paths.map((statblockPath, index) => [index, {
    id: String(index), kind: 'character', x: index * 100, y: 50, instanceNumber: index, name: index === 0 ? 'Sunborne Beacon' : 'Acid Burrower', statblockPath,
    resources: { hp: { current: 8, max: 8 } },
  }]));
}

function showDMScreen(paths: string[], onClose = vi.fn()) {
  placeTokens(paths);
  Object.assign(window, { FantasyStatblocks: {
    getBestiaryCreatures: () => [creature],
    hasCreature: () => false,
    isResolved: () => true,
  } });
  return render(<DMScreen isOpen onClose={onClose} />);
}

afterEach(() => {
  cleanup();
  bestiaryEvents.clear();
  vi.restoreAllMocks();
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

describe('DM screen while Fantasy Statblocks parses the vault', () => {
  const shown = (container: HTMLElement): Element | null => container.querySelector('.atlas-dm-screen.is-visible');
  const skeleton = (container: HTMLElement): Element | null => container.querySelector('.atlas-statblock-skeleton');
  const heading = (container: HTMLElement): string | undefined => container.querySelector('.atlas-sb-heading')?.textContent ?? undefined;
  const endParse = (bestiary: ParsingBestiary): void => {
    bestiary.finish();
    act(() => bestiaryEvents.get('fantasy-statblocks:bestiary:resolved')?.forEach((handler) => handler()));
  };
  /** Lets the note reads under way finish. */
  const notesRead = (): Promise<void> => act(() => new Promise<void>((resolve) => { window.setTimeout(resolve, 0); }));

  it('shows a statblock from its own note before the bestiary holds it', async () => {
    placeTokens([creaturePath]);
    installParsingBestiary();
    const { container } = render(<DMScreen isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(shown(container)).not.toBeNull());
    await waitFor(() => expect(heading(container)).toBe('Acid Burrower'));
    expect(skeleton(container)).toBeNull();
  });

  it('opens with the statblock of a note named like a bestiary creature, and keeps it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    placeTokens([goblinPath]);
    const bestiary = installParsingBestiary([{ name: 'Goblin' }]);
    const { container } = render(<DMScreen isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(shown(container)).not.toBeNull());
    await waitFor(() => expect(heading(container)).toBe('Goblin Chief'));
    expect(errors).not.toHaveBeenCalled();

    // The parse ends without the note (it lies outside the folders Fantasy Statblocks reads): its own statblock stays.
    endParse(bestiary);
    expect(heading(container)).toBe('Goblin Chief');
    await notesRead();
    expect(heading(container)).toBe('Goblin Chief');
  });

  it('takes the bestiary entry of a note once it is parsed', async () => {
    placeTokens([goblinPath]);
    const bestiary = installParsingBestiary([{ name: 'Goblin' }]);
    const { container } = render(<DMScreen isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(heading(container)).toBe('Goblin Chief'));

    bestiary.creatures.push({ name: 'Goblin Chief, parsed', path: goblinPath });
    endParse(bestiary);
    expect(heading(container)).toBe('Goblin Chief, parsed');
  });

  it('holds the place of a creature only the bestiary knows and fills it when the parse ends', async () => {
    placeTokens([orcPath]);
    const bestiary = installParsingBestiary([{ name: 'Orc' }]);
    const { container } = render(<DMScreen isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(shown(container)).not.toBeNull());
    await notesRead();
    expect(skeleton(container)).not.toBeNull();

    endParse(bestiary);
    // The note is read again for the creature: until then its place is still held, not given up.
    expect(skeleton(container)).not.toBeNull();
    expect(container.textContent).not.toContain('No Fantasy Statblocks creature found');
    await waitFor(() => expect(heading(container)).toBe('Orc'));
    expect(skeleton(container)).toBeNull();
  });

  it('keeps the statblocks after a linked note that cannot be read', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    placeTokens([unreadablePath, creaturePath]);
    installParsingBestiary();
    const { container } = render(<DMScreen isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(shown(container)).not.toBeNull());
    await waitFor(() => expect(heading(container)).toBe('Acid Burrower'));
    expect(container.querySelectorAll('.atlas-fantasy-statblock')).toHaveLength(1);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining(unreadablePath), expect.any(Error));
  });

  it('still shows the screen when looking its statblocks up fails', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    placeTokens([creaturePath]);
    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => { throw new Error('Fantasy Statblocks is unloading.'); } } });
    const { container } = render(<DMScreen isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(shown(container)).not.toBeNull());
    expect(container.querySelector('.atlas-dm-notes-section')).not.toBeNull();
    expect(errors).toHaveBeenCalledWith('[Atlas] Loading DM screen statblocks failed:', expect.any(Error));
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
