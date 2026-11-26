import React from 'react';
import { Tutorial } from '../../../../onboarding/Tutorial';
import type { SettingsService } from '../../../../services/SettingsService';
import type { AssetCrudActions } from '../hooks/useAssetCrud';
import type { TagsAndCollectionsState } from '../hooks/useTagsAndCollections';
import type { StatblockLinkState } from '../hooks/useStatblockLink';
import { t, tPointer } from '../../../../i18n';

interface AssetManagerToursProps {
  isOpen: boolean;
  settings: SettingsService | undefined;
  crud: AssetCrudActions;
  tags: TagsAndCollectionsState;
  statblock: StatblockLinkState;
  /** Leads to the Maps tab, where a first scene begins. */
  onShowMaps: () => void;
}

/** The asset manager's first-run tours, shown while no dialog of its own stands over it. */
export function AssetManagerTours({ isOpen, settings, crud, tags, statblock, onShowMaps }: AssetManagerToursProps): React.JSX.Element | null {
  const creatorOpen = crud.isTokenCreatorOpen || crud.isEncounterBuilderOpen || crud.isMapCreatorOpen;
  if (!isOpen || creatorOpen || crud.inputModalState?.isOpen || crud.settingsModalCollectionId || crud.isCreateSceneModalOpen || crud.isMoveModalOpen || tags.isTagManagerOpen || statblock.linkingStatblockAsset) return null;
  if (settings?.shouldShowTutorial('assets')) {
    return (
      <Tutorial settings={settings} id="assets" steps={[
        { title: t('am.tour.libraryTitle'), body: tPointer('am.tour.libraryBody'), selector: '.atlas-am-toolbar-center' },
        { title: t('am.tour.sceneTitle'), body: tPointer('am.tour.sceneBody'), selector: '.atlas-asset-manager-tabs, .atlas-am-tab-menu' },
        { title: t('am.tour.collectionTitle'), body: t('am.tour.collectionBody'), selector: '.atlas-collections' },
      ]} action={{ label: t('am.tour.showMaps'), onClick: onShowMaps }} />
    );
  }
  if (settings?.getSetting('onboarding').tokenImported) {
    return (
      <Tutorial settings={settings} id="tokenStatblocks" steps={[
        { title: t('am.tour.statblockTitle'), body: tPointer('am.tour.statblockBody'), selector: '.atlas-asset-manager-main' },
      ]} />
    );
  }
  return null;
}
