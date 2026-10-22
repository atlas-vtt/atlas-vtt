// @vitest-environment jsdom
import React, { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { TagSearchModal } from '../../src/app/packages/components/asset-manager/TagSearchModal';
import { useAssetManagerEffects } from '../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';

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

function setup(): { onClose: ReturnType<typeof vi.fn>; onToggleTag: ReturnType<typeof vi.fn>; onCreateTag: ReturnType<typeof vi.fn> } {
  const onClose = vi.fn();
  const onToggleTag = vi.fn();
  const onCreateTag = vi.fn();
  render(<Harness onClose={onClose} />);
  const assets: AnyAsset[] = [
    { id: 'token', type: 'tokens', name: 'Dragon token', imageUrl: '', tags: [], modifiedAt: 0 },
    { id: 'scene', type: 'scenes', name: 'Dragon scene', tags: [], modifiedAt: 0 },
  ];
  // Use the real independent React root opened by the asset context menu.
  modal = new TagSearchModal(new App(), {
    selectedAssets: assets, allAssets: assets,
    availableTags: [{ id: 'dragon', name: 'Dragon' }], onToggleTag, onCreateTag,
  });
  act(() => modal?.open());
  return { onClose, onToggleTag, onCreateTag };
}

function clickWithMouseDown(element: Element): void {
  fireEvent.mouseDown(element);
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

it('searches and toggles tags without dismissing the asset manager', () => {
  const { onClose, onToggleTag } = setup();
  const input = screen.getByRole('textbox');
  clickWithMouseDown(input);
  fireEvent.change(input, { target: { value: 'drag' } });
  clickWithMouseDown(screen.getByText('Dragon'));
  expect(onToggleTag).toHaveBeenCalledOnce();
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

it('ignores its own Escape shortcut while a collection transfer dialog is open', () => {
  const onClose = vi.fn();
  render(<Harness onClose={onClose} transfer={{ step: 'done', title: 'Collection imported', message: 'Done' }} />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
});
