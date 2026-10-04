import type { ViewAtlasState } from 'src/app/storeFactory';
import type { CalendarDefinition } from './calendar/calendarDefinition';
import { parseWorldDate } from './calendar/worldDate';
import { toOrdinal } from './calendar/dateMath';
import { dateExtent, paddedExtent } from './dating/dateExtent';
import type { DateBounds, DaySpan } from './dating/dateRange';
import { effectiveDates, linkedNotePath, type DatedKind, type NoteDates } from './dating/effectiveDates';
import type { DatedObjects } from './dating/timeMask';
import type { DrawingStroke, NotePin, TextElement, TokenEntity } from 'src/app/types';
import { eventsInScene } from './events/eventPlacement';
import type { MapVariantNote, WorldEvent } from './notes/worldNoteRecord';

/** What the scene's date range is computed from; the note index supplies it in the app. */
export interface SceneDateSources {
  noteDates: (path: string) => NoteDates | undefined;
  events: readonly WorldEvent[];
  parentOf: (path: string) => string | undefined;
  mapVariantNotes: readonly MapVariantNote[];
}

/** Years the slider spans around a lone viewing date when nothing in the scene is dated. */
const FALLBACK_HALF_SPAN_YEARS = 100;

/** Every dated thing of the scene: objects (with inherited dates), its events and its map variants. */
export function sceneDateBounds(
  state: Pick<ViewAtlasState, 'objects' | 'worldTime'>,
  sources: SceneDateSources,
): DateBounds[] {
  const bounds: DateBounds[] = [];
  const objects: DatedObjects = state.objects;
  const visit = (kind: DatedKind, record: Record<string, NotePin | TokenEntity | TextElement | DrawingStroke>): void => {
    for (const object of Object.values(record)) {
      const notePath = linkedNotePath(kind, object);
      bounds.push(effectiveDates(object, notePath ? sources.noteDates(notePath) : undefined));
    }
  };
  visit('pin', objects.pins);
  visit('token', objects.tokens);
  visit('text', objects.texts);
  visit('drawing', objects.drawings);
  for (const event of eventsInScene(sources.events, objects.pins, sources.parentOf)) {
    if (event.date) bounds.push({ from: event.date, to: event.end ?? event.date });
  }
  bounds.push(...(state.worldTime.variants ?? []), ...sources.mapVariantNotes);
  return bounds;
}

/**
 * The slider's range: the GM's fixed bounds where set, the scene's dated
 * things (padded a little) otherwise, and a span around the viewing date when
 * nothing is dated. Null when there is nothing to go on at all.
 */
export function sliderRange(
  calendar: CalendarDefinition,
  worldTime: ViewAtlasState['worldTime'],
  bounds: readonly DateBounds[],
  viewingDate: string | null,
): DaySpan | null {
  const extent = dateExtent(calendar, bounds);
  const viewing = parseWorldDate(viewingDate);
  const auto = extent
    ? paddedExtent(extent, calendar.daysPerYear)
    : viewing
      ? {
        start: toOrdinal(calendar, { year: viewing.year - FALLBACK_HALF_SPAN_YEARS }),
        end: toOrdinal(calendar, { year: viewing.year + FALLBACK_HALF_SPAN_YEARS }, 'end'),
      }
      : null;
  const fixedStart = parseWorldDate(worldTime.rangeStart);
  const fixedEnd = parseWorldDate(worldTime.rangeEnd);
  const start = fixedStart ? toOrdinal(calendar, fixedStart, 'start') : auto?.start;
  const end = fixedEnd ? toOrdinal(calendar, fixedEnd, 'end') : auto?.end;
  if (start === undefined || end === undefined) {
    // One fixed end and nothing else: a range of the fallback size from it.
    const span = FALLBACK_HALF_SPAN_YEARS * 2 * calendar.daysPerYear;
    if (start !== undefined) return { start, end: start + span };
    if (end !== undefined) return { start: end - span, end };
    return null;
  }
  return start <= end ? { start, end } : { start: end, end: start };
}

/** The latest day any dated thing of the scene names, for the "latest" button. */
export function latestDay(calendar: CalendarDefinition, bounds: readonly DateBounds[]): number | null {
  return dateExtent(calendar, bounds)?.end ?? null;
}
