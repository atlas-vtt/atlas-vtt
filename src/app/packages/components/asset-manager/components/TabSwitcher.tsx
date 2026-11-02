import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Tab } from '../types';
import { tabs, getTabDisplayName } from '../types';
import { HeaderMenu } from './HeaderMenu';
import { Skeleton } from '../../primitives/Skeleton';
import { t } from '../../../../i18n';

export interface TabSwitcherProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  /** How many assets each tab holds; null while they are being counted. */
  assetCounts: Record<Tab, number> | null;
}

/** A tab's count, or its placeholder while the collection is being counted: never a wrong 0. */
function TabCount({ count }: { count: number | undefined }): React.JSX.Element {
  return <span className="atlas-tab-count">{count ?? <Skeleton shape="text" live />}</span>;
}

/**
 * The asset type tabs. Wide headers show them side by side; narrow ones show
 * the current type as a menu button instead (the toolbar's `data-compact`
 * steps pick one), so the toolbar stays a single row.
 */
export function TabSwitcher({ activeTab, onTabChange, assetCounts }: TabSwitcherProps): React.JSX.Element {
  const labelId = useId();
  const activeName = getTabDisplayName(activeTab);

  return (
    <>
      <nav className="atlas-asset-manager-tabs" aria-labelledby={labelId}>
        <span id={labelId} hidden>{t('am.tabs.assetType')}</span>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`atlas-tab-button ${activeTab === tab ? 'atlas-active' : ''}`}
            onClick={() => onTabChange(tab)}
            aria-current={activeTab === tab ? 'page' : undefined}
          >
            <span className="atlas-tab-label">{getTabDisplayName(tab)}</span>
            <TabCount count={assetCounts?.[tab]} />
          </button>
        ))}
      </nav>

      <HeaderMenu
        className="atlas-am-tab-menu"
        label={t('am.tabs.current', { name: activeName })}
        triggerClassName="atlas-am-tab-menu-trigger"
        align="center"
        triggerContent={
          <>
            <span className="atlas-tab-label">{activeName}</span>
            <TabCount count={assetCounts?.[activeTab]} />
            <ChevronDown className="atlas-am-tab-menu-chevron" />
          </>
        }
        items={tabs.map((tab) => ({
          key: tab,
          label: getTabDisplayName(tab),
          ...(assetCounts ? { detail: assetCounts[tab] } : {}),
          checked: tab === activeTab,
          onSelect: () => onTabChange(tab),
        }))}
      />
    </>
  );
}
