import type { CameraState, GridState } from '../types/gridTypes';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type { App } from 'obsidian';
import type { TokenEntity, TextElement, DrawingStroke, NotePin } from '../types';
import type { WallSegment } from '../types/wallTypes';
import type { LightSource, LightZone } from '../types/lightingTypes';
import type { WidgetSettings } from '../types/widgetTypes';
import type { CellNumberFormat } from '../grid/cellNumbering';
import type AtlasVTTPlugin from '../../../main';
import { migrateWidgetsToCollection, needsWidgetMigration } from '../utils/widgetMigration';
import { lightZonesFromFile } from '../lighting/lightZones';
import { normalizeImagePath } from '../utils/pathUtils';
import { fixMapTokenPaths } from '../utils/fixMapPaths';
import { getDataFilePath } from '../utils/dataFileMigration';
import { sceneFromFile, sceneToFile, tokenFromFile } from '../resources/resourceFileFormat';
import { preserveDamagedSceneFile, SceneFileError } from './sceneFileProblems';
import { SceneFileWriter } from './sceneFileWriter';

import type { FogOperation } from '../types/fogTypes';

// Placeholder types until properly defined elsewhere
export type FogPatch = FogOperation;
export type Pin = NotePin;

// Add constants for schema identification and versioning
export const ATLAS_SCHEMA = 'atlas-vtt' as const;
export const ATLAS_VERSION = 4;

/**
 * Defines the structure of the persisted .atlasmap file.
 */
export interface MapFile {
  schema: typeof ATLAS_SCHEMA;
  version: number; // bump on breaking change
  /** Human-readable map name, written when the map is created (absent in older files) */
  name?: string;
  background: string | null;
  grid: GridState | null;
  objects: {
    tokens: Record<string, TokenEntity>;
    fog: Record<string, FogPatch>;
    pins: Record<string, Pin>;
    texts: Record<string, TextElement>;
    drawings: Record<string, DrawingStroke>;
    walls: Record<string, WallSegment>;
    lights: Record<string, LightSource>;
    /** Absent in files from before light zones, and until a map has one. */
    lightZones?: Record<string, LightZone>;
  };
  camera: CameraState;
}

/** A token as found in older map files, where conditions were still called `statuses`. */
export type LegacyToken = TokenEntity & { statuses?: string[] };

/** Grid settings as found in older map files ('daggerheart' was renamed to 'abstract'). */
export type LegacyGridState = Omit<GridState, 'measurementType'> & {
  measurementType?: NonNullable<GridState['measurementType']> | 'daggerheart';
  /** Before numbering covered square grids. */
  hexNumbers?: CellNumberFormat;
  hexNumberOpacity?: number;
};

/**
 * Map data as read from disk before migration: any field may be missing and
 * some still use an older format.
 */
export interface LegacyMapFile extends Partial<Omit<MapFile, 'objects' | 'grid' | 'camera'>> {
  grid?: LegacyGridState | null;
  camera?: CameraState | null;
  objects?: (Partial<Omit<MapFile['objects'], 'tokens' | 'fog'>> & {
    tokens?: Record<string, LegacyToken>;
    /** Validated separately by `migrateFogData`; several incompatible formats existed. */
    fog?: unknown;
  }) | null;
}

/** The zustand `persist` envelope as stored in the map data file, before migration. */
export interface PersistedMapEnvelope {
  version?: number;
  state?: LegacyMapFile & {
    mapPath?: string | null;
    widgetSettings?: Partial<WidgetSettings>;
    /** Checked by the store's merge; older files carry the two bar switches. */
    tokenSettings?: Record<string, unknown>;
    /** Older files hold copied token vitals in each entry. */
    initiative?: { entries?: Array<Record<string, unknown>> } | null;
    widgetValues?: Record<string, number>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || value === null || isRecord(value);
}

/**
 * Trust boundary for parsed map JSON: checks that the containers the migrations
 * walk into are objects. Field-level upgrades are left to `migrateMapFile`.
 */
export function isLegacyMapFile(value: unknown): value is LegacyMapFile {
  if (!isRecord(value)) return false;
  const { objects, grid, camera } = value;
  if (!isOptionalRecord(objects) || !isOptionalRecord(camera) || !isOptionalRecord(grid)) return false;
  return !isRecord(objects) || isOptionalRecord(objects.tokens);
}

/** Trust boundary for the persisted envelope (`{ state, version }`) read from a map data file. */
export function isPersistedMapEnvelope(value: unknown): value is PersistedMapEnvelope {
  if (!isRecord(value)) return false;
  const { state, version } = value;
  if (version !== undefined && typeof version !== 'number') return false;
  return state === undefined || isLegacyMapFile(state);
}

/** A scene file's content that can be loaded: its saved state, written by this Atlas or an older one. */
export type LoadableMapEnvelope = PersistedMapEnvelope & { state: NonNullable<PersistedMapEnvelope['state']> };

/**
 * Reads the content of a scene file, or throws a `SceneFileError`. A file that exists
 * must never load as an empty map: saving that map would replace everything it holds.
 * A newer Atlas' file is refused too, since this one would drop what it does not know.
 */
export function parseSceneFile(content: string): LoadableMapEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new SceneFileError('invalidJson');
  }
  if (!isPersistedMapEnvelope(raw) || !raw.state) throw new SceneFileError('structure');
  const isNewer = [raw.version, raw.state.version].some((version) => version !== undefined && version > ATLAS_VERSION);
  if (isNewer) throw new SceneFileError('newer');
  return { ...raw, state: raw.state };
}

export type AtlasPersistStorage<S> = PersistStorage<S> & { flush: () => Promise<void> };

/**
 * Creates a Zustand PersistStorage adapter that reads/writes to the
 * current map file path stored in the provided store.
 *
 * Values are exchanged as objects, not strings: serialization only happens
 * inside the debounced save, so frequent store writes (drags, selection)
 * never pay for a full-map JSON.stringify.
 */
export function createAtlasStorage<T extends { mapPath: string | null; mapLoaded?: boolean }, S = unknown>(
  app: App, 
  store: { getState: () => T },
  plugin?: AtlasVTTPlugin
): AtlasPersistStorage<S> {
  const writer = new SceneFileWriter<StorageValue<S>>(
    app,
    (path) => store.getState().mapPath === path,
    // Only here, once per write: the store hands over its state on every change
    (value) => JSON.stringify({ ...value, state: sceneToFile(value.state as object) }),
  );

  return {
    /**
     * Reads and parses the map file based on the current mapPath in the store.
     * Returns null only if the path is unset or has no file yet (a new map). A file
     * that exists but cannot be loaded throws, so the load fails and nothing is saved over it.
     */
    async getItem(name: string): Promise<StorageValue<S> | null> {
      // 'name' is unused here as we derive the path from the store state
      const mapPath = store.getState().mapPath;
      if (!mapPath) {
        console.warn('[AtlasStorage] getItem called with no mapPath set.');
        return null;
      }

      writer.supersedeWrites(mapPath);
      const mapFile = app.vault.getFileByPath(getDataFilePath(mapPath));
      if (!mapFile) {
        return null;
      }

      let content: string;
      try {
        content = await app.vault.read(mapFile);
      } catch (error) {
        console.error(`[AtlasStorage] Error reading map file ${mapPath}:`, error);
        throw new SceneFileError('unreadable');
      }

      let parsed: PersistedMapEnvelope;
      try {
        parsed = parseSceneFile(content);
      } catch (error) {
        console.error(`[AtlasStorage] Map data in ${mapPath} cannot be loaded:`, error);
        if (error instanceof SceneFileError) await preserveDamagedSceneFile(app, mapFile, error);
        throw error;
      }

      if (plugin && needsWidgetMigration(parsed)) {
        try {
          parsed = migrateWidgetsToCollection(parsed);
          // Save the migrated data back to the file
          const serializedData = JSON.stringify(parsed);
          if (serializedData) {
            await app.vault.process(mapFile, () => serializedData);
          }
        } catch (error) {
          console.error(`[AtlasStorage] Error migrating widgets:`, error);
        }
      }

      // v3 → v4 migration: add walls and lights if missing
      const state = parsed.state;
      if (state?.objects && !state.objects.walls) {
        state.objects.walls = {};
      }
      if (state?.objects && !state.objects.lights) {
        state.objects.lights = {};
      }
      // Files keep the token fields older versions of Atlas read; in memory tokens hold resources
      if (state) Object.assign(state, sceneFromFile(state));
      if (state?.version && state.version < ATLAS_VERSION) {
        state.version = ATLAS_VERSION;
      }
      // The state was upgraded in place above. zustand discards any state whose
      // envelope version differs from the store's, which would load the map empty.
      if (parsed.version !== undefined && parsed.version < ATLAS_VERSION) {
        parsed.version = ATLAS_VERSION;
      }

      // The file at `mapPath` holds this map; a path it repeats from before the
      // file was moved or renamed is only outdated. Rejecting the data would
      // load the map without fog, walls and lights and save that over the file.
      if (state && state.mapPath !== mapPath) state.mapPath = mapPath;

      // Validated above; `S` is the caller's view of the same persisted envelope.
      return parsed as StorageValue<S>;
    },

    /**
     * Schedules a debounced write of the persisted state to the current map file.
     */
    async setItem(name: string, value: StorageValue<S>): Promise<void> {
      // 'name' is unused
      const { mapPath, mapLoaded } = store.getState();
      if (!mapPath) {
        console.warn('[AtlasStorage] setItem called with no mapPath set.');
        return;
      }

      // A store that is loading its scene, or failed to, does not hold it: saving
      // that state would replace the scene's file with an empty or foreign map.
      if (mapLoaded === false) {
        return;
      }

      // Skip persistence for streamed maps
      if (mapPath.startsWith('streamed_')) {
        return;
      }

      writer.schedule(mapPath, value);
    },

    /**
     * Required by StateStorage interface, but we don't need to delete maps this way.
     */
    async removeItem(name: string): Promise<void> {
      // 'name' is unused
      // No-op: We don't want Zustand deleting the map file via this mechanism.
    },
    
    /**
     * Flush any pending debounced saves immediately
     */
    flush: () => writer.flush(),
  };
}


/**
 * Migrate tokens to use relative paths instead of app:// URLs
 */
function migrateTokenPaths(tokens: Record<string, LegacyToken>): Record<string, TokenEntity> {
  const migratedTokens: Record<string, TokenEntity> = {};
  
  for (const [id, token] of Object.entries(tokens)) {
    const { statuses, ...migratedToken } = token;

    // Normalize the image path (handles app:// URLs and absolute paths)
    if (migratedToken.imagePath) {
      const normalizedPath = normalizeImagePath(migratedToken.imagePath);
      if (normalizedPath !== migratedToken.imagePath) {
        migratedToken.imagePath = normalizedPath;
      }
    }

    // Migrate legacy 'statuses' field to 'conditions'
    if (statuses && !migratedToken.conditions) {
      migratedToken.conditions = statuses;
    }

    migratedTokens[id] = tokenFromFile(migratedToken);
  }
  
  return migratedTokens;
}

/**
 * Migrate legacy fog data to the new operation-based model.
 * Old format: `{ textureData: string, bounds: ... }` or an array of FogCircle/FogPolygon.
 * New format: `Record<string, FogOperation>`.
 */
function migrateFogData(fogData: unknown): Record<string, FogOperation> {
  if (!fogData || typeof fogData !== 'object') return {};

  // Legacy base64 texture format — cannot be converted, discard
  if ('textureData' in (fogData as Record<string, unknown>)) {
    return {};
  }

  // Legacy array format — cannot be converted, discard
  if (Array.isArray(fogData)) {
    return {};
  }

  // Already in the new keyed record format — validate and pass through
  const record = fogData as Record<string, unknown>;
  const firstValue = Object.values(record)[0];
  if (firstValue && typeof firstValue === 'object' && 'kind' in (firstValue as Record<string, unknown>) && (firstValue as Record<string, unknown>).kind === 'fog') {
    return record as Record<string, FogOperation>;
  }

  // Unknown format — discard
  return {};
}

/** Every map saved before automatic grid colours carries this default; nobody chose it, so it becomes automatic. */
const LEGACY_DEFAULT_GRID_COLOR = '#00FFFF';

function migrateGrid(grid: LegacyGridState): GridState {
  const { measurementType, color, hexNumbers, hexNumberOpacity, ...rest } = grid;
  let migrated: GridState = color === undefined || color.toUpperCase() === LEGACY_DEFAULT_GRID_COLOR ? rest : { ...rest, color };
  if (measurementType !== undefined) {
    migrated = { ...migrated, measurementType: measurementType === 'daggerheart' ? 'abstract' : measurementType };
  }
  if (migrated.cellNumbers === undefined && hexNumbers !== undefined) {
    migrated = { ...migrated, cellNumbers: hexNumbers };
  }
  if (migrated.cellNumberOpacity === undefined && hexNumberOpacity !== undefined) {
    migrated = { ...migrated, cellNumberOpacity: hexNumberOpacity };
  }
  return migrated;
}

/**
 * Migrate persisted state from older versions to current MapFile shape.
 */
export function migrateMapFile(persisted: unknown): MapFile {
  // Provide a base initial MapFile
  const initial: MapFile = {
    schema: ATLAS_SCHEMA,
    version: ATLAS_VERSION,
    background: null,
    grid: null,
    objects: {
      tokens: {},
      fog: {},
      pins: {},
      texts: {},
      drawings: {},
      walls: {},
      lights: {},
    },
    camera: { x: 0, y: 0, scale: 1 }
  };

  if (!isLegacyMapFile(persisted)) return initial;

  // Fix any duplicated path segments first
  fixMapTokenPaths(persisted);
  // Migrate token paths from app:// URLs to relative paths
  const migratedTokens = persisted.objects?.tokens
    ? migrateTokenPaths(persisted.objects.tokens)
    : {};

  const zones = lightZonesFromFile(persisted.objects?.lightZones);

  // Merge persisted over initial, ensuring all fields present
  return {
    ...initial,
    ...persisted,
    schema: ATLAS_SCHEMA,
    version: ATLAS_VERSION,
    // Deeply merge nested objects
    objects: {
      tokens: migratedTokens,
      fog: migrateFogData(persisted.objects?.fog),
      pins: persisted.objects?.pins || {},
      texts: persisted.objects?.texts || {},
      drawings: persisted.objects?.drawings || {},
      // Kept as the file has them: what cannot be read is passed over at reading (`lightingObjects.ts`), and saved back.
      walls: isRecord(persisted.objects?.walls) ? persisted.objects.walls : {},
      lights: isRecord(persisted.objects?.lights) ? persisted.objects.lights : {},
      ...(zones && { lightZones: zones }),
    },
    grid: persisted.grid ? migrateGrid(persisted.grid) : initial.grid,
    camera: persisted.camera || initial.camera
  };
}
