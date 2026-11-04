import React from 'react';
import { History, Sparkles } from 'lucide-react';
import type { LootPane } from '../../../stores/lootRollerSlice';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';

interface LootPaneTabsProps {
  pane: LootPane;
  historyCount: number;
  onSelect: (pane: LootPane) => void;
  onClearHistory: () => void;
}

/** Switches the list between the latest roll and the collection's history. */
export function LootPaneTabs({ pane, historyCount, onSelect, onClearHistory }: LootPaneTabsProps): React.ReactElement {
  return (
    <div className="atlas-loot-pane-tabs">
      <div className="atlas-loot-pane-tabs__switch" role="tablist" aria-label={t('loot.tabs.list')}>
        <LabelTooltip describe label={t('loot.tabs.latestHint')}>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'results'}
            className={`atlas-loot-pane-tab${pane === 'results' ? ' atlas-active' : ''}`}
            onClick={() => onSelect('results')}
          >
            <Sparkles />
            {t('loot.tabs.latest')}
          </button>
        </LabelTooltip>
        <LabelTooltip describe label={t('loot.tabs.historyHint')}>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'history'}
            className={`atlas-loot-pane-tab${pane === 'history' ? ' atlas-active' : ''}`}
            onClick={() => onSelect('history')}
          >
            <History />
            {t('loot.tabs.history')}
            <span className="atlas-tab-count">{historyCount}</span>
          </button>
        </LabelTooltip>
      </div>
      {pane === 'history' && historyCount > 0 && (
        <LabelTooltip describe label={t('loot.tabs.clearHint')}>
          <button type="button" className="atlas-loot-text-button" onClick={onClearHistory}>{t('loot.tabs.clear')}</button>
        </LabelTooltip>
      )}
    </div>
  );
}
