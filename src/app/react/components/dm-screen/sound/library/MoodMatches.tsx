import React from 'react';
import { t } from '../../../../../i18n';
import type { Mood } from '../../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { moodTone } from '../../../../../soundLibrary/moodLook';

/** The tile's tone, in both themes' values, as `MoodCard` sets it. */
function toneOf(mood: Mood): React.CSSProperties {
  const tone = moodTone(mood);
  return { '--atlas-sound-tone-light': tone.light, '--atlas-sound-tone-dark': tone.dark } as React.CSSProperties;
}

/** How many moods the search shows at most: a row, not a second grid. */
const SHOWN = 6;

/** The moods a search names: by their own name, or by a track or ambience they hold. */
export function moodsMatching(moods: readonly Mood[], query: string, director: SoundDirector): readonly Mood[] {
  const words = query.toLocaleLowerCase();
  if (words === '') return [];
  const holds = (mood: Mood): boolean => director.shelf.recordsOf(mood).some((record) => record.name.toLocaleLowerCase().includes(words));
  return moods.filter((mood) => mood.name.toLocaleLowerCase().includes(words) || holds(mood)).slice(0, SHOWN);
}

/** Above a search's tracks, the moods it found, each started by a press as its tile would be. */
export function MoodMatches({ moods, director }: { moods: readonly Mood[]; director: SoundDirector }): React.JSX.Element | null {
  if (moods.length === 0) return null;
  return (
    <div className="atlas-sound-lib__moods" role="group" aria-label={t('audio.library.moodMatches')}>
      <span className="atlas-sound-lib__moods-label" aria-hidden="true">{t('audio.mood.title')}</span>
      {moods.map((mood) => (
        <button key={mood.id} type="button" className="atlas-sound-lib__mood" style={toneOf(mood)} onClick={() => director.press(mood)}>
          <i aria-hidden="true" />
          <span>{mood.name}</span>
        </button>
      ))}
    </div>
  );
}
