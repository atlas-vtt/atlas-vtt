import { isRecord } from 'src/app/services/assetMetadataGuards';
import { normalizeWorldDate } from '../calendar/worldDate';
import type { NoteDates } from '../dating/effectiveDates';

/**
 * What the world-time add-on reads from a note's frontmatter (field names in
 * the add-on's README). Pure: link resolution is passed in.
 */

/** A link from frontmatter: the text as written and the vault path it resolves to (if any). */
export interface NoteLink {
  name: string;
  path?: string;
}

export interface WorldEvent {
  path: string;
  title: string;
  date?: string;
  end?: string;
  era?: NoteLink;
  places: NoteLink[];
  people: NoteLink[];
  factions: NoteLink[];
  /** 1–5; notes without one count as 3. */
  importance: number;
  rumour?: string;
  knownBy?: string;
}

export interface WorldEra {
  path: string;
  title: string;
  from?: string;
  to?: string;
}

export interface MapVariantNote {
  path: string;
  title: string;
  /** Vault path of the image. */
  map: string;
  /** Vault path of the scene (`.atlasmap`) the variant belongs to. */
  scene: string;
  from?: string;
  to?: string;
}

export interface WorldNoteRecord {
  path: string;
  type?: string;
  dates?: NoteDates;
  /** Resolved `parent` of a place, for "this place and everything in it". */
  parent?: string;
  event?: WorldEvent;
  era?: WorldEra;
  mapVariant?: MapVariantNote;
}

export type LinkResolver = (linkText: string, sourcePath: string) => string | undefined;

export const DEFAULT_IMPORTANCE = 3;

const WIKILINK = /^\s*!?\[\[([^\]]+)\]\]\s*$/;

/** The link target of `[[Target#Heading|Alias]]` or of plain text. */
export function linkTarget(value: string): string {
  const match = WIKILINK.exec(value);
  const inner = match ? match[1] ?? '' : value;
  return (inner.split('|')[0] ?? '').split('#')[0]?.trim() ?? '';
}

function readLinks(value: unknown, sourcePath: string, resolve: LinkResolver): NoteLink[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const links: NoteLink[] = [];
  for (const entry of values) {
    if (typeof entry !== 'string') continue;
    const target = linkTarget(entry);
    if (!target) continue;
    const path = resolve(target, sourcePath);
    const name = target.split('/').pop() ?? target;
    links.push(path !== undefined ? { name, path } : { name });
  }
  return links;
}

function readLink(value: unknown, sourcePath: string, resolve: LinkResolver): NoteLink | undefined {
  return readLinks(value, sourcePath, resolve)[0];
}

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function readImportance(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(number) ? Math.min(5, Math.max(1, Math.round(number))) : DEFAULT_IMPORTANCE;
}

function dateField(frontmatter: Record<string, unknown>, key: string): string | undefined {
  return normalizeWorldDate(frontmatter[key]) ?? undefined;
}

export function readNoteDates(frontmatter: Record<string, unknown>): NoteDates | undefined {
  const dates: NoteDates = {};
  for (const key of ['from', 'to', 'born', 'died'] as const) {
    const value = dateField(frontmatter, key);
    if (value !== undefined) dates[key] = value;
  }
  return Object.keys(dates).length > 0 ? dates : undefined;
}

function titleOf(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.md$/i, '');
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/** Everything the world-time add-on needs from one note; null when the note has nothing of it. */
export function readWorldNote(path: string, frontmatter: unknown, resolve: LinkResolver): WorldNoteRecord | null {
  if (!isRecord(frontmatter)) return null;
  const type = readText(frontmatter.type)?.toLowerCase();
  const dates = readNoteDates(frontmatter);
  const title = readText(frontmatter.title) ?? titleOf(path);
  const record: WorldNoteRecord = { path, ...optional('type', type), ...optional('dates', dates) };

  if (type === 'place') {
    const parent = readLink(frontmatter.parent, path, resolve);
    if (parent?.path) record.parent = parent.path;
  } else if (type === 'event') {
    record.event = {
      path,
      title,
      ...optional('date', dateField(frontmatter, 'date')),
      ...optional('end', dateField(frontmatter, 'end')),
      ...optional('era', readLink(frontmatter.era, path, resolve)),
      places: readLinks(frontmatter.places, path, resolve),
      people: readLinks(frontmatter.people, path, resolve),
      factions: readLinks(frontmatter.factions, path, resolve),
      importance: readImportance(frontmatter.importance),
      ...optional('rumour', readText(frontmatter.rumour)),
      ...optional('knownBy', readText(frontmatter.known_by)),
    };
  } else if (type === 'era') {
    record.era = { path, title, ...optional('from', dates?.from), ...optional('to', dates?.to) };
  } else if (type === 'map-variant') {
    const map = readLink(frontmatter.map, path, resolve)?.path;
    const scene = readLink(frontmatter.scene, path, resolve)?.path;
    if (map && scene) {
      record.mapVariant = { path, title, map, scene, ...optional('from', dates?.from), ...optional('to', dates?.to) };
    }
  }

  const hasContent = record.type !== undefined || record.dates !== undefined;
  return hasContent ? record : null;
}
