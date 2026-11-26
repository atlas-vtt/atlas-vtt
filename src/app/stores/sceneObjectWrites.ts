/**
 * What adding, changing and removing scene objects writes into a draft of a store, with all that
 * follows from it as `OBJECT_KINDS` says. The view store's actions write through here, and so do
 * writes that are not the view's own (what online players draw, measure or ask for).
 */

import { isLocked } from '../annotations/annotationLock';
import type { LevelView } from '../levels/sceneLevels';
import { isPinLabelKind, nextPinLabel } from '../tools/pinLabels';
import type { NotePin } from '../types';
import { isRecord } from '../utils/guards';
import { newId } from '../utils/ids';
import {
  ADDED, OBJECT_COLLECTIONS, OBJECT_KINDS,
  type AddedKind, type ObjectChanges, type ObjectInputs, type ObjectPopover, type PatchedKind, type SceneObjectRecords,
} from './sceneObjectKinds';

/**
 * A draft of a store's scene, as far as object writes reach it. A draft without a selection,
 * popovers or audio flag (an action's narrower one, a store online players write through) has
 * nothing of them to change.
 */
export type ObjectsDraft = LevelView & { [Popover in ObjectPopover]?: string | null } & {
  objects: SceneObjectRecords;
  selectedIds?: string[];
  _audioDirty?: boolean;
};

/** What a removal does with a locked drawing or text: it stays (a delete, a cut) or goes along (a clear). */
export type LockedObjects = 'stay' | 'go';

/** Adds an object of `kind` made from `data` under a new id, on the level the view shows unless its data names one; returns the id. */
export function addObjectIn<K extends AddedKind>(draft: ObjectsDraft, kind: K, data: ObjectInputs[K]): string {
  const { prefix, tag, placed } = ADDED[kind];
  const id = newId(prefix);
  // Whatever is in their place that is no record (a store filled by something else than a load) gives way.
  if (!isRecord(draft.objects[kind])) draft.objects[kind] = {};
  (draft.objects[kind] as Record<string, unknown>)[id] = { id, kind: tag, ...placed(draft), ...data };
  if (OBJECT_KINDS[kind].heard) draft._audioDirty = true;
  return id;
}

/** A pin keeps its label for life; only moving it to another sequence (another icon) labels it anew. */
function relabelPin(pins: Record<string, NotePin>, pin: NotePin, iconBefore: string | undefined): void {
  if (pin.icon === iconBefore || pin.icon === undefined) return;
  delete pin.label;
  if (isPinLabelKind(pin.icon)) pin.label = nextPinLabel(pins, pin.icon);
}

/** Writes `changes` to the object `id` of `kind`, a field given as undefined removed; nothing where there is no such object. */
export function patchObjectIn<K extends PatchedKind>(draft: ObjectsDraft, kind: K, id: string, changes: ObjectChanges[K]): void {
  const record = draft.objects[kind];
  const object: unknown = isRecord(record) ? record[id] : undefined;
  if (!isRecord(object)) return;
  const iconBefore = object.icon;
  for (const [field, value] of Object.entries(changes)) {
    if (value === undefined) Reflect.deleteProperty(object, field);
    else Reflect.set(object, field, value);
  }
  if (kind === 'pins' && draft.objects.pins) relabelPin(draft.objects.pins, object as unknown as NotePin, iconBefore as string | undefined);
  if (OBJECT_KINDS[kind].heard) draft._audioDirty = true;
}

/** The popovers that may stand open on an object. */
const POPOVERS = OBJECT_COLLECTIONS.flatMap((collection) => OBJECT_KINDS[collection].popover ?? []);

/** Removes the objects of `ids` and what goes with them, adding their ids to `removed`; whether spatial audio hears one of them. */
function take(objects: SceneObjectRecords, ids: readonly string[], locked: LockedObjects, removed: Set<string>): boolean {
  let heard = false;
  for (const collection of OBJECT_COLLECTIONS) {
    const record: unknown = objects[collection];
    if (!isRecord(record)) continue;
    const { lockable, takes } = OBJECT_KINDS[collection];
    const gone = new Set<string>();
    for (const id of ids) {
      if (!Object.hasOwn(record, id) || (lockable && locked === 'stay' && isLocked(record[id] as { locked?: unknown } | undefined))) continue;
      delete record[id];
      gone.add(id);
      removed.add(id);
    }
    if (gone.size === 0) continue;
    heard ||= OBJECT_KINDS[collection].heard === true;
    if (takes) heard = take(objects, takes(objects, gone), 'go', removed) || heard;
  }
  return heard;
}

/**
 * Removes the objects of `ids`, of whatever kind, with all that follows: what goes with them (a
 * token's auras), the selection and any popover on them, and spatial audio where it hears one of
 * them.
 */
export function removeObjectsIn(draft: ObjectsDraft, ids: Iterable<string>, locked: LockedObjects): void {
  const removed = new Set<string>();
  const heard = take(draft.objects, [...ids], locked, removed);
  if (removed.size === 0) return;
  for (const popover of POPOVERS) {
    const open = draft[popover];
    if (typeof open === 'string' && removed.has(open)) draft[popover] = null;
  }
  if (draft.selectedIds?.some((id) => removed.has(id))) draft.selectedIds = draft.selectedIds.filter((id) => !removed.has(id));
  if (heard) draft._audioDirty = true;
}
