/**
 * The turn as a scene's file holds it. In memory the turn is the entry that carries `isActive`;
 * the file also keeps `currentIndex`, the place of that entry, which every version of Atlas
 * writes and older versions step the turn from. Nothing but this module knows the field.
 */
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import { isRecord } from '../utils/guards';

/** A scene's initiative as its file holds it. */
export type SavedInitiative = InitiativeState & { currentIndex: number };

function isInitiative(value: unknown): value is InitiativeState & { currentIndex?: unknown } {
  return isRecord(value) && Array.isArray(value.entries);
}

/** Where the turn is in a running fight in turn order or by cards; -1 by sides, outside a fight and where nobody carries it. */
function turnPlace(initiative: InitiativeState): number {
  return initiative.isActive && !initiative.sides ? initiative.entries.findIndex((entry) => entry.isActive) : -1;
}

/**
 * `initiative` as its file holds it: `currentIndex` stands after the entries, where every version
 * wrote it. A delayed combatant only keeps the turn's place, and every version wrote that place
 * in `currentIndex` alone, with nobody carrying the turn.
 */
export function initiativeToFile(initiative: InitiativeState): SavedInitiative {
  const { entries, ...rest } = initiative;
  const place = turnPlace(initiative);
  const written = entries[place]?.delayed ? entries.map((entry, at) => (at === place ? { ...entry, isActive: false } : entry)) : entries;
  return { entries: written, currentIndex: place, ...rest };
}

/**
 * The entry a fight saved with nobody carrying the turn goes on from, so that Next steps as the
 * versions that stepped from `currentIndex` did: they read it as a number the way arithmetic
 * does, and from the last place or past it began a new round. None where they threw.
 */
function waitingAt(entries: readonly InitiativeEntry[], currentIndex: unknown): InitiativeEntry | undefined {
  const place = Number(currentIndex);
  if (place >= entries.length - 1) return entries.at(-1);
  return Number.isInteger(place) && place >= 0 ? entries[place] : undefined;
}

/**
 * An initiative read from a file, as it is in memory: without `currentIndex`. A fight in turn
 * order saved with nobody carrying the turn (the combatant with it delayed or left while nobody
 * else could act) kept its place there alone: the entry it goes on from (`waitingAt`) carries it.
 */
export function initiativeFromFile(saved: InitiativeState & { currentIndex?: unknown }): InitiativeState {
  const { currentIndex, ...initiative } = saved;
  const waitsAt = waitingAt(initiative.entries, currentIndex);
  if (!initiative.isActive || initiative.sides || !waitsAt || initiative.entries.some((entry) => entry.isActive)) return initiative;
  return { ...initiative, entries: initiative.entries.map((entry) => (entry === waitsAt ? { ...entry, isActive: true } : entry)) };
}

/** A scene's state with its initiative as the file holds it; a scene without one as it is. */
export function sceneInitiativeToFile<S extends object>(scene: S): S {
  const { initiative } = scene as { initiative?: unknown };
  return isInitiative(initiative) ? { ...scene, initiative: initiativeToFile(initiative) } : scene;
}

/** A scene's state read from its file with its initiative as it is in memory; an unreadable initiative as it is. */
export function sceneInitiativeFromFile<S extends object>(scene: S): S {
  const { initiative } = scene as { initiative?: unknown };
  return isInitiative(initiative) ? { ...scene, initiative: initiativeFromFile(initiative) } : scene;
}
