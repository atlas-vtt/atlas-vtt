import { obsidianHttp } from '../../account/obsidianHttp.ts';
import { showNotice } from '../../ui/notice';
import { companionTimers } from '../gm/companionTimers.ts';
import { RELAY_ORIGIN } from '../gm/servers.ts';
import { relayOutbox } from '../gm/tableOutbox.ts';
import { channelCryptoOf } from './channel/index.ts';
import type { GmScreenRecord } from './gmScreenRecord.ts';
import { relayRooms, type RoomAccount } from './gmScreenRoom.ts';
import { GmScreenSession } from './GmScreenSession.ts';
import { setGmScreenSession } from './gmScreenSlot.ts';

/**
 * The GM screen inside Atlas: the session on Atlas's relay, with the account's token and Obsidian's
 * requests and notices, named for the DM screen's control while online play is loaded. A room that ran
 * when Atlas was last unloaded comes back at once.
 */
export class AtlasGmScreen {
  readonly session: GmScreenSession;
  /** The record as last kept, for online play's data file. */
  saved: GmScreenRecord | null;

  /** `save` writes online play's data file, which holds `saved`. */
  constructor(saved: GmScreenRecord | null, account: RoomAccount, save: () => void) {
    this.saved = saved;
    this.session = new GmScreenSession({
      crypto: channelCryptoOf(crypto),
      timers: companionTimers(),
      origin: RELAY_ORIGIN,
      create: relayRooms(obsidianHttp, RELAY_ORIGIN, account, relayOutbox, companionTimers()),
      open: relayOutbox,
      save: (record) => {
        this.saved = record;
        save();
      },
      notice: (text) => showNotice(text),
      now: () => Date.now(),
    }, saved);
    setGmScreenSession(this.session);
    void this.session.resume();
  }

  /** Lets go of the room's connection; the room stays on the relay for the next load. */
  dispose(): void {
    setGmScreenSession(null);
    this.session.close();
  }
}
