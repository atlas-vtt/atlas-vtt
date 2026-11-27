import { sha256 } from '../../utils/hashing';

/** How often, at most, Atlas writes down that the relay still holds its room while the relay keeps talking. */
export const HELD_MS = 5 * 60 * 1000;

/** When the relay last held Sidekick's room, as this computer kept it. */
export interface HeldMark {
  /** The room it held, by `roomPrint` of its host secret. */
  readonly room: string;
  readonly at: number;
}

/** Where this computer keeps the mark: the vault's local storage on this device, which no sync carries. */
export interface HeldStore {
  read(): HeldMark | null;
  write(mark: HeldMark | null): void;
}

const PRINT = /^[0-9a-f]{16}$/;

/** The mark as kept, each field checked: local storage may hold another version's value, or nothing. */
export function readHeldMark(value: unknown): HeldMark | null {
  if (typeof value !== 'object' || value === null) return null;
  const { room, at } = value as Record<string, unknown>;
  return typeof room === 'string' && PRINT.test(room) && typeof at === 'number' && Number.isFinite(at) ? { room, at } : null;
}

/** A print of a room's host secret that names the room and gives nothing of the secret away. */
export async function roomPrint(secret: string): Promise<string> {
  return (await sha256(new TextEncoder().encode(`atlas gm-screen room ${secret}`))).slice(0, 16);
}

/**
 * Writes down when the relay was last heard from while it held the room: at its welcome, at most every
 * `HELD_MS` while its frames come (its answers to the keep-alive among them), and when the connection
 * goes. The time is always that of a frame the relay sent, never a timer's: a computer that slept, or a
 * timer that ran late, can neither make the mark newer than the relay's last word nor leave it behind
 * while the relay keeps answering. The mark names its room, and only a Start, Stop or New link clears it.
 */
export class HeldMarks {
  /** The room the connection is welcomed in, while it is. */
  private room: string | null = null;
  private heardAt = Number.NEGATIVE_INFINITY;
  private writtenAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly store: HeldStore, private readonly now: () => number) {}

  /** The relay welcomed the connection to `room`. */
  welcomed(room: string): void {
    this.room = room;
    this.heardAt = this.now();
    this.write();
  }

  /** A frame of the relay came. */
  heard(): void {
    if (this.room === null) return;
    this.heardAt = this.now();
    if (this.heardAt - this.writtenAt >= HELD_MS) this.write();
  }

  /** The connection is no longer welcomed: when the relay was last heard is written down. */
  away(): void {
    if (this.room !== null && this.heardAt > this.writtenAt) this.write();
    this.room = null;
  }

  /** When the relay last held `room` for this computer; undefined for another room or none. */
  heldAt(room: string): number | undefined {
    const mark = readHeldMark(this.store.read());
    return mark?.room === room ? mark.at : undefined;
  }

  /** Nothing written so far may start a room again. */
  clear(): void {
    this.room = null;
    this.heardAt = Number.NEGATIVE_INFINITY;
    this.writtenAt = Number.NEGATIVE_INFINITY;
    this.store.write(null);
  }

  private write(): void {
    if (this.room === null) return;
    this.writtenAt = this.heardAt;
    this.store.write({ room: this.room, at: this.heardAt });
  }
}
