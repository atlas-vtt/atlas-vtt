import type { DrawingStroke, NotePin, TextElement, TokenEntity } from 'src/app/types';
import { EMPTY_OBJECT_MASK, type ObjectMask } from 'src/app/addons/objectMask';
import type { CalendarDefinition } from '../calendar/calendarDefinition';
import { spanOf, timeVisibility, type DaySpan } from './dateRange';
import { effectiveDates, linkedNotePath, type DatedKind, type NoteDates } from './effectiveDates';

/**
 * Which map objects the viewing date hides or ghosts, by object id: world
 * time's contribution to the store's object mask. Derived, never saved.
 */
export type TimeMask = ObjectMask;

export const EMPTY_TIME_MASK: Readonly<TimeMask> = EMPTY_OBJECT_MASK;

export interface DatedObjects {
  pins: Record<string, NotePin>;
  tokens: Record<string, TokenEntity>;
  texts: Record<string, TextElement>;
  drawings: Record<string, DrawingStroke>;
}

export interface TimeMaskInput {
  calendar: CalendarDefinition;
  objects: DatedObjects;
  viewing: DaySpan | null;
  showGhosted: boolean;
  noteDates: (path: string) => NoteDates | undefined;
  /**
   * Each object's state from an earlier pass with the same date, calendar and
   * notes, by object reference (Immer keeps unchanged objects), so a drag
   * works out only the object that moved.
   */
  memo?: WeakMap<object, 'visible' | 'ghost' | 'hidden'>;
}

export function computeTimeMask(input: TimeMaskInput): TimeMask {
  const mask: TimeMask = { hidden: {}, ghost: {} };
  if (!input.viewing) return mask;
  const visit = (kind: DatedKind, record: Record<string, NotePin | TokenEntity | TextElement | DrawingStroke>): void => {
    for (const [id, object] of Object.entries(record)) {
      let state = input.memo?.get(object);
      if (!state) {
        const notePath = linkedNotePath(kind, object);
        const dates = effectiveDates(object, notePath ? input.noteDates(notePath) : undefined);
        state = timeVisibility(spanOf(input.calendar, dates), input.viewing, input.showGhosted);
        input.memo?.set(object, state);
      }
      if (state === 'hidden') mask.hidden[id] = true;
      else if (state === 'ghost') mask.ghost[id] = true;
    }
  };
  visit('pin', input.objects.pins);
  visit('token', input.objects.tokens);
  visit('text', input.objects.texts);
  visit('drawing', input.objects.drawings);
  return mask;
}

export function sameTimeMask(a: TimeMask, b: TimeMask): boolean {
  return sameKeys(a.hidden, b.hidden) && sameKeys(a.ghost, b.ghost);
}

function sameKeys(a: Record<string, true>, b: Record<string, true>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => b[key] === true);
}
