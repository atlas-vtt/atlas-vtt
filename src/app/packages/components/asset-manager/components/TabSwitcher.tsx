import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Tab } from '../types';
import { tabs, getTabDisplayName } from '../types';
import { HeaderMenu, type HeaderMenuItem } from './HeaderMenu';
import { Skeleton } from '../../primitives/Skeleton';
import { ObsidianIcon } from '../../../../react/components/ObsidianIcon';
import type { ExtensionTabs } from '../../../../extensions/useExtensionTabs';
import type { AssetTabSpec } from '../../../../../api/types/ui';
import { t } from '../../../../i18n';

export interface TabSwitcherProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  /** How many assets each tab holds; null while they are being counted. */
  assetCounts: Record<Tab, number> | null;
  /** Tabs extensions added, after Atlas's own; one of them may be shown instead. */
  extensionTabs?: Pick<ExtensionTabs<AssetTabSpec>, 'tabs' | 'active'> & { onSelect: (key: string) => void };
}

/** A tab's count, or its placeholder while the collection is being counted: never a wrong 0. */
function TabCount({ count }: { count: number | undefined }): React.JSX.Element {
  return <span className="atlas-tab-count">{count ?? <Skeleton shape="text" live />}</span>;
}

/** An extension's tab: its icon and title, and no count, since it holds no assets. */
function ExtensionTabLabel({ icon, title }: { icon: string; title: string }): React.JSX.Element {
  return (
    <>
      <span className="atlas-tab-icon" aria-hidden="true"><ObsidianIcon name={icon} /></span>
      <span className="atlas-tab-label">{title}</span>
    </>
  );
}

/**
 * The asset type tabs. Wide headers show them side by side; narrow ones show
 * the current type as a menu button instead (the toolbar's `data-compact`
 * steps pick one), so the toolbar stays a single row.
 */
export function TabSwitcher({ activeTab, onTabChange, assetCounts, extensionTabs }: TabSwitcherProps): React.JSX.Element {
  const labelId = useId();
  const extension = extensionTabs?.active ?? null;
  const builtInActive = (tab: Tab): boolean => extension === null && activeTab === tab;
  const activeName = extension?.tab.title ?? getTabDisplayName(activeTab);
  const extensionItems: HeaderMenuItem[] = (extensionTabs?.tabs ?? []).map(({ key, tab }, index) => ({
    key,
    separated: index === 0,
    label: tab.title,
    checked: extension?.key === key,
    onSelect: () => extensionTabs?.onSelect(key),
  }));

  return (
    <>
      <nav className="atlas-asset-manager-tabs" aria-labelledby={labelId}>
        <span id={labelId} hidden>{t('am.tabs.assetType')}</span>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`atlas-tab-button ${builtInActive(tab) ? 'atlas-active' : ''}`}
            onClick={() => onTabChange(tab)}
            aria-current={builtInActive(tab) ? 'page' : undefined}
          >
            <span className="atlas-tab-label">{getTabDisplayName(tab)}</span>
            <TabCount count={assetCounts?.[tab]} />
          </button>
        ))}
        {(extensionTabs?.tabs ?? []).map(({ key, tab }) => (
          <button
            key={key}
            type="button"
            className={`atlas-tab-button atlas-tab-button--extension ${extension?.key === key ? 'atlas-active' : ''}`}
            onClick={() => extensionTabs?.onSelect(key)}
            aria-current={extension?.key === key ? 'page' : undefined}
          >
            <ExtensionTabLabel icon={tab.icon} title={tab.title} />
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
            {extension ? <ExtensionTabLabel icon={extension.tab.icon} title={extension.tab.title} /> : (
              <>
                <span className="atlas-tab-label">{activeName}</span>
                <TabCount count={assetCounts?.[activeTab]} />
              </>
            )}
            <ChevronDown className="atlas-am-tab-menu-chevron" />
          </>
        }
        items={[
          ...tabs.map((tab): HeaderMenuItem => ({
            key: tab,
            label: getTabDisplayName(tab),
            ...(assetCounts ? { detail: assetCounts[tab] } : {}),
            checked: builtInActive(tab),
            onSelect: () => onTabChange(tab),
          })),
          ...extensionItems,
        ]}
      />
    </>
  );
}
