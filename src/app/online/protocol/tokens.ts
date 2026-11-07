import { parseAsset, type AssetRef } from './asset.ts';
import { isRecord } from './shape.ts';
import { parseBadge, parseTokenUI, type SharedTokenUI } from './tokenUI.ts';

/** Tokens one message may carry. */
export const MAX_TOKENS = 500;
/** How far from the map's origin a token may stand, in world pixels. */
export const MAX_COORDINATE = 1_000_000;
/** A token id as the players see it: a random alias, never the id in the GM's scene. */
export const TOKEN_ID_PATTERN = /^[0-9a-f]{24}$/;
/** A ring colour: `#rrggbb`. */
export const COLOUR_PATTERN = /^#[0-9a-f]{6}$/;
/** The longest token name sent. */
export const MAX_NAME = 200;
/** The largest token diameter in world pixels. */
export const MAX_TOKEN_SIZE = 100_000;
/** The largest token size in cells. */
export const MAX_TOKEN_CELLS = 1_000;

/**
 * Whether a token is a player token: `taken` for one (whether or not the GM gave it to a player yet),
 * null for the GM's own tokens. Only the GM gives tokens to players, so `open` is never sent; pages
 * from before offered such a token to claim, and still read it.
 */
export type Claim = 'open' | 'taken' | null;

const CLAIMS: readonly unknown[] = ['open', 'taken', null];

/** A token the players see, drawn as the GM's map draws it. */
export interface SharedToken {
  readonly id: string;
  /** Centre in world pixels. */
  readonly x: number;
  readonly y: number;
  /** Diameter of the artwork in world pixels. */
  readonly size: number;
  /** The token's size as Atlas stores it (1 is one cell, 1.5 Large): how its centre snaps to the grid. */
  readonly cells: number;
  /** Degrees from 0 to 360, clockwise; turns the artwork only. */
  readonly rotation: number;
  /** The artwork, asked for by hash like the map; null for a token without artwork players can be sent. */
  readonly art: AssetRef | null;
  readonly name: string | null;
  /** The ring around a framed token: its colour and outer diameter. Null shows the whole artwork unframed. */
  readonly ring: { readonly colour: string; readonly size: number } | null;
  readonly claim: Claim;
  /** The number on its instance badge as players number look-alikes they see, or null without a badge. */
  readonly badge: number | null;
  /** Bars, nameplate and conditions of a creature, as Atlas's player window draws them; null for other tokens. */
  readonly ui: SharedTokenUI | null;
  /**
   * The token holds the turn of the fight (by sides: it acts on the side with the turn): the page
   * flashes the turn's spotlight on it as the turn begins. Sent only while the players' initiative list is shown. Absent from older GMs.
   */
  readonly turn?: true;
  /**
   * The token fights and may not move now: the GM lets players move only on their turn and the turn
   * is another's. The GM refuses its moves (`move-refused` with reason `turn`). Absent from older GMs.
   */
  readonly held?: true;
}

const isFiniteIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isSize = (value: unknown): value is number => isFiniteIn(value, Number.MIN_VALUE, MAX_TOKEN_SIZE);

function parseRing(value: unknown): SharedToken['ring'] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.colour !== 'string' || !COLOUR_PATTERN.test(value.colour) || !isSize(value.size)) return undefined;
  return { colour: value.colour, size: value.size };
}

function parseToken(value: unknown): SharedToken | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !TOKEN_ID_PATTERN.test(value.id)) return null;
  const { x, y, size, cells, rotation, art, name } = value;
  if (!isFiniteIn(x, -MAX_COORDINATE, MAX_COORDINATE) || !isFiniteIn(y, -MAX_COORDINATE, MAX_COORDINATE) || !isSize(size) || !isFiniteIn(rotation, 0, 360)) return null;
  if (!isFiniteIn(cells, Number.MIN_VALUE, MAX_TOKEN_CELLS)) return null;
  const asset = art === null ? null : parseAsset(art);
  if (art !== null && asset === null) return null;
  if (name !== null && (typeof name !== 'string' || name.length > MAX_NAME)) return null;
  const ring = parseRing(value.ring);
  if (ring === undefined || !CLAIMS.includes(value.claim)) return null;
  const badge = parseBadge(value.badge);
  const ui = parseTokenUI(value.ui);
  if (badge === undefined || ui === undefined) return null;
  return { id: value.id, x, y, size, cells, rotation, art: asset, name, ring, claim: value.claim as Claim, badge, ui, ...(value.turn === true ? { turn: true as const } : {}), ...(value.held === true ? { held: true as const } : {}) };
}

/** The tokens of a `tokens` message, or null when the list or any token in it is malformed. */
export function parseTokens(value: unknown): SharedToken[] | null {
  if (!Array.isArray(value) || value.length > MAX_TOKENS) return null;
  const tokens: SharedToken[] = [];
  for (const entry of value) {
    const token = parseToken(entry);
    if (token === null) return null;
    tokens.push(token);
  }
  return tokens;
}
