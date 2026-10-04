import type { CalendarDefinition } from '../calendar/calendarDefinition';
import { compareDates, formatDisplayDate, formatYear } from '../calendar/dateMath';
import { parseWorldDate, type WorldDate } from '../calendar/worldDate';
import { spanOf, spansOverlap, type DaySpan } from '../dating/dateRange';
import type { NoteLink, WorldEra, WorldEvent } from '../notes/worldNoteRecord';

export type TimelineZoom = 'era' | 'century' | 'decade' | 'year';

export interface TimelineFilter {
  /** Matches title, rumour and the names of places, people and factions. */
  text: string;
  /** Vault path of a place; events in it or in any place inside it match. */
  place: string;
  /** Vault path (or name, for unresolved links) of a person. */
  person: string;
  faction: string;
  minImportance: number;
  zoom: TimelineZoom;
}

export const DEFAULT_TIMELINE_FILTER: TimelineFilter = { text: '', place: '', person: '', faction: '', minImportance: 1, zoom: 'year' };

/** Coarser zooms show only the more important events (importance 5 shows at every zoom). */
const ZOOM_MIN_IMPORTANCE: Record<TimelineZoom, number> = { era: 4, century: 3, decade: 2, year: 1 };

export type TimelineRow =
  /** An era band: shown where the era changes (at the era zoom the eras are the groups). */
  | { kind: 'era'; key: string; label: string; path: string }
  | { kind: 'group'; key: string; label: string }
  | { kind: 'event'; key: string; event: WorldEvent; dateLabel: string; current: boolean };

export interface TimelineInput {
  calendar: CalendarDefinition;
  events: readonly WorldEvent[];
  eras: readonly WorldEra[];
  parentOf: (path: string) => string | undefined;
  filter: TimelineFilter;
  /** Days of the active scene's viewing date; events under way then are marked current. */
  viewing: DaySpan | null;
}

const MAX_PARENT_DEPTH = 32;

/** The key a link filter compares: the resolved path, else the name as written. */
export function linkKey(link: NoteLink): string {
  return link.path ?? link.name;
}

/** True when `place` is `ancestor` or lies (through `parent` links) inside it. */
export function isWithin(place: string, ancestor: string, parentOf: (path: string) => string | undefined): boolean {
  let current: string | undefined = place;
  for (let depth = 0; current !== undefined && depth < MAX_PARENT_DEPTH; depth++) {
    if (current === ancestor) return true;
    current = parentOf(current);
  }
  return false;
}

export function matchesFilter(event: WorldEvent, filter: TimelineFilter, parentOf: (path: string) => string | undefined): boolean {
  if (event.importance < Math.max(filter.minImportance, ZOOM_MIN_IMPORTANCE[filter.zoom])) return false;
  if (filter.place && !event.places.some((place) => isWithin(linkKey(place), filter.place, parentOf))) return false;
  if (filter.person && !event.people.some((person) => linkKey(person) === filter.person)) return false;
  if (filter.faction && !event.factions.some((faction) => linkKey(faction) === filter.faction)) return false;
  const needle = filter.text.trim().toLowerCase();
  if (needle) {
    const haystack = [event.title, event.rumour ?? '', ...[...event.places, ...event.people, ...event.factions].map((link) => link.name)]
      .join('\n')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function sortEvents(calendar: CalendarDefinition, events: WorldEvent[]): WorldEvent[] {
  const dateOf = (event: WorldEvent): WorldDate | null => parseWorldDate(event.date);
  return events.sort((a, b) => {
    const da = dateOf(a);
    const db = dateOf(b);
    if (!da || !db) return da ? -1 : db ? 1 : a.title.localeCompare(b.title);
    return compareDates(calendar, da, db) || b.importance - a.importance || a.title.localeCompare(b.title);
  });
}

/** The era an event belongs to: its `era` link, else the era whose dates contain it. */
function eraOf(calendar: CalendarDefinition, event: WorldEvent, eras: readonly WorldEra[]): WorldEra | undefined {
  const linked = event.era?.path;
  if (linked) {
    const era = eras.find((entry) => entry.path === linked);
    if (era) return era;
  }
  const span = spanOf(calendar, { from: event.date, to: event.date });
  if (!span) return undefined;
  return eras.find((era) => {
    const eraSpan = spanOf(calendar, era);
    return eraSpan !== null && spansOverlap(eraSpan, span);
  });
}

function groupOf(calendar: CalendarDefinition, event: WorldEvent, input: TimelineInput): { key: string; label: string } {
  const date = parseWorldDate(event.date);
  if (!date) return { key: 'undated', label: 'Undated' };
  const zoom = input.filter.zoom;
  if (zoom === 'era') {
    const era = eraOf(calendar, event, input.eras);
    return era ? { key: `era:${era.path}`, label: era.title } : { key: 'era:none', label: 'Outside any era' };
  }
  const size = zoom === 'century' ? 100 : zoom === 'decade' ? 10 : 1;
  const start = Math.floor(date.year / size) * size;
  const label = size === 1 ? formatYear(calendar, start) : `${formatYear(calendar, start)} – ${formatYear(calendar, start + size - 1)}`;
  return { key: `${zoom}:${start}`, label };
}

function dateLabel(calendar: CalendarDefinition, event: WorldEvent): string {
  const start = parseWorldDate(event.date);
  if (!start) return '—';
  const end = parseWorldDate(event.end);
  return end ? `${formatDisplayDate(calendar, start)} – ${formatDisplayDate(calendar, end)}` : formatDisplayDate(calendar, start);
}

/** The timeline's rows: matching events in date order under group headings for the zoom. */
export function buildTimeline(input: TimelineInput): TimelineRow[] {
  const { calendar } = input;
  const events = sortEvents(calendar, input.events.filter((event) => matchesFilter(event, input.filter, input.parentOf)));
  const rows: TimelineRow[] = [];
  let group: string | null = null;
  let era: string | null = null;
  for (const event of events) {
    if (input.filter.zoom !== 'era') {
      const eventEra = eraOf(calendar, event, input.eras);
      if (eventEra && eventEra.path !== era) rows.push({ kind: 'era', key: `band:${eventEra.path}:${rows.length}`, label: eventEra.title, path: eventEra.path });
      era = eventEra?.path ?? null;
    }
    const heading = groupOf(calendar, event, input);
    if (heading.key !== group) {
      group = heading.key;
      rows.push({ kind: 'group', key: heading.key, label: heading.label });
    }
    const span = spanOf(calendar, { from: event.date, to: event.end ?? event.date });
    rows.push({
      kind: 'event',
      key: event.path,
      event,
      dateLabel: dateLabel(calendar, event),
      current: input.viewing !== null && span !== null && spansOverlap(span, input.viewing),
    });
  }
  return rows;
}

/** Filter choices: every place (with the places it lies in), person and faction the events name. */
export function timelineChoices(events: readonly WorldEvent[], parentOf: (path: string) => string | undefined): Record<'places' | 'people' | 'factions', NoteLink[]> {
  const collect = (links: Iterable<NoteLink>): NoteLink[] => {
    const byKey = new Map<string, NoteLink>();
    for (const link of links) if (!byKey.has(linkKey(link))) byKey.set(linkKey(link), link);
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const places: NoteLink[] = [];
  for (const event of events) {
    for (const place of event.places) {
      places.push(place);
      let parent = place.path ? parentOf(place.path) : undefined;
      for (let depth = 0; parent !== undefined && depth < MAX_PARENT_DEPTH; depth++) {
        places.push({ name: (parent.split('/').pop() ?? parent).replace(/\.md$/i, ''), path: parent });
        parent = parentOf(parent);
      }
    }
  }
  return {
    places: collect(places),
    people: collect(events.flatMap((event) => event.people)),
    factions: collect(events.flatMap((event) => event.factions)),
  };
}
