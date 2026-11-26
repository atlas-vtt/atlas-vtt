import { MAX_PLAYERS } from '../protocol/index.ts';
import type { OpenOutbox, TableOutbox } from '../gm/tableOutbox.ts';
import type { GmScreenRoom } from './gmScreenRecord.ts';

/**
 * Ends the rooms the GM stopped while the relay could not be reached: for each, a connection with its
 * secret that keeps trying until the relay welcomes it, then ends the room. A room is done once ended,
 * or once the relay refuses its secret for good (it ended the room itself: expired, or replaced by a
 * room made at the same code). Until then the record keeps it, so the next load of Atlas ends it.
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
      welcome: () => {
        outbox.end();
        finished();
      },
      joined: ignore,
      left: ignore,
      message: ignore,
      access: ignore,
    }, null);
    this.trying.set(room.secret, { room, outbox });
    outbox.start();
  }
}
