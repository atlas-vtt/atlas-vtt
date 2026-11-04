/**
 * `characters.json` in a campaign's folder: the values the campaign keeps of its player
 * characters, beside `campaign.json` so a sync conflict over values never costs the campaign
 * itself. `{ format, campaignId, characters: { <library token id>: { resources: { <key>:
 * { current, max, maxByHand? } } } } }`; fields Atlas does not know are kept.
 */

import type { RecordLayout, StoredRecord } from '../../services/recordFiles/recordLayout';
import { campaignFileLayout } from '../campaignFileLayout';
import { isRecord } from '../campaignValues';
import { partyKey, readPartyKey, readPartyValue, type PartyValue, type PartyValues } from './partyKeys';

export const CHARACTERS_FILE = 'characters.json';
/** The format this Atlas writes; a file of a later one is read and never written. */
export const CHARACTERS_FORMAT = 1;

/** What one file holds at most: characters, values per character, characters in a key or id. */
const MAX_CHARACTERS = 500;
const MAX_VALUES = 200;
const MAX_KEY = 200;

/** A characters file as stored, with its `campaignId` as the record's id. */
export type StoredCharacters = StoredRecord;

/** The values to write: by party key, a value or undefined to remove it. */
export type PartyChanges = ReadonlyMap<string, PartyValue | undefined>;

const FILE = campaignFileLayout({ file: CHARACTERS_FILE, format: CHARACTERS_FORMAT, kind: 'campaign characters' });

/** Whether `path` is a characters file: `characters.json` directly in a campaign's folder. */
export const isCharactersPath = FILE.isPath;

/** The characters file of the campaign whose folder is `folder`. */
export const charactersPathIn = FILE.pathIn;

/**
 * A characters file lies in its campaign's folder and is never named after anything: it is
 * created there (`RecordFiles.createAt`), follows the folder when it is renamed and goes with it.
 */
export const CHARACTERS_LAYOUT: RecordLayout<StoredCharacters> = FILE.layout;

/** Whether this Atlas may write the file: one of a later format is only read. */
export const isWritable: (stored: StoredCharacters) => boolean = FILE.isWritable;

/** The values a characters file holds, as party values of its campaign; what cannot be read is left out. */
export function partyValuesOf(stored: StoredCharacters): PartyValues {
  const values: Record<string, PartyValue> = {};
  const characters = isRecord(stored.characters) ? Object.entries(stored.characters).slice(0, MAX_CHARACTERS) : [];
  for (const [characterId, entry] of characters) {
    if (characterId === '' || characterId.length > MAX_KEY || !isRecord(entry) || !isRecord(entry.resources)) continue;
    for (const [key, raw] of Object.entries(entry.resources).slice(0, MAX_VALUES)) {
      const value = key !== '' && key.length <= MAX_KEY ? readPartyValue(raw) : null;
      if (value) values[partyKey(stored.id, characterId, key)] = value;
    }
  }
  return values;
}

/** An empty characters file for a campaign. */
export const emptyCharacters = (campaignId: string): StoredCharacters => ({ id: campaignId, campaignId, characters: {} });

/**
 * The file as stored with `changes` made value by value: every other value and field stays, so
 * another device's values survive; a file of a later format is returned as it is.
 */
export function withPartyChanges(stored: StoredCharacters, changes: PartyChanges): StoredCharacters {
  if (!isWritable(stored)) return stored;
  const characters: Record<string, unknown> = isRecord(stored.characters) ? { ...stored.characters } : {};
  for (const [key, value] of changes) {
    const parts = readPartyKey(key);
    if (parts?.campaignId !== stored.id) continue;
    const entry = isRecord(characters[parts.characterId]) ? characters[parts.characterId] as Record<string, unknown> : {};
    const resources: Record<string, unknown> = isRecord(entry.resources) ? { ...entry.resources } : {};
    if (value) resources[parts.resourceKey] = { current: value.current, max: value.max, ...(value.maxByHand && { maxByHand: true }) };
    else delete resources[parts.resourceKey];
    characters[parts.characterId] = { ...entry, resources };
  }
  return { ...stored, characters };
}
