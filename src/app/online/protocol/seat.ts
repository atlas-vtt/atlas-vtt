import { JOIN_CODE_PATTERN, PLAYER_ID_PATTERN, playerName } from './identity.ts';
import { isRecord } from './shape.ts';

/** The most players a campaign's `players` frame lists: its whole roster, whoever is connected. */
export const MAX_CAMPAIGN_PLAYERS = 64;

/** A player of the GM's campaign: the relay's id for them, their name and their own six-digit code. */
export interface CampaignSeat {
  readonly id: string;
  readonly name: string;
  readonly code: string;
}

/** The roster of a `players` frame: up to `MAX_CAMPAIGN_PLAYERS` seats, none sharing an id or a code; null for anything else. */
export function parseSeats(value: unknown): CampaignSeat[] | null {
  if (!Array.isArray(value) || value.length > MAX_CAMPAIGN_PLAYERS) return null;
  const seats: CampaignSeat[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !PLAYER_ID_PATTERN.test(entry.id) || typeof entry.code !== 'string' || !JOIN_CODE_PATTERN.test(entry.code)) return null;
    const name = playerName(entry.name);
    if (name === null || seats.some((seat) => seat.id === entry.id || seat.code === entry.code)) return null;
    seats.push({ id: entry.id, name, code: entry.code });
  }
  return seats;
}

/** To a campaign's player: their own code, and whether it was made just now (the page tells them to keep it). */
export interface YourCodeMessage {
  readonly t: 'your-code';
  readonly code: string;
  readonly first: boolean;
}

/** A `your-code` message read from a GM's body, or null for anything else. */
export function parseYourCode(body: unknown): YourCodeMessage | null {
  if (!isRecord(body) || body.t !== 'your-code') return null;
  if (typeof body.code !== 'string' || !JOIN_CODE_PATTERN.test(body.code) || typeof body.first !== 'boolean') return null;
  return { t: 'your-code', code: body.code, first: body.first };
}
