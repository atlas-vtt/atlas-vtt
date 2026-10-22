import { MAX_PLAYERS, TABLE_CODE_PATTERN } from '../protocol/index.ts';
import { accessText, SERVER_SIGNED_OUT_TEXT, UNREACHABLE_TEXT } from './account/accountView.ts';
import { accessRefusal } from './account/relayAccount.ts';
import { OUTDATED_TEXT } from './gmLevel.ts';

/** A table the relay created: its code (in the join link), the host secret (only ever in the GM's hello) and its seats. */
export interface CreatedTable {
  readonly code: string;
  readonly secret: string;
  /** The players the table seats at once, by the GM's plan. */
  readonly maxPlayers: number;
}

/** The seats a relay answered with; a relay from before plans seats `MAX_PLAYERS`. */
export function seatsOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PLAYERS ? value : MAX_PLAYERS;
}

/** What the GM reads when the relay binds the campaign's link to another account. */
export const LINK_TAKEN_TEXT = 'This campaign\'s link belongs to another account. Make a new link.';

/** The sentence for an answer of the relay that made no table. Who may host is the server's word: this only reads it out. */
function refusalText(status: number, error: unknown): string {
  if (status === 401) return SERVER_SIGNED_OUT_TEXT;
  if (status === 403) return accessText(accessRefusal(error));
  if (status === 409 && error === 'link-taken') return LINK_TAKEN_TEXT;
  if (status === 426) return OUTDATED_TEXT;
  if (status === 429) return 'Too many tries. Try again in a minute.';
  if (status === 503 && error === 'accounts-unreachable') return UNREACHABLE_TEXT;
  if (status === 503 && error === 'not-configured') return 'This server hosts no tables for Atlas accounts.';
  if (status === 503) return 'The server could not create a table. Try again in a moment.';
  return `The server could not create a table (${status}).`;
}

/** The created table from the relay's answer, or a sentence saying why there is none. */
export function readCreated(status: number, body: unknown): CreatedTable | string {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (status !== 201) return refusalText(status, fields.error);
  const { code, secret } = fields;
  if (typeof code !== 'string' || !TABLE_CODE_PATTERN.test(code) || typeof secret !== 'string' || secret.length < 32) return 'The server answered with something that is no table.';
  return { code, secret, maxPlayers: seatsOf(fields.maxPlayers) };
}
