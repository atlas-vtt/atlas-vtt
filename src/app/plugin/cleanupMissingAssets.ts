import { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { AssetValidationService, SCENE_BACKGROUND } from '../services/AssetValidationService';
import { changeLevelBackground, setLevelRoof } from '../react/components/levels/levelEditing';
import { runHistoryTransaction } from '../stores/history';
import { ChoiceModal } from './ChoiceModal';
import { formatList, t } from '../i18n';
import { showNotice } from '../ui/notice';

/** Finds tokens on any floor and floor maps whose image is gone and offers to drop them from the scene. */
export async function cleanupMissingAssets(app: App, view: AtlasView): Promise<void> {
  const store = view.getStore();
  if (!store) {
    showNotice(t('cleanup.noMapData'));
    return;
  }

  const state = store.getState();
  const validation = await new AssetValidationService({ app }).validateMapAssets({
    background: state.background,
    levels: state.levels,
    objects: { tokens: state.objects?.tokens ?? {} },
  });

  const missingTokenIds = validation.missingAssets.filter((a) => a.type === 'token').map((a) => a.objectId);
  const missingMaps = validation.missingAssets.filter((a) => a.type === 'map').map((a) => a.objectId);
  const missingRoofs = validation.missingAssets.filter((a) => a.type === 'roof').map((a) => a.objectId);
  const missingBackgrounds = missingMaps.length;
  const removable = missingTokenIds.length + missingBackgrounds + missingRoofs.length;

  if (removable === 0) {
    showNotice(t('cleanup.nothingMissing'));
    return;
  }

  const found = formatList([
    missingTokenIds.length > 0 ? t('cleanup.tokens', { count: missingTokenIds.length }) : '',
    missingBackgrounds > 0 ? t('cleanup.backgrounds', { count: missingBackgrounds }) : '',
    missingRoofs.length > 0 ? t('cleanup.roofs', { count: missingRoofs.length }) : '',
  ].filter(Boolean));

  const confirmed = await new ChoiceModal<true>(app, {
    title: t('cleanup.title'),
    message: [t('cleanup.found', { found }), t('cleanup.confirm')],
    buttons: [{ text: t('common.remove'), value: true, variant: 'warning' }],
  }).prompt();
  if (!confirmed) return;

  runHistoryTransaction(store, () => {
    const actions = store.getState();
    if (missingTokenIds.length > 0) actions.deleteTokens(missingTokenIds);
    for (const level of missingMaps) {
      if (level === SCENE_BACKGROUND) actions.setBackground(null);
      else changeLevelBackground(store, level, null);
    }
    // Roofs are scene settings, like a level's map above the first: untracked.
    for (const level of missingRoofs) setLevelRoof(store, level, null);
  });

  showNotice(t('cleanup.done', { count: removable }));
  await view.saveMap();
}
