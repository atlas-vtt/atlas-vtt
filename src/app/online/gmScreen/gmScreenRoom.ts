import type { Http } from '../../account/http.ts';
import { t } from '../../i18n';
import type { Timers } from '../gm/companionTimers.ts';
import type { CreatedTable } from '../gm/createdTable.ts';
import { createTable } from '../gm/createTable.ts';
import { endStrayTable } from '../gm/strayTable.ts';
import type { OpenOutbox } from '../gm/tableOutbox.ts';

/** The GM's account as asking for a room needs it (`HostAccount` is one). */
export interface RoomAccount {
  /** The account's token, or null while signed out. */
  token(): string | null;
  /** The relay refused the token. */
  signedOutByServer(): void;
  /** Asks again what the account may host. */
  refresh(force: boolean): Promise<void>;
}

/** The room the relay made, or the sentence that says why there is none. */
export type RoomAnswer = { readonly room: CreatedTable } | { readonly refused: string };

/** Asks the relay for the GM screen's room at the lasting `code`. */
export type CreateRoom = (code: string) => Promise<RoomAnswer>;

export const SIGN_IN_TEXT = t('gmScreen.signIn', { name: t('gmScreen.name') });

/**
 * Rooms of kind `gm-screen` at Atlas's relay, asked for as tables are, with the account's token. A
 * relay that answers without that kind, or at another code, made a players' table: it is ended at once
 * and never run, since devices would find nothing at the link.
 */
export function relayRooms(http: Http, origin: string, account: RoomAccount, open: OpenOutbox, timers: Timers): CreateRoom {
  return async (code) => {
    const token = account.token();
    if (token === null) return { refused: SIGN_IN_TEXT };
    const created = await createTable(http, origin, token, code, 'gm-screen');
    if (!('message' in created)) {
      if (created.kind === 'gm-screen' && created.code === code) return { room: created };
      endStrayTable(open, created, timers);
      return { refused: t('gmScreen.relayTooOld', { name: t('gmScreen.name') }) };
    }
    if (created.status === 401) {
      account.signedOutByServer();
      return { refused: SIGN_IN_TEXT };
    }
    if (created.status === 403) void account.refresh(true);
    return { refused: created.message };
  };
}
