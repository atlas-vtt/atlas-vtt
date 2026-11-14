import type * as React from 'react';
import { useEffect, useRef } from 'react';
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
import { handledByAnotherControl } from '../../../../keyboard/tooltipEscape';
import { hasOpenDialog } from '../utils/openDialogs';
import { isPressOutsideWindow } from '../utils/outsidePress';
import { focusSearchUntouched, isSearchUntouched } from '../components/search/searchFocus';
import { typeToSearch } from '../components/search/typeToSearch';

/** Layers that open over the manager and take their keys for themselves: Escape closes them, never the manager under them. */
const OPEN_LAYERS = '.modal-container, .prompt, .suggestion-container, .menu, .atlas-ctx-menu, [role="menu"], .atlas-text-dialog-backdrop, .atlas-asset-manager-move-modal';
/** The window's search field where it stands in the toolbar row; a narrow header folds it into a button, which opens it over the row. */
const SEARCH_FIELD = '.atlas-am-toolbar:not([data-compact~="search"]) .atlas-asset-manager-search input';
/** Keys that bring focus into the grid from anywhere in the manager that does not use them itself. */
const GRID_ENTRY_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
/** Where those keys already have a use: lists, menus, dialogs, sliders, text. */
const OWNS_ARROWS = '[role="listbox"], [role="menu"], [role="dialog"], [role="slider"], [role="radiogroup"], [role="tablist"]';
/** Layers that keep Tab while focus is in them: a menu closes on it, a picker or panel keeps focus inside (`useFocusTrap`). */
const OWNS_TAB = '[role="menu"], [role="dialog"], [role="listbox"], .atlas-collection-dropdown-content, .menu, .atlas-ctx-menu';

/** Focuses the grid's tab stop (the card focus was on last), else the first folder; false when there is none. */
function focusGrid(container: HTMLElement | null): boolean {
  const target = container?.querySelector<HTMLElement>('.atlas-asset-grid-virtual [role="option"][tabindex="0"]')
    ?? container?.querySelector<HTMLElement>('.atlas-folder-grid [role="option"]');
  target?.focus();
  return target !== null && target !== undefined;
}

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
  setSearch: (value: string) => void;
}

export function useAssetManagerEffects({
  isOpen, onClose,
  modalRef, containerRef,
  activeTab, changeTab,
  data, sel, crud, tags, statblock, setSearch,
}: EffectDeps): void {
  const isAnySubModalOpen = hasOpenDialog(crud, tags, statblock);

  // Separate from the shortcuts below, whose handler is re-registered on most renders
  // and must not pull focus out of the search field while typing.
  // A dialog that closed gave focus back to what opened it (`useFocusReturn`): only focus resting outside the window
  // (on the map, a dialog going away, nowhere) comes to the window itself.
  // As it opens, the window's search takes focus (decision #38), unless it is folded into a button.
  const openedAt = useRef(false);
  useEffect(() => {
    const root = modalRef.current;
    const opening = isOpen && !openedAt.current;
    openedAt.current = isOpen;
    if (!isOpen || isAnySubModalOpen || !root || root.contains(root.ownerDocument.activeElement)) return;
    const search = opening ? root.querySelector<HTMLInputElement>(SEARCH_FIELD) : null;
    if (search) focusSearchUntouched(search);
    else root.focus();
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
        // A menu, picker or dialog over the manager took this Escape for itself.
        if (handledByAnotherControl(e) || document.querySelector(OPEN_LAYERS)) return;
        e.preventDefault();
        if (sel.selectedAssetIds.length > 0) {
          sel.setSelectedAssetIds([]);
          return;
        }
        onClose();
        return;
      }
      if (GRID_ENTRY_KEYS.has(e.key) && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as Partial<Element> | null;
        if ((isTextEntryTarget(e.target) && !isSearchUntouched(e.target)) || target?.closest?.(OWNS_ARROWS)) return;
        if (focusGrid(containerRef.current)) e.preventDefault();
        return;
      }
      if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // A menu, picker or panel that is open keeps the key; the one it was pressed in may be gone already.
        const target = e.target as Partial<Element> | null;
        if (e.defaultPrevented || target?.closest?.(OWNS_TAB) || document.querySelector(OPEN_LAYERS)) return;
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        changeTab(tabs[(tabs.indexOf(activeTab) + direction + tabs.length) % tabs.length]!);
        return;
      }
      typeToSearch(e, modalRef.current, setSearch);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose, sel.selectedAssetIds, isAnySubModalOpen, data.app, activeTab, changeTab, setSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent): void => {
      if (isAnySubModalOpen) return;
      if (isPressOutsideWindow(e.target, containerRef.current)) {
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
