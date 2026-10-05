/**
 * Copy, paste and duplicate for map objects. Every action is a single store write,
 * so each paste, duplicate or cut is exactly one undo step and one map save.
 */

import type { GridState } from '../types/gridTypes';
import { isPinLabelKind, nextPinLabel } from '../tools/pinLabels';
import { collectMapObjects, countMapObjects, type CopyableCollections, type MapObjectContent } from '../clipboard/mapObjectContent';
import { duplicateStep, placeMapObjects } from '../clipboard/mapObjectPlacement';
import { computeNextInstanceNumber } from './tokenInstanceNumbers';
import { raiseTokens } from './tokenStacking';

export interface MapObjectsSlice {
  /** Adds the objects under fresh ids, selects them and returns the new ids. */
  insertMapObjects: (content: MapObjectContent) => string[];
  /** Copies the objects one grid cell down and to the right, selects the copies and returns their ids. */
  duplicateMapObjects: (ids: string[]) => string[];
  /** Removes tokens, drawings, texts and pins with the given ids; other ids stay selected. */
  removeMapObjects: (ids: string[]) => void;
}

interface MapObjectsStoreState {
  objects: CopyableCollections;
  grid: GridState | null;
  selectedIds: string[];
  _audioDirty: boolean;
}

type ImmerSet = (fn: (draft: MapObjectsStoreState) => void) => void;

function createObjectId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function addCopies(draft: MapObjectsStoreState, content: MapObjectContent): string[] {
  const { objects } = draft;
  const ids: string[] = [];
  for (const token of content.tokens) {
    const id = createObjectId('tok');
    objects.tokens[id] = { ...token, id, instanceNumber: computeNextInstanceNumber(objects.tokens, token.imagePath) };
    ids.push(id);
  }
  // Copies keep the order their originals lie in, above everything on the map.
  raiseTokens(objects.tokens, ids);
  for (const drawing of content.drawings) {
    const id = createObjectId('drawing');
    objects.drawings[id] = { ...drawing, id, timestamp: Date.now() };
    ids.push(id);
  }
  for (const text of content.texts) {
    const id = createObjectId('text');
    objects.texts[id] = { ...text, id };
    ids.push(id);
  }
  for (const pin of content.pins) {
    const id = createObjectId('pin');
    objects.pins[id] = isPinLabelKind(pin.icon) ? { ...pin, id, label: nextPinLabel(objects.pins, pin.icon) } : { ...pin, id };
    ids.push(id);
  }
  if (ids.length > 0) draft.selectedIds = ids;
  if (content.tokens.length > 0) {
    draft._audioDirty = true;
  }
  return ids;
}

export function createMapObjectsActions(set: ImmerSet, get: () => MapObjectsStoreState): MapObjectsSlice {
  const insert = (content: MapObjectContent): string[] => {
    if (countMapObjects(content) === 0) return [];
    let ids: string[] = [];
    set((draft) => {
      ids = addCopies(draft, content);
    });
    return ids;
  };

  return {
    insertMapObjects: insert,

    duplicateMapObjects: (ids) => {
      const { objects, grid } = get();
      const content = collectMapObjects(objects, ids);
      return insert(placeMapObjects(content, duplicateStep(grid), grid, objects));
    },

    removeMapObjects: (ids) => set((draft) => {
      const { tokens, drawings, texts, pins } = draft.objects;
      const removed = new Set(ids.filter((id) => tokens[id] || drawings[id] || texts[id] || pins[id]));
      const removedToken = [...removed].some((id) => tokens[id]);
      for (const id of removed) {
        delete tokens[id];
        delete drawings[id];
        delete texts[id];
        delete pins[id];
      }
      draft.selectedIds = draft.selectedIds.filter((id) => !removed.has(id));
      if (removedToken) {
        draft._audioDirty = true;
      }
    }),
  };
}
