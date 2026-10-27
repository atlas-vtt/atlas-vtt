import type { NotePin } from '../types';
import { isEncounterFolderLink } from '../links/atlasLinkTargets';

/** A pin's link as written: the note's path, and the heading after `#` (null for the whole note). */
export interface PinNoteLink {
  readonly linkpath: string;
  readonly heading: string | null;
}

/** The note and heading a pin's `notePath` names (`path/to/note.md#Heading`). */
export function pinNoteLink(notePath: string): PinNoteLink {
  const hash = notePath.indexOf('#');
  const linkpath = (hash < 0 ? notePath : notePath.slice(0, hash)).trim();
  const heading = hash < 0 ? '' : notePath.slice(hash + 1).trim();
  return { linkpath, heading: heading === '' ? null : heading };
}

/** Whether a pin links to a note players could read: anything but a scene or a folder of encounters. */
export function linksReadableNote(pin: Pick<NotePin, 'notePath'>): boolean {
  const { linkpath } = pinNoteLink(pin.notePath);
  return linkpath !== '' && !linkpath.toLowerCase().endsWith('.atlasmap') && !isEncounterFolderLink(linkpath);
}
