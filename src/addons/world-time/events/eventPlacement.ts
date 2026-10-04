import type { NotePin } from 'src/app/types';
import type { CalendarDefinition } from '../calendar/calendarDefinition';
import { spanOf, spansOverlap, type DaySpan } from '../dating/dateRange';
import type { WorldEvent } from '../notes/worldNoteRecord';

/** An event shown at a pin of the scene. */
export interface EventMarker {
  /** Unique per event and pin. */
  key: string;
  event: WorldEvent;
  pinId: string;
  x: number;
  y: number;
  /** `current`: under way at the viewing date; `rumour`: ended recently, still talked about. */
  mode: 'current' | 'rumour';
}

export interface EventPlacementInput {
  calendar: CalendarDefinition;
  events: readonly WorldEvent[];
  /** Pins that show at the viewing date. */
  pins: Readonly<Record<string, NotePin>>;
  /** Parent place of a place note (vault paths), to place events in a pinned region. */
  parentOf: (path: string) => string | undefined;
  viewing: DaySpan;
  /** Days after its end an event still shows as a rumour (0 = never). */
  rumourDays: number;
}

/** Guards against a `parent` cycle in the notes. */
const MAX_PARENT_DEPTH = 32;

function stripHeading(path: string): string {
  const hash = path.indexOf('#');
  return hash === -1 ? path : path.slice(0, hash);
}

/** The first pin of each note, so a place with several numbered pins gets one marker. */
function pinsByNote(pins: Readonly<Record<string, NotePin>>): Map<string, NotePin> {
  const byNote = new Map<string, NotePin>();
  for (const pin of Object.values(pins)) {
    const path = stripHeading(pin.notePath);
    if (path && !byNote.has(path)) byNote.set(path, pin);
  }
  return byNote;
}

/** The pin of `place`, or of the nearest place it lies in. */
function pinForPlace(place: string, byNote: Map<string, NotePin>, parentOf: (path: string) => string | undefined): NotePin | undefined {
  let current: string | undefined = place;
  for (let depth = 0; current !== undefined && depth < MAX_PARENT_DEPTH; depth++) {
    const pin = byNote.get(current);
    if (pin) return pin;
    current = parentOf(current);
  }
  return undefined;
}

/** How an event relates to the viewing date, or null when it should not show. */
export function eventModeAt(calendar: CalendarDefinition, event: WorldEvent, viewing: DaySpan, rumourDays: number): EventMarker['mode'] | null {
  if (!event.date) return null;
  const span = spanOf(calendar, { from: event.date, to: event.end ?? event.date });
  if (!span) return null;
  if (spansOverlap(span, viewing)) return 'current';
  if (rumourDays > 0 && viewing.start > span.end && viewing.start <= span.end + rumourDays) return 'rumour';
  return null;
}

/** The pins (at most one per pin) each event's places resolve to in the scene. */
function pinsOfEvent(event: WorldEvent, byNote: Map<string, NotePin>, parentOf: (path: string) => string | undefined): NotePin[] {
  const pins: NotePin[] = [];
  for (const place of event.places) {
    if (!place.path) continue;
    const pin = pinForPlace(place.path, byNote, parentOf);
    if (pin && !pins.includes(pin)) pins.push(pin);
  }
  return pins;
}

/** Events with at least one place pinned in the scene (whatever their date). */
export function eventsInScene(
  events: readonly WorldEvent[],
  pins: Readonly<Record<string, NotePin>>,
  parentOf: (path: string) => string | undefined,
): WorldEvent[] {
  const byNote = pinsByNote(pins);
  if (byNote.size === 0) return [];
  return events.filter((event) => pinsOfEvent(event, byNote, parentOf).length > 0);
}

/**
 * Markers for the events whose `places` (or a place inside a pinned place)
 * are pinned in the scene and that are under way, or recent, at the viewing date.
 */
export function placeEvents(input: EventPlacementInput): EventMarker[] {
  const byNote = pinsByNote(input.pins);
  if (byNote.size === 0) return [];
  const markers: EventMarker[] = [];
  for (const event of input.events) {
    const mode = eventModeAt(input.calendar, event, input.viewing, input.rumourDays);
    if (!mode) continue;
    for (const pin of pinsOfEvent(event, byNote, input.parentOf)) {
      markers.push({ key: `${event.path}::${pin.id}`, event, pinId: pin.id, x: pin.x, y: pin.y, mode });
    }
  }
  // Important events first, so they take the spot closest to the pin.
  return markers.sort((a, b) => b.event.importance - a.event.importance || a.key.localeCompare(b.key));
}
