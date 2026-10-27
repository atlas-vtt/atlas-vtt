/** The GM's right-click menu of a map feature: each row one undo step. */

import { t } from '../../i18n';
import { everyLevelObjects } from '../../levels/levelObjects';
import { FEATURE_COVERS, MAX_FEATURE_NAME, terrainWith } from '../../mapFeatures/mapFeatures';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../react/components/context-menu/AtlasContextMenu';
import type { ViewAtlasStore } from '../../storeFactory';
import type { FeatureCover, FeatureTerrain, MapFeature } from '../../types/mapFeatureTypes';
import { promptForText } from '../../ui/textInputDialog';
import { runInBackground } from '../../utils/backgroundTask';

/** Asks for a feature's new name; null keeps the old one. */
export type AskName = (current: string) => Promise<string | null>;

const askName: AskName = (current) => promptForText({ title: t('mapFeature.renameTitle'), confirmLabel: t('common.rename'), initialValue: current });

export function mapFeatureMenuEntries(store: ViewAtlasStore, feature: MapFeature, ask: AskName = askName): ContextMenuEntry[] {
  const { id } = feature;
  const setTerrain = (changes: FeatureTerrain): void => {
    store.getState().updateMapFeature(id, { terrain: terrainWith(feature.terrain, changes) });
  };
  const rename = async (): Promise<void> => {
    const name = (await ask(feature.name))?.trim().slice(0, MAX_FEATURE_NAME);
    // Another write may have removed the feature while the dialog was open
    if (name && name !== feature.name && everyLevelObjects(store.getState()).mapFeatures?.[id]) store.getState().updateMapFeature(id, { name });
  };
  const cover = feature.terrain?.cover;
  const coverRow = (value: FeatureCover | undefined): ContextMenuEntry => ({
    type: 'item',
    label: t(value ? `mapFeature.cover.${value}` : 'mapFeature.cover.none'),
    checked: cover === value,
    onClick: () => {
      if (cover !== value) setTerrain({ cover: value });
    },
  });
  return [
    { type: 'item', label: t('common.rename'), icon: 'edit', onClick: () => runInBackground(rename(), 'Renaming a map feature') },
    {
      type: 'item',
      label: t('mapFeature.difficult'),
      icon: 'footprints',
      checked: feature.terrain?.difficult === true,
      onClick: () => setTerrain({ difficult: feature.terrain?.difficult ? undefined : true }),
    },
    { type: 'submenu', label: t('mapFeature.cover'), icon: 'shield', children: [coverRow(undefined), ...FEATURE_COVERS.map(coverRow)] },
    MENU_SEPARATOR,
    { type: 'item', label: t('mapFeature.remove'), icon: 'trash-2', destructive: true, onClick: () => store.getState().deleteMapFeature(id) },
  ];
}
