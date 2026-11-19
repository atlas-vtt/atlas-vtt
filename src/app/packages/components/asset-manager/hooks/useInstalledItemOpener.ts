import { useState } from 'react';
import type { App } from 'obsidian';
import type { CollectionSettingsTab } from '../../../../react/components/CollectionSettingsModal';
import { experimentalFeatureOn } from '../../../../experimental/experimentalFeatures';
import type { ItemRef } from '../../../../services/itemBundle/itemBundleFormat';
import { openTemplateEditor } from '../../../../statblocks/editor/openTemplateEditor';

export interface InstalledItemOpener {
  /** Where an installed item is opened from the asset manager; null where there is no such place. */
  openerFor: (item: ItemRef) => (() => void) | null;
  /** The tab the collection settings open on. */
  settingsTab: CollectionSettingsTab;
  /** The collection settings closed: the next opening starts on their first tab again. */
  resetSettingsTab: () => void;
}

interface Deps {
  app: App;
  selectedCollection: string;
  setSettingsModalCollectionId: (id: string | null) => void;
  /** Closes the asset manager, which would cover a tab opened behind it. */
  closeAssetManager: () => void;
}

/**
 * Opens what a single-item install put in the vault where it is edited: a template in the
 * template editor (while the statblock editor is switched on), a game system in the collection
 * settings' System tab and a dice set in their Dice tab, where the Dice Lab is.
 */
export function useInstalledItemOpener({ app, selectedCollection, setSettingsModalCollectionId, closeAssetManager }: Deps): InstalledItemOpener {
  const [settingsTab, setSettingsTab] = useState<CollectionSettingsTab>('system');
  const openSettings = (tab: CollectionSettingsTab): void => {
    setSettingsTab(tab);
    setSettingsModalCollectionId(selectedCollection);
  };
  const openerFor = (item: ItemRef): (() => void) | null => {
    switch (item.kind) {
      case 'statblock-template':
        if (!experimentalFeatureOn(app, 'statblockEditor')) return null;
        return () => {
          closeAssetManager();
          void openTemplateEditor(app, { templateId: item.id, collectionId: selectedCollection || null });
        };
      case 'system-preset': return selectedCollection ? () => openSettings('system') : null;
      case 'dice-set': return selectedCollection ? () => openSettings('dice') : null;
    }
  };
  return { openerFor, settingsTab, resetSettingsTab: () => setSettingsTab('system') };
}
