import { GM_LEVEL, isRecord, levelIn, type RoomKind } from '../protocol/index.ts';
import type { Http } from '../../account/http.ts';
import { readCreated, type CreatedTable } from './createdTable.ts';
import { t } from '../../i18n';

/** Why no table was made: the relay's status (0: not reached) and a sentence for the GM. */
export interface CreateFailure {
  readonly status: number;
  readonly message: string;
  /** The least GM level the relay needs, when it refused this Atlas as too old (426). */
  readonly minLevel?: number;
  /** Asked for only where none was live, the account's room of that kind is live (409 `room-live`). */
  readonly live?: true;
}

/**
 * Asks the relay for a new table on the campaign's lasting `link`, for the account signed in with
 * `token`; the relay asks the account service whether it may host. `kind` asks for a room of another
 * kind than the players' table at that code. `unlessLive` asks for one only where the account has no
 * live room of that kind, which the relay otherwise ends.
 */
export async function createTable(http: Http, origin: string, token: string, link: string, kind: RoomKind = 'table', unlessLive = false): Promise<CreatedTable | CreateFailure> {
  try {
    const json = { code: link, gmLevel: GM_LEVEL, ...(kind !== 'table' && { kind }), ...(unlessLive && { unlessLive }) };
    const response = await http({ url: `${origin}/api/tables`, method: 'POST', authorization: `Bearer ${token}`, json });
    const created = readCreated(response.status, response.json);
    if (typeof created !== 'string') return created;
    const outdated = response.status === 426 && isRecord(response.json) ? { minLevel: Math.max(GM_LEVEL + 1, levelIn(response.json, 'minLevel')) } : {};
    const live = response.status === 409 && isRecord(response.json) && response.json.error === 'room-live' ? { live: true as const } : {};
    return { status: response.status, message: created, ...outdated, ...live };
  } catch {
    return { status: 0, message: t('online.server.unreachable') };
  }
}
