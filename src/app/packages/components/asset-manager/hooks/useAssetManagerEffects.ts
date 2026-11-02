import type * as React from 'react';
import { useEffect } from 'react';
import type { Tab } from '../types';
import { tabs } from '../types';
import type { AssetData } from './useAssetData';
import type { SelectionState } from './useSelectionHandlers';
import type { AssetCrudActions } from './useAssetCrud';
import type { TagsAndCollectionsState } from './useTagsAndCollections';
import type { StatblockLinkState } from './useStatblockLink';
import { isShortcutScopeActive } from '../../../../utils/activeLeafGuard';
import { matchesMapHotkey } from '../../../../keyboard/mapHotkeys';
import { isTextEntryTarget } from '../../../../keyboard/textEntry';
import { SettingsService } from '../../../../services/SettingsService';

interface EffectDeps {
  isOpen: boolean;
  onClose: () => void;
  modalRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  activeTab: Tab;
  changeTab: (tab: Tab) => void;
  data: AssetData;
  sel: SelectionState;
  crud: AssetCrudActions;
  tags: TagsAndCollectionsState;
  statblock: StatblockLinkState;
}

export function useAssetManagerEffects({
  isOpen, onClose,
  modalRef, containerRef,
  activeTab, changeTab,
  data, sel, crud, tags, statblock,
}: EffectDeps): void {
  const isAnySubModalOpen =
    crud.isTokenCreatorOpen || crud.isEncounterBuilderOpen || crud.isMapCreatorOpen ||
    crud.isCreateSceneModalOpen || crud.inputModalState.isOpen ||
    crud.isMoveModalOpen || crud.settingsModalCollectionId !== null || crud.isCreateCollectionModalOpen ||
    tags.isTagManagerOpen ||
    statblock.linkingStatblockAsset !== null || crud.transfer !== null;

  // Separate from the shortcuts below, whose handler is re-registered on most renders
  // and must not pull focus out of the search field while typing.
  useEffect(() => {
    if (isOpen && !isAnySubModalOpen) modalRef.current?.focus();
  }, [isOpen, isAnySubModalOpen]);

  useEffect(() => {
    if (!isOpen || isAnySubModalOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (document.querySelector('.atlas-onboarding-overlay')) return;
      if (!isShortcutScopeActive(modalRef.current)) return;
      // Map shortcuts are suspended while this modal is open, so it owns closing
      // via the asset-manager binding. Consume the event before it reaches the map.
      if (!e.defaultPrevented && matchesMapHotkey(e, 'assets', SettingsService.forApp(data.app))) {
        if (isTextEntryTarget(e.target)) return;
        if (document.querySelector('.modal-container, .prompt, .suggestion-container, .menu, .atlas-ctx-menu')) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Escape') {
        if (sel.selectedAssetIds.length > 0) {
          sel.setSelectedAssetIds([]);
          e.preventDefault();
          return;
        }
        onClose();
      }
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        changeTab(tabs[(tabs.indexOf(activeTab) + direction + tabs.length) % tabs.length]!);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        containerRef.current?.querySelector<HTMLInputElement>('.atlas-asset-manager-search input')?.select();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) { changeTab(tabs[idx]!); e.preventDefault(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose, sel.selectedAssetIds, isAnySubModalOpen, data.app, activeTab, changeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent): void => {
      if (isAnySubModalOpen) return;
      const t = e.target as Element;
      if (
        t.closest('.atlas-onboarding-overlay') || t.closest('.menu') || t.closest('.atlas-ctx-menu') ||
        t.closest('.modal-container') || t.closest('.modal') ||
        t.closest('.atlas-text-dialog-backdrop') ||
        t.closest('.atlas-collection-settings-overlay') ||
        t.closest('.atlas-statblock-preview-window')
      ) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // The tag filter stays: the manager reopens where it was left
        onClose();
        sel.setSelectedAssetIds([]);
        sel.setSelectedFolderIds([]);
        crud.setEditingToken(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, isAnySubModalOpen]);

  useEffect(() => {
    const handler = (event: WindowEventMap['create-scene-from-map']): void => {
      crud.openCreateSceneModalFromMap(event.detail);
    };
    window.addEventListener('create-scene-from-map', handler);
    return () => window.removeEventListener('create-scene-from-map', handler);
  }, []);
}
