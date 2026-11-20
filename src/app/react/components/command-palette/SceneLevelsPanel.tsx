import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { viewedLevelId } from '../../../levels/sceneLevels';
import { levelBackground, levelsOrFirst } from '../../../levels/levelEdits';
import { collectionIdOfPath } from '../../../services/assetPaths';
import { runInBackground } from '../../../utils/backgroundTask';
import { addLevel, changeLevel, changeLevelBackground, deleteLevel, levelLabel, moveLevel, setLevelOpenArt, setLevelRoof, setLevelSees } from '../levels/levelEditing';
import { pickMapImage } from '../levels/MapImagePickerModal';
import { replaceMapImage } from '../levels/replaceMapImage';
import { SceneLevelRow } from './SceneLevelRow';
import { presentLevelInsteadOf } from '../../../services/presentedLevel';
import { t } from '../../../i18n';

/**
 * The command palette page for the open scene's levels, top floor first: add one on a map
 * image, rename it, set its elevation, move it, change its image or delete it. A scene of one
 * floor has that floor's row, with its map image and its roof.
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
  // A scene without levels shows the one level it would be given; the edits that need it make it.
  const shown = useMemo(() => levelsOrFirst({ levels, background }, t('levels.firstName')), [levels, background]);
  const several = shown.length > 1;
  const hasLevels = !!levels?.length;

  return (
    <div className="atlas-scene-levels">
      <button type="button" className="atlas-scene-levels__add" onClick={() => pick((path) => addLevel(store, path))}>
        <Plus />
        <span>{t('levels.add')}</span>
      </button>
      {!several && <p className="atlas-scene-levels__hint">{t('levels.empty')}</p>}
      <div className="atlas-scene-levels__list">
        {[...shown].reverse().map((level) => {
          const index = shown.indexOf(level);
          // Null names the one level of a scene without levels.
          const id = hasLevels ? level.id : null;
          return (
            <SceneLevelRow
              key={several ? level.id : 'only'}
              level={level}
              name={levelLabel(shown, level)}
              onRename={(name) => changeLevel(store, id, { name })}
              onElevation={(elevation) => changeLevel(store, id, { elevation })}
              onPickImage={() => pick((path) => changeLevelBackground(store, id, path))}
              hasImage={levelBackground({ levels, background }, id) !== null}
              onReplaceImage={() => pick((path) => {
                if (path) runInBackground(replaceMapImage(app, store, id, path), 'Replacing a level\'s map image');
              })}
              onPickRoof={() => runInBackground(pickMapImage(app, collection, (path) => setLevelRoof(store, id, path), 'roof'), 'Picking a roof image')}
              onRemoveRoof={() => setLevelRoof(store, id, null)}
              among={several ? {
                isViewed: level.id === viewed,
                canMoveUp: index < shown.length - 1,
                canMoveDown: index > 0,
                onShow: () => store.getState().setViewedLevel(level.id),
                onMove: (direction) => moveLevel(store, level.id, direction),
                onDelete: () => runInBackground(deleteLevel(store, level.id).then((target) => {
                  if (target && view) presentLevelInsteadOf(view, level.id, target);
                }), 'Deleting a level'),
                below: shown.slice(0, index).reverse().map((entry) => ({ id: entry.id, name: levelLabel(shown, entry) })),
                onSees: (seenId, seen) => setLevelSees(store, level.id, seenId, seen),
                onOpenArt: (open) => setLevelOpenArt(store, level.id, open),
              } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
