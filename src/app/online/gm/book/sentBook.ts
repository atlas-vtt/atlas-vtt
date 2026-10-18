import type { BookQuest } from '../../protocol/index.ts';
import type { PlayedCharacter } from './characters.ts';
import type { DrawnStatblock } from './statblockSheet.ts';
import type { WorldMapFile } from './worldMapLevels.ts';

/** What one player was last sent of their book, to compare with what they would be sent now. */
export interface SentBook {
  /** The character the book is of, by collection and key; empty for none. */
  readonly book: string;
  readonly map: string;
  /** The quests as the campaign handed them on: the same array while no quest changed, so compared by identity. */
  readonly quests: readonly BookQuest[];
  readonly sheet: string;
  /** The statblock as sent: '' while none was (not drawn yet), `RESEND` where it is owed again. */
  readonly statblock: string;
}

/** What a player's last statblock is marked as once they are owed it again, whatever it reads. */
export const RESEND = '?';

/** A book without quests: the campaign being played has none, or none is played. */
export const NO_QUESTS: readonly BookQuest[] = [];

/**
 * What a player is sent now of their book, to compare with what they were sent last. Quests are the
 * party's: every player gets them, with a character or without. A statblock not drawn yet (undefined) is ''.
 */
export function sentOf(character: PlayedCharacter | null, worldMap: WorldMapFile | null, quests: readonly BookQuest[], drawn: DrawnStatblock | undefined): SentBook {
  return {
    book: character === null ? '' : `${character.collection}\n${character.key}`,
    map: worldMap === null ? '' : JSON.stringify(worldMap.map),
    quests,
    sheet: JSON.stringify(character?.sheet ?? null),
    statblock: drawn === undefined ? '' : JSON.stringify(drawn.statblock),
  };
}

/** The parts of a book that changed since a player was last sent it. */
export interface ChangedParts {
  readonly map: boolean;
  readonly quests: boolean;
  readonly sheet: boolean;
}

/**
 * What a player is sent of their book now: the whole book when they were sent none, play another
 * character, or their page reads no parts (`readsParts`) and the world map or quests changed; else
 * the parts that changed, or null for none.
 */
export function bookUpdate(last: SentBook | undefined, now: SentBook, readsParts: boolean): 'whole' | ChangedParts | null {
  if (last === undefined || last.book !== now.book) return 'whole';
  const changed = { map: last.map !== now.map, quests: last.quests !== now.quests, sheet: last.sheet !== now.sheet };
  if ((changed.map || changed.quests) && !readsParts) return 'whole';
  return changed.map || changed.quests || changed.sheet ? changed : null;
}
