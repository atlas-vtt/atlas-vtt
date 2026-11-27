import type { App } from 'obsidian';
import { obsidianHttp } from '../../account/obsidianHttp.ts';
import type { AccountApi } from '../gm/account/AccountControl.ts';
import { showNotice } from '../../ui/notice';
import { companionTimers } from '../gm/companionTimers.ts';
import { RELAY_ORIGIN } from '../gm/servers.ts';
import { relayOutbox } from '../gm/tableOutbox.ts';
import { channelCryptoOf } from './channel/index.ts';
import type { GmScreenRecord } from './gmScreenRecord.ts';
import { readHeldMark } from './heldMarks.ts';
import { relayRooms, type RoomAccount } from './gmScreenRoom.ts';
import { GmScreenSession } from './GmScreenSession.ts';
import { gmScreenControlShown, setGmScreenHost } from './gmScreenSlot.ts';
import { plugKeysScreen } from './keys/atlasKeys.ts';
import { plugLayoutScreen } from './keys/atlasLayout.ts';
import { noticeKnocks } from './knockNotice.ts';
import { plugLookScreen } from './look/plugLook.ts';
import { plugAtlasStatblocks } from './statblocks/atlasStatblocks.ts';

/** Where the vault's local storage on this device keeps when the relay last held Sidekick's room. */
const HELD_KEY = 'atlas-vtt:gm-screen-held';

/**
 * The GM screen inside Atlas: the session on Atlas's relay, with the account's token and Obsidian's
 * requests and notices, named for the DM screen's control with the account while online play is loaded. A room that ran
 * when Atlas was last unloaded comes back at once.
 */
export class AtlasGmScreen {
  readonly session: GmScreenSession;
  /** The record as last kept, for online play's data file. */
  saved: GmScreenRecord | null;
  /** The plugged screens and the knock notice, stopped once the room is let go of. */
  private readonly stops: Array<() => void>;

  /** `save` writes online play's data file, which holds `saved`; `signIn` is online play's account, which the panel signs in with. */
  constructor(app: App, saved: GmScreenRecord | null, account: RoomAccount, signIn: AccountApi, save: () => void) {
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
      held: {
        read: () => readHeldMark(app.loadLocalStorage(HELD_KEY)),
        write: (mark) => app.saveLocalStorage(HELD_KEY, mark),
      },
      notice: (text) => showNotice(text),
      now: () => Date.now(),
    }, saved);
    this.stops = [
      plugKeysScreen(app, this.session, companionTimers()),
      plugLayoutScreen(app, this.session, companionTimers()),
      plugAtlasStatblocks(app, this.session),
      plugLookScreen(app, this.session, companionTimers()),
      noticeKnocks(this.session, gmScreenControlShown, showNotice),
    ];
    setGmScreenHost({ session: this.session, account: signIn });
    void this.session.resume();
  }

  /** Lets go of the room's connection; the room stays on the relay for the next load. */
  dispose(): void {
    setGmScreenHost(null);
    this.session.close();
    for (const stop of this.stops.splice(0)) stop();
  }
}
