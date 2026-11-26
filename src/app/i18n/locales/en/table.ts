import type { Message } from '../../types';

/** Table mode: the map view as the players' picture, on a tablet laid on the table. */
export const table = {
  'table.mode': 'Table mode',
  'table.gm': 'GM',
  'table.leave': 'Hold to return to the GM view',
  'table.hold': 'Hold to return',
} as const satisfies Record<string, Message>;
