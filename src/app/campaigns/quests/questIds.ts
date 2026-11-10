import type { App } from 'obsidian';
import { newQuestId, writeQuestId } from './questNotes';
import type { Quest } from './questTypes';

/** The note that holds each id, by id: the oldest of those that name it, then the first by path. A copy of a note is the younger. */
function holdersOf(quests: readonly Quest[]): Map<string, Quest> {
  const holders = new Map<string, Quest>();
  for (const quest of quests) {
    if (quest.id === undefined) continue;
    const held = holders.get(quest.id);
    if (held === undefined || (quest.created - held.created || quest.path.localeCompare(held.path)) < 0) holders.set(quest.id, quest);
  }
  return holders;
}

/**
 * The ids quests are shared under. A note keeps the id it holds; a note without one, or a copy of
 * another note holding the same id, is given a new one, written into its frontmatter once and never
 * changed again. An id given here is remembered until the index reads it from the note, so a quest
 * shared twice meanwhile is never given two.
 */
export class QuestIds {
  private readonly given = new Map<string, Promise<string | null>>();

  constructor(private readonly app: App, private readonly makeId: () => string = newQuestId) {}

  /** The id of each of `quests` by path, `all` being every quest of the vault; a note whose id could not be written has none. */
  async idsOf(all: readonly Quest[], quests: readonly Quest[]): Promise<Map<string, string>> {
    const holders = holdersOf(all);
    const found = await Promise.all(quests.map(async (quest): Promise<[string, string | null]> => {
      const own = quest.id !== undefined && holders.get(quest.id)?.path === quest.path;
      if (!own) return [quest.path, await this.give(quest)];
      this.given.delete(quest.path);
      return [quest.path, quest.id ?? null];
    }));
    return new Map(found.flatMap(([path, id]): [string, string][] => (id === null ? [] : [[path, id]])));
  }

  private give(quest: Quest): Promise<string | null> {
    const key = quest.path;
    let given = this.given.get(key);
    if (given === undefined) {
      given = writeQuestId(this.app, quest.path, this.makeId(), quest.id !== undefined).catch((error: unknown) => {
        console.error(`[Atlas] Could not give the quest note ${quest.path} an id:`, error);
        this.given.delete(key);
        return null;
      });
      this.given.set(key, given);
    }
    return given;
  }
}
