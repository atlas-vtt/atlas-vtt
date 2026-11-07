// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TokenCreator } from '../../../../src/app/packages/components/asset-manager/TokenCreator';
import {
  createTokenStatblocks, nameList, tokenStatblocksMessage, type SavedToken,
} from '../../../../src/app/packages/components/asset-manager/token-creator/tokenStatblocks';
import { AtlasUIContext } from '../../../../src/app/react/root/AtlasUIContext';
import { AssetService } from '../../../../src/app/services/AssetService';
import { TokenStatblockLinkService } from '../../../../src/app/services/TokenStatblockLinkService';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { stubLayout } from '../../../mocks/jsdomLayout';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';

const fake = vi.hoisted(() => ({ save: vi.fn(), create: vi.fn() }));
vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: vi.fn() } }));
vi.mock('../../../../src/app/packages/components/asset-manager/token-creator/useAssetCatalog', () => ({
  useAssetCatalog: () => ({ assetService: {}, collections: [{ id: 'marsh', name: 'Marsh' }] }),
}));
vi.mock('../../../../src/app/packages/components/asset-manager/token-creator/useAssetTags', () => ({
  useAssetTags: () => ({ tags: [], createTag: vi.fn(), isCreatingTag: false }),
}));
vi.mock('../../../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews', () => ({ saveTokenPreviews: fake.save }));
vi.mock('../../../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({
  convertForPreview: async () => ({ image: new Blob(['art']), thumbnail: null, preview: null, sourcePreview: null }),
}));
stubLayout({ width: 800, height: 600 });

const ROLES = [
  { id: 'monster', name: 'Monster', templateId: 'builtin:generic-creature' },
  { id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' },
];

let harness: NoteHarness;
let link: ReturnType<typeof vi.fn>;
const app = (): App => harness.app as unknown as App;

beforeEach(() => {
  harness = noteHarness({});
  link = vi.fn(async () => true);
  vi.mocked(TokenStatblockLinkService.getInstance).mockReturnValue({ linkTokenToStatblock: link } as unknown as TokenStatblockLinkService);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getDefaultCollectionId: () => 'marsh',
    getCollectionSettings: () => ({ conditions: [], statblockRoles: ROLES, statblockRoleFolders: { monster: 'Bestiary' } }),
  } as unknown as AssetService);
});

afterEach(() => {
  cleanup();
  TemplateLibrary.release(app());
  NoteFieldWriter.release(app());
  vi.restoreAllMocks();
});

describe('createTokenStatblocks', () => {
  it('gives every new token a linked statblock of the role, in the role\'s folder, and keeps the links tokens have', async () => {
    const tokens: SavedToken[] = [
      { name: 'Wolf', imagePath: 'atlas-vtt/assets/wolf.webp' },
      { name: 'Goblin', imagePath: 'atlas-vtt/assets/goblin.webp', statblockPath: 'Bestiary/Goblin.md' },
      { name: 'Owl', imagePath: 'atlas-vtt/assets/owl.webp' },
    ];
    const result = await createTokenStatblocks(app(), tokens, 'marsh', 'monster');

    expect(result).toEqual({ created: ['Wolf', 'Owl'], failed: [] });
    expect(harness.files.get('Bestiary/Wolf.md')).toMatch(/^---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Wolf\nimage: atlas-vtt\/assets\/wolf\.webp\n---\n/);
    expect(harness.files.has('Bestiary/Goblin.md')).toBe(false);
    expect(link.mock.calls.map(([image, note]) => [image, note])).toEqual([
      ['atlas-vtt/assets/wolf.webp', 'Bestiary/Wolf.md'],
      ['atlas-vtt/assets/owl.webp', 'Bestiary/Owl.md'],
    ]);
  });

  it('names what it made in its notice', () => {
    expect(nameList(['Wolf', 'Bear', 'Owl'])).toBe('Wolf, Bear and Owl');
    expect(nameList(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toBe('A, B, C, D, E and 2 more');
    expect(tokenStatblocksMessage({ created: ['Wolf', 'Owl'], failed: [] })).toBe('Created statblocks for Wolf and Owl.');
    expect(tokenStatblocksMessage({ created: ['Wolf'], failed: ['Owl'] })).toBe('Created a statblock for Wolf. Couldn\'t create a statblock for Owl.');
  });
});

describe('the token creator\'s Statblocks row (M6)', () => {
  function open(): void {
    Object.assign(harness.app.workspace, { trigger: vi.fn() });
    render(
      <AtlasUIContext.Provider value={{ app: app(), view: null, pixiApp: null, renderer: null }}>
        <TokenCreator isOpen onClose={vi.fn()} selectedCollection="marsh" />
      </AtlasUIContext.Provider>,
    );
  }

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    fake.save.mockReset();
  });

  it('is absent while the statblock editor is off', () => {
    open();
    expect(screen.queryByText('Statblocks')).toBeNull();
  });

  it('gives each saved token a statblock of the chosen role', async () => {
    withStatblockEditor(app());
    fake.save.mockImplementation(async (options: { onTokensSaved?: (tokens: SavedToken[]) => void }) => {
      options.onTokensSaved?.([{ name: 'Wolf', imagePath: 'atlas-vtt/assets/wolf.webp' }]);
      return 1;
    });
    open();
    expect(screen.getByText('Statblocks')).toBeTruthy();
    expect(screen.getByText('New tokens get no statblock.')).toBeTruthy();

    fireEvent.click(screen.getByRole('combobox', { name: 'Statblocks' }));
    fireEvent.click(await screen.findByRole('option', { name: /^NPC/ }));
    expect(screen.getByText('Each new token gets a statblock of this role, linked to it.')).toBeTruthy();

    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [new File(['art'], 'Wolf.png', { type: 'image/png' })] } });
    await screen.findByDisplayValue('Wolf');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Create.*↵/ })); });
    await waitFor(() => expect(harness.files.has('Wolf.md')).toBe(true));
    expect(harness.files.get('Wolf.md')).toContain('atlas-template: builtin:generic-npc');
    expect(link).toHaveBeenCalledWith('atlas-vtt/assets/wolf.webp', 'Wolf.md');
  });
});
