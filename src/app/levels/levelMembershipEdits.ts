import type { LevelLink, LevelSet, OnLevels, OnOneLevel } from '../types/sceneLevelTypes';
import type { ViewState } from '../types/viewState';
import { firstLevelId, isLevelOf, type SceneLevels } from './sceneLevels';

export type SceneObjects = ViewState['objects'];

/**
 * Where an object's level goes in an edit of the levels: to the level returned (possibly the same),
 * or nowhere (null: the object goes with its level).
 */
export type LevelRewrite = (levelId: string) => string | null;

/** How objects are rewritten: by `rewrite`; with `explicit`, every object comes out naming its levels, unset ones too. */
export interface MembershipEdit {
  rewrite: LevelRewrite;
  explicit: boolean;
}

/** The level an object of one level stands on, as `onLevel` reads it. */
function levelOfOne(object: OnOneLevel, levels: SceneLevels): string | null {
  return isLevelOf(levels, object.level) ? object.level : firstLevelId(levels);
}

/** The levels an object of several belongs to, as `onLevel` reads them. */
function levelsOfMany(object: OnLevels, levels: SceneLevels): LevelSet {
  const { levels: set } = object;
  if (set === 'all') return 'all';
  const known = Array.isArray(set) ? set.filter((id) => isLevelOf(levels, id)) : [];
  if (known.length > 0) return known;
  const first = firstLevelId(levels);
  return first ? [first] : [];
}

function sameIds(a: readonly string[], b: unknown): boolean {
  return Array.isArray(b) && a.length === b.length && a.every((id, index) => b[index] === id);
}

/**
 * A record with `rewrite` applied to each entry; the same record where none changed. An entry that
 * is no object (a map file is kept as it came) is left as it is, and so is a record a scene lacks.
 */
function rewriteRecord<T>(record: Record<string, T>, rewrite: (entry: T) => T | null): Record<string, T> {
  // Typed as always there, but a file may leave out a kind it holds nothing of
  if (!record) return record;
  let changed = false;
  const next: Record<string, T> = {};
  for (const [id, entry] of Object.entries(record)) {
    const rewritten = typeof entry === 'object' && entry !== null ? rewrite(entry) : entry;
    if (rewritten !== entry) changed = true;
    if (rewritten !== null) next[id] = rewritten;
  }
  return changed ? next : record;
}

function rewriteOne<T extends OnOneLevel>(record: Record<string, T>, levels: SceneLevels, { rewrite, explicit }: MembershipEdit): Record<string, T> {
  return rewriteRecord(record, (object) => {
    const current = levelOfOne(object, levels);
    if (current === null) return object;
    const next = rewrite(current);
    if (next === null) return null;
    if (next === object.level || (next === current && !explicit)) return object;
    return { ...object, level: next };
  });
}

function rewriteMany<T extends OnLevels>(record: Record<string, T>, levels: SceneLevels, { rewrite, explicit }: MembershipEdit): Record<string, T> {
  return rewriteRecord(record, (object) => {
    const current = levelsOfMany(object, levels);
    if (current === 'all') return object;
    const next = [...new Set(current.map(rewrite).filter((id): id is string => id !== null))];
    if (next.length === 0) return null;
    if (sameIds(next, object.levels) || (sameIds(next, current) && !explicit)) return object;
    return { ...object, levels: next };
  });
}

/**
 * Stairs after an edit of the levels: rewritten like walls (`rewriteMany`), and gone where the edit
 * left them joining fewer than two levels (a deleted level was one of only two ends, or its stairs
 * moved onto the other end), since they lead nowhere then.
 */
function rewriteLinks(record: Record<string, LevelLink>, levels: SceneLevels, edit: MembershipEdit): Record<string, LevelLink> {
  const rewritten = rewriteMany(record, levels, edit);
  if (rewritten === record) return record;
  const leadsNowhere = (id: string, link: LevelLink): boolean => link !== record[id] && Array.isArray(link.levels) && link.levels.length < 2;
  const kept = Object.entries(rewritten).filter(([id, link]) => typeof link !== 'object' || link === null || !leadsNowhere(id, link));
  return kept.length === Object.keys(rewritten).length ? rewritten : Object.fromEntries(kept);
}

/**
 * `objects` after an edit of the scene's levels, read with the levels as they were before it
 * (`levels`). Every collection the edit leaves alone keeps its record.
 */
export function objectsAfterLevelEdit(objects: SceneObjects, levels: SceneLevels, edit: MembershipEdit): SceneObjects {
  const result: SceneObjects = {
    ...objects,
    tokens: rewriteOne(objects.tokens, levels, edit),
    fog: rewriteOne(objects.fog, levels, edit),
    pins: rewriteOne(objects.pins, levels, edit),
    texts: rewriteOne(objects.texts, levels, edit),
    drawings: rewriteOne(objects.drawings, levels, edit),
    walls: rewriteMany(objects.walls, levels, edit),
    lights: rewriteMany(objects.lights, levels, edit),
    audios: rewriteMany(objects.audios, levels, edit),
    ...(objects.lightZones && { lightZones: rewriteMany(objects.lightZones, levels, edit) }),
    ...(objects.levelLinks && { levelLinks: rewriteLinks(objects.levelLinks, levels, edit) }),
    ...(objects.levelSurfaces && { levelSurfaces: rewriteOne(objects.levelSurfaces, levels, edit) }),
    ...(objects.mapFeatures && { mapFeatures: rewriteOne(objects.mapFeatures, levels, edit) }),
    ...(objects.liquids && { liquids: rewriteOne(objects.liquids, levels, edit) }),
  };
  const keys = Object.keys(result) as (keyof SceneObjects)[];
  return keys.every((key) => result[key] === objects[key]) ? objects : result;
}
