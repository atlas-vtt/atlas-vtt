import React from 'react';
import { Plus, Volume1, VolumeX, X } from 'lucide-react';
import { t } from '../../../../i18n';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { LayerPlay } from '../../../../sound/soundTypes';
import type { SoundDirector, SoundSnapshot } from '../../../../soundDirector/SoundDirector';
import { IconAction } from './IconAction';
import { useSoundValue } from './useSound';
import { VerticalFader } from './VerticalFader';

/** A strip's name wraps to two lines; what is cut off shows under the pointer. */
const CUT_OFF_CHARS = 28;

function StripName({ name }: { name: string }): React.JSX.Element {
  const text = <div className="atlas-sound-strip__name"><span>{name}</span></div>;
  return name.length > CUT_OFF_CHARS ? <LabelTooltip label={name} describe>{text}</LabelTooltip> : text;
}

/** One ambience layer: only the strip of the layer that moved renders when it does. */
export const LayerStrip = React.memo(function LayerStrip({ director, soundKey: key }: { director: SoundDirector; soundKey: string }): React.JSX.Element {
  const record = director.shelf.recordOfKey(key);
  const name = record?.name ?? '';
  const layer = ({ mix }: SoundSnapshot): LayerPlay | undefined => mix.table.layers.find((play) => play.sound.key === key);
  const gainDb = useSoundValue(director, (snapshot) => layer(snapshot)?.gainDb ?? 0);
  const muted = useSoundValue(director, (snapshot) => layer(snapshot)?.muted === true);
  return (
    <div className="atlas-sound-strip atlas-sound-card" data-muted={muted || undefined}>
      <div className="atlas-sound-strip__top">
        <IconAction
          label={muted ? t('audio.unmute', { name }) : t('audio.mute', { name })}
          icon={muted ? VolumeX : Volume1}
          pressed={muted}
          onClick={() => director.desk.setLayerMuted(key, !muted)}
        />
        <IconAction label={t('audio.remove', { name })} icon={X} className="atlas-sound-strip__remove" onClick={() => director.desk.removeLayer(record?.id ?? key, key)} />
      </div>
      <VerticalFader label={t('audio.level', { name })} value={gainDb} meter={key} onChange={(db) => director.desk.setLayerLevel(key, db)} />
      <StripName name={name} />
    </div>
  );
});

/** A layer whose copy is still being made: it joins by itself. */
export function WaitingStrip({ director, soundId }: { director: SoundDirector; soundId: string }): React.JSX.Element {
  const name = director.shelf.recordOf(soundId)?.name ?? '';
  return (
    <div className="atlas-sound-strip atlas-sound-card" data-waiting="true">
      <div className="atlas-sound-strip__top">
        <IconAction label={t('audio.remove', { name })} icon={X} className="atlas-sound-strip__remove" onClick={() => director.desk.removeLayer(soundId, null)} />
      </div>
      <div className="atlas-sound-fader"><div className="atlas-sound-meter" /></div>
      <div className="atlas-sound-fader__value">{t('audio.waiting')}</div>
      <StripName name={name} />
    </div>
  );
}

/** The ghost that leads to the library. */
export function AddAmbience({ onPress }: { onPress: () => void }): React.JSX.Element {
  return (
    <button type="button" className="atlas-sound-ambience-tile" onClick={onPress}>
      <Plus aria-hidden="true" />
      {t('audio.ambience')}
    </button>
  );
}

/** This device's level of all of it; a release reaches the settings. */
export const MasterStrip = React.memo(function MasterStrip({ director }: { director: SoundDirector }): React.JSX.Element {
  const masterDb = useSoundValue(director, ({ levels }) => levels.masterDb);
  const name = t('audio.master');
  return (
    <div className="atlas-sound-strip atlas-sound-strip--master atlas-sound-card">
      <div className="atlas-sound-strip__top" />
      <VerticalFader
        label={t('audio.level', { name })}
        value={masterDb}
        meter="master"
        onChange={(db) => director.setChannelLevels({ masterDb: db }, false)}
        onCommit={(db) => director.setChannelLevels({ masterDb: db }, true)}
      />
      <StripName name={name} />
    </div>
  );
});
