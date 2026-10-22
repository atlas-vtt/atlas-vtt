/**
 * `players.json` in a campaign's folder: who plays the campaign online. `{ format, campaignId,
 * link?, players: { <player id>: { name, code, characters, addedAt } } }`, where `link` is the
 * campaign's table code, `code` the player's own six digits and `characters` the library tokens
 * they play, and beside them the tokens it assigns (`tokenOwners`, `playerTokens`; see
 * `tokenAssignments.ts`). It lies beside `campaign.json` so a sync conflict over players never costs
 * the campaign itself; fields Atlas does not know are kept.
 */

import type { RecordLayout, StoredRecord } from '../../services/recordFiles/recordLayout';
import { JOIN_CODE_PATTERN, MAX_CAMPAIGN_PLAYERS, PLAYER_ID_PATTERN, playerName, TABLE_CODE_PATTERN } from '../../online/protocol/index';
import { newJoinCode } from '../../utils/joinCode';
import { campaignFileLayout } from '../campaignFileLayout';
import { isRecord } from '../campaignValues';

export const PLAYERS_FILE = 'players.json';
/** The format this Atlas writes; a file of a later one is read and never written. */
export const PLAYERS_FORMAT = 1;

/** The longest id of a character a player plays. */
const MAX_CHARACTER_ID = 200;
/** The most characters one player is read with. */
const MAX_PLAYER_CHARACTERS = 500;

/** A players file as stored, with its `campaignId` as the record's id. */
export type StoredPlayers = StoredRecord;

/** A player of the campaign as Atlas reads one. */
export interface CampaignPlayer {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly characters: readonly string[];
}

const FILE = campaignFileLayout({ file: PLAYERS_FILE, format: PLAYERS_FORMAT, kind: 'campaign players' });

/** Whether `path` is a players file: `players.json` directly in a campaign's folder. */
export const isPlayersPath = FILE.isPath;

/** The players file of the campaign whose folder is `folder`. */
export const playersPathIn = FILE.pathIn;

/** A players file lies in its campaign's folder (see `campaignFileLayout`). */
export const PLAYERS_LAYOUT: RecordLayout<StoredPlayers> = FILE.layout;

/** Whether this Atlas may write the file: one of a later format is only read. */
export const isWritable: (stored: StoredPlayers) => boolean = FILE.isWritable;

/** An empty players file for a campaign. */
export const emptyPlayers = (campaignId: string): StoredPlayers => ({ id: campaignId, campaignId, players: {} });

const playerEntries = (stored: StoredPlayers): [string, unknown][] => (isRecord(stored.players) ? Object.entries(stored.players) : []);

function readCharacters(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === 'string' && id !== '' && id.length <= MAX_CHARACTER_ID);
  return [...new Set(ids)].slice(0, MAX_PLAYER_CHARACTERS);
}

/** The link of a file: its table code when it is one. */
export const linkOf = (stored: StoredPlayers): string | null => (typeof stored.link === 'string' && TABLE_CODE_PATTERN.test(stored.link) ? stored.link : null);

/**
 * The players a file holds, in id order: what cannot be read is left out (a bad id, code or name),
 * as is a player whose code an earlier one has, and the first `MAX_CAMPAIGN_PLAYERS` stay. A
 * character listed under two players belongs to the first.
 */
export function readPlayers(stored: StoredPlayers): CampaignPlayer[] {
  const players: CampaignPlayer[] = [];
  const codes = new Set<string>();
  const owned = new Set<string>();
  for (const [id, entry] of playerEntries(stored).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (players.length >= MAX_CAMPAIGN_PLAYERS) break;
    if (!PLAYER_ID_PATTERN.test(id) || !isRecord(entry) || typeof entry.code !== 'string' || !JOIN_CODE_PATTERN.test(entry.code) || codes.has(entry.code)) continue;
    const name = playerName(entry.name);
    if (name === null) continue;
    const characters = readCharacters(entry.characters).filter((characterId) => !owned.has(characterId));
    for (const characterId of characters) owned.add(characterId);
    codes.add(entry.code);
    players.push({ id, name, code: entry.code, characters });
  }
  return players;
}

/** The file with `player` added, or changed where the id is known: their added time and other fields stay. */
export function withPlayer(stored: StoredPlayers, player: CampaignPlayer, now: number = Date.now()): StoredPlayers {
  if (!isWritable(stored)) return stored;
  const players: Record<string, unknown> = isRecord(stored.players) ? { ...stored.players } : {};
  const known = isRecord(players[player.id]) ? players[player.id] as Record<string, unknown> : {};
  players[player.id] = { ...known, name: player.name, code: player.code, characters: [...player.characters], addedAt: typeof known.addedAt === 'number' ? known.addedAt : now };
  return { ...stored, players };
}

/** The file with the name or code of the player `id` changed, everything else of theirs kept; a player the file does not have changes nothing. */
export function withPlayerFields(stored: StoredPlayers, id: string, fields: Partial<Pick<CampaignPlayer, 'name' | 'code'>>): StoredPlayers {
  if (!isWritable(stored) || !isRecord(stored.players) || !isRecord(stored.players[id])) return stored;
  return { ...stored, players: { ...stored.players, [id]: { ...stored.players[id], ...fields } } };
}

/** The file without the player `id`. */
export function withoutPlayer(stored: StoredPlayers, id: string): StoredPlayers {
  if (!isWritable(stored) || !isRecord(stored.players) || !(id in stored.players)) return stored;
  const { [id]: _removed, ...players } = stored.players;
  return { ...stored, players };
}

/**
 * The file with the character `characterId` played by `playerId` alone, or by nobody for null:
 * every other player loses it. A player the file does not have changes nothing.
 */
export function withCharacterOwner(stored: StoredPlayers, characterId: string, playerId: string | null): StoredPlayers {
  if (!isWritable(stored) || !isRecord(stored.players)) return stored;
  if (playerId !== null && !isRecord(stored.players[playerId])) return stored;
  const players: Record<string, unknown> = { ...stored.players };
  for (const [id, entry] of Object.entries(players)) {
    if (!isRecord(entry)) continue;
    const characters = readCharacters(entry.characters);
    const others = characters.filter((other) => other !== characterId);
    const owns = id === playerId;
    players[id] = { ...entry, characters: !owns ? others : characters.includes(characterId) ? characters : [...others, characterId] };
  }
  return { ...stored, players };
}

/** The file with the campaign's table code `link`. */
export function withLink(stored: StoredPlayers, link: string): StoredPlayers {
  return isWritable(stored) ? { ...stored, link } : stored;
}

/** A join code no player of the campaign has yet. */
export const newPlayerCode = (taken: ReadonlySet<string>, random?: () => number): string => newJoinCode(random, taken);

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** `bytes` as lowercase base32 without padding, the first `length` characters. */
function base32(bytes: Uint8Array, length: number): string {
  let text = '';
  let bits = 0;
  let buffer = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      text += BASE32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) text += BASE32[(buffer << (5 - bits)) & 31];
  return text.slice(0, length);
}

/** A campaign's table code: 128 random bits in base32, 26 characters. */
export const newLinkCode = (random: (length: number) => Uint8Array = randomBytes): string => base32(random(16), 26);

/** A player id: 96 random bits in base32, 20 characters. */
export const newPlayerId = (random: (length: number) => Uint8Array = randomBytes): string => base32(random(12), 20);
