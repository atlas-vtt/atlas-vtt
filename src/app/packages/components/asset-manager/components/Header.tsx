import React, { useRef } from 'react';
import {
  Plus, ChevronLeft, ChevronRight, FolderPlus, PanelLeft,
  Map as MapIcon, FolderOpen, Swords,
} from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { App } from 'obsidian';
import type { Tab } from '../types';
import type { SelectionState } from '../hooks/useSelectionHandlers';
import { HeaderMenu } from './HeaderMenu';
import { HeaderSearch } from './HeaderSearch';
import type { FilterSearch } from '../hooks/useFilterSearch';
import { useHeaderCompaction } from '../hooks/useHeaderCompaction';
import { TabSwitcher } from './TabSwitcher';
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
  onCreateTokens?: () => void;
  onCreateMap?: () => void;
  onCreateEncounter?: () => void;
  onCreateCollection?: () => void;
  onCreateFolder: () => void;
  sidebarToggleLabel: string;
  onToggleSidebar: () => void;
  sel: Pick<
    SelectionState,
    'navigationHistory' | 'handleNavigateBack' | 'handleNavigateForward'
  >;
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
  onCreateTokens,
  onCreateMap,
  onCreateEncounter,
  onCreateCollection,
  onCreateFolder,
  sidebarToggleLabel,
  onToggleSidebar,
  sel,
}: HeaderProps): React.JSX.Element {
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
          <LabelTooltip label={t('common.back')}>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              onClick={sel.handleNavigateBack}
              disabled={!sel.navigationHistory.canGoBack()}
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
              disabled={!sel.navigationHistory.canGoForward()}
            >
              <ChevronRight />
            </Button>
          </LabelTooltip>
        </div>

        <div className="atlas-am-toolbar-center">
          <TabSwitcher activeTab={activeTab} onTabChange={onTabChange} assetCounts={assetCounts} />
        </div>

        <div className="atlas-am-toolbar-right">
          <HeaderSearch app={app} search={search} onSearch={onSearch} query={query} />
          <HeaderMenu
            label={t('am.header.create')}
            triggerClassName="atlas-asset-manager-create-btn"
            triggerVariant="default"
            iconTrigger
            triggerContent={<Plus />}
            items={[
              { key: 'token', label: t('am.header.createToken'), icon: <TokenIcon />, onSelect: onCreateTokens },
              { key: 'map', label: t('am.header.addMap'), icon: <MapIcon />, onSelect: onCreateMap },
              { key: 'encounter', label: t('am.header.createEncounter'), icon: <Swords />, onSelect: onCreateEncounter },
              { key: 'folder', label: t('am.header.newFolder'), icon: <FolderPlus />, disabled: !tabHasFolders(activeTab), onSelect: onCreateFolder },
              { key: 'collection', label: t('am.header.createCollection'), icon: <FolderOpen />, separated: true, onSelect: onCreateCollection },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
