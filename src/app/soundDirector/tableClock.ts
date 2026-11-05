import type { SoundRecord } from '../sound/soundTypes';

/** The clock a table's sound runs on: one machine's own offline, a shared one online. */
export interface TableClock {
  now(): number;
  /** How far ahead a change begins, so that everyone hears it at once. */
  readonly leadMs: number;
}

/** One line that says who hears the table; online fills it, offline shows the output device. */
export interface AudienceLine {
  line(): string | null;
  /** Who each player is in it, for the line's tooltip: who hears, and why someone does not. */
  detail(): string | null;
  onChange(listener: () => void): () => void;
}

/** How a sound stands for players at a table online: they can have it, it is on its way, or the store has none. */
export type PlayersCopy = { readonly state: 'ready' } | { readonly state: 'uploading'; readonly share: number } | { readonly state: 'nowhere' };

/** What a table online tells the Sound page, while one runs. */
export interface PlayersSounds {
  copyOf(record: SoundRecord): PlayersCopy;
  /** Offers ahead of being pressed all that the moods name, or the sounds given (a folder of the library). */
  prepare(sounds?: readonly SoundRecord[]): void;
  /** This device's switch: off, players hear nothing from it. */
  readonly sending: boolean;
  setSending(on: boolean): void;
  onChange(listener: () => void): () => void;
}
