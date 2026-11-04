import type { GmMessage, RollMode, RollRequestRef, SharedRoll } from '../../protocol/index.ts';
import type { ChatDraft, SpokenAs } from './logChat.ts';
import type { GmLogEntry, RollFace } from './logEntries.ts';

export type { ChatDraft, SpokenAs };

/** Messages and edits a player may send: a burst of `CHAT_BURST`, then one every two seconds. */
export const CHAT_BURST = 5;
export const CHATS_PER_SECOND = 0.5;
/** Reactions and deletions a player may send: a burst of `REACT_BURST`, then `REACTS_PER_SECOND`. */
export const REACT_BURST = 10;
export const REACTS_PER_SECOND = 2;
/** Refusals a player is told: a burst of `REFUSAL_BURST`, then one a second. A player far over their rate is not answered every time. */
export const REFUSAL_BURST = 2;
export const REFUSALS_PER_SECOND = 1;
/** What a joining player is sent of the log, and what is kept with the table: the newest entries that fit. */
export const LOG_SNAPSHOT_BYTES = 150 * 1024;
/** The GM's name in the log; a client shows its own word for it. */
export const GM_NAME = 'GM';

export interface TableLogPorts {
  send(body: GmMessage, to?: string): void;
  /** The wall clock (milliseconds), which entries are stamped with. */
  clock(): number;
  /** A steady clock for the rates. */
  now(): number;
  /** A new entry id: 24 hex characters from the cryptographic source. */
  randomId(): string;
  /** A known player's name, or null. */
  nameOf(player: string): string | null;
  setTimer(run: () => void, ms: number): number;
  clearTimer(timer: number): void;
  /** The entries changed: panels draw anew and the log is kept. */
  changed(): void;
  /** The token `who` may speak as by `key` (a player: a token of theirs by the id players know it by; the GM: any token of the shared scene by its id), or null. */
  speaker?(who: string, key: string): Promise<SpokenAs | null>;
  /** A formula rolled now by the shared map's rules, without a throw; null where it does not roll or no map is shared. */
  rollInline?(formula: string): SharedRoll | null;
}

/** A roll as the log takes it: as players see it, whether they do, and the token the GM's own log names. */
export interface LoggedRoll {
  readonly who: string;
  readonly roll: SharedRoll;
  /** The token by the id players know it by, when they see it. */
  readonly token: string | null;
  /** False for a GM's roll the players are not shown: only the GM's log has it. */
  readonly shared: boolean;
  readonly face?: RollFace;
  /** A private roll: its mode and the people shown it; everyone else learns only that it was made. */
  readonly mode?: Exclude<RollMode, 'public'>;
  readonly to?: readonly string[];
  readonly flavor?: string;
  readonly speaker?: SpokenAs;
  readonly request?: RollRequestRef;
}

export type { RollRequest } from './logChat.ts';

/** A roll as the log keeps it, with what only the GM's log has (`hidden`, `face`, `speakerArt`). */
export function rollEntry(stamp: Pick<GmLogEntry, 'id' | 'at' | 'who' | 'name'>, roll: LoggedRoll): GmLogEntry {
  return {
    ...stamp, kind: 'roll', roll: roll.roll, token: roll.token,
    ...(!roll.shared && { hidden: true as const }),
    ...(roll.face !== undefined && { face: roll.face }),
    ...(roll.mode !== undefined && roll.to !== undefined && { mode: roll.mode, to: roll.to }),
    ...(roll.flavor !== undefined && { flavor: roll.flavor }),
    ...(roll.speaker !== undefined && { speaker: roll.speaker.speaker }),
    ...(roll.speaker !== undefined && roll.speaker.art !== null && { speakerArt: roll.speaker.art }),
    ...(roll.request !== undefined && { request: roll.request }),
  };
}
