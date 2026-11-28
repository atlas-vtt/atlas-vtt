/**
 * The kinds of object a scene holds, and what follows from each when one is added, changed or
 * removed: what it is called, where it is placed, the popover that may be open on it, whether
 * spatial audio hears it, whether a lock keeps it, and what goes with it. The store's object
 * writes (`sceneObjectWrites.ts`) read this table; nothing else decides it.
 */

import type { NotePin } from '../types';
import type { AudioInput } from '../types/audioTypes';
import type { LightChanges, LightInput, LightZoneChanges, LightZoneInput } from '../types/lightingTypes';
import type { LevelLinkChanges, LevelLinkInput, LevelSurfaceChanges, LevelSurfaceInput } from '../types/sceneLevelTypes';
import type { MapFeatureChanges } from '../types/mapFeatureTypes';
import type { MeasureChanges } from '../measure/measureTypes';
import type { ViewState } from '../types/viewState';
import type { WallInput } from '../types/wallTypes';
import { placedOnViewedLevel, placedOnViewedLevels, type LevelView } from '../levels/sceneLevels';
import { aurasOf } from '../measure/auraUpkeep';

/** The collections of a scene that hold objects by id: all but fog, whose operations are paint. */
export type ObjectCollection = Exclude<keyof ViewState['objects'], 'fog'>;

/** The popovers that stand open on one object. */
export type ObjectPopover = 'lightPopover' | 'lightZonePopover' | 'levelLinkPopover' | 'levelSurfacePopover' | 'measurePopover';

/** A scene's objects as the object writes reach them: a store's own, or as far as a narrower store holds them. */
export type SceneObjectRecords = { [Collection in ObjectCollection]?: ViewState['objects'][Collection] | undefined };

interface KindRules {
  /** The popover that may stand open on one of them: it closes when that one goes. */
  readonly popover?: ObjectPopover;
  /** A locked one stays when it is removed by id; only a clear takes it (`annotationLock.ts`). */
  readonly lockable?: true;
  /** What goes with those of `ids` that are gone, in the same write: a token's auras and the measurements grouped with it. */
  readonly takes?: (objects: SceneObjectRecords, ids: ReadonlySet<string>) => string[];
}

export const OBJECT_KINDS: Readonly<Record<ObjectCollection, KindRules>> = {
  tokens: { takes: (objects, ids) => aurasOf(objects.measures, ids, true) },
  pins: {},
  texts: { lockable: true },
  drawings: { lockable: true },
  walls: {},
  lights: { popover: 'lightPopover' },
  audios: {},
  lightZones: { popover: 'lightZonePopover' },
  levelLinks: { popover: 'levelLinkPopover' },
  levelSurfaces: { popover: 'levelSurfacePopover' },
  mapFeatures: {},
  liquids: {},
  measures: { popover: 'measurePopover' },
};

export const OBJECT_COLLECTIONS = Object.keys(OBJECT_KINDS) as readonly ObjectCollection[];

/** What a new object of each kind added with `addObject` is made from. */
export interface ObjectInputs {
  walls: WallInput;
  lights: LightInput;
  lightZones: LightZoneInput;
  audios: AudioInput;
  levelSurfaces: LevelSurfaceInput;
  levelLinks: LevelLinkInput;
}

export type AddedKind = keyof ObjectInputs;

interface AddRules {
  /** The first part of a new one's id. */
  readonly prefix: string;
  /** Its `kind`. */
  readonly tag: string;
  /** Where it lies when its data names no place: walls, lights, zones and sounds on the levels named, the rest on one. */
  readonly placed: (view: LevelView) => object;
}

export const ADDED: Readonly<Record<AddedKind, AddRules>> = {
  walls: { prefix: 'wall', tag: 'wall', placed: placedOnViewedLevels },
  lights: { prefix: 'light', tag: 'light', placed: placedOnViewedLevels },
  lightZones: { prefix: 'zone', tag: 'light-zone', placed: placedOnViewedLevels },
  audios: { prefix: 'audio', tag: 'audio', placed: placedOnViewedLevels },
  levelSurfaces: { prefix: 'surface', tag: 'level-surface', placed: placedOnViewedLevel },
  // Stairs stand on the levels they join, which their data names.
  levelLinks: { prefix: 'levellink', tag: 'level-link', placed: () => ({}) },
};

type ChangesOf<Input> = { [Field in keyof Input]?: Input[Field] | undefined };

/** What a change of an object of each kind may write with `patchObject`; a field given as undefined is removed. */
export interface ObjectChanges {
  walls: ChangesOf<WallInput>;
  lights: LightChanges;
  lightZones: LightZoneChanges;
  audios: ChangesOf<AudioInput>;
  pins: ChangesOf<Omit<NotePin, 'id' | 'kind'>>;
  levelSurfaces: LevelSurfaceChanges;
  levelLinks: LevelLinkChanges;
  mapFeatures: MapFeatureChanges;
  measures: MeasureChanges;
}

export type PatchedKind = keyof ObjectChanges;
