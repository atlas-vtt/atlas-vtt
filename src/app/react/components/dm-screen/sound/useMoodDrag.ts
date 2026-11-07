import type { RefObject } from 'react';
import type { Mood } from '../../../../sound/soundTypes';
import { useListDrag, type ListDrag } from './useListDrag';

const moodId = (mood: Mood): string => mood.id;

/** Moves a mood among the others under the pointer. */
export function useMoodDrag(gridRef: RefObject<HTMLElement | null>, moods: readonly Mood[], canMove: (mood: Mood) => boolean, onDrop: (mood: Mood, index: number) => void): ListDrag<Mood> {
  return useListDrag(gridRef, moods, { idOf: moodId, selector: '.atlas-sound-mood', canMove, onDrop });
}
