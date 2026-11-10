import React from 'react';
import { t } from '../../../../i18n';
import { SOUND_KEYS } from './useSoundKeys';

/** The keycaps that press the moods there are: 1 to 9, then 0 for the tenth. */
function moodKeys(count: number): string {
  if (count >= 10) return '0–9';
  return count === 1 ? '1' : `1–${count}`;
}

function KeyHint({ keys, label }: { keys: string; label: string }): React.JSX.Element {
  return (
    <li className="atlas-sound-desk__key">
      <span className="atlas-sound-cap" aria-hidden="true">{keys}</span>
      <span>{label}</span>
    </li>
  );
}

/** What the desk holds while nothing plays: where a sound comes from, as the place a track is dropped on. */
function idleText(moodCount: number, hasLibrary: boolean): string {
  if (moodCount > 0) return t('audio.desk.idle');
  return hasLibrary ? t('audio.desk.idleNoMoods') : t('audio.desk.idleNoLibrary');
}

/** `hasLibrary`: a root is linked, so there is something to search and play. */
export function DeskIdle({ moodCount, hasLibrary }: { moodCount: number; hasLibrary: boolean }): React.JSX.Element {
  return (
    <div className="atlas-sound-desk__idle">
      <p>{idleText(moodCount, hasLibrary)}</p>
      <ul className="atlas-sound-desk__keys">
        {moodCount > 0 && <KeyHint keys={moodKeys(moodCount)} label={t('audio.desk.keyMoods')} />}
        {moodCount > 1 && <KeyHint keys={SOUND_KEYS.nextMood} label={t('audio.desk.keyNext')} />}
        {hasLibrary && <KeyHint keys={SOUND_KEYS.search} label={t('audio.desk.keySearch')} />}
      </ul>
    </div>
  );
}
