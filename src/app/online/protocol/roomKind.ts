/**
 * The kinds of room the relay holds: the players' `table`, and the GM's own `gm-screen`, which only
 * the GM's devices join. A room keeps its kind for life; a client that names none means `table`.
 */
export const ROOM_KINDS = ['table', 'gm-screen'] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

/** A room kind as sent: `table` where none is named, undefined for anything that is no kind. */
export function roomKind(value: unknown): RoomKind | undefined {
  if (value === undefined) return 'table';
  return (ROOM_KINDS as readonly unknown[]).includes(value) ? (value as RoomKind) : undefined;
}
