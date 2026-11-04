import { MAX_BOOK_QUESTS, MAX_MAP_TITLE, MAX_QUEST_REWARDS, MAX_TOKEN_VALUE } from '../../protocol/index.ts';
import type { HashedRef } from '../assets/assetUses.ts';
import type { HandedImage, HandedQuest } from './questGate.ts';
import { isQuestOver, type Quest } from '../../../campaigns/quests/questTypes';
import { questKind } from '../../../campaigns/quests/questProperties';
import { clippedLine } from './bookTexts.ts';

/** A quest's text as players are sent it: its opening, the whole text by hash where the opening is not all of it, and the images it embeds. */
export interface BookQuestText {
  readonly opening: string;
  readonly text?: HashedRef | undefined;
  readonly images: readonly HandedImage[];
}

/**
 * A quest note as players read it: its title (the note's name), its Markdown text and its
 * properties, each within the book's limits (longer titles are cut, rewards past the limit left
 * out). Null for a quest whose title shows nothing.
 */
export function bookQuestOf(quest: Quest, id: string, text: BookQuestText): HandedQuest | null {
  const title = clippedLine(quest.title, MAX_MAP_TITLE);
  if (title === null) return null;
  const rewards = quest.rewards.flatMap((reward) => clippedLine(reward, MAX_MAP_TITLE) ?? []).slice(0, MAX_QUEST_REWARDS);
  return {
    id,
    kind: questKind(quest),
    state: quest.status,
    title,
    body: text.opening,
    ...(text.text !== undefined && { text: text.text }),
    ...(text.images.length > 0 && { images: text.images }),
    // Where it leads is the GM's pin on the world map (`QuestPlaces`), never the note.
    place: null,
    xp: Math.min(quest.experience ?? 0, MAX_TOKEN_VALUE),
    rewards,
  };
}

/** The quests a book shows, in its order: those still before the party first, then those behind it; no more than a book holds. */
export function bookQuestOrder<T extends Pick<Quest, 'status'>>(quests: readonly T[]): T[] {
  return [...quests.filter((quest) => !isQuestOver(quest)), ...quests.filter(isQuestOver)].slice(0, MAX_BOOK_QUESTS);
}
