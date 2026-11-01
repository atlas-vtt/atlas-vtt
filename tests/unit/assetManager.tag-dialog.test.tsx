// @vitest-environment jsdom
import React, { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { TagSearchModal } from '../../src/app/packages/components/asset-manager/TagSearchModal';
import { buildAssetContextMenuEntries, type AssetContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import { t } from '../../src/app/i18n';
import { useAssetManagerEffects } from '../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';
import type { AssetTagChange } from '../../src/app/packages/components/asset-manager/utils/assetTags';

type EffectDeps = Parameters<typeof useAssetManagerEffects>[0];

function Harness({ onClose, transfer = null }: { onClose: () => void; transfer?: EffectDeps['crud']['transfer'] }): React.ReactElement {
  const modalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useAssetManagerEffects({
    isOpen: true, onClose, initialTab: undefined, modalRef, containerRef,
    setSearch: vi.fn(), setActiveTab: vi.fn(), setIsSidebarCollapsed: vi.fn(), setSelectedCollection: vi.fn(),
    data: {} as EffectDeps['data'],
    sel: {
      selectedAssetIds: [], setSelectedAssetIds: vi.fn(), setSelectedFolderIds: vi.fn(),
      setSelectedFolderId: vi.fn(), setSelectedTagIds: vi.fn(), setSpawnCounts: vi.fn(),
      navigationHistory: { clear: vi.fn(), push: vi.fn() },
    } as EffectDeps['sel'],
    crud: {
      isTokenCreatorOpen: false, isMapCreatorOpen: false, isCreateSceneModalOpen: false,
      isMoveModalOpen: false, settingsModalCollectionId: null,
      inputModalState: { isOpen: false }, setEditingToken: vi.fn(), transfer,
    } as EffectDeps['crud'],
    tags: { isTagManagerOpen: false } as EffectDeps['tags'],
    statblock: { linkingStatblockAsset: null } as EffectDeps['statblock'],
  });
  return <div ref={modalRef} tabIndex={-1}>
    <div ref={containerRef}>Asset manager</div>
  </div>;
}

let modal: TagSearchModal | undefined;
afterEach(() => {
  act(() => modal?.close());
  modal = undefined;
  cleanup();
});

function setup(): { onClose: ReturnType<typeof vi.fn>; onSetTags: ReturnType<typeof vi.fn>; onCreateTag: ReturnType<typeof vi.fn> } {
  const onClose = vi.fn();
  const onSetTags = vi.fn();
  const onCreateTag = vi.fn();
  render(<Harness onClose={onClose} />);
  const assets: AnyAsset[] = [
    { id: 'token', type: 'tokens', name: 'Dragon token', imageUrl: '', tags: [], modifiedAt: 0 },
    { id: 'scene', type: 'scenes', name: 'Dragon scene', tags: [], modifiedAt: 0 },
  ];
  // Use the real independent React root opened by the asset context menu.
  modal = new TagSearchModal(new App(), {
    selectedAssets: assets, allAssets: assets,
    availableTags: [{ id: 'dragon', name: 'Dragon' }], onSetTags, onCreateTag,
  });
  act(() => modal?.open());
  return { onClose, onSetTags, onCreateTag };
}

function clickWithMouseDown(element: Element): void {
  fireEvent.mouseDown(element);
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

const savedTags = (changes: AssetTagChange[]): [string, string[]][] => changes.map(({ asset, tags }) => [asset.id, tags]);

it('searches and toggles tags without dismissing the asset manager', () => {
  const { onClose, onSetTags } = setup();
  const input = screen.getByRole('textbox');
  clickWithMouseDown(input);
  fireEvent.change(input, { target: { value: 'drag' } });
  clickWithMouseDown(screen.getByText('Dragon'));
  expect(onSetTags).toHaveBeenCalledOnce();
  expect(savedTags(onSetTags.mock.calls[0]![0])).toEqual([['token', ['Dragon']], ['scene', ['Dragon']]]);
  expect(screen.getByText('Dragon').closest('.atlas-tag-search__item')?.classList.contains('atlas-tag-search__item--selected')).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByText('Manage Tags')).not.toBeNull();
});

it.each(['Done', 'Cancel', 'Close', 'backdrop'])('%s dismisses only the tag dialog, preserving outside-click dismissal afterward', (action) => {
  const { onClose } = setup();
  clickWithMouseDown(action === 'backdrop'
    ? screen.getByRole('textbox').closest('.atlas-modal-overlay')!
    : screen.getByRole('button', { name: action }));
  expect(screen.queryByText('Manage Tags')).toBeNull();
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.mouseDown(document.body);
  expect(onClose).toHaveBeenCalledOnce();
});

it('creates a tag without dismissing the asset manager', () => {
  const { onClose, onCreateTag } = setup();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Undead' } });
  clickWithMouseDown(screen.getByText('Create “Undead”'));
  expect(onCreateTag).toHaveBeenCalledExactlyOnceWith('Undead', expect.any(Array));
  expect(screen.queryByText('Manage Tags')).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

describe('a tag some of the selected assets hold', () => {
  function openMixed(): { onSetTags: ReturnType<typeof vi.fn> } {
    const onSetTags = vi.fn();
    const assets: AnyAsset[] = [
      { id: 'tagged', type: 'tokens', name: 'Tagged', imageUrl: '', tags: ['Dragon', 'Boss'], modifiedAt: 0 },
      { id: 'by-id', type: 'tokens', name: 'By id', imageUrl: '', tags: ['dragon'], modifiedAt: 0 },
      { id: 'bare', type: 'tokens', name: 'Bare', imageUrl: '', tags: ['Forest'], modifiedAt: 0 },
    ];
    modal = new TagSearchModal(new App(), {
      selectedAssets: assets, allAssets: assets,
      availableTags: [{ id: 'dragon', name: 'Dragon' }], onSetTags, onCreateTag: vi.fn(),
    });
    act(() => modal?.open());
    return { onSetTags };
  }
  const dragonRow = (): Element => screen.getByText('Dragon').closest('.atlas-tag-search__item')!;

  it('shows mixed, goes to all of them when pressed and from all of them when pressed again', () => {
    const { onSetTags } = openMixed();
    expect(dragonRow().classList.contains('atlas-tag-search__item--partial')).toBe(true);

    clickWithMouseDown(dragonRow());
    expect(onSetTags).toHaveBeenCalledOnce();
    expect(savedTags(onSetTags.mock.calls[0]![0])).toEqual([['bare', ['Forest', 'Dragon']]]);
    expect(dragonRow().classList.contains('atlas-tag-search__item--selected')).toBe(true);

    clickWithMouseDown(dragonRow());
    expect(onSetTags).toHaveBeenCalledTimes(2);
    expect(savedTags(onSetTags.mock.calls[1]![0])).toEqual([['tagged', ['Boss']], ['by-id', []], ['bare', ['Forest']]]);
    expect(dragonRow().classList.contains('atlas-tag-search__item--selected')).toBe(false);
    expect(dragonRow().classList.contains('atlas-tag-search__item--partial')).toBe(false);
  });
});

it('ignores its own Escape shortcut while a collection transfer dialog is open', () => {
  const onClose = vi.fn();
  render(<Harness onClose={onClose} transfer={{ step: 'done', title: 'Collection imported', message: 'Done' }} />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
});

describe('the asset menu\'s Manage Tags dialog', () => {
  const UNDEAD = { id: 'undead', name: 'Undead' };

  afterEach(() => {
    const done = screen.queryByRole('button', { name: 'Done' });
    if (done) act(() => fireEvent.click(done));
  });

  function openFor(tags: string[]): { setTagsOfAssets: ReturnType<typeof vi.fn>; token: AnyAsset } {
    const token: AnyAsset = { id: 'ghoul', type: 'tokens', name: 'Ghoul', imageUrl: '', tags, modifiedAt: 0 };
    const setTagsOfAssets = vi.fn(async (): Promise<void> => {});
    const handleCreateTag = vi.fn(async () => ({ id: 'risen-dead', name: 'Risen Dead' }));
    const deps = {
      app: new App(), folders: [], transferTargets: [], selectedAssetIds: [], assets: [token],
      availableTags: [UNDEAD], setTagsOfAssets, handleCreateTag,
    } as unknown as AssetContextMenuDeps;
    const entry = buildAssetContextMenuEntries(token, [token], deps)
      .find((candidate) => candidate.type === 'item' && candidate.label === t('am.menu.tags'));
    if (entry?.type !== 'item') throw new Error('no Tags entry');
    act(() => { void entry.onClick?.(); });
    return { setTagsOfAssets, token };
  }

  const row = (name: string): Element => screen.getByText(name).closest('.atlas-tag-search__item')!;
  const isSelected = (name: string): boolean => row(name).classList.contains('atlas-tag-search__item--selected');

  it('shows and removes a tag the token carries by name, as Edit Token stores it', () => {
    const { setTagsOfAssets, token } = openFor(['Undead']);
    expect(isSelected('Undead')).toBe(true);
    clickWithMouseDown(row('Undead'));
    expect(setTagsOfAssets).toHaveBeenCalledExactlyOnceWith([{ asset: token, tags: [] }]);
    expect(isSelected('Undead')).toBe(false);
  });

  it('removes a tag an older version stored by id', () => {
    const { setTagsOfAssets, token } = openFor(['undead']);
    clickWithMouseDown(row('Undead'));
    expect(setTagsOfAssets).toHaveBeenCalledExactlyOnceWith([{ asset: token, tags: [] }]);
  });

  it('adds a tag by name, as the card\'s tag menu and the creators do', () => {
    const { setTagsOfAssets, token } = openFor([]);
    clickWithMouseDown(row('Undead'));
    expect(setTagsOfAssets).toHaveBeenCalledExactlyOnceWith([{ asset: token, tags: ['Undead'] }]);
    expect(isSelected('Undead')).toBe(true);
  });

  it('adds a tag it creates by name', async () => {
    const { setTagsOfAssets, token } = openFor([]);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Risen Dead' } });
    clickWithMouseDown(screen.getByText('Create “Risen Dead”'));
    await vi.waitFor(() => expect(setTagsOfAssets).toHaveBeenCalledExactlyOnceWith([{ asset: token, tags: ['Risen Dead'] }]));
  });
});
