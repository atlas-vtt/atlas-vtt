import type { Disposer, Json } from './common';
import type { BackgroundState, GridState, InitiativeState, LightSource, LightZone, NotePin, SceneLighting, TokenSettings, WallSegment } from './records';
import type { SceneSnapshot } from './views';
export interface SceneRecord {
    id: string;
    name: string;
    collectionId: string;
    mapPath: string | null;
}
/**
 * The parts of a saved map an extension may read and write; everything else in the file (the GM's note, the dice log,
 * explored memory, pinned note previews, the loot roller) stays Atlas's. A field left out is written as Atlas writes a
 * new map: no pins, walls, lights or light zones, the camera at the origin, Atlas's token settings, the tracker closed.
 */
export interface SavedMapInput {
    /** As in `SceneSnapshot`. Written with `addToCollection`, image paths are relative to its `images` and become vault paths; `readMap` returns vault paths. */
    background: BackgroundState;
    grid: GridState | null;
    objects: SceneSnapshot['objects'];
    widgets: SceneSnapshot['widgets'];
    initiative: InitiativeState;
    lighting?: SceneLighting;
    /**
     * The note pins, with their note links. A pin's `notePath` is a vault path, never rewritten as an image path; Atlas
     * does not check that the note exists (its loader keeps a pin whose note is missing), so write the notes first.
     * Entries are handed out as saved, also ones Atlas cannot read and skips.
     */
    pins?: Readonly<Record<string, NotePin>>;
    /** The walls, lights and light zones of dynamic lighting. Walls and lights are handed out as saved, also ones Atlas cannot read and skips. */
    walls?: Readonly<Record<string, WallSegment>>;
    lights?: Readonly<Record<string, LightSource>>;
    lightZones?: Readonly<Record<string, LightZone>>;
    /** Where the GM's camera was when the map was saved: finite x and y, a scale above 0. */
    camera?: {
        x: number;
        y: number;
        scale: number;
    };
    /** How the map shows its tokens; Atlas's defaults fill what is not given. */
    tokenSettings?: Partial<TokenSettings>;
    /** Whether the initiative tracker was open; only `true` opens it. */
    initiativeTrackerOpen?: boolean;
}
/**
 * A saved map as `readMap` reads it: its `SavedMapInput` and the background's size, ready to hand to `addToCollection`.
 * Atlas always sets the optional fields, normalised as Atlas loads the map, also for a file that lacks them (empty
 * records, the camera at the origin, Atlas's token settings, the tracker closed). They are optional in the type because
 * `addToCollection` takes a map without them.
 */
export type SavedMap = SavedMapInput & {
    mapSize: {
        width: number;
        height: number;
    };
    tokenSettings?: TokenSettings;
};
export interface ScenesApi {
    /** Every scene record in the asset index, as frozen copies; rejects when the index could not load. */
    list(): Promise<SceneRecord[]>;
    /** The scene whose map file is `mapPath`, as a frozen copy; null when none is, also for a `remote:` path. */
    findByMap(mapPath: string): Promise<SceneRecord | null>;
    /** This extension's data on the scene record (`data.extensions[<extension id>]`); a frozen copy, undefined when unset. */
    getData(sceneId: string): Promise<Json | undefined>;
    /** Sets or (null) clears it. Atlas drops it from copies, exports and imports, and leaves it out of fingerprints. */
    setData(sceneId: string, value: Json | null): Promise<void>;
    /** A saved `.atlasmap` file, migrated to the current format, without opening a view; a frozen copy. Null when there is no such file. */
    readMap(mapPath: string): Promise<SavedMap | null>;
    /**
     * Writes the images and the map file into `folder` (inside the collection's folder) and adds the scene record,
     * all under the asset index lock; on failure nothing is left behind. Creates the collection by name when
     * none of that name exists. A path in `images` that is absolute or climbs out of `folder` is refused, and so is a
     * malformed optional field of `map` (a pin without a plain vault `notePath`, a camera that is not finite numbers with
     * a scale above 0, token settings of the wrong types, walls, lights or light zones that are not records), and so is a
     * grid that is not finite numbers with a `size` of at least 4 px, at most 2,000 cells along a side of the background
     * image (when Atlas can read its size), offsets within 100,000 px and a known `type` and `lineType`: the promise rejects before anything is written. A `readMap` result can be handed in as it is.
     */
    addToCollection(input: {
        collection: {
            id: string;
        } | {
            name: string;
        };
        name: string;
        folder: string;
        map: SavedMapInput;
        images: ReadonlyArray<{
            path: string;
            data: ArrayBuffer;
        }>;
    }): Promise<{
        sceneId: string;
        mapPath: string;
    }>;
    /**
     * Replaces the map of a scene this extension added with `addToCollection`, keeping its scene id, name, collection and
     * map path. `map` and `images` are as for `addToCollection`, with images relative to the map file's folder; an image
     * whose name is taken there gets a number. The new images are written, then the map file, under the asset index lock;
     * only then are images removed, and only ones Atlas wrote for this scene (`addToCollection`, earlier `replaceMap`
     * calls) that the new map, another asset, another map and resolved note links no longer use. No other file is ever
     * removed. The GM's note link, dice log, pinned note previews and loot roller are kept; explored memory resets.
     * Rejects, writing nothing, for a scene another extension or the GM made (Atlas notes which extension added a scene,
     * in its index only, for the map it added; a record file that points the scene at another map drops the note), for a
     * scene whose map file is not inside its collection's folder, for a scene open in any map view or its scene tabs (close it first, so no open view saves over
     * the new map; checked again just before the map is written), and for malformed input. A failed write removes the images it wrote and puts the old map back.
     */
    replaceMap?(sceneId: string, input: {
        map: SavedMapInput;
        images: ReadonlyArray<{
            path: string;
            data: ArrayBuffer;
        }>;
    }): Promise<{
        sceneId: string;
        mapPath: string;
    }>;
}
export interface BundlesApi {
    /**
     * Frontmatter keys removed from notes when a collection is exported and when a bundle is installed (e.g. 'my-plugin-id'):
     * at most 100 non-empty names of at most 200 characters, copied when called; anything else throws.
     * Atlas remembers them per extension id, so they stay stripped when the extension is not loaded (switched off, or
     * Atlas starting first). Unloading the extension does not forget them; calling the returned disposer does, and that
     * is the only thing that does. Handing the disposer to Obsidian's `this.register()` therefore forgets the keys on
     * every unload, which is usually not wanted: keep it for an extension that really stops stripping.
     * The keys of an extension that crashed or was uninstalled stay until something calls the disposer, or
     * `forgetNoteProperties`. Calling the disposer again does nothing.
     */
    stripNoteProperties(keys: readonly string[]): Disposer;
    /** Forgets every note property this extension asked Atlas to strip, also those remembered from earlier sessions. Keys it registered in this session keep stripping until it unloads. */
    forgetNoteProperties(): void;
}
