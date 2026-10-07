import React, { useMemo } from 'react';
import type { AssetTabContext, AssetTabSpec } from '../../../../../api/types/ui';
import { useExtensionMount } from '../../../../extensions/useExtensionMount';
import type { ExtensionTab } from '../../../../extensions/useExtensionTabs';

interface ExtensionAssetPaneProps {
  entry: ExtensionTab<AssetTabSpec>;
  collectionId: string;
}

/**
 * What an extension's asset tab renders, in place of the asset grid. It mounts again for another
 * collection. Keys pressed inside stay there (Escape still closes the asset manager), so the
 * manager's shortcuts (Tab between tabs, select all) never act behind the extension's controls.
 */
export function ExtensionAssetPane({ entry, collectionId }: ExtensionAssetPaneProps): React.ReactElement {
  const ctx = useMemo((): AssetTabContext => Object.freeze({ collectionId }), [collectionId]);
  const pane = useExtensionMount({
    owner: entry.owner, what: `asset tab "${entry.tab.id}"`, spec: entry.tab, ctx, remountKey: collectionId, keepKeys: true,
  });
  return <div ref={pane} className="atlas-asset-manager-extension-pane" role="region" aria-label={entry.tab.title} />;
}
