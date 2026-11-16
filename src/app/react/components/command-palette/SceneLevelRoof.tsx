import React from 'react';
import { House, Trash2 } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';

interface LevelRoofSettingsProps {
  /** What the level is called. */
  name: string;
  /** The level's roof image, a vault path; none without one. */
  foreground: string | null | undefined;
  /** Picks a roof image from the map library (or none). */
  onPick: () => void;
  onRemove: () => void;
}

/** The file name of a vault path. */
function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** A level's roof in the Scene levels page: which image is drawn above its tokens, picked from the map library or removed. */
export function LevelRoofSettings({ name, foreground, onPick, onRemove }: LevelRoofSettingsProps): React.ReactElement {
  return (
    <div className="atlas-scene-level__roof" onClick={(event) => event.stopPropagation()}>
      <House className="atlas-scene-level__roof-icon" aria-hidden="true" />
      <span className="atlas-scene-level__roof-file">{foreground ? fileName(foreground) : t('levels.roofNone')}</span>
      <button type="button" className="atlas-scene-level__roof-pick" onClick={onPick}>
        {t(foreground ? 'levels.roofReplace' : 'levels.roofChoose')}
      </button>
      {foreground && (
        <LabelTooltip side="top" label={t('levels.roofRemove', { name })}>
          <button type="button" className="atlas-scene-level__button atlas-scene-level__button--destructive" onClick={onRemove}>
            <Trash2 />
          </button>
        </LabelTooltip>
      )}
    </div>
  );
}
