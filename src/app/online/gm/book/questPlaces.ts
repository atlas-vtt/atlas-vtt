import type { BookQuest, MapPlace, NestedMapPlace } from '../../protocol/index.ts';
import type { PlacedQuest } from './worldMapLevels.ts';

const NO_PLACES: ReadonlyMap<string, PlacedQuest> = new Map();

function samePlaces(a: ReadonlyMap<string, PlacedQuest>, b: ReadonlyMap<string, PlacedQuest>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, place] of a) {
    const other = b.get(id);
    if (other?.x !== place.x || other.y !== place.y || other.on !== place.on) return false;
  }
  return true;
}

const samePlace = (a: MapPlace | null | undefined, b: MapPlace | null | undefined): boolean => a?.x === b?.x && a?.y === b?.y;

/**
 * A quest with the place its pin gives it, on the world map (`place`) or on a map it leads into
 * (`nestedPlace`): only an active quest shows where it leads.
 */
function placed(quest: BookQuest, places: ReadonlyMap<string, PlacedQuest>): BookQuest {
  const pin = quest.state === 'active' ? places.get(quest.id) : undefined;
  const place: MapPlace | null = pin !== undefined && pin.on === undefined ? { x: pin.x, y: pin.y } : null;
  const nestedPlace: NestedMapPlace | undefined = pin?.on === undefined ? undefined : { map: pin.on, x: pin.x, y: pin.y };
  if (samePlace(place, quest.place) && samePlace(nestedPlace, quest.nestedPlace) && nestedPlace?.map === quest.nestedPlace?.map) return quest;
  const { nestedPlace: _former, ...rest } = quest;
  return { ...rest, place, ...(nestedPlace !== undefined && { nestedPlace }) };
}

/**
 * The quests as players are sent them, each where the GM's pin places it: a pin on the world map, or
 * on a map it leads into, that links the quest's note. Only an active quest has a place; one told,
 * done or failed has none. The answer is the same array while the quests and their places are, since
 * books compare it by identity.
 */
export class QuestPlaces {
  private quests: readonly BookQuest[] | null = null;
  private places: ReadonlyMap<string, PlacedQuest> = NO_PLACES;
  private answer: readonly BookQuest[] = [];

  of(quests: readonly BookQuest[], places: ReadonlyMap<string, PlacedQuest> = NO_PLACES): readonly BookQuest[] {
    if (quests === this.quests && samePlaces(places, this.places)) return this.answer;
    this.quests = quests;
    this.places = places;
    this.answer = quests.map((quest) => placed(quest, places));
    return this.answer;
  }
}
