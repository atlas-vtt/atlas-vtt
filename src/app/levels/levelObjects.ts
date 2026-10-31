import type { SceneLevel } from '../types/sceneLevelTypes';
import type { ViewState } from '../types/viewState';
import { firstLevelId, hasLevels, onLevel, viewedLevelId, type LevelView } from './sceneLevels';

/** Every object of a scene, by kind; a view shows those of one level (`levelObjects`). */
export type SceneObjects = ViewState['objects'];

/** Objects by kind, each kind a record by id: all of `SceneObjects`, or the kinds a reader takes. */
type ObjectsByKind = object;

/** What `levelObjects` reads of a view's state. */
export type LevelObjectsState<O extends ObjectsByKind = SceneObjects> = { objects: O } & LevelView;

type AnyRecord = Record<string, unknown>;

/** Results by the state's objects, then its levels, then the level shown. */
const results = new WeakMap<ObjectsByKind, WeakMap<readonly SceneLevel[], Map<string, ObjectsByKind>>>();
/** The last result for each level shown, so a write on another level leaves a level's records as they were. */
const previous = new Map<string, ObjectsByKind>();
/**
 * What each record of the last result for a level was filtered from, and among which levels: a
 * write changes one kind (a dragged token, its tokens), and the other kinds are taken over without
 * looking at their entries again.
 */
const previousInputs = new Map<string, { levels: readonly SceneLevel[]; records: AnyRecord }>();
const PREVIOUS_LEVELS = 32;

function isOnLevel(entry: unknown, levelId: string, levels: readonly SceneLevel[]): boolean {
  // An entry that is no object (a map file is kept as it came) is read where unset objects are
  if (typeof entry !== 'object' || entry === null) return levelId === firstLevelId(levels);
  return onLevel(entry, levelId, levels);
}

/** Whether `a` holds exactly the entries of `b`, in the same order. */
function sameEntries(a: AnyRecord, b: AnyRecord | undefined): boolean {
  if (!b) return false;
  const keys = Object.keys(a);
  const other = Object.keys(b);
  return keys.length === other.length && keys.every((key, index) => other[index] === key && a[key] === b[key]);
}

/** The entries of `record` on the level; the record itself where all are, the earlier result where it holds the same. */
function filterRecord(record: AnyRecord, levelId: string, levels: readonly SceneLevel[], earlier: AnyRecord | undefined): AnyRecord {
  const kept: AnyRecord = {};
  let all = true;
  for (const [id, entry] of Object.entries(record)) {
    if (isOnLevel(entry, levelId, levels)) kept[id] = entry;
    else all = false;
  }
  if (all) return record;
  return sameEntries(kept, earlier) ? earlier! : kept;
}

const isRecordOfEntries = (value: unknown): value is AnyRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

/** `objects` with each kind filtered to the level; the earlier result, or `objects` itself, where every kind is the same. */
function filterObjects(objects: ObjectsByKind, levelId: string, levels: readonly SceneLevel[]): ObjectsByKind {
  const earlier: AnyRecord | undefined = previous.get(levelId) as AnyRecord | undefined;
  const inputs = previousInputs.get(levelId);
  const sameInputs = earlier && inputs?.levels === levels ? inputs.records : undefined;
  const result: AnyRecord = {};
  for (const [key, record] of Object.entries(objects)) {
    if (record === undefined) continue;
    const before = earlier?.[key];
    if (sameInputs && sameInputs[key] === record && key in earlier!) {
      result[key] = before;
      continue;
    }
    result[key] = isRecordOfEntries(record) ? filterRecord(record, levelId, levels, isRecordOfEntries(before) ? before : undefined) : record;
  }
  previousInputs.set(levelId, { levels, records: { ...objects } });
  const keys = Object.keys(result);
  const unchanged = (other: AnyRecord | undefined): boolean => !!other
    && Object.keys(other).filter((key) => other[key] !== undefined).length === keys.length && keys.every((key) => other[key] === result[key]);
  if (earlier && unchanged(earlier)) return earlier;
  if (unchanged({ ...objects })) return objects;
  return result;
}

/**
 * The objects the view shows: those on its level (`viewedLevelId`, `onLevel`). Everything that
 * draws, hit-tests, sees or selects reads them, and store writes keep the whole `objects`. In a
 * scene without levels it is `objects` itself. Otherwise each record keeps its identity while
 * nothing on the level changed, so a write on another level is no change here, and renderers that
 * compare references redraw only what changed; showing another level hands them new records.
 */
export function levelObjects<O extends ObjectsByKind>(state: LevelObjectsState<O>): O {
  const { objects, levels } = state;
  if (!hasLevels(levels)) return objects;
  const levelId = viewedLevelId(state) ?? '';
  let byLevels = results.get(objects);
  if (!byLevels) results.set(objects, byLevels = new WeakMap<readonly SceneLevel[], Map<string, ObjectsByKind>>());
  let byLevel = byLevels.get(levels);
  if (!byLevel) byLevels.set(levels, byLevel = new Map<string, ObjectsByKind>());
  let result = byLevel.get(levelId);
  if (!result) {
    result = filterObjects(objects, levelId, levels);
    byLevel.set(levelId, result);
    previous.delete(levelId);
    previous.set(levelId, result);
    if (previous.size > PREVIOUS_LEVELS) {
      const oldest = previous.keys().next().value!;
      previous.delete(oldest);
      previousInputs.delete(oldest);
    }
  }
  // The same kinds as `objects`, each filtered: the shape the caller handed in
  return result as O;
}

/**
 * The objects of level `levelId`, as a view of that level reads them (`levelObjects`): for what a
 * view shows of another level, the level below seen through its openings. Never for writes.
 */
export function levelObjectsOn<O extends ObjectsByKind>(state: LevelObjectsState<O>, levelId: string): O {
  return levelObjects({ objects: state.objects, levels: state.levels, viewedLevel: levelId });
}

/**
 * Every level's objects, for what applies to the whole scene and not to what a view shows: a
 * statblock edit reaching every linked token, a transform that hands the scene on to readers of
 * `levelObjects`. Never for drawing, hit-testing, sight or selection.
 */
export function everyLevelObjects<O extends ObjectsByKind>(state: { objects: O }): O {
  return state.objects;
}
