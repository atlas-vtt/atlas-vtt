import type { BookQuest, MapPlace } from '../../protocol/index.ts';

const NO_PLACES: ReadonlyMap<string, MapPlace> = new Map();

function samePlaces(a: ReadonlyMap<string, MapPlace>, b: ReadonlyMap<string, MapPlace>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, place] of a) {
    const other = b.get(id);
    if (other?.x !== place.x || other.y !== place.y) return false;
  }
  return true;
}

/** A quest with the place its pin gives it: only an active quest shows where it leads. */
function placed(quest: BookQuest, places: ReadonlyMap<string, MapPlace>): BookQuest {
  const place = quest.state === 'active' ? (places.get(quest.id) ?? null) : null;
  return place?.x === quest.place?.x && place?.y === quest.place?.y ? quest : { ...quest, place };
}

/**
 * The quests as players are sent them, each where the GM's pin on the world map places it: a pin
 * that links the quest's note. Only an active quest has a place; one told, done or failed has none.
 * The answer is the same array while the quests and their places are, since books compare it by
 * identity.
 */
export class QuestPlaces {
  private quests: readonly BookQuest[] | null = null;
  private places: ReadonlyMap<string, MapPlace> = NO_PLACES;
  private answer: readonly BookQuest[] = [];

  of(quests: readonly BookQuest[], places: ReadonlyMap<string, MapPlace> = NO_PLACES): readonly BookQuest[] {
    if (quests === this.quests && samePlaces(places, this.places)) return this.answer;
    this.quests = quests;
    this.places = places;
    this.answer = quests.map((quest) => placed(quest, places));
    return this.answer;
  }
}
