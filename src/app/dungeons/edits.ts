import type { DungeonModel } from './model';

/** A secret wing hidden by hand: its floor's index and the id of the wing's first room (`secretWingOf`). */
export interface HiddenWing {
  floor: number;
  wing: number;
}

/**
 * What the GM changed by hand on a generated dungeon: the secret wings hidden. Kept apart from the
 * model, so they lie over the dungeon again when only its look changes, and dropped when the
 * dungeon itself is generated anew.
 */
export interface DungeonEdits {
  hiddenWings?: readonly HiddenWing[];
}

export const NO_EDITS: DungeonEdits = {};

/** `edits` with the secret wing `wing` of floor `floor` hidden too. */
export function withWingHidden(edits: DungeonEdits, floor: number, wing: number): DungeonEdits {
  const hidden = edits.hiddenWings ?? [];
  if (hidden.some((h) => h.floor === floor && h.wing === wing)) return edits;
  return { ...edits, hiddenWings: [...hidden, { floor, wing }] };
}

/** The model with the wings the GM hid, each on its floor. */
export function applyDungeonEdits(model: DungeonModel, edits: DungeonEdits): DungeonModel {
  const hidden = edits.hiddenWings ?? [];
  if (hidden.length === 0) return model;
  const floors = model.floors.map((floor, index) => {
    const rooms = new Set(floor.rooms.map((room) => room.id));
    const hiddenWings = hidden.filter((h) => h.floor === index && rooms.has(h.wing)).map((h) => h.wing);
    return hiddenWings.length > 0 ? { ...floor, hiddenWings } : floor;
  });
  return { ...model, floors };
}
