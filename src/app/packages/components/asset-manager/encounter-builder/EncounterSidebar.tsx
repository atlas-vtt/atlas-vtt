import React from 'react';
import type { App } from 'obsidian';
import { Button } from '../../primitives/button';
import { CloseButton } from '../../primitives/CloseButton';
import { OverlayScroll } from '../../primitives/OverlayScroll';
import { HeaderSearch } from '../components/HeaderSearch';
import { CreatureFilterControls, hiddenFilterText } from '../components/search/CreatureFilterControls';
import type { FilterSearch } from '../hooks/useFilterSearch';
import { t } from '../../../../i18n';

interface EncounterSidebarProps {
  app: App;
  /** Id of the title, which names the builder's dialog. */
  titleId: string;
  title: string;
  search: string;
  onSearch: (search: string) => void;
  query: FilterSearch;
  onClose: () => void;
}

/**
 * The builder's left side: its title, the search and every filter the collection's creatures
 * offer, always open, so what can be filtered is seen without opening anything.
 */
export function EncounterSidebar({ app, titleId, title, search, onSearch, query, onClose }: EncounterSidebarProps): React.JSX.Element {
  const { panel } = query;
  const hidden = panel ? hiddenFilterText(panel.result.hidden) : null;
  return (
    <aside className="atlas-encounter-builder__sidebar" aria-labelledby={titleId}>
      <header className="atlas-encounter-builder__sidebar-header">
        <h2 id={titleId} className="atlas-encounter-builder__title">{title}</h2>
        <CloseButton onClick={onClose} />
      </header>
      <div className="atlas-encounter-builder__search">
        <HeaderSearch app={app} search={search} onSearch={onSearch} query={query} label={t('encounter.builder.search')} filterButton={false} />
      </div>
      {panel && (
        <OverlayScroll
          frameClassName="atlas-encounter-builder__filters-frame"
          className="atlas-filter-panel__body atlas-encounter-builder__filters"
          role="group"
          aria-label={t('filters.title')}
        >
          {/* Every creature listed has a statblock, so with or without one filters nothing. */}
          <CreatureFilterControls panel={panel} statblockFilter={false} />
        </OverlayScroll>
      )}
      <footer className="atlas-filter-panel__footer atlas-encounter-builder__sidebar-footer">
        {hidden && <span className="atlas-filter-panel__hidden" role="status">{hidden}</span>}
        <Button variant="ghost" className="atlas-filter-panel__reset" disabled={query.activeCount === 0 && !search} onClick={query.reset}>
          {t('common.reset')}
        </Button>
      </footer>
    </aside>
  );
}
