import type { PositionedPacket } from './oggOpusReader';

/** What a decoder needs of a stream before any packet: its head. */
export interface StreamHead {
  head: Uint8Array;
  channels: number;
  preSkip: number;
}

/**
 * A long sound the engine reads packet ranges of, rather than bytes: a copy still being made, or a sound stored
 * in segments. `packets` settles once it has every packet of the range, however long that takes to arrive.
 */
export interface WindowedSound {
  readonly windowed: true;
  readonly stream: StreamHead;
  packets(fromGranule: number, toGranule: number): Promise<PositionedPacket[]>;
}

export function isWindowedSound(source: object): source is WindowedSound {
  return 'windowed' in source && source.windowed === true;
}
