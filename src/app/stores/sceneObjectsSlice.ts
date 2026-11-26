/**
 * Scene objects in the view store: one add, change and removal for every kind, each one write and
 * so one undo step. What follows from each is `OBJECT_KINDS`'s to say (`sceneObjectKinds.ts`).
 * Tokens, pins, drawings and texts, features, liquids and measurements are added by actions of
 * their own (limits, labels, stacking order); they change and go through these.
 */

import type { WallInput } from '../types/wallTypes';
import type { AddedKind, ObjectChanges, ObjectInputs, PatchedKind } from './sceneObjectKinds';
import { addObjectIn, patchObjectIn, removeObjectsIn, type ObjectsDraft } from './sceneObjectWrites';

export interface SceneObjectsSlice {
  /**
   * Adds a wall, light, light zone, sound, opening or stairs in one undo step and returns its id:
   * on the level the view shows, unless its data names its levels (stairs' always does).
   */
  addObject: <K extends AddedKind>(kind: K, data: ObjectInputs[K]) => string;
  /** Changes an object in one undo step; a field given as undefined is removed. */
  patchObject: <K extends PatchedKind>(kind: K, id: string, changes: ObjectChanges[K]) => void;
  /**
   * Removes objects of every kind by id in one undo step, with all that follows (`removeObjectsIn`):
   * a locked drawing or text stays, and stays selected.
   */
  removeObjects: (ids: readonly string[]) => void;
  /** Takes walls away and adds others in one write, so whatever follows the walls works them out once; returns the ids of the added ones. */
  editWalls: (remove: readonly string[], add: readonly WallInput[]) => string[];
}

type ImmerSet = (fn: (draft: ObjectsDraft) => void) => void;

export function createSceneObjectsActions(set: ImmerSet): SceneObjectsSlice {
  return {
    addObject: (kind, data) => {
      let id = '';
      set((draft) => {
        id = addObjectIn(draft, kind, data);
      });
      return id;
    },

    patchObject: (kind, id, changes) => set((draft) => patchObjectIn(draft, kind, id, changes)),

    removeObjects: (ids) => set((draft) => removeObjectsIn(draft, ids, 'stay')),

    editWalls: (remove, add) => {
      const ids: string[] = [];
      if (remove.length === 0 && add.length === 0) return ids;
      set((draft) => {
        removeObjectsIn(draft, remove, 'stay');
        for (const data of add) ids.push(addObjectIn(draft, 'walls', data));
      });
      return ids;
    },
  };
}
