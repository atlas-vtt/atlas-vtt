import type { NotePin } from '../types';
import { pinNoteLink } from './pinNoteLink';

/** The longest name a pin shows: a place's name, not a sentence. */
export const MAX_PIN_NAME = 60;

/** What a pin's link is called: the heading it names, else its note's or folder's name without the extension. */
export function linkName(notePath: string): string {
  const { linkpath, heading } = pinNoteLink(notePath);
  if (heading !== null) return heading;
  const last = linkpath.replace(/\/+$/, '').split('/').pop() ?? '';
  return last.replace(/\.(md|atlasmap)$/i, '');
}

/** The name the GM gave the pin, trimmed and cut to `MAX_PIN_NAME`; null where it has none (a map file may hold anything). */
export function ownPinName(pin: Pick<NotePin, 'name'>): string | null {
  const name = typeof pin.name === 'string' ? pin.name.trim() : '';
  return name === '' ? null : name.slice(0, MAX_PIN_NAME);
}

/** The name a pin shows: the GM's, else its link's (which follows a renamed note, since the link does). */
export function pinName(pin: Pick<NotePin, 'name' | 'notePath'>): string {
  return ownPinName(pin) ?? linkName(typeof pin.notePath === 'string' ? pin.notePath : '').slice(0, MAX_PIN_NAME);
}

/** The name shows on the map: switched on and not empty. */
export function showsPinName(pin: Pick<NotePin, 'name' | 'notePath' | 'showName'>): boolean {
  return pin.showName === true && pinName(pin) !== '';
}
