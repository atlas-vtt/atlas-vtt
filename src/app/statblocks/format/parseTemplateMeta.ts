/** Reads what a template says about itself: where it came from, its licence, its header, its lookup tables. */

import { HEADER_PARTS } from '../model/templateHeader';
import {
  HEADER_PART_IDS, PLAYER_ACCESS, type HeaderPartId, type PlayerAccess, type HeaderTrack, type StatblockTemplate, type TemplateHeader, type TemplateLicence,
  type TemplateSource,
} from '../model/templateTypes';
import { TRACK_COUNTS, TRACK_LOOKS } from './blockParts';
import { DERIVED_FROM_KEYS, HEADER_KEYS, HEADER_TRACK_KEYS, IMPORTED_FROM_KEYS, SOURCE_KEYS } from './formatKeys';
import { describeValue, isRecord } from './jsonValues';
import { ObjectReader } from './objectReader';
import { JSON_OBJECT, asJsonRecord, asKey, asNonNegativeInteger, asOneOf, asString, asText, choices } from './valueReads';

type DerivedFrom = NonNullable<StatblockTemplate['derivedFrom']>;
type ImportedFrom = NonNullable<StatblockTemplate['importedFrom']>;
type Lookups = NonNullable<StatblockTemplate['lookups']>;
type Players = NonNullable<StatblockTemplate['players']>;

const HIDDEN: PlayerAccess = 'hidden';

const LICENCE_SET: Record<TemplateLicence, true> = {
  'CC-BY-4.0': true, 'CC-BY-3.0': true, 'CC-BY-SA-4.0': true, ORC: true, 'DS-Creator': true, 'RTG-Homebrew': true,
  'Paizo-CUP': true,
};
const LICENCES = Object.keys(LICENCE_SET).filter((key): key is TemplateLicence => Object.hasOwn(LICENCE_SET, key));

export function readDerivedFrom(raw: unknown, problems: string[]): DerivedFrom | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, 'The template’s origin', problems, DERIVED_FROM_KEYS);
  const templateId = r.get('templateId', asKey);
  if (templateId === undefined) return undefined;
  return r.finish({ templateId, ...r.opt('revision', asNonNegativeInteger, 'a whole number') });
}

/** A licensed built-in's source; undefined unless every required part is text. */
export function readSource(raw: unknown, problems: string[]): TemplateSource | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, 'The template’s source', problems, SOURCE_KEYS);
  const system = r.get('system', asString);
  const label = r.get('label', asString);
  const attribution = r.get('attribution', asString);
  const licenceUrl = r.get('licenceUrl', asString);
  const modification = r.get('modification', asString);
  if (system === undefined || label === undefined || attribution === undefined) return undefined;
  if (licenceUrl === undefined || modification === undefined || !Array.isArray(r.rawValue('licences'))) return undefined;
  return r.finish({
    system,
    label,
    licences: r.requiredList('licences', asOneOf(LICENCES), 'licences this version of Atlas knows'),
    attribution,
    licenceUrl,
    ...r.opt('sourceUrl', asString, 'text'),
    modification,
    ...r.opt('trademarkNotice', asString, 'text'),
  });
}

/** The header parts a template may hide: never its name or token art. */
const HIDEABLE_PARTS: readonly HeaderPartId[] = HEADER_PART_IDS.filter((id) => HEADER_PARTS[id].hideable);

/** What a template says about its header; undefined where it says nothing. */
export function readHeader(raw: unknown, problems: string[]): TemplateHeader | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, 'The template’s header', problems, HEADER_KEYS);
  return r.finish({
    ...r.optList('hidden', asOneOf(HIDEABLE_PARTS), 'header parts a template may hide (level, type, hp, description)'),
    ...r.opt('hitPoints', (value) => readHeaderTrack(value, problems), 'an object'),
  });
}

/** How the header draws its hit points as a track; undefined where it says nothing readable. */
function readHeaderTrack(raw: unknown, problems: string[]): HeaderTrack | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, 'The header’s hit points', problems, HEADER_TRACK_KEYS);
  return r.finish({
    look: r.withDefault('look', asOneOf(TRACK_LOOKS), TRACK_LOOKS[0], 'boxes or gauge'),
    counts: r.withDefault('counts', asOneOf(TRACK_COUNTS), TRACK_COUNTS[0], 'down or up'),
    ...r.opt('resource', asString, 'a text'),
  });
}

export function readImportedFrom(raw: unknown, problems: string[]): ImportedFrom | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, 'The template’s Fantasy Statblocks layout', problems, IMPORTED_FROM_KEYS);
  const layoutId = r.get('layoutId', asString);
  const layoutName = r.get('layoutName', asString);
  if (layoutId === undefined || layoutName === undefined) return undefined;
  return r.finish({ layoutId, layoutName, ...r.opt('extras', asJsonRecord, JSON_OBJECT) });
}

/**
 * The lookup tables. Numbers in a table read as text (`"1": 200` is `"200"`);
 * a table that is no object and a row that is no text are left out, and the
 * file's tables are then kept for writing back.
 */
export function readLookups(r: ObjectReader<keyof StatblockTemplate>): Partial<Pick<StatblockTemplate, 'lookups'>> {
  const raw = r.rawValue('lookups');
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    r.keep('lookups', raw, undefined, `is ${describeValue(raw)}, not an object of tables; it is ignored`);
    return {};
  }
  let dropped = 0;
  const tables: [string, Record<string, string>][] = [];
  for (const [name, table] of Object.entries(raw)) {
    if (!isRecord(table)) {
      dropped += 1;
      continue;
    }
    const rows: [string, string][] = [];
    for (const [row, value] of Object.entries(table)) {
      const text = asText(value);
      if (text === undefined) dropped += 1;
      else rows.push([row, text]);
    }
    tables.push([name, Object.fromEntries(rows)]);
  }
  const lookups: Lookups = Object.fromEntries(tables);
  if (dropped > 0) r.keep('lookups', raw, lookups, `holds ${dropped} tables or rows that are not text; they are ignored`);
  return { lookups };
}

/**
 * What players may do with each field. A setting is kept as written, so one of a newer Atlas
 * survives a save and reads as hidden (`isPlayerAccess` tells the ones this Atlas knows). A value
 * that is no text reads as hidden too, and the file's settings are then kept for writing back.
 */
export function readPlayers(r: ObjectReader<keyof StatblockTemplate>): Partial<Pick<StatblockTemplate, 'players'>> {
  const raw = r.rawValue('players');
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    r.keep('players', raw, undefined, `is ${describeValue(raw)}, not an object of field keys; it is ignored`);
    return {};
  }
  const entries: [string, string][] = [];
  let unread = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (key === '') unread += 1;
    else if (typeof value === 'string') entries.push([key, value]);
    else {
      unread += 1;
      entries.push([key, HIDDEN]);
    }
  }
  const players: Players = Object.fromEntries(entries);
  if (unread > 0) r.keep('players', raw, players, `holds ${unread} settings that are not ${choices(PLAYER_ACCESS)}; they read as hidden`);
  return { players };
}
