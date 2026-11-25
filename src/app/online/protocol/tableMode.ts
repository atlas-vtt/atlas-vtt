/**
 * How the table plays: each player on their own map (`table`), or around one screen everyone watches
 * (the GM's player window on a TV), each player's page a remote that steps their tokens (`remote`).
 */
export type PlayMode = 'table' | 'remote';

/**
 * The GM's controls over the whole table, sent to all on every change and to each player who joins.
 * `curtain`: the GM hid the map; players are sent no scene while it is down and see a curtain.
 * `paused`: the GM paused play; the GM refuses every move and drag (`move-refused` with reason
 * `paused`). Added later: an older page ignores it and plays on its own map.
 */
export interface TableModeMessage {
  readonly t: 'table-mode';
  readonly mode: PlayMode;
  readonly curtain: boolean;
  readonly paused: boolean;
}

/** The table's mode as a page reads it, or null for anything malformed; a mode a page does not know reads as `table`. */
export function parseTableMode(value: Record<string, unknown>): TableModeMessage | null {
  const { mode, curtain, paused } = value;
  if (typeof curtain !== 'boolean' || typeof paused !== 'boolean') return null;
  return { t: 'table-mode', mode: mode === 'remote' ? 'remote' : 'table', curtain, paused };
}
