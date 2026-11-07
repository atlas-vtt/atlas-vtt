/**
 * Copy, paste and duplicate for map objects. Every action is a single store write,
 * so each paste, duplicate or cut is exactly one undo step and one map save.
 */

import type { GridState } from '../types/gridTypes';
import { isPinLabelKind, nextPinLabel } from '../tools/pinLabels';
import { collectMapObjects, countMapObjects, type CopyableCollections, type MapObjectContent } from '../clipboard/mapObjectContent';
import { duplicateStep, placeMapObjects } from '../clipboard/mapObjectPlacement';
import { computeNextInstanceNumber } from './tokenInstanceNumbers';
import { placeTokens, raiseTokens } from './tokenStacking';
import { isOffMap } from '../tokens/offMap';
import type { SceneLevel } from '../types/sceneLevelTypes';
import { placedOnViewedLevel, viewedLevelId } from '../levels/sceneLevels';
import { levelObjects } from '../levels/levelObjects';
import { levelLinkList, MAX_LEVEL_LINKS } from '../levels/levelLinks';
import { placedLevelLink } from '../levels/levelLinkCopies';
import { isRecord } from '../utils/guards';

export interface MapObjectsSlice {
  /**
   * Adds the objects under fresh ids, selects them and returns the new ids. Stairs land on the level
   * shown (`placedLevelLink`), as many as the map has room for; in the stairs tool the last one's
   * popover opens, since the tool selects stairs by it.
   */
  insertMapObjects: (content: MapObjectContent) => string[];
  /** Copies the objects one grid cell down and to the right, selects the copies and returns their ids. */
  duplicateMapObjects: (ids: string[]) => string[];
  /** Removes tokens, drawings, texts, pins and stairs with the given ids; other ids stay selected. */
  removeMapObjects: (ids: string[]) => void;
  /** Puts a token kept beside the map (`offMap`) on it at (x, y), on top of every other token, and selects it. */
  placeOffMapToken: (id: string, x: number, y: number) => void;
}

interface MapObjectsStoreState {
  objects: CopyableCollections;
  grid: GridState | null;
  selectedIds: string[];
  _audioDirty: boolean;
  levels?: SceneLevel[] | undefined;
  viewedLevel?: string | null | undefined;
  activeTool: string;
  levelLinkPopover: string | null;
}

type ImmerSet = (fn: (draft: MapObjectsStoreState) => void) => void;

function createObjectId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Adds copied stairs on the level shown, at most `room` of them; returns their ids. */
function addLinkCopies(draft: MapObjectsStoreState, content: MapObjectContent, room: number): string[] {
  const at = viewedLevelId(draft);
  const ids: string[] = [];
  for (const copy of content.levelLinks) {
    const placed = ids.length < room ? placedLevelLink(copy, at, draft.levels) : null;
    if (!placed) continue;
    // Whatever is in their place that is no record (a store filled by something else than a load) gives way.
    if (!isRecord(draft.objects.levelLinks)) draft.objects.levelLinks = {};
    const id = createObjectId('levellink');
    draft.objects.levelLinks[id] = { id, kind: 'level-link', ...placed };
    ids.push(id);
  }
  if (ids.length > 0 && draft.activeTool === 'stairs') draft.levelLinkPopover = ids[ids.length - 1]!;
  return ids;
}

function addCopies(draft: MapObjectsStoreState, content: MapObjectContent, linkRoom: number): string[] {
  const { objects } = draft;
  // Copies land on the level the view shows, as new objects do.
  const level = placedOnViewedLevel(draft);
  const ids: string[] = [];
  for (const token of content.tokens) {
    const id = createObjectId('tok');
    objects.tokens[id] = { ...token, id, instanceNumber: computeNextInstanceNumber(objects.tokens, token.imagePath), ...level };
    ids.push(id);
  }
  // Copies keep the order their originals lie in, above everything on the map.
  raiseTokens(objects.tokens, ids);
  for (const drawing of content.drawings) {
    const id = createObjectId('drawing');
    objects.drawings[id] = { ...drawing, id, timestamp: Date.now(), ...level };
    ids.push(id);
  }
  for (const text of content.texts) {
    const id = createObjectId('text');
    objects.texts[id] = { ...text, id, ...level };
    ids.push(id);
  }
  for (const pin of content.pins) {
    const id = createObjectId('pin');
    objects.pins[id] = isPinLabelKind(pin.icon) ? { ...pin, id, label: nextPinLabel(objects.pins, pin.icon), ...level } : { ...pin, id, ...level };
    ids.push(id);
  }
  if (ids.length > 0) draft.selectedIds = ids;
  if (content.tokens.length > 0) {
    draft._audioDirty = true;
  }
  return [...ids, ...addLinkCopies(draft, content, linkRoom)];
}

export function createMapObjectsActions(set: ImmerSet, get: () => MapObjectsStoreState): MapObjectsSlice {
  const insert = (content: MapObjectContent): string[] => {
    if (countMapObjects(content) === 0) return [];
    // The map's limit counts the stairs of every level.
    const linkRoom = MAX_LEVEL_LINKS - levelLinkList(get().objects.levelLinks).length;
    let ids: string[] = [];
    set((draft) => {
      ids = addCopies(draft, content, linkRoom);
    });
    return ids;
  };

  return {
    insertMapObjects: insert,

    duplicateMapObjects: (ids) => {
      const state = get();
      const content = collectMapObjects(state.objects, ids, state);
      // Copies step aside from what stands on the level shown, where they land: other floors are out of the way.
      return insert(placeMapObjects(content, duplicateStep(state.grid), state.grid, levelObjects(state)));
    },

    placeOffMapToken: (id, x, y) => set((draft) => {
      const token = draft.objects.tokens[id];
      if (!token || !isOffMap(token)) return;
      delete token.offMap;
      // It is put on the map the view shows: in a scene of several levels, the level shown
      Object.assign(token, placedOnViewedLevel(draft));
      placeTokens(draft, [{ id, x, y }]);
      draft.selectedIds = [id];
    }),

    removeMapObjects: (ids) => set((draft) => {
      const { tokens, drawings, texts, pins, levelLinks } = draft.objects;
      const links = isRecord(levelLinks) ? levelLinks : {};
      const removed = new Set(ids.filter((id) => tokens[id] || drawings[id] || texts[id] || pins[id] || links[id]));
      const removedToken = [...removed].some((id) => tokens[id]);
      for (const id of removed) {
        delete tokens[id];
        delete drawings[id];
        delete texts[id];
        delete pins[id];
        delete links[id];
      }
      if (draft.levelLinkPopover !== null && removed.has(draft.levelLinkPopover)) draft.levelLinkPopover = null;
      draft.selectedIds = draft.selectedIds.filter((id) => !removed.has(id));
      if (removedToken) {
        draft._audioDirty = true;
      }
    }),
  };
}
