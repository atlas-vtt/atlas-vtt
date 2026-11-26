import React from 'react';
import { Blend } from 'lucide-react';
import { t } from '../../../../i18n';
import type { SoundRecord } from '../../../../sound/soundTypes';
import { musicPosition, soundingMusic } from '../../../../soundDirector/musicList';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import type { SoundSnapshot } from '../../../../soundDirector/soundSnapshot';
import { SoundRecordStore } from '../../../../soundLibrary/SoundRecordStore';
import { useAtlasUI } from '../../../root/AtlasUIContext';
import { useContextMenu } from '../../../root/ContextMenuContext';
import type { ContextMenuEntry } from '../../context-menu/AtlasContextMenu';
import { IconAction } from './IconAction';
import { useSoundValue } from './useSound';

/** Crossfades a track may have of its own, in seconds. */
const TRACK_FADES = [0, 1, 2, 3, 4, 6, 8, 12] as const;

/** The record of the track that sounds, or stands paused. */
function currentRecord(director: SoundDirector, { mix }: SoundSnapshot): SoundRecord | null {
  const now = mix.paused?.at ?? director.now();
  const play = mix.paused?.play ?? soundingMusic(mix.table, now);
  const key = play && musicPosition(play, now)?.track.key;
  return key ? director.shelf.recordOfKey(key) : null;
}

/** The choices of a track's own crossfade, the one it has ticked; unset follows the setting. */
function fadeEntries(seconds: number | undefined, choose: (next: number | undefined) => void): ContextMenuEntry[] {
  return [
    { type: 'item', label: t('audio.trackFadeDefault'), checked: seconds === undefined, onClick: () => choose(undefined) },
    ...TRACK_FADES.map((choice): ContextMenuEntry => ({ type: 'item', label: t('audio.trackFadeSeconds', { seconds: choice }), checked: seconds === choice, onClick: () => choose(choice) })),
  ];
}

/**
 * How long the track that plays crossfades into the next, at its loop seam, and into its own start where it goes round
 * whole: a quiet button whose menu sets it on the track's record, pressed while the track has a crossfade of its own.
 */
export function TrackFade({ director }: { director: SoundDirector }): React.JSX.Element {
  const { app } = useAtlasUI();
  const menu = useContextMenu();
  const id = useSoundValue(director, (snapshot) => currentRecord(director, snapshot)?.id ?? null);
  const seconds = useSoundValue(director, (snapshot) => currentRecord(director, snapshot)?.crossfadeSeconds);
  const label = t('audio.trackFade');
  return (
    <IconAction
      label={label}
      icon={Blend}
      pressed={seconds !== undefined}
      disabled={id === null}
      className="atlas-sound-music__quiet"
      onClick={(event) => {
        if (id === null) return;
        const box = event.currentTarget.getBoundingClientRect();
        const choose = (next: number | undefined): void => SoundRecordStore.forApp(app).update([id], { crossfadeSeconds: next });
        menu.open(fadeEntries(seconds, choose), { x: box.left, y: box.bottom }, { returnFocus: event.currentTarget, label });
      }}
    />
  );
}
