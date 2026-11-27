import type { Timers } from '../gm/companionTimers.ts';
import type { OpenOutbox } from '../gm/tableOutbox.ts';
import type { ChannelCrypto } from './channel/index.ts';
import type { GmScreenRecord } from './gmScreenRecord.ts';
import type { HeldStore } from './heldMarks.ts';
import type { CreateRoom } from './gmScreenRoom.ts';

/** What the session needs of the world: everything it does goes through these, so it runs without Obsidian. */
export interface GmScreenPorts {
  readonly crypto: ChannelCrypto;
  readonly timers: Timers;
  /** The play origin the link names (`https://…`). */
  readonly origin: string;
  readonly create: CreateRoom;
  readonly open: OpenOutbox;
  /** Keeps the record on this computer only. */
  save(record: GmScreenRecord): void;
  /** When the relay last held the room, a fact about this device alone; without it the mark lasts as long as the session. */
  readonly held?: HeldStore;
  notice(text: string): void;
  now(): number;
}
