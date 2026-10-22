import { GM_LEVEL, isRecord, levelIn } from '../protocol/index.ts';
import type { Http } from './account/http.ts';
import { readCreated, type CreatedTable } from './createdTable.ts';

/** Why no table was made: the relay's status (0: not reached) and a sentence for the GM. */
export interface CreateFailure {
  readonly status: number;
  readonly message: string;
  /** The least GM level the relay needs, when it refused this Atlas as too old (426). */
  readonly minLevel?: number;
}

/**
 * Asks the relay for a new table on the campaign's lasting `link`, for the account signed in with
 * `token`; the relay asks the account service whether it may host.
 */
export async function createTable(http: Http, origin: string, token: string, link: string): Promise<CreatedTable | CreateFailure> {
  try {
    const response = await http({ url: `${origin}/api/tables`, method: 'POST', authorization: `Bearer ${token}`, json: { code: link, gmLevel: GM_LEVEL } });
    const created = readCreated(response.status, response.json);
    if (typeof created !== 'string') return created;
    const outdated = response.status === 426 && isRecord(response.json) ? { minLevel: Math.max(GM_LEVEL + 1, levelIn(response.json, 'minLevel')) } : {};
    return { status: response.status, message: created, ...outdated };
  } catch {
    return { status: 0, message: 'The server could not be reached.' };
  }
}
