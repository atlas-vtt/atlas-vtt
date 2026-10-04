import type { WorldDated } from '../worldDated';
import { normalizeWorldDate } from '../calendar/worldDate';
import type { DatedKind } from '../dating/effectiveDates';
import { EMPTY_TIME_MASK, type DatedObjects, type TimeMask } from '../dating/timeMask';
import type { MapVariant, SceneWorldTime } from '../sceneWorldTime';

/**
 * World time of the loaded scene. `worldTime` is saved in
 * the map file; the mask and the effective background are derived by
 * `WorldTimeController` and never saved.
 */
export interface WorldTimeSlice {
  worldTime: SceneWorldTime;
  /** Objects the viewing date hides or ghosts. */
  worldTimeMask: TimeMask;
  /** Background of the map variant valid at the viewing date; null = the scene's own background. */
  worldBackground: string | null;
  /** Sets the scene's viewing date (storage form); null clears it. */
  setViewingDate: (date: string | null) => void;
  /** Fixes the slider bounds; null lets an end follow the scene's dates again. */
  setWorldRange: (start: string | null, end: string | null) => void;
  addMapVariant: (variant: MapVariant) => void;
  updateMapVariant: (id: string, changes: Partial<Omit<MapVariant, 'id'>>) => void;
  removeMapVariant: (id: string) => void;
  /**
   * Sets the dates of several objects in one undo step. A null date clears that
   * end; `inherit: false` stops the objects from taking dates from their notes.
   */
  setObjectDates: (refs: ReadonlyArray<{ kind: DatedKind; id: string }>, dates: ObjectDateChanges) => void;
  setWorldTimeMask: (mask: TimeMask) => void;
  setWorldBackground: (background: string | null) => void;
}

export interface ObjectDateChanges {
  from?: string | null;
  to?: string | null;
  inherit?: boolean;
}

interface WorldTimeDraft extends Pick<WorldTimeSlice, 'worldTime' | 'worldTimeMask' | 'worldBackground'> {
  objects: DatedObjects;
}

type ImmerSet = (fn: (draft: WorldTimeDraft) => void) => void;

export function createInitialWorldTimeState(): Pick<WorldTimeSlice, 'worldTime' | 'worldTimeMask' | 'worldBackground'> {
  return { worldTime: {}, worldTimeMask: EMPTY_TIME_MASK, worldBackground: null };
}

function recordOf(objects: DatedObjects, kind: DatedKind): Record<string, WorldDated> {
  if (kind === 'pin') return objects.pins;
  if (kind === 'token') return objects.tokens;
  if (kind === 'text') return objects.texts;
  return objects.drawings;
}

function applyDate(target: { from?: string | undefined; to?: string | undefined }, key: 'from' | 'to', value: string | null | undefined): void {
  if (value === undefined) return;
  const normalized = value === null ? null : normalizeWorldDate(value);
  if (normalized === null) delete target[key];
  else target[key] = normalized;
}

export function createWorldTimeActions(set: ImmerSet): Omit<WorldTimeSlice, 'worldTime' | 'worldTimeMask' | 'worldBackground'> {
  return {
    setViewingDate: (date) => set((draft) => {
      const normalized = date === null ? null : normalizeWorldDate(date);
      if (normalized === null) delete draft.worldTime.viewingDate;
      else draft.worldTime.viewingDate = normalized;
    }),
    setWorldRange: (start, end) => set((draft) => {
      const from = start === null ? null : normalizeWorldDate(start);
      const to = end === null ? null : normalizeWorldDate(end);
      if (from === null) delete draft.worldTime.rangeStart;
      else draft.worldTime.rangeStart = from;
      if (to === null) delete draft.worldTime.rangeEnd;
      else draft.worldTime.rangeEnd = to;
    }),
    addMapVariant: (variant) => set((draft) => {
      draft.worldTime.variants = [...(draft.worldTime.variants ?? []), variant];
    }),
    updateMapVariant: (id, changes) => set((draft) => {
      const variant = draft.worldTime.variants?.find((entry) => entry.id === id);
      if (!variant) return;
      if (changes.background !== undefined) variant.background = changes.background;
      if (changes.name !== undefined) variant.name = changes.name;
      if ('from' in changes) applyDate(variant, 'from', changes.from ?? null);
      if ('to' in changes) applyDate(variant, 'to', changes.to ?? null);
    }),
    removeMapVariant: (id) => set((draft) => {
      const variants = (draft.worldTime.variants ?? []).filter((entry) => entry.id !== id);
      if (variants.length > 0) draft.worldTime.variants = variants;
      else delete draft.worldTime.variants;
    }),
    setObjectDates: (refs, dates) => set((draft) => {
      for (const { kind, id } of refs) {
        const target = recordOf(draft.objects, kind)[id];
        if (!target) continue;
        applyDate(target, 'from', dates.from);
        applyDate(target, 'to', dates.to);
        if (dates.inherit === true) delete target.dateInherit;
        else if (dates.inherit === false) target.dateInherit = false;
      }
    }),
    setWorldTimeMask: (mask) => set((draft) => {
      draft.worldTimeMask = mask;
    }),
    setWorldBackground: (background) => set((draft) => {
      draft.worldBackground = background;
    }),
  };
}
