/** Kept measurements (`KeptMeasure`) in the view store: scene objects, each change one undo step. */

import { firstLevelId, hasLevels, onLevel, placedOnViewedLevel, viewedLevelId } from '../levels/sceneLevels';
import { aurasOf, dropAurasOf, type AuraHolder } from '../measure/auraUpkeep';
import { MAX_MEASURES, type KeptMeasure, type MeasureChanges, type MeasureInput } from '../measure/measureTypes';
import type { ViewState } from '../types/viewState';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../utils/guards';

/** The aura a token is to have: how far it reaches (game units; 0 for none) and the points it then holds (`auraPoints`). */
export interface TokenAura {
  tokenId: string;
  aura: number;
  points: Point[];
}

export interface MeasuresSlice {
  /**
   * Keeps a measurement in one undo step and returns its id: on the level its data names, else the
   * level shown. Null, and nothing kept, where that level holds `MAX_MEASURES`.
   */
  addMeasure: (data: MeasureInput) => string | null;
  /** Changes a kept measurement; a field given as undefined is removed. */
  updateMeasure: (id: string, changes: MeasureChanges) => void;
  deleteMeasure: (id: string) => void;
  /** Removes every kept measurement of the level shown, in one undo step; other levels keep theirs. */
  clearMeasures: () => void;
  /**
   * Gives tokens their auras in one undo step: each token's first aura takes the reach given, goes
   * where that is 0, and is made (on the token's level, with `look`) where the token has none.
   * False where a level holds `MAX_MEASURES` and an aura could not be made.
   */
  setTokenAuras: (auras: readonly TokenAura[], look?: Pick<MeasureInput, 'color' | 'hidden'>) => boolean;
}

type MeasuresDraft = Pick<ViewState, 'levels' | 'viewedLevel' | 'objects' | 'measurePopover'>;

/** Removes the auras of tokens that are gone, in the write that removes the tokens (a store draft); a popover on one closes. */
export function dropTokenAuras(draft: { objects: AuraHolder; measurePopover: string | null }, tokenIds: Iterable<string>): void {
  const gone = dropAurasOf(draft.objects, tokenIds);
  if (draft.measurePopover !== null && gone.includes(draft.measurePopover)) draft.measurePopover = null;
}

type ImmerSet = (fn: (draft: MeasuresDraft) => void) => void;

function newMeasureId(): string {
  return `measure_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Whether an entry of the record lies on `levelId`: one that is no object (a file is kept as it came) where unset objects are. */
function isOnLevel(entry: unknown, levelId: string, draft: MeasuresDraft): boolean {
  return isRecord(entry) ? onLevel(entry, levelId, draft.levels) : levelId === firstLevelId(draft.levels);
}

/** The ids of the record's entries on the level `draft` shows; all of them in a scene without levels. */
function idsOnViewedLevel(draft: MeasuresDraft): string[] {
  const record = draft.objects.measures;
  if (!isRecord(record)) return [];
  const levelId = hasLevels(draft.levels) ? viewedLevelId(draft) : null;
  return Object.keys(record).filter((id) => levelId === null || isOnLevel(record[id], levelId, draft));
}

/** Keeps `measure` in `draft`; false, and nothing kept, where its level holds `MAX_MEASURES`. */
function keep(draft: MeasuresDraft, measure: KeptMeasure): boolean {
  // Whatever is in their place that is no record (a store filled by something else than a load) gives way.
  if (!isRecord(draft.objects.measures)) draft.objects.measures = {};
  const record = draft.objects.measures;
  const { levels } = draft;
  const level = hasLevels(levels) ? levels.find((candidate) => onLevel(measure, candidate.id, levels))?.id ?? null : null;
  const held = Object.values(record).filter((entry) => level === null || isOnLevel(entry, level, draft)).length;
  if (held >= MAX_MEASURES) return false;
  record[measure.id] = measure;
  return true;
}

export function createMeasuresActions(set: ImmerSet): MeasuresSlice {
  return {
    addMeasure: (data) => {
      let id: string | null = null;
      set((draft) => {
        const measure: KeptMeasure = { id: newMeasureId(), kind: 'measure', ...placedOnViewedLevel(draft), ...data };
        if (keep(draft, measure)) id = measure.id;
      });
      return id;
    },

    updateMeasure: (id, changes) => set((draft) => {
      const measure = draft.objects.measures?.[id];
      if (!measure) return;
      Object.assign(measure, changes);
      for (const field of Object.keys(changes) as (keyof MeasureChanges)[]) {
        if (changes[field] === undefined) delete measure[field];
      }
    }),

    deleteMeasure: (id) => set((draft) => {
      delete draft.objects.measures?.[id];
      if (draft.measurePopover === id) draft.measurePopover = null;
    }),

    clearMeasures: () => set((draft) => {
      const record = draft.objects.measures;
      const gone = idsOnViewedLevel(draft);
      if (!record || gone.length === 0) return;
      for (const id of gone) delete record[id];
      if (draft.measurePopover !== null && gone.includes(draft.measurePopover)) draft.measurePopover = null;
    }),

    setTokenAuras: (auras, look = {}) => {
      let all = true;
      set((draft) => {
        for (const { tokenId, aura, points } of auras) {
          const token = draft.objects.tokens[tokenId];
          if (!token) continue;
          const first = aurasOf(draft.objects.measures, new Set([tokenId]))[0];
          const known = first === undefined ? undefined : draft.objects.measures?.[first];
          if (!(aura > 0)) {
            if (first !== undefined) delete draft.objects.measures?.[first];
            if (first !== undefined && draft.measurePopover === first) draft.measurePopover = null;
          } else if (known) {
            Object.assign(known, { aura, points });
          } else {
            const measure: KeptMeasure = { id: newMeasureId(), kind: 'measure', shape: 'circle', points, follows: tokenId, aura, ...(token.level !== undefined && { level: token.level }), ...look };
            if (!keep(draft, measure)) all = false;
          }
        }
      });
      return all;
    },
  };
}
