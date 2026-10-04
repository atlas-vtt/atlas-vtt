import { describe, expect, it } from 'vitest';
import type { NotePin } from 'src/app/types';
import { fallbackCalendar } from '../calendar/calendarDefinition';
import { viewingSpan } from '../dating/dateRange';
import { eventFileName, eventNoteContent, parseLinkList } from '../events/eventNote';
import { eventsInScene, placeEvents } from '../events/eventPlacement';
import { readWorldNote, type WorldEvent } from '../notes/worldNoteRecord';
import { buildTimeline, DEFAULT_TIMELINE_FILTER, timelineChoices } from '../timeline/timelineModel';

const calendar = fallbackCalendar();
const resolve = (link: string): string | undefined => `World/${link}.md`;
const parents: Record<string, string> = { 'World/Otag.md': 'World/Eastern lands.md', 'World/Eastern lands.md': 'World/Ereb.md' };
const parentOf = (path: string): string | undefined => parents[path];

function event(path: string, frontmatter: Record<string, unknown>): WorldEvent {
  const record = readWorldNote(path, { type: 'event', ...frontmatter }, resolve);
  if (!record?.event) throw new Error('not an event');
  return record.event;
}

const fall = event('History/1236 Fall of Otag.md', { date: '1236-04-12', end: '1236-04-20', places: ['[[Otag]]'], people: ['[[Dakoth]]'], importance: 5, rumour: 'It fell in a night.' });
const founding = event('History/-300 Founding of Ereb.md', { date: -300, places: '[[Ereb]]', importance: 3, era: '[[Age of Kings]]' });
const fair = event('History/1236 Market fair.md', { date: '1236', places: ['[[Eastern lands]]'], importance: 1 });
const undated = event('History/Lost war.md', { places: [], importance: 'x' });

describe('event notes', () => {
  it('reads links, dates and importance from frontmatter', () => {
    expect(fall).toMatchObject({ title: '1236 Fall of Otag', date: '1236-04-12', end: '1236-04-20', importance: 5, rumour: 'It fell in a night.' });
    expect(fall.places).toEqual([{ name: 'Otag', path: 'World/Otag.md' }]);
    expect(founding.date).toBe('-300');
    expect(undated.importance).toBe(3);
  });

  it('reads place parents, eras and map variants', () => {
    expect(readWorldNote('World/Otag.md', { type: 'place', parent: '[[Eastern lands|the East]]', from: '-1200' }, resolve))
      .toEqual({ path: 'World/Otag.md', type: 'place', dates: { from: '-1200' }, parent: 'World/Eastern lands.md' });
    expect(readWorldNote('Eras/Age.md', { type: 'era', from: '-1000', to: '0' }, resolve)?.era).toEqual({ path: 'Eras/Age.md', title: 'Age', from: '-1000', to: '0' });
    expect(readWorldNote('V.md', { type: 'map-variant', map: '[[old.png]]', scene: '[[Scene]]', to: '900' }, resolve)?.mapVariant)
      .toMatchObject({ map: 'World/old.png.md', scene: 'World/Scene.md', to: '900' });
    expect(readWorldNote('Plain.md', { tags: ['x'] }, resolve)).toBeNull();
  });
});

describe('events on the map', () => {
  const pins: Record<string, NotePin> = {
    east: { id: 'east', kind: 'pin', x: 10, y: 20, notePath: 'World/Eastern lands.md' } as NotePin,
  };

  it('places an event at the pin of its place or of a place containing it', () => {
    const markers = placeEvents({ calendar, events: [fall, founding, fair], pins, parentOf, viewing: viewingSpan(calendar, '1236-04-15')!, rumourDays: 365 });
    expect(markers.map((marker) => [marker.event.title, marker.pinId, marker.mode])).toEqual([
      ['1236 Fall of Otag', 'east', 'current'],
      ['1236 Market fair', 'east', 'current'],
    ]);
  });

  it('keeps recent events as rumours for the rumour window only', () => {
    const later = (date: string, days: number): string[] =>
      placeEvents({ calendar, events: [fall], pins, parentOf, viewing: viewingSpan(calendar, date)!, rumourDays: days }).map((marker) => marker.mode);
    expect(later('1237-01-01', 365)).toEqual(['rumour']);
    expect(later('1238-01-01', 365)).toEqual([]);
    expect(later('1237-01-01', 0)).toEqual([]);
  });

  it('lists the events of a scene whatever their date', () => {
    expect(eventsInScene([fall, founding, fair], pins, parentOf)).toEqual([fall, fair]);
  });
});

describe('timeline', () => {
  const eras = [{ path: 'World/Age of Kings.md', title: 'Age of Kings', from: '-1000', to: '0' }];
  const events = [fair, undated, fall, founding];

  it('sorts by date with era bands and year groups, undated last', () => {
    const rows = buildTimeline({ calendar, events, eras, parentOf, filter: DEFAULT_TIMELINE_FILTER, viewing: viewingSpan(calendar, '1236-04-13') });
    expect(rows.map((row) => (row.kind === 'event' ? `${row.event.title}${row.current ? ' *' : ''}` : `[${row.label}]`))).toEqual([
      '[Age of Kings]', '[-300]', '-300 Founding of Ereb',
      '[1236]', '1236 Market fair *', '1236 Fall of Otag *',
      '[Undated]', 'Lost war',
    ]);
  });

  it('filters by place including the places inside it, by person, text and zoom', () => {
    const titles = (filter: Partial<typeof DEFAULT_TIMELINE_FILTER>): string[] =>
      buildTimeline({ calendar, events, eras, parentOf, filter: { ...DEFAULT_TIMELINE_FILTER, ...filter }, viewing: null })
        .flatMap((row) => (row.kind === 'event' ? [row.event.title] : []));
    expect(titles({ place: 'World/Eastern lands.md' })).toEqual(['1236 Market fair', '1236 Fall of Otag']);
    expect(titles({ place: 'World/Ereb.md' })).toEqual(['-300 Founding of Ereb', '1236 Market fair', '1236 Fall of Otag']);
    expect(titles({ person: 'World/Dakoth.md' })).toEqual(['1236 Fall of Otag']);
    expect(titles({ text: 'in a night' })).toEqual(['1236 Fall of Otag']);
    expect(titles({ zoom: 'era' })).toEqual(['1236 Fall of Otag']);
    expect(titles({ zoom: 'century', minImportance: 1 })).toEqual(['-300 Founding of Ereb', '1236 Fall of Otag', 'Lost war']);
  });

  it('offers every named place with the places containing it as filter choices', () => {
    expect(timelineChoices([fall], parentOf).places.map((place) => place.name)).toEqual(['Eastern lands', 'Ereb', 'Otag']);
  });
});

describe('logged event notes', () => {
  it('writes the event frontmatter', () => {
    const content = eventNoteContent({
      name: 'The party burns the "Red" camp', date: '1236-04-12', places: ['Otag'], people: [], factions: ['Red Hand'],
      importance: 7, rumour: 'Smoke over the hills', knownBy: 'common', summary: 'They did.',
    });
    expect(content).toContain('type: event\ndate: "1236-04-12"\nplaces: ["[[Otag]]"]\npeople: []\nfactions: ["[[Red Hand]]"]\nimportance: 5\n');
    expect(content).toContain('rumour: "Smoke over the hills"\nknown_by: common');
    expect(content).toContain('# The party burns the "Red" camp\n\nThey did.');
    expect(eventFileName({ name: 'A/B: "C"', date: '-12-01' })).toBe('-12 A B C.md');
    expect(parseLinkList(' [[Otag]], Ereb ,, ')).toEqual(['Otag', 'Ereb']);
  });
});
