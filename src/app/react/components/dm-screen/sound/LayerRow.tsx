import React from 'react';
import { Volume2, VolumeX, Wind, X } from 'lucide-react';
import { t } from '../../../../i18n';
import type { LayerPlay } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { IconAction } from './IconAction';
import { LevelSlider } from './LevelSlider';

/** One ambience layer: only the row of the layer that moved renders when it does. */
export const LayerRow = React.memo(function LayerRow({ director, play }: { director: SoundDirector; play: LayerPlay }): React.JSX.Element {
  const record = director.shelf.recordOfKey(play.sound.key);
  const name = record?.name ?? '';
  const { key } = play.sound;
  return (
    <div className="atlas-sound-row">
      <div className="atlas-sound-row__head">
        <Wind className="atlas-sound-row__icon" aria-hidden="true" />
        <span className="atlas-sound-row__name">{name}</span>
        <IconAction label={t('audio.remove', { name })} icon={X} onClick={() => director.desk.removeLayer(record?.id ?? key, key)} />
      </div>
      <div className="atlas-sound-row__controls">
        <IconAction
          label={play.muted ? t('audio.unmute', { name }) : t('audio.mute', { name })}
          icon={play.muted ? VolumeX : Volume2}
          pressed={play.muted === true}
          onClick={() => director.desk.setLayerMuted(key, play.muted !== true)}
        />
        <LevelSlider label={t('audio.level', { name })} value={play.gainDb} onChange={(db) => director.desk.setLayerLevel(key, db)} />
      </div>
    </div>
  );
});

/** A layer whose copy is still being made: it joins by itself. */
export function WaitingLayerRow({ director, soundId }: { director: SoundDirector; soundId: string }): React.JSX.Element {
  const name = director.shelf.recordOf(soundId)?.name ?? '';
  return (
    <div className="atlas-sound-row" data-waiting="true">
      <div className="atlas-sound-row__head">
        <Wind className="atlas-sound-row__icon" aria-hidden="true" />
        <span className="atlas-sound-row__name">{name}</span>
        <span className="atlas-sound-tag">{t('audio.waiting')}</span>
        <IconAction label={t('audio.remove', { name })} icon={X} onClick={() => director.desk.removeLayer(soundId, null)} />
      </div>
    </div>
  );
}
