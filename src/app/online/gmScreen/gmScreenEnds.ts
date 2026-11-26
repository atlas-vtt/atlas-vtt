import { MAX_PLAYERS } from '../protocol/index.ts';
import type { OpenOutbox, TableOutbox } from '../gm/tableOutbox.ts';
import type { GmScreenRoom } from './gmScreenRecord.ts';

/**
 * Ends the rooms the GM stopped: for each, a connection with its secret that asks the relay to end the
 * room on every welcome and stays until the relay closes it for good. A room is done only once the relay
 * shows it gone: the close that follows the end, or a refusal for good (no such room, expired, or replaced
 * by a room made at the same code). An end lost with its connection is asked again by the next one, and
 * until a room is done the record keeps it, so the next load of Atlas ends it.
 */
export class RoomEnds {
  /** The rooms tried now and their connections, by the secret of the room. */
  private readonly trying = new Map<string, { readonly room: GmScreenRoom; readonly outbox: TableOutbox }>();

  /** `done` hears of a room that needs ending no more. */
  constructor(private readonly open: OpenOutbox, private readonly done: (room: GmScreenRoom) => void) {}

  /** Tries to end each room not being tried already. */
  end(rooms: readonly GmScreenRoom[]): void {
    for (const room of rooms) if (!this.trying.has(room.secret)) this.try(room);
  }

  /** Stops trying for the rooms at `code`: the relay ended them as it made a new room there. */
  forget(code: string): void {
    for (const [secret, { room, outbox }] of this.trying) {
      if (room.code !== code) continue;
      this.trying.delete(secret);
      outbox.stop();
    }
  }

  /** Stops trying, leaving the rooms to the next load (Atlas unloads). */
  close(): void {
    for (const { outbox } of this.trying.values()) outbox.stop();
    this.trying.clear();
  }

  private try(room: GmScreenRoom): void {
    const ignore = (): void => undefined;
    const finished = (): void => {
      if (this.trying.get(room.secret)?.outbox !== outbox) return;
      this.trying.delete(room.secret);
      this.done(room);
    };
    const outbox = this.open({ code: room.code, secret: room.secret, maxPlayers: MAX_PLAYERS }, {
      status: (status) => status === 'refused' && finished(),
      welcome: () => outbox.askEnd(),
      joined: ignore,
      left: ignore,
      message: ignore,
      access: ignore,
    }, null);
    this.trying.set(room.secret, { room, outbox });
    outbox.start();
  }
}
