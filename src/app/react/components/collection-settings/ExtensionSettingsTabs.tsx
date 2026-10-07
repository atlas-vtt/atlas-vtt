import React, { useMemo } from 'react';
import type { CollectionSettingsTabContext, CollectionSettingsTabSpec } from '../../../../api/types/ui';
import { Button } from '../../../packages/components/primitives/button';
import { useExtensionMount } from '../../../extensions/useExtensionMount';
import type { ExtensionTab, ExtensionTabs } from '../../../extensions/useExtensionTabs';
import { ObsidianIcon } from '../ObsidianIcon';

type SettingsTabs = ExtensionTabs<CollectionSettingsTabSpec>;

/** The sidebar buttons of the tabs extensions added (`ui.addCollectionSettingsTab`), after Atlas's own. */
export function ExtensionSettingsTabButtons({ tabs }: { tabs: SettingsTabs }): React.ReactElement {
  return (
    <>
      {tabs.tabs.map(({ key, tab }) => (
        <Button
          key={key}
          variant="ghost"
          className={`atlas-collection-settings-tab ${tabs.active?.key === key ? 'atlas-active' : ''}`}
          onClick={() => tabs.show(key)}
        >
          <span className="atlas-collection-settings-tab__icon" aria-hidden="true"><ObsidianIcon name={tab.icon ?? 'puzzle'} /></span>
          {tab.title}
        </Button>
      ))}
    </>
  );
}

/** What an extension's settings tab renders for the collection; its changes are its own to save. */
export function ExtensionSettingsPane({ entry, collectionId }: { entry: ExtensionTab<CollectionSettingsTabSpec>; collectionId: string }): React.ReactElement {
  const ctx = useMemo((): CollectionSettingsTabContext => Object.freeze({ collectionId }), [collectionId]);
  const pane = useExtensionMount({
    owner: entry.owner, what: `collection settings tab "${entry.tab.id}"`, spec: entry.tab, ctx, remountKey: collectionId, keepKeys: true,
  });
  return <div ref={pane} className="atlas-collection-settings-extension" role="region" aria-label={entry.tab.title} />;
}
