import React, { useRef } from 'react';
import {
  Plus, ChevronLeft, ChevronRight, FolderPlus, PanelLeft,
  Map as MapIcon, Swords, Castle,
} from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { App } from 'obsidian';
import type { Tab } from '../types';
import type { SelectionState } from '../hooks/useSelectionHandlers';
import { HeaderMenu, type HeaderMenuHandle } from './HeaderMenu';
import { modShortcut } from '../utils/modShortcut';
import { HeaderSearch } from './HeaderSearch';
import type { FilterSearch } from '../hooks/useFilterSearch';
import { useHeaderCompaction } from '../hooks/useHeaderCompaction';
import { TabSwitcher } from './TabSwitcher';
import { ArmariumActions } from './ArmariumActions';
import { CollectionGlyph } from './collectionGlyph';
import { TokenIcon } from '../../../../react/components/TokenIcon';
import { tabHasFolders } from '../utils/tabKinds';
import { t } from '../../../../i18n';

export interface HeaderProps {
  app: App;
  search: string;
  onSearch: (value: string) => void;
  /** Filters typed into the search and set in its filter panel. */
  query: FilterSearch;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  assetCounts: Record<Tab, number> | null;
  /** The collection could not be loaded: the tabs show no count and wait for none. */
  countsFailed?: boolean;
  onCreateTokens?: () => void;
  onCreateMap?: () => void;
  /** Opens the dungeon generator in a tab of its own. */
  onGenerateDungeon?: () => void;
  onCreateEncounter?: () => void;
  onCreateCollection?: () => void;
  onCreateFolder: () => void;
  /** Opens the Create menu from the manager's Cmd/Ctrl+N (`useAssetManagerShortcuts`). */
  createMenu?: React.Ref<HeaderMenuHandle>;
  sidebarToggleLabel: string;
  onToggleSidebar: () => void;
  sel: Pick<
    SelectionState,
    'navigationHistory' | 'handleNavigateBack' | 'handleNavigateForward'
  >;
  /**
   * Set while the Armarium is shown: no tab is current, Back leads to the library, and the store's actions stand
   * where the search and Create do, which belong to the library.
   */
  armarium?: { onBack: () => void; onReload: () => void } | undefined;
}

/**
 * One-row toolbar: navigation on the left, asset type in the
 * centre, search and create on the right. When its controls do not fit, the
 * tabs and the search fold into a menu and a button (`useHeaderCompaction`),
 * so they never overlap.
 */
export function Header({
  app,
  search,
  onSearch,
  query,
  activeTab,
  onTabChange,
  assetCounts,
  countsFailed = false,
  onCreateTokens,
  onCreateMap,
  onGenerateDungeon,
  onCreateEncounter,
  onCreateCollection,
  onCreateFolder,
  createMenu,
  sidebarToggleLabel,
  onToggleSidebar,
  sel,
  armarium,
}: HeaderProps): React.JSX.Element {
  const backLabel = armarium ? t('armarium.backToLibrary') : t('common.back');
  const toolbarRef = useRef<HTMLDivElement>(null);
  useHeaderCompaction(toolbarRef);

  return (
    <header className="atlas-asset-manager-header">
      <div className="atlas-am-toolbar" ref={toolbarRef}>
        <div className="atlas-am-toolbar-left">
          <LabelTooltip label={sidebarToggleLabel}>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn atlas-sidebar-toggle-btn"
              onClick={onToggleSidebar}
              aria-label={sidebarToggleLabel}
            >
              <PanelLeft />
            </Button>
          </LabelTooltip>
          <LabelTooltip label={backLabel}>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              onClick={armarium ? armarium.onBack : sel.handleNavigateBack}
              disabled={armarium === undefined && !sel.navigationHistory.canGoBack()}
            >
              <ChevronLeft />
            </Button>
          </LabelTooltip>
          <LabelTooltip label={t('am.header.forward')}>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              onClick={sel.handleNavigateForward}
              disabled={armarium !== undefined || !sel.navigationHistory.canGoForward()}
            >
              <ChevronRight />
            </Button>
          </LabelTooltip>
        </div>

        <div className="atlas-am-toolbar-center">
          <TabSwitcher activeTab={armarium ? null : activeTab} onTabChange={onTabChange} assetCounts={assetCounts} countsFailed={countsFailed} />
        </div>

        {armarium ? (
          <div className="atlas-am-toolbar-right atlas-am-toolbar-right--armarium">
            <ArmariumActions onReload={armarium.onReload} />
          </div>
        ) : (
          <div className="atlas-am-toolbar-right">
            {/* Its Cmd/Ctrl+F lives in the manager's own key scope (`useAssetManagerShortcuts`), which a dialog over it lifts. */}
            <HeaderSearch app={app} search={search} onSearch={onSearch} query={query} shortcut={false} shortcutShown />
            <HeaderMenu
              label={t('am.header.create')}
              triggerClassName="atlas-asset-manager-create-btn"
              triggerVariant="default"
              iconTrigger
              triggerContent={<Plus />}
              shortcut={modShortcut('n')}
              handle={createMenu}
              items={[
                { key: 'token', label: t('am.header.createToken'), icon: <TokenIcon />, onSelect: onCreateTokens },
                { key: 'map', label: t('am.header.addMap'), icon: <MapIcon />, onSelect: onCreateMap },
                { key: 'dungeon', label: t('am.header.generateDungeon'), icon: <Castle />, onSelect: onGenerateDungeon },
                { key: 'encounter', label: t('am.header.createEncounter'), icon: <Swords />, onSelect: onCreateEncounter },
                { key: 'folder', label: t('am.header.newFolder'), icon: <FolderPlus />, disabled: !tabHasFolders(activeTab), onSelect: onCreateFolder },
                { key: 'collection', label: t('am.header.createCollection'), icon: <CollectionGlyph />, separated: true, onSelect: onCreateCollection },
              ]}
            />
          </div>
        )}
      </div>
    </header>
  );
}
