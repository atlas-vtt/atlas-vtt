import type { ChatStyle, FoundEntry, ImageEntry, LogReactionEmoji, LogSpeaker, RollEntry, RollMode, RollRequestAnswer } from '../protocol/index.ts';
import type { LogState } from './LogState.ts';

/** A message as the viewer says it; `speaker` is the key of one of the panel's `speakers` (absent: as oneself). */
export interface ChatDraft {
  readonly text: string;
  readonly reply?: string;
  readonly style?: ChatStyle;
  readonly speaker?: string;
  readonly to?: readonly string[];
}

/** A roll as the viewer asks for it: from the composer or a roll button of the log (`request`); `speaker` as in `ChatDraft`. */
export interface RollDraft {
  readonly formula: string;
  readonly mode: RollMode;
  readonly flavor?: string;
  readonly speaker?: string;
  readonly request?: RollRequestAnswer;
}

/** What a viewer does to the log; the host sends it on. The panel changes nothing itself: it follows `LogState`. */
export interface LogActions {
  say(draft: ChatDraft): void;
  roll(draft: RollDraft): void;
  edit(id: string, text: string): void;
  remove(id: string): void;
  react(id: string, emoji: LogReactionEmoji, on: boolean): void;
  /** Empties the log for everyone; only the GM has it. */
  clear?(): void;
}

/** A token's art as the panel shows it, with the ring the map draws. */
export interface Portrait {
  readonly src: string;
  readonly showRing?: boolean;
  readonly ringColor?: string;
}

/** The token a roll names, as this viewer may know it: its name (null where the viewer is told none) and its portrait. */
export interface RollFace {
  readonly name: string | null;
  readonly portrait: Portrait | null;
}

/** Someone the viewer may speak as: themselves (`self`, the first of the list) or one of their tokens. */
export interface SpeakerOption {
  readonly key: string;
  readonly name: string;
  readonly kind: 'self' | 'token';
  readonly portrait: Portrait | null;
}

export interface TableLogPanelProps {
  readonly state: LogState;
  readonly actions: LogActions;
  readonly self: string | null;
  /** May delete any chat message (the GM). */
  readonly moderator: boolean;
  /** Whether what is typed can be sent now (connected, GM there); else the composer is disabled and says why (`offlineText`). */
  readonly canSend: boolean;
  readonly offlineText?: string;
  /** The token a roll names, as this viewer may know it; null when unknown (then only the roller's name shows). */
  readonly rollFace?: (entry: RollEntry) => RollFace | null;
  /** Who the viewer may speak and roll as; the first is the viewer as themselves. */
  readonly speakers: readonly SpeakerOption[];
  /** A speaking token's portrait; null while unknown or loading (the host draws the panel again once it is there). */
  readonly speakerPortrait?: (speaker: LogSpeaker) => Portrait | null;
  /** An image the GM showed, as this viewer can show it; null while it is not there yet (the host draws the panel anew once it is). */
  readonly imageSrc?: (entry: ImageEntry) => string | null;
  /** Opens an image the GM showed large. */
  readonly openImage?: (entry: ImageEntry) => void;
  /** Opens a note a player found, to read it whole; without it the log shows its opening only. */
  readonly openFound?: (entry: FoundEntry) => void;
  /** 'floating': the fixed panel at the left edge with header, pin and close; 'embedded': fills its container (a phone's sheet, which has its own title and close). */
  readonly variant: 'floating' | 'embedded';
  readonly onClose: () => void;
}

/** What a row may do; one object for all rows, the same while the panel's props stay. */
export interface RowApi {
  readonly self: string | null;
  readonly moderator: boolean;
  /** Whether a roll button of the log can be pressed now. */
  readonly canSend: boolean;
  readonly react: (id: string, emoji: LogReactionEmoji, on: boolean) => void;
  readonly reply: (id: string) => void;
  /** Rolls a roll button of the log, as the speaker the viewer chose. */
  readonly roll: (draft: Omit<RollDraft, 'speaker'>) => void;
  /** Opens a message of the viewer's own for editing in its place. */
  readonly edit: (id: string) => void;
  readonly saveEdit: (id: string, text: string) => void;
  readonly cancelEdit: () => void;
  /** Shows or drops the question a row's tools ask before deleting. */
  readonly askDelete: (id: string | null) => void;
  readonly remove: (id: string) => void;
  /** A tap on a row with a finger or pen: shows its tools, or hides them again. */
  readonly tap: (id: string) => void;
  /** Scrolls to an entry and marks it for a moment; nothing where the viewer does not hold it. */
  readonly jumpTo: (id: string) => void;
  /** The root of the thread the panel shows; null while it shows the whole log. */
  readonly thread: string | null;
  /** Shows the thread an entry is in; nothing where the viewer holds no such entry. */
  readonly openThread: (id: string) => void;
}

/** What the panel knows of one row; all false for most rows, so they render once. */
export interface RowFlags {
  readonly editing: boolean;
  readonly asking: boolean;
  readonly tapped: boolean;
  readonly highlighted: boolean;
  /** The answer the message field is set to, in a thread. */
  readonly selected: boolean;
  /** The one row the Tab key reaches; the arrow keys move between rows. */
  readonly tabStop: boolean;
}
