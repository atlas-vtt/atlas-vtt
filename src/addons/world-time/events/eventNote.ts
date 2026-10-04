import { parseWorldDate } from '../calendar/worldDate';

/** What the "Log event" dialog collects; links are wikilink targets (note names). */
export interface EventNoteDraft {
  /** The event's title. */
  name: string;
  date: string;
  end?: string;
  places: string[];
  people: string[];
  factions: string[];
  importance: number;
  rumour?: string;
  knownBy: 'common' | 'learned' | 'secret';
  summary?: string;
}

const INVALID_FILE_CHARS = /[\\/:*?"<>|#^[\]]/g;

/** A file name for the event: `<year> <title>.md`, as the world's History folders name them. */
export function eventFileName(draft: Pick<EventNoteDraft, 'name' | 'date'>): string {
  const year = parseWorldDate(draft.date)?.year;
  const title = draft.name.replace(INVALID_FILE_CHARS, ' ').replace(/\s+/g, ' ').trim() || 'Untitled event';
  return `${year !== undefined ? `${year} ` : ''}${title}.md`;
}

/** A YAML scalar: JSON strings are valid double-quoted YAML. */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlLinks(targets: readonly string[]): string {
  return `[${targets.filter((target) => target.trim() !== '').map((target) => yamlString(`[[${target.trim()}]]`)).join(', ')}]`;
}

/** The note's text in the living-world event format. */
export function eventNoteContent(draft: EventNoteDraft): string {
  const lines = [
    '---',
    'type: event',
    `date: ${yamlString(draft.date)}`,
    ...(draft.end ? [`end: ${yamlString(draft.end)}`] : []),
    `places: ${yamlLinks(draft.places)}`,
    `people: ${yamlLinks(draft.people)}`,
    `factions: ${yamlLinks(draft.factions)}`,
    `importance: ${Math.min(5, Math.max(1, Math.round(draft.importance)))}`,
    ...(draft.rumour ? [`rumour: ${yamlString(draft.rumour)}`] : []),
    `known_by: ${draft.knownBy}`,
    'tags: [world, event]',
    '---',
    `# ${draft.name.trim() || 'Untitled event'}`,
    '',
    draft.summary?.trim() ?? '',
    '',
  ];
  return lines.join('\n');
}

/** Splits a comma-separated list of note names, dropping `[[ ]]` the user may have typed. */
export function parseLinkList(text: string): string[] {
  return text.split(',').map((entry) => entry.replace(/^\s*\[\[|\]\]\s*$/g, '').trim()).filter((entry) => entry !== '');
}
