import React, { useCallback, useContext, useSyncExternalStore } from 'react';
import { Eye } from 'lucide-react';
import { AtlasUIContext } from '../../../../react/root/AtlasUIContext';
import { useOptionalAtlasStore } from '../../../../react/ViewStoreContext';
import { presentedSceneOf } from '../../../../services/presentedScene';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';

/** What a scene card says of its scene beyond its name. */
export interface SceneMarks {
  /** The scene is the one the map view shows. */
  open: boolean;
  /** The scene is the one shown to players (the eye on its scene tab). */
  shown: boolean;
}

const NO_MARKS: SceneMarks = { open: false, shown: false };
const NOTHING_TO_FOLLOW = (): (() => void) => () => undefined;

/**
 * Whether the scene stored at `scenePath` is open in the map view and shown to players, followed as either changes
 * (a scene opened or switched to, the eye moved, from a scene tab or another view's command). Nothing for a card
 * that is no scene.
 */
export function useSceneMarks(scenePath: string | undefined): SceneMarks {
  const app = useContext(AtlasUIContext)?.app ?? null;
  const open = useOptionalAtlasStore((state) => scenePath !== undefined && state.mapPath === scenePath, false);
  const presented = app && scenePath !== undefined ? presentedSceneOf(app) : null;
  const followPresented = useCallback((onChange: () => void) => presented?.onChange(onChange) ?? (() => undefined), [presented]);
  const shown = useSyncExternalStore(presented ? followPresented : NOTHING_TO_FOLLOW, () => presented !== null && presented.get()?.filePath === scenePath);
  return open || shown ? { open, shown } : NO_MARKS;
}

/**
 * A scene card's accessible name: the scene's name, then its marks ("Goblin Cave, open, shown to players"), so the
 * state the art shows is part of what the card is called. Null without marks: the card is then named by its name alone.
 */
export function sceneCardName(name: string, { open, shown }: SceneMarks): string | null {
  if (open && shown) return t('am.card.sceneNameOpenShown', { name });
  if (open) return t('am.card.sceneNameOpen', { name });
  if (shown) return t('am.card.sceneNameShown', { name });
  return null;
}

/**
 * A scene card's status line, under its name (decisions #44, #51): "Open" on the scene the map view shows, as status
 * text after a dot (no capsule: it is no control), then the eye on the one players see. The line stands on every scene
 * card, empty where neither holds, so scene cards keep one height and the name keeps the whole first line. The art
 * carries no text, so the word meets contrast on every map. The word is drawn from its attribute, so the card's visible
 * text stays its name (axe label-content-name-mismatch); the card's name carries the marks (`sceneCardName`), so the
 * marks themselves are hidden from assistive tech.
 */
export function SceneMarkers({ marks }: { marks: SceneMarks }): React.JSX.Element {
  return (
    <span className="atlas-asset-scene-marks" aria-hidden="true">
      {marks.open && (
        <LabelTooltip label={t('am.card.sceneOpenTip')}>
          <span className="atlas-asset-scene-marks__open" data-label={t('am.card.sceneOpen')} />
        </LabelTooltip>
      )}
      {marks.shown && (
        <LabelTooltip label={t('am.card.sceneShown')}>
          <span className="atlas-asset-scene-marks__eye"><Eye /></span>
        </LabelTooltip>
      )}
    </span>
  );
}
