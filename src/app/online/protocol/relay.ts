import { JOIN_CODE_PATTERN, PLAYER_ID_PATTERN, playerName } from './identity.ts';
import { levelIn } from './level.ts';
import { type CampaignSeat, parseSeats } from './seat.ts';
import { isRecord } from './shape.ts';

export * from './identity.ts';

/** The version every frame carries. A hello of another version is closed with `CLOSE.version`. */
export const PROTOCOL_VERSION = 1;

/** A table code: 128 random bits in lowercase base32 without padding (26 characters). */
export const TABLE_CODE_PATTERN = /^[a-z2-7]{26}$/;

/** `to` of a GM's send that reaches every player. */
export const ALL_PLAYERS = '*';

/**
 * The keep-alive every client sends every `KEEPALIVE_MS`, and the relay's answer. The relay answers
 * it with the Durable Object's auto-response, which never wakes a hibernating table.
 */
export const KEEPALIVE_PING = 'ping';
export const KEEPALIVE_PONG = 'pong';
export const KEEPALIVE_MS = 30_000;

/** Largest frame a GM may send: one asset chunk with its envelope. */
export const MAX_GM_FRAME = 320 * 1024;
/** The most game messages one `sends` frame of the GM carries. */
export const MAX_BATCH_SENDS = 64;
/** Largest frame a player or a socket that has not said hello may send. */
export const MAX_PLAYER_FRAME = 4 * 1024;
/** Players connected at once. */
export const MAX_PLAYERS = 12;
/** Players who wait for the GM's answer at once. */
export const MAX_WAITING = 8;

/** Close codes the relay uses; clients do not reconnect after `badSecret`, `version` and `ended`. */
export const CLOSE = {
  badSecret: 4001,
  replaced: 4002,
  full: 4003,
  tooLarge: 4004,
  rateLimited: 4005,
  protocol: 4006,
  version: 4007,
  ended: 4008,
  kicked: 4009,
  /** The table asks for a join code and the hello had none or a wrong one. */
  wrongCode: 4010,
  /** Too many wrong codes: nobody new joins for a while. */
  paused: 4011,
  declined: 4012,
  /** The GM answered a knock neither way in time. */
  noAnswer: 4013,
  tooManyKnocks: 4014,
  /** The table's account may not host (any more): a GM's hello is refused, and the table is over for everyone at it. */
  noAccess: 4015,
  /** The table ended because its account started another table. */
  superseded: 4016,
} as const;

/** The close codes of the join gates: the player's page stops and says why; only a new try by the player connects again. */
export const GATE_CLOSE_CODES: readonly number[] = [CLOSE.wrongCode, CLOSE.paused, CLOSE.declined, CLOSE.noAnswer, CLOSE.tooManyKnocks];

/** Close codes after which a client gives up instead of reconnecting. */
export const FINAL_CLOSE_CODES: readonly number[] = [CLOSE.badSecret, CLOSE.version, CLOSE.ended, CLOSE.replaced, CLOSE.kicked, CLOSE.noAccess, CLOSE.superseded, ...GATE_CLOSE_CODES];

/** A player as the GM knows them: the relay's id and the name they gave, shown as text only. */
export interface PlayerInfo {
  readonly id: string;
  readonly name: string;
}

/**
 * A player's hello: `key` for a player the table knows, `code` (the join code) for one it does not.
 * `waits`: the page keeps the token of a wait for the GM, so the relay hands it one; `wait`: the
 * token it holds, which takes that wait up again. A page from before tokens sends neither.
 * `newcomer`: the page holds no code and is new here.
 */
export interface PlayerHello {
  readonly v: 1;
  readonly t: 'hello';
  readonly role: 'player';
  readonly name: string;
  readonly key?: string;
  readonly code?: string;
  readonly waits?: true;
  readonly wait?: string;
  readonly newcomer?: true;
}

/** A GM's hello; `level`: what its Atlas serves (`GM_LEVEL`), a GM from before levels names none and serves level 1. */
export interface GmHello {
  readonly v: 1;
  readonly t: 'hello';
  readonly role: 'gm';
  readonly secret: string;
  readonly level: number;
}

export type Hello = GmHello | PlayerHello;

/** One game message of a GM's `sends` frame: to one player, or to all (`ALL_PLAYERS`). */
export interface BatchedSend {
  readonly to: string;
  readonly body: unknown;
}

/**
 * What a client sends the relay. A player's `send` has no `to`: it always reaches the GM. `kick`,
 * `gate` (the join code, or null for none, and whether newcomers wait for the GM), `admit` and
 * `decline` (a waiting player, by the id of their knock) are the GM's, and so is `players`, the
 * campaign's whole roster.
 */
export type ClientFrame =
  | Hello
  | { readonly v: 1; readonly t: 'send'; readonly to?: string; readonly body: unknown }
  /** The GM's game messages of one moment in one frame, each passed on as its own `send` would be; only to a relay that offers it (`batch`). */
  | { readonly v: 1; readonly t: 'sends'; readonly sends: readonly BatchedSend[] }
  | { readonly v: 1; readonly t: 'kick'; readonly id: string }
  | { readonly v: 1; readonly t: 'gate'; readonly code: string | null; readonly ask: boolean }
  | { readonly v: 1; readonly t: 'players'; readonly players: readonly CampaignSeat[] }
  | { readonly v: 1; readonly t: 'admit'; readonly id: string }
  | { readonly v: 1; readonly t: 'decline'; readonly id: string }
  | { readonly v: 1; readonly t: 'end' };

/** What the relay sends a client. */
export type RelayFrame =
  /**
   * `waiting`: the newcomers who wait for the GM's answer, left out while there are none. `batch`: the
   * relay takes `sends` frames; an older one says nothing. `minLevel`: the least GM level the relay's
   * player page needs; a GM below it was let in because players sit at the table, and should update.
   */
  | { readonly v: 1; readonly t: 'welcome'; readonly role: 'gm'; readonly players: readonly PlayerInfo[]; readonly waiting?: readonly PlayerInfo[]; readonly batch?: true; readonly minLevel?: number }
  /** A newcomer waits for the GM's answer; `knock-gone` once they do not (left, timed out, answered; `full`: admitted into a table without a seat). */
  | { readonly v: 1; readonly t: 'knock'; readonly id: string; readonly name: string }
  | { readonly v: 1; readonly t: 'knock-gone'; readonly id: string; readonly full?: true }
  /** Too many wrong codes: nobody new joins until `until` (the relay's clock, in milliseconds). */
  | { readonly v: 1; readonly t: 'gate-paused'; readonly until: number }
  /**
   * To a newcomer: the knock is taken, the GM decides. `wait`: the wait's token, once, for a page
   * that keeps it (in memory only): a later hello with it takes the same wait up again.
   */
  | { readonly v: 1; readonly t: 'waiting'; readonly wait?: string }
  /** `gmLevel`: what the table's GM serves (`GM_LEVEL`) while one is there; an older relay names none. */
  | { readonly v: 1; readonly t: 'welcome'; readonly role: 'player'; readonly id: string; readonly key: string; readonly gmOnline: boolean; readonly gmLevel?: number }
  | { readonly v: 1; readonly t: 'player-joined'; readonly id: string; readonly name: string }
  | { readonly v: 1; readonly t: 'player-left'; readonly id: string }
  /** The GM came or went; `level`: what the GM who came serves, named by a relay that knows it. */
  | { readonly v: 1; readonly t: 'gm'; readonly online: boolean; readonly level?: number }
  /**
   * To the GM: the table's account may no longer host, and the table closes at `closesAt` (the relay's
   * clock, in milliseconds) unless the account may host again by then; null once it may.
   */
  | { readonly v: 1; readonly t: 'access'; readonly closesAt: number | null }
  /** A game message; `from` names the player on the GM's side, stamped by the relay. */
  | { readonly v: 1; readonly t: 'game'; readonly from?: string; readonly body: unknown };

/**
 * The path the client scopes its seat cookies to (`apps/play/src/install/seatCookie.ts`). No request
 * ever goes there: the page's service worker answers it on the device, and the relay answers it
 * without reading the request, for a browser without that worker.
 */
export const SEAT_PATH = '/__atlas-online-seat';

/** A host secret or player key: base64url, 16 to 128 characters. */
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
function playerInfo(value: unknown): PlayerInfo | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !PLAYER_ID_PATTERN.test(value.id)) return null;
  const name = playerName(value.name);
  return name === null ? null : { id: value.id, name };
}

/** A client frame read from text, or null for anything malformed. The body of a send is left unread. */
export function parseClientFrame(text: string): ClientFrame | null {
  const value = parseJson(text);
  if (!isRecord(value) || value.v !== PROTOCOL_VERSION) return null;
  if (value.t === 'end') return { v: 1, t: 'end' };
  if (value.t === 'kick' || value.t === 'admit' || value.t === 'decline') return typeof value.id === 'string' && PLAYER_ID_PATTERN.test(value.id) ? { v: 1, t: value.t, id: value.id } : null;
  if (value.t === 'gate') {
    const code = value.code === null ? null : joinCode(value.code);
    return code !== undefined && typeof value.ask === 'boolean' ? { v: 1, t: 'gate', code, ask: value.ask } : null;
  }
  if (value.t === 'players') {
    const players = parseSeats(value.players);
    return players === null ? null : { v: 1, t: 'players', players };
  }
  if (value.t === 'send') {
    if (!('body' in value)) return null;
    if (value.to === undefined) return { v: 1, t: 'send', body: value.body };
    return typeof value.to === 'string' ? { v: 1, t: 'send', to: value.to, body: value.body } : null;
  }
  if (value.t === 'sends') return parseSends(value.sends);
  if (value.t !== 'hello') return null;
  if (value.role === 'gm') return typeof value.secret === 'string' && SECRET_PATTERN.test(value.secret) ? { v: 1, t: 'hello', role: 'gm', secret: value.secret, level: levelIn(value, 'level') } : null;
  if (value.role !== 'player') return null;
  const name = playerName(value.name);
  if (name === null) return null;
  if (value.key !== undefined && !(typeof value.key === 'string' && SECRET_PATTERN.test(value.key))) return null;
  const code = value.code === undefined ? null : joinCode(value.code);
  if (code === undefined) return null;
  if (value.wait !== undefined && !(typeof value.wait === 'string' && SECRET_PATTERN.test(value.wait))) return null;
  if (value.waits !== undefined && value.waits !== true) return null;
  return {
    v: 1, t: 'hello', role: 'player', name,
    ...(value.key === undefined ? {} : { key: value.key }), ...(code === null ? {} : { code }),
    ...(value.waits === true ? { waits: true as const } : {}), ...(value.wait === undefined ? {} : { wait: value.wait }),
    ...(value.newcomer === true ? { newcomer: true as const } : {}),
  };
}

/** A GM's `sends` frame: one to `MAX_BATCH_SENDS` messages, each with whom it goes to; null for anything else. Bodies are left unread. */
function parseSends(value: unknown): ClientFrame | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_SENDS) return null;
  const sends: BatchedSend[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.to !== 'string' || !('body' in entry)) return null;
    sends.push({ to: entry.to, body: entry.body });
  }
  return { v: 1, t: 'sends', sends };
}

/** A join code as sent, or undefined for anything that is none. */
function joinCode(value: unknown): string | undefined {
  return typeof value === 'string' && JOIN_CODE_PATTERN.test(value) ? value : undefined;
}

/** A list of players as a relay sent it; null when one of them is malformed. A relay from before the list had none. */
function playerList(value: unknown): PlayerInfo[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const players = value.map(playerInfo);
  return players.every((player) => player !== null) ? players : null;
}

/** Whether a frame's text names another protocol version: the relay closes it with `CLOSE.version`. */
export function isOtherVersion(text: string): boolean {
  const value = parseJson(text);
  return isRecord(value) && typeof value.v === 'number' && value.v !== PROTOCOL_VERSION;
}

/** A relay frame read from text, or null for anything malformed. */
export function parseRelayFrame(text: string): RelayFrame | null {
  const value = parseJson(text);
  if (!isRecord(value) || value.v !== PROTOCOL_VERSION) return null;
  switch (value.t) {
    case 'welcome':
      if (value.role === 'gm') {
        const players = value.players === undefined ? null : playerList(value.players);
        const waiting = playerList(value.waiting);
        if (players === null || waiting === null) return null;
        return {
          v: 1, t: 'welcome', role: 'gm', players, ...(waiting.length > 0 && { waiting }), ...(value.batch === true && { batch: true as const }),
          ...(value.minLevel !== undefined && { minLevel: levelIn(value, 'minLevel') }),
        };
      }
      if (value.role === 'player' && typeof value.id === 'string' && typeof value.key === 'string' && typeof value.gmOnline === 'boolean') {
        return { v: 1, t: 'welcome', role: 'player', id: value.id, key: value.key, gmOnline: value.gmOnline, ...(value.gmLevel !== undefined && { gmLevel: levelIn(value, 'gmLevel') }) };
      }
      return null;
    case 'player-joined': {
      const player = playerInfo(value);
      return player === null ? null : { v: 1, t: 'player-joined', ...player };
    }
    case 'player-left':
      return typeof value.id === 'string' ? { v: 1, t: 'player-left', id: value.id } : null;
    case 'knock': {
      const player = playerInfo(value);
      return player === null ? null : { v: 1, t: 'knock', ...player };
    }
    case 'knock-gone':
      if (typeof value.id !== 'string' || !PLAYER_ID_PATTERN.test(value.id)) return null;
      return value.full === true ? { v: 1, t: 'knock-gone', id: value.id, full: true } : { v: 1, t: 'knock-gone', id: value.id };
    case 'gate-paused':
      return typeof value.until === 'number' && Number.isFinite(value.until) ? { v: 1, t: 'gate-paused', until: value.until } : null;
    case 'waiting':
      return typeof value.wait === 'string' && SECRET_PATTERN.test(value.wait) ? { v: 1, t: 'waiting', wait: value.wait } : { v: 1, t: 'waiting' };
    case 'gm':
      if (typeof value.online !== 'boolean') return null;
      return value.level === undefined ? { v: 1, t: 'gm', online: value.online } : { v: 1, t: 'gm', online: value.online, level: levelIn(value, 'level') };
    case 'access':
      if (value.closesAt === null) return { v: 1, t: 'access', closesAt: null };
      return typeof value.closesAt === 'number' && Number.isFinite(value.closesAt) ? { v: 1, t: 'access', closesAt: value.closesAt } : null;
    case 'game':
      if (!('body' in value)) return null;
      if (value.from === undefined) return { v: 1, t: 'game', body: value.body };
      return typeof value.from === 'string' ? { v: 1, t: 'game', from: value.from, body: value.body } : null;
    default:
      return null;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
