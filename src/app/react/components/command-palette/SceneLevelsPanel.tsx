import React from 'react';
import { Plus } from 'lucide-react';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { viewedLevelId } from '../../../levels/sceneLevels';
import { levelBackground } from '../../../levels/levelEdits';
import { collectionIdOfPath } from '../../../services/assetPaths';
import { runInBackground } from '../../../utils/backgroundTask';
import { addLevel, changeLevel, changeLevelBackground, deleteLevel, levelLabel, moveLevel, setLevelOpenArt, setLevelRoof, setLevelSees } from '../levels/levelEditing';
import { pickMapImage } from '../levels/MapImagePickerModal';
import { replaceMapImage } from '../levels/replaceMapImage';
import { SceneLevelRow } from './SceneLevelRow';
import { LevelRoofSettings } from './SceneLevelRoof';
import { presentLevelInsteadOf } from '../../../services/presentedLevel';
import { t } from '../../../i18n';

/**
 * The command palette page for the open scene's levels, top floor first: add one on a map
 * image, rename it, set its elevation, move it, change its image or delete it.
 */
export function SceneLevelsPanel(): React.ReactElement {
  const { app, view } = useAtlasUI();
  const store = useViewStoreHook();
  const levels = useAtlasStore((state) => state.levels);
  const viewed = useAtlasStore((state) => viewedLevelId(state));
  const mapPath = useAtlasStore((state) => state.mapPath);
  const background = useAtlasStore((state) => state.background);
  const collection = collectionIdOfPath(mapPath);
  const pick = (onChoose: (path: string | null) => void): void => runInBackground(pickMapImage(app, collection, onChoose), 'Picking a map image');
  const pickRoof = (id: string | null): void => runInBackground(pickMapImage(app, collection, (path) => setLevelRoof(store, id, path), 'roof'), 'Picking a roof image');
  // A scene of one level (or none yet) has no rows: its roof is set here, its one level made where it has none.
  const only = levels?.length === 1 ? levels[0]! : null;
  const several = levels && levels.length > 1 ? levels : null;

  return (
    <div className="atlas-scene-levels">
      <button type="button" className="atlas-scene-levels__add" onClick={() => pick((path) => addLevel(store, path))}>
        <Plus />
        <span>{t('levels.add')}</span>
      </button>
      {several ? (
        <div className="atlas-scene-levels__list">
          {[...several].reverse().map((level) => {
            const index = several.indexOf(level);
            return (
              <SceneLevelRow
                key={level.id}
                level={level}
                name={levelLabel(several, level)}
                isViewed={level.id === viewed}
                canMoveUp={index < several.length - 1}
                canMoveDown={index > 0}
                onShow={() => store.getState().setViewedLevel(level.id)}
                onRename={(name) => changeLevel(store, level.id, { name })}
                onElevation={(elevation) => changeLevel(store, level.id, { elevation })}
                onMove={(direction) => moveLevel(store, level.id, direction)}
                onPickImage={() => pick((path) => changeLevelBackground(store, level.id, path))}
                hasImage={levelBackground({ levels: several, background }, level.id) !== null}
                onReplaceImage={() => pick((path) => {
                  if (path) runInBackground(replaceMapImage(app, store, level.id, path), 'Replacing a level\'s map image');
                })}
                onDelete={() => runInBackground(deleteLevel(store, level.id).then((target) => {
                  if (target && view) presentLevelInsteadOf(view, level.id, target);
                }), 'Deleting a level')}
                below={several.slice(0, index).reverse().map((entry) => ({ id: entry.id, name: levelLabel(several, entry) }))}
                onSees={(id, seen) => setLevelSees(store, level.id, id, seen)}
                onOpenArt={(open) => setLevelOpenArt(store, level.id, open)}
                onPickRoof={() => pickRoof(level.id)}
                onRemoveRoof={() => setLevelRoof(store, level.id, null)}
              />
            );
          })}
        </div>
      ) : (
        <>
          <p className="atlas-scene-levels__hint">{t('levels.empty')}</p>
          <LevelRoofSettings
            name={only ? levelLabel([only], only) : t('levels.firstName')}
            foreground={only?.foreground}
            onPick={() => pickRoof(only?.id ?? null)}
            onRemove={() => setLevelRoof(store, only?.id ?? null, null)}
            alone
          />
        </>
      )}
    </div>
  );
}
