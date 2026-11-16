import type { Mood } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';

/** The moods a search names, in their own order: by their own name, or by a track or ambience they hold. */
export function moodsMatching(moods: readonly Mood[], query: string, director: SoundDirector): readonly Mood[] {
  const words = query.toLocaleLowerCase();
  if (words === '') return [];
  const holds = (mood: Mood): boolean => director.shelf.recordsOf(mood).some((record) => record.name.toLocaleLowerCase().includes(words));
  return moods.filter((mood) => mood.name.toLocaleLowerCase().includes(words) || holds(mood));
}
