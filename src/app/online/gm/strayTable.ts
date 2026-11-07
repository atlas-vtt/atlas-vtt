import { companionTimers, type Timers } from './companionTimers.ts';
import type { CreatedTable } from './createdTable.ts';
import { TableConnection } from './TableConnection.ts';

/** How long ending a stray table is tried before it is left to the relay, which closes tables nobody hosts. */
const STRAY_END_MS = 60_000;

/**
 * Ends a table the relay made that Atlas will not run (one on another link than the campaign's): it
 * says hello with the table's secret and ends it once welcomed, trying for `STRAY_END_MS` at most.
 */
export function endStrayTable(origin: string, created: CreatedTable, timers: Timers = companionTimers()): void {
  const ignore = (): void => undefined;
  const connection: TableConnection = new TableConnection(origin, created.code, created.secret, {
    status: ignore,
    welcome: () => {
      timers.clearTimer(giveUp);
      connection.end();
    },
    joined: ignore,
    left: ignore,
    message: ignore,
    access: ignore,
  }, null, timers);
  const giveUp = timers.setTimer(() => connection.stop(), STRAY_END_MS);
  connection.start();
}
