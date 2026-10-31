import type { GateSettings } from './joinGate.ts';
import type { LostReason } from './sharedTab.ts';
import type { TableStatus } from './TableConnection.ts';
import type { TableEnd } from './tableEnd.ts';
import { t } from '../../i18n';

/** What a table tells its owner: each change of its status, the shared map file, and its end. */
export interface OnlineTableEvents {
  status(status: TableStatus): void;
  /** Players see this map file now. */
  mapPath(path: string): void;
  /** The table ended: stopped (by the GM, or closed for a reload), or closed by the relay for good, for the reason given. */
  ended(end: 'stopped' | TableEnd): void;
  /** The gates' settings changed: they are kept with the table. */
  gate(settings: GateSettings): void;
  /** What the panels show of the gates changed: who waits, a pause. */
  changed(): void;
  /** The table's log changed: its panel draws anew and the log is kept with the table. */
  log(): void;
}

/** What the GM is told when the shared tab is lost, by why. */
export const LOST_NOTICES: Readonly<Record<LostReason, string | null>> = {
  closed: t('online.event.closed'),
  gone: null,
  unpresented: t('online.event.unpresented'),
};
