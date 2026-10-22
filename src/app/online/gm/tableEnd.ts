import { CLOSE } from '../protocol/index.ts';
import { NO_HOSTING_TEXT } from './account/accountView.ts';
import { OUTDATED_TEXT } from './gmLevel.ts';

/**
 * How the relay closed a table's connection for good: another Obsidian took the table over (it lives
 * on there), its account may not host, its account started another table, this Atlas is older than
 * the player page needs (the table waits on the server for an updated Atlas), or the server closed it
 * for any other reason. The relay decides each; the GM's side only says which it was.
 */
export type TableEnd = 'replaced' | 'no-access' | 'superseded' | 'outdated' | 'refused';

/** The ends after which the table is gone from the server, so the saved table is dropped. */
export type LostTable = Exclude<TableEnd, 'replaced' | 'outdated'>;

export function tableEndOf(closeCode: number | null): TableEnd {
  if (closeCode === CLOSE.replaced) return 'replaced';
  if (closeCode === CLOSE.noAccess) return 'no-access';
  if (closeCode === CLOSE.superseded) return 'superseded';
  if (closeCode === CLOSE.version) return 'outdated';
  return 'refused';
}

const END_TEXT: Readonly<Record<TableEnd, string>> = {
  replaced: 'Another Obsidian took over the online table.',
  'no-access': `The online table was closed. ${NO_HOSTING_TEXT}`,
  superseded: 'The online table was closed. This account started another table.',
  outdated: OUTDATED_TEXT,
  refused: 'The server closed the online table.',
};

/** What the GM is told when a table ended that way. */
export const tableEndText = (end: TableEnd): string => END_TEXT[end];

/**
 * When a table closes because its account may no longer host, written out in the GM's own time:
 * "12 October 2026 at 14:30". The relay names the moment; the account page is where access comes from.
 */
export function closingText(closesAt: number, locale?: string, timeZone?: string): string {
  const when = new Date(closesAt).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short', ...(timeZone !== undefined && { timeZone }) });
  return `This table closes on ${when}. Your account’s access to online play ended.`;
}
