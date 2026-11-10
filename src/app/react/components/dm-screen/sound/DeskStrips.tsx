import React from 'react';
import { Volume1, VolumeX, X } from 'lucide-react';
import { t } from '../../../../i18n';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { LayerPlay } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import type { SoundSnapshot } from '../../../../soundDirector/soundSnapshot';
import { IconAction } from './IconAction';
import { ReverbKnob } from './ReverbKnob';
import { useRoomName } from './useRoomName';
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
  const reverb = useSoundValue(director, (snapshot) => layer(snapshot)?.reverb ?? 0);
  const room = useRoomName(director);
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
      <div className="atlas-sound-strip__send">
        <ReverbKnob name={name} room={room} value={reverb} onChange={(amount) => director.desk.setLayerReverb(key, amount)} />
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
      <div className="atlas-sound-strip__send" />
      <div className="atlas-sound-fader"><div className="atlas-sound-meter" /></div>
      <div className="atlas-sound-fader__value">{t('audio.waiting')}</div>
      <StripName name={name} />
    </div>
  );
}

/** This device's level of all of it; a release reaches the settings. */
export const MasterStrip = React.memo(function MasterStrip({ director }: { director: SoundDirector }): React.JSX.Element {
  const masterDb = useSoundValue(director, ({ levels }) => levels.masterDb);
  const name = t('audio.master');
  return (
    <div className="atlas-sound-strip atlas-sound-strip--master atlas-sound-card">
      <div className="atlas-sound-strip__top" />
      <div className="atlas-sound-strip__send" />
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
