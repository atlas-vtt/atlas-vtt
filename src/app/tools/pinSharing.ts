import type { NotePin } from '../types';
import { linksReadableNote } from './pinNoteLink';

/**
 * A pin the GM shows to players (the pin menu's "Show to players", which wins over `gmOnly`, the
 * mark the dungeon generator gives its room pins): one that links a note players may read. Players
 * see it only where their picture shows the map.
 */
export function shownToPlayers(pin: Pick<NotePin, 'readable' | 'notePath'>): boolean {
  return pin.readable === true && linksReadableNote(pin);
}
